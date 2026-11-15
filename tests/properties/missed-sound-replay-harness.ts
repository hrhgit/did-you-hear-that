import { isDeepStrictEqual } from "node:util";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { Timer, TimerHandle } from "../../src/config/timer";
import { ghostSoundIds } from "../../src/config/sound-id";
import type { GhostSoundId } from "../../src/config/sound-id";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRequest,
} from "../../src/audio/output/create-audio-output";
import type { FakeBackendCall } from "../../src/audio/output/fake-audio-backend";
import type {
  OutputState,
  StopReason,
} from "../../src/audio/output/output-types";
import type {
  MissedSoundReplayController,
  MissedSoundReplaySettings,
} from "../../src/session/create-missed-sound-replay";
import { createMissedSoundReplay } from "../../src/session/create-missed-sound-replay";
import { replayRenderSeed } from "../../src/session/replay-render-seed";
import type {
  MissedSoundReplay,
  ReplayPauseReason,
  ReplaySoundStartedEvent,
  VisitLog,
} from "../../src/session/visit-flow-types";
import type {
  RefusalScriptEntry,
  ReplayScript,
  ReplayScriptAction,
} from "./missed-sound-replay-arbitraries";
import type { ShellUnderTest } from "./output-shell-harness";
import { calibrate, createShellUnderTest } from "./output-shell-harness";
import { harnessSampleRateHz } from "./visit-flow-harness";

// The replay harness (missed-sound-replay design.md, "Correctness properties", "The replay
// harness"). It builds a Replay_Controller on an output shell from `createShellUnderTest` at
// `harnessSampleRateHz`, calibrated with `calibrate` to the setting of the log's last
// calibration, and gives the controller a copy of the log whose last calibration takes its tops
// from that shell's range report, so that the cap of the plan is the cap of the shell. Around the
// controller it plays the flow's small part as "What the flow does" gives it: the stage, the
// snapshot's pause field, activation on a press, and the move to the result. It records every
// view after every step, every event, every play, every backend call and every `stopAll`.
//
// For refusals it can put a scripted output in place of the shell's `play`: each `play` is
// answered from a refusal script, where `scheduled` passes the request to the calibrated shell
// and `refused` returns the refusal without playing. The shell's state, stop reports and
// activation stay the shell's own, so the flow's part sees the same shell either way.
//
// The audio clock and the timer start together and move together, so the timer's clock is the
// audio clock; the fake backend's timestamp pair puts the page clock `outputDelayMs` ahead of it.
// The controller's timer records the due time of every pending callback, and the harness moves
// the clocks from one due time to the next. The files that use this harness replace the synth's
// render functions with the worst-case renderers through `vi.mock` (audio-output D43).

/** How many microtask turns `settle` waits, enough for an activation to resolve and the flow's part to act on it. */
const settleTurnCount = 10;

/** The stage the flow's part is in: the replay, then the result (or `unsupported`, which the fake backend never reports). */
export type ReplayHarnessStage = "missedSoundReplay" | "result" | "unsupported";

/** The actions of the flow's part the harness gives, as the flow's methods are named. */
export type ReplayHarnessActionName =
  "startReplay" | "proceed" | "stop" | "pause" | "resume";

/** What made a step happen. */
export type ReplayHarnessCause =
  | {
      readonly kind: "action";
      readonly name: ReplayHarnessActionName;
      /** Whether the fake backend refused activation during the action. */
      readonly activationRefusedByBackend: boolean;
    }
  | { readonly kind: "stopReport"; readonly reason: StopReason }
  | { readonly kind: "timer" }
  | { readonly kind: "creation" };

/** The snapshot of the replay stage after one step, as the flow would build it. */
export interface RecordedReplayStep {
  /** The order of this record among every record of the harness. */
  readonly seq: number;
  readonly atMs: number;
  readonly cause: ReplayHarnessCause;
  readonly stage: ReplayHarnessStage;
  /** The snapshot's pause reason, or null. */
  readonly pause: ReplayPauseReason | null;
  readonly canProceed: boolean;
  readonly activationRefused: boolean;
  /** The snapshot's `replay`, or null once the stage is left. */
  readonly view: MissedSoundReplay | null;
  /** Whether this step's snapshot differs from the one before, so that the flow would publish it. */
  readonly published: boolean;
}

export interface RecordedReplayEvent {
  readonly seq: number;
  readonly atMs: number;
  readonly event: ReplaySoundStartedEvent;
}

/** One `play` the controller made, with what it was answered. */
export interface RecordedReplayPlay {
  readonly seq: number;
  readonly atMs: number;
  readonly request: Omit<PlayRequest, "random">;
  /** Whether the request carried the harness's render source. */
  readonly withRenderSource: boolean;
  readonly outcome: PlayOutcome;
  /** Whether the refusal script refused it without asking the shell. */
  readonly refusedByScript: boolean;
  /** The shell's state when the play was asked for. */
  readonly shellStateBefore: OutputState;
  /** The index in `schedules` of the backend call it made, or null. */
  readonly scheduleIndex: number | null;
}

/** One backend `schedule` call made after the stage was entered. */
export interface RecordedReplaySchedule {
  readonly seq: number;
  readonly atMs: number;
  /** The start on the audio clock. */
  readonly startMs: number;
  readonly sampleRateHz: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
}

export interface RecordedReplayAction {
  readonly seq: number;
  readonly atMs: number;
  readonly name: ReplayHarnessActionName;
  readonly activationRefusedByBackend: boolean;
  readonly stageBefore: ReplayHarnessStage;
  readonly pauseBefore: ReplayPauseReason | null;
}

export interface RecordedReplayReport {
  readonly seq: number;
  readonly atMs: number;
  readonly reason: Exclude<StopReason, "control">;
  readonly stageBefore: ReplayHarnessStage;
  readonly pauseBefore: ReplayPauseReason | null;
}

export interface RecordedStopAll {
  readonly seq: number;
  readonly atMs: number;
}

export interface ReplayHarnessOptions {
  /** The visit log of the stage. Its last calibration's tops are replaced by the shell's. */
  readonly log: VisitLog;
  /** How far the page clock of the timestamp pair is ahead of the audio clock. */
  readonly outputDelayMs?: number;
  /** When given, the scripted output answers each `play` from it; plays past its end go to the shell. */
  readonly refusals?: readonly RefusalScriptEntry[] | null;
  /** The controller's settings; the shipped ones by default. */
  readonly settings?: MissedSoundReplaySettings;
}

export interface ReplayHarness {
  /** The log the controller was given: the drawn log with the shell's tops in its last calibration. */
  readonly log: VisitLog;
  readonly controller: MissedSoundReplayController;
  readonly shell: ShellUnderTest;
  /** The timer's clock when the stage was entered. Script times count from here. */
  readonly enteredAtMs: number;
  readonly steps: readonly RecordedReplayStep[];
  readonly events: readonly RecordedReplayEvent[];
  readonly plays: readonly RecordedReplayPlay[];
  readonly schedules: readonly RecordedReplaySchedule[];
  readonly actions: readonly RecordedReplayAction[];
  readonly reports: readonly RecordedReplayReport[];
  readonly stopAlls: readonly RecordedStopAll[];
  /** Every backend call made after the stage was entered, in order. */
  backendCalls(): readonly FakeBackendCall[];
  stage(): ReplayHarnessStage;
  pause(): ReplayPauseReason | null;
  /** The last recorded step. */
  current(): RecordedReplayStep;
  /** How many of the controller's timer callbacks are pending. */
  pendingReplayTimerCount(): number;
  now(): number;

  startReplay(): Promise<void>;
  proceed(): Promise<void>;
  stop(): Promise<void>;
  pauseAction(): Promise<void>;
  resume(): Promise<void>;
  /** Runs an action while the fake backend refuses activation. */
  withActivationRefused(name: "startReplay" | "resume"): Promise<void>;
  /** Makes the fake backend send a stop report. */
  report(reason: Exclude<StopReason, "control">): Promise<void>;
  /** Moves both clocks to `atMs`, running every callback at its own time. */
  advanceTo(atMs: number): Promise<void>;
  advance(durationMs: number): Promise<void>;
  /** Plays a replay script from the moment the stage was entered, then moves on by `tailMs`. */
  run(script: ReplayScript, tailMs: number): Promise<void>;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

/** One timeline entry of a replay script. */
interface TimelineEntry {
  readonly atMs: number;
  readonly action: ReplayScriptAction | "startReplay";
}

/** The timeline of a script: its starts, its events and the resumes after pause reports, by time. */
export function replayScriptTimeline(
  script: ReplayScript,
): readonly TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...script.startTimesMs.map((atMs) => ({
      atMs,
      action: "startReplay" as const,
    })),
  ];
  for (const event of script.events) {
    entries.push({ atMs: event.atMs, action: event.action });
    if (event.resumeAfterMs !== null) {
      entries.push({
        atMs: event.atMs + event.resumeAfterMs,
        action: "resume",
      });
    }
  }
  // A stable sort keeps the order above for equal times.
  return entries.sort((a, b) => a.atMs - b.atMs);
}

/**
 * Builds a replay harness: a calibrated shell, the log with the shell's tops, a controller made
 * from it with the render source of `replayRenderSeed(log)`, and the flow's part around it. The
 * stage is entered when this resolves, and nothing has played.
 */
export async function createReplayHarness(
  options: ReplayHarnessOptions,
): Promise<ReplayHarness> {
  const drawnLog = options.log;
  const lastCalibration = drawnLog.calibrations.at(-1);
  if (lastCalibration === undefined) {
    throw new Error("The replay harness needs a log with a calibration.");
  }
  const shell = createShellUnderTest({
    seed: drawnLog.visitSeed,
    sampleRateHz: harnessSampleRateHz,
    performanceOffsetMs: options.outputDelayMs ?? 0,
  });
  await calibrate(shell, lastCalibration.settingDb);
  const range = shell.output.rangeReport();
  if (range === null) {
    throw new Error("The shell kept no calibration.");
  }
  const shellTops = Object.fromEntries(
    ghostSoundIds.map((soundId) => [soundId, range.rooms[soundId].topLevelDb]),
  ) as Record<GhostSoundId, number>;
  const log: VisitLog = deepFreeze({
    ...drawnLog,
    calibrations: drawnLog.calibrations.map((calibration, index) =>
      index === drawnLog.calibrations.length - 1
        ? { ...calibration, roomTopLevelDb: shellTops }
        : calibration,
    ),
  });
  // The flow calls beginRoom before entering the stage (visit-flow R16.1).
  shell.output.beginRoom();

  const { backend, timer: manual } = shell;
  const backendCallsAtEntry = backend.calls.length;
  const schedulesAtEntry = backend.scheduled().length;
  const enteredAtMs = manual.now();

  let seq = 0;
  const nextSeq = (): number => {
    seq += 1;
    return seq;
  };

  const steps: RecordedReplayStep[] = [];
  const events: RecordedReplayEvent[] = [];
  const plays: RecordedReplayPlay[] = [];
  const schedules: RecordedReplaySchedule[] = [];
  const actions: RecordedReplayAction[] = [];
  const reports: RecordedReplayReport[] = [];
  const stopAlls: RecordedStopAll[] = [];

  // ─── The controller's timer, which knows its due times ──────────────────────────────────

  const dueTimes = new Map<TimerHandle, number>();
  let stepDepth = 0;
  let cause: ReplayHarnessCause = { kind: "creation" };

  // ─── The output the controller and the flow's part use ──────────────────────────────────

  const random = createSeededRandom(replayRenderSeed(log));
  const refusals = options.refusals ?? null;
  const realOutput = shell.output;
  const output: AudioOutput = Object.freeze({
    ...realOutput,
    play(request: PlayRequest): PlayOutcome {
      const atMs = manual.now();
      const shellStateBefore = realOutput.state();
      const entry = refusals?.[plays.length];
      const refusedByScript = entry?.kind === "refused";
      const outcome: PlayOutcome =
        entry?.kind === "refused"
          ? Object.freeze({ kind: "refused", reason: entry.reason })
          : realOutput.play(request);
      let scheduleIndex: number | null = null;
      const scheduled = backend.scheduled();
      if (scheduled.length - schedulesAtEntry > schedules.length) {
        const call = scheduled.at(-1)!;
        scheduleIndex = schedules.length;
        schedules.push(
          Object.freeze({
            seq: nextSeq(),
            atMs,
            startMs: call.startMs,
            sampleRateHz: call.sampleRateHz,
            left: call.left,
            right: call.right,
          }),
        );
      }
      plays.push(
        Object.freeze({
          seq: nextSeq(),
          atMs,
          request: Object.freeze({
            soundId: request.soundId,
            ear: request.ear,
            levelDb: request.levelDb,
            purpose: request.purpose,
          }),
          withRenderSource: request.random === random,
          outcome,
          refusedByScript,
          shellStateBefore,
          scheduleIndex,
        }),
      );
      return outcome;
    },
    stopAll(): void {
      stopAlls.push(Object.freeze({ seq: nextSeq(), atMs: manual.now() }));
      realOutput.stopAll();
    },
  });

  // ─── The flow's part ────────────────────────────────────────────────────────────────────

  let stage: ReplayHarnessStage = "missedSoundReplay";
  let pause: { readonly reason: ReplayPauseReason } | null = null;
  let activationRefused = false;
  let controller: MissedSoundReplayController | null = null;
  const replay = (): MissedSoundReplayController => controller!;
  const inStage = (): boolean => stage === "missedSoundReplay";

  const snapshotNow = () => ({
    stage,
    pause: inStage() ? (pause?.reason ?? null) : null,
    canProceed: inStage() && pause === null,
    activationRefused,
    view: inStage() ? replay().view(pause?.reason ?? null) : null,
  });

  const record = (): void => {
    const snapshot = snapshotNow();
    const before = steps.at(-1);
    const published =
      before === undefined ||
      !isDeepStrictEqual(
        {
          stage: before.stage,
          pause: before.pause,
          canProceed: before.canProceed,
          activationRefused: before.activationRefused,
          view: before.view,
        },
        snapshot,
      );
    steps.push(
      Object.freeze({
        seq: nextSeq(),
        atMs: manual.now(),
        cause,
        ...snapshot,
        published,
      }),
    );
  };

  /** Runs `body` as one step of the flow and records the snapshot after the outermost step. */
  const step = (body: () => void): void => {
    stepDepth += 1;
    try {
      body();
    } finally {
      stepDepth -= 1;
      if (stepDepth === 0) {
        record();
      }
    }
  };

  const leaveToResult = (): void => {
    stage = "result";
    pause = null;
  };

  /** What a stop report does in this stage ("What the flow does", `replayStopped`). */
  const replayStopped = (reason: StopReason): void => {
    if (!inStage()) {
      return;
    }
    switch (reason) {
      case "control":
        return;
      case "pageLeft":
        replay().cancel();
        leaveToResult();
        return;
      case "deviceChanged": {
        const phase = replay().phase();
        if (phase === "announcing" || phase === "playing") {
          replay().end("deviceChanged");
          pause = null;
        }
        return;
      }
      case "hidden":
      case "interrupted":
        if (pause === null && replay().cut()) {
          pause = Object.freeze({ reason });
        }
        return;
    }
  };

  const showUnsupported = (): void => {
    replay().cancel();
    stage = "unsupported";
    pause = null;
    activationRefused = false;
  };

  /** The flow's `withSound`: runs `continuation` once the shell runs, activating within the call. */
  const withSound = (continuation: () => void): void => {
    const state = output.state();
    if (state.kind === "unsupported") {
      showUnsupported();
      return;
    }
    if (state.kind === "running") {
      activationRefused = false;
      continuation();
      return;
    }
    void output.activate().then((result) => {
      step(() => {
        if (!inStage()) {
          return;
        }
        switch (result.kind) {
          case "running":
            if (output.state().kind === "running") {
              activationRefused = false;
              continuation();
            }
            return;
          case "refused":
            activationRefused = true;
            return;
          case "unsupported":
            showUnsupported();
            return;
          case "stopped":
            replayStopped(result.reason);
            return;
        }
      });
    });
  };

  const tracked: Timer = Object.freeze({
    now: (): number => manual.now(),
    setTimeout(callback: () => void, delayMs: number): TimerHandle {
      const handle = manual.setTimeout(() => {
        dueTimes.delete(handle);
        const before = cause;
        cause = { kind: "timer" };
        try {
          step(callback);
        } finally {
          cause = before;
        }
      }, delayMs);
      dueTimes.set(handle, manual.now() + delayMs);
      return handle;
    },
    clearTimeout(handle: TimerHandle): void {
      dueTimes.delete(handle);
      manual.clearTimeout(handle);
    },
  });

  controller = createMissedSoundReplay({
    output,
    timer: tracked,
    log,
    random,
    emit: (event) =>
      events.push(Object.freeze({ seq: nextSeq(), atMs: manual.now(), event })),
    notRunning: (reason) => replayStopped(reason),
    ...(options.settings === undefined ? {} : { settings: options.settings }),
  });

  realOutput.onStop((event) => {
    if (event.reason === "control") {
      return;
    }
    step(() => replayStopped(event.reason));
  });

  step(() => undefined);

  // ─── Driving it ─────────────────────────────────────────────────────────────────────────

  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < settleTurnCount; turn += 1) {
      await Promise.resolve();
    }
  };

  const nextDueMs = (): number | null => {
    let next: number | null = null;
    for (const dueMs of dueTimes.values()) {
      if (next === null || dueMs < next) {
        next = dueMs;
      }
    }
    return next;
  };

  const moveBy = (durationMs: number): void => {
    backend.advanceClockBy(durationMs);
    manual.advanceBy(durationMs);
  };

  const advanceTo = async (atMs: number): Promise<void> => {
    cause = { kind: "timer" };
    for (;;) {
      const dueMs = nextDueMs();
      if (dueMs === null || dueMs > atMs) {
        break;
      }
      moveBy(Math.max(0, dueMs - manual.now()));
      await settle();
    }
    moveBy(Math.max(0, atMs - manual.now()));
    await settle();
  };

  const actionBodies: Record<ReplayHarnessActionName, () => void> = {
    startReplay() {
      if (!inStage() || pause !== null || replay().phase() !== "announcing") {
        return;
      }
      withSound(() => {
        if (inStage() && pause === null && replay().phase() === "announcing") {
          replay().start();
        }
      });
    },
    proceed() {
      if (!inStage() || pause !== null) {
        return;
      }
      replay().skip();
      leaveToResult();
    },
    stop() {
      output.stopAll();
      if (!inStage()) {
        return;
      }
      replay().cancel();
      leaveToResult();
    },
    pause() {
      // Ignored in this stage (D15).
    },
    resume() {
      if (!inStage() || pause === null) {
        return;
      }
      withSound(() => {
        if (!inStage() || pause === null) {
          return;
        }
        pause = null;
        replay().resume();
      });
    },
  };

  const act = async (
    name: ReplayHarnessActionName,
    activationRefusedByBackend = false,
  ): Promise<void> => {
    actions.push(
      Object.freeze({
        seq: nextSeq(),
        atMs: manual.now(),
        name,
        activationRefusedByBackend,
        stageBefore: stage,
        pauseBefore: inStage() ? (pause?.reason ?? null) : null,
      }),
    );
    cause = { kind: "action", name, activationRefusedByBackend };
    step(actionBodies[name]);
    await settle();
  };

  const report = async (
    reason: Exclude<StopReason, "control">,
  ): Promise<void> => {
    reports.push(
      Object.freeze({
        seq: nextSeq(),
        atMs: manual.now(),
        reason,
        stageBefore: stage,
        pauseBefore: inStage() ? (pause?.reason ?? null) : null,
      }),
    );
    cause = { kind: "stopReport", reason };
    backend.fire(reason);
    await settle();
  };

  const withActivationRefused = async (
    name: "startReplay" | "resume",
  ): Promise<void> => {
    backend.setUserActivationActive(false);
    try {
      await act(name, true);
    } finally {
      backend.setUserActivationActive(true);
    }
  };

  const harness: ReplayHarness = {
    log,
    controller,
    shell,
    enteredAtMs,
    steps,
    events,
    plays,
    schedules,
    actions,
    reports,
    stopAlls,
    backendCalls: () => backend.calls.slice(backendCallsAtEntry),
    stage: () => stage,
    pause: () => (inStage() ? (pause?.reason ?? null) : null),
    current: () => steps.at(-1)!,
    pendingReplayTimerCount: () => dueTimes.size,
    now: () => manual.now(),
    startReplay: () => act("startReplay"),
    proceed: () => act("proceed"),
    stop: () => act("stop"),
    pauseAction: () => act("pause"),
    resume: () => act("resume"),
    withActivationRefused,
    report,
    advanceTo,
    advance: (durationMs) => advanceTo(manual.now() + durationMs),
    async run(script, tailMs) {
      for (const entry of replayScriptTimeline(script)) {
        await advanceTo(enteredAtMs + entry.atMs);
        switch (entry.action) {
          case "startReplay":
          case "proceed":
          case "stop":
          case "resume":
            await act(entry.action);
            break;
          case "pause":
            await act("pause");
            break;
          case "hidden":
          case "interrupted":
          case "deviceChanged":
          case "pageLeft":
            await report(entry.action);
            break;
          case "refusedResume":
            await withActivationRefused("resume");
            break;
          case "refusedStartReplay":
            await withActivationRefused("startReplay");
            break;
        }
      }
      await advanceTo(manual.now() + tailMs);
    },
  };
  return Object.freeze(harness);
}

/** The page clock times of a scheduled play, as the controller puts them (`soundWindowStartMs`). */
export function pageTimesOf(
  play: RecordedReplayPlay,
  outputDelayMs: number,
): { readonly startPageMs: number; readonly endPageMs: number } | null {
  if (play.outcome.kind !== "scheduled") {
    return null;
  }
  // The fake backend's pair puts the page clock `outputDelayMs` ahead of the audio clock, and a
  // start is never earlier than its request.
  const startPageMs = Math.max(play.atMs, play.outcome.startMs + outputDelayMs);
  return {
    startPageMs,
    endPageMs: startPageMs + (play.outcome.endMs - play.outcome.startMs),
  };
}

/**
 * The records after `seq` that cut a sound under way: every stop report, and every `stop` or
 * `proceed` given in the stage while no pause held.
 */
export function interruptionsAfter(
  harness: ReplayHarness,
  seq: number,
): readonly { readonly seq: number; readonly atMs: number }[] {
  return [
    ...harness.reports.filter((report) => report.seq > seq),
    ...harness.actions.filter(
      (action) =>
        action.seq > seq &&
        action.stageBefore === "missedSoundReplay" &&
        (action.name === "stop" ||
          (action.name === "proceed" && action.pauseBefore === null)),
    ),
  ].sort((a, b) => a.seq - b.seq);
}

/**
 * Whether a scheduled play ran to its end: nothing cut it before its end on the page clock. A cut
 * at the very time of its end comes after it, because the harness runs the callbacks due at a time
 * before the action or report of that time.
 */
export function playCompleted(
  harness: ReplayHarness,
  play: RecordedReplayPlay,
  outputDelayMs: number,
): boolean {
  const times = pageTimesOf(play, outputDelayMs);
  return (
    times !== null &&
    !interruptionsAfter(harness, play.seq).some(
      (cut) => cut.atMs < times.endPageMs,
    )
  );
}

/**
 * The index in the plan's sounds that each play must ask for, written from R7.1, R11.3 and R12.3,
 * not from the controller: the first play asks for the first sound; a play asks for the next sound
 * after a play that ran to its end, and for the same sound again after a play that was refused or
 * cut.
 */
export function expectedPlanIndexes(
  harness: ReplayHarness,
  outputDelayMs: number,
): readonly number[] {
  const indexes: number[] = [];
  let index = 0;
  let before: RecordedReplayPlay | null = null;
  for (const play of harness.plays) {
    if (before !== null) {
      index = playCompleted(harness, before, outputDelayMs) ? index + 1 : index;
    }
    indexes.push(index);
    before = play;
  }
  return indexes;
}

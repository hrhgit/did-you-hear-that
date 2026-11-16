import { isDeepStrictEqual } from "node:util";
import type { RandomSource } from "../../src/config/seeded-random";
import { createSeededRandom } from "../../src/config/seeded-random";
import { ghostSoundIds } from "../../src/config/sound-id";
import type { GhostSoundId } from "../../src/config/sound-id";
import type { Timer, TimerHandle } from "../../src/config/timer";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRequest,
} from "../../src/audio/output/create-audio-output";
import type {
  OutputState,
  StopReason,
} from "../../src/audio/output/output-types";
import type {
  FlowPresentedTrial,
  SwappedRepeatController,
} from "../../src/session/create-swapped-repeat";
import { createSwappedRepeat } from "../../src/session/create-swapped-repeat";
import { earpieceOnEar } from "../../src/session/earpiece-on-ear";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type {
  Ear,
  EarpieceState,
  HeadphoneCheckAnswer,
  SwappedRepeat,
  SwappedRepeatPauseReason,
  SwappedRepeatPhase,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
  SwappedTrialScoredEvent,
  VisitLog,
  VisitSummary,
} from "../../src/session/visit-flow-types";
import type { ListenerResponse } from "../listeners/listener-types";
import { createPsychometricListener } from "../listeners/psychometric-listener";
import type { TimeStampMode } from "../listeners/simulated-visitor";
import {
  earlierStampMaxMs,
  futureStampMs,
} from "../listeners/simulated-visitor";
import { wornHeadphones } from "../listeners/worn-headphones";
import type { ShellUnderTest } from "./output-shell-harness";
import { calibrate, createShellUnderTest } from "./output-shell-harness";
import type {
  CheckAnswerKind,
  RepeatLogCase,
  RepeatRefusalScript,
  RepeatScript,
  RepeatScriptAction,
  RepeatVisitScript,
} from "./swapped-repeat-arbitraries";
import {
  repeatEventMaxMs,
  repeatPressDelayMaxMs,
} from "./swapped-repeat-arbitraries";
import { answerDelayMaxMs } from "./visit-flow-arbitraries";
import { harnessSampleRateHz } from "./visit-flow-harness";

// The repeat harness (swapped-repeat design.md, "Correctness properties", "The repeat harness").
// It builds a Repeat_Controller on an output shell from `createShellUnderTest` at
// `harnessSampleRateHz`, calibrated with `calibrate` to the setting of the log's last
// calibration. The log it gives the controller is the drawn log with the shell's tops in its last
// calibration, and every room run of that calibration has the cap those tops give, so that the
// cap of the floor's first run is the cap of the shell. Around the controller it plays the flow's
// small part as "What the flow does" gives it: choosing the floor (with the offer, the record of
// Q4 and the calibration of D8), the stage and the result, the snapshot's pause field, activation
// on a press, the earpiece state, the list of records, the run count and the engine seed drawn
// from the visit's source after the replay's. It records every view after every step, every
// event, every check and trial sound asked for with its outcome, every backend `schedule` with its
// two channels, every `beginRoom` and `stopAll`, every presented trial, every action and every
// stop report.
//
// A simulated visitor in Worn_Headphones plays a repeat script through it (`run`). It hears each
// presented trial from the channel the backend was actually given and the earpieces it wears, not
// from what the controller says, and answers the check from the earpieces it wears: the hiss of
// the left earpiece reaches the ear that earpiece sits on. It swaps the earpieces when the
// instruction asks, unless its script makes it confirm without swapping the first time, and turns
// them back on reading the Turn_Back_Line when its script says so.
//
// For refusals the harness can answer each check and each trial sound from a refusal script, where
// `scheduled` passes the request to the calibrated shell and `refused` returns the refusal without
// playing. The shell's state, stop reports and activation stay the shell's own.
//
// The audio clock and the timer start together and move together. The controller's timer records
// the due time of every pending callback, and the harness moves the clocks from one due time, or
// one planned action of the visitor, to the next. The files that use this harness replace the
// synth's render functions with the worst-case renderers through `vi.mock` (audio-output D43).

/** How many microtask turns `settle` waits, enough for an activation to resolve and the flow's part to act on it. */
const settleTurnCount = 10;
/** Seeds are drawn as `floor(u × 2³²)` (visit-flow D19). */
const seedRangeCount = 0x100000000;
/** How long one visit to the stage may last before the visitor leaves it: the scripted events and a margin for the room. */
export const repeatVisitMaxMs = repeatEventMaxMs + 5 * 60_000;
/** The visitor's rest at the result before it chooses a floor again. */
const restAtResultMs = 2000;
/** The most presses the visitor makes for one view that does not change, before it waits for something else. */
const samePressMaxCount = 20;
/** The guard against a run that would never end. */
const stepLimitCount = 200_000;

export type RepeatHarnessStage = "result" | "swappedRepeat" | "unsupported";

/** The flow's methods the harness gives, as the flow names them. */
export type RepeatActionName =
  | "chooseSwappedRepeat"
  | "confirmSwap"
  | "playSwapCheck"
  | "answerSwapCheck"
  | "startSwappedRoom"
  | "answer"
  | "pause"
  | "resume"
  | "proceed"
  | "stop";

export type RepeatHarnessCause =
  | {
      readonly kind: "action";
      readonly name: RepeatActionName;
      readonly activationRefusedByBackend: boolean;
    }
  | { readonly kind: "stopReport"; readonly reason: StopReason }
  | { readonly kind: "timer" }
  | { readonly kind: "creation" };

/** What the result snapshot would hold of the repeat. */
export interface RecordedResult {
  readonly swappedRepeats: readonly SwappedRepeatRun[];
  readonly turnBackLine: string | null;
}

/** The snapshot after one step, as the flow would build it. */
export interface RecordedRepeatStep {
  readonly seq: number;
  readonly atMs: number;
  readonly cause: RepeatHarnessCause;
  readonly stage: RepeatHarnessStage;
  /** The visit to the stage under way, as an index into `visits`, or null at the result. */
  readonly visitIndex: number | null;
  readonly pause: SwappedRepeatPauseReason | null;
  readonly canProceed: boolean;
  readonly activationRefused: boolean;
  readonly earpieces: EarpieceState;
  /** The snapshot's `repeat` in the stage, otherwise null. */
  readonly view: SwappedRepeat | null;
  /** The result's fields of the repeat at the result, otherwise null. */
  readonly result: RecordedResult | null;
  /** Whether this snapshot differs from the one before, so that the flow would publish it. */
  readonly published: boolean;
}

/** One check or trial sound the controller asked for, with what it was answered. */
export interface RecordedRepeatSound {
  readonly seq: number;
  readonly atMs: number;
  readonly kind: "check" | "trial";
  readonly visitIndex: number | null;
  /** For a trial, the request as the shell received it: its `ear` is an earpiece. Null for a check. */
  readonly request: Omit<PlayRequest, "random"> | null;
  /** Whether the request carried the visit's render source. */
  readonly withSoundRandom: boolean;
  readonly outcome: PlayOutcome;
  readonly refusedByScript: boolean;
  readonly shellStateBefore: OutputState;
  readonly phaseBefore: SwappedRepeatPhase | null;
  readonly earpiecesBefore: EarpieceState;
  readonly pauseBefore: SwappedRepeatPauseReason | null;
  /** How the visitor wore the headphones when it was asked for. */
  readonly visitorEarpieceOnEar: Readonly<Record<Ear, Ear>>;
  /** The index in `schedules` of the backend call it made, or null. */
  readonly scheduleIndex: number | null;
}

/** One backend `schedule` call made after the harness was built. */
export interface RecordedRepeatSchedule {
  readonly seq: number;
  readonly atMs: number;
  readonly startMs: number;
  readonly sampleRateHz: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
  /** The index in `sounds` of the request that made it. */
  readonly soundIndex: number;
}

export interface RecordedRepeatEvent {
  readonly seq: number;
  readonly atMs: number;
  readonly visitIndex: number | null;
  readonly event: SwappedTrialScoredEvent;
}

/** One trial the test hook reported, with what the visitor heard. */
export interface RecordedPresentedTrial {
  readonly seq: number;
  readonly atMs: number;
  readonly visitIndex: number | null;
  readonly trial: FlowPresentedTrial;
  /** The index in `sounds` of its sound, or null for a no-sound trial. */
  readonly soundIndex: number | null;
  /** The channel the backend filled for it, or null. */
  readonly filledEarpiece: Ear | null;
  /** The visitor's ear that channel sits on, or null. */
  readonly heardOnEar: Ear | null;
  /** What the visitor answered: a side after a delay, or none. */
  readonly response: ListenerResponse;
}

export interface RecordedRepeatAction {
  readonly seq: number;
  readonly atMs: number;
  readonly name: RepeatActionName;
  readonly activationRefusedByBackend: boolean;
  readonly stageBefore: RepeatHarnessStage;
  readonly phaseBefore: SwappedRepeatPhase | null;
  readonly pauseBefore: SwappedRepeatPauseReason | null;
  readonly visitIndex: number | null;
}

export interface RecordedRepeatReport {
  readonly seq: number;
  readonly atMs: number;
  readonly reason: Exclude<StopReason, "control">;
  readonly stageBefore: RepeatHarnessStage;
  readonly phaseBefore: SwappedRepeatPhase | null;
  readonly pauseBefore: SwappedRepeatPauseReason | null;
  readonly visitIndex: number | null;
}

export interface RecordedRepeatMark {
  readonly seq: number;
  readonly atMs: number;
  readonly visitIndex: number | null;
}

/** One visit to the stage. */
export interface RepeatStageVisit {
  readonly index: number;
  readonly seq: number;
  readonly chosenAtMs: number;
  readonly floorIndex: number;
  readonly runNumber: number;
  readonly unavailable: SwappedRepeatUnavailableReason | null;
  readonly controller: SwappedRepeatController;
  /** The engine seed drawn when its room started, or null. */
  drawnEngineSeed: number | null;
  /** The record of its run, or null. */
  record: SwappedRepeatRun | null;
  /** Whether the phase `instruction` was shown. */
  instructionShown: boolean;
  /** When and by what the stage was left, or null while it is not. */
  left: {
    readonly seq: number;
    readonly atMs: number;
    readonly by: string;
  } | null;
}

export interface RepeatHarnessOptions {
  readonly logCase: RepeatLogCase;
  readonly outputDelayMs?: number;
  /** When given, the scripted output answers each check and each trial sound from it, in order. */
  readonly refusals?: RepeatRefusalScript | null;
}

export interface RepeatHarness {
  /** The log the controller is given: the drawn log with the shell's tops in its last calibration. */
  readonly log: VisitLog;
  readonly summary: VisitSummary;
  /** A deep copy of the log, made before anything ran. */
  readonly logBefore: VisitLog;
  readonly shell: ShellUnderTest;
  readonly offeredFloorIndex: number;
  /** The timer's time when the visit began: times of a record are counted from here. */
  readonly visitStartedAtMs: number;
  readonly outputDelayMs: number;
  readonly steps: readonly RecordedRepeatStep[];
  readonly sounds: readonly RecordedRepeatSound[];
  readonly schedules: readonly RecordedRepeatSchedule[];
  readonly events: readonly RecordedRepeatEvent[];
  readonly presented: readonly RecordedPresentedTrial[];
  readonly actions: readonly RecordedRepeatAction[];
  readonly reports: readonly RecordedRepeatReport[];
  readonly beginRooms: readonly RecordedRepeatMark[];
  readonly stopAlls: readonly RecordedRepeatMark[];
  readonly notRunningCalls: readonly (RecordedRepeatMark & {
    readonly reason: StopReason;
  })[];
  readonly visits: readonly RepeatStageVisit[];
  stage(): RepeatHarnessStage;
  pause(): SwappedRepeatPauseReason | null;
  earpieces(): EarpieceState;
  swappedRepeats(): readonly SwappedRepeatRun[];
  current(): RecordedRepeatStep;
  /** The visit to the stage under way, or null. */
  currentVisit(): RepeatStageVisit | null;
  visitorEarpieceOnEar(): Readonly<Record<Ear, Ear>>;
  /** How many of the controllers' timer callbacks are pending. */
  pendingControllerTimerCount(): number;
  now(): number;

  act(
    name: RepeatActionName,
    argument?: {
      readonly roomIndex?: number;
      readonly side?: Ear;
      readonly answer?: HeadphoneCheckAnswer;
      readonly pressedAtMs?: number;
    },
    activationRefusedByBackend?: boolean,
  ): Promise<void>;
  report(reason: Exclude<StopReason, "control">): Promise<void>;
  advanceTo(atMs: number): Promise<void>;
  advance(durationMs: number): Promise<void>;
  /**
   * Plays a repeat script with the simulated visitor: each visit to the stage from the choice of
   * its floor until it is left, then `tailMs` more. An ending, when given, is planned in the first
   * visit at its time from the choice of the floor.
   */
  run(
    script: RepeatScript,
    options?: {
      readonly ending?: {
        readonly atMs: number;
        readonly action: "proceed" | "stop" | "pageLeft";
      } | null;
      readonly tailMs?: number;
    },
  ): Promise<void>;
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

/** The channel a schedule fills, or null when both or neither hold a sample that is not zero. */
export function filledChannel(schedule: {
  readonly left: Float32Array;
  readonly right: Float32Array;
}): Ear | null {
  const leftFilled = schedule.left.some((sample) => sample !== 0);
  const rightFilled = schedule.right.some((sample) => sample !== 0);
  if (leftFilled === rightFilled) {
    return null;
  }
  return leftFilled ? "left" : "right";
}

/** The page clock times of a scheduled sound, as the controller puts them (`soundWindowStartMs`). */
export function soundPageTimes(
  sound: RecordedRepeatSound,
  outputDelayMs: number,
): { readonly startPageMs: number; readonly endPageMs: number } | null {
  if (sound.outcome.kind !== "scheduled") {
    return null;
  }
  // The fake backend's pair puts the page clock `outputDelayMs` ahead of the audio clock, and a
  // start is never earlier than its request.
  const startPageMs = Math.max(
    sound.atMs,
    sound.outcome.startMs + outputDelayMs,
  );
  return {
    startPageMs,
    endPageMs: startPageMs + (sound.outcome.endMs - sound.outcome.startMs),
  };
}

/** A whole number of milliseconds from 0 to `maxMs`, from one draw. */
const drawUpTo = (random: RandomSource, maxMs: number): number =>
  Math.floor(random.next() * (Math.floor(maxMs) + 1));

const drawSeed = (source: RandomSource): number =>
  Math.floor(source.next() * seedRangeCount);

interface PlannedAction {
  readonly atMs: number;
  readonly order: number;
  readonly run: () => Promise<void>;
}

/**
 * Builds a repeat harness at the result: a calibrated shell, the log with the shell's tops, its
 * summary, the visit's sources, and the flow's part. Nothing has played when this resolves.
 */
export async function createRepeatHarness(
  options: RepeatHarnessOptions,
): Promise<RepeatHarness> {
  const drawnLog = options.logCase.log;
  const lastCalibration = drawnLog.calibrations.at(-1);
  if (lastCalibration === undefined) {
    throw new Error("The repeat harness needs a log with a calibration.");
  }
  const outputDelayMs = options.outputDelayMs ?? 0;
  const shell = createShellUnderTest({
    seed: drawnLog.visitSeed,
    sampleRateHz: harnessSampleRateHz,
    performanceOffsetMs: outputDelayMs,
  });
  await calibrate(shell, lastCalibration.settingDb);
  const range = shell.output.rangeReport();
  if (range === null) {
    throw new Error("The shell kept no calibration.");
  }
  const shellTops = Object.fromEntries(
    ghostSoundIds.map((soundId) => [soundId, range.rooms[soundId].topLevelDb]),
  ) as Record<GhostSoundId, number>;
  const lastIndex = lastCalibration.calibrationIndex;
  const log: VisitLog = deepFreeze({
    ...drawnLog,
    calibrations: drawnLog.calibrations.map((calibration) =>
      calibration.calibrationIndex === lastIndex
        ? { ...calibration, roomTopLevelDb: shellTops }
        : calibration,
    ),
    roomAttempts: drawnLog.roomAttempts.map((attempt) =>
      attempt.calibrationIndex === lastIndex
        ? {
            ...attempt,
            searchCapDb: roomSearchCapDb(
              shellTops[drawnLog.rooms[attempt.roomIndex]!.roomId],
              hearingMethodConfig,
            ),
          }
        : attempt,
    ),
  });
  const logBefore = structuredClone(log);
  const summary = summarizeVisit(log);
  // The rooms and the replay are over: the flow called beginRoom for the replay (visit-flow R16.1).
  shell.output.beginRoom();

  const { backend, timer: manual } = shell;
  const schedulesAtStart = backend.scheduled().length;
  const lastLogMs = Math.max(
    0,
    ...log.roomAttempts.map((attempt) => attempt.endedAtMs),
  );
  const visitStartedAtMs = Math.floor(manual.now() - lastLogMs) - 1000;

  // The visit's source, as the flow draws from it: the render seed, one engine seed per room run,
  // the replay's render seed (visit-flow D19, missed-sound-replay R14.2); then the repeats' seeds.
  const source = createSeededRandom(log.visitSeed);
  const soundRandom = createSeededRandom(drawSeed(source));
  for (let draw = 0; draw < log.roomAttempts.length + 1; draw += 1) {
    drawSeed(source);
  }

  let seq = 0;
  const nextSeq = (): number => {
    seq += 1;
    return seq;
  };

  const steps: RecordedRepeatStep[] = [];
  const sounds: RecordedRepeatSound[] = [];
  const schedules: RecordedRepeatSchedule[] = [];
  const events: RecordedRepeatEvent[] = [];
  const presented: RecordedPresentedTrial[] = [];
  const actions: RecordedRepeatAction[] = [];
  const reports: RecordedRepeatReport[] = [];
  const beginRooms: RecordedRepeatMark[] = [];
  const stopAlls: RecordedRepeatMark[] = [];
  const notRunningCalls: (RecordedRepeatMark & { reason: StopReason })[] = [];
  const visits: RepeatStageVisit[] = [];

  // ─── The flow's part: its state ─────────────────────────────────────────────────────────

  let stage: RepeatHarnessStage = "result";
  let pause: { readonly reason: SwappedRepeatPauseReason } | null = null;
  let activationRefused = false;
  let earpieces: EarpieceState = "asMarked";
  const swappedRepeats: SwappedRepeatRun[] = [];
  let repeatRunCount = 0;
  let visit: RepeatStageVisit | null = null;
  let cause: RepeatHarnessCause = { kind: "creation" };
  let stepDepth = 0;
  const visitIndexNow = (): number | null => visit?.index ?? null;
  const phaseNow = (): SwappedRepeatPhase | null =>
    visit?.controller.phase() ?? null;

  // The visitor's headphones, which `run` changes as the visitor swaps and turns back.
  const wearing: {
    imbalanceDb: number;
    earpieceOnEar: Readonly<Record<Ear, Ear>>;
  } = {
    imbalanceDb: 0,
    earpieceOnEar: earpieceOnEar("asMarked"),
  };
  let onPresented: ((record: RecordedPresentedTrial) => void) | null = null;

  // ─── The output the controller uses ─────────────────────────────────────────────────────

  const realOutput = shell.output;
  const refusals = options.refusals ?? null;
  let checkCount = 0;
  let trialCount = 0;

  const recordSchedule = (soundIndex: number, atMs: number): number | null => {
    const scheduled = backend.scheduled();
    if (scheduled.length - schedulesAtStart <= schedules.length) {
      return null;
    }
    const call = scheduled.at(-1)!;
    schedules.push(
      Object.freeze({
        seq: nextSeq(),
        atMs,
        startMs: call.startMs,
        sampleRateHz: call.sampleRateHz,
        left: call.left,
        right: call.right,
        soundIndex,
      }),
    );
    return schedules.length - 1;
  };

  const recordSound = (
    kind: "check" | "trial",
    request: PlayRequest | null,
    random: RandomSource,
    ask: () => PlayOutcome,
    entry: RepeatRefusalScript["play"][number] | undefined,
  ): PlayOutcome => {
    const atMs = manual.now();
    const shellStateBefore = realOutput.state();
    const phaseBefore = phaseNow();
    const earpiecesBefore = earpieces;
    const pauseBefore = pause?.reason ?? null;
    const visitorEarpieceOnEar = wearing.earpieceOnEar;
    const refusedByScript = entry?.kind === "refused";
    const outcome: PlayOutcome =
      entry?.kind === "refused"
        ? Object.freeze({ kind: "refused", reason: entry.reason })
        : ask();
    const soundIndex = sounds.length;
    const scheduleIndex = recordSchedule(soundIndex, atMs);
    sounds.push(
      Object.freeze({
        seq: nextSeq(),
        atMs,
        kind,
        visitIndex: visitIndexNow(),
        request:
          request === null
            ? null
            : Object.freeze({
                soundId: request.soundId,
                ear: request.ear,
                levelDb: request.levelDb,
                purpose: request.purpose,
              }),
        withSoundRandom: random === soundRandom,
        outcome,
        refusedByScript,
        shellStateBefore,
        phaseBefore,
        earpiecesBefore,
        pauseBefore,
        visitorEarpieceOnEar,
        scheduleIndex,
      }),
    );
    return outcome;
  };

  const output: AudioOutput = Object.freeze({
    ...realOutput,
    play(request: PlayRequest): PlayOutcome {
      const entry = refusals?.play[trialCount];
      trialCount += 1;
      return recordSound(
        "trial",
        request,
        request.random,
        () => realOutput.play(request),
        entry,
      );
    },
    playHeadphoneCheck(random: RandomSource): PlayOutcome {
      const entry = refusals?.check[checkCount];
      checkCount += 1;
      return recordSound(
        "check",
        null,
        random,
        () => realOutput.playHeadphoneCheck(random),
        entry,
      );
    },
    beginRoom(): void {
      beginRooms.push(
        Object.freeze({
          seq: nextSeq(),
          atMs: manual.now(),
          visitIndex: visitIndexNow(),
        }),
      );
      realOutput.beginRoom();
    },
    stopAll(): void {
      stopAlls.push(
        Object.freeze({
          seq: nextSeq(),
          atMs: manual.now(),
          visitIndex: visitIndexNow(),
        }),
      );
      realOutput.stopAll();
    },
  });

  // ─── Snapshots and steps ────────────────────────────────────────────────────────────────

  const snapshotNow = () => {
    const inStage = stage === "swappedRepeat" && visit !== null;
    return {
      stage,
      visitIndex: inStage ? visitIndexNow() : null,
      pause: inStage ? (pause?.reason ?? null) : null,
      canProceed: inStage && pause === null,
      activationRefused,
      earpieces,
      view: inStage
        ? visit!.controller.view({
            earpieces,
            pauseReason: pause?.reason ?? null,
          })
        : null,
      result:
        stage === "result"
          ? {
              swappedRepeats: Object.freeze([...swappedRepeats]),
              turnBackLine:
                earpieces === "asMarked"
                  ? null
                  : swappedRepeatCopy.turnBackLine,
            }
          : null,
    };
  };

  const record = (): void => {
    const snapshot = snapshotNow();
    if (snapshot.view?.phase === "instruction" && visit !== null) {
      visit.instructionShown = true;
    }
    const before = steps.at(-1);
    const published =
      before === undefined ||
      !isDeepStrictEqual(
        {
          stage: before.stage,
          visitIndex: before.visitIndex,
          pause: before.pause,
          canProceed: before.canProceed,
          activationRefused: before.activationRefused,
          earpieces: before.earpieces,
          view: before.view,
          result: before.result,
        },
        snapshot,
      );
    steps.push(
      deepFreeze({
        seq: nextSeq(),
        atMs: manual.now(),
        cause,
        ...snapshot,
        published,
      }),
    );
  };

  /** Runs `body` as one step of the flow, and records the snapshot after the outermost step. */
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

  // ─── The flow's part: what it does ──────────────────────────────────────────────────────

  const leaveRepeat = (by: string): void => {
    const current = visit;
    if (current === null) {
      return;
    }
    current.controller.leave();
    pause = null;
    if (current.instructionShown) {
      earpieces = "unknown";
    }
    current.left = Object.freeze({ seq: nextSeq(), atMs: manual.now(), by });
    visit = null;
    stage = "result";
  };

  /** What a stop report does in this stage ("What the flow does", `repeatStopped`). */
  const repeatStopped = (reason: StopReason): void => {
    const current = visit;
    if (stage !== "swappedRepeat" || current === null) {
      return;
    }
    const controller = current.controller;
    switch (reason) {
      case "control":
        return;
      case "pageLeft":
        leaveRepeat("pageLeft");
        return;
      case "deviceChanged":
        pause = null;
        controller.calibrationGone();
        return;
      case "hidden":
      case "interrupted":
        if (controller.phase() === "room") {
          if (pause === null && controller.pause(reason)) {
            pause = Object.freeze({ reason });
          }
        } else if (controller.phase() === "check") {
          controller.checkCut();
        }
        return;
    }
  };

  const showUnsupported = (): void => {
    if (visit !== null) {
      leaveRepeat("unsupported");
    }
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
    const owner = visit;
    void output.activate().then((result) => {
      step(() => {
        if (visit !== owner || stage !== "swappedRepeat") {
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
            repeatStopped(result.reason);
            return;
        }
      });
    });
  };

  // The controllers' timer, which knows its due times. Its callbacks run as steps.
  const dueTimes = new Map<TimerHandle, number>();
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

  const latestOffset = { latestOffsetMs: 0 };

  const choose = (roomIndex: number): void => {
    if (stage !== "result" || pause !== null) {
      return;
    }
    const roomSummary = summary.rooms[roomIndex];
    if (
      roomSummary === undefined ||
      !roomSummary.swappedRepeatOffered ||
      swappedRepeats.some((run) => run.roomIndex === roomIndex)
    ) {
      return;
    }
    const firstRun = log.roomAttempts
      .filter(
        (attempt) =>
          attempt.roomIndex === roomIndex && attempt.ending === "finished",
      )
      .at(-1)!;
    const unavailable: SwappedRepeatUnavailableReason | null =
      output.rangeReport() === null
        ? "calibrationGone"
        : firstRun.calibrationIndex !== lastIndex
          ? "calibrationChanged"
          : null;
    const index = visits.length;
    const runNumber = repeatRunCount + 1;
    let entry: RepeatStageVisit | null = null;
    const controller = createSwappedRepeat({
      output,
      timer: tracked,
      log,
      summary,
      roomIndex,
      runNumber,
      visitStartedAtMs,
      unavailable,
      soundRandom,
      drawEngineSeed: () => {
        const seed = drawSeed(source);
        repeatRunCount = runNumber;
        if (entry !== null) {
          entry.drawnEngineSeed = seed;
        }
        return seed;
      },
      latestOffset,
      emit: (event) =>
        events.push(
          Object.freeze({
            seq: nextSeq(),
            atMs: manual.now(),
            visitIndex: index,
            event,
          }),
        ),
      notRunning: (reason) => {
        notRunningCalls.push(
          Object.freeze({
            seq: nextSeq(),
            atMs: manual.now(),
            visitIndex: index,
            reason,
          }),
        );
        repeatStopped(reason);
      },
      recorded: (run) => {
        swappedRepeats.push(run);
        if (entry !== null) {
          entry.record = run;
        }
      },
      onTrialPresented: (trial) => {
        // The sound of a presented trial was asked for in this same step, as the last one.
        let sound = -1;
        if (trial.kind === "sound") {
          sounds.forEach((candidate, candidateIndex) => {
            if (
              candidate.kind === "trial" &&
              candidate.atMs === manual.now() &&
              candidate.outcome.kind === "scheduled"
            ) {
              sound = candidateIndex;
            }
          });
        }
        const scheduleIndex =
          sound >= 0 ? (sounds[sound]?.scheduleIndex ?? null) : null;
        const filledEarpiece =
          scheduleIndex === null
            ? null
            : filledChannel(schedules[scheduleIndex]!);
        const heardOnEar =
          filledEarpiece === null
            ? null
            : (["left", "right"] as const).find(
                (ear) => wearing.earpieceOnEar[ear] === filledEarpiece,
              )!;
        const recorded: RecordedPresentedTrial = {
          seq: nextSeq(),
          atMs: manual.now(),
          visitIndex: index,
          trial,
          soundIndex: sound >= 0 ? sound : null,
          filledEarpiece,
          heardOnEar,
          response: "none",
        };
        onPresented?.(recorded);
      },
    });
    entry = {
      index,
      seq: nextSeq(),
      chosenAtMs: manual.now(),
      floorIndex: roomIndex,
      runNumber,
      unavailable,
      controller,
      drawnEngineSeed: null,
      record: null,
      instructionShown: false,
      left: null,
    };
    visits.push(entry);
    visit = entry;
    stage = "swappedRepeat";
    if (controller.phase() === "instruction") {
      earpieces = "unknown";
    }
  };

  const inStageUnpaused = (): RepeatStageVisit | null =>
    stage === "swappedRepeat" && pause === null ? visit : null;

  const actionBodies = {
    chooseSwappedRepeat: (roomIndex: number) => choose(roomIndex),
    confirmSwap: () => {
      inStageUnpaused()?.controller.confirmSwap();
    },
    answerSwapCheck: (answer: HeadphoneCheckAnswer) => {
      const current = inStageUnpaused();
      if (current === null) {
        return;
      }
      const judgement = current.controller.answerCheck(answer);
      if (judgement !== null) {
        earpieces = judgement === "confirmed" ? "swapped" : "unknown";
      }
    },
    playSwapCheck: () => {
      const current = inStageUnpaused();
      if (current === null || current.controller.phase() !== "check") {
        return;
      }
      withSound(() => {
        if (
          visit === current &&
          stage === "swappedRepeat" &&
          pause === null &&
          current.controller.phase() === "check"
        ) {
          current.controller.playCheck();
        }
      });
    },
    startSwappedRoom: () => {
      const current = inStageUnpaused();
      if (
        current === null ||
        current.controller.phase() !== "ready" ||
        earpieces !== "swapped"
      ) {
        return;
      }
      withSound(() => {
        if (
          visit === current &&
          stage === "swappedRepeat" &&
          pause === null &&
          current.controller.phase() === "ready" &&
          earpieces === "swapped"
        ) {
          current.controller.startRoom();
        }
      });
    },
    answer: (side: Ear, pressedAtMs?: number) => {
      const current = inStageUnpaused();
      if (current !== null && current.controller.phase() === "room") {
        current.controller.answer(side, pressedAtMs);
      }
    },
    pause: () => {
      const current = inStageUnpaused();
      if (current === null || current.controller.phase() !== "room") {
        return;
      }
      if (current.controller.pause("visitor")) {
        pause = Object.freeze({ reason: "visitor" });
        output.stopAll();
      }
    },
    resume: () => {
      const current = visit;
      if (stage !== "swappedRepeat" || current === null || pause === null) {
        return;
      }
      withSound(() => {
        if (visit !== current || pause === null) {
          return;
        }
        pause = null;
        current.controller.resume();
      });
    },
    proceed: () => {
      const current = inStageUnpaused();
      if (current === null) {
        return;
      }
      if (current.controller.mayBeSounding()) {
        output.stopAll();
      }
      leaveRepeat("proceed");
    },
    stop: () => {
      output.stopAll();
      if (stage === "swappedRepeat") {
        leaveRepeat("stop");
      }
    },
  };

  realOutput.onStop((event) => {
    if (event.reason === "control") {
      return;
    }
    step(() => repeatStopped(event.reason));
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

  const act = async (
    name: RepeatActionName,
    argument: {
      readonly roomIndex?: number;
      readonly side?: Ear;
      readonly answer?: HeadphoneCheckAnswer;
      readonly pressedAtMs?: number;
    } = {},
    activationRefusedByBackend = false,
  ): Promise<void> => {
    actions.push(
      Object.freeze({
        seq: nextSeq(),
        atMs: manual.now(),
        name,
        activationRefusedByBackend,
        stageBefore: stage,
        phaseBefore: phaseNow(),
        pauseBefore: pause?.reason ?? null,
        visitIndex: visitIndexNow(),
      }),
    );
    if (activationRefusedByBackend) {
      backend.setUserActivationActive(false);
    }
    cause = { kind: "action", name, activationRefusedByBackend };
    try {
      step(() => {
        switch (name) {
          case "chooseSwappedRepeat":
            actionBodies.chooseSwappedRepeat(argument.roomIndex ?? -1);
            return;
          case "answerSwapCheck":
            actionBodies.answerSwapCheck(argument.answer ?? "left");
            return;
          case "answer":
            actionBodies.answer(argument.side ?? "left", argument.pressedAtMs);
            return;
          default:
            actionBodies[name]();
        }
      });
      await settle();
    } finally {
      if (activationRefusedByBackend) {
        backend.setUserActivationActive(true);
      }
    }
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
        phaseBefore: phaseNow(),
        pauseBefore: pause?.reason ?? null,
        visitIndex: visitIndexNow(),
      }),
    );
    cause = { kind: "stopReport", reason };
    backend.fire(reason);
    await settle();
  };

  // ─── The simulated visitor ──────────────────────────────────────────────────────────────

  const run = async (
    script: RepeatScript,
    runOptions: {
      readonly ending?: {
        readonly atMs: number;
        readonly action: "proceed" | "stop" | "pageLeft";
      } | null;
      readonly tailMs?: number;
    } = {},
  ): Promise<void> => {
    const random = createSeededRandom(script.visitorSeed);
    const listener = createPsychometricListener(
      script.listener.parameters,
      createSeededRandom(script.listener.seed),
    );
    wearing.imbalanceDb = script.imbalanceDb;
    const hear = wornHeadphones(listener, wearing);
    if (script.timeStampModes.length === 0) {
      throw new RangeError(
        "A repeat script needs at least one time stamp mode.",
      );
    }

    let planned: PlannedAction[] = [];
    let order = 0;
    let stepCount = 0;
    const plan = (atMs: number, body: () => Promise<void>): PlannedAction => {
      const action = Object.freeze({ atMs, order, run: body });
      order += 1;
      planned.push(action);
      return action;
    };
    const unplan = (action: PlannedAction | null): void => {
      if (action !== null) {
        planned = planned.filter((entry) => entry !== action);
      }
    };

    const stampOf = (
      mode: TimeStampMode,
      earlierMs: number,
    ): number | undefined => {
      const nowMs = manual.now();
      switch (mode) {
        case "now":
          return nowMs;
        case "earlier":
          return nowMs - earlierMs;
        case "missing":
          return undefined;
        case "nan":
          return Number.NaN;
        case "future":
          return nowMs + futureStampMs;
      }
    };

    onPresented = (entry) => {
      const response: ListenerResponse =
        entry.trial.kind === "noSound"
          ? hear({ kind: "noSound" })
          : entry.filledEarpiece === null || entry.soundIndex === null
            ? "none"
            : (() => {
                const outcome = sounds[entry.soundIndex]!.outcome;
                return outcome.kind === "scheduled"
                  ? hear({
                      kind: "sound",
                      earpiece: entry.filledEarpiece,
                      levelDb: outcome.playedLevelDb,
                    })
                  : "none";
              })();
      presented.push(Object.freeze({ ...entry, response }));
      if (response === "none") {
        return;
      }
      const delayMs = drawUpTo(random, answerDelayMaxMs);
      const mode =
        script.timeStampModes[
          Math.floor(random.next() * script.timeStampModes.length)
        ]!;
      const earlierMs = drawUpTo(random, earlierStampMaxMs);
      plan(entry.trial.windowStartMs + delayMs, () =>
        act("answer", {
          side: response,
          pressedAtMs: stampOf(mode, earlierMs),
        }),
      );
    };

    /** The ear the hiss of the left earpiece reaches, in what the visitor wears now. */
    const hissEar = (): Ear =>
      wearing.earpieceOnEar.left === "left" ? "left" : "right";

    let checkAnswerIndex = 0;
    let instructionCount = 0;
    let reaction: PlannedAction | null = null;
    let reactedKey: string | null = null;
    let samePressCount = 0;
    let visitScript: RepeatVisitScript | null = null;

    const answerOfKind = (kind: CheckAnswerKind): HeadphoneCheckAnswer =>
      kind === "heard" ? hissEar() : kind;

    /** Plans the press the stage asks for, a drawn delay from now, when what it shows changed. */
    const react = (): void => {
      const current = steps.at(-1)!;
      if (current.stage !== "swappedRepeat" || current.view === null) {
        return;
      }
      const key = JSON.stringify({
        view: current.view,
        pause: current.pause,
        activationRefused: current.activationRefused,
      });
      if (key === reactedKey && reaction !== null) {
        return;
      }
      if (key === reactedKey) {
        samePressCount += 1;
        if (samePressCount > samePressMaxCount) {
          return;
        }
      } else {
        samePressCount = 0;
      }
      unplan(reaction);
      reaction = null;
      reactedKey = key;
      const view = current.view;
      const atMs = manual.now() + drawUpTo(random, repeatPressDelayMaxMs);
      const press = (body: () => Promise<void>): void => {
        reaction = plan(atMs, async () => {
          reaction = null;
          await body();
        });
      };
      if (current.pause !== null) {
        return;
      }
      switch (view.phase) {
        case "unavailable":
        case "finished":
          press(() => act("proceed"));
          return;
        case "instruction":
          press(() => {
            instructionCount += 1;
            if (
              instructionCount > 1 ||
              (visitScript?.swapsOnFirstInstruction ?? true)
            ) {
              wearing.earpieceOnEar = earpieceOnEar("swapped");
            }
            return act("confirmSwap");
          });
          return;
        case "check":
          if (view.awaitingAnswer) {
            press(() => {
              const kind =
                visitScript?.checkAnswers[checkAnswerIndex] ?? "heard";
              checkAnswerIndex += 1;
              return act("answerSwapCheck", { answer: answerOfKind(kind) });
            });
          } else {
            press(() => act("playSwapCheck"));
          }
          return;
        case "ready":
          press(() => act("startSwappedRoom"));
          return;
        case "room":
          return;
      }
    };

    /** The press the stage asks for now, while the fake backend refuses activation. */
    const refusedPress = async (): Promise<void> => {
      const current = steps.at(-1)!;
      if (current.pause !== null) {
        await act("resume", {}, true);
        return;
      }
      if (current.view?.phase === "check") {
        await act("playSwapCheck", {}, true);
        return;
      }
      if (current.view?.phase === "ready") {
        await act("startSwappedRoom", {}, true);
      }
    };

    const eventBody = (action: RepeatScriptAction): (() => Promise<void>) => {
      switch (action) {
        case "proceed":
        case "stop":
        case "pause":
        case "resume":
          return () => act(action);
        case "hidden":
        case "interrupted":
        case "deviceChanged":
        case "pageLeft":
          return () => report(action);
        case "refusedPress":
          return refusedPress;
      }
    };

    const runPlanned = async (deadlineMs: number): Promise<void> => {
      for (;;) {
        stepCount += 1;
        if (stepCount > stepLimitCount) {
          throw new Error(
            "The repeat script did not end within the step limit.",
          );
        }
        if (stage !== "swappedRepeat") {
          return;
        }
        react();
        const nextPlanned = planned.reduce<PlannedAction | null>(
          (first, entry) =>
            first === null ||
            entry.atMs < first.atMs ||
            (entry.atMs === first.atMs && entry.order < first.order)
              ? entry
              : first,
          null,
        );
        const dueMs = nextDueMs();
        const plannedAtMs = nextPlanned?.atMs ?? Number.POSITIVE_INFINITY;
        const nextMs = Math.min(plannedAtMs, dueMs ?? Number.POSITIVE_INFINITY);
        if (nextMs > deadlineMs) {
          await advanceTo(deadlineMs);
          return;
        }
        if (dueMs !== null && dueMs <= plannedAtMs) {
          // The controller's callbacks due at a time run before the visitor's action of that time.
          await advanceTo(dueMs);
          continue;
        }
        await advanceTo(Math.max(manual.now(), plannedAtMs));
        planned = planned.filter((entry) => entry !== nextPlanned);
        await nextPlanned!.run();
      }
    };

    let pageGone = false;
    for (const [index, thisVisit] of script.visits.entries()) {
      if (stage !== "result" || pageGone) {
        break;
      }
      if (index > 0) {
        await advanceTo(manual.now() + restAtResultMs);
      }
      visitScript = thisVisit;
      checkAnswerIndex = 0;
      instructionCount = 0;
      reaction = null;
      reactedKey = null;
      planned = [];
      const offered = options.logCase.floorIndex;
      const notOffered = summary.rooms.findIndex(
        (room) => !room.swappedRepeatOffered,
      );
      const recorded = swappedRepeats.at(-1)?.roomIndex;
      const floorIndex =
        thisVisit.floor === "notOffered" && notOffered >= 0
          ? notOffered
          : thisVisit.floor === "recorded" && recorded !== undefined
            ? recorded
            : offered;
      const chosenAtMs = manual.now();
      await act("chooseSwappedRepeat", { roomIndex: floorIndex });
      if (harness.stage() !== "swappedRepeat") {
        continue;
      }
      for (const press of thisVisit.strayPresses) {
        plan(chosenAtMs + press.atMs, () =>
          press.name === "answer"
            ? act("answer", { side: press.side, pressedAtMs: manual.now() })
            : press.name === "answerSwapCheck"
              ? act("answerSwapCheck", { answer: press.side })
              : act(press.name),
        );
      }
      for (const event of thisVisit.events) {
        plan(chosenAtMs + event.atMs, eventBody(event.action));
        if (event.resumeAfterMs !== null) {
          plan(chosenAtMs + event.atMs + event.resumeAfterMs, () =>
            act("resume"),
          );
        }
      }
      const ending = index === 0 ? (runOptions.ending ?? null) : null;
      if (ending !== null) {
        plan(chosenAtMs + ending.atMs, eventBody(ending.action));
      }
      await runPlanned(chosenAtMs + repeatVisitMaxMs);
      if (harness.stage() === "swappedRepeat") {
        await act(pause === null ? "proceed" : "stop");
      }
      planned = [];
      pageGone = reports.some((entry) => entry.reason === "pageLeft");
      // The visitor reads the Turn_Back_Line at the result.
      const result = steps.at(-1)?.result ?? null;
      if (
        thisVisit.turnsBack &&
        result !== null &&
        result.turnBackLine !== null
      ) {
        wearing.earpieceOnEar = earpieceOnEar("asMarked");
      }
    }
    onPresented = null;
    await advanceTo(manual.now() + (runOptions.tailMs ?? 0));
  };

  const harness: RepeatHarness = {
    log,
    summary,
    logBefore,
    shell,
    offeredFloorIndex: options.logCase.floorIndex,
    visitStartedAtMs,
    outputDelayMs,
    steps,
    sounds,
    schedules,
    events,
    presented,
    actions,
    reports,
    beginRooms,
    stopAlls,
    notRunningCalls,
    visits,
    stage: () => stage,
    pause: () => pause?.reason ?? null,
    earpieces: () => earpieces,
    swappedRepeats: () => Object.freeze([...swappedRepeats]),
    current: () => steps.at(-1)!,
    currentVisit: () => visit,
    visitorEarpieceOnEar: () => wearing.earpieceOnEar,
    pendingControllerTimerCount: () => dueTimes.size,
    now: () => manual.now(),
    act,
    report,
    advanceTo,
    advance: (durationMs) => advanceTo(manual.now() + durationMs),
    run,
  };
  return Object.freeze(harness);
}

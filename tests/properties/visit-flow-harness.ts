import { createManualTimer } from "../../src/config/manual-timer";
import type { ManualTimer } from "../../src/config/manual-timer";
import type { RandomSource } from "../../src/config/seeded-random";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import type { Timer, TimerHandle } from "../../src/config/timer";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import type { AudioBackend } from "../../src/audio/output/audio-backend";
import type {
  AudioOutput,
  BeginRoomOptions,
  KeepOutcome,
  PlayOutcome,
  PlayRequest,
  RiseLimitScope,
} from "../../src/audio/output/create-audio-output";
import { createAudioOutput } from "../../src/audio/output/create-audio-output";
import type {
  FakeAudioBackend,
  FakeAudioBackendOptions,
} from "../../src/audio/output/fake-audio-backend";
import { createFakeAudioBackend } from "../../src/audio/output/fake-audio-backend";
import type { FlowPresentedTrial } from "../../src/session/create-swapped-repeat";
import { createVisitFlow } from "../../src/session/create-visit-flow";
import type {
  Ear,
  VisitEvent,
  VisitFlow,
  VisitSnapshot,
  VisitStage,
} from "../../src/session/visit-flow-types";
import type {
  OutputEventKind,
  VisitDriver,
} from "../listeners/simulated-visitor";
import { calibrationMusicFixture } from "./calibration-music-fixture";

// The Visit_Harness (visit-flow design.md, "The Visit_Harness"; R22.1, D26). It builds a visit
// flow on the fake backend and the manual timer, moves the audio clock and the timer together, and
// records everything the properties check: every snapshot notification and event with its time
// and cause, every presented trial, every action given, every schedule call with the stage it
// came in, and, with `spyOnOutput`, every call the flow made to the output shell.
//
// The files that use it replace the synth's render functions with the worst-case renderers
// through `vi.mock`, as the output stage's own properties do (audio-output D43).

/** The sample rate of the harness's fake backend: the lowest supported rate, where renders are quickest. */
export const harnessSampleRateHz = soundRulesConfig.sampleRateMinHz;

/** How many microtask turns `settle` waits, enough for an activation to resolve and the flow to act on it. */
const settleTurnCount = 10;

/**
 * What made something happen: a flow action given by the harness (and the activations it started,
 * which settle right after it), a stop report the harness made the backend send, or a timer
 * callback while the clocks moved.
 */
export type HarnessCause = "action" | "stopReport" | "timer";

export interface RecordedSnapshot {
  readonly atMs: number;
  readonly cause: HarnessCause;
  readonly snapshot: VisitSnapshot;
}

export interface RecordedEvent {
  readonly atMs: number;
  readonly cause: HarnessCause;
  readonly event: VisitEvent;
}

export interface RecordedPresentation {
  readonly atMs: number;
  readonly trial: FlowPresentedTrial;
}

/** One call of a flow action, with the stage and pause it was given in. */
export interface RecordedAction {
  readonly atMs: number;
  readonly name: keyof VisitFlow;
  readonly args: readonly unknown[];
  readonly stageBefore: VisitStage;
  readonly pausedBefore: boolean;
}

/** One answer given to the flow: when it was given, the side, and its time stamp. */
export interface RecordedAnswer {
  readonly atMs: number;
  readonly side: Ear;
  readonly pressedAtMs: number | undefined;
  readonly stageBefore: VisitStage;
  readonly pausedBefore: boolean;
}

/** One `schedule` call of the output shell on the backend. */
export interface RecordedSchedule {
  readonly atMs: number;
  readonly stage: VisitStage;
  readonly startMs: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
  /** True for a practice sound: scheduled in a room while its practice is under way. */
  readonly practice: boolean;
  /**
   * The purpose of the `play` call that scheduled it, or null for a sound the shell plays by a call
   * of its own (the calibration sound, the headphone check). A reminder and a chime are no trial.
   */
  readonly purpose: PlayRequest["purpose"] | null;
}

/** One call the flow made to the output shell (only with `spyOnOutput`). */
export type RecordedOutputCall =
  | {
      readonly atMs: number;
      readonly stage: VisitStage | "creation";
      readonly cause: HarnessCause;
      readonly name: "activate" | "playHeadphoneCheck" | "stopAll";
    }
  | {
      readonly atMs: number;
      readonly stage: VisitStage | "creation";
      readonly cause: HarnessCause;
      readonly name: "beginRoom";
      /**
       * What the span holds a sound's rise to: the last sound on its ear, as a span begun with no
       * option does, or the last sound of its own sound id on its ear (one-room design.md, D4).
       */
      readonly riseLimitPer: RiseLimitScope;
    }
  | {
      readonly atMs: number;
      readonly stage: VisitStage | "creation";
      readonly cause: HarnessCause;
      readonly name: "play";
      readonly request: Omit<PlayRequest, "random">;
      readonly outcome: PlayOutcome;
    }
  | {
      readonly atMs: number;
      readonly stage: VisitStage | "creation";
      readonly cause: HarnessCause;
      readonly name: "keepCalibration";
      readonly outcome: KeepOutcome;
    };

export interface VisitHarnessOptions {
  /** The flow's seed. */
  readonly seed: number;
  /**
   * How far the page clock is ahead of the audio clock (P). The timer starts at P and the audio
   * clock at 0, so no code may assume the two clocks are equal. Properties draw it from 0 to 10⁶.
   */
  readonly performanceOffsetMs: number;
  /** Build the shell in the harness and wrap it in a spy, and give the flow `output` instead of `backend`. */
  readonly spyOnOutput?: boolean;
  /**
   * How many rooms' searches take turns in one room run. 1 unless a property says otherwise: the
   * rooms run one after another, as the properties of the earlier specs describe them. The
   * properties of the one-room spec pass the shipped count.
   */
  readonly roomsTogetherMaxCount?: number;
  /** Further options of the fake backend. */
  readonly backend?: Omit<
    FakeAudioBackendOptions,
    "performanceOffsetMs" | "startMs"
  >;
  /**
   * The calibration music (audible-start design.md, "Testing the music under Node"): `fixture`,
   * the default, resolves the load with `harnessMusicFixture`, as a site whose music loads does;
   * `reject` fails it, so the calibration sound is the hiss. A `calibrationMusic` in `backend`
   * goes before both.
   */
  readonly music?: "fixture" | "reject";
}

/** One way the rooms of a visit run in a property. */
export interface RoomRun {
  /** For the name of a test. */
  readonly name: string;
  /** What the flow is given as its `roomsTogetherMaxCount`. */
  readonly roomsTogetherMaxCount: number;
  /** True when more than one room's search may take turns in one room run. */
  readonly together: boolean;
}

/**
 * The ways the rooms of a visit run in the properties (one-room design.md, D1): one after another,
 * as the earlier specs describe them, and with as many searches taking turns in the one room as the
 * shipped site runs together. A site set back to one room at a time has only the first.
 */
export const roomRuns: readonly RoomRun[] = Object.freeze([
  Object.freeze({
    name: "the rooms one after another",
    roomsTogetherMaxCount: 1,
    together: false,
  }),
  ...(visitFlowConfig.roomsTogetherMaxCount > 1
    ? [
        Object.freeze({
          name: `the one room, up to ${String(visitFlowConfig.roomsTogetherMaxCount)} searches taking turns`,
          roomsTogetherMaxCount: visitFlowConfig.roomsTogetherMaxCount,
          together: true,
        }),
      ]
    : []),
]);

/**
 * The music the harness loads by default: music-like samples made in code, with the RMS and the
 * crest factor of the measured file (0.11088 and 18.40 dB), so that its top is −5 dB, at the
 * harness's rate.
 */
export const harnessMusicFixture: Float32Array = calibrationMusicFixture({
  crestDb: 18.4,
  rmsFraction: 0.11088,
  sampleRateHz: harnessSampleRateHz,
});

export interface VisitHarness extends VisitDriver {
  readonly backend: FakeAudioBackend;
  readonly timer: ManualTimer;
  /** The flow, with every action recorded. Use it, not a flow of your own, so that the records are complete. */
  readonly flow: VisitFlow;
  /** The output shell the flow plays through, when `spyOnOutput` built it, or null. */
  readonly output: AudioOutput | null;
  readonly snapshots: readonly RecordedSnapshot[];
  readonly events: readonly RecordedEvent[];
  readonly presented: readonly RecordedPresentation[];
  readonly actions: readonly RecordedAction[];
  readonly answers: readonly RecordedAnswer[];
  readonly schedules: readonly RecordedSchedule[];
  readonly outputCalls: readonly RecordedOutputCall[];
  /** The cause of what happens now. */
  cause(): HarnessCause;
  /** Moves both clocks forward by `durationMs`, running every callback at its own time. */
  advance(durationMs: number): Promise<void>;
}

/**
 * Builds a Visit_Harness (R22.1). The fake backend runs at `harnessSampleRateHz` with
 * `performanceOffsetMs` P and its audio clock at 0, and the manual timer starts at P, so the page
 * clock of the timestamp pair is the timer's clock. Its calibration music loads with
 * `harnessMusicFixture` unless `music` is `reject`.
 *
 * The flow and its shell get a timer that wraps the manual timer and knows the due time of every
 * pending callback, so the harness can move the clocks from one callback to the next. Moving
 * them, it advances the audio clock and the timer by the same amount, stopping at every due
 * callback, and awaits a few resolved promises after each stop so that activations settle.
 */
export function createVisitHarness(options: VisitHarnessOptions): VisitHarness {
  const { performanceOffsetMs } = options;
  const backend = createFakeAudioBackend({
    sampleRateHz: harnessSampleRateHz,
    calibrationMusic:
      options.music === "reject"
        ? { mode: "reject" }
        : { mode: "resolve", samples: harnessMusicFixture },
    ...options.backend,
    performanceOffsetMs,
    startMs: 0,
  });
  const manual = createManualTimer({ startMs: performanceOffsetMs });

  const dueTimes = new Map<TimerHandle, number>();
  const timer: Timer = Object.freeze({
    now: (): number => manual.now(),
    setTimeout(callback: () => void, delayMs: number): TimerHandle {
      const handle = manual.setTimeout(() => {
        dueTimes.delete(handle);
        callback();
      }, delayMs);
      dueTimes.set(handle, manual.now() + delayMs);
      return handle;
    },
    clearTimeout(handle: TimerHandle): void {
      dueTimes.delete(handle);
      manual.clearTimeout(handle);
    },
  });

  let cause: HarnessCause = "timer";
  let flowRef: VisitFlow | null = null;
  const stageNow = (): VisitStage | "creation" =>
    flowRef === null ? "creation" : flowRef.snapshot().stage;

  const schedules: RecordedSchedule[] = [];
  let playingPurpose: PlayRequest["purpose"] | null = null;
  const recordingBackend: AudioBackend = {
    ...backend,
    schedule(channels, startMs) {
      const snapshot = flowRef?.snapshot() ?? null;
      schedules.push(
        Object.freeze({
          atMs: manual.now(),
          stage: snapshot === null ? "entry" : snapshot.stage,
          startMs,
          left: channels.left,
          right: channels.right,
          practice:
            snapshot?.stage === "room" &&
            snapshot.practice?.phase === "practice",
          purpose: playingPurpose,
        }),
      );
      backend.schedule(channels, startMs);
    },
  };

  const outputCalls: RecordedOutputCall[] = [];
  const callBase = () => ({ atMs: manual.now(), stage: stageNow(), cause });
  // The shell is always built here, so that each schedule knows the purpose of its `play` call.
  const shell = createAudioOutput({ backend: recordingBackend, timer });
  const purposeNoting: typeof shell = Object.freeze({
    ...shell,
    play(request: PlayRequest) {
      playingPurpose = request.purpose;
      try {
        return shell.play(request);
      } finally {
        playingPurpose = null;
      }
    },
  });
  let output: AudioOutput | null = null;
  if (options.spyOnOutput === true) {
    const real = purposeNoting;
    output = Object.freeze({
      ...real,
      activate() {
        outputCalls.push(Object.freeze({ ...callBase(), name: "activate" }));
        return real.activate();
      },
      beginRoom(beginOptions?: BeginRoomOptions) {
        outputCalls.push(
          Object.freeze({
            ...callBase(),
            name: "beginRoom",
            riseLimitPer: beginOptions?.riseLimitPer ?? "ear",
          }),
        );
        real.beginRoom(beginOptions);
      },
      playHeadphoneCheck(random: RandomSource) {
        outputCalls.push(
          Object.freeze({ ...callBase(), name: "playHeadphoneCheck" }),
        );
        return real.playHeadphoneCheck(random);
      },
      stopAll() {
        outputCalls.push(Object.freeze({ ...callBase(), name: "stopAll" }));
        real.stopAll();
      },
      play(request: PlayRequest) {
        const base = callBase();
        const outcome = real.play(request);
        outputCalls.push(
          Object.freeze({
            ...base,
            name: "play",
            request: Object.freeze({
              soundId: request.soundId,
              ear: request.ear,
              levelDb: request.levelDb,
              purpose: request.purpose,
            }),
            outcome,
          }),
        );
        return outcome;
      },
      keepCalibration() {
        const base = callBase();
        const outcome = real.keepCalibration();
        outputCalls.push(
          Object.freeze({ ...base, name: "keepCalibration", outcome }),
        );
        return outcome;
      },
    });
  }

  const presented: RecordedPresentation[] = [];
  const presentationListeners = new Set<(trial: FlowPresentedTrial) => void>();
  const onTrialPresented = (trial: FlowPresentedTrial): void => {
    presented.push(Object.freeze({ atMs: manual.now(), trial }));
    for (const listener of [...presentationListeners]) {
      listener(trial);
    }
  };
  const roomsTogetherMaxCount = options.roomsTogetherMaxCount ?? 1;
  const real = createVisitFlow(
    output === null
      ? {
          output: purposeNoting,
          timer,
          seed: options.seed,
          onTrialPresented,
          roomsTogetherMaxCount,
        }
      : {
          output,
          timer,
          seed: options.seed,
          onTrialPresented,
          roomsTogetherMaxCount,
        },
  );
  flowRef = real;

  const snapshots: RecordedSnapshot[] = [];
  const events: RecordedEvent[] = [];
  real.subscribe((snapshot) =>
    snapshots.push(Object.freeze({ atMs: manual.now(), cause, snapshot })),
  );
  real.onEvent((event) =>
    events.push(Object.freeze({ atMs: manual.now(), cause, event })),
  );

  const actions: RecordedAction[] = [];
  const answers: RecordedAnswer[] = [];
  const recorded =
    <Name extends keyof VisitFlow>(name: Name) =>
    (...args: unknown[]): void => {
      const before = real.snapshot();
      actions.push(
        Object.freeze({
          atMs: manual.now(),
          name,
          args: Object.freeze([...args]),
          stageBefore: before.stage,
          pausedBefore: before.pause !== null,
        }),
      );
      if (name === "answer") {
        answers.push(
          Object.freeze({
            atMs: manual.now(),
            side: args[0] as Ear,
            pressedAtMs: args[1] as number | undefined,
            stageBefore: before.stage,
            pausedBefore: before.pause !== null,
          }),
        );
      }
      cause = "action";
      (real[name] as (...callArgs: unknown[]) => void)(...args);
    };
  const flow: VisitFlow = Object.freeze({
    snapshot: () => real.snapshot(),
    subscribe: (listener: (snapshot: VisitSnapshot) => void) =>
      real.subscribe(listener),
    onEvent: (listener: (event: VisitEvent) => void) => real.onEvent(listener),
    chooseVisit: recorded("chooseVisit"),
    startCalibration: recorded("startCalibration"),
    louder: recorded("louder"),
    quieter: recorded("quieter"),
    setCalibrationTarget: recorded("setCalibrationTarget"),
    keepCalibration: recorded("keepCalibration"),
    playHeadphoneCheck: recorded("playHeadphoneCheck"),
    answerHeadphoneCheck: recorded("answerHeadphoneCheck"),
    proceed: recorded("proceed"),
    answer: recorded("answer"),
    pause: recorded("pause"),
    resume: recorded("resume"),
    goOnWithoutPractice: recorded("goOnWithoutPractice"),
    stop: recorded("stop"),
    chooseSwappedRepeat: recorded("chooseSwappedRepeat"),
    startReplay: recorded("startReplay"),
    confirmSwap: recorded("confirmSwap"),
    playSwapCheck: recorded("playSwapCheck"),
    answerSwapCheck: recorded("answerSwapCheck"),
    startSwappedRoom: recorded("startSwappedRoom"),
    backToFrontDoor: recorded("backToFrontDoor"),
  });

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
    cause = "timer";
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

  const fireOutputEvent = async (kind: OutputEventKind): Promise<void> => {
    cause = "stopReport";
    backend.fire(kind);
    await settle();
  };

  return Object.freeze({
    backend,
    timer: manual,
    flow,
    output,
    snapshots,
    events,
    presented,
    actions,
    answers,
    schedules,
    outputCalls,
    cause: () => cause,
    now: () => manual.now(),
    nextDueMs,
    advanceTo,
    advance: (durationMs: number) => advanceTo(manual.now() + durationMs),
    settle,
    fireOutputEvent,
    onTrialPresented(listener: (trial: FlowPresentedTrial) => void) {
      presentationListeners.add(listener);
      return () => {
        presentationListeners.delete(listener);
      };
    },
  });
}

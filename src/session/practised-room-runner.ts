import type { AudioOutputConfig } from "../config/audio-output-config";
import { audioOutputConfig } from "../config/audio-output-config";
import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import type { VisitFlowConfig } from "../config/visit-flow-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type { AudioOutput } from "../audio/output/create-audio-output";
import type {
  Ear,
  SoundOutcome,
  VisitorResponse,
} from "../engine/search-types";
import { answerTimeMs } from "./answer-time";
import type {
  LatestOffset,
  PresentedTrial,
  RoomRunner,
  RoomRunnerState,
} from "./room-runner";
import type { PlayedPractice, VisitLogRecorder } from "./visit-log-recorder";
import type {
  RoomPracticePhase,
  ScoredPracticeTrial,
  VisitRoom,
} from "./visit-flow-types";
import { soundWindowStartMs } from "./window-start";

/** What the practice reads from the config. */
export type PracticeSettings = Pick<
  HearingMethodConfig,
  "responseWindowMs" | "upwardStepDb"
> &
  Pick<AudioOutputConfig, "scheduleLeadMs"> &
  Pick<
    VisitFlowConfig,
    | "refusedPlaysInARowMaxCount"
    | "practiceStartLevelDb"
    | "practiceGapMs"
    | "practiceSoundsPerEarMaxCount"
  >;

const shippedSettings: PracticeSettings = Object.freeze({
  responseWindowMs: hearingMethodConfig.responseWindowMs,
  upwardStepDb: hearingMethodConfig.upwardStepDb,
  scheduleLeadMs: audioOutputConfig.scheduleLeadMs,
  refusedPlaysInARowMaxCount: visitFlowConfig.refusedPlaysInARowMaxCount,
  practiceStartLevelDb: visitFlowConfig.practiceStartLevelDb,
  practiceGapMs: visitFlowConfig.practiceGapMs,
  practiceSoundsPerEarMaxCount: visitFlowConfig.practiceSoundsPerEarMaxCount,
});

/** The ears in the order each practice round plays them. */
const practiceEars: readonly Ear[] = Object.freeze(["left", "right"]);

/**
 * The levels one ear's practice sounds ask for in one round: the start, then one upward step
 * louder each time, none above the room's search cap. Two levels may be the same once the cap is
 * reached. Pure.
 */
export function practiceLevelsDb(
  searchCapDb: number,
  settings: Pick<
    PracticeSettings,
    "practiceStartLevelDb" | "upwardStepDb" | "practiceSoundsPerEarMaxCount"
  > = shippedSettings,
): readonly number[] {
  const start = Math.min(settings.practiceStartLevelDb, searchCapDb);
  return Object.freeze(
    Array.from({ length: settings.practiceSoundsPerEarMaxCount }, (_, index) =>
      Math.min(start + index * settings.upwardStepDb, searchCapDb),
    ),
  );
}

export interface PractisedRoomRunnerOptions {
  readonly output: AudioOutput;
  readonly timer: Timer;
  readonly room: VisitRoom;
  readonly attempt: number;
  readonly soundRandom: RandomSource;
  readonly recorder: VisitLogRecorder;
  readonly latestOffset: LatestOffset;
  /** The loudest level this room's search may ask for. No practice sound asks for more. */
  readonly searchCapDb: number;
  /** The runner of the search, started once the practice ends. */
  readonly counting: RoomRunner;
  /** Called with a decided practice sound's log entry, in the same call that decides it. */
  readonly practiceScored: (entry: ScoredPracticeTrial) => void;
  /** Called once, when the practice ends and the counting begins. */
  readonly countingStarted: () => void;
  /** Called when a round ends with a side that never caught its sound. */
  readonly notHeard: (ears: readonly Ear[]) => void;
  /** As the room runner's: a practice sound was refused because the output is not running. */
  readonly pauseFromOutput: () => void;
  /** As the room runner's: one practice sound was refused too many times in a row. */
  readonly soundRefused: () => void;
  /** The test hook of visit-flow D26. Practice sounds carry `practice: true`. */
  readonly onTrialPresented?: (trial: PresentedTrial) => void;
  readonly settings?: PracticeSettings;
}

/** What the room's screen needs to know of the practice. Never which side a sound is on. */
export interface PracticeState {
  readonly phase: RoomPracticePhase;
  readonly soundPlaying: boolean;
  readonly notHeardEars: readonly Ear[];
}

/** A room runner that practises first. `goOn` ends a not-heard round and starts the counting. */
export interface PractisedRoomRunner extends RoomRunner {
  goOn(): void;
  practice(): PracticeState;
}

interface Pending {
  readonly ear: Ear;
  readonly levelDb: number;
  readonly practiceNumber: number;
}

interface Presented {
  readonly sound: PlayedPractice;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}

/**
 * Creates the runner of one room run that begins with practice (audible-start, light plan of
 * 2026-11-16). Each ear in turn hears the room's sound at `practiceLevelsDb`: the anchor, or the
 * room's cap if that is lower, and one upward step louder after a miss. A caught sound ends that
 * ear's practice and gives a ripple. A round that leaves a side uncaught calls `notHeard`: the flow
 * pauses, `resume` plays a new round for those sides, and `goOn` starts the counting without them.
 * Nothing of practice reaches the search or the trials of the log.
 */
export function createPractisedRoomRunner(
  options: PractisedRoomRunnerOptions,
): PractisedRoomRunner {
  const { output, timer, room, attempt, recorder, latestOffset, counting } =
    options;
  const settings = options.settings ?? shippedSettings;
  const levels = practiceLevelsDb(options.searchCapDb, settings);

  type Phase =
    | "idle"
    | "waitingGap"
    | "presented"
    | "paused"
    | "notHeard"
    | "counting"
    | "finished";
  let phase: Phase = "idle";
  let handle: TimerHandle | null = null;
  let round = 1;
  let practiceNumber = 0;
  /** The ears still to practise this round, the first one under way. */
  let queue: Ear[] = [];
  /** How many sounds the ear under way has heard this round. */
  let soundIndex = 0;
  let missedEars: Ear[] = [];
  let pending: Pending | null = null;
  let presented: Presented | null = null;
  let refusalsInARow = 0;

  const clearTimer = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  const waitGap = (sound: Pending): void => {
    phase = "waitingGap";
    handle = timer.setTimeout(() => {
      handle = null;
      present(sound);
    }, settings.practiceGapMs);
  };

  const beginCounting = (): void => {
    phase = "counting";
    pending = null;
    options.countingStarted();
    counting.start();
  };

  /** Waits for the next practice sound, or ends the round. */
  const next = (): void => {
    const ear = queue[0];
    if (ear === undefined) {
      if (missedEars.length > 0) {
        phase = "notHeard";
        pending = null;
        options.notHeard(Object.freeze([...missedEars]));
        return;
      }
      beginCounting();
      return;
    }
    practiceNumber += 1;
    const levelDb = levels[soundIndex] ?? levels[levels.length - 1] ?? 0;
    pending = { ear, levelDb, practiceNumber };
    waitGap(pending);
  };

  const beginRound = (ears: readonly Ear[]): void => {
    queue = [...ears];
    soundIndex = 0;
    missedEars = [];
    practiceNumber = 0;
    next();
  };

  const present = (sound: Pending): void => {
    const presentedAtMs = timer.now();
    const outcome = output.play({
      soundId: room.roomId,
      ear: sound.ear,
      levelDb: sound.levelDb,
      purpose: "practice",
      random: options.soundRandom,
    });
    if (outcome.kind === "refused") {
      if (outcome.reason === "notRunning") {
        phase = "waitingGap";
        options.pauseFromOutput();
        return;
      }
      recorder.practiceRefused({
        atMs: presentedAtMs,
        roomIndex: room.roomIndex,
        attempt,
        round,
        practiceNumber: sound.practiceNumber,
        reason: outcome.reason,
      });
      refusalsInARow += 1;
      if (refusalsInARow >= settings.refusedPlaysInARowMaxCount) {
        phase = "finished";
        options.soundRefused();
        return;
      }
      waitGap(sound);
      return;
    }
    refusalsInARow = 0;
    const windowStartMs = soundWindowStartMs(
      { startMs: outcome.startMs, pair: output.timestampPair(), presentedAtMs },
      settings,
    );
    latestOffset.latestOffsetMs =
      windowStartMs - (presentedAtMs + settings.scheduleLeadMs);
    const windowEndMs = windowStartMs + settings.responseWindowMs;
    presented = {
      sound: {
        roomIndex: room.roomIndex,
        attempt,
        round,
        practiceNumber: sound.practiceNumber,
        ear: sound.ear,
        requestedLevelDb: sound.levelDb,
        playedLevelDb: outcome.playedLevelDb,
        clampLimit: outcome.clampLimit,
        gapBeforeMs: settings.practiceGapMs,
        presentedAtMs,
        windowStartMs,
      },
      windowStartMs,
      windowEndMs,
    };
    phase = "presented";
    handle = timer.setTimeout(
      () => {
        handle = null;
        decide("none", null);
      },
      Math.max(0, windowEndMs - timer.now()),
    );
    options.onTrialPresented?.(
      Object.freeze({
        kind: "sound",
        ear: sound.ear,
        levelDb: sound.levelDb,
        windowStartMs,
        windowEndMs,
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: sound.practiceNumber,
        practice: true,
      }),
    );
  };

  const decide = (
    response: VisitorResponse,
    answeredAtMs: number | null,
  ): void => {
    const current = presented;
    if (current === null) {
      return;
    }
    clearTimer();
    presented = null;
    const { ear } = current.sound;
    const outcome: SoundOutcome =
      response === ear
        ? "caught"
        : response === "none"
          ? "missed"
          : "wrongSide";
    const entry = recorder.practiceScored(current.sound, {
      response,
      outcome,
      answeredAtMs,
      scoredAtMs: timer.now(),
    });
    if (outcome === "caught") {
      queue.shift();
      soundIndex = 0;
    } else {
      soundIndex += 1;
      if (soundIndex >= levels.length) {
        missedEars.push(ear);
        queue.shift();
        soundIndex = 0;
      }
    }
    // The ripple's event comes before a not-heard pause that the next step may begin.
    options.practiceScored(entry);
    next();
  };

  /** Stops the practice's timer and logs the presented sound, if any, as discarded. */
  const interrupt = (): void => {
    clearTimer();
    if (presented !== null) {
      recorder.practiceDiscarded(presented.sound, timer.now());
      presented = null;
    }
  };

  const runner: PractisedRoomRunner = {
    start() {
      if (phase !== "idle") {
        return;
      }
      beginRound(practiceEars);
    },

    answer(side, pressedAtMs) {
      if (side !== "left" && side !== "right") {
        return;
      }
      if (phase === "counting") {
        counting.answer(side, pressedAtMs);
        return;
      }
      if (phase !== "waitingGap" && phase !== "presented") {
        return;
      }
      const atMs = answerTimeMs(pressedAtMs, timer.now());
      if (
        phase === "presented" &&
        presented !== null &&
        presented.windowStartMs <= atMs &&
        atMs < presented.windowEndMs
      ) {
        decide(side, atMs);
        return;
      }
      recorder.practiceAnswerIgnored({
        atMs,
        side,
        roomIndex: room.roomIndex,
        attempt,
      });
    },

    pause() {
      if (phase === "counting") {
        counting.pause();
        return;
      }
      if (phase !== "waitingGap" && phase !== "presented") {
        return;
      }
      interrupt();
      phase = "paused";
    },

    resume() {
      switch (phase) {
        case "counting":
          counting.resume();
          return;
        case "paused":
          if (pending !== null) {
            waitGap(pending);
          }
          return;
        case "notHeard":
          round += 1;
          beginRound(missedEars);
          return;
        default:
          return;
      }
    },

    goOn() {
      if (phase === "notHeard") {
        beginCounting();
      }
    },

    abandon() {
      if (phase === "finished") {
        return;
      }
      if (phase === "counting") {
        counting.abandon();
      } else {
        interrupt();
      }
      phase = "finished";
    },

    state(): RoomRunnerState {
      switch (phase) {
        case "counting":
          return counting.state();
        case "notHeard":
          return "paused";
        default:
          return phase;
      }
    },

    practice(): PracticeState {
      return Object.freeze({
        phase:
          phase === "notHeard"
            ? "notHeard"
            : phase === "counting" ||
                (phase === "finished" && counting.state() === "finished")
              ? "counting"
              : "practice",
        soundPlaying: phase === "presented",
        notHeardEars: Object.freeze(
          phase === "notHeard" ? [...missedEars] : [],
        ),
      });
    },
  };
  return Object.freeze(runner);
}

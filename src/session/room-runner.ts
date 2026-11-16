import type { AudioOutputConfig } from "../config/audio-output-config";
import { audioOutputConfig } from "../config/audio-output-config";
import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import type { VisitFlowConfig } from "../config/visit-flow-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type { AudioOutput } from "../audio/output/create-audio-output";
import { classifyResponse } from "../engine/classify-response";
import type {
  Ear,
  RoomResult,
  ThresholdSearch,
  Trial,
  VisitorResponse,
} from "../engine/search-types";
import { answerTimeMs } from "./answer-time";
import type { PlayedTrial, VisitLogRecorder } from "./visit-log-recorder";
import type { ScoredVisitTrial, VisitRoom } from "./visit-flow-types";
import { noSoundWindowStartMs, soundWindowStartMs } from "./window-start";

/**
 * What a test listener needs to answer a trial, handed to `onTrialPresented` when the trial's
 * window is set (D26). Times are on the timer's clock. Not part of the interface contract: the
 * interface never sees it.
 */
export interface PresentedTrial {
  readonly kind: "sound" | "noSound";
  /** The ear of a sound trial, or null. */
  readonly ear: Ear | null;
  /** The level the search asked for, or null for a no-sound trial. */
  readonly levelDb: number | null;
  /** The start of the response window. */
  readonly windowStartMs: number;
  /** Its end. An answer at this time is too late. */
  readonly windowEndMs: number;
  readonly roomIndex: number;
  readonly attempt: number;
  readonly trialNumber: number;
  /**
   * True for a practice sound, whose `trialNumber` is its number within its practice round. Absent
   * for a trial of the search.
   */
  readonly practice?: true;
}

/** The latest offset of the visit (D4), shared by every room run of one visit. */
export interface LatestOffset {
  /** `soundWindowStart − (presentedAt + scheduleLeadMs)` of the last scheduled sound, 0 before the first. */
  latestOffsetMs: number;
}

/** What the room runner reads from the config. */
export type RoomRunnerSettings = Pick<HearingMethodConfig, "responseWindowMs"> &
  Pick<AudioOutputConfig, "scheduleLeadMs"> &
  Pick<VisitFlowConfig, "refusedPlaysInARowMaxCount">;

const shippedSettings: RoomRunnerSettings = Object.freeze({
  responseWindowMs: hearingMethodConfig.responseWindowMs,
  scheduleLeadMs: audioOutputConfig.scheduleLeadMs,
  refusedPlaysInARowMaxCount: visitFlowConfig.refusedPlaysInARowMaxCount,
});

export interface RoomRunnerOptions {
  readonly output: AudioOutput;
  readonly timer: Timer;
  /** The threshold search of this room run. */
  readonly search: ThresholdSearch;
  readonly room: VisitRoom;
  /** The run's number: 1, or 2 and up after a device change. */
  readonly attempt: number;
  /** The source the sound renders draw from. */
  readonly soundRandom: RandomSource;
  readonly recorder: VisitLogRecorder;
  readonly latestOffset: LatestOffset;
  /** Called with a decided trial's log entry, in the same call that decides it. */
  readonly scored: (entry: ScoredVisitTrial) => void;
  /** Called when the search has finished, after the last `scored`. */
  readonly finished: (result: RoomResult) => void;
  /** Called when the output stage refused a trial sound because it is not running. */
  readonly pauseFromOutput: () => void;
  /** Called when one trial's sound was refused `refusedPlaysInARowMaxCount` times in a row. */
  readonly soundRefused: () => void;
  /** The test hook of D26. */
  readonly onTrialPresented?: (trial: PresentedTrial) => void;
  readonly settings?: RoomRunnerSettings;
}

export type RoomRunnerState =
  "idle" | "waitingGap" | "presented" | "paused" | "finished";

/** One room run on the timer (visit-flow design.md, "The room runner"). */
export interface RoomRunner {
  /** Waits the first trial's gap. Only acts once, before anything else. */
  start(): void;
  /** The visitor names a side. Decides the presented trial, or is logged as ignored. */
  answer(side: Ear, pressedAtMs?: number): void;
  /** Cancels the gap, or discards the presented trial. The waiting trial stays waiting. */
  pause(): void;
  /** After a pause: waits the waiting trial's own gap again and presents it (D9). */
  resume(): void;
  /** Ends the run without a result: cancels the gap, or discards the presented trial. */
  abandon(): void;
  state(): RoomRunnerState;
}

interface Presentation {
  readonly played: PlayedTrial;
  readonly trial: Trial;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}

/**
 * Creates the runner of one Room_Attempt (R7, R8, R12.3, R12.4, R12.7, R21, D3, D4, D9, D10, D25,
 * D34). It takes the trial the search is waiting on, waits its gap, plays it through the output
 * shell (or plays nothing for a no-sound trial), opens its response window, and decides it at the
 * first answer in the window or with `none` at the window's end. Every wait is on the injected
 * timer and every random number comes from the sources it is given.
 *
 * Between the start of a gap and the decision of its trial it calls nothing that reaches the
 * interface: the only callback that leads to an event is `scored`.
 */
export function createRoomRunner(options: RoomRunnerOptions): RoomRunner {
  const {
    output,
    timer,
    search,
    room,
    attempt,
    soundRandom,
    recorder,
    latestOffset,
  } = options;
  const settings = options.settings ?? shippedSettings;

  let state: RoomRunnerState = "idle";
  let handle: TimerHandle | null = null;
  let presentation: Presentation | null = null;
  let refusalsInARow = 0;

  const clearTimer = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  const waitingTrial = (): Trial | null => {
    const step = search.current();
    return step.kind === "trial" ? step.trial : null;
  };

  const waitGap = (trial: Trial): void => {
    state = "waitingGap";
    handle = timer.setTimeout(() => {
      handle = null;
      present(trial);
    }, trial.gapBeforeMs);
  };

  const present = (trial: Trial): void => {
    const presentedAtMs = timer.now();
    let played: PlayedTrial;
    let windowStartMs: number;
    if (trial.kind === "sound") {
      const outcome = output.play({
        soundId: room.roomId,
        ear: trial.ear,
        levelDb: trial.levelDb,
        purpose: "trial",
        random: soundRandom,
      });
      if (outcome.kind === "refused") {
        if (outcome.reason === "notRunning") {
          // The trial was not played. The flow pauses, and the runner pauses with it.
          state = "waitingGap";
          options.pauseFromOutput();
          return;
        }
        recorder.playRefused({
          atMs: presentedAtMs,
          roomIndex: room.roomIndex,
          attempt,
          trialNumber: trial.trialNumber,
          reason: outcome.reason,
        });
        refusalsInARow += 1;
        if (refusalsInARow >= settings.refusedPlaysInARowMaxCount) {
          state = "finished";
          options.soundRefused();
          return;
        }
        waitGap(trial);
        return;
      }
      refusalsInARow = 0;
      windowStartMs = soundWindowStartMs(
        {
          startMs: outcome.startMs,
          pair: output.timestampPair(),
          presentedAtMs,
        },
        settings,
      );
      latestOffset.latestOffsetMs =
        windowStartMs - (presentedAtMs + settings.scheduleLeadMs);
      played = {
        kind: "sound",
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
        gapBeforeMs: trial.gapBeforeMs,
        presentedAtMs,
        windowStartMs,
        ear: trial.ear,
        requestedLevelDb: trial.levelDb,
        playedLevelDb: outcome.playedLevelDb,
        clampLimit: outcome.clampLimit,
      };
    } else {
      windowStartMs = noSoundWindowStartMs(
        { presentedAtMs, latestOffsetMs: latestOffset.latestOffsetMs },
        settings,
      );
      played = {
        kind: "noSound",
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
        gapBeforeMs: trial.gapBeforeMs,
        presentedAtMs,
        windowStartMs,
      };
    }
    const windowEndMs = windowStartMs + settings.responseWindowMs;
    presentation = { played, trial, windowStartMs, windowEndMs };
    state = "presented";
    handle = timer.setTimeout(
      () => {
        handle = null;
        decide("none", null);
      },
      Math.max(0, windowEndMs - timer.now()),
    );
    options.onTrialPresented?.(
      Object.freeze({
        kind: trial.kind,
        ear: trial.kind === "sound" ? trial.ear : null,
        levelDb: trial.kind === "sound" ? trial.levelDb : null,
        windowStartMs,
        windowEndMs,
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
      }),
    );
  };

  const decide = (
    response: VisitorResponse,
    answeredAtMs: number | null,
  ): void => {
    const current = presentation;
    if (current === null) {
      return;
    }
    clearTimer();
    presentation = null;
    const outcome = classifyResponse(current.trial, response);
    const step = search.respond(response);
    refusalsInARow = 0;
    const entry = recorder.trialScored(current.played, {
      response,
      outcome,
      answeredAtMs,
      scoredAtMs: timer.now(),
    });
    if (step.kind === "finished") {
      state = "finished";
      options.scored(entry);
      options.finished(step.result);
      return;
    }
    waitGap(step.trial);
    options.scored(entry);
  };

  /** Stops the run's timer and logs the presented trial, if any, as discarded (R12.3, R12.4). */
  const interrupt = (): void => {
    clearTimer();
    if (presentation !== null) {
      recorder.trialDiscarded(presentation.played, timer.now());
      presentation = null;
    }
  };

  const runner: RoomRunner = {
    start() {
      if (state !== "idle") {
        return;
      }
      const trial = waitingTrial();
      if (trial === null) {
        throw new Error(
          "A room run cannot start on a search that has finished.",
        );
      }
      waitGap(trial);
    },

    answer(side, pressedAtMs) {
      if (
        (side !== "left" && side !== "right") ||
        state === "idle" ||
        state === "paused" ||
        state === "finished"
      ) {
        return;
      }
      const atMs = answerTimeMs(pressedAtMs, timer.now());
      if (
        state === "presented" &&
        presentation !== null &&
        presentation.windowStartMs <= atMs &&
        atMs < presentation.windowEndMs
      ) {
        decide(side, atMs);
        return;
      }
      recorder.answerIgnored({
        atMs,
        side,
        roomIndex: room.roomIndex,
        attempt,
      });
    },

    pause() {
      if (state !== "waitingGap" && state !== "presented") {
        return;
      }
      interrupt();
      state = "paused";
    },

    resume() {
      if (state !== "paused") {
        return;
      }
      const trial = waitingTrial();
      if (trial === null) {
        state = "finished";
        return;
      }
      waitGap(trial);
    },

    abandon() {
      if (state === "finished") {
        return;
      }
      interrupt();
      state = "finished";
    },

    state: () => state,
  };
  return Object.freeze(runner);
}

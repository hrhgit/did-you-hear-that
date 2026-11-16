import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import { createSeededRandom } from "../config/seeded-random";
import { swappedRepeatConfig } from "../config/swapped-repeat-config";
import type { Timer } from "../config/timer";
import { roomCopy } from "../copy/room-copy";
import { swappedCaughtLine } from "../copy/swapped-repeat-lines";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRefusal,
} from "../audio/output/create-audio-output";
import type { StopReason } from "../audio/output/output-types";
import type { RoomResult } from "../engine/search-types";
import { createThresholdSearch } from "../engine/threshold-search";
import { earpieceOnEar } from "./earpiece-on-ear";
import { judgeSwapCheck } from "./judge-swap-check";
import type { LatestOffset, PresentedTrial, RoomRunner } from "./room-runner";
import { createRoomRunner } from "./room-runner";
import { roomSearchCapDb } from "./room-search-cap";
import { swappedEarpieceOutput } from "./swapped-earpiece-output";
import type { SwappedRepeatOutcomeSettings } from "./swapped-repeat-outcome";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import { swappedRepeatView } from "./swapped-repeat-view";
import type {
  Ear,
  EarpieceState,
  HeadphoneCheckAnswer,
  LoggedSwapCheck,
  RoomSummary,
  ScoredSwappedRepeatTrial,
  ScoredVisitTrial,
  SwapCheckJudgement,
  SwappedRepeat,
  SwappedRepeatEnding,
  SwappedRepeatPauseReason,
  SwappedRepeatPhase,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
  SwappedTrialScoredEvent,
  TrialReaction,
  VisitLog,
  VisitSummary,
} from "./visit-flow-types";
import type { VisitLogRecorder } from "./visit-log-recorder";
import { createVisitLogRecorder } from "./visit-log-recorder";
import { soundWindowStartMs } from "./window-start";

/**
 * What the test hook of the visit flow is given for every presented trial (swapped-repeat R8.7,
 * D24): the room runner's `PresentedTrial` with the earpiece the sound played in and whether it
 * belongs to a swapped repeat. A listener typed for `PresentedTrial` still fits it. Not part of
 * the interface contract.
 */
export interface FlowPresentedTrial extends PresentedTrial {
  /** The earpiece of a sound trial, or null for a no-sound trial. `ear` is the ear it reached. */
  readonly earpiece: Ear | null;
  /** The run number of the swapped repeat the trial belongs to, or null in the rooms of the visit. */
  readonly swappedRepeatRunNumber: number | null;
}

/** What the Repeat_Controller reads from the config: the outcome's settings and the floor of the light's scale. */
export type SwappedRepeatSettings = SwappedRepeatOutcomeSettings &
  Pick<HearingMethodConfig, "floorDb">;

const shippedSettings: SwappedRepeatSettings = Object.freeze({
  differenceLimitDb: hearingMethodConfig.swappedRepeatDifferenceDb,
  unclearBelowDb:
    hearingMethodConfig.swappedRepeatDifferenceDb *
    swappedRepeatConfig.unclearBelowLimitFraction,
  floorDb: hearingMethodConfig.floorDb,
});

export interface SwappedRepeatOptions {
  readonly output: AudioOutput;
  /** The visit's timer: its callbacks run as steps of the flow and stop when the visit is dropped. */
  readonly timer: Timer;
  readonly log: VisitLog;
  readonly summary: VisitSummary;
  readonly roomIndex: number;
  /** The number this repeat's room run will have if it starts. */
  readonly runNumber: number;
  /** The timer's time when the visit began, so that the run's times are on the log's clock. */
  readonly visitStartedAtMs: number;
  /** Null, or why the repeat cannot run (D8). */
  readonly unavailable: SwappedRepeatUnavailableReason | null;
  /** The visit's render source (visit-flow D19). */
  readonly soundRandom: RandomSource;
  /** Draws the engine seed from the visit's source when the room starts. */
  readonly drawEngineSeed: () => number;
  readonly latestOffset: LatestOffset;
  readonly emit: (event: SwappedTrialScoredEvent) => void;
  /** A play was refused `notRunning`: the flow acts as on a stop report with this reason. */
  readonly notRunning: (reason: StopReason) => void;
  /** The run ended with a record. The flow adds it to the visit's list. */
  readonly recorded: (run: SwappedRepeatRun) => void;
  readonly onTrialPresented?: (trial: FlowPresentedTrial) => void;
  /** The outcome's settings and floorDb; the shipped ones by default. */
  readonly settings?: SwappedRepeatSettings;
}

export interface SwappedRepeatController {
  phase(): SwappedRepeatPhase;
  /** Whether a sound of this repeat may be under way: from a scheduled hiss or trial to its end, or a room run that has not ended. */
  mayBeSounding(): boolean;
  view(input: {
    readonly earpieces: EarpieceState;
    readonly pauseReason: SwappedRepeatPauseReason | null;
  }): SwappedRepeat;
  /** instruction → check. */
  confirmSwap(): void;
  /** In `check`, once sound runs: playHeadphoneCheck; sets awaitingAnswer, or the refusal. */
  playCheck(): void;
  /** In `check` with a check waiting: judges it, adds it to the list; gives the judgement, or null when ignored. */
  answerCheck(answer: HeadphoneCheckAnswer): SwapCheckJudgement | null;
  /** A hidden page or an interruption in `check`: the waiting check counts as not played. */
  checkCut(): void;
  /** ready → room, once sound runs: beginRoom, the engine seed, the recorder, the runner, start. */
  startRoom(): void;
  answer(side: Ear, pressedAtMs?: number): void;
  /** In `room`: the runner pauses (discarding a presented trial), the pause is written to the run's recorder. Returns whether it paused. */
  pause(reason: SwappedRepeatPauseReason): boolean;
  /** After the pause: ends it in the run's recorder; with a calibration the runner resumes, without one `finished` with deviceChanged. */
  resume(): void;
  /** The calibration is gone: before the room → unavailable, calibrationGone; in the room → the run is abandoned, finished, deviceChanged. */
  calibrationGone(): void;
  /** The stage is being left: cancels every timer; a run under way is abandoned and gives no record. */
  leave(): void;
}

const swapCheckAnswers: readonly unknown[] = Object.freeze([
  "left",
  "right",
  "bothSides",
  "nothingHeard",
]);

/** What the interface shows at once for a decided trial, as in every room (R16.3). */
function reactionTo(entry: ScoredVisitTrial): TrialReaction {
  if (entry.kind === "sound" && entry.outcome === "caught") {
    return "ripple";
  }
  if (entry.kind === "noSound" && entry.outcome === "falseAlarm") {
    return "noSoundLine";
  }
  return "none";
}

/** The calibration of the floor's first run: that of its last finished attempt in the log. */
function firstRunCalibrationIndex(log: VisitLog, roomIndex: number): number {
  const attempt = log.roomAttempts
    .filter(
      (entry) => entry.roomIndex === roomIndex && entry.ending === "finished",
    )
    .at(-1);
  if (attempt === undefined) {
    throw new Error(
      `Floor ${String(roomIndex)} has no finished run to repeat.`,
    );
  }
  return attempt.calibrationIndex;
}

/**
 * Creates the Repeat_Controller of one visit to the swapped repeat (swapped-repeat design.md, "The
 * Repeat_Controller", R3 to R11, R14, R15, D2, D3, D6 to D9, D11, D13, D14, D22). It opens in
 * `instruction`, or in `unavailable` when the flow found the floor's calibration gone or changed,
 * and moves through the check, `ready` and the room to `finished` on the calls of the flow.
 *
 * It plays the swap check only through `output.playHeadphoneCheck`, in the left earpiece, and the
 * room only through `createRoomRunner` on `swappedEarpieceOutput(output)`, so each trial of an ear
 * plays in the other earpiece. The room's search is created as the flow creates every room's, from
 * `hearingMethodConfig` with the cap `roomSearchCapDb` of the room's top, which must equal the first
 * run's; the engine seed is `drawEngineSeed()`. The run is recorded on its own `VisitLogRecorder`,
 * on the visit log's clock, and nothing is written to the visit log. It reads time only through the
 * timer it is given and adds no number of its own.
 *
 * It has no part in gestures, the snapshot's pause field, the earpiece state or the stage, which
 * stay in the flow.
 */
export function createSwappedRepeat(
  options: SwappedRepeatOptions,
): SwappedRepeatController {
  const { output, timer, log, summary, roomIndex, runNumber } = options;
  const settings = options.settings ?? shippedSettings;
  const outcomeSettings: SwappedRepeatOutcomeSettings = {
    differenceLimitDb: settings.differenceLimitDb,
    unclearBelowDb: settings.unclearBelowDb,
  };
  const roomSummary: RoomSummary | undefined = summary.rooms[roomIndex];
  if (roomSummary === undefined) {
    throw new RangeError(`The visit has no floor ${String(roomIndex)}.`);
  }
  const { room } = roomSummary;
  const earpieces = earpieceOnEar("swapped");

  let phase: SwappedRepeatPhase =
    options.unavailable === null ? "instruction" : "unavailable";
  let unavailable: SwappedRepeatUnavailableReason | null = options.unavailable;
  let again = false;
  let awaitingAnswer = false;
  let playRefusal: PlayRefusal | null = null;
  let judgement: SwapCheckJudgement | null = null;
  let cut = false;
  let ending: SwappedRepeatEnding | null = null;
  let record: SwappedRepeatRun | null = null;
  /** True once the stage has been left: nothing acts any more. */
  let stageLeft = false;
  const swapChecks: LoggedSwapCheck[] = [];
  let recorder: VisitLogRecorder | null = null;
  let runner: RoomRunner | null = null;
  let attempt = 0;
  let pauseOpen = false;
  /** The page-clock end of the last scheduled hiss or trial sound, or null once none may play. */
  let soundEndsAtMs: number | null = null;

  /** The shell's stop reason, or `interrupted` when it gives none or `control`, as the room runner's flow does. */
  const stopReasonOfShell = (): StopReason => {
    const state = output.state();
    return state.kind === "stopped" && state.reason !== "control"
      ? state.reason
      : "interrupted";
  };

  /** Notes the end of a scheduled sound on the page clock, as the replay puts a sound's end. */
  const noteSoundEnd = (outcome: PlayOutcome, askedAtMs: number): void => {
    if (outcome.kind !== "scheduled") {
      return;
    }
    const startAtMs = soundWindowStartMs({
      startMs: outcome.startMs,
      pair: output.timestampPair(),
      presentedAtMs: askedAtMs,
    });
    soundEndsAtMs = startAtMs + (outcome.endMs - outcome.startMs);
  };

  /** Set when a trial sound was refused `notCalibrated`: the calibration is gone (R15.3). */
  let trialRefusedNotCalibrated = false;

  /**
   * The swapped view of the output, which also notes when each trial sound ends. The room runner
   * retries every refusal but `notRunning`; a trial refused `notCalibrated` ends the room with
   * `deviceChanged` instead (R15.3). So that refusal reaches the runner as `notRunning`, which
   * leaves the trial waiting with no timer and calls `pauseFromOutput`, where the run ends.
   */
  const swappedOutput = swappedEarpieceOutput(output);
  const runnerOutput: AudioOutput = Object.freeze({
    ...swappedOutput,
    play: (request) => {
      const askedAtMs = timer.now();
      const outcome = swappedOutput.play(request);
      if (outcome.kind === "refused" && outcome.reason === "notCalibrated") {
        trialRefusedNotCalibrated = true;
        return Object.freeze({ kind: "refused", reason: "notRunning" });
      }
      noteSoundEnd(outcome, askedAtMs);
      return outcome;
    },
  } satisfies AudioOutput);

  const clearCheck = (): void => {
    awaitingAnswer = false;
    playRefusal = null;
    judgement = null;
    cut = false;
  };

  const finish = (how: SwappedRepeatEnding): void => {
    phase = "finished";
    ending = how;
  };

  /** Ends the run without a record: the runner abandons, an open pause closes, the attempt ends `abandoned`. */
  const abandonRun = (): void => {
    runner?.abandon();
    if (recorder !== null) {
      if (pauseOpen) {
        recorder.pauseEnded(timer.now());
        pauseOpen = false;
      }
      recorder.attemptEnded({
        roomIndex,
        attempt,
        endedAtMs: timer.now(),
        ending: "abandoned",
        result: null,
      });
    }
    runner = null;
    recorder = null;
  };

  const scoredTrialOf = (entry: ScoredVisitTrial): ScoredSwappedRepeatTrial =>
    Object.freeze({
      ...entry,
      earpiece: entry.kind === "sound" ? earpieces[entry.ear] : null,
      responseEarpiece:
        entry.response === "none" ? null : earpieces[entry.response],
    });

  const lineOf = (
    trial: ScoredSwappedRepeatTrial,
    reaction: TrialReaction,
  ): string | null => {
    if (reaction === "ripple" && trial.kind === "sound") {
      return swappedCaughtLine(
        trial.ear,
        earpieces[trial.ear],
        room.frequencyHz,
        trial.playedLevelDb,
      );
    }
    if (reaction === "noSoundLine") {
      return roomCopy.noSoundLine;
    }
    return null;
  };

  const roomFinished =
    (runRecorder: VisitLogRecorder) =>
    (result: RoomResult): void => {
      runRecorder.attemptEnded({
        roomIndex,
        attempt,
        endedAtMs: timer.now(),
        ending: "finished",
        result,
      });
      runner = null;
      recorder = null;
      record = swappedRepeatRunOf({
        runNumber,
        runLog: runRecorder.log(),
        swapChecks,
        firstRun: roomSummary,
        outcomeSettings,
      });
      finish("finished");
      options.recorded(record);
    };

  const calibrationGone = (): void => {
    if (stageLeft) {
      return;
    }
    switch (phase) {
      case "instruction":
      case "check":
      case "ready":
        clearCheck();
        again = false;
        soundEndsAtMs = null;
        phase = "unavailable";
        unavailable = "calibrationGone";
        return;
      case "room":
        abandonRun();
        soundEndsAtMs = null;
        finish("deviceChanged");
        return;
      default:
        return;
    }
  };

  const controller: SwappedRepeatController = {
    phase: () => phase,

    mayBeSounding() {
      if (stageLeft) {
        return false;
      }
      if (runner !== null && runner.state() !== "finished") {
        return true;
      }
      return soundEndsAtMs !== null && timer.now() < soundEndsAtMs;
    },

    view: ({ earpieces: earpieceState, pauseReason }) =>
      swappedRepeatView({
        roomSummary,
        phase,
        earpieces: earpieceState,
        unavailable,
        again,
        awaitingAnswer,
        playRefusal,
        judgement,
        cut,
        runNumber,
        pauseReason,
        ending,
        record,
        floorDb: settings.floorDb,
      }),

    confirmSwap() {
      if (stageLeft || phase !== "instruction") {
        return;
      }
      again = false;
      clearCheck();
      phase = "check";
    },

    playCheck() {
      if (stageLeft || phase !== "check") {
        return;
      }
      const askedAtMs = timer.now();
      const outcome = output.playHeadphoneCheck(options.soundRandom);
      if (outcome.kind === "refused") {
        switch (outcome.reason) {
          case "notRunning":
            options.notRunning(stopReasonOfShell());
            return;
          case "notCalibrated":
            calibrationGone();
            return;
          default:
            // Nothing is counted; the visitor may press again (R5.2, R15.5).
            playRefusal = outcome.reason;
            return;
        }
      }
      noteSoundEnd(outcome, askedAtMs);
      awaitingAnswer = true;
      playRefusal = null;
      judgement = null;
      cut = false;
    },

    answerCheck(answer) {
      if (
        stageLeft ||
        phase !== "check" ||
        !awaitingAnswer ||
        !swapCheckAnswers.includes(answer)
      ) {
        return null;
      }
      const judged = judgeSwapCheck(answer);
      swapChecks.push(
        Object.freeze({
          answer,
          judgement: judged,
          earpiece: "left",
          answeredAtMs: timer.now() - options.visitStartedAtMs,
        }),
      );
      awaitingAnswer = false;
      playRefusal = null;
      switch (judged) {
        case "confirmed":
          judgement = null;
          phase = "ready";
          break;
        case "notSwapped":
          judgement = null;
          again = true;
          phase = "instruction";
          break;
        default:
          judgement = judged;
          break;
      }
      return judged;
    },

    checkCut() {
      if (stageLeft || phase !== "check" || !awaitingAnswer) {
        return;
      }
      awaitingAnswer = false;
      cut = true;
      soundEndsAtMs = null;
    },

    startRoom() {
      if (stageLeft || phase !== "ready") {
        return;
      }
      // The rise limit starts afresh after the last swap check (R17.4).
      output.beginRoom();
      const report = output.rangeReport();
      if (report === null) {
        calibrationGone();
        return;
      }
      const searchCapDb = roomSearchCapDb(
        report.rooms[room.roomId].topLevelDb,
        hearingMethodConfig,
      );
      if (searchCapDb !== roomSummary.searchCapDb) {
        throw new Error(
          `The repeat's search cap ${String(searchCapDb)} dB differs from the first run's ${String(roomSummary.searchCapDb)} dB.`,
        );
      }
      const calibrationIndex = firstRunCalibrationIndex(log, roomIndex);
      const engineSeed = options.drawEngineSeed();
      const runRecorder = createVisitLogRecorder({
        visitType: log.visitType,
        visitSeed: log.visitSeed,
        rooms: log.rooms,
        startedAtMs: options.visitStartedAtMs,
      });
      attempt = runRecorder.attemptStarted({
        roomIndex,
        engineSeed,
        calibrationIndex,
        searchCapDb,
        startedAtMs: timer.now(),
      });
      const search = createThresholdSearch({
        settings: {
          ...hearingMethodConfig,
          capRelativeToAnchorDb: searchCapDb,
        },
        random: createSeededRandom(engineSeed),
      });
      const onTrialPresented = options.onTrialPresented;
      recorder = runRecorder;
      runner = createRoomRunner({
        output: runnerOutput,
        timer,
        search,
        room,
        attempt,
        soundRandom: options.soundRandom,
        recorder: runRecorder,
        latestOffset: options.latestOffset,
        scored: (entry) => {
          const trial = scoredTrialOf(entry);
          const reaction = reactionTo(entry);
          options.emit(
            Object.freeze({
              kind: "swappedTrialScored",
              room,
              runNumber,
              trial,
              reaction,
              line: lineOf(trial, reaction),
            }),
          );
        },
        finished: roomFinished(runRecorder),
        pauseFromOutput: () => {
          if (trialRefusedNotCalibrated) {
            trialRefusedNotCalibrated = false;
            calibrationGone();
            return;
          }
          options.notRunning(stopReasonOfShell());
        },
        soundRefused: () => {
          output.stopAll();
          soundEndsAtMs = null;
          abandonRun();
          finish("soundRefused");
        },
        ...(onTrialPresented === undefined
          ? {}
          : {
              onTrialPresented: (trial: PresentedTrial) =>
                onTrialPresented(
                  Object.freeze({
                    ...trial,
                    earpiece: trial.ear === null ? null : earpieces[trial.ear],
                    swappedRepeatRunNumber: runNumber,
                  }),
                ),
            }),
      });
      phase = "room";
      runner.start();
    },

    answer(side, pressedAtMs) {
      if (stageLeft || phase !== "room" || pauseOpen) {
        return;
      }
      runner?.answer(side, pressedAtMs);
    },

    pause(reason) {
      if (
        stageLeft ||
        phase !== "room" ||
        pauseOpen ||
        runner === null ||
        recorder === null
      ) {
        return false;
      }
      const state = runner.state();
      if (state !== "waitingGap" && state !== "presented") {
        return false;
      }
      runner.pause();
      recorder.pauseStarted({
        reason,
        stage: "swappedRepeat",
        roomIndex,
        startedAtMs: timer.now(),
      });
      pauseOpen = true;
      // The flow stops every sound now, or the shell has already stopped (R14.3, R14.4).
      soundEndsAtMs = null;
      return true;
    },

    resume() {
      if (stageLeft || phase !== "room" || !pauseOpen || recorder === null) {
        return;
      }
      recorder.pauseEnded(timer.now());
      pauseOpen = false;
      if (output.rangeReport() === null) {
        abandonRun();
        finish("deviceChanged");
        return;
      }
      runner?.resume();
    },

    calibrationGone,

    leave() {
      if (stageLeft) {
        return;
      }
      if (runner !== null) {
        abandonRun();
      }
      stageLeft = true;
      soundEndsAtMs = null;
    },
  };
  return Object.freeze(controller);
}

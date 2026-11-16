import type { VisitType } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import type { PlayRefusal } from "../audio/output/create-audio-output";
import type { ClampLimit } from "../audio/output/output-types";
import type {
  Ear,
  NoSoundOutcome,
  SoundOutcome,
  VisitorResponse,
} from "../engine/search-types";
import type {
  HeadphoneCheckAnswer,
  HeadphoneCheckJudgement,
} from "./judge-headphone-check";
import type {
  CalibrationAnchor,
  LoggedCalibration,
  LoggedEarResult,
  LoggedHeadphoneCheck,
  LoggedIgnoredAnswer,
  LoggedPause,
  LoggedRefusedPlay,
  LoggedRoomAttempt,
  LoggedRoomResult,
  PauseReason,
  DiscardedPracticeTrial,
  LoggedPracticeRefusedPlay,
  PracticeTrial,
  ScoredPracticeTrial,
  ScoredVisitTrial,
  DiscardedVisitTrial,
  VisitLog,
  VisitRoom,
  VisitStage,
  VisitTrial,
} from "./visit-flow-types";

/**
 * A trial that was played, as the room runner knows it. Every time is on the timer's clock, not
 * yet relative to the visit's start.
 */
export type PlayedTrial = {
  readonly roomIndex: number;
  readonly attempt: number;
  readonly trialNumber: number;
  readonly gapBeforeMs: number;
  readonly presentedAtMs: number;
  readonly windowStartMs: number;
} & (
  | {
      readonly kind: "sound";
      readonly ear: Ear;
      readonly requestedLevelDb: number;
      readonly playedLevelDb: number;
      readonly clampLimit: ClampLimit | null;
    }
  | { readonly kind: "noSound" }
);

/** A practice sound that was played, as the practice knows it. Times on the timer's clock. */
export interface PlayedPractice {
  readonly roomIndex: number;
  readonly attempt: number;
  readonly round: number;
  readonly practiceNumber: number;
  readonly ear: Ear;
  readonly requestedLevelDb: number;
  readonly playedLevelDb: number;
  readonly clampLimit: ClampLimit | null;
  readonly gapBeforeMs: number;
  readonly presentedAtMs: number;
  readonly windowStartMs: number;
}

/** How a played trial was decided. Times are on the timer's clock. */
export interface TrialDecision {
  readonly response: VisitorResponse;
  readonly outcome: SoundOutcome | NoSoundOutcome;
  /** When the deciding answer was pressed, or null for none. */
  readonly answeredAtMs: number | null;
  /** When the trial was decided. */
  readonly scoredAtMs: number;
}

/** Builds the visit log of one visit (visit-flow design.md, "The visit log"). */
export interface VisitLogRecorder {
  /** Records a kept calibration and returns its entry, whose index is its position from 0. */
  calibrationKept(input: {
    readonly settingDb: number;
    readonly roomTopLevelDb: Readonly<Record<GhostSoundId, number>>;
    readonly keptAtMs: number;
    /**
     * How the anchor was set (audible-start R8.4). The flow always gives it; a calibration recorded
     * without it reads as one matched to the visitor's hands, as before the audible-start spec.
     */
    readonly anchor?: Exclude<CalibrationAnchor, "hands">;
    /**
     * The Playable_Floor of every ghost room with this calibration (audible-start R12.3). The flow
     * always gives it; a calibration recorded without it has none, as before the audible-start spec.
     */
    readonly roomFloorLevelDb?: Readonly<Record<GhostSoundId, number>>;
  }): LoggedCalibration;
  /** Records an answered headphone check. */
  headphoneCheckAnswered(input: {
    readonly calibrationIndex: number;
    readonly answer: HeadphoneCheckAnswer;
    readonly judgement: HeadphoneCheckJudgement;
    readonly answeredAtMs: number;
  }): LoggedHeadphoneCheck;
  /** Opens a run of a room's search and returns its attempt number: 1, then 2 and up. */
  attemptStarted(input: {
    readonly roomIndex: number;
    readonly engineSeed: number;
    readonly calibrationIndex: number;
    readonly searchCapDb: number;
    /**
     * The quietest level the run's search can ask for, its Search_Floor (audible-start R12.5).
     * Every room run gives it; a run recorded without it has none, as before the audible-start spec.
     */
    readonly searchFloorDb?: number;
    readonly startedAtMs: number;
  }): number;
  /**
   * Closes the open run of a room. A finished run takes the search's room result, of which only
   * the fields of `LoggedRoomResult` are kept; an abandoned run takes null.
   */
  attemptEnded(
    input: {
      readonly roomIndex: number;
      readonly attempt: number;
      readonly endedAtMs: number;
    } & (
      | { readonly ending: "finished"; readonly result: LoggedRoomResult }
      | { readonly ending: "abandoned"; readonly result: null }
    ),
  ): LoggedRoomAttempt;
  /**
   * Records a played trial that was decided, with the next `order`. Throws a `TypeError` for an
   * outcome that does not fit the trial's kind.
   */
  trialScored(trial: PlayedTrial, decision: TrialDecision): ScoredVisitTrial;
  /** Records a played trial that was not decided, with the next `order`. */
  trialDiscarded(
    trial: PlayedTrial,
    discardedAtMs: number,
  ): DiscardedVisitTrial;
  /** Records an answer in a room that decided no trial. */
  answerIgnored(input: {
    readonly atMs: number;
    readonly side: Ear;
    readonly roomIndex: number;
    readonly attempt: number;
  }): LoggedIgnoredAnswer;
  /** Opens a pause. Only one pause is open at a time. */
  pauseStarted(input: {
    readonly reason: PauseReason;
    readonly stage: VisitStage;
    readonly roomIndex: number | null;
    readonly startedAtMs: number;
  }): void;
  /** Replaces the reason of the open pause, as a device change during a pause does. */
  pauseReasonChanged(reason: PauseReason): void;
  /** Closes the open pause. */
  pauseEnded(endedAtMs: number): LoggedPause;
  /** Records a sound the output stage would not play. */
  playRefused(input: {
    readonly atMs: number;
    readonly roomIndex: number;
    readonly attempt: number;
    readonly trialNumber: number;
    readonly reason: PlayRefusal;
  }): LoggedRefusedPlay;
  /** Records a practice sound that was decided, with the next practice `order`. */
  practiceScored(
    sound: PlayedPractice,
    decision: {
      readonly response: VisitorResponse;
      readonly outcome: SoundOutcome;
      readonly answeredAtMs: number | null;
      readonly scoredAtMs: number;
    },
  ): ScoredPracticeTrial;
  /** Records a practice sound that was not decided, with the next practice `order`. */
  practiceDiscarded(
    sound: PlayedPractice,
    discardedAtMs: number,
  ): DiscardedPracticeTrial;
  /** Records an answer during practice that decided no practice sound. */
  practiceAnswerIgnored(input: {
    readonly atMs: number;
    readonly side: Ear;
    readonly roomIndex: number;
    readonly attempt: number;
  }): LoggedIgnoredAnswer;
  /** Records a practice sound the output stage would not play. */
  practiceRefused(input: {
    readonly atMs: number;
    readonly roomIndex: number;
    readonly attempt: number;
    readonly round: number;
    readonly practiceNumber: number;
    readonly reason: PlayRefusal;
  }): LoggedPracticeRefusedPlay;
  /**
   * The visit log so far: frozen, with copies of the lists, so later entries do not change a log
   * already returned. Throws while a room run or a pause is still open (D28).
   */
  log(): VisitLog;
}

const soundOutcomes: readonly string[] = ["caught", "wrongSide", "missed"];
const noSoundOutcomes: readonly string[] = ["falseAlarm", "noResponse"];

/**
 * A finite number as plain data: -0 becomes 0, which JSON writes and reads back the same. Throws a
 * `RangeError` for anything else, so the log never holds NaN or Infinity (R10.7).
 */
function plainNumber(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(
      `The visit log needs a finite number for ${name}, but got ${String(value)}.`,
    );
  }
  return value + 0;
}

function plainOrNull(name: string, value: number | null): number | null {
  return value === null ? null : plainNumber(name, value);
}

function copyEarResult(result: LoggedEarResult): LoggedEarResult {
  const counts = {
    presentationCount: plainNumber(
      "presentationCount",
      result.presentationCount,
    ),
    catchCount: plainNumber("catchCount", result.catchCount),
    wrongSideCount: plainNumber("wrongSideCount", result.wrongSideCount),
    missCount: plainNumber("missCount", result.missCount),
  };
  switch (result.state) {
    case "found":
      return Object.freeze({
        ...counts,
        state: "found",
        thresholdDb: plainNumber("thresholdDb", result.thresholdDb),
      });
    case "betterThanFloor":
      return Object.freeze({ ...counts, state: "betterThanFloor" });
    case "worseThanCap":
      return Object.freeze({ ...counts, state: "worseThanCap" });
    case "unreliable":
      return Object.freeze({
        ...counts,
        state: "unreliable",
        reasons: Object.freeze([...result.reasons]),
      });
  }
}

/** The fields of `LoggedRoomResult` only, so a room result's trial records are left out. */
function copyRoomResult(result: LoggedRoomResult): LoggedRoomResult {
  return Object.freeze({
    left: copyEarResult(result.left),
    right: copyEarResult(result.right),
    noSoundTrialCount: plainNumber(
      "noSoundTrialCount",
      result.noSoundTrialCount,
    ),
    falseAlarmCount: plainNumber("falseAlarmCount", result.falseAlarmCount),
    falseAlarmRateFraction: plainNumber(
      "falseAlarmRateFraction",
      result.falseAlarmRateFraction,
    ),
    falseAlarmRateAboveLimit: result.falseAlarmRateAboveLimit,
  });
}

interface OpenAttempt {
  readonly roomIndex: number;
  readonly attempt: number;
  readonly engineSeed: number;
  readonly calibrationIndex: number;
  readonly searchCapDb: number;
  readonly startedAtMs: number;
  readonly searchFloorDb?: number;
}

interface OpenPause {
  reason: PauseReason;
  readonly stage: VisitStage;
  readonly roomIndex: number | null;
  readonly startedAtMs: number;
}

/**
 * Creates the recorder of one visit's log (R10, D10, D28). Every method makes a frozen entry of
 * plain data with times relative to `startedAtMs`, the moment the visit began. `trialScored` and
 * `trialDiscarded` number the played trials together from 1, in the order they are recorded.
 */
export function createVisitLogRecorder(options: {
  readonly visitType: VisitType;
  readonly visitSeed: number;
  readonly rooms: readonly VisitRoom[];
  readonly startedAtMs: number;
}): VisitLogRecorder {
  const visitStartMs = plainNumber("startedAtMs", options.startedAtMs);
  const rooms = Object.freeze(
    options.rooms.map((room) =>
      Object.freeze({
        roomIndex: room.roomIndex,
        roomId: room.roomId,
        frequencyHz: room.frequencyHz,
      }),
    ),
  );
  const visitSeed = plainNumber("visitSeed", options.visitSeed);

  const calibrations: LoggedCalibration[] = [];
  const headphoneChecks: LoggedHeadphoneCheck[] = [];
  /** Every run in start order: a logged entry once closed, the open run before. */
  const attempts: (LoggedRoomAttempt | OpenAttempt)[] = [];
  const openAttempts = new Map<number, OpenAttempt>();
  const trials: VisitTrial[] = [];
  const ignoredAnswers: LoggedIgnoredAnswer[] = [];
  const pauses: LoggedPause[] = [];
  let openPause: OpenPause | null = null;
  const refusedPlays: LoggedRefusedPlay[] = [];
  const practiceTrials: PracticeTrial[] = [];
  const practiceIgnoredAnswers: LoggedIgnoredAnswer[] = [];
  const practiceRefusedPlays: LoggedPracticeRefusedPlay[] = [];

  const sinceStart = (name: string, atMs: number): number =>
    plainNumber(name, atMs) - visitStartMs + 0;

  const trialCommon = (trial: PlayedTrial) => ({
    order: trials.length + 1,
    roomIndex: plainNumber("roomIndex", trial.roomIndex),
    attempt: plainNumber("attempt", trial.attempt),
    trialNumber: plainNumber("trialNumber", trial.trialNumber),
    gapBeforeMs: plainNumber("gapBeforeMs", trial.gapBeforeMs),
    presentedAtMs: sinceStart("presentedAtMs", trial.presentedAtMs),
    windowStartMs: sinceStart("windowStartMs", trial.windowStartMs),
  });

  const practiceCommon = (sound: PlayedPractice) => ({
    order: practiceTrials.length + 1,
    roomIndex: plainNumber("roomIndex", sound.roomIndex),
    attempt: plainNumber("attempt", sound.attempt),
    round: plainNumber("round", sound.round),
    practiceNumber: plainNumber("practiceNumber", sound.practiceNumber),
    ear: sound.ear,
    requestedLevelDb: plainNumber("requestedLevelDb", sound.requestedLevelDb),
    playedLevelDb: plainNumber("playedLevelDb", sound.playedLevelDb),
    clampLimit: sound.clampLimit,
    gapBeforeMs: plainNumber("gapBeforeMs", sound.gapBeforeMs),
    presentedAtMs: sinceStart("presentedAtMs", sound.presentedAtMs),
    windowStartMs: sinceStart("windowStartMs", sound.windowStartMs),
  });

  const ignoredAnswerOf = (input: {
    readonly atMs: number;
    readonly side: Ear;
    readonly roomIndex: number;
    readonly attempt: number;
  }): LoggedIgnoredAnswer =>
    Object.freeze({
      atMs: sinceStart("atMs", input.atMs),
      side: input.side,
      roomIndex: plainNumber("roomIndex", input.roomIndex),
      attempt: plainNumber("attempt", input.attempt),
    });

  const soundPart = (trial: PlayedTrial) =>
    trial.kind === "sound"
      ? {
          kind: "sound" as const,
          ear: trial.ear,
          requestedLevelDb: plainNumber(
            "requestedLevelDb",
            trial.requestedLevelDb,
          ),
          playedLevelDb: plainNumber("playedLevelDb", trial.playedLevelDb),
          clampLimit: trial.clampLimit,
        }
      : {
          kind: "noSound" as const,
          ear: null,
          requestedLevelDb: null,
          playedLevelDb: null,
          clampLimit: null,
        };

  const recorder: VisitLogRecorder = {
    calibrationKept(input) {
      const roomTopLevelDb = Object.freeze(
        Object.fromEntries(
          ghostSoundIds.map((soundId) => [
            soundId,
            plainNumber(
              `roomTopLevelDb.${soundId}`,
              input.roomTopLevelDb[soundId],
            ),
          ]),
        ) as Record<GhostSoundId, number>,
      );
      const { anchor } = input;
      if (anchor !== undefined && anchor !== "music" && anchor !== "hiss") {
        throw new RangeError(
          `A calibration's anchor is music or hiss, but got ${String(anchor)}.`,
        );
      }
      const floors = input.roomFloorLevelDb;
      const roomFloorLevelDb =
        floors === undefined
          ? undefined
          : Object.freeze(
              Object.fromEntries(
                ghostSoundIds.map((soundId) => [
                  soundId,
                  plainNumber(`roomFloorLevelDb.${soundId}`, floors[soundId]),
                ]),
              ) as Record<GhostSoundId, number>,
            );
      const entry: LoggedCalibration = Object.freeze({
        calibrationIndex: calibrations.length,
        settingDb: plainNumber("settingDb", input.settingDb),
        roomTopLevelDb,
        keptAtMs: sinceStart("keptAtMs", input.keptAtMs),
        ...(anchor === undefined ? {} : { anchor }),
        ...(roomFloorLevelDb === undefined ? {} : { roomFloorLevelDb }),
      });
      calibrations.push(entry);
      return entry;
    },

    headphoneCheckAnswered(input) {
      const entry: LoggedHeadphoneCheck = Object.freeze({
        calibrationIndex: plainNumber(
          "calibrationIndex",
          input.calibrationIndex,
        ),
        answer: input.answer,
        judgement: input.judgement,
        answeredAtMs: sinceStart("answeredAtMs", input.answeredAtMs),
      });
      headphoneChecks.push(entry);
      return entry;
    },

    attemptStarted(input) {
      if (openAttempts.has(input.roomIndex)) {
        throw new Error(
          `Room ${String(input.roomIndex)} already has a run that has not ended.`,
        );
      }
      const attempt =
        attempts.filter((entry) => entry.roomIndex === input.roomIndex).length +
        1;
      const open: OpenAttempt = Object.freeze({
        roomIndex: plainNumber("roomIndex", input.roomIndex),
        attempt,
        engineSeed: plainNumber("engineSeed", input.engineSeed),
        calibrationIndex: plainNumber(
          "calibrationIndex",
          input.calibrationIndex,
        ),
        searchCapDb: plainNumber("searchCapDb", input.searchCapDb),
        startedAtMs: sinceStart("startedAtMs", input.startedAtMs),
        ...(input.searchFloorDb === undefined
          ? {}
          : {
              searchFloorDb: plainNumber("searchFloorDb", input.searchFloorDb),
            }),
      });
      attempts.push(open);
      openAttempts.set(open.roomIndex, open);
      return attempt;
    },

    attemptEnded(input) {
      const open = openAttempts.get(input.roomIndex);
      if (open === undefined || open.attempt !== input.attempt) {
        throw new Error(
          `Run ${String(input.attempt)} of room ${String(input.roomIndex)} is not open.`,
        );
      }
      const entry: LoggedRoomAttempt = Object.freeze({
        ...open,
        endedAtMs: sinceStart("endedAtMs", input.endedAtMs),
        ending: input.ending,
        result: input.result === null ? null : copyRoomResult(input.result),
      });
      attempts[attempts.indexOf(open)] = entry;
      openAttempts.delete(input.roomIndex);
      return entry;
    },

    trialScored(trial, decision) {
      const fits =
        trial.kind === "sound"
          ? soundOutcomes.includes(decision.outcome)
          : noSoundOutcomes.includes(decision.outcome);
      if (!fits) {
        throw new TypeError(
          `A ${trial.kind} trial cannot have the outcome ${String(decision.outcome)}.`,
        );
      }
      const common = trialCommon(trial);
      const answeredAtMs =
        decision.answeredAtMs === null
          ? null
          : sinceStart("answeredAtMs", decision.answeredAtMs);
      const scored = {
        status: "scored" as const,
        response: decision.response,
        outcome: decision.outcome,
        answeredAtMs,
        responseTimeMs: plainOrNull(
          "responseTimeMs",
          answeredAtMs === null ? null : answeredAtMs - common.windowStartMs,
        ),
        scoredAtMs: sinceStart("scoredAtMs", decision.scoredAtMs),
      };
      // The check above makes the outcome fit the kind, which the type cannot see.
      const entry = Object.freeze({
        ...common,
        ...soundPart(trial),
        ...scored,
      }) as ScoredVisitTrial;
      trials.push(entry);
      return entry;
    },

    trialDiscarded(trial, discardedAtMs) {
      const entry: DiscardedVisitTrial = Object.freeze({
        ...trialCommon(trial),
        ...soundPart(trial),
        status: "discarded",
        discardedAtMs: sinceStart("discardedAtMs", discardedAtMs),
      });
      trials.push(entry);
      return entry;
    },

    answerIgnored(input) {
      const entry = ignoredAnswerOf(input);
      ignoredAnswers.push(entry);
      return entry;
    },

    practiceScored(sound, decision) {
      if (!soundOutcomes.includes(decision.outcome)) {
        throw new TypeError(
          `A practice sound cannot have the outcome ${String(decision.outcome)}.`,
        );
      }
      const common = practiceCommon(sound);
      const answeredAtMs =
        decision.answeredAtMs === null
          ? null
          : sinceStart("answeredAtMs", decision.answeredAtMs);
      const entry: ScoredPracticeTrial = Object.freeze({
        ...common,
        status: "scored",
        response: decision.response,
        outcome: decision.outcome,
        answeredAtMs,
        responseTimeMs: plainOrNull(
          "responseTimeMs",
          answeredAtMs === null ? null : answeredAtMs - common.windowStartMs,
        ),
        scoredAtMs: sinceStart("scoredAtMs", decision.scoredAtMs),
      });
      practiceTrials.push(entry);
      return entry;
    },

    practiceDiscarded(sound, discardedAtMs) {
      const entry: DiscardedPracticeTrial = Object.freeze({
        ...practiceCommon(sound),
        status: "discarded",
        discardedAtMs: sinceStart("discardedAtMs", discardedAtMs),
      });
      practiceTrials.push(entry);
      return entry;
    },

    practiceAnswerIgnored(input) {
      const entry = ignoredAnswerOf(input);
      practiceIgnoredAnswers.push(entry);
      return entry;
    },

    practiceRefused(input) {
      const entry: LoggedPracticeRefusedPlay = Object.freeze({
        atMs: sinceStart("atMs", input.atMs),
        roomIndex: plainNumber("roomIndex", input.roomIndex),
        attempt: plainNumber("attempt", input.attempt),
        round: plainNumber("round", input.round),
        practiceNumber: plainNumber("practiceNumber", input.practiceNumber),
        reason: input.reason,
      });
      practiceRefusedPlays.push(entry);
      return entry;
    },

    pauseStarted(input) {
      if (openPause !== null) {
        throw new Error("A pause is already open.");
      }
      openPause = {
        reason: input.reason,
        stage: input.stage,
        roomIndex: plainOrNull("roomIndex", input.roomIndex),
        startedAtMs: sinceStart("startedAtMs", input.startedAtMs),
      };
    },

    pauseReasonChanged(reason) {
      if (openPause === null) {
        throw new Error("No pause is open.");
      }
      openPause.reason = reason;
    },

    pauseEnded(endedAtMs) {
      if (openPause === null) {
        throw new Error("No pause is open.");
      }
      const entry: LoggedPause = Object.freeze({
        reason: openPause.reason,
        stage: openPause.stage,
        roomIndex: openPause.roomIndex,
        startedAtMs: openPause.startedAtMs,
        endedAtMs: sinceStart("endedAtMs", endedAtMs),
      });
      pauses.push(entry);
      openPause = null;
      return entry;
    },

    playRefused(input) {
      const entry: LoggedRefusedPlay = Object.freeze({
        atMs: sinceStart("atMs", input.atMs),
        roomIndex: plainNumber("roomIndex", input.roomIndex),
        attempt: plainNumber("attempt", input.attempt),
        trialNumber: plainNumber("trialNumber", input.trialNumber),
        reason: input.reason,
      });
      refusedPlays.push(entry);
      return entry;
    },

    log() {
      if (openAttempts.size > 0 || openPause !== null) {
        throw new Error(
          "The visit log is assembled only once every room run and every pause has ended (D28).",
        );
      }
      return Object.freeze({
        formatVersion: 1,
        visitType: options.visitType,
        visitSeed,
        rooms,
        calibrations: Object.freeze([...calibrations]),
        headphoneChecks: Object.freeze([...headphoneChecks]),
        roomAttempts: Object.freeze([...(attempts as LoggedRoomAttempt[])]),
        trials: Object.freeze([...trials]),
        ignoredAnswers: Object.freeze([...ignoredAnswers]),
        pauses: Object.freeze([...pauses]),
        refusedPlays: Object.freeze([...refusedPlays]),
        // Absent when nothing of practice happened, so a log without practice reads as before.
        ...(practiceTrials.length === 0 &&
        practiceIgnoredAnswers.length === 0 &&
        practiceRefusedPlays.length === 0
          ? {}
          : {
              practice: Object.freeze({
                trials: Object.freeze([...practiceTrials]),
                ignoredAnswers: Object.freeze([...practiceIgnoredAnswers]),
                refusedPlays: Object.freeze([...practiceRefusedPlays]),
              }),
            }),
      });
    },
  };
  return Object.freeze(recorder);
}

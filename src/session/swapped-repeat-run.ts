import { earpieceOnEar } from "./earpiece-on-ear";
import { levelDiffers, visitEarResult } from "./summarize-visit";
import {
  swappedRepeatOutcome,
  type SwappedRepeatOutcomeSettings,
} from "./swapped-repeat-outcome";
import type {
  LoggedRoomAttempt,
  LoggedRoomResult,
  LoggedSwapCheck,
  RoomSummary,
  SwappedRepeatIgnoredAnswer,
  SwappedRepeatRun,
  SwappedRepeatTrial,
  VisitLog,
  VisitUnreliableReason,
} from "./visit-flow-types";

/**
 * What `swappedRepeatRunOf` turns into a record. Not part of the interface contract: the
 * Repeat_Controller builds it when the run's search finishes.
 */
export interface SwappedRepeatRunInput {
  /** The position of this run among the repeat runs begun in the visit, from 1. */
  readonly runNumber: number;
  /**
   * The log of the run's own recorder: its one room attempt, ended `finished`, with its trials,
   * ignored answers, pauses and refused plays. Times are on the visit log's clock.
   */
  readonly runLog: VisitLog;
  /** Every answered swap check of this repeat, in order. The last is `confirmed`. */
  readonly swapChecks: readonly LoggedSwapCheck[];
  /** The floor's room summary: the first run. */
  readonly firstRun: RoomSummary;
  /** The outcome's settings; the shipped ones by default. */
  readonly outcomeSettings?: SwappedRepeatOutcomeSettings;
}

/** A finished attempt, with the result a finished attempt always has. */
type FinishedAttempt = LoggedRoomAttempt & {
  readonly result: LoggedRoomResult;
};

/** Freezes a value and every object reachable from it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/** The run's one attempt. Throws a `RangeError` unless the log holds exactly one, finished, of the floor's room. */
function finishedAttemptOf(
  runLog: VisitLog,
  roomIndex: number,
): FinishedAttempt {
  const [attempt, ...others] = runLog.roomAttempts;
  if (
    attempt === undefined ||
    others.length > 0 ||
    attempt.ending !== "finished" ||
    attempt.result === null
  ) {
    throw new RangeError(
      `A repeat's record needs a run log with exactly one finished room attempt, but got ${String(runLog.roomAttempts.length)} attempts.`,
    );
  }
  if (attempt.roomIndex !== roomIndex) {
    throw new RangeError(
      `A repeat's run must be of the floor it repeats, but got room ${String(attempt.roomIndex)} for floor ${String(roomIndex)}.`,
    );
  }
  return attempt as FinishedAttempt;
}

/**
 * The frozen record of one swapped repeat that ran to its end (swapped-repeat design.md, "In the
 * record, every answer and every sound", R8, R10.7, R11.1, R19.4). Every sound trial names the
 * earpiece on its ear and every no-sound trial null; every scored trial answered with a side names
 * the earpiece on the ear named; every ignored answer names the earpiece on its side. The ears are
 * the search's results, made unreliable with `levelNotAsAsked` as `summarizeVisit` does for a room,
 * and the outcome is `swappedRepeatOutcome` of the first run and those ears. Pauses and refused
 * plays are the run's, unchanged. Throws a `RangeError` for a run number that is not a whole number
 * of at least 1, a run log that does not hold one finished attempt of the floor, or swap checks
 * whose last is not `confirmed`. A pure function: the record is deeply frozen plain data, and the
 * input is neither changed nor frozen.
 */
export function swappedRepeatRunOf(
  input: SwappedRepeatRunInput,
): SwappedRepeatRun {
  const { runNumber, runLog, swapChecks, firstRun } = input;
  if (!Number.isInteger(runNumber) || runNumber < 1) {
    throw new RangeError(
      `A repeat's run number must be a whole number of at least 1, but got ${String(runNumber)}.`,
    );
  }
  const roomIndex = firstRun.room.roomIndex;
  const attempt = finishedAttemptOf(runLog, roomIndex);
  if (swapChecks.at(-1)?.judgement !== "confirmed") {
    throw new RangeError(
      "A repeat's room runs only after a confirmed swap check, but its last check is not confirmed.",
    );
  }

  const earpieces = earpieceOnEar("swapped");
  const trials = runLog.trials.map((trial): SwappedRepeatTrial => ({
    ...trial,
    earpiece: trial.kind === "sound" ? earpieces[trial.ear] : null,
    responseEarpiece:
      trial.status === "scored" && trial.response !== "none"
        ? earpieces[trial.response]
        : null,
  }));
  const ignoredAnswers = runLog.ignoredAnswers.map(
    (answer): SwappedRepeatIgnoredAnswer => ({
      ...answer,
      earpiece: earpieces[answer.side],
    }),
  );

  const addedReasons: readonly VisitUnreliableReason[] = levelDiffers(
    runLog,
    attempt,
  )
    ? ["levelNotAsAsked"]
    : [];
  const left = visitEarResult(attempt.result.left, addedReasons);
  const right = visitEarResult(attempt.result.right, addedReasons);
  const judgement = swappedRepeatOutcome(
    {
      first: { left: firstRun.left, right: firstRun.right },
      repeat: { left, right },
    },
    input.outcomeSettings,
  );

  return deepFreeze<SwappedRepeatRun>({
    formatVersion: 1,
    roomIndex,
    runNumber,
    calibrationIndex: attempt.calibrationIndex,
    earpieceOnEar: { left: earpieces.left, right: earpieces.right },
    swapChecks: swapChecks.map((check) => ({ ...check })),
    attempt: structuredClone(attempt),
    trials,
    ignoredAnswers,
    pauses: runLog.pauses.map((pause) => ({ ...pause })),
    refusedPlays: runLog.refusedPlays.map((refusal) => ({ ...refusal })),
    left,
    right,
    rightMinusLeftDb: judgement.rightMinusLeftDb,
    firstRightMinusLeftDb: judgement.firstRightMinusLeftDb,
    differenceLimitDb: judgement.differenceLimitDb,
    unclearBelowDb: judgement.unclearBelowDb,
    outcome: judgement.outcome,
    unclearReason: judgement.unclearReason,
  });
}

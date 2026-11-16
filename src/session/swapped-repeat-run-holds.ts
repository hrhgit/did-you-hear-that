import { swappedRepeatOutcome } from "./swapped-repeat-outcome";
import type {
  Ear,
  SwappedRepeatRun,
  VisitEarResult,
  VisitLog,
  VisitSummary,
  VisitUnreliableReason,
} from "./visit-flow-types";

type JsonObject = Record<string, unknown>;

/**
 * Every reason an unreliable ear may have. A record over the union, so a reason added to
 * `VisitUnreliableReason` stops this file compiling until it is added here.
 */
const knownReasons: Readonly<Record<VisitUnreliableReason, true>> =
  Object.freeze({
    trialLimit: true,
    inconsistentCatch: true,
    falseAlarmRate: true,
    levelNotAsAsked: true,
    visitFalseAlarmRate: true,
  });

const earStates: readonly string[] = Object.freeze([
  "found",
  "betterThanFloor",
  "worseThanCap",
  "unreliable",
]);

const earCountFields: readonly string[] = Object.freeze([
  "presentationCount",
  "catchCount",
  "wrongSideCount",
  "missCount",
]);

/** The lists every record has (rule 6). */
const recordListFields: readonly string[] = Object.freeze([
  "swapChecks",
  "trials",
  "ignoredAnswers",
  "pauses",
  "refusedPlays",
]);

/** The only arrangement a record holds (rule 5): each ear wears the other earpiece. */
const swappedEarpieces: Readonly<Record<Ear, Ear>> = Object.freeze({
  left: "right",
  right: "left",
});

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isEar(value: unknown): value is Ear {
  return value === "left" || value === "right";
}

/** Rule 4 of a room summary in result-page "Checking a payload": one ear's result. */
function earResultHolds(result: unknown): boolean {
  if (
    !isJsonObject(result) ||
    typeof result.state !== "string" ||
    !earStates.includes(result.state) ||
    !earCountFields.every((field) => isCount(result[field]))
  ) {
    return false;
  }
  if (result.state === "found") {
    return isFiniteNumber(result.thresholdDb);
  }
  if (result.state === "unreliable") {
    const { reasons } = result;
    return (
      Array.isArray(reasons) &&
      reasons.length > 0 &&
      reasons.every(
        (reason: unknown) =>
          typeof reason === "string" && Object.hasOwn(knownReasons, reason),
      ) &&
      new Set(reasons).size === reasons.length
    );
  }
  return true;
}

/** Rule 5: exactly `{ left: "right", right: "left" }`. */
function earpiecesHold(earpieceOnEar: unknown): boolean {
  return (
    isJsonObject(earpieceOnEar) &&
    Object.keys(earpieceOnEar).length ===
      Object.keys(swappedEarpieces).length &&
    earpieceOnEar.left === swappedEarpieces.left &&
    earpieceOnEar.right === swappedEarpieces.right
  );
}

/** Rule 6: the lists, the last swap check, and the earpiece of every trial and ignored answer. */
function listsHold(record: JsonObject): boolean {
  if (!recordListFields.every((field) => Array.isArray(record[field]))) {
    return false;
  }
  const swapChecks = record.swapChecks as readonly unknown[];
  const lastCheck = swapChecks.at(-1);
  if (!isJsonObject(lastCheck) || lastCheck.judgement !== "confirmed") {
    return false;
  }
  const trialsHold = (record.trials as readonly unknown[]).every((trial) => {
    if (!isJsonObject(trial)) {
      return false;
    }
    if (trial.kind === "sound") {
      return isEar(trial.ear) && trial.earpiece === swappedEarpieces[trial.ear];
    }
    return trial.kind === "noSound" && trial.earpiece === null;
  });
  return (
    trialsHold &&
    (record.ignoredAnswers as readonly unknown[]).every(
      (answer) =>
        isJsonObject(answer) &&
        isEar(answer.side) &&
        answer.earpiece === swappedEarpieces[answer.side],
    )
  );
}

/** Rule 4: the calibration of the floor's last finished attempt in the log, or null without one. */
function firstRunCalibrationIndex(
  visitLog: VisitLog,
  roomIndex: number,
): unknown {
  const attempts: readonly unknown[] = visitLog.roomAttempts;
  const finished = attempts.filter(
    (attempt) =>
      isJsonObject(attempt) &&
      attempt.roomIndex === roomIndex &&
      attempt.ending === "finished",
  );
  const last = finished.at(-1);
  return isJsonObject(last) ? last.calibrationIndex : null;
}

/** Rules 2 and 4 to 11 for one record, given that rule 1 holds for it. */
function recordHolds(
  record: JsonObject,
  summary: VisitSummary,
  visitLog: VisitLog,
): boolean {
  // Rule 2: a room of the log whose summary offers the repeat with both ears found.
  const { roomIndex } = record;
  if (
    !isCount(roomIndex) ||
    visitLog.rooms[roomIndex] === undefined ||
    summary.rooms[roomIndex] === undefined
  ) {
    return false;
  }
  const firstRun = summary.rooms[roomIndex];
  if (
    !firstRun.swappedRepeatOffered ||
    firstRun.left.state !== "found" ||
    firstRun.right.state !== "found"
  ) {
    return false;
  }
  // Rules 4, 5 and 6.
  const calibrationIndex = firstRunCalibrationIndex(visitLog, roomIndex);
  if (
    !isCount(record.calibrationIndex) ||
    record.calibrationIndex !== calibrationIndex ||
    !earpiecesHold(record.earpieceOnEar) ||
    !listsHold(record)
  ) {
    return false;
  }
  // Rule 7: the run's one room attempt, ended finished, with a result.
  const { attempt } = record;
  if (
    !isJsonObject(attempt) ||
    attempt.roomIndex !== roomIndex ||
    attempt.attempt !== 1 ||
    attempt.ending !== "finished" ||
    !isJsonObject(attempt.result)
  ) {
    return false;
  }
  // Rule 8: the ears, and their difference.
  if (!earResultHolds(record.left) || !earResultHolds(record.right)) {
    return false;
  }
  const left = record.left as unknown as VisitEarResult;
  const right = record.right as unknown as VisitEarResult;
  const expectedDifferenceDb =
    left.state === "found" && right.state === "found"
      ? right.thresholdDb - left.thresholdDb
      : null;
  if (record.rightMinusLeftDb !== expectedDifferenceDb) {
    return false;
  }
  // Rules 9 and 10.
  const { differenceLimitDb, unclearBelowDb } = record;
  if (
    record.firstRightMinusLeftDb !== firstRun.rightMinusLeftDb ||
    !isFiniteNumber(differenceLimitDb) ||
    !isFiniteNumber(unclearBelowDb) ||
    unclearBelowDb <= 0 ||
    unclearBelowDb > differenceLimitDb
  ) {
    return false;
  }
  // Rule 11: the outcome follows from the record's own numbers and the floor's first run. The
  // outcome throws a RangeError when the first run is less than the record's limit apart, which
  // makes the record unreadable.
  try {
    const judgement = swappedRepeatOutcome(
      {
        first: { left: firstRun.left, right: firstRun.right },
        repeat: { left, right },
      },
      { differenceLimitDb, unclearBelowDb },
    );
    return (
      record.outcome === judgement.outcome &&
      record.unclearReason === judgement.unclearReason
    );
  } catch {
    return false;
  }
}

/**
 * Whether the `swappedRepeats` of a stored payload meet the rules of "Checking a payload"
 * (swapped-repeat design.md, "Saved visits", R13.4, D17), against the payload's summary and visit
 * log, which have passed their own rules already:
 *
 * 1. an array of plain objects, each of `formatVersion` 1;
 * 2. each `roomIndex` a room of the log whose summary offers the repeat with both ears `found`,
 *    and no two records of one floor (Q4, decided by the owner on 2026-11-15);
 * 3. each `runNumber` a whole number of at least 1, strictly increasing along the list;
 * 4. `calibrationIndex` that of the floor's last finished attempt in the log;
 * 5. `earpieceOnEar` exactly `{ left: "right", right: "left" }`;
 * 6. the five lists arrays, the last swap check `confirmed`, every sound trial's `earpiece` the
 *    earpiece on its ear and every no-sound trial's null, every ignored answer's `earpiece` the
 *    earpiece on its side;
 * 7. `attempt` a plain object of the record's floor, attempt 1, ending `finished`, with a result;
 * 8. `left` and `right` meet the ear result rule, and `rightMinusLeftDb` is right minus left when
 *    both are found and null otherwise;
 * 9. `firstRightMinusLeftDb` equals the floor summary's `rightMinusLeftDb`;
 * 10. `differenceLimitDb` and `unclearBelowDb` finite, `0 < unclearBelowDb ≤ differenceLimitDb`;
 * 11. `outcome` and `unclearReason` what `swappedRepeatOutcome` gives for the floor summary's ears
 *     and the record's ears with the record's own limits.
 *
 * The trials are not checked against the engine, as the log's are not (result-page D9). A pure
 * function of JSON values; never throws.
 */
export function swappedRepeatRunsHold(
  runs: unknown,
  summary: VisitSummary,
  visitLog: VisitLog,
): runs is readonly SwappedRepeatRun[] {
  if (!Array.isArray(runs)) {
    return false;
  }
  const floors = new Set<unknown>();
  let lastRunNumber = 0;
  for (const record of runs as readonly unknown[]) {
    // Rule 1.
    if (!isJsonObject(record) || record.formatVersion !== 1) {
      return false;
    }
    // Rules 2 (one record per floor) and 3.
    const { runNumber } = record;
    if (
      floors.has(record.roomIndex) ||
      typeof runNumber !== "number" ||
      !Number.isInteger(runNumber) ||
      runNumber < 1 ||
      runNumber <= lastRunNumber
    ) {
      return false;
    }
    floors.add(record.roomIndex);
    lastRunNumber = runNumber;
    if (!recordHolds(record, summary, visitLog)) {
      return false;
    }
  }
  return true;
}

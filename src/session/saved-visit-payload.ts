import type {
  HearingMethodConfig,
  VisitType,
} from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { ghostSoundIds } from "../config/sound-id";
import { judgeVisitFalseAlarms } from "./judge-visit-false-alarms";
import type { VisitToSave } from "./result-page-types";
import { swappedRepeatRunsHold } from "./swapped-repeat-run-holds";
import type {
  SwappedRepeatRun,
  VisitLog,
  VisitSummary,
  VisitUnreliableReason,
} from "./visit-flow-types";

/** What a saved visit holds beyond its envelope (result-page design.md, "The saved visit and the visit log"). */
export interface SavedVisitPayload {
  readonly formatVersion: 1;
  /** `hearingMethodConfig.floorDb` when it was saved. */
  readonly floorDb: number;
  /** `hearingMethodConfig.swappedRepeatDifferenceDb` when it was saved. */
  readonly swappedRepeatDifferenceDb: number;
  /** Exactly the summary the result showed. */
  readonly summary: VisitSummary;
  /** Exactly the log the flow recorded. */
  readonly visitLog: VisitLog;
  /**
   * The swapped repeats saved with it, in the order they ended (swapped-repeat D17). Empty for a
   * payload without the key `swappedRepeats`, which every visit saved without a repeat, and every
   * visit saved before the swapped-repeat spec, is.
   */
  readonly swappedRepeats: readonly SwappedRepeatRun[];
}

/** The settings a payload is saved with. */
export type SavedVisitPayloadSettings = Pick<
  HearingMethodConfig,
  "floorDb" | "swappedRepeatDifferenceDb"
>;

const payloadFormatVersion = 1;
const largestSeed = 0xffffffff;

/**
 * Every reason an unreliable ear may have. A type test checks that it covers
 * `VisitUnreliableReason` exactly, so a reason added later must be added here in the same change.
 */
export const knownUnreliableReasons = Object.freeze([
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
  "levelNotAsAsked",
  "visitFalseAlarmRate",
] as const satisfies readonly VisitUnreliableReason[]);

const earStates: readonly string[] = Object.freeze([
  "found",
  "betterThanFloor",
  "worseThanCap",
  "unreliable",
]);

const visitTypeNames: Readonly<Record<VisitType, true>> = Object.freeze({
  quick: true,
  full: true,
});

/** The lists every visit log has. */
const logListFields: readonly string[] = Object.freeze([
  "calibrations",
  "headphoneChecks",
  "roomAttempts",
  "trials",
  "ignoredAnswers",
  "pauses",
  "refusedPlays",
]);

/** The counts every ear result has. */
const earCountFields: readonly string[] = Object.freeze([
  "presentationCount",
  "catchCount",
  "wrongSideCount",
  "missCount",
]);

type JsonObject = Record<string, unknown>;

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

/** Freezes a parsed JSON value and everything in it, without recursion, so no depth can overflow the stack. */
function deepFreeze<T>(value: T): T {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === "object" && next !== null && !Object.isFrozen(next)) {
      Object.freeze(next);
      for (const nested of Object.values(next)) {
        pending.push(nested);
      }
    }
  }
  return value;
}

/**
 * Whether two rooms are equal: the same fields with the same plain values. A room is flat, so a
 * field whose value is an object makes the rooms unequal.
 */
function roomsEqual(first: unknown, second: unknown): boolean {
  if (!isJsonObject(first) || !isJsonObject(second)) {
    return false;
  }
  const firstKeys = Object.keys(first);
  return (
    firstKeys.length === Object.keys(second).length &&
    firstKeys.every(
      (key) =>
        Object.hasOwn(second, key) &&
        (typeof first[key] !== "object" || first[key] === null) &&
        first[key] === second[key],
    )
  );
}

/**
 * The anchors a calibration may be saved with (audible-start design.md, "Checking a payload"). A
 * saved `hands` is unreadable, because no calibration is logged so: a calibration recorded before
 * the audible-start spec has no `anchor` at all.
 */
const savedAnchors: readonly unknown[] = Object.freeze(["music", "hiss"]);

/** Whether a calibration's `anchor`, when it has one, is one a calibration may be saved with. */
function calibrationAnchorHolds(calibration: unknown): boolean {
  return (
    !isJsonObject(calibration) ||
    !Object.hasOwn(calibration, "anchor") ||
    savedAnchors.includes(calibration.anchor)
  );
}

/**
 * Whether a calibration's `roomFloorLevelDb`, when it has one, is a plain object with a finite
 * number for every ghost room (audible-start design.md, "Checking a payload").
 */
function calibrationFloorsHold(calibration: unknown): boolean {
  if (
    !isJsonObject(calibration) ||
    !Object.hasOwn(calibration, "roomFloorLevelDb")
  ) {
    return true;
  }
  const floors = calibration.roomFloorLevelDb;
  return (
    isJsonObject(floors) &&
    ghostSoundIds.every((soundId) => isFiniteNumber(floors[soundId]))
  );
}

/**
 * Whether a `searchFloorDb`, when the object has one, is finite and below the object's own
 * `searchCapDb` (audible-start design.md, "Checking a payload"). For a room attempt and for a
 * room summary alike.
 */
function searchFloorHolds(entry: unknown): boolean {
  if (!isJsonObject(entry) || !Object.hasOwn(entry, "searchFloorDb")) {
    return true;
  }
  const { searchFloorDb, searchCapDb } = entry;
  return (
    isFiniteNumber(searchFloorDb) &&
    isFiniteNumber(searchCapDb) &&
    searchFloorDb < searchCapDb
  );
}

/** Rule 2: the light check of the log. */
function logHolds(log: JsonObject, envelopeVisitType: VisitType): boolean {
  if (
    log.formatVersion !== payloadFormatVersion ||
    typeof log.visitType !== "string" ||
    !Object.hasOwn(visitTypeNames, log.visitType) ||
    log.visitType !== envelopeVisitType ||
    !isCount(log.visitSeed) ||
    log.visitSeed > largestSeed ||
    !Array.isArray(log.rooms) ||
    log.rooms.length === 0 ||
    !logListFields.every((field) => Array.isArray(log[field])) ||
    !(log.calibrations as readonly unknown[]).every(calibrationAnchorHolds) ||
    !(log.calibrations as readonly unknown[]).every(calibrationFloorsHold) ||
    !(log.roomAttempts as readonly unknown[]).every(searchFloorHolds)
  ) {
    return false;
  }
  const usedRoomIds = new Set<unknown>();
  return log.rooms.every((room: unknown, position: number) => {
    if (
      !isJsonObject(room) ||
      room.roomIndex !== position ||
      !ghostSoundIds.some((roomId) => roomId === room.roomId) ||
      usedRoomIds.has(room.roomId) ||
      !isFiniteNumber(room.frequencyHz) ||
      room.frequencyHz <= 0
    ) {
      return false;
    }
    usedRoomIds.add(room.roomId);
    return true;
  });
}

/** Rule 4: one ear's result. */
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
      reasons.every((reason: unknown) =>
        knownUnreliableReasons.some((known) => known === reason),
      ) &&
      new Set(reasons).size === reasons.length
    );
  }
  return true;
}

/** Rules 3 to 6: one room summary, against the log's room at the same place. */
function roomSummaryHolds(
  roomSummary: unknown,
  logRoom: unknown,
  swappedRepeatDifferenceDb: number,
): boolean {
  if (
    !isJsonObject(roomSummary) ||
    !roomsEqual(roomSummary.room, logRoom) ||
    !isFiniteNumber(roomSummary.searchCapDb) ||
    !searchFloorHolds(roomSummary) ||
    !isCount(roomSummary.noSoundTrialCount) ||
    !isCount(roomSummary.falseAlarmCount) ||
    roomSummary.falseAlarmCount > roomSummary.noSoundTrialCount ||
    !earResultHolds(roomSummary.left) ||
    !earResultHolds(roomSummary.right)
  ) {
    return false;
  }
  const left = roomSummary.left as JsonObject;
  const right = roomSummary.right as JsonObject;
  const expectedDifferenceDb =
    left.state === "found" && right.state === "found"
      ? (right.thresholdDb as number) - (left.thresholdDb as number)
      : null;
  if (roomSummary.rightMinusLeftDb !== expectedDifferenceDb) {
    return false;
  }
  const offered = roomSummary.swappedRepeatOffered;
  if (typeof offered !== "boolean") {
    return false;
  }
  // Rule 6: an offer needs the difference; a narrower offer of a later spec still reads.
  return (
    !offered ||
    (expectedDifferenceDb !== null &&
      Math.abs(expectedDifferenceDb) >= swappedRepeatDifferenceDb)
  );
}

/** Rules 3 to 8: the summary against the log. */
function summaryHolds(
  summary: JsonObject,
  log: JsonObject,
  swappedRepeatDifferenceDb: number,
): boolean {
  const logRooms = log.rooms as readonly unknown[];
  const { rooms } = summary;
  if (
    !Array.isArray(rooms) ||
    rooms.length !== logRooms.length ||
    !rooms.every((roomSummary: unknown, position: number) =>
      roomSummaryHolds(
        roomSummary,
        logRooms[position],
        swappedRepeatDifferenceDb,
      ),
    )
  ) {
    return false;
  }
  const roomSummaries = rooms as readonly {
    readonly noSoundTrialCount: number;
    readonly falseAlarmCount: number;
    readonly left: JsonObject;
    readonly right: JsonObject;
  }[];
  const limitFraction = summary.visitFalseAlarmRateLimitFraction;
  if (
    !isFiniteNumber(limitFraction) ||
    limitFraction <= 0 ||
    limitFraction > 1 ||
    !isCount(summary.ignoredAnswerCount)
  ) {
    return false;
  }
  const judgement = judgeVisitFalseAlarms(roomSummaries, limitFraction);
  if (
    summary.pooledNoSoundTrialCount !== judgement.pooledNoSoundTrialCount ||
    summary.pooledFalseAlarmCount !== judgement.pooledFalseAlarmCount ||
    summary.pooledFalseAlarmRateFraction !==
      judgement.pooledFalseAlarmRateFraction ||
    summary.visitFalseAlarmRateAboveLimit !== judgement.aboveLimit
  ) {
    return false;
  }
  if (!judgement.aboveLimit) {
    return true;
  }
  return roomSummaries.every((roomSummary) =>
    [roomSummary.left, roomSummary.right].every(
      (ear) =>
        ear.state === "unreliable" &&
        (ear.reasons as readonly unknown[]).at(-1) === "visitFalseAlarmRate",
    ),
  );
}

/**
 * The payload of a saved visit as JSON text (result-page design.md, D9): format version 1, the
 * settings it is drawn with, the summary as shown and the visit log as recorded, both unchanged.
 * A visit with at least one swapped repeat also gets the key `swappedRepeats` after `visitLog`,
 * with its records unchanged; a visit without one is written byte for byte as before the
 * swapped-repeat spec (swapped-repeat R13.1, R13.2, D17). `settings` defaults to the shipped
 * `hearingMethodConfig`.
 */
export function savedVisitPayloadJson(
  visit: VisitToSave,
  settings: SavedVisitPayloadSettings = hearingMethodConfig,
): string {
  const swappedRepeats = visit.swappedRepeats ?? [];
  return JSON.stringify({
    formatVersion: payloadFormatVersion,
    floorDb: settings.floorDb,
    swappedRepeatDifferenceDb: settings.swappedRepeatDifferenceDb,
    summary: visit.summary,
    visitLog: visit.visitLog,
    ...(swappedRepeats.length > 0 ? { swappedRepeats } : {}),
  });
}

/**
 * Reads the payload of a stored entry (result-page design.md, "Checking a payload"). Gives the
 * deeply frozen payload when every rule holds, and null otherwise: JSON of the right shape and
 * version, a log of the envelope's visit type with valid rooms, and a summary that keeps every
 * invariant `summarizeVisit` gives. The summary is never computed again (D9), and the log is not
 * checked against the engine, which is the no-headphone replay's to do. A payload without the key
 * `swappedRepeats` reads with an empty list; a payload with it reads only when its records meet
 * `swappedRepeatRunsHold` (swapped-repeat R13.3, R13.4). A calibration's `anchor`, when present,
 * is `music` or `hiss`; a calibration's `roomFloorLevelDb`, when present, has a finite number for
 * every ghost room; a room attempt's or a room summary's `searchFloorDb`, when present, is finite
 * and below its `searchCapDb`. A payload written before the audible-start spec has none of them
 * and reads as before (audible-start R11.1, R11.5). Never throws.
 */
export function parseSavedVisitPayload(
  payloadJson: string,
  envelopeVisitType: VisitType,
): SavedVisitPayload | null {
  if (typeof payloadJson !== "string") {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (
    !isJsonObject(payload) ||
    payload.formatVersion !== payloadFormatVersion ||
    !isFiniteNumber(payload.floorDb) ||
    !isFiniteNumber(payload.swappedRepeatDifferenceDb) ||
    payload.swappedRepeatDifferenceDb <= 0 ||
    !isJsonObject(payload.summary) ||
    !isJsonObject(payload.visitLog)
  ) {
    return null;
  }
  if (
    !logHolds(payload.visitLog, envelopeVisitType) ||
    !summaryHolds(
      payload.summary,
      payload.visitLog,
      payload.swappedRepeatDifferenceDb,
    )
  ) {
    return null;
  }
  const summary = payload.summary as unknown as VisitSummary;
  const visitLog = payload.visitLog as unknown as VisitLog;
  const swappedRepeats: unknown = Object.hasOwn(payload, "swappedRepeats")
    ? payload.swappedRepeats
    : [];
  if (!swappedRepeatRunsHold(swappedRepeats, summary, visitLog)) {
    return null;
  }
  return deepFreeze({
    formatVersion: payloadFormatVersion,
    floorDb: payload.floorDb,
    swappedRepeatDifferenceDb: payload.swappedRepeatDifferenceDb,
    summary,
    visitLog,
    swappedRepeats,
  });
}

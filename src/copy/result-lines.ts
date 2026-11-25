import type { GhostSoundId } from "../config/sound-id";
import {
  pitchLabel,
  relativeLevelLabel,
  roomNames,
  type AnswerSide,
} from "./room-copy";

// Every sentence of the result page about a floor, a wing and the false alarms (result-page
// design.md, "`src/copy/result-lines.ts`"). Decibels are rounded to whole numbers for every line,
// as relativeLevelLabel does, and a size is the absolute value of the rounded number. A
// difference is right minus left, and the wording names the side the quieter sound was caught
// on, never the ear or the earpiece (D19).

/** The state of a wing. The session's `WingState` is checked to equal it. */
export type WingStateName =
  "found" | "betterThanFloor" | "worseThanCap" | "unreliable";

/** Why a wing is unreliable. The session's `VisitUnreliableReason` is checked to equal it. */
export type UnreliableReasonName =
  | "trialLimit"
  | "inconsistentCatch"
  | "falseAlarmRate"
  | "levelNotAsAsked"
  | "visitFalseAlarmRate";

/** What the copy needs about one wing. `thresholdDb` only for found; `reasons` only for unreliable. */
export interface WingWords {
  readonly state: WingStateName;
  readonly thresholdDb: number | null;
  readonly reasons: readonly UnreliableReasonName[];
}

const unreliableReasonLines: Readonly<Record<UnreliableReasonName, string>> =
  Object.freeze({
    trialLimit:
      "Your answers here had not settled when the house ran out of tries.",
    inconsistentCatch: "One catch here did not fit with your other answers.",
    falseAlarmRate: "In this room you often answered when I made no sound.",
    levelNotAsAsked:
      "A sound here was not played at the level the house asked for.",
    visitFalseAlarmRate:
      "On this visit you often answered when I made no sound.",
  });

const wingStateNames: readonly WingStateName[] = Object.freeze([
  "found",
  "betterThanFloor",
  "worseThanCap",
  "unreliable",
]);

function requireCount(count: number, name: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${name} must be a whole number of 0 or more, but got ${String(count)}.`,
    );
  }
}

function requireDifference(rightMinusLeftDb: number): void {
  if (!Number.isFinite(rightMinusLeftDb)) {
    throw new RangeError(
      `A left and right difference must be a finite number of decibels, but got ${String(rightMinusLeftDb)}.`,
    );
  }
}

function requireReason(reason: UnreliableReasonName): void {
  if (!Object.hasOwn(unreliableReasonLines, reason)) {
    throw new RangeError(`Unknown unreliable reason ${String(reason)}.`);
  }
}

/** Checks that a wing's fields fit its state. */
function requireWing(wing: WingWords): void {
  if (!wingStateNames.includes(wing.state)) {
    throw new RangeError(`Unknown wing state ${String(wing.state)}.`);
  }
  if (wing.state === "found") {
    if (wing.thresholdDb === null || !Number.isFinite(wing.thresholdDb)) {
      throw new RangeError(
        `A found wing needs a finite threshold, but got ${String(wing.thresholdDb)}.`,
      );
    }
  } else if (wing.thresholdDb !== null) {
    throw new RangeError(
      `Only a found wing has a threshold, but a ${wing.state} wing got ${String(wing.thresholdDb)}.`,
    );
  }
  if (wing.state !== "unreliable" && wing.reasons.length > 0) {
    throw new RangeError(
      `Only an unreliable wing has reasons, but a ${wing.state} wing got ${String(wing.reasons.length)}.`,
    );
  }
  for (const reason of wing.reasons) {
    requireReason(reason);
  }
}

/** The whole decibels of a difference, without a negative zero. */
function wholeDifference(rightMinusLeftDb: number): number {
  requireDifference(rightMinusLeftDb);
  const whole = Math.round(rightMinusLeftDb);
  return whole === 0 ? 0 : whole;
}

/**
 * How often the visitor answered when the house made no sound, over the whole visit. Both counts
 * are whole numbers with 0 ≤ falseAlarmCount ≤ noSoundTrialCount.
 */
export function falseAlarmLine(
  falseAlarmCount: number,
  noSoundTrialCount: number,
): string {
  requireCount(falseAlarmCount, "A false alarm count");
  requireCount(noSoundTrialCount, "A no-sound trial count");
  if (falseAlarmCount > noSoundTrialCount) {
    throw new RangeError(
      `There cannot be more false alarms than no-sound trials, but got ${String(falseAlarmCount)} of ${String(noSoundTrialCount)}.`,
    );
  }
  if (noSoundTrialCount === 0) {
    return "I made a sound every time on this visit.";
  }
  if (noSoundTrialCount === 1) {
    return falseAlarmCount === 0
      ? "I made no sound once, and you did not answer."
      : "I made no sound once, and you answered.";
  }
  return `You answered ${String(falseAlarmCount)} of ${String(noSoundTrialCount)} times when I made no sound.`;
}

/**
 * The notice line when the whole visit is unreliable. `limitFraction` is the visit limit the
 * summary was judged by, from above 0 to 1, written as a percentage to one decimal place without a
 * trailing ".0".
 */
export function visitNoticeLine(limitFraction: number): string {
  if (
    !Number.isFinite(limitFraction) ||
    limitFraction <= 0 ||
    limitFraction > 1
  ) {
    throw new RangeError(
      `A visit limit must be above 0 and at most 1, but got ${String(limitFraction)}.`,
    );
  }
  const percent = Math.round(limitFraction * 1000) / 10;
  return `You answered more than ${String(percent)} percent of the times I made no sound, so this visit cannot show what you caught. Walk through the house again, and answer only when you hear something.`;
}

/** The line beside a wing. */
export function wingLine(wing: WingWords): string {
  requireWing(wing);
  switch (wing.state) {
    case "found":
      return `The quietest sound you caught here was ${relativeLevelLabel(wing.thresholdDb as number)}.`;
    case "betterThanFloor":
      return "Quieter than this house can whisper.";
    case "worseThanCap":
      return "You did not catch the loudest sound the house may play here.";
    case "unreliable":
      return "This room should be visited again.";
  }
}

/**
 * A wing's level in two parts for the floor's card: `value`, set large, and `note`, which
 * finishes it in small type. Together they say what `wingLine` says, and a found level is still
 * labelled as relative to the visitor's calibration.
 */
export interface WingValueWords {
  readonly value: string;
  readonly note: string;
}

/** The two parts of a wing's level: "30 dB quieter" and "than your calibration". */
export function wingValue(wing: WingWords): WingValueWords {
  requireWing(wing);
  switch (wing.state) {
    case "found": {
      const whole = Math.round(wing.thresholdDb as number);
      if (whole === 0) {
        return { value: "As loud", note: "as your calibration" };
      }
      return {
        value: `${String(Math.abs(whole))} dB ${whole < 0 ? "quieter" : "louder"}`,
        note: "than your calibration",
      };
    }
    case "betterThanFloor":
      return { value: "Quieter still", note: "than this house can whisper" };
    case "worseThanCap":
      return {
        value: "Not caught",
        note: "the loudest sound went by",
      };
    case "unreliable":
      return { value: "No level", note: "visit this room again" };
  }
}

/** Why a wing is unreliable, in one line. */
export function unreliableReasonLine(reason: UnreliableReasonName): string {
  requireReason(reason);
  return unreliableReasonLines[reason];
}

/** Beside a floor: "–" without a difference, "0 dB", or such as "15 dB quieter on the left". */
export function differenceLabel(rightMinusLeftDb: number | null): string {
  if (rightMinusLeftDb === null) {
    return "–";
  }
  const whole = wholeDifference(rightMinusLeftDb);
  if (whole === 0) {
    return "0 dB";
  }
  return whole > 0
    ? `${String(whole)} dB quieter on the left`
    : `${String(-whole)} dB quieter on the right`;
}

/** The left and right difference of a floor as a sentence. */
export function differenceLine(rightMinusLeftDb: number | null): string {
  if (rightMinusLeftDb === null) {
    return "There is no left and right difference to show here, because one side has no level.";
  }
  const whole = wholeDifference(rightMinusLeftDb);
  if (whole === 0) {
    return "On this floor you caught the same level on your left and on your right.";
  }
  return whole > 0
    ? `On this floor you caught a sound ${String(whole)} dB quieter on your left than on your right.`
    : `On this floor you caught a sound ${String(-whole)} dB quieter on your right than on your left.`;
}

/** The offer of the swapped repeat on a floor whose left and right are this far apart. */
export function swappedRepeatLine(rightMinusLeftDb: number): string {
  const size = Math.abs(wholeDifference(rightMinusLeftDb));
  return `Your left and right are ${String(size)} dB apart here. A swap tells whether the difference stays with your ears or moves with the headphones.`;
}

/** A wing's line, followed by the line of its first reason when it is unreliable. */
function wingDescription(wing: WingWords): string {
  const line = wingLine(wing);
  return wing.state === "unreliable" && wing.reasons.length > 0
    ? `${line} ${unreliableReasonLine(wing.reasons[0])}`
    : line;
}

/**
 * Everything about one floor in words, for a visitor who cannot see the picture. The difference
 * is given exactly when both wings are found, as the visit summary gives it.
 */
export function floorDescription(
  roomId: GhostSoundId,
  frequencyHz: number,
  left: WingWords,
  right: WingWords,
  rightMinusLeftDb: number | null,
): string {
  if (!Object.hasOwn(roomNames, roomId)) {
    throw new RangeError(`Unknown room ${String(roomId)}.`);
  }
  requireWing(left);
  requireWing(right);
  const bothFound = left.state === "found" && right.state === "found";
  if ((rightMinusLeftDb !== null) !== bothFound) {
    throw new RangeError(
      `A floor has a left and right difference exactly when both wings are found, but got ${String(rightMinusLeftDb)} for ${left.state} and ${right.state}.`,
    );
  }
  return `${roomNames[roomId]}, ${pitchLabel(frequencyHz)}. Left: ${wingDescription(left)} Right: ${wingDescription(right)} ${differenceLine(rightMinusLeftDb)}`;
}

/**
 * The Floor_Line (audible-start R22): said under a floor when a side's result reached the quietest
 * the house can play there, so that the visitor knows the house stopped, not their hearing. It
 * names each such side, or null for none. It never asks what headphones the visitor wears
 * (R22.4).
 */
export function playableFloorLine(sides: readonly AnswerSide[]): string | null {
  const left = sides.includes("left");
  const right = sides.includes("right");
  if (!left && !right) {
    return null;
  }
  const where =
    left && right
      ? "On both sides"
      : left
        ? "On your left side"
        : "On your right side";
  return `${where}, this is as quiet as the house can play through these headphones at this volume. Wireless headphones in particular stop around here.`;
}

import { pitchLabel, relativeLevelLabel } from "./room-copy";

// Every sentence of the missed-sound replay that depends on the replay (missed-sound-replay
// design.md, "`src/copy/replay-lines.ts`"). Counts and the selection are written in words,
// positions in digits (D12). Levels are labelled by relativeLevelLabel, so always relative to the
// visitor's own calibration; the one other number of decibels is the raise, said as a difference.

/** A side. The session's `Ear` is checked to equal it. */
export type ReplaySideName = "left" | "right";

/** How a replay ended. The session's `ReplayEnding` is checked to equal it. */
export type ReplayEndingName = "allPlayed" | "deviceChanged" | "soundRefused";

/** Why a replay paused. The session's `ReplayPauseReason` is checked to equal it. */
export type ReplayPauseName = "hidden" | "interrupted";

const sideNames: readonly ReplaySideName[] = Object.freeze(["left", "right"]);

const endingNames: readonly ReplayEndingName[] = Object.freeze([
  "allPlayed",
  "deviceChanged",
  "soundRefused",
]);

/** The largest count written in words. From the next number up, counts are written in digits. */
const largestCountInWords = 999;

const unitWords: readonly string[] = Object.freeze([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
]);

/** The words of the tens, at the index of their tens digit. */
const tensWords: readonly string[] = Object.freeze([
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
]);

// Base ten, for the number words. Not a tunable value.
const ten = 10;
const hundred = ten * ten;

function requireCount(count: number, name: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${name} must be a whole number of 0 or more, but got ${String(count)}.`,
    );
  }
}

function requireSide(side: ReplaySideName): void {
  if (!sideNames.includes(side)) {
    throw new RangeError(`Unknown side ${String(side)}.`);
  }
}

/** A whole number below one hundred in words. */
function belowHundredWords(count: number): string {
  if (count < unitWords.length) {
    return unitWords[count];
  }
  const tens = tensWords[Math.floor(count / ten)];
  const units = count % ten;
  return units === 0 ? tens : `${tens}-${unitWords[units]}`;
}

/** A whole number in English words, from "zero" to "nine hundred and ninety-nine"; from 1000 up, in digits. */
export function countWords(count: number): string {
  requireCount(count, "A count");
  if (count > largestCountInWords) {
    return String(count);
  }
  if (count < hundred) {
    return belowHundredWords(count);
  }
  const hundreds = `${unitWords[Math.floor(count / hundred)]} hundred`;
  const rest = count % hundred;
  return rest === 0 ? hundreds : `${hundreds} and ${belowHundredWords(rest)}`;
}

/** The first letter in capitals. */
function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** What the house says before the first replayed sound (D24). The raise is rounded to whole decibels. */
export function announcementLines(raiseDb: number): readonly string[] {
  if (!Number.isFinite(raiseDb) || raiseDb <= 0) {
    throw new RangeError(
      `The replay's raise must be a finite number of decibels above 0, but got ${String(raiseDb)}.`,
    );
  }
  return Object.freeze([
    "Before you leave, I will play again the sounds you did not catch.",
    "Each one comes from the side where I made it, with its creature in the doorway, in the order I made them.",
    `Each one is ${String(Math.round(raiseDb))} dB louder than when it went by, but never louder than the house may play.`,
    "Leave the volume as it is. You can stop the sounds at any moment.",
  ]);
}

/** When the replay plays a selection: how many sounds were missed and how many it plays. */
export function selectionLine(
  missedCount: number,
  replayCount: number,
): string {
  requireCount(missedCount, "A count of missed sounds");
  requireCount(replayCount, "A count of replayed sounds");
  if (replayCount < 1 || replayCount >= missedCount) {
    throw new RangeError(
      `A selection plays from 1 to fewer than all the missed sounds, but got ${String(replayCount)} of ${String(missedCount)}.`,
    );
  }
  return `You did not catch ${countWords(missedCount)} sounds. I will play ${countWords(replayCount)} of them, spread over the whole visit.`;
}

/** A replayed sound's place: "Sound 3 of 20". Both numbers are whole, with 1 ≤ position ≤ count. */
export function positionLabel(position: number, count: number): string {
  if (
    !Number.isInteger(position) ||
    !Number.isInteger(count) ||
    position < 1 ||
    position > count
  ) {
    throw new RangeError(
      `A sound's position must be a whole number from 1 to the number of sounds, but got ${String(position)} of ${String(count)}.`,
    );
  }
  return `Sound ${String(position)} of ${String(count)}`;
}

/**
 * The label of a replayed sound's ripple: the side, the pitch, the level it was missed at, and
 * whether the cap changed its level (D25).
 */
export function rippleLabel(
  side: ReplaySideName,
  frequencyHz: number,
  missedLevelDb: number,
  capChangedLevel: boolean,
): string {
  requireSide(side);
  const now = capChangedLevel
    ? "Now it is as loud as the house may play."
    : "Now it is louder.";
  return `On your ${side}, ${pitchLabel(frequencyHz)}. When you did not catch it, it was ${relativeLevelLabel(missedLevelDb)}. ${now}`;
}

/** How often the visitor named the other side, or nothing when they never did. */
function wrongSideSentence(wrongSideCount: number): string | null {
  if (wrongSideCount === 0) {
    return null;
  }
  if (wrongSideCount === 1) {
    return "Once you named the other side.";
  }
  if (wrongSideCount === 2) {
    return "Two times you named the other side.";
  }
  return `${capitalised(countWords(wrongSideCount))} times you named the other side.`;
}

/**
 * The count of one side in words: "On your right I made seven sounds. You caught three.", with a
 * sentence on the other side when the visitor named it at least once.
 */
export function sideCountLine(
  side: ReplaySideName,
  madeCount: number,
  caughtCount: number,
  wrongSideCount: number,
): string {
  requireSide(side);
  requireCount(madeCount, "A count of sounds made");
  requireCount(caughtCount, "A count of sounds caught");
  requireCount(wrongSideCount, "A count of answers on the other side");
  if (caughtCount + wrongSideCount > madeCount) {
    throw new RangeError(
      `Sounds caught and answered on the other side cannot be more than the sounds made, but got ${String(caughtCount)} and ${String(wrongSideCount)} of ${String(madeCount)}.`,
    );
  }
  if (madeCount === 0) {
    return `I have not made a sound on your ${side} yet.`;
  }
  if (madeCount === 1) {
    const answer =
      caughtCount === 1
        ? "You caught it."
        : wrongSideCount === 1
          ? "You named the other side."
          : "You did not catch it.";
    return `On your ${side} I made one sound. ${answer}`;
  }
  const caught =
    caughtCount === madeCount
      ? "You caught every one."
      : caughtCount === 0
        ? "You caught none of them."
        : `You caught ${countWords(caughtCount)}.`;
  const wrongSide = wrongSideSentence(wrongSideCount);
  const made = `On your ${side} I made ${countWords(madeCount)} sounds. ${caught}`;
  return wrongSide === null ? made : `${made} ${wrongSide}`;
}

/** How the replay ended. For `allPlayed` with a selection, how many of how many sounds were played. */
export function endLine(
  ending: ReplayEndingName,
  replayCount: number,
  missedCount: number,
): string {
  if (!endingNames.includes(ending)) {
    throw new RangeError(`Unknown replay ending ${String(ending)}.`);
  }
  requireCount(replayCount, "A count of replayed sounds");
  requireCount(missedCount, "A count of missed sounds");
  if (replayCount > missedCount) {
    throw new RangeError(
      `A replay cannot play more sounds than were missed, but got ${String(replayCount)} of ${String(missedCount)}.`,
    );
  }
  if (ending === "deviceChanged") {
    return "Your audio device changed, so I cannot play the sounds again. Your picture is ready.";
  }
  if (ending === "soundRefused") {
    return "The house could not play these sounds on this device, so it stopped them. Your picture is ready.";
  }
  if (replayCount === 0) {
    throw new RangeError(
      "A replay that played every sound played at least one.",
    );
  }
  if (replayCount === missedCount) {
    return replayCount === 1
      ? "That was the one sound you did not catch."
      : "That was every sound you did not catch.";
  }
  if (replayCount === 1) {
    // A selection keeps at least the first and the last missed sound (D7).
    throw new RangeError(
      `A selection plays at least two sounds, but got 1 of ${String(missedCount)}.`,
    );
  }
  return `Those were ${countWords(replayCount)} of the ${countWords(missedCount)} sounds you did not catch.`;
}

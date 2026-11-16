import type { GhostSoundId } from "../config/sound-id";
import { limitsStatement } from "./limits-statement";
import {
  differenceLabel,
  unreliableReasonLine,
  wingLine,
  type WingWords,
} from "./result-lines";
import { pitchLabel, relativeLevelLabel, roomNames } from "./room-copy";
import { swappedRepeatCopy } from "./swapped-repeat-copy";

// Every sentence of the swapped repeat that depends on the repeat (swapped-repeat design.md,
// "`src/copy/swapped-repeat-lines.ts`"). A level is always given by relativeLevelLabel, so
// relative to the visitor's own calibration; a difference by differenceLabel, which names the
// side the quieter sound was caught on (result-page D19). Every attribution says "seems"
// (swapped-repeat Q1, decided by the owner on 2026-11-15).

/** A side: an ear or an earpiece. The session's `Ear` is checked to equal it. */
export type SwapSideName = "left" | "right";

/** Where the difference seems to belong. The session's `SwappedRepeatOutcome` is checked to equal it. */
export type SwappedRepeatOutcomeName =
  "followsEar" | "followsEarpiece" | "unclear";

/** Why an outcome is unclear. The session's `SwappedRepeatUnclearReason` is checked to equal it. */
export type SwappedRepeatUnclearReasonName = "noLevel" | "differenceShrank";

/** One ear of one run, as the copy needs it: the wing's words and the earpiece on that ear. */
export interface ComparisonWingWords extends WingWords {
  readonly earpiece: SwapSideName;
}

/** One run of the floor, as the copy needs it. The difference is right minus left, by ear. */
export interface ComparisonRunWords {
  readonly left: ComparisonWingWords;
  readonly right: ComparisonWingWords;
  readonly rightMinusLeftDb: number | null;
}

/**
 * The plain values of a floor's first run and its swapped repeat, for `comparisonDescription`.
 * `runs` holds the first run, with the headphones as marked, then the repeat, swapped.
 */
export interface ComparisonWords {
  readonly roomId: GhostSoundId;
  readonly frequencyHz: number;
  readonly runs: readonly [ComparisonRunWords, ComparisonRunWords];
  readonly outcome: SwappedRepeatOutcomeName;
  readonly unclearReason: SwappedRepeatUnclearReasonName | null;
}

const sideNames: readonly SwapSideName[] = Object.freeze(["left", "right"]);

const outcomeNames: readonly SwappedRepeatOutcomeName[] = Object.freeze([
  "followsEar",
  "followsEarpiece",
  "unclear",
]);

const unclearReasonNames: readonly SwappedRepeatUnclearReasonName[] =
  Object.freeze(["noLevel", "differenceShrank"]);

/** The first line of every unclear outcome. */
const unclearLine =
  "The swap did not make it clear where the difference belongs.";

/** The second line of an unclear outcome, by its reason. */
const unclearReasonLines: Readonly<
  Record<SwappedRepeatUnclearReasonName, string>
> = Object.freeze({
  differenceShrank:
    "With the headphones swapped, your left and right came out close together.",
  noLevel:
    "With the headphones swapped, one side has no level, so the two runs of this room cannot be set side by side.",
});

function requireSide(side: SwapSideName, name: string): void {
  if (!sideNames.includes(side)) {
    throw new RangeError(`Unknown ${name} ${String(side)}.`);
  }
}

function requireRoom(roomId: GhostSoundId): void {
  if (!Object.hasOwn(roomNames, roomId)) {
    throw new RangeError(`Unknown room ${String(roomId)}.`);
  }
}

/** The first letter in lower case, for a line that continues a sentence. */
function continued(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** A line without its closing full stop. */
function withoutFullStop(text: string): string {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

/** What the house says before the room runs again. */
export function readyLines(
  roomId: GhostSoundId,
  frequencyHz: number,
): readonly string[] {
  requireRoom(roomId);
  return Object.freeze([
    `${roomNames[roomId]}, ${pitchLabel(frequencyHz)}. The room runs again just as it did before.`,
    "Say on which side you hear each sound, as you did the first time. The side is your own ear, whichever earpiece is on it.",
  ]);
}

/**
 * The label of a caught sound's ripple in the repeat: the ear it was caught on, the earpiece it
 * came from, the pitch and the level. In a repeat each ear wears the other earpiece, so the two
 * sides differ.
 */
export function swappedCaughtLine(
  ear: SwapSideName,
  earpiece: SwapSideName,
  frequencyHz: number,
  levelDb: number,
): string {
  requireSide(ear, "ear");
  requireSide(earpiece, "earpiece");
  if (ear === earpiece) {
    throw new RangeError(
      `In a swapped repeat each ear wears the other earpiece, but got the ${ear} earpiece on the ${ear} ear.`,
    );
  }
  return `You caught it on your ${ear}, from the ${earpiece} earpiece. ${pitchLabel(frequencyHz)}, ${relativeLevelLabel(levelDb)}.`;
}

/**
 * Where the difference seems to belong, in order. A reason is given exactly for `unclear`. For
 * `followsEar` the last line is the limits statement's sentence on when to see a hearing
 * professional, the constant itself.
 */
export function outcomeLines(
  outcome: SwappedRepeatOutcomeName,
  unclearReason: SwappedRepeatUnclearReasonName | null,
): readonly string[] {
  if (!outcomeNames.includes(outcome)) {
    throw new RangeError(`Unknown outcome ${String(outcome)}.`);
  }
  if (outcome === "unclear") {
    if (unclearReason === null || !unclearReasonNames.includes(unclearReason)) {
      throw new RangeError(
        `An unclear outcome needs one of its reasons, but got ${String(unclearReason)}.`,
      );
    }
    return Object.freeze([unclearLine, unclearReasonLines[unclearReason]]);
  }
  if (unclearReason !== null) {
    throw new RangeError(
      `Only an unclear outcome has a reason, but ${outcome} got ${String(unclearReason)}.`,
    );
  }
  if (outcome === "followsEar") {
    return Object.freeze([
      "When you swapped the headphones, the same ear needed the louder sound. So the difference seems to belong to your ears.",
      limitsStatement.sentences[3],
    ]);
  }
  return Object.freeze([
    "When you swapped the headphones, the same earpiece needed the louder sound. So the difference seems to belong to the headphones.",
  ]);
}

/** One ear of one run in words: "left ear with the right earpiece, the quietest sound …". */
function wingWords(ear: SwapSideName, wing: ComparisonWingWords): string {
  requireSide(wing.earpiece, "earpiece");
  const line = continued(withoutFullStop(wingLine(wing)));
  const reason =
    wing.state === "unreliable" && wing.reasons.length > 0
      ? ` (${continued(withoutFullStop(unreliableReasonLine(wing.reasons[0])))})`
      : "";
  return `${ear} ear with the ${wing.earpiece} earpiece, ${line}${reason}`;
}

/** A run's difference in words, without "0 dB" and without "–" inside a sentence. */
function differenceWords(run: ComparisonRunWords): string {
  const bothFound = run.left.state === "found" && run.right.state === "found";
  if ((run.rightMinusLeftDb !== null) !== bothFound) {
    throw new RangeError(
      `A run has a left and right difference exactly when both ears are found, but got ${String(run.rightMinusLeftDb)} for ${run.left.state} and ${run.right.state}.`,
    );
  }
  if (run.rightMinusLeftDb === null) {
    return "no left and right difference, because one side has no level";
  }
  return Math.round(run.rightMinusLeftDb) === 0
    ? "the same level on the left and on the right"
    : differenceLabel(run.rightMinusLeftDb);
}

/** One run in words, with the earpieces it must have: as marked its own, swapped the other. */
function runWords(
  label: string,
  run: ComparisonRunWords,
  swapped: boolean,
): string {
  for (const ear of sideNames) {
    const wanted = swapped ? (ear === "left" ? "right" : "left") : ear;
    if (run[ear].earpiece !== wanted) {
      throw new RangeError(
        `${label}: the ${ear} ear must wear the ${wanted} earpiece, but got ${String(run[ear].earpiece)}.`,
      );
    }
  }
  return `${label}: ${wingWords("left", run.left)}; ${wingWords("right", run.right)}; ${differenceWords(run)}.`;
}

/**
 * Both runs of a floor and the outcome in words, for a visitor who cannot see the picture: the
 * room and pitch, each run by ear with its earpiece and the run's difference, then the outcome
 * lines.
 */
export function comparisonDescription(input: ComparisonWords): string {
  requireRoom(input.roomId);
  const [first, repeat] = input.runs;
  const lines = outcomeLines(input.outcome, input.unclearReason);
  return [
    `${roomNames[input.roomId]}, ${pitchLabel(input.frequencyHz)}.`,
    runWords(swappedRepeatCopy.runLabels.asMarked, first, false),
    runWords(swappedRepeatCopy.runLabels.swapped, repeat, true),
    ...lines,
  ].join(" ");
}

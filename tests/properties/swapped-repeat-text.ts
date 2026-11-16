import { calibrationCopy } from "../../src/copy/calibration-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import type {
  SwappedRepeat,
  SwappedRepeatComparison,
  SwappedTrialScoredEvent,
} from "../../src/session/visit-flow-types";

// The generated text of the swapped repeat and the allowed forms of CP9 (swapped-repeat design.md,
// "Correctness properties"). Generated text is every field the contract describes as something to
// show or say: every string of a view (`heading`, `roomName`, `pitchLabel`,
// `firstDifferenceLabel`, `stopLabel`, `backLabel` and each phase's lines and labels), every
// string of a Comparison (`heading`, each run's `label` and `differenceLabel`, each wing's
// `earpieceLabel`, `line` and `reasonLine`, `outcomeLabel`, `outcomeLines`, `description`), the
// `line` of a `swappedTrialScored` event, and a result snapshot's `turnBackLine`. Code values
// (phase, reason, ending, ear, earpiece, outcome, numbers) are not generated text.
//
// Three exceptions to CP9, chosen by the owner's coordinator (the owner has not decided them and
// may reverse them), and no other: a string that is exactly `calibrationCopy.keptLine` is not
// checked for the word "only" (2026-11-15); a string that is exactly
// `headphoneCheckCopy.judgementLines.bothSides`, the visit's headphone check line that the swap
// check reuses word for word for an answer of both sides, is not checked for the word "only"
// either, for the same reason: it is another spec's line, reused word for word and checked by its
// own spec (regression 1); and a string that is exactly "0 dB" is allowed by the rule on decibels,
// as `result-page-text.ts` allows it (2026-11-15).

/** One string to check, with where it came from. */
export interface PlacedRepeatText {
  /** Such as "view.lines[1]" or "view.comparison.runs[0].left.line". */
  readonly place: string;
  readonly text: string;
}

/** Every string of a Comparison, each with its place. */
export function comparisonTexts(
  comparison: SwappedRepeatComparison,
  prefix = "comparison",
): PlacedRepeatText[] {
  const texts: PlacedRepeatText[] = [];
  const add = (place: string, text: string | null): void => {
    if (text !== null) {
      texts.push({ place: `${prefix}.${place}`, text });
    }
  };
  add("heading", comparison.heading);
  comparison.runs.forEach((run, index) => {
    const at = `runs[${String(index)}]`;
    add(`${at}.label`, run.label);
    add(`${at}.differenceLabel`, run.differenceLabel);
    for (const wing of [run.left, run.right]) {
      add(`${at}.${wing.ear}.earpieceLabel`, wing.earpieceLabel);
      add(`${at}.${wing.ear}.line`, wing.line);
      add(`${at}.${wing.ear}.reasonLine`, wing.reasonLine);
    }
  });
  add("outcomeLabel", comparison.outcomeLabel);
  comparison.outcomeLines.forEach((line, index) =>
    add(`outcomeLines[${String(index)}]`, line),
  );
  add("description", comparison.description);
  return texts;
}

/** Every string of a view, each with its place. */
export function repeatViewTexts(
  view: SwappedRepeat,
  prefix = "view",
): PlacedRepeatText[] {
  const texts: PlacedRepeatText[] = [];
  const add = (place: string, text: string | null): void => {
    if (text !== null) {
      texts.push({ place: `${prefix}.${place}`, text });
    }
  };
  const addAll = (place: string, lines: readonly string[]): void =>
    lines.forEach((line, index) => add(`${place}[${String(index)}]`, line));
  add("heading", view.heading);
  add("roomName", view.roomName);
  add("pitchLabel", view.pitchLabel);
  add("firstDifferenceLabel", view.firstDifferenceLabel);
  add("stopLabel", view.stopLabel);
  add("backLabel", view.backLabel);
  switch (view.phase) {
    case "unavailable":
      add("line", view.line);
      break;
    case "instruction":
      addAll("lines", view.lines);
      add("againLine", view.againLine);
      add("confirmLabel", view.confirmLabel);
      break;
    case "check":
      add("question", view.question);
      for (const [answer, label] of Object.entries(view.answers)) {
        add(`answers.${answer}`, label);
      }
      add("playLabel", view.playLabel);
      add("playRefusalLine", view.playRefusalLine);
      add("judgementLine", view.judgementLine);
      add("cutLine", view.cutLine);
      break;
    case "ready":
      add("judgementLine", view.judgementLine);
      addAll("lines", view.lines);
      add("startLabel", view.startLabel);
      break;
    case "room":
      for (const side of ["left", "right"] as const) {
        add(`answers.${side}.name`, view.answers[side].name);
        add(`answers.${side}.hint`, view.answers[side].hint);
      }
      add("pauseLabel", view.pauseLabel);
      add("pauseLine", view.pauseLine);
      add("resumeLabel", view.resumeLabel);
      break;
    case "finished":
      add("endLine", view.endLine);
      add("turnBackLine", view.turnBackLine);
      if (view.comparison !== null) {
        texts.push(...comparisonTexts(view.comparison, `${prefix}.comparison`));
      }
      break;
  }
  return texts;
}

/** The string of a `swappedTrialScored` event, when it has one. */
export function repeatEventTexts(
  event: SwappedTrialScoredEvent,
  prefix = "event",
): PlacedRepeatText[] {
  return event.line === null
    ? []
    : [{ place: `${prefix}.line`, text: event.line }];
}

/** A result snapshot's Turn_Back_Line, when it has one. */
export function turnBackTexts(
  turnBackLine: string | null,
  prefix = "result",
): PlacedRepeatText[] {
  return turnBackLine === null
    ? []
    : [{ place: `${prefix}.turnBackLine`, text: turnBackLine }];
}

// ─── The allowed forms of CP9 ────────────────────────────────────────────────────────────

/** What may follow "{n} dB": a level relative to the calibration, or a difference by its side. */
export const decibelFollowers: readonly string[] = Object.freeze([
  " quieter than your calibration",
  " louder than your calibration",
  " quieter on the left",
  " quieter on the right",
]);

/** Words about accuracy or certainty (CP9). Nothing is said about how accurate the house is, and no attribution is certain. */
export const accuracyWords: readonly string[] = Object.freeze([
  "accurate",
  "accuracy",
  "precise",
  "precision",
  "exact",
  "exactly",
  "validated",
  "verified",
  "guaranteed",
  "certain",
  "certainly",
  "definitely",
  "proves",
  "proof",
  "caused",
]);

/** Words that compare the visitor with anyone, beyond those of the banned list (CP9). */
export const comparisonWords: readonly string[] = Object.freeze([
  "others",
  "everyone",
  "most people",
]);

/** Words of blame (CP9). The house never mocks the visitor and never calls the headphones faulty. */
export const blameWords: readonly string[] = Object.freeze([
  "fail",
  "failed",
  "wrong",
  "bad",
  "poor",
  "faulty",
  "broken",
  "only",
]);

/** The pattern of each word or phrase, made once. */
const wordPatterns = new Map<string, RegExp>();

/** Matches `word` as a whole word or phrase, in any letter case. */
function wordPattern(word: string): RegExp {
  let pattern = wordPatterns.get(word);
  if (pattern === undefined) {
    pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${word.replaceAll(" ", "\\s+")}(?![\\p{L}\\p{N}])`,
      "iu",
    );
    wordPatterns.set(word, pattern);
  }
  return pattern;
}

/** The words of `words` that appear in `text` as whole words or phrases, in any letter case. */
export function wordsIn(text: string, words: readonly string[]): string[] {
  return words.filter((word) => wordPattern(word).test(text));
}

/**
 * The strings that are not checked for the word "only", each another spec's line reused word for
 * word and checked by its own spec (the coordinator's exceptions): the calibration spec's safety
 * line, and the visit's headphone check line for an answer of both sides (regression 1).
 */
const onlyAllowedIn: readonly string[] = Object.freeze([
  calibrationCopy.keptLine,
  headphoneCheckCopy.judgementLines.bothSides,
]);

/**
 * The words of blame in `text`. A string that is exactly one of `onlyAllowedIn` is not checked for
 * "only"; every other word is checked in every string.
 */
export function blameWordsIn(text: string): string[] {
  const found = wordsIn(text, blameWords);
  return onlyAllowedIn.includes(text)
    ? found.filter((word) => word !== "only")
    : found;
}

/** The places in `text` where "{n} dB" is not followed by an allowed form, unless the text is exactly "0 dB". */
export function decibelsWithoutAllowedForm(text: string): string[] {
  if (text === "0 dB") {
    return [];
  }
  const misses: string[] = [];
  for (const match of text.matchAll(/(?<![\d.])\d+ dB/g)) {
    const rest = text.slice((match.index ?? 0) + match[0].length);
    if (!decibelFollowers.some((follower) => rest.startsWith(follower))) {
      misses.push(text.slice(match.index ?? 0));
    }
  }
  return misses;
}

/** Every pitch label in `text`, such as "500 Hz" or "4 kHz". */
export function pitchLabelsIn(text: string): string[] {
  return [...text.matchAll(/(?<![\d.])\d+(?:\.\d+)? k?Hz/g)].map(
    (match) => match[0],
  );
}

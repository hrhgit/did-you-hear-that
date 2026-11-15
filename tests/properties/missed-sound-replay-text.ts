import type {
  MissedSoundReplay,
  ReplaySound,
  ReplaySoundStartedEvent,
} from "../../src/session/visit-flow-types";

// The generated text of the missed-sound replay and the allowed forms of CP9 (missed-sound-replay
// design.md, "Correctness properties"). Generated text is every field the contract describes as
// something to show or say: `heading`, `selectionLine`, `stopLabel`, `proceedLabel`, `line`,
// `announcementLines`, `startLabel`, `pauseLine`, `resumeLabel`, `endLine`, the counts' `leftLine`
// and `rightLine`, and each sound's `positionLabel`, `roomName`, `pitchLabel` and `rippleLabel`.
// Code values (phase, ending, ear, room ids, numbers) are not generated text.

/** One string to check, with where it came from. */
export interface PlacedReplayText {
  /** Such as "view.announcementLines[2]" or "event.sound.rippleLabel". */
  readonly place: string;
  readonly text: string;
  /** The sound the string belongs to, or null for a string outside a sound. */
  readonly sound: ReplaySound | null;
}

/** The generated text of one sound. */
export function soundTexts(
  sound: ReplaySound,
  prefix: string,
): PlacedReplayText[] {
  return [
    { place: `${prefix}.positionLabel`, text: sound.positionLabel, sound },
    { place: `${prefix}.roomName`, text: sound.roomName, sound },
    { place: `${prefix}.pitchLabel`, text: sound.pitchLabel, sound },
    { place: `${prefix}.rippleLabel`, text: sound.rippleLabel, sound },
  ];
}

/** Every string of a view, each with its place. */
export function replayViewTexts(
  view: MissedSoundReplay,
  prefix = "view",
): PlacedReplayText[] {
  const texts: PlacedReplayText[] = [];
  const add = (place: string, text: string | null): void => {
    if (text !== null) {
      texts.push({ place: `${prefix}.${place}`, text, sound: null });
    }
  };
  add("heading", view.heading);
  add("selectionLine", view.selectionLine);
  add("stopLabel", view.stopLabel);
  add("proceedLabel", view.proceedLabel);
  const addCounts = (
    counts: { readonly leftLine: string; readonly rightLine: string } | null,
  ): void => {
    if (counts !== null) {
      add("counts.leftLine", counts.leftLine);
      add("counts.rightLine", counts.rightLine);
    }
  };
  switch (view.phase) {
    case "nothingMissed":
      add("line", view.line);
      addCounts(view.counts);
      break;
    case "announcing":
      view.announcementLines.forEach((line, index) =>
        add(`announcementLines[${String(index)}]`, line),
      );
      add("startLabel", view.startLabel);
      break;
    case "playing":
      add("pauseLine", view.pauseLine);
      add("resumeLabel", view.resumeLabel);
      addCounts(view.counts);
      if (view.current !== null) {
        texts.push(...soundTexts(view.current, `${prefix}.current`));
      }
      break;
    case "finished":
      add("endLine", view.endLine);
      addCounts(view.counts);
      if (view.last !== null) {
        texts.push(...soundTexts(view.last, `${prefix}.last`));
      }
      break;
  }
  return texts;
}

/** Every string of a `replaySoundStarted` event. */
export function replayEventTexts(
  event: ReplaySoundStartedEvent,
  prefix = "event",
): PlacedReplayText[] {
  return soundTexts(event.sound, `${prefix}.sound`);
}

// ─── The allowed forms of CP9 ────────────────────────────────────────────────────────────

/** What may follow a number of decibels: a level relative to the calibration, or the raise as a difference. */
export const decibelSuffixes: readonly string[] = [
  " quieter than your calibration",
  " louder than your calibration",
  " louder than when it went by",
];

/** Words about accuracy (CP9). Nothing is said about how accurate the house is (wording.md). */
export const accuracyWords: readonly string[] = [
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
];

/** Words that compare the visitor with anyone, beyond those of the banned list (CP9). */
export const comparisonWords: readonly string[] = [
  "others",
  "everyone",
  "most people",
];

/** Words of blame (CP9). The house never mocks a missed sound (wording.md, Tone). */
export const blameWords: readonly string[] = [
  "fail",
  "failed",
  "wrong",
  "bad",
  "poor",
  "only",
];

/** The words of `words` that appear in `text` as whole words or phrases, in any letter case. */
export function wordsIn(text: string, words: readonly string[]): string[] {
  return words.filter((word) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${word.replaceAll(" ", "\\s+")}(?![\\p{L}\\p{N}])`,
      "iu",
    ).test(text),
  );
}

/** Every number of decibels in `text` that is not followed by an allowed suffix. */
export function decibelsWithoutSuffix(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\d+ dB/g)) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    if (!decibelSuffixes.some((suffix) => after.startsWith(suffix))) {
      found.push(match[0]);
    }
  }
  return found;
}

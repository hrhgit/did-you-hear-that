import type { AnswerSide } from "./room-copy";

/**
 * What the visitor reads while a room practises before it counts (audible-start, light plan of
 * 2026-11-16). Each ear hears the room's sound once at a level that should be easy to hear, a
 * little louder if it is missed, and nothing of the practice is counted.
 */
export const practiceCopy = Object.freeze({
  heading: "Practice",
  lines: Object.freeze([
    "First, a practice. This room makes its sound once in each ear, loud enough to hear easily.",
    "Answer which side it came from. Nothing counts yet.",
  ]),
  soundPlayingLine: "Listen. It is making its sound now.",
  countingLines: Object.freeze([
    "Now it counts. The sounds get quieter, and some turns make no sound at all.",
    "Each answer costs your lantern a light. A catch gives it back.",
  ]),
  /** The label of the ripple of a caught practice sound. */
  caughtLine: "That's it. You heard it.",
  tryAgainLabel: "Try again",
  goOnLabel: "Start counting",
});

/** The side named in the not-heard lines. */
const sideName: Readonly<Record<AnswerSide, string>> = Object.freeze({
  left: "left",
  right: "right",
});

/**
 * The lines of the not-heard notice: which side did not catch the practice sound, what to check,
 * and what each choice does. Throws a `RangeError` for an empty list of ears.
 */
export function notHeardLines(ears: readonly AnswerSide[]): readonly string[] {
  if (ears.length === 0) {
    throw new RangeError("The not-heard lines need at least one ear.");
  }
  const sides =
    ears.length === 1
      ? `your ${sideName[ears[0] as AnswerSide]} side`
      : "either side";
  return Object.freeze([
    `The practice sound was not caught on ${sides}, even a little louder.`,
    "Check that the earpieces are in and that the volume is where you set it.",
    "Start counting goes on anyway; a side you cannot hear here will show as louder than this room can play. Try again plays the practice once more.",
  ]);
}

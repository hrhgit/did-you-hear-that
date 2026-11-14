/** The four answers to "Which side was the hiss on?" (R17.3). */
export type HeadphoneCheckAnswer =
  "left" | "right" | "bothSides" | "nothingHeard";

/** What an answer says about the headphones (R17.7). */
export type HeadphoneCheckJudgement =
  "correct" | "swapped" | "bothSides" | "notHeard";

/**
 * Judges the visitor's answer to the headphone check, which always plays in the left ear (D20).
 * A pure function. Throws a `RangeError` for anything that is not one of the four answers.
 */
export function judgeHeadphoneCheck(
  answer: HeadphoneCheckAnswer,
): HeadphoneCheckJudgement {
  switch (answer) {
    case "left":
      return "correct";
    case "right":
      return "swapped";
    case "bothSides":
      return "bothSides";
    case "nothingHeard":
      return "notHeard";
    default:
      throw new RangeError(
        `A headphone check answer must be left, right, bothSides or nothingHeard, but got ${String(answer)}.`,
      );
  }
}

import type {
  HeadphoneCheckAnswer,
  SwapCheckJudgement,
} from "./visit-flow-types";

/**
 * Judges the visitor's answer to the swap check (swapped-repeat design.md, D6). The hiss always
 * plays in the left earpiece, so after a swap it is heard on the right. A pure function. Throws a
 * `RangeError` for anything that is not one of the four answers.
 */
export function judgeSwapCheck(
  answer: HeadphoneCheckAnswer,
): SwapCheckJudgement {
  switch (answer) {
    case "right":
      return "confirmed";
    case "left":
      return "notSwapped";
    case "bothSides":
      return "bothSides";
    case "nothingHeard":
      return "notHeard";
    default:
      throw new RangeError(
        `A swap check answer must be left, right, bothSides or nothingHeard, but got ${String(answer)}.`,
      );
  }
}

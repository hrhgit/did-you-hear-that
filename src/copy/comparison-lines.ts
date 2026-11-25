import { visitDateLabel } from "./saved-visit-lines";

// The copy of the comparison with an earlier visit (result-page design.md,
// "`src/copy/comparison-lines.ts`", D25). No line compares the two visits: each names the earlier
// visit's date, and each visit is relative to its own calibration. No function takes or gives the
// visitor's name for the headphones (D11).

/** The fixed strings of the comparison. */
export const comparisonCopy = Object.freeze({
  /** Under the headphone name field. */
  headphoneNameHint:
    "Use the same name next time, and this visit is drawn there as faint lines.",
  /** When a name is typed and no earlier visit has it. */
  noEarlierVisitLine:
    "No earlier visit with headphones of this name is saved in this browser.",
});

/** The line of a picture drawn with the faint lines of an earlier visit of `localDate`. */
export function earlierVisitLine(localDate: string): string {
  return `The faint lines are your visit of ${visitDateLabel(localDate)} with headphones of the same name. Each visit is relative to its own calibration.`;
}

/** The line of a picture whose earlier visit of `localDate` was unreliable as a whole. */
export function earlierVisitUnreliableLine(localDate: string): string {
  return `Your visit of ${visitDateLabel(localDate)} with headphones of the same name was unreliable as a whole, so it is not drawn.`;
}

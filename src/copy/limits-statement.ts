/**
 * The four statements that wording.md requires next to the result picture, written once. The
 * only strings that may use "diagnosis" and "clinical", and only in the negative (wording.md,
 * "One exception"; banned-terms.ts, limitsStatementAllowedTerms).
 */
export const limitsStatement = Object.freeze({
  heading: "What this picture can tell you",
  sentences: Object.freeze([
    "Headphones differ at every pitch, so floors cannot be compared with each other.",
    "What can be compared is your left against your right on one floor, and this visit against your own later visits with the same headphones.",
    "This is not a diagnosis, and it has not been checked against clinical equipment.",
    "See a hearing professional if a difference between your left and your right is still there after you swap the headphones, if your hearing changes suddenly, or if ringing in your ears does not go away.",
  ]) as readonly [string, string, string, string],
});

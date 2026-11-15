/**
 * Words and phrases that never appear in visitor-facing text. This is exactly the list under
 * "Words that never appear in visitor-facing text" in `.kiro/steering/wording.md`. The copy
 * check and the copy share this one source.
 */
export const bannedTerms: readonly string[] = Object.freeze([
  "normal",
  "abnormal",
  "healthy",
  "impaired",
  "damaged",
  "loss",
  "deaf",
  "diagnosis",
  "diagnose",
  "diagnostic",
  "screening",
  "clinical",
  "medical",
  "audiogram",
  "dB HL",
  "hearing level",
  "average",
  "typical",
  "people your age",
  "percentile",
  "test result",
  "pass",
  "fail",
  "score",
]);

/**
 * The only banned terms the fixed limits statement may use, and only in the negative
 * (wording.md, "One exception"). The copy check allows them in the strings of the export
 * `limitsStatement` of `src/copy/limits-statement.ts` and nowhere else.
 */
export const limitsStatementAllowedTerms: readonly string[] = Object.freeze([
  "diagnosis",
  "clinical",
]);

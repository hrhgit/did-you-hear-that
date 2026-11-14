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

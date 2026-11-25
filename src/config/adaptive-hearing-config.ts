/** The assumed response curve for the game's hearing estimate. */
export const adaptiveHearingConfig = Object.freeze({
  /** Scale of the gradual change from missed to heard, in dB. */
  responseSpreadDb: 2.5,
  /** Allows for distraction, guesses and other responses that do not fit the curve. */
  outlierFraction: 0.06,
  /** A clear sound can still get a late answer. Good alone is weak evidence. */
  slowClearFraction: 0.15,
  /** Required probability within concentratedWithinDb of the estimate. */
  concentratedProbabilityFraction: 0.8,
  /** How far below the clear threshold a sound is caught half the time. */
  detectionLeadDb: 5,
  /** Spacing between candidate thresholds. */
  candidateStepDb: 0.5,
  /** Smallest descent, except for the final step to the floor. */
  minDropDb: 2,
  /** Spread of quick answer times around the visitor's baseline. */
  fastSpreadMs: 150,
  /** Extra time an effortful catch takes on average. */
  slowExtraMs: 350,
  /** Spread of effortful answer times. */
  slowSpreadMs: 300,
  /** Fewest loud catches before using the visitor's answer-time baseline. */
  baselineCatchesMinCount: 3,
  /** Width of the prior used only to choose the next probe. */
  steeringSpreadDb: 12,
  /** Distance from the estimate used to judge concentration. */
  concentratedWithinDb: 2.5,
  /** Lower percentile of the reported range. */
  rangeLowFraction: 0.1,
  /** Upper percentile of the reported range. */
  rangeHighFraction: 0.9,
  /**
   * How far above the quietest clear catch the estimate may lie. A clear catch can come a little
   * above the Clear_Threshold, so the catch is not a hard bound (fine-level-estimate, Measured).
   */
  estimateAboveClearMaxDb: 2.5,
});

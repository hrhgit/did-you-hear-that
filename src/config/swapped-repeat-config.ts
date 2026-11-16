/**
 * The number the swapped repeat adds (swapped-repeat design.md, "Config"). The limit that offers
 * the repeat is `hearingMethodConfig.swappedRepeatDifferenceDb`; the search's settings are
 * `hearingMethodConfig`; the hiss of the swap check plays at `audioOutputConfig.headphoneCheckLevelDb`
 * through the output stage; the most refusals in a row is `visitFlowConfig.refusedPlaysInARowMaxCount`.
 */
export interface SwappedRepeatConfig {
  /**
   * Brief 08: unclear includes "a difference that shrank below half the limit". The repeat's left
   * and right difference counts as shrunk when its size is below this share of
   * `swappedRepeatDifferenceDb`. Above 0 and below 1.
   */
  readonly unclearBelowLimitFraction: number;
}

/** Freezes a value and everything reachable from it, so no field can change at run time. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export const swappedRepeatConfig: SwappedRepeatConfig = deepFreeze({
  // Brief 08, "half the limit"
  unclearBelowLimitFraction: 0.5,
});

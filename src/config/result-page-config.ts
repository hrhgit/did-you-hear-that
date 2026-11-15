/**
 * The numbers the result page adds (result-page design.md, "Config"). None of them changes a
 * sound, a wait or a decision about an answer. Every field name ends in its unit.
 */
export interface ResultPageConfig {
  /**
   * Decided on 2026-11-15 on the owner's behalf, at the owner's request (result-page design.md,
   * D15 and Q1). How far the light reaches into a wing, as a fraction of the wing, for a
   * threshold found at its floor's own loudest playable level (the floor's searchCapDb).
   */
  readonly foundLightDepthAtCapFraction: number;
  /**
   * Decided on 2026-11-15 on the owner's behalf, at the owner's request (D15, Q1). The same, for
   * a threshold found at the quietest playable level (hearingMethodConfig.floorDb).
   */
  readonly foundLightDepthAtFloorFraction: number;
  /** Brief 06: "Better than floor: light to the far wall". */
  readonly betterThanFloorLightDepthFraction: number;
  /** Brief 06: "Worse than cap: the wing stays dark". */
  readonly worseThanCapLightDepthFraction: number;
  /**
   * Decided on 2026-11-15 on the owner's behalf, at the owner's request (D12, Q4). The most saved
   * visits the house keeps in one browser.
   */
  readonly savedVisitsMaxCount: number;
  /**
   * Decided on 2026-11-15 on the owner's behalf, at the owner's request (D11, Q5). The longest
   * name a visitor may give the headphones, in Unicode code points after the name is tidied.
   */
  readonly headphoneNameMaxCharacterCount: number;
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

export const resultPageConfig: ResultPageConfig = deepFreeze({
  // D15, Q1: decided on 2026-11-15 on the owner's behalf, at the owner's request.
  foundLightDepthAtCapFraction: 0.1,
  // D15, Q1: decided on 2026-11-15 on the owner's behalf, at the owner's request.
  foundLightDepthAtFloorFraction: 0.9,
  // Brief 06
  betterThanFloorLightDepthFraction: 1,
  // Brief 06
  worseThanCapLightDepthFraction: 0,
  // D12, Q4: decided on 2026-11-15 on the owner's behalf, at the owner's request.
  savedVisitsMaxCount: 20,
  // D11, Q5: decided on 2026-11-15 on the owner's behalf, at the owner's request.
  headphoneNameMaxCharacterCount: 40,
});

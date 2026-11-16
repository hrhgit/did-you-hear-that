/**
 * The numbers the visit flow adds (visit-flow design.md, "Config"). Everything else the flow needs
 * comes from `hearingMethodConfig`, `audioOutputConfig` and `ghostSoundConfig`. Every field name
 * ends in its unit.
 */
export interface VisitFlowConfig {
  /**
   * Decided by the owner's coordinator on 2026-11-16, at the owner's request (visit-flow
   * design.md, D17 and Q1). A visit whose false alarm rate over the no-sound trials of all its
   * rooms is above this is marked unreliable as a whole. A strict limit: a rate exactly at it is
   * not above it.
   */
  readonly visitFalseAlarmRateUnreliableAboveFraction: number;
  /** After this many refusals in a row of one trial's sound, the visit ends (D25). */
  readonly refusedPlaysInARowMaxCount: number;
  /**
   * The level of each ear's first practice sound, relative to the anchor (audible-start, light
   * plan of 2026-11-16). Never above the room's search cap: the practice plays the lower of the two.
   */
  readonly practiceStartLevelDb: number;
  /** The wait before each practice sound. */
  readonly practiceGapMs: number;
  /**
   * How many sounds an ear hears in one practice round before the round gives up on it: the start,
   * then one upward step louder each time, never above the room's search cap.
   */
  readonly practiceSoundsPerEarMaxCount: number;
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

export const visitFlowConfig: VisitFlowConfig = deepFreeze({
  // D17, Q1: proposed by this spec from the measurement in design.md; decided by the owner's
  // coordinator on 2026-11-16, at the owner's request.
  visitFalseAlarmRateUnreliableAboveFraction: 0.2,
  // D25
  refusedPlaysInARowMaxCount: 3,
  // Light plan of 2026-11-16: the anchor, the comfortable level the visitor set.
  practiceStartLevelDb: 0,
  practiceGapMs: 2000,
  // The anchor, then one step louder (+5 dB, the rise limit), then the not-heard notice.
  practiceSoundsPerEarMaxCount: 2,
});

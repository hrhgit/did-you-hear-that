/**
 * The two visits that walk through rooms: the visit of about 7 minutes and the visit of about 12
 * minutes.
 */
export type VisitType = "quick" | "full";

/**
 * The initial values of the threshold search, from the "Initial values" table in
 * `.kiro/steering/hearing-method.md`, and the threshold search rule values settled in the
 * Decisions section of `.kiro/specs/threshold-search/design.md`. Every field name ends in its
 * unit.
 *
 * Levels are in decibels relative to the calibration anchor: 0 is the anchor and negative is
 * quieter. Step sizes are positive magnitudes: the engine subtracts `downwardStepDb` after a
 * catch and adds `upwardStepDb` after a miss.
 */
export interface HearingMethodConfig {
  readonly downwardStepDb: number;
  readonly upwardStepDb: number;
  readonly startingLevelDb: number;
  readonly capRelativeToAnchorDb: number;
  readonly floorDb: number;
  readonly responseWindowMs: number;
  readonly gapBetweenTrialsMinMs: number;
  readonly gapBetweenTrialsMaxMs: number;
  readonly noSoundTrialShareMinFraction: number;
  readonly noSoundTrialShareMaxFraction: number;
  /** A strict limit: a false alarm rate exactly at this value still counts as reliable. */
  readonly falseAlarmRateUnreliableAboveFraction: number;
  readonly trialLimitPerEarPerRoomCount: number;
  readonly swappedRepeatDifferenceDb: number;
  readonly roomFrequenciesHz: Readonly<Record<VisitType, readonly number[]>>;
  /** Chance that a trial in the search phase of a room is a no-sound trial. */
  readonly noSoundTrialProbabilityFraction: number;
  /** Fewest ascending catches at one level for that level to be the threshold. */
  readonly thresholdCatchesMinCount: number;
  /** Smallest share of catches among the ascending presentations at one level for the threshold. */
  readonly thresholdCatchShareMinFraction: number;
  /** Catches at the floor, in any direction, that end an ear as better than floor. */
  readonly floorCatchesForBetterThanFloorCount: number;
  /** Ascending misses and wrong-side answers at the cap that end an ear as worse than cap. */
  readonly capMissesForWorseThanCapCount: number;
  /** A catch at least this far below an ear's result marks the ear unreliable. */
  readonly inconsistentCatchMarginDb: number;
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

export const hearingMethodConfig: HearingMethodConfig = deepFreeze({
  // "Downward step after a catch | 10 dB"
  downwardStepDb: 10,
  // "Upward step after a miss | 5 dB"
  upwardStepDb: 5,
  // "Starting level | 25 dB below the anchor"
  startingLevelDb: -25,
  // "Loudest allowed level | 15 dB above the anchor"
  capRelativeToAnchorDb: 15,
  // "Quietest playable level | 70 dB below the anchor"
  floorDb: -70,
  // "Response window after a sound starts | 2.0 s"
  responseWindowMs: 2000,
  // "Gap between trials | random, 1.5 to 4.0 s" (lower limit)
  gapBetweenTrialsMinMs: 1500,
  // "Gap between trials | random, 1.5 to 4.0 s" (upper limit)
  gapBetweenTrialsMaxMs: 4000,
  // "Share of no-sound trials | 15 to 25 percent" (lower limit)
  noSoundTrialShareMinFraction: 0.15,
  // "Share of no-sound trials | 15 to 25 percent" (upper limit)
  noSoundTrialShareMaxFraction: 0.25,
  // "False alarm rate that marks a visit unreliable | above 30 percent"
  falseAlarmRateUnreliableAboveFraction: 0.3,
  // "Trial limit per ear per room | 20"
  trialLimitPerEarPerRoomCount: 20,
  // "Left and right difference that triggers the swapped repeat | 15 dB"
  swappedRepeatDifferenceDb: 15,
  roomFrequenciesHz: {
    // "Rooms, quick visit | 1 kHz, 4 kHz, 8 kHz"
    quick: [1000, 4000, 8000],
    // "Rooms, full visit | 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz"
    full: [500, 1000, 2000, 4000, 8000],
  },
  // Not in the steering table. threshold-search design.md, D8: the middle of the no-sound share range
  noSoundTrialProbabilityFraction: 0.2,
  // Not in the steering table. threshold-search design.md, D1: at least 2 ascending catches at one level
  thresholdCatchesMinCount: 2,
  // Not in the steering table. threshold-search design.md, D1: catches are at least half of the ascending presentations
  thresholdCatchShareMinFraction: 0.5,
  // Not in the steering table. threshold-search design.md, D3: 2 catches at the floor
  floorCatchesForBetterThanFloorCount: 2,
  // Not in the steering table. threshold-search design.md, D4: 2 ascending non-catches at the cap
  capMissesForWorseThanCapCount: 2,
  // Not in the steering table. threshold-search design.md, D5: one downward step below the result
  inconsistentCatchMarginDb: 10,
});

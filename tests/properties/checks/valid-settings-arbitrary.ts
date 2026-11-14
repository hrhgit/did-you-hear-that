import fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { validateSearchSettings } from "../../../src/engine/validate-search-settings";

const hundredths = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min, max }).map((units) => units / 100);

/** Is `settings` accepted by `validateSearchSettings`? Any other error is a bug and is thrown. */
function isAccepted(settings: ThresholdSearchSettings): boolean {
  try {
    validateSearchSettings(settings);
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

/**
 * Settings that `validateSearchSettings` accepts, spread over every rule it checks (design.md,
 * CP13; D38). Spec-only: it imports the engine's validation.
 *
 * Steps are 1 to 10 dB up and 1 to 4 upward steps down. The floor and the cap are 0 to 20 upward
 * steps from a start between −60 and 0, so the start can sit on the floor or the cap. Gaps are
 * from 1 ms. Shares are on a 0.01 grid with a minimum to 0.30 and a maximum up to 0.30 above it.
 * The probability lies inside the share range. The false alarm limit and the catch share run
 * from 0 to 1. The counts run from 1 to 4, the trial limit from 1 to 30 and the margin from 1 to
 * 30 dB. Values are mostly built to satisfy the per-field rules. The filter then removes the
 * combinations that break a rule across fields: a floor equal to the cap, and share ranges that
 * leave some room length without a fitting number of no-sound trials (R2.9).
 */
export const validSettingsArbitrary: fc.Arbitrary<ThresholdSearchSettings> = fc
  .record({
    upwardStepDb: fc.integer({ min: 1, max: 10 }),
    downwardStepMultiple: fc.integer({ min: 1, max: 4 }),
    startingLevelDb: fc.integer({ min: -60, max: 0 }),
    floorStepsBelowStart: fc.integer({ min: 0, max: 20 }),
    capStepsAboveStart: fc.integer({ min: 0, max: 20 }),
    gapBetweenTrialsMinMs: fc.integer({ min: 1, max: 3000 }),
    gapRangeMs: fc.integer({ min: 0, max: 3000 }),
    shareMinHundredths: fc.integer({ min: 0, max: 30 }),
    shareWidthHundredths: fc.integer({ min: 0, max: 30 }),
    probabilityPositionFraction: hundredths(0, 100),
    falseAlarmRateUnreliableAboveFraction: hundredths(0, 100),
    trialLimitPerEarPerRoomCount: fc.integer({ min: 1, max: 30 }),
    thresholdCatchesMinCount: fc.integer({ min: 1, max: 4 }),
    thresholdCatchShareMinFraction: hundredths(0, 100),
    floorCatchesForBetterThanFloorCount: fc.integer({ min: 1, max: 4 }),
    capMissesForWorseThanCapCount: fc.integer({ min: 1, max: 4 }),
    inconsistentCatchMarginDb: fc.integer({ min: 1, max: 30 }),
  })
  .map((drawn): ThresholdSearchSettings => {
    const shareMinHundredths = drawn.shareMinHundredths;
    const shareMaxHundredths =
      drawn.shareMinHundredths + drawn.shareWidthHundredths;
    const probabilityHundredths =
      shareMinHundredths +
      Math.round(
        drawn.probabilityPositionFraction * drawn.shareWidthHundredths,
      );
    return {
      downwardStepDb: drawn.upwardStepDb * drawn.downwardStepMultiple,
      upwardStepDb: drawn.upwardStepDb,
      startingLevelDb: drawn.startingLevelDb,
      floorDb:
        drawn.startingLevelDb - drawn.floorStepsBelowStart * drawn.upwardStepDb,
      capRelativeToAnchorDb:
        drawn.startingLevelDb + drawn.capStepsAboveStart * drawn.upwardStepDb,
      gapBetweenTrialsMinMs: drawn.gapBetweenTrialsMinMs,
      gapBetweenTrialsMaxMs: drawn.gapBetweenTrialsMinMs + drawn.gapRangeMs,
      noSoundTrialShareMinFraction: shareMinHundredths / 100,
      noSoundTrialShareMaxFraction: shareMaxHundredths / 100,
      noSoundTrialProbabilityFraction: probabilityHundredths / 100,
      falseAlarmRateUnreliableAboveFraction:
        drawn.falseAlarmRateUnreliableAboveFraction,
      trialLimitPerEarPerRoomCount: drawn.trialLimitPerEarPerRoomCount,
      thresholdCatchesMinCount: drawn.thresholdCatchesMinCount,
      thresholdCatchShareMinFraction: drawn.thresholdCatchShareMinFraction,
      floorCatchesForBetterThanFloorCount:
        drawn.floorCatchesForBetterThanFloorCount,
      capMissesForWorseThanCapCount: drawn.capMissesForWorseThanCapCount,
      inconsistentCatchMarginDb: drawn.inconsistentCatchMarginDb,
    };
  })
  .filter(isAccepted);

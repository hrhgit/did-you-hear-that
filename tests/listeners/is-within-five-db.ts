import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import type { RunEarResult } from "./search-under-test";

/**
 * The tolerance of the first version of property 1, "within 5 dB" of the true threshold. It is
 * the number of a measure that is kept for comparison, not a step of the search, so it is not
 * read from the settings (D42).
 */
export const originalToleranceDb = 5;

/**
 * The original measure of property 1, kept beside Accurate after the amendment (D18, D37, D42).
 * True when the ear result is not unreliable and agrees with the true threshold within 5 dB:
 *
 * - `found` within 5 dB of the true threshold, inclusive
 * - `betterThanFloor` when the true threshold is at most 5 dB above the floor
 * - `worseThanCap` when the true threshold is at most 5 dB below the cap
 *
 * `unreliable` and `unreported` are never within 5 dB. Flagged ears are counted the same way
 * under both measures, so this is the only figure the amendment changed.
 */
export function isWithinFiveDb(
  earResult: RunEarResult,
  trueThresholdDb: number,
  settings: Pick<ThresholdSearchSettings, "floorDb" | "capRelativeToAnchorDb">,
): boolean {
  switch (earResult.state) {
    case "found":
      return (
        Math.abs(earResult.thresholdDb - trueThresholdDb) <= originalToleranceDb
      );
    case "betterThanFloor":
      return trueThresholdDb <= settings.floorDb + originalToleranceDb;
    case "worseThanCap":
      return (
        trueThresholdDb >= settings.capRelativeToAnchorDb - originalToleranceDb
      );
    case "unreliable":
    case "unreported":
      return false;
  }
}

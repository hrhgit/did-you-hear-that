import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import type { RunEarResult } from "./search-under-test";

export type AccuracyClass = "accurate" | "flagged" | "wrong";

/** "Within 5 dB" of the brief's property 1, applied to every end state (D18). */
export const accuracyToleranceDb = 5;

/**
 * Classifies one ear result against the listener's true threshold (D18).
 *
 * - `found` is accurate when the threshold is within 5 dB of the true threshold, inclusive.
 * - `betterThanFloor` is accurate when the true threshold is at most 5 dB above the floor.
 * - `worseThanCap` is accurate when the true threshold is at most 5 dB below the cap (D37).
 * - `unreliable` is flagged.
 * - `unreported` is wrong: a result that says nothing is not a claim that can be right.
 */
export function classifyAccuracy(
  earResult: RunEarResult,
  trueThresholdDb: number,
  settings: Pick<ThresholdSearchSettings, "floorDb" | "capRelativeToAnchorDb">,
): AccuracyClass {
  const accurateWhen = (holds: boolean): AccuracyClass =>
    holds ? "accurate" : "wrong";
  switch (earResult.state) {
    case "found":
      return accurateWhen(
        Math.abs(earResult.thresholdDb - trueThresholdDb) <=
          accuracyToleranceDb,
      );
    case "betterThanFloor":
      return accurateWhen(
        trueThresholdDb <= settings.floorDb + accuracyToleranceDb,
      );
    case "worseThanCap":
      return accurateWhen(
        trueThresholdDb >= settings.capRelativeToAnchorDb - accuracyToleranceDb,
      );
    case "unreliable":
      return "flagged";
    case "unreported":
      return "wrong";
  }
}

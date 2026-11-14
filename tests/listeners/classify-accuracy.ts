import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import type { RunEarResult } from "./search-under-test";

export type AccuracyClass = "accurate" | "flagged" | "wrong";

/** The settings the grid band of property 1 is read from: the grid, its step, the floor and the cap. */
export type AccuracySettings = Pick<
  ThresholdSearchSettings,
  "startingLevelDb" | "upwardStepDb" | "floorDb" | "capRelativeToAnchorDb"
>;

/**
 * How close to a level of the grid a value must be to count as on it. Thresholds and estimates
 * are compared after arithmetic in floating point, so a true threshold written as -45 must not
 * land on the level above through rounding. It is far below the 0.1 dB grid of the listeners.
 */
const onGridToleranceDb = 1e-9;

/**
 * The lowest level of the Level_Grid (`startingLevelDb + k × upwardStepDb`) at or above the
 * true threshold, the centre of the band of property 1 (D42). It is not limited to the floor and
 * the cap, so a true threshold outside the playable range has a centre outside it too.
 */
export function lowestGridLevelAtOrAboveDb(
  trueThresholdDb: number,
  settings: AccuracySettings,
): number {
  const stepsAboveStart = Math.ceil(
    (trueThresholdDb - settings.startingLevelDb - onGridToleranceDb) /
      settings.upwardStepDb,
  );
  return settings.startingLevelDb + stepsAboveStart * settings.upwardStepDb;
}

/**
 * Classifies one ear result against the listener's true threshold with the band of the amended
 * property 1 (D42). Let G be the lowest level of the grid at or above the true threshold, and
 * one step the settings' `upwardStepDb`.
 *
 * - `found` is accurate when the threshold lies from G minus one step to G plus one step,
 *   inclusive. On the grid that is G or one level either side of it.
 * - `betterThanFloor` stands for an estimate at the floor or quieter. It is accurate when the
 *   floor is at or above G minus one step, so when G is at most one step above the floor.
 * - `worseThanCap` stands for an estimate one step above the cap or louder. It is accurate when
 *   that level is at or below G plus one step, so when G is at or above the cap.
 * - `unreliable` is flagged.
 * - `unreported` is wrong: a result that says nothing is not a claim that can be right.
 */
export function classifyAccuracy(
  earResult: RunEarResult,
  trueThresholdDb: number,
  settings: AccuracySettings,
): AccuracyClass {
  const accurateWhen = (holds: boolean): AccuracyClass =>
    holds ? "accurate" : "wrong";
  const centreDb = lowestGridLevelAtOrAboveDb(trueThresholdDb, settings);
  const stepDb = settings.upwardStepDb;
  switch (earResult.state) {
    case "found":
      return accurateWhen(
        Math.abs(earResult.thresholdDb - centreDb) <=
          stepDb + onGridToleranceDb,
      );
    case "betterThanFloor":
      return accurateWhen(
        settings.floorDb >= centreDb - stepDb - onGridToleranceDb,
      );
    case "worseThanCap":
      return accurateWhen(
        settings.capRelativeToAnchorDb + stepDb <=
          centreDb + stepDb + onGridToleranceDb,
      );
    case "unreliable":
      return "flagged";
    case "unreported":
      return "wrong";
  }
}

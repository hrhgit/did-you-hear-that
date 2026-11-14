import type { ThresholdSearchSettings } from "../engine/search-types";

/** A top this close below a grid level, in upward steps, still counts as that level (D7, D44). */
const gridToleranceSteps = 1e-9;

/**
 * The cap to give a room's threshold search (R9.6, D7): the highest level on the search's grid,
 * `startingLevelDb + k × upwardStepDb`, that is at most the room's Room_Top_Level, and never
 * above the settings' `capRelativeToAnchorDb`. A pure function.
 *
 * The output stage reports the room's top exactly. The search's validation requires its cap to
 * lie on the grid, which is why the rounding happens here. A top below the starting level gives a
 * cap below it too, which `validateSearchSettings` refuses; the calibration control's top keeps
 * every room at or above `roomTopMinDb`, so this does not happen with a kept calibration.
 */
export function roomSearchCapDb(
  topLevelDb: number,
  settings: Pick<
    ThresholdSearchSettings,
    "startingLevelDb" | "upwardStepDb" | "capRelativeToAnchorDb"
  >,
): number {
  const { startingLevelDb, upwardStepDb, capRelativeToAnchorDb } = settings;
  const stepCount = Math.floor(
    (topLevelDb - startingLevelDb) / upwardStepDb + gridToleranceSteps,
  );
  return Math.min(
    startingLevelDb + stepCount * upwardStepDb,
    capRelativeToAnchorDb,
  );
}

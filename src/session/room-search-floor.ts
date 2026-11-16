import type { ThresholdSearchSettings } from "../engine/search-types";

/** A floor this close above a grid level, in upward steps, still counts as that level (as D7, D44). */
const gridToleranceSteps = 1e-9;

/**
 * The Search_Floor of a room (audible-start design.md, "The playable floor"; R12.4): the lowest
 * level on the search's grid, `startingLevelDb + k × upwardStepDb`, that is at or above the room's
 * Playable_Floor, and never below the settings' `floorDb`. A pure function.
 *
 * The output stage reports the floor exactly (`roomFloorLevelDb`). The search's validation requires
 * its floor to lie on the grid, which is why the rounding happens here, as for the cap
 * (`roomSearchCapDb`). Rounding up keeps every level the search asks for at or above the exact
 * floor. The grid's origin is the one `roomSearchCapDb` uses; the audible-start design moves both
 * to `practiceStartLevelDb` (0), which lies on the same grid, so no floor changes then.
 */
export function roomSearchFloorDb(
  floorLevelDb: number,
  settings: Pick<
    ThresholdSearchSettings,
    "startingLevelDb" | "upwardStepDb" | "floorDb"
  >,
): number {
  const { startingLevelDb, upwardStepDb, floorDb } = settings;
  const stepCount = Math.ceil(
    (floorLevelDb - startingLevelDb) / upwardStepDb - gridToleranceSteps,
  );
  return Math.max(startingLevelDb + stepCount * upwardStepDb, floorDb);
}

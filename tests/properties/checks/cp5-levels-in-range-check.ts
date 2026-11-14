import fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { ListenerEar } from "../../listeners/listener-types";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import { checkThat } from "./check-that";
import type { HarnessNeutralUniversalCheck } from "./check-types";
import { NotCheckableError } from "./not-checkable-error";
import { roomInputArbitrary, runInputRoom } from "./room-input-arbitrary";

/**
 * Absorbs rounding when a version under test computes levels in floating point. The spec engine's
 * levels are integers, for which every comparison here is exact.
 */
const levelToleranceDb = 1e-9;

/**
 * CP5. Levels stay in range and climb gently (Universal; R5.4, R5.5, R5.7, brief property 3).
 * Every requested level lies from floor to cap and on the Level_Grid. For each ear, every level
 * is at most one upward step above that ear's previous level in the room (audio-safety rule 4).
 * Trials of a run that did not finish are checked as far as they go.
 */
export const cp5LevelsInRangeCheck: HarnessNeutralUniversalCheck =
  Object.freeze({
    id: "CP5",
    title: "Levels stay in range and climb gently",
    briefProperty: 3,
    requirements: ["R5.4", "R5.5", "R5.7"],
    kind: "universal",
    harnessNeutral: true,
    notCheckableReason: () => undefined,
    parameters: { numRuns: 200 },
    property: (
      search: SearchUnderTest,
      settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>,
    ) =>
      fc.property(roomInputArbitrary(settingsArbitrary), (input) => {
        const {
          floorDb,
          capRelativeToAnchorDb,
          startingLevelDb,
          upwardStepDb,
        } = input.settings;
        const previousLevelDb: Partial<Record<ListenerEar, number>> = {};
        for (const [index, trial] of runInputRoom(
          search,
          input,
        ).trials.entries()) {
          if (trial.kind !== "sound") {
            continue;
          }
          const where = `trial ${String(index + 1)}`;
          if (trial.ear === undefined || trial.levelDb === undefined) {
            throw new NotCheckableError(
              `${where}: the search does not report the ear and level of a sound trial`,
            );
          }
          const { ear, levelDb } = trial;
          checkThat(
            levelDb >= floorDb - levelToleranceDb &&
              levelDb <= capRelativeToAnchorDb + levelToleranceDb,
            () =>
              `${where}: level ${String(levelDb)} outside floor ${String(floorDb)} to cap ${String(capRelativeToAnchorDb)}`,
          );
          const stepsFromStart = (levelDb - startingLevelDb) / upwardStepDb;
          checkThat(
            Math.abs(stepsFromStart - Math.round(stepsFromStart)) *
              upwardStepDb <=
              levelToleranceDb,
            () =>
              `${where}: level ${String(levelDb)} is not on the grid of ${String(upwardStepDb)} dB steps from ${String(startingLevelDb)}`,
          );
          const previous = previousLevelDb[ear];
          checkThat(
            previous === undefined ||
              levelDb <= previous + upwardStepDb + levelToleranceDb,
            () =>
              `${where}: the ${ear} level rose from ${String(previous)} to ${String(levelDb)}, more than one upward step of ${String(upwardStepDb)}`,
          );
          previousLevelDb[ear] = levelDb;
        }
      }),
  });

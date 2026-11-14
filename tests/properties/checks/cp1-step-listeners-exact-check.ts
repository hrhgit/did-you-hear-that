import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { createSeededRandom } from "../../../src/config/seeded-random";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { ListenerEar } from "../../listeners/listener-types";
import { createPsychometricListener } from "../../listeners/psychometric-listener";
import {
  generousTrialBudgetCount,
  type RunEarResult,
  type SearchUnderTest,
} from "../../listeners/search-under-test";
import { checkThat } from "./check-that";
import type { HarnessNeutralUniversalCheck } from "./check-types";

/** How far beyond the floor and the cap the true thresholds are drawn (design.md, CP1). */
const beyondRangeDb = 20;
const tenthsOfADb = 10;

/** True thresholds on a 0.1 dB grid from 20 dB below the floor to 20 dB above the cap. */
const thresholdArbitrary = (
  settings: ThresholdSearchSettings,
): fc.Arbitrary<number> =>
  fc
    .integer({
      min: (settings.floorDb - beyondRangeDb) * tenthsOfADb,
      max: (settings.capRelativeToAnchorDb + beyondRangeDb) * tenthsOfADb,
    })
    .map((tenths) => tenths / tenthsOfADb);

/**
 * The exact answer for a Step_Listener: better than floor at or below the floor, worse than cap
 * above the cap, and otherwise found at the lowest Level_Grid level at or above the true
 * threshold.
 */
function exactAnswer(
  trueThresholdDb: number,
  settings: ThresholdSearchSettings,
): RunEarResult {
  if (trueThresholdDb <= settings.floorDb) {
    return { state: "betterThanFloor" };
  }
  if (trueThresholdDb > settings.capRelativeToAnchorDb) {
    return { state: "worseThanCap" };
  }
  const stepsAboveStart = Math.ceil(
    (trueThresholdDb - settings.startingLevelDb) / settings.upwardStepDb,
  );
  return {
    state: "found",
    thresholdDb:
      settings.startingLevelDb + stepsAboveStart * settings.upwardStepDb,
  };
}

const describeResult = (result: RunEarResult): string => JSON.stringify(result);

/**
 * CP1. Exact listeners get the exact answer (Universal; R5, R6, R7, R8.2, R8.3; brief property
 * 1). A Step_Listener never false-alarms, so no ear may be unreliable. The design states it for
 * the shipped settings, which the Vitest file and the CLI pass.
 */
export const cp1StepListenersExactCheck: HarnessNeutralUniversalCheck =
  Object.freeze({
    id: "CP1",
    title: "Exact listeners get the exact answer",
    briefProperty: 1,
    requirements: ["R5", "R6", "R7", "R8.2", "R8.3"],
    kind: "universal",
    harnessNeutral: true,
    notCheckableReason: () => undefined,
    parameters: { numRuns: 200 },
    property: (
      search: SearchUnderTest,
      settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>,
    ) =>
      fc.property(
        settingsArbitrary.chain((settings) =>
          fc.record({
            settings: fc.constant(settings),
            seed: fc.integer({ min: 0, max: 2 ** 32 - 1 }),
            trueThresholdDb: fc.record({
              left: thresholdArbitrary(settings),
              right: thresholdArbitrary(settings),
            }),
          }),
        ),
        ({ settings, seed, trueThresholdDb }) => {
          const run = search.runRoom({
            seed,
            settings,
            listener: createPsychometricListener(
              {
                trueThresholdDb,
                widthDb: 0,
                lapseFraction: 0,
                falseAlarmFraction: 0,
                wrongSideFraction: 0,
              },
              // A Step_Listener's answers do not depend on its draws.
              createSeededRandom(0),
            ),
            trialBudget: generousTrialBudgetCount,
          });
          checkThat(
            run.ending === "finished",
            () =>
              `the room did not finish: ${run.ending}${run.error === undefined ? "" : ` (${run.error})`}`,
          );
          for (const ear of ["left", "right"] as ListenerEar[]) {
            const expected = exactAnswer(trueThresholdDb[ear], settings);
            checkThat(
              isDeepStrictEqual(run.ears[ear], expected),
              () =>
                `${ear} ear with true threshold ${String(trueThresholdDb[ear])}: got ${describeResult(run.ears[ear])}, expected ${describeResult(expected)}`,
            );
          }
        },
      ),
  });

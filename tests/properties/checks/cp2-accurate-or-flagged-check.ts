import { atLeastFraction } from "../../../src/engine/fraction-comparisons";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { plausibleListenerParameters } from "../../listeners/listener-parameter-arbitraries";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import type { HarnessNeutralStatisticalCheck } from "./check-types";
import { evaluateListenerSets } from "./evaluate-listener-sets";

const parameters = Object.freeze({
  seed: 20261116,
  setCount: 100,
  roomsPerSet: 400,
  /** The limit. The target is 0.95 and the 2 point margin absorbs sampling noise (D19). */
  accurateOrFlaggedMinFraction: 0.93,
  accurateOrFlaggedTargetFraction: 0.95,
  timeoutMs: 60_000,
});

/**
 * CP2. Accurate or flagged (Statistical; brief property 1). For each of 100 parameter sets from
 * the Plausible_Range (fast-check seed 20261116), 400 rooms with seeds derived from the set give
 * 800 ear results, and at least 93 percent of them are Accurate or Flagged. Accurate is the grid
 * band of the amended property 1 (D42). The share within the original 5 dB, and the number of sets
 * it would leave below the limit, are reported beside the verdict and decide nothing.
 */
export const cp2AccurateOrFlaggedCheck: HarnessNeutralStatisticalCheck =
  Object.freeze({
    id: "CP2",
    title: "Accurate or flagged",
    briefProperty: 1,
    requirements: ["R13.8"],
    kind: "statistical",
    harnessNeutral: true,
    notCheckableReason: () => undefined,
    parameters,
    evaluate: (search: SearchUnderTest, settings: ThresholdSearchSettings) =>
      evaluateListenerSets({
        search,
        settings,
        arbitrary: plausibleListenerParameters(settings),
        seed: parameters.seed,
        setCount: parameters.setCount,
        roomsPerSet: parameters.roomsPerSet,
        meets: (measurement) =>
          atLeastFraction(
            measurement.accurateCount + measurement.flaggedCount,
            measurement.earCount,
            parameters.accurateOrFlaggedMinFraction,
          ),
        meetsWithinFiveDb: (measurement) =>
          atLeastFraction(
            measurement.withinFiveDbCount + measurement.flaggedCount,
            measurement.earCount,
            parameters.accurateOrFlaggedMinFraction,
          ),
        sortKey: (measurement) => 1 - measurement.wrongFraction,
        limits: {
          accurateOrFlaggedMinFraction: parameters.accurateOrFlaggedMinFraction,
          accurateOrFlaggedTargetFraction:
            parameters.accurateOrFlaggedTargetFraction,
        },
      }),
  });

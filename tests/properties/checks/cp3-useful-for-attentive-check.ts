import {
  atLeastFraction,
  atMostFraction,
} from "../../../src/engine/fraction-comparisons";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { attentiveListenerParameters } from "../../listeners/listener-parameter-arbitraries";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import type { HarnessNeutralStatisticalCheck } from "./check-types";
import { evaluateListenerSets } from "./evaluate-listener-sets";

const parameters = Object.freeze({
  seed: 20261117,
  setCount: 50,
  roomsPerSet: 400,
  /** The limit. The target is 0.90 (D19). */
  accurateMinFraction: 0.88,
  accurateTargetFraction: 0.9,
  flaggedMaxFraction: 0.1,
  timeoutMs: 30_000,
});

/**
 * CP3. Useful for attentive listeners (Statistical; guards CP2 against an engine that flags
 * everything; brief property 1). For each of 50 parameter sets from the Attentive_Range
 * (fast-check seed 20261117), over 400 rooms, at least 88 percent of ear results are Accurate
 * and not Flagged, and at most 10 percent are Flagged.
 */
export const cp3UsefulForAttentiveCheck: HarnessNeutralStatisticalCheck =
  Object.freeze({
    id: "CP3",
    title: "Useful for attentive listeners",
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
        arbitrary: attentiveListenerParameters(settings),
        seed: parameters.seed,
        setCount: parameters.setCount,
        roomsPerSet: parameters.roomsPerSet,
        meets: (measurement) =>
          atLeastFraction(
            measurement.accurateCount,
            measurement.earCount,
            parameters.accurateMinFraction,
          ) &&
          atMostFraction(
            measurement.flaggedCount,
            measurement.earCount,
            parameters.flaggedMaxFraction,
          ),
        sortKey: (measurement) => measurement.accurateFraction,
        limits: {
          accurateMinFraction: parameters.accurateMinFraction,
          accurateTargetFraction: parameters.accurateTargetFraction,
          flaggedMaxFraction: parameters.flaggedMaxFraction,
        },
      }),
  });

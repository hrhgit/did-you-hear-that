import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { ListenerEar } from "../../listeners/listener-types";
import { specSearchUnderTest } from "../../listeners/spec-search-under-test";
import type { SpecOnlyStatisticalCheck } from "./check-types";
import {
  patternPopulation,
  patternPopulationParameters,
} from "./pattern-population";

const parameters = Object.freeze({
  ...patternPopulationParameters,
  leftShareMinFraction: 0.47,
  leftShareMaxFraction: 0.53,
  largestConditionalDifferenceFraction: 0.05,
  timeoutMs: 30_000,
});

/** Absorbs rounding at the limits (D29). */
const toleranceFraction = 1e-9;

/**
 * CP11. Ears are mixed at random (Statistical; R3.7, R3.8). Over the 2000 rooms of CP8, take
 * the sound trials made while both ears were still searching: those whose number is not after
 * either ear's last presentation. Left makes up 47 to 53 percent of them. The chance that such a
 * trial is left after a left one and after a right one differ by at most 0.05, comparing each
 * with the previous sound trial of that kind in the room. After one ear's last presentation,
 * every sound trial is for the other ear.
 *
 * Spec-only, because "an ear's last presentation" is the moment its search ended, which only a
 * search that ends each ear on its own has.
 */
export const cp11EarsMixedCheck: SpecOnlyStatisticalCheck = Object.freeze({
  id: "CP11",
  title: "Ears are mixed at random",
  requirements: ["R3.7", "R3.8"],
  kind: "statistical",
  harnessNeutral: false,
  parameters,
  evaluate: (settings: ThresholdSearchSettings) => {
    let bothSearchingCount = 0;
    let leftCount = 0;
    const after: Record<ListenerEar, { count: number; leftCount: number }> = {
      left: { count: 0, leftCount: 0 },
      right: { count: 0, leftCount: 0 },
    };
    const oneEarViolations: Record<string, unknown>[] = [];
    for (const { listener, run } of patternPopulation(
      specSearchUnderTest,
      settings,
    )) {
      const lastPresentation: Record<ListenerEar, number> = {
        left: -1,
        right: -1,
      };
      run.trials.forEach((trial, index) => {
        if (trial.kind === "sound" && trial.ear !== undefined) {
          lastPresentation[trial.ear] = index;
        }
      });
      const bothSearchingUntil = Math.min(
        lastPresentation.left,
        lastPresentation.right,
      );
      const laterEar: ListenerEar =
        lastPresentation.left > lastPresentation.right ? "left" : "right";
      let previousEar: ListenerEar | undefined;
      run.trials.forEach((trial, index) => {
        if (trial.kind !== "sound" || trial.ear === undefined) {
          return;
        }
        if (index <= bothSearchingUntil) {
          bothSearchingCount += 1;
          leftCount += trial.ear === "left" ? 1 : 0;
          if (previousEar !== undefined) {
            after[previousEar].count += 1;
            after[previousEar].leftCount += trial.ear === "left" ? 1 : 0;
          }
          previousEar = trial.ear;
        } else if (trial.ear !== laterEar) {
          oneEarViolations.push({
            room: listener,
            trial: index + 1,
            ear: trial.ear,
          });
        }
      });
    }
    const leftShare = leftCount / bothSearchingCount;
    const leftAfterLeft = after.left.leftCount / after.left.count;
    const leftAfterRight = after.right.leftCount / after.right.count;
    const conditionalDifference = Math.abs(leftAfterLeft - leftAfterRight);
    const problems: Record<string, unknown>[] = [];
    if (!(
      leftShare >= parameters.leftShareMinFraction - toleranceFraction &&
      leftShare <= parameters.leftShareMaxFraction + toleranceFraction
    )) {
      problems.push({ problem: "left share outside its range", leftShare });
    }
    if (
      !(
        conditionalDifference <=
        parameters.largestConditionalDifferenceFraction + toleranceFraction
      )
    ) {
      problems.push({
        problem: "the ear depends on the previous ear",
        leftAfterLeft,
        leftAfterRight,
      });
    }
    if (oneEarViolations.length > 0) {
      problems.push({
        problem: "a sound trial for an ear whose search had ended",
        ...oneEarViolations[0],
      });
    }
    return Object.freeze({
      holds: problems.length === 0,
      ...(problems.length === 0 ? {} : { firstCounterexample: problems[0] }),
      metrics: {
        seed: parameters.seed,
        roomCount: parameters.roomCount,
        leftShareMinFraction: parameters.leftShareMinFraction,
        leftShareMaxFraction: parameters.leftShareMaxFraction,
        largestConditionalDifferenceFraction:
          parameters.largestConditionalDifferenceFraction,
        bothSearchingSoundTrialCount: bothSearchingCount,
        leftShare,
        leftAfterLeft,
        leftAfterRight,
        conditionalDifference,
        oneEarViolationCount: oneEarViolations.length,
      },
    });
  },
});

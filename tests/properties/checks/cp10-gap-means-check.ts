import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import type { HarnessNeutralStatisticalCheck } from "./check-types";
import { NotCheckableError } from "./not-checkable-error";
import {
  patternPopulation,
  patternPopulationParameters,
} from "./pattern-population";

const parameters = Object.freeze({
  ...patternPopulationParameters,
  largestMeanDifferenceMs: 50,
  timeoutMs: 30_000,
});

interface Mean {
  count: number;
  sumMs: number;
}

const meanOf = (mean: Mean): number =>
  mean.count > 0 ? mean.sumMs / mean.count : Number.NaN;

/**
 * CP10. Gaps do not depend on the trial (Statistical; R3.6), the statistical part: over the
 * 2000 rooms of CP8, the mean gap before no-sound trials and before sound trials differ by at
 * most 50 ms, and so do the mean gaps before left and right trials.
 */
export const cp10GapMeansCheck: HarnessNeutralStatisticalCheck = Object.freeze({
  id: "CP10",
  part: "mean gaps",
  title: "Gaps do not depend on the trial",
  requirements: ["R3.6"],
  kind: "statistical",
  harnessNeutral: true,
  notCheckableReason: () => undefined,
  parameters,
  evaluate: (search: SearchUnderTest, settings: ThresholdSearchSettings) => {
    const means: Record<"noSound" | "sound" | "left" | "right", Mean> = {
      noSound: { count: 0, sumMs: 0 },
      sound: { count: 0, sumMs: 0 },
      left: { count: 0, sumMs: 0 },
      right: { count: 0, sumMs: 0 },
    };
    for (const { listener, run } of patternPopulation(search, settings)) {
      for (const [index, trial] of run.trials.entries()) {
        const gapMs = trial.gapBeforeMs;
        if (gapMs === undefined) {
          throw new NotCheckableError(
            `room ${String(listener)}, trial ${String(index + 1)}: the search does not report the gap before a trial`,
          );
        }
        const add = (mean: Mean) => {
          mean.count += 1;
          mean.sumMs += gapMs;
        };
        add(means[trial.kind]);
        if (trial.kind === "sound") {
          if (trial.ear === undefined) {
            throw new NotCheckableError(
              `room ${String(listener)}, trial ${String(index + 1)}: the search does not report the ear of a sound trial`,
            );
          }
          add(means[trial.ear]);
        }
      }
    }
    const kindDifferenceMs = Math.abs(
      meanOf(means.noSound) - meanOf(means.sound),
    );
    const earDifferenceMs = Math.abs(meanOf(means.left) - meanOf(means.right));
    const differences = [
      ["no-sound against sound", kindDifferenceMs],
      ["left against right", earDifferenceMs],
    ] as const;
    // NaN (a kind that never occurred) does not count as within the limit.
    const outside = differences.filter(
      ([, differenceMs]) =>
        !(differenceMs <= parameters.largestMeanDifferenceMs),
    );
    return Object.freeze({
      holds: outside.length === 0,
      ...(outside.length === 0
        ? {}
        : {
            firstCounterexample: {
              comparison: outside[0][0],
              differenceMs: outside[0][1],
            },
          }),
      metrics: {
        seed: parameters.seed,
        roomCount: parameters.roomCount,
        largestMeanDifferenceMs: parameters.largestMeanDifferenceMs,
        meanGapMs: {
          noSound: meanOf(means.noSound),
          sound: meanOf(means.sound),
          left: meanOf(means.left),
          right: meanOf(means.right),
        },
        trialCounts: {
          noSound: means.noSound.count,
          sound: means.sound.count,
          left: means.left.count,
          right: means.right.count,
        },
        kindDifferenceMs,
        earDifferenceMs,
      },
    });
  },
});

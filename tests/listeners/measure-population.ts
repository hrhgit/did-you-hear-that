import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import { classifyAccuracy, type AccuracyClass } from "./classify-accuracy";
import { isWithinFiveDb } from "./is-within-five-db";
import {
  plausibleListenerRange,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import type { ListenerEar } from "./listener-types";
import { playPopulationRooms } from "./play-population-rooms";
import type { RunEarResult, SearchUnderTest } from "./search-under-test";

/** One ear of one simulated listener: the columns of the scatter data (design.md, Scatter data). */
export interface PopulationRow {
  /** The listener's number in the population, from 1. */
  readonly listener: number;
  readonly ear: ListenerEar;
  readonly trueThresholdDb: number;
  readonly widthDb: number;
  readonly lapseFraction: number;
  readonly falseAlarmFraction: number;
  readonly wrongSideFraction: number;
  readonly state: RunEarResult["state"];
  /** The threshold for found, the floor for better than floor, the cap for worse than cap. */
  readonly estimateDb?: number;
  /** Accurate, Flagged or Wrong under the grid band of property 1 (D42). */
  readonly accuracy: AccuracyClass;
  /** Whether the ear meets the original "within 5 dB" of property 1, kept for comparison (D42). */
  readonly withinFiveDb: boolean;
  /** The number of trials in the listener's room, the same for both ears. */
  readonly trialCount: number;
}

export interface PopulationSummary {
  readonly listenerCount: number;
  readonly earCount: number;
  readonly accurateCount: number;
  readonly flaggedCount: number;
  readonly wrongCount: number;
  readonly accurateFraction: number;
  readonly flaggedFraction: number;
  readonly wrongFraction: number;
  /** Ears within the original 5 dB of property 1, not unreliable (D42). Not the Accurate count. */
  readonly withinFiveDbCount: number;
  readonly withinFiveDbFraction: number;
  readonly medianTrialCount: number;
  readonly largestTrialCount: number;
  /** Rooms the harness stopped because they asked for more trials than the budget. */
  readonly budgetExceededCount: number;
  /** Rooms in which the search threw. */
  readonly threwCount: number;
}

export interface PopulationMeasurement {
  readonly search: string;
  readonly seed: number;
  readonly range: ListenerParameterRange["name"];
  readonly rows: readonly PopulationRow[];
  readonly summary: PopulationSummary;
}

const estimateOf = (
  earResult: RunEarResult,
  settings: ThresholdSearchSettings,
): number | undefined => {
  switch (earResult.state) {
    case "found":
      return earResult.thresholdDb;
    case "betterThanFloor":
      return settings.floorDb;
    case "worseThanCap":
      return settings.capRelativeToAnchorDb;
    default:
      return undefined;
  }
};

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Runs one room for each of `listenerCount` Psychometric_Listeners drawn uniformly from a
 * parameter range, and returns one row per ear with a summary (R15.1, D36).
 *
 * The rooms come from `playPopulationRooms`, so everything comes from one seed and the same
 * seed, settings and search give equal rows (R15.3).
 */
export function measurePopulation(
  search: SearchUnderTest,
  options: {
    listenerCount: number;
    seed: number;
    settings: ThresholdSearchSettings;
    range?: ListenerParameterRange;
    trialBudget?: number;
  },
): PopulationMeasurement {
  const { listenerCount, seed, settings } = options;
  const range = options.range ?? plausibleListenerRange;
  const rooms = playPopulationRooms(search, { ...options, range });
  const rows: PopulationRow[] = [];
  for (const { listener, parameters, run } of rooms) {
    for (const ear of ["left", "right"] as const) {
      const earResult = run.ears[ear];
      const estimateDb = estimateOf(earResult, settings);
      rows.push(
        Object.freeze({
          listener,
          ear,
          trueThresholdDb: parameters.trueThresholdDb[ear],
          widthDb: parameters.widthDb,
          lapseFraction: parameters.lapseFraction,
          falseAlarmFraction: parameters.falseAlarmFraction,
          wrongSideFraction: parameters.wrongSideFraction,
          state: earResult.state,
          ...(estimateDb === undefined ? {} : { estimateDb }),
          accuracy: classifyAccuracy(
            earResult,
            parameters.trueThresholdDb[ear],
            settings,
          ),
          withinFiveDb: isWithinFiveDb(
            earResult,
            parameters.trueThresholdDb[ear],
            settings,
          ),
          trialCount: run.trials.length,
        }),
      );
    }
  }
  const runs = rooms.map((room) => room.run);

  const countOf = (accuracy: AccuracyClass): number =>
    rows.filter((row) => row.accuracy === accuracy).length;
  const earCount = rows.length;
  const shareOf = (count: number): number =>
    earCount > 0 ? count / earCount : 0;
  const trialCounts = runs.map((run) => run.trials.length);
  const accurateCount = countOf("accurate");
  const flaggedCount = countOf("flagged");
  const wrongCount = countOf("wrong");
  const withinFiveDbCount = rows.filter((row) => row.withinFiveDb).length;

  return Object.freeze({
    search: search.name,
    seed,
    range: range.name,
    rows: Object.freeze(rows),
    summary: Object.freeze({
      listenerCount,
      earCount,
      accurateCount,
      flaggedCount,
      wrongCount,
      accurateFraction: shareOf(accurateCount),
      flaggedFraction: shareOf(flaggedCount),
      wrongFraction: shareOf(wrongCount),
      withinFiveDbCount,
      withinFiveDbFraction: shareOf(withinFiveDbCount),
      medianTrialCount: median(trialCounts),
      largestTrialCount: trialCounts.reduce(
        (largest, count) => Math.max(largest, count),
        0,
      ),
      budgetExceededCount: runs.filter((run) => run.ending === "budgetExceeded")
        .length,
      threwCount: runs.filter((run) => run.ending === "threw").length,
    }),
  });
}

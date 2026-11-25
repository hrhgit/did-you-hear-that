// The adaptive search before fine-level-estimate (2026-11-25).
import type {
  EarEnding,
  EarSearch,
  Presentation,
} from "../../src/engine/ear-search";
import type {
  CatchGrade,
  Ear,
  ThresholdSearchSettings,
} from "../../src/engine/search-types";

const observations = ["miss", "weak", "clear"] as const;
type Observation = (typeof observations)[number];
type Probabilities = Readonly<Record<Observation, number>>;

// Freeze these with the old algorithm so tuning the new search cannot move the reference.
const responseSpreadDb = 2.5;
const outlierFraction = 0.06;
const slowClearFraction = 0.15;
const concentratedProbabilityFraction = 0.8;

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

function likelihoods(
  levelDb: number,
  thresholdDb: number,
  stepDb: number,
): Probabilities {
  const aboveThresholdDb = levelDb - thresholdDb;
  const clear = sigmoid(aboveThresholdDb / responseSpreadDb);
  const any = sigmoid((aboveThresholdDb + stepDb) / responseSpreadDb);
  const withOutliers = (p: number) =>
    p * (1 - outlierFraction) + outlierFraction / observations.length;

  return {
    miss: withOutliers(1 - any),
    weak: withOutliers(any - clear + slowClearFraction * clear),
    clear: withOutliers((1 - slowClearFraction) * clear),
  };
}

function entropy(probabilities: Probabilities): number {
  return observations.reduce((sum, observation) => {
    const p = probabilities[observation];
    return sum - p * Math.log(p);
  }, 0);
}

/** Estimates the level with a 50% chance of a clear catch under the response model. */
export function createReferenceAdaptiveEarSearch(
  ear: Ear,
  settings: ThresholdSearchSettings,
): EarSearch {
  const {
    capRelativeToAnchorDb: capDb,
    floorDb,
    upwardStepDb: stepDb,
    downwardStepDb: largeStepDb,
    capMissesForWorseThanCapCount,
    trialLimitPerEarPerRoomCount,
  } = settings;
  // A finer grid can estimate between playable levels. The end buckets represent
  // hearing limits beyond the range of the headphones.
  const candidates = [
    floorDb - stepDb,
    ...Array.from(
      { length: capDb - floorDb + 1 },
      (_, index) => floorDb + index,
    ),
    capDb + stepDb,
  ];
  const probes = Array.from(
    { length: (capDb - floorDb) / stepDb + 1 },
    (_, index) => {
      const levelDb = floorDb + index * stepDb;
      return {
        levelDb,
        rows: candidates.map((thresholdDb) => {
          const probabilities = likelihoods(levelDb, thresholdDb, stepDb);
          return { probabilities, entropy: entropy(probabilities) };
        }),
      };
    },
  );
  const priorTotal = candidates.length - 2 + 2 * stepDb;
  let weights = candidates.map(
    (candidate) =>
      (candidate < floorDb || candidate > capDb ? stepDb : 1) / priorTotal,
  );
  let probe = probes[(settings.startingLevelDb - floorDb) / stepDb]!;
  let direction: Presentation["direction"] = "first";
  let ending: EarEnding | undefined;
  let lastCatchLevel: number | undefined;
  let lastClearLevel: number | undefined;
  let weakSinceClear = 0;
  let maxDropDb = largeStepDb;
  let capMisses = 0;
  const recorded: Presentation[] = [];

  const updateWeights = (observation: Observation): void => {
    const updated = weights.map(
      (weight, index) => weight * probe.rows[index]!.probabilities[observation],
    );
    const total = updated.reduce((sum, weight) => sum + weight, 0);
    weights = updated.map((weight) => weight / total);
  };

  const estimateLevel = (): number => {
    let cumulative = 0;
    const medianIndex = weights.findIndex(
      (weight) => (cumulative += weight) >= 0.5,
    );
    return candidates[medianIndex]!;
  };

  const concentrated = (estimate: number): boolean => {
    const nearby = weights.reduce(
      (total, weight, index) =>
        Math.abs(candidates[index]! - estimate) <= stepDb
          ? total + weight
          : total,
      0,
    );
    return nearby >= concentratedProbabilityFraction;
  };

  const finishEstimate = (quieterDb: number, clearerDb: number): void => {
    ending = Object.freeze({
      kind: "found",
      thresholdDb: Math.max(quieterDb, Math.min(clearerDb, estimateLevel())),
    });
  };

  const probeAt = (levelDb: number) => probes[(levelDb - floorDb) / stepDb]!;

  const descend = (grade: CatchGrade | undefined): void => {
    if (grade !== "perfect") {
      maxDropDb = stepDb;
    }
    const lowestProbeDb = Math.max(floorDb, probe.levelDb - maxDropDb);
    let best = probeAt(lowestProbeDb);
    let bestInformation = -1;
    for (const candidate of probes) {
      if (candidate.levelDb < lowestProbeDb) {
        continue;
      }
      if (candidate.levelDb >= probe.levelDb) {
        break;
      }
      const predicted = { miss: 0, weak: 0, clear: 0 };
      let expectedEntropy = 0;
      for (const [index, row] of candidate.rows.entries()) {
        const weight = weights[index]!;
        for (const observation of observations) {
          predicted[observation] += weight * row.probabilities[observation];
        }
        expectedEntropy += weight * row.entropy;
      }
      const information = entropy(predicted) - expectedEntropy;
      if (information > bestInformation) {
        best = candidate;
        bestInformation = information;
      }
    }
    direction = "descending";
    probe = best;
  };

  const chooseNext = (
    observation: Observation,
    grade: CatchGrade | undefined,
  ): void => {
    const { levelDb } = probe;
    if (observation === "miss") {
      if (lastCatchLevel !== undefined) {
        finishEstimate(levelDb, lastClearLevel ?? lastCatchLevel);
        return;
      }
      if (levelDb === capDb) {
        capMisses += 1;
      }
      if (capMisses >= capMissesForWorseThanCapCount) {
        ending = Object.freeze({ kind: "worseThanCap" });
      } else {
        direction = "ascending";
        probe = probeAt(Math.min(capDb, levelDb + stepDb));
      }
      return;
    }

    if (levelDb === floorDb && observation === "clear") {
      ending = Object.freeze({ kind: "betterThanFloor" });
      return;
    }
    const previous = recorded.at(-2);
    if (lastCatchLevel === undefined && previous !== undefined) {
      // Any correct catch above an initial miss gives us a range to estimate from.
      finishEstimate(previous.levelDb, levelDb);
      return;
    }

    lastCatchLevel = levelDb;
    if (observation === "clear") {
      lastClearLevel = levelDb;
      weakSinceClear = 0;
    } else {
      weakSinceClear += 1;
      // Late catches alone can reflect the player's pace. Without a clear catch,
      // keep going down until a miss or the quietest playable sound.
      if (
        levelDb === floorDb ||
        (lastClearLevel !== undefined &&
          (weakSinceClear >= 2 || concentrated(estimateLevel())))
      ) {
        finishEstimate(levelDb, lastClearLevel ?? levelDb);
        return;
      }
    }
    descend(grade);
  };

  const requireSearching = (): void => {
    if (ending !== undefined) {
      throw new Error(`The ${ear} ear search has ended.`);
    }
  };

  return Object.freeze<EarSearch>({
    ear,
    isSearching: () => ending === undefined,
    next() {
      requireSearching();
      return Object.freeze({ levelDb: probe.levelDb, direction });
    },
    record(outcome, grade) {
      requireSearching();
      const observation =
        outcome !== "caught" ? "miss" : grade === "good" ? "weak" : "clear";
      recorded.push(
        Object.freeze({ levelDb: probe.levelDb, direction, outcome }),
      );
      updateWeights(observation);
      chooseNext(observation, grade);

      if (recorded.length >= trialLimitPerEarPerRoomCount) {
        ending ??= Object.freeze({ kind: "trialLimit" });
      }
    },
    ending: () => ending,
    cutOff() {
      ending ??= Object.freeze({ kind: "trialLimit" });
    },
    remainingPresentationsLowerBound: () => (ending === undefined ? 1 : 0),
    presentations: () => Object.freeze([...recorded]),
  });
}

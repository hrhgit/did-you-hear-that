import { adaptiveHearingConfig } from "../config/adaptive-hearing-config";
import type { EarEnding, EarSearch, Presentation } from "./ear-search";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type {
  CatchGrade,
  Ear,
  SearchEvidence,
  ThresholdSearchSettings,
} from "./search-types";

const observations = ["miss", "weak", "clear"] as const;
type Observation = (typeof observations)[number];
type Probabilities = Readonly<Record<Observation, number>>;

const {
  responseSpreadDb,
  outlierFraction,
  slowClearFraction,
  concentratedProbabilityFraction,
  concentratedWithinDb,
  detectionLeadDb,
  candidateStepDb,
  minDropDb,
  fastSpreadMs,
  slowExtraMs,
  slowSpreadMs,
  rangeLowFraction,
  rangeHighFraction,
  estimateAboveClearMaxDb,
  confirmingMissesCount,
  steeringLeadDb,
  steeringAgreesWithinDb,
} = adaptiveHearingConfig;

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

const normalWeight = (distance: number, spread: number): number =>
  Math.exp(-0.5 * (distance / spread) ** 2);

const withOutliers = (likelihood: number, flat: number): number =>
  likelihood * (1 - outlierFraction) + outlierFraction * flat;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

const roundLevel = (levelDb: number): number => Math.round(levelDb * 10) / 10;

function normalize(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

function responseProbabilities(levelDb: number, thresholdDb: number) {
  const marginDb = levelDb - thresholdDb;
  const any = sigmoid((marginDb + detectionLeadDb) / responseSpreadDb);
  const clear = (1 - slowClearFraction) * sigmoid(marginDb / responseSpreadDb);
  const probabilities: Probabilities = {
    miss: withOutliers(1 - any, 1 / observations.length),
    weak: withOutliers(any - clear, 1 / observations.length),
    clear: withOutliers(clear, 1 / observations.length),
  };
  return { any, clear, probabilities, entropy: entropy(probabilities) };
}

function timingLikelihood(
  { any, clear }: ReturnType<typeof responseProbabilities>,
  fastDensity: number,
  slowDensity: number,
): number {
  const clearShare = clamp(clear / Math.max(any, 1e-9), 0, 1);
  // An outlier is equally likely to be miss, weak or clear. Conditional on a
  // catch, its answer time has flat density across the response window.
  const flatDensity =
    2 / observations.length / hearingMethodConfig.responseWindowMs;
  return withOutliers(
    any * (clearShare * fastDensity + (1 - clearShare) * slowDensity),
    flatDensity,
  );
}

function entropy(probabilities: Probabilities): number {
  return observations.reduce((sum, observation) => {
    const p = probabilities[observation];
    return sum - p * Math.log(p);
  }, 0);
}

/** Estimates the level with a 50% chance of a clear catch under the response model. */
export function createAdaptiveEarSearch(
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
  const firstCandidateDb = floorDb - stepDb;
  const lastCandidateDb = capDb + stepDb;
  const candidates = Array.from(
    { length: (lastCandidateDb - firstCandidateDb) / candidateStepDb + 1 },
    (_, index) => firstCandidateDb + index * candidateStepDb,
  );
  const rowsByLevel = new Map<
    number,
    ReturnType<typeof responseProbabilities>[]
  >();
  const rowsAt = (levelDb: number) => {
    let rows = rowsByLevel.get(levelDb);
    if (rows === undefined) {
      rows = candidates.map((thresholdDb) =>
        responseProbabilities(levelDb, thresholdDb),
      );
      rowsByLevel.set(levelDb, rows);
    }
    return rows;
  };
  let weights = normalize(
    candidates.map((candidate) =>
      candidate === firstCandidateDb || candidate === lastCandidateDb
        ? stepDb
        : 1,
    ),
  );
  let levelDb = settings.startingLevelDb;
  let direction: Presentation["direction"] = "first";
  let ending: EarEnding | undefined;
  let lowestCatchLevel: number | undefined;
  let lowestClearLevel: number | undefined;
  let weakSinceClear = 0;
  let maxDropDb = largeStepDb;
  let capMisses = 0;
  const recorded: Presentation[] = [];

  const updateWeights = (
    observation: Observation,
    evidence: SearchEvidence | undefined,
  ): void => {
    const rows = rowsAt(levelDb);
    const { netAnswerMs, baselineMs } = evidence ?? {};
    if (
      observation !== "miss" &&
      netAnswerMs !== undefined &&
      baselineMs !== undefined
    ) {
      const delayMs = netAnswerMs - baselineMs;
      const fastDensity =
        normalWeight(delayMs, fastSpreadMs) /
        (Math.sqrt(2 * Math.PI) * fastSpreadMs);
      const slowDensity =
        normalWeight(delayMs - slowExtraMs, slowSpreadMs) /
        (Math.sqrt(2 * Math.PI) * slowSpreadMs);
      weights = normalize(
        weights.map(
          (weight, index) =>
            weight * timingLikelihood(rows[index]!, fastDensity, slowDensity),
        ),
      );
    } else {
      weights = normalize(
        weights.map(
          (weight, index) => weight * rows[index]!.probabilities[observation],
        ),
      );
    }
  };

  const estimateQuantile = (fraction: number): number => {
    let cumulative = 0;
    for (const [index, weight] of weights.entries()) {
      if (cumulative + weight >= fraction) {
        const offset = (fraction - cumulative) / weight - 0.5;
        return roundLevel(candidates[index]! + candidateStepDb * offset);
      }
      cumulative += weight;
    }
    return lastCandidateDb;
  };

  const concentrated = (estimate: number): boolean => {
    const nearby = weights.reduce(
      (total, weight, index) =>
        Math.abs(candidates[index]! - estimate) <= concentratedWithinDb
          ? total + weight
          : total,
      0,
    );
    return nearby >= concentratedProbabilityFraction;
  };

  // The estimate is the posterior median, at most `estimateAboveClearMaxDb` above the quietest
  // clear catch; the range is the posterior's 10th to 90th percentiles around it. Holding the
  // estimate at the clear catch itself, as first designed, pulled it back onto the levels played
  // (fine-level-estimate, Measured). No miss bounds it from below: the response model already
  // allows for a missed sound that was loud enough, and a hard bound let one such miss set the
  // result (2026-11-25, one missed sound).
  const finishEstimate = (clearerDb: number): void => {
    const thresholdDb = Math.min(
      estimateQuantile(0.5),
      clearerDb + estimateAboveClearMaxDb,
    );
    ending = Object.freeze({
      kind: "found",
      thresholdDb,
      lowDb: Math.min(thresholdDb, estimateQuantile(rangeLowFraction)),
      highDb: Math.max(thresholdDb, estimateQuantile(rangeHighFraction)),
    });
  };

  /** The expected information a probe at this level gives about the threshold. */
  const probeInformation = (
    probeDb: number,
    choiceWeights: readonly number[],
  ): number => {
    const predicted = { miss: 0, weak: 0, clear: 0 };
    let expectedEntropy = 0;
    for (const [index, row] of rowsAt(probeDb).entries()) {
      const weight = choiceWeights[index]!;
      for (const observation of observations) {
        predicted[observation] += weight * row.probabilities[observation];
      }
      expectedEntropy += weight * row.entropy;
    }
    return entropy(predicted) - expectedEntropy;
  };

  const descend = (
    grade: CatchGrade | undefined,
    steering: SearchEvidence["steering"],
  ): void => {
    if (grade !== "perfect") {
      maxDropDb = stepDb;
    }
    // Until this ear has missed, the levels the neighbouring searches found may pull the next
    // probe down to a little above them in one step, past the usual largest drop.
    const steeredLowestDb =
      steering === undefined
        ? levelDb - maxDropDb
        : Math.min(levelDb - maxDropDb, steering.centreDb + steeringLeadDb);
    const lowestProbeDb = Math.max(floorDb, Math.round(steeredLowestDb));
    const highestProbeDb = levelDb - minDropDb;
    // Within the minimum drop of the floor, the only remaining probe is the floor.
    let bestLevelDb = floorDb;
    let bestInformation = -Infinity;
    const choiceWeights =
      steering === undefined
        ? weights
        : normalize(
            weights.map(
              (weight, index) =>
                weight *
                normalWeight(
                  candidates[index]! - steering.centreDb,
                  steering.spreadDb,
                ),
            ),
          );
    // Traverse from loudest to quietest so a tie keeps the louder probe.
    for (let probeDb = highestProbeDb; probeDb >= lowestProbeDb; probeDb -= 1) {
      // A catch just above the floor would force a sub-minimum drop on the next turn.
      if (probeDb > floorDb && probeDb < floorDb + minDropDb) continue;
      const information = probeInformation(probeDb, choiceWeights);
      if (information > bestInformation) {
        bestLevelDb = probeDb;
        bestInformation = information;
      }
    }
    direction = "descending";
    levelDb = bestLevelDb;
    // Trust the neighbours: go straight to a little above their level when that is lower still.
    // A miss there is cheap, because the search climbs back up from it.
    if (steering !== undefined) {
      let jumpDb = Math.max(
        floorDb,
        Math.round(steering.centreDb + steeringLeadDb),
      );
      if (jumpDb > floorDb && jumpDb < floorDb + minDropDb) {
        jumpDb = floorDb + minDropDb;
      }
      if (jumpDb < bestLevelDb) levelDb = jumpDb;
    }
  };

  /** The misses below every catch so far: the ones a catch has not since outweighed. */
  const missesBelowCatches = (): readonly number[] =>
    lowestCatchLevel === undefined
      ? []
      : recorded
          .filter(
            ({ outcome, levelDb: playedDb }) =>
              outcome !== "caught" && playedDb < lowestCatchLevel!,
          )
          .map(({ levelDb: playedDb }) => playedDb);

  /**
   * After a miss below the catches: narrow the gap between the loudest such miss and the
   * quietest catch, choosing the most informative whole-decibel level inside it, or play the
   * missed level again once the gap is one upward step or less. A catch there outweighs the miss,
   * so a single missed sound costs one more sound instead of the result.
   */
  const probeTheGap = (missDb: number, catchDb: number): void => {
    direction = "ascending";
    if (catchDb - missDb <= stepDb) {
      levelDb = missDb;
      return;
    }
    let bestLevelDb = missDb;
    let bestInformation = -Infinity;
    for (
      let probeDb = catchDb - minDropDb;
      probeDb >= missDb + minDropDb;
      probeDb -= 1
    ) {
      const information = probeInformation(probeDb, weights);
      if (information > bestInformation) {
        bestLevelDb = probeDb;
        bestInformation = information;
      }
    }
    levelDb = bestLevelDb;
  };

  const chooseNext = (
    observation: Observation,
    grade: CatchGrade | undefined,
    steering: SearchEvidence["steering"],
  ): void => {
    if (observation === "miss") {
      if (lowestCatchLevel === undefined) {
        if (levelDb === capDb) {
          capMisses += 1;
        }
        if (capMisses >= capMissesForWorseThanCapCount) {
          ending = Object.freeze({ kind: "worseThanCap" });
        } else {
          direction = "ascending";
          levelDb = Math.min(capDb, levelDb + stepDb);
        }
        return;
      }
      const misses = missesBelowCatches();
      const loudestMissDb = Math.max(...misses);
      const narrow = lowestCatchLevel - loudestMissDb <= stepDb;
      // One miss is enough when the neighbouring searches put the level in the same place: only a
      // miss they do not explain is played again.
      const steeringAgrees =
        steering !== undefined &&
        Math.abs(steering.centreDb - (loudestMissDb + lowestCatchLevel) / 2) <=
          steeringAgreesWithinDb;
      if (
        narrow &&
        (misses.length >= confirmingMissesCount || steeringAgrees)
      ) {
        finishEstimate(lowestClearLevel ?? lowestCatchLevel);
        return;
      }
      probeTheGap(loudestMissDb, lowestCatchLevel);
      return;
    }

    if (levelDb === floorDb && observation === "clear") {
      ending = Object.freeze({ kind: "betterThanFloor" });
      return;
    }
    lowestCatchLevel = Math.min(lowestCatchLevel ?? levelDb, levelDb);
    if (observation === "clear") {
      lowestClearLevel = Math.min(lowestClearLevel ?? levelDb, levelDb);
      weakSinceClear = 0;
    } else {
      weakSinceClear += 1;
      // Late catches alone can reflect the player's pace. Without a clear catch,
      // keep going down until a miss or the quietest playable sound.
      if (
        levelDb === floorDb ||
        (lowestClearLevel !== undefined &&
          (weakSinceClear >= 2 || concentrated(estimateQuantile(0.5))))
      ) {
        finishEstimate(lowestClearLevel ?? lowestCatchLevel);
        return;
      }
    }
    const misses = missesBelowCatches();
    if (misses.length > 0) {
      probeTheGap(Math.max(...misses), lowestCatchLevel);
      return;
    }
    descend(grade, steering);
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
      return Object.freeze({ levelDb, direction });
    },
    record(outcome, grade, evidence) {
      requireSearching();
      const observation =
        outcome !== "caught" ? "miss" : grade === "good" ? "weak" : "clear";
      recorded.push(Object.freeze({ levelDb, direction, outcome }));
      updateWeights(observation, evidence);
      chooseNext(observation, grade, evidence?.steering);

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
    startAt(startDb) {
      if (ending !== undefined || recorded.length > 0) return;
      levelDb = Math.min(
        settings.startingLevelDb,
        Math.max(floorDb, Math.round(startDb)),
      );
    },
  });
}

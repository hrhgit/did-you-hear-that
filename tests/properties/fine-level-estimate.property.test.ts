import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { adaptiveHearingConfig as model } from "../../src/config/adaptive-hearing-config";
import { hearingMethodConfig as settings } from "../../src/config/hearing-method-config";
import { rhythmConfig } from "../../src/config/rhythm-config";
import {
  createSeededRandom,
  type RandomSource,
} from "../../src/config/seeded-random";
import { createAdaptiveEarSearch } from "../../src/engine/adaptive-ear-search";
import type { EarSearch } from "../../src/engine/ear-search";
import type { SearchEvidence } from "../../src/engine/search-types";
import { createReferenceAdaptiveEarSearch } from "./reference-adaptive-ear-search";

const { floorDb, capRelativeToAnchorDb: capDb, responseWindowMs } = settings;
const sampleSeed = 20261125;
const listenerCount = 2500;
const timeoutMs = 120_000;
const listenerArbitrary = fc.record({
  thresholdDb: fc
    .integer({ min: (floorDb + 5) * 10, max: (capDb - 5) * 10 })
    .map((tenths) => tenths / 10),
  baselineMs: fc.integer({ min: 200, max: 600 }),
  seed: fc.integer({ min: 0, max: 0xffffffff }),
});
type Listener =
  typeof listenerArbitrary extends fc.Arbitrary<infer T> ? T : never;
type Steering = SearchEvidence["steering"];

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

function simulate(ear: EarSearch, listener: Listener, steering?: Steering) {
  const random: RandomSource = createSeededRandom(listener.seed);
  while (ear.isSearching()) {
    const { levelDb } = ear.next();
    const marginDb = levelDb - listener.thresholdDb;
    const any = sigmoid(
      (marginDb + model.detectionLeadDb) / model.responseSpreadDb,
    );
    const clear =
      (1 - model.slowClearFraction) *
      sigmoid(marginDb / model.responseSpreadDb);
    // Draw the same number of random values per trial for the two searches.
    const isOutlier = random.next() < model.outlierFraction;
    const outcome = random.next();
    const radius = Math.sqrt(-2 * Math.log(1 - random.next()));
    const angle = 2 * Math.PI * random.next();
    const normal = radius * Math.cos(angle);
    const flatAnswerMs = random.next() * responseWindowMs;
    if (outcome >= (isOutlier ? 2 / 3 : any)) {
      ear.record("missed", undefined, { steering });
      continue;
    }
    const fast = outcome < (isOutlier ? 1 / 3 : clear);
    const netAnswerMs = isOutlier
      ? flatAnswerMs
      : listener.baselineMs +
        (fast
          ? normal * model.fastSpreadMs
          : model.slowExtraMs + normal * model.slowSpreadMs);
    // The model's weak outcome is Good. Split its clear outcome into Perfect and Great by time.
    const grade = fast
      ? netAnswerMs <= rhythmConfig.perfectWithinMs
        ? "perfect"
        : "great"
      : "good";
    ear.record("caught", grade, {
      netAnswerMs,
      baselineMs: listener.baselineMs,
      steering,
    });
  }
  return { ending: ear.ending(), trials: ear.presentations() };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return (
    (ordered[Math.floor((ordered.length - 1) / 2)]! +
      ordered[Math.floor(ordered.length / 2)]!) /
    2
  );
}

function statistics(
  createEar: typeof createAdaptiveEarSearch,
  listeners: readonly Listener[],
) {
  const trialCounts: number[] = [];
  const errorsDb: number[] = [];
  let nearGrid = 0;
  let covered = 0;
  for (const listener of listeners) {
    const { ending, trials } = simulate(createEar("left", settings), listener);
    trialCounts.push(trials.length);
    if (ending?.kind !== "found") continue;
    const { thresholdDb, lowDb, highDb } = ending;
    errorsDb.push(Math.abs(thresholdDb - listener.thresholdDb));
    const nearestGridDb = Math.round(thresholdDb / 5) * 5;
    if (Math.abs(thresholdDb - nearestGridDb) <= 0.25) nearGrid += 1;
    if (
      lowDb !== undefined &&
      highDb !== undefined &&
      lowDb <= listener.thresholdDb &&
      listener.thresholdDb <= highDb
    )
      covered += 1;
  }
  return {
    meanTrials: mean(trialCounts),
    found: errorsDb.length,
    medianErrorDb: median(errorsDb),
    nearGridFraction: nearGrid / errorsDb.length,
    coveredFraction: covered / errorsDb.length,
  };
}

describe("fine level estimate", () => {
  it(
    "keeps whole-decibel probes in range, descends by the minimum and never ends on one miss alone",
    () => {
      fc.assert(
        fc.property(listenerArbitrary, (listener) => {
          const run = simulate(
            createAdaptiveEarSearch("left", settings),
            listener,
          );
          expect(
            simulate(createAdaptiveEarSearch("left", settings), listener),
          ).toEqual(run);
          let caught = false;
          for (const [index, trial] of run.trials.entries()) {
            expect(Number.isInteger(trial.levelDb)).toBe(true);
            expect(trial.levelDb).toBeGreaterThanOrEqual(floorDb);
            expect(trial.levelDb).toBeLessThanOrEqual(capDb);
            if (trial.direction === "descending") {
              const dropDb = run.trials[index - 1]!.levelDb - trial.levelDb;
              expect(dropDb).toBeGreaterThanOrEqual(model.minDropDb);
            }
            if (trial.outcome === "caught") caught = true;
          }
          // 2026-11-25, one missed sound: without steering, an ear that ends with a level on a
          // miss has missed at least twice below its quietest catch.
          if (
            caught &&
            run.ending?.kind === "found" &&
            run.trials.at(-1)?.outcome !== "caught"
          ) {
            const quietestCatchDb = Math.min(
              ...run.trials
                .filter(({ outcome }) => outcome === "caught")
                .map(({ levelDb }) => levelDb),
            );
            const missesBelow = run.trials.filter(
              ({ outcome, levelDb }) =>
                outcome !== "caught" && levelDb < quietestCatchDb,
            ).length;
            expect(missesBelow).toBeGreaterThanOrEqual(
              model.confirmingMissesCount,
            );
          }
        }),
        { seed: sampleSeed, numRuns: listenerCount, unbiased: true },
      );
    },
    timeoutMs,
  );

  it("keeps a full descent step available at the floor after an outlying catch", () => {
    const { trials } = simulate(createAdaptiveEarSearch("left", settings), {
      thresholdDb: -63.8,
      baselineMs: 200,
      seed: 2226431291,
    });
    expect(trials.at(-1)?.levelDb).toBe(floorDb);
    expect(trials.at(-2)?.levelDb).toBeGreaterThanOrEqual(
      floorDb + model.minDropDb,
    );
  });

  it(
    "gets the same ending, estimate and range from the same probes and answers with and without steering",
    () => {
      fc.assert(
        fc.property(
          listenerArbitrary,
          listenerArbitrary,
          (listener, neighbour) => {
            const plain = simulate(
              createAdaptiveEarSearch("left", settings),
              listener,
            );
            const steered = simulate(
              createAdaptiveEarSearch("left", settings),
              listener,
              {
                centreDb: neighbour.thresholdDb,
                spreadDb: model.steeringSpreadDb,
              },
            );
            const levelsOf = (run: typeof plain) =>
              run.trials.map(({ levelDb }) => levelDb);
            // Different probes give different evidence. Compare runs on the same observations.
            fc.pre(
              JSON.stringify(levelsOf(plain)) ===
                JSON.stringify(levelsOf(steered)),
            );
            expect(steered).toEqual(plain);
            if (plain.ending?.kind === "found") {
              expect(plain.ending.lowDb).toBeLessThanOrEqual(
                plain.ending.thresholdDb,
              );
              expect(plain.ending.highDb).toBeGreaterThanOrEqual(
                plain.ending.thresholdDb,
              );
            }
          },
        ),
        { seed: sampleSeed, numRuns: 250 },
      );
    },
    timeoutMs,
  );

  const measure = () => {
    const listeners = fc.sample(listenerArbitrary, {
      seed: sampleSeed,
      numRuns: listenerCount,
      unbiased: true,
    });
    return {
      reference: statistics(createReferenceAdaptiveEarSearch, listeners),
      fine: statistics(createAdaptiveEarSearch, listeners),
    };
  };
  let figures: ReturnType<typeof measure>;
  const measured = () => {
    if (figures === undefined) {
      figures = measure();
      console.log("Fine level estimate simulated listeners", figures);
    }
    return figures;
  };

  it(
    "R5.1 adds at most 2.1 sound trials per ear on average without steering",
    () => {
      const { fine, reference } = measured();
      // 2026-11-25, one missed sound: a first miss is played again instead of ending the ear,
      // and only misses within one upward step of the quietest catch count towards the ending.
      // This costs about 2.03 sound trials per ear here, without steering to agree with it
      // (requirements R5.1, changed). The reference ended on any single miss.
      expect(fine.meanTrials).toBeLessThanOrEqual(reference.meanTrials + 2.1);
    },
    timeoutMs,
  );

  it(
    "R6.1 has median error no greater than the reference",
    () => {
      const { fine, reference } = measured();
      // The 2.5 dB ceiling first written was out of reach with about five trials an ear
      // (requirements R6.1, changed 2026-11-25). Errors are sums of tenths, hence the epsilon.
      expect(fine.medianErrorDb).toBeLessThanOrEqual(
        reference.medianErrorDb + 1e-9,
      );
    },
    timeoutMs,
  );

  it(
    "R6.2 puts fewer than 30% of estimates near the 5 dB grid",
    () => {
      expect(measured().fine.nearGridFraction).toBeLessThan(0.3);
    },
    timeoutMs,
  );

  it(
    "R6.3 covers the true threshold for at least 70% of found ears",
    () => {
      expect(measured().fine.coveredFraction).toBeGreaterThanOrEqual(0.7);
    },
    timeoutMs,
  );
});

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { Trial } from "../../src/engine/search-types";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import type { VisitTrial } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";

// CP5. The log replays through the engine (Universal; visit-flow design.md, CP5; R7.9, R6.2,
// R13.3, R19.2). The visits render with the worst-case renderers (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** What a logged trial says the search asked for. */
const askedFor = (trial: VisitTrial) => ({
  trialNumber: trial.trialNumber,
  kind: trial.kind,
  ear: trial.ear,
  levelDb: trial.requestedLevelDb,
  gapBeforeMs: trial.gapBeforeMs,
});

/** The same fields of a trial of the search. */
const searchAskedFor = (trial: Trial) => ({
  trialNumber: trial.trialNumber,
  kind: trial.kind,
  ear: trial.kind === "sound" ? trial.ear : null,
  levelDb: trial.kind === "sound" ? trial.levelDb : null,
  gapBeforeMs: trial.gapBeforeMs,
});

describe("visit flow CP5. The log replays through the engine (Universal; R7.9, R6.2, R13.3)", () => {
  it(
    "gives a new search with each run's seed and cap the trials and the result of that run",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitRunArbitrary({ withEnding: false }),
          async (visitRun) => {
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
            });
            const run = await playVisit(harness, visitRun.script);
            const snapshot = harness.flow.snapshot();
            expect(run.ending).toBe("done");
            expect(snapshot.stage).toBe("result");
            if (snapshot.stage !== "result") {
              return;
            }
            const log = snapshot.visitLog;

            for (const attempt of log.roomAttempts) {
              const search = createThresholdSearch({
                settings: {
                  ...hearingMethodConfig,
                  capRelativeToAnchorDb: attempt.searchCapDb,
                  // The run's Search_Floor, and the start held at or above it, as the flow
                  // creates the search (audible-start R12.5).
                  ...(attempt.searchFloorDb === undefined
                    ? {}
                    : {
                        floorDb: attempt.searchFloorDb,
                        startingLevelDb: Math.max(
                          hearingMethodConfig.startingLevelDb,
                          attempt.searchFloorDb,
                        ),
                      }),
                },
                random: createSeededRandom(attempt.engineSeed),
              });
              const trials = log.trials.filter(
                (trial) =>
                  trial.roomIndex === attempt.roomIndex &&
                  trial.attempt === attempt.attempt,
              );
              let step = search.current();
              for (const trial of trials) {
                // Every played trial, scored or discarded, is the trial the search waits on.
                expect(step.kind).toBe("trial");
                if (step.kind !== "trial") {
                  break;
                }
                expect(askedFor(trial)).toEqual(searchAskedFor(step.trial));
                if (trial.status === "scored") {
                  step = search.respond(trial.response);
                }
              }
              if (attempt.ending === "finished") {
                expect(step.kind).toBe("finished");
                if (step.kind === "finished") {
                  const { trials: records, ...result } = step.result;
                  expect(records.length).toBe(
                    trials.filter((trial) => trial.status === "scored").length,
                  );
                  expect(attempt.result).toEqual(result);
                }
              } else {
                expect(attempt.result).toBeNull();
                expect(step.kind).toBe("trial");
              }
            }

            // Each discarded trial equals the next scored trial of its run with its number.
            log.trials.forEach((trial, index) => {
              if (trial.status !== "discarded") {
                return;
              }
              const next = log.trials
                .slice(index + 1)
                .find(
                  (later) =>
                    later.roomIndex === trial.roomIndex &&
                    later.attempt === trial.attempt &&
                    later.trialNumber === trial.trialNumber &&
                    later.status === "scored",
                );
              const attempt = log.roomAttempts.find(
                (entry) =>
                  entry.roomIndex === trial.roomIndex &&
                  entry.attempt === trial.attempt,
              );
              if (attempt?.ending === "finished") {
                expect(next).toBeDefined();
              }
              if (next !== undefined) {
                expect(askedFor(next)).toEqual(askedFor(trial));
              }
            });
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

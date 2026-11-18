import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { Trial } from "../../src/engine/search-types";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import { turnSeedOf } from "../../src/session/turn-seed";
import type {
  LoggedRoomAttempt,
  VisitLog,
  VisitTrial,
} from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness, roomRuns } from "./visit-flow-harness";

// CP5. The log replays through the engine (Universal; visit-flow design.md, CP5; R7.9, R6.2,
// R13.3, R19.2). The visits render with the worst-case renderers (D26, audio-output D43). The
// property holds however the rooms run (one-room design.md, D1): one after another, and taking
// turns in one room. Where they take turns, whose turn it was replays too (one-room design.md, D5).
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

/**
 * The room runs of a log: the Room_Attempts that began in the same step, in room order. One room
 * at a time, each is a run of its own. In the one room, the searches that take turns are one run
 * (one-room design.md, "The flow").
 */
function runsOf(log: VisitLog): LoggedRoomAttempt[][] {
  const runsByStart = new Map<number, LoggedRoomAttempt[]>();
  for (const attempt of log.roomAttempts) {
    const members = runsByStart.get(attempt.startedAtMs) ?? [];
    members.push(attempt);
    runsByStart.set(attempt.startedAtMs, members);
  }
  return [...runsByStart.values()].map((members) =>
    [...members].sort((one, other) => one.roomIndex - other.roomIndex),
  );
}

describe("visit flow CP5. The log replays through the engine (Universal; R7.9, R6.2, R13.3)", () => {
  it.each(roomRuns)(
    "gives a new search with each run's seed and cap the trials and the result of that run, and the turn seed of the run its turns ($name)",
    async ({ roomsTogetherMaxCount }) => {
      await fc.assert(
        fc.asyncProperty(
          visitRunArbitrary({ withEnding: false }),
          async (visitRun) => {
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
              roomsTogetherMaxCount,
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

            // Whose turn it was is found again from the engine seeds of the log alone (one-room
            // design.md, D5): one draw when a run starts and one after each decided trial, while
            // two or more of the run's searches are open. A trial that was discarded is presented
            // again without a draw.
            const runsOfLog = runsOf(log);
            const roomCount =
              hearingMethodConfig.roomFrequenciesHz[visitRun.script.visitType]
                .length;
            // The first run holds as many searches as may take turns: one, one room at a time.
            expect(runsOfLog[0]).toHaveLength(
              Math.min(roomCount, roomsTogetherMaxCount),
            );
            for (const members of runsOfLog) {
              const turns = createSeededRandom(
                turnSeedOf(members.map((member) => member.engineSeed)),
              );
              const decided = log.trials.filter(
                (trial) =>
                  trial.status === "scored" &&
                  members.some(
                    (member) =>
                      member.roomIndex === trial.roomIndex &&
                      member.attempt === trial.attempt,
                  ),
              );
              // A search that finished closes at its last decided trial. One that was abandoned
              // stays open to the end of its run.
              const decidedLeft = new Map<number, number>(
                members.map((member) => [
                  member.roomIndex,
                  member.ending === "finished"
                    ? decided.filter(
                        (trial) => trial.roomIndex === member.roomIndex,
                      ).length
                    : Number.POSITIVE_INFINITY,
                ]),
              );
              let open = members.map((member) => member.roomIndex);
              for (const trial of decided) {
                const drawn =
                  open.length <= 1
                    ? open[0]
                    : open[
                        Math.min(
                          open.length - 1,
                          Math.floor(turns.next() * open.length),
                        )
                      ];
                expect(trial.roomIndex).toBe(drawn);
                const left = (decidedLeft.get(trial.roomIndex) ?? 0) - 1;
                decidedLeft.set(trial.roomIndex, left);
                if (left === 0) {
                  open = open.filter(
                    (roomIndex) => roomIndex !== trial.roomIndex,
                  );
                }
              }
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

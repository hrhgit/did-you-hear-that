import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import {
  playVisit,
  type VisitorEnding,
  type VisitorScript,
} from "../listeners/simulated-visitor";
import {
  answerDelayMaxMs,
  scriptSpanMs,
  visitRunArbitrary,
} from "./visit-flow-arbitraries";
import { createVisitHarness, type VisitHarness } from "./visit-flow-harness";
import {
  observeVisit,
  type ActionEntry,
  type StopReportEntry,
} from "./visit-flow-timeline";

// CP8. Stop leaves nothing (Universal; visit-flow design.md, CP8; R14). Every script here has an
// ending: the stop control or a left page at any time of the visit. One that comes before the
// result leaves the house; one that comes later meets the replay or the result, where stop
// silences and shows the result. The visits render with the worst-case renderers (D26,
// audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 100;
const timeoutMs = 120_000;

/** How long the clocks run after the visitor has left (design.md, CP8). */
const afterLeavingMs = 10 * 60_000;

/** Seeds are drawn as `floor(u × 2³²)` (D19). */
const seedRangeCount = 0x100000000;

/** The fields of the exit snapshot: the base fields and the reason, and nothing of a result. */
const exitSnapshotKeys = [
  "activationRefused",
  "canProceed",
  "finishedRoomCount",
  "pause",
  "reason",
  "rooms",
  "stage",
  "visitType",
];

const endingArbitrary: fc.Arbitrary<VisitorEnding> = fc.record({
  atMs: fc.integer({ min: 0, max: scriptSpanMs }),
  kind: fc.constantFrom("stop" as const, "pageLeft" as const),
});

/** A short visit to start after the front door: no answers, no rests, no disturbances. */
const nextVisitScript = (script: VisitorScript): VisitorScript => ({
  visitType: "quick",
  calibrationTargetDb: script.calibrationTargetDb,
  firstHeadphoneCheckAnswer: "left",
  listener: { kind: "extreme", name: "neverAnswers", seed: 0 },
  visitorSeed: script.visitorSeed,
  answerDelayMaxMs,
  timeStampModes: ["now"],
  restMaxMs: 0,
  extraPresses: [],
  disturbances: [],
  ending: null,
});

/** Whether the flow called `stopAll` inside an action. */
const stoppedAllIn = (harness: VisitHarness, entry: ActionEntry): boolean =>
  harness.outputCalls
    .slice(entry.outputCallCount, entry.after.outputCallCount)
    .some((call) => call.name === "stopAll");

/** What the harness has handed out and asked of the backend so far. */
const handedOut = (harness: VisitHarness) => ({
  schedules: harness.schedules.length,
  events: harness.events.length,
  snapshots: harness.snapshots.length,
  outputCalls: harness.outputCalls.length,
  presented: harness.presented.length,
});

describe("visit flow CP8. Stop leaves nothing (Universal; R14)", () => {
  it(
    "leaves the house at a stop or a left page before the result, with nothing kept and nothing after, and shows the result at a later stop",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitRunArbitrary(),
          endingArbitrary,
          async (visitRun, ending) => {
            const script: VisitorScript = { ...visitRun.script, ending };
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
              spyOnOutput: true,
            });
            const timeline = observeVisit(harness);
            const { flow } = timeline.driver;
            const run = await playVisit(timeline.driver, script);
            expect(run.ending).toBe("done");
            const endingEntry = timeline.entries.find(
              (entry): entry is ActionEntry | StopReportEntry =>
                (entry.kind === "action" && entry.name === "stop") ||
                (entry.kind === "stopReport" &&
                  entry.reportKind === "pageLeft"),
            );
            const final = flow.snapshot();

            if (final.stage === "exit") {
              // Right after the ending: the exit, with the ending's reason and nothing kept.
              expect(endingEntry).toBeDefined();
              if (endingEntry === undefined) {
                return;
              }
              expect(endingEntry.snapshotAfter).toEqual(final);
              expect(final.reason).toBe(
                ending.kind === "stop" ? "visitor" : "pageLeft",
              );
              if (endingEntry.kind === "action") {
                expect(stoppedAllIn(harness, endingEntry)).toBe(true);
              }
              expect(Object.keys(final).sort()).toEqual(exitSnapshotKeys);

              // Ten minutes later nothing has been scheduled, handed out or asked for.
              const before = handedOut(harness);
              await harness.advance(afterLeavingMs);
              expect(handedOut(harness)).toEqual(before);
              expect(flow.snapshot()).toEqual(final);

              // The front door, and a new visit from it with the next visit seed (D19).
              flow.backToFrontDoor();
              await harness.settle();
              expect(flow.snapshot().stage).toBe("entry");
              const next = await playVisit(
                timeline.driver,
                nextVisitScript(script),
              );
              expect(next.finalStage).toBe("result");
              const nextSnapshot = flow.snapshot();
              if (nextSnapshot.stage !== "result") {
                return;
              }
              const flowSource = createSeededRandom(visitRun.seed);
              const firstVisitSeed = Math.floor(
                flowSource.next() * seedRangeCount,
              );
              const secondVisitSeed = Math.floor(
                flowSource.next() * seedRangeCount,
              );
              expect(nextSnapshot.visitLog.visitSeed).toBe(secondVisitSeed);
              expect(nextSnapshot.visitLog.visitSeed).not.toBe(firstVisitSeed);
              return;
            }

            // The ending came at the replay or later.
            expect(final.stage).toBe("result");
            if (final.stage !== "result") {
              return;
            }
            if (endingEntry?.kind === "action") {
              expect(endingEntry.snapshotBefore.stage).toBe(
                "missedSoundReplay",
              );
              expect(endingEntry.snapshotAfter.stage).toBe("result");
              expect(stoppedAllIn(harness, endingEntry)).toBe(true);
            }

            // Stop on the result silences and stays.
            flow.stop();
            await harness.settle();
            expect(flow.snapshot()).toEqual(final);
            expect(harness.outputCalls.at(-1)?.name).toBe("stopAll");

            // Stop in the swapped repeat silences and shows the result.
            const offered = final.summary.rooms.find(
              (room) => room.swappedRepeatOffered,
            );
            if (offered !== undefined) {
              flow.chooseSwappedRepeat(offered.room.roomIndex);
              await harness.settle();
              expect(flow.snapshot().stage).toBe("swappedRepeat");
              flow.stop();
              await harness.settle();
              expect(flow.snapshot()).toEqual(final);
              expect(harness.outputCalls.at(-1)?.name).toBe("stopAll");
            }

            flow.backToFrontDoor();
            await harness.settle();
            expect(flow.snapshot().stage).toBe("entry");
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

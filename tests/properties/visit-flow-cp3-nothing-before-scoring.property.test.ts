import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { VisitSnapshot } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";
import {
  observeVisit,
  sameTrialPlace,
  visitStartMs,
  type PresentedEntry,
  type TimelineEntry,
} from "./visit-flow-timeline";

// CP3. Nothing about a trial before it is scored (Universal; visit-flow design.md, CP3; R9.1,
// R9.4, R9.5, R11.2, R11.3, R8.3; brief property 2). The visits render with the worst-case
// renderers (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** The random instants at which `snapshot()` is read in each stretch between two decisions. */
const probesPerStretchCount = 3;
/** The probes fall from 0 to this long after the stretch began: one gap, the lead and one window. */
const probeSpanMs =
  hearingMethodConfig.gapBetweenTrialsMaxMs +
  audioOutputConfig.scheduleLeadMs +
  hearingMethodConfig.responseWindowMs;

/** Whether an entry is something the visitor did that may change what is shown. */
const isVisitorStep = (entry: TimelineEntry): boolean =>
  (entry.kind === "action" && entry.name !== "answer") ||
  entry.kind === "stopReport";

describe("visit flow CP3. Nothing about a trial before it is scored (Universal; R9, R11.2, R11.3)", () => {
  it(
    "hands out and changes nothing between two decisions of a room run except on the visitor's own steps",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitRunArbitrary(),
          fc.integer({ min: 0, max: 0xffffffff }),
          async (visitRun, probeSeed) => {
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
            });
            const timeline = observeVisit(harness);
            const { entries } = timeline;
            const probeRandom = createSeededRandom(probeSeed);

            // A stretch begins at a room run's start or at a decision, and ends at the next.
            let stretchId = 0;
            let stretchStartSeq = 0;
            let baseline: VisitSnapshot | null = null;
            const differences: string[] = [];
            const compare = (id: number, where: string): void => {
              if (
                id !== stretchId ||
                baseline === null ||
                entries.slice(stretchStartSeq).some(isVisitorStep)
              ) {
                return;
              }
              const now = harness.flow.snapshot();
              if (!isDeepStrictEqual(now, baseline)) {
                differences.push(
                  `${where} at ${String(harness.now())}: ${JSON.stringify(now)} after ${JSON.stringify(baseline)}`,
                );
              }
            };
            harness.flow.onEvent((event) => {
              if (event.kind === "roomFinished") {
                stretchId += 1;
                baseline = null;
                return;
              }
              stretchId += 1;
              stretchStartSeq = entries.length;
              // The listeners run after the step's changes, so this is the snapshot just after
              // the stretch began.
              baseline = harness.flow.snapshot();
              const id = stretchId;
              const fromMs = harness.now();
              for (let index = 0; index < probesPerStretchCount; index += 1) {
                timeline.stopAt(fromMs + probeRandom.next() * probeSpanMs, () =>
                  compare(id, "probe"),
                );
              }
            });
            harness.onTrialPresented(() => compare(stretchId, "presentation"));

            const run = await playVisit(timeline.driver, visitRun.script);
            expect(run.ending).toBe("done");
            const startMs = visitStartMs(entries);

            // The snapshot read in a stretch is the one it began with.
            expect(differences).toEqual([]);

            // Within a room run, the timer hands out only decisions, and a room's end with its
            // last decision.
            let inRun = false;
            let previous: "scored" | "finished" | null = null;
            let previousAtMs = Number.NaN;
            for (const entry of entries) {
              if (
                entry.kind === "event" &&
                entry.event.kind === "roomStarted"
              ) {
                inRun = true;
              }
              if (
                inRun &&
                entry.cause === "timer" &&
                (entry.kind === "event" || entry.kind === "snapshot")
              ) {
                const allowed =
                  entry.kind === "event"
                    ? entry.event.kind === "trialScored" ||
                      (entry.event.kind === "roomFinished" &&
                        previous === "scored" &&
                        previousAtMs === entry.atMs)
                    : previous === "finished" && previousAtMs === entry.atMs;
                expect(
                  allowed,
                  `${entry.kind} ${JSON.stringify(entry.kind === "event" ? entry.event.kind : entry.snapshot.stage)} handed out by the timer at ${String(entry.atMs)}`,
                ).toBe(true);
              }
              if (entry.kind === "event" || entry.kind === "snapshot") {
                previous =
                  entry.kind === "event" && entry.event.kind === "trialScored"
                    ? "scored"
                    : entry.kind === "event" &&
                        entry.event.kind === "roomFinished"
                      ? "finished"
                      : null;
                previousAtMs = entry.atMs;
              } else {
                previous = null;
              }
              if (
                (entry.kind === "event" &&
                  entry.event.kind === "roomFinished") ||
                (entry.kind === "snapshot" && entry.snapshot.stage !== "room")
              ) {
                inRun = false;
              }
            }

            // What each event holds, and when.
            const presented: PresentedEntry[] = [];
            const rooms = entries.flatMap((entry) =>
              entry.kind === "snapshot" ? [entry.snapshot.rooms] : [],
            );
            const visitRooms = rooms.find((list) => list.length > 0) ?? [];
            for (const entry of entries) {
              if (entry.kind === "presented") {
                presented.push(entry);
                continue;
              }
              if (entry.kind !== "event") {
                continue;
              }
              const { event } = entry;
              switch (event.kind) {
                case "roomStarted":
                  expect(Object.keys(event).sort()).toEqual([
                    "attempt",
                    "kind",
                    "room",
                  ]);
                  expect(event.room).toEqual(visitRooms[event.room.roomIndex]);
                  break;
                case "roomFinished":
                  expect(Object.keys(event).sort()).toEqual(["kind", "room"]);
                  expect(event.room).toEqual(visitRooms[event.room.roomIndex]);
                  break;
                case "trialScored": {
                  const { trial } = event;
                  expect(trial.status).toBe("scored");
                  expect(entry.atMs - startMs).toBe(trial.scoredAtMs);
                  expect(trial.scoredAtMs).toBeGreaterThanOrEqual(
                    trial.windowStartMs,
                  );
                  // The trial it names is the one presented last, which is being decided now.
                  const last = presented.at(-1);
                  expect(last).toBeDefined();
                  if (last !== undefined) {
                    expect(sameTrialPlace(trial, last.trial)).toBe(true);
                    expect(trial.kind).toBe(last.trial.kind);
                    expect(trial.ear).toBe(last.trial.ear);
                    expect(trial.requestedLevelDb).toBe(last.trial.levelDb);
                  }
                  expect(event.room).toEqual(visitRooms[trial.roomIndex]);
                  break;
                }
              }
            }

            // An answer that decides nothing changes nothing and hands out nothing.
            for (const entry of entries) {
              if (entry.kind !== "action" || entry.name !== "answer") {
                continue;
              }
              const made = entries.slice(entry.seq + 1, entry.endSeq + 1);
              const decided = made.some(
                (inside) =>
                  inside.kind === "event" &&
                  inside.event.kind === "trialScored",
              );
              if (!decided) {
                expect(made).toEqual([]);
                expect(entry.snapshotAfter).toEqual(entry.snapshotBefore);
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

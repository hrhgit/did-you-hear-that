import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { VisitSnapshot } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness, roomRuns } from "./visit-flow-harness";
import {
  observeVisit,
  sameTrialPlace,
  visitStartMs,
  type PresentedEntry,
  type TimelineEntry,
} from "./visit-flow-timeline";

// CP3. Nothing about a trial before it is scored (Universal; visit-flow design.md, CP3; R9.1,
// R9.4, R9.5, R11.2, R11.3, R8.3; brief property 2). The visits render with the worst-case
// renderers (D26, audio-output D43). The property holds however the rooms run (one-room
// design.md, D1): one after another, and taking turns in one room, where a creature that goes home
// leaves the room run going with the others.
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

/**
 * A snapshot without the rhythm game's standing. The standing is the one thing a room shows that
 * moves without a decision: a kick at nothing breaks the combo, and the checks below hold it to
 * exactly that (the rhythm game, 2026-11-18).
 */
const withoutRhythm = (snapshot: VisitSnapshot): unknown =>
  snapshot.stage === "room" ? { ...snapshot, rhythm: null } : snapshot;

/** The combo a snapshot shows, or null where it shows none. */
const comboOf = (snapshot: VisitSnapshot): number | null =>
  snapshot.stage === "room" ? (snapshot.rhythm?.combo ?? null) : null;

/** Whether an entry is something the visitor did that may change what is shown. */
const isVisitorStep = (entry: TimelineEntry): boolean =>
  (entry.kind === "action" && entry.name !== "answer") ||
  entry.kind === "stopReport";

describe("visit flow CP3. Nothing about a trial before it is scored (Universal; R9, R11.2, R11.3)", () => {
  it.each(roomRuns)(
    "hands out and changes nothing between two decisions of a room run except on the visitor's own steps ($name)",
    async ({ roomsTogetherMaxCount, together }) => {
      // What the timer handed out in a room run after one of its creatures had gone home, over
      // all the visits. One room at a time there is no such moment.
      let handedOutAfterACreatureLeftCount = 0;
      await fc.assert(
        fc.asyncProperty(
          visitRunArbitrary(),
          fc.integer({ min: 0, max: 0xffffffff }),
          async (visitRun, probeSeed) => {
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
              roomsTogetherMaxCount,
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
              if (
                !isDeepStrictEqual(withoutRhythm(now), withoutRhythm(baseline))
              ) {
                differences.push(
                  `${where} at ${String(harness.now())}: ${JSON.stringify(now)} after ${JSON.stringify(baseline)}`,
                );
              }
            };
            harness.flow.onEvent((event) => {
              // The cue of a turn on the beat comes in the same step as what came before it (a
              // decision, the start or a resume), alike for every turn: it begins no stretch.
              if (event.kind === "turnCued") {
                return;
              }
              // The practice before the counting is not a stretch: what it shows (that a sound is
              // playing, never its side) is counted nowhere (audible-start, light plan). The first
              // stretch of a room run begins when its counting does.
              // In the one room a creature that goes home leaves the others about: the room run
              // goes on, and a stretch begins as at any decision (one-room design.md, "The flow").
              const roomGoesOn =
                together &&
                event.kind === "roomFinished" &&
                harness.flow.snapshot().stage === "room";
              if (
                !roomGoesOn &&
                (event.kind === "roomFinished" ||
                  event.kind === "roomStarted" ||
                  event.kind === "practiceSoundScored")
              ) {
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

            // Within the counting of a room run, the timer hands out only decisions (of a trial or
            // of a reminder sound after a long quiet, the game layer of 2026-11-17), a room's end
            // with its last decision, and the cue of the next turn, alike for every turn, with
            // the decision before it. The counting begins after the practice.
            let inRun = false;
            let aCreatureLeft = false;
            let previous: "scored" | "finished" | "counting" | null = null;
            let previousAtMs = Number.NaN;
            for (const entry of entries) {
              if (
                entry.kind === "event" &&
                entry.event.kind === "countingStarted"
              ) {
                inRun = true;
                aCreatureLeft = false;
                previous = "counting";
                previousAtMs = entry.atMs;
                continue;
              }
              if (
                inRun &&
                entry.cause === "timer" &&
                (entry.kind === "event" || entry.kind === "snapshot")
              ) {
                // A decision changes the chase, so its snapshot follows it in the same moment.
                const withDecision =
                  (previous === "finished" ||
                    previous === "counting" ||
                    previous === "scored") &&
                  previousAtMs === entry.atMs;
                const allowed =
                  entry.kind === "event"
                    ? entry.event.kind === "trialScored" ||
                      entry.event.kind === "reminderSoundScored" ||
                      (entry.event.kind === "roomFinished" &&
                        previous === "scored" &&
                        previousAtMs === entry.atMs) ||
                      (entry.event.kind === "turnCued" && withDecision)
                    : withDecision;
                expect(
                  allowed,
                  `${entry.kind} ${JSON.stringify(entry.kind === "event" ? entry.event.kind : entry.snapshot.stage)} handed out by the timer at ${String(entry.atMs)}`,
                ).toBe(true);
                if (aCreatureLeft) {
                  handedOutAfterACreatureLeftCount += 1;
                }
              }
              if (entry.kind === "event" && entry.event.kind === "turnCued") {
                // The cue rides with the decision before it.
                continue;
              }
              if (entry.kind === "event" || entry.kind === "snapshot") {
                previous =
                  entry.kind === "event" &&
                  (entry.event.kind === "trialScored" ||
                    entry.event.kind === "reminderSoundScored")
                    ? "scored"
                    : entry.kind === "event" &&
                        entry.event.kind === "roomFinished"
                      ? "finished"
                      : null;
                previousAtMs = entry.atMs;
              } else {
                previous = null;
              }
              // One room at a time, a room's end ends its run. In the one room the run goes on
              // with the creatures still about, until the page leaves the room.
              const roomEnded =
                entry.kind === "event" && entry.event.kind === "roomFinished";
              if (
                (roomEnded && !together) ||
                (entry.kind === "snapshot" && entry.snapshot.stage !== "room")
              ) {
                inRun = false;
              } else if (roomEnded && inRun) {
                aCreatureLeft = true;
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
                case "countingStarted":
                  expect(Object.keys(event).sort()).toEqual(["kind", "room"]);
                  expect(event.room).toEqual(visitRooms[event.room.roomIndex]);
                  break;
                case "practiceSoundScored": {
                  // Named only once decided, as a trial is; a ripple only for a catch.
                  const { trial } = event;
                  expect(entry.atMs - startMs).toBe(trial.scoredAtMs);
                  expect(event.reaction).toBe(
                    trial.outcome === "caught" ? "ripple" : "none",
                  );
                  expect(event.line === null).toBe(trial.outcome !== "caught");
                  break;
                }
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

            // An answer that decides nothing hands out only a kick at nothing, and changes nothing
            // but the combo, which it breaks. An answer that decides a trial or a reminder adds one
            // to the combo for a catch and breaks it for the wrong side or a sound at nothing. A
            // pause takes no answer (the rhythm game, 2026-11-18).
            for (const entry of entries) {
              if (entry.kind !== "action" || entry.name !== "answer") {
                continue;
              }
              const made = entries.slice(entry.seq + 1, entry.endSeq + 1);
              const scoredInside = made.flatMap((inside) =>
                inside.kind === "event" &&
                (inside.event.kind === "trialScored" ||
                  inside.event.kind === "reminderSoundScored" ||
                  inside.event.kind === "practiceSoundScored")
                  ? [inside.event]
                  : [],
              );
              const comboBefore = comboOf(entry.snapshotBefore);
              const comboAfter = comboOf(entry.snapshotAfter);
              const taken = entry.snapshotBefore.pause === null;
              if (scoredInside.length === 0) {
                expect(
                  made.flatMap((inside) =>
                    inside.kind === "event" &&
                    inside.event.kind !== "kickedAtNothing"
                      ? [inside.event.kind]
                      : [],
                  ),
                ).toEqual([]);
                expect(withoutRhythm(entry.snapshotAfter)).toEqual(
                  withoutRhythm(entry.snapshotBefore),
                );
                if (comboBefore !== null) {
                  expect(comboAfter).toBe(taken ? 0 : comboBefore);
                }
              } else if (
                comboBefore !== null &&
                comboAfter !== null &&
                scoredInside.every((event) => event.kind === "trialScored")
              ) {
                expect(taken).toBe(true);
                const caught = scoredInside.some(
                  (event) => event.trial.outcome === "caught",
                );
                expect(comboAfter).toBe(caught ? comboBefore + 1 : 0);
              }
            }
          },
        ),
        { numRuns: runs },
      );
      // In the one room, most of what the timer hands out comes after the first creature has gone
      // home. A property that stopped looking there would say little about the one room.
      if (together) {
        expect(handedOutAfterACreatureLeftCount).toBeGreaterThan(runs);
      } else {
        expect(handedOutAfterACreatureLeftCount).toBe(0);
      }
    },
    timeoutMs,
  );
});

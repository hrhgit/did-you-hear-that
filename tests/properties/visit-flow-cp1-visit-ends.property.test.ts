import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { ghostSoundConfig } from "../../src/config/ghost-sound-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { roomLimits } from "../../src/engine/room-limits";
import type { VisitSnapshot } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness, roomRuns } from "./visit-flow-harness";
import {
  observeVisit,
  visitStartMs,
  type SnapshotEntry,
  type TimelineEntry,
} from "./visit-flow-timeline";

// CP1. Every visit ends (Universal; visit-flow design.md, CP1 and D27; R22.4; brief property 1).
// The visits render with the worst-case renderers (D26, audio-output D43). The property holds
// however the rooms run (one-room design.md, D1): one after another, and taking turns in one room.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** The calibration repeats the budget allows for one calibration (design.md, CP1). */
const calibrationRepeatsPerCalibrationCount = 60;

const { roomTrialLimitCount } = roomLimits(hearingMethodConfig);
const { gapBetweenTrialsMaxMs, responseWindowMs } = hearingMethodConfig;
const { scheduleLeadMs, calibrationRepeatGapMs } = audioOutputConfig;
const calibrationRepeatMs =
  ghostSoundConfig.calibration.durationMs + calibrationRepeatGapMs;
const trialMaxMs = gapBetweenTrialsMaxMs + scheduleLeadMs + responseWindowMs;

/**
 * The time the flow spent waiting for the visitor: while a pause held, and while `proceed`
 * would have gone on (the rests before each `proceed`).
 */
function visitorWaitsMs(
  entries: readonly TimelineEntry[],
  startMs: number,
  endMs: number,
  first: VisitSnapshot,
): number {
  const snapshots = entries.filter(
    (entry): entry is SnapshotEntry =>
      entry.kind === "snapshot" && entry.atMs >= startMs,
  );
  let waitsMs = 0;
  let held = first;
  let fromMs = startMs;
  for (const entry of [...snapshots, null]) {
    const untilMs = entry === null ? endMs : entry.atMs;
    if (held.pause !== null || held.canProceed) {
      waitsMs += untilMs - fromMs;
    }
    if (entry !== null) {
      held = entry.snapshot;
      fromMs = entry.atMs;
    }
  }
  return waitsMs;
}

describe("visit flow CP1. Every visit ends (Universal; R22.4)", () => {
  it.each(roomRuns)(
    "reaches the result, or the exit at the visitor's ending, within the time budget of the design ($name)",
    async ({ roomsTogetherMaxCount, together }) => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const { script } = visitRun;
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            roomsTogetherMaxCount,
          });
          const first = harness.flow.snapshot();
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, script);
          const { entries } = timeline;

          expect(run.ending).toBe("done");
          const final = harness.flow.snapshot();
          expect(["result", "exit"]).toContain(final.stage);

          const startMs = visitStartMs(entries);
          const lastSnapshot = [...entries]
            .reverse()
            .find((entry): entry is SnapshotEntry => entry.kind === "snapshot");
          expect(lastSnapshot?.snapshot).toEqual(final);
          const endMs = lastSnapshot?.atMs ?? startMs;
          const replay = entries.find(
            (entry) =>
              entry.kind === "snapshot" &&
              entry.snapshot.stage === "missedSoundReplay",
          );
          const endingEntries = entries.filter(
            (entry) =>
              (entry.kind === "action" && entry.name === "stop") ||
              (entry.kind === "stopReport" && entry.reportKind === "pageLeft"),
          );

          if (final.stage === "exit") {
            // The exit is the visitor's ending, reached in the same step, before the replay.
            expect(script.ending).not.toBeNull();
            expect(replay).toBeUndefined();
            expect(endingEntries).toHaveLength(1);
            const ending = endingEntries[0];
            if (
              script.ending === null ||
              ending === undefined ||
              (ending.kind !== "action" && ending.kind !== "stopReport")
            ) {
              return;
            }
            expect(ending.atMs).toBe(startMs + script.ending.atMs);
            expect(ending.kind).toBe(
              script.ending.kind === "stop" ? "action" : "stopReport",
            );
            expect(ending.snapshotAfter).toEqual(final);
            expect(final.reason).toBe(
              script.ending.kind === "stop" ? "visitor" : "pageLeft",
            );
          } else {
            // A result: any ending came no earlier than the replay.
            expect(replay).toBeDefined();
            if (script.ending !== null && replay !== undefined) {
              expect(startMs + script.ending.atMs).toBeGreaterThanOrEqual(
                replay.atMs,
              );
              for (const ending of endingEntries) {
                expect(ending.seq).toBeGreaterThan(replay.seq);
              }
            }
          }

          // The time budget T of CP1.
          const calibrationCount = entries.filter(
            (entry) =>
              entry.kind === "action" &&
              entry.name === "startCalibration" &&
              entry.snapshotBefore.stage === "calibration" &&
              entry.snapshotBefore.pause === null,
          ).length;
          const deviceChangeCount = entries.filter(
            (entry) =>
              entry.kind === "stopReport" &&
              entry.reportKind === "deviceChanged",
          ).length;
          const roomCount =
            hearingMethodConfig.roomFrequenciesHz[script.visitType].length;
          // One room at a time, a change of device costs the one run it ends. In the one room it
          // ends the run of every search still going, and each of those starts again (one-room
          // design.md, "The flow").
          const attemptCount = together
            ? roomCount * (1 + deviceChangeCount)
            : roomCount + deviceChangeCount;
          const budgetMs =
            visitorWaitsMs(entries, startMs, endMs, first) +
            calibrationCount *
              calibrationRepeatsPerCalibrationCount *
              calibrationRepeatMs +
            attemptCount * roomTrialLimitCount * trialMaxMs;
          expect(
            endMs - startMs,
            `${String(calibrationCount)} calibrations, ${String(attemptCount)} room runs`,
          ).toBeLessThanOrEqual(budgetMs);
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

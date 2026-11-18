import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import {
  checkPausesDiscardAndRepeat,
  checkPausesInOneRoom,
  type OneRoomPauseTally,
} from "./visit-flow-cp7-check";
import { createVisitHarness, roomRuns } from "./visit-flow-harness";
import { observeVisit } from "./visit-flow-timeline";

// CP7. Pauses discard and repeat (Universal; visit-flow design.md, CP7; R12.3 to R12.7, R13.1 to
// R13.3, R21.3). The visits render with the worst-case renderers (D26, audio-output D43). The
// check for one visit is `checkPausesDiscardAndRepeat`, which the regression file shares. Where
// the rooms take turns in one room (one-room design.md, D1 and "The flow"), it is
// `checkPausesInOneRoom`: the turn stays with its creature through a pause, and a change of device
// starts again every creature that is still about and no creature that has gone home.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/**
 * The visits of the fixed draw below, and its seed. With a seed the visits are the same every
 * time, so what they meet cannot change by chance.
 */
const fixedRuns = 200;
const fixedSeed = 20261117;

/** The one room, where the site runs its rooms together. */
const oneRoom = roomRuns.find((roomRun) => roomRun.together);

describe("visit flow CP7. Pauses discard and repeat (Universal; R12.3 to R12.7, R13.1 to R13.3)", () => {
  it.each(roomRuns)(
    "schedules nothing in a pause, presents the waiting trial again after it, and starts a room again after a device change ($name)",
    async ({ roomsTogetherMaxCount, together }) => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            roomsTogetherMaxCount,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          if (together) {
            checkPausesInOneRoom(harness, timeline.entries, run);
          } else {
            checkPausesDiscardAndRepeat(harness, timeline.entries, run);
          }
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  // The check of the one room has to meet what it is for, or it would say little. A pause that
  // interrupts a trial, and a change of device after a creature has gone home, are rare enough
  // that fifty drawn visits may hold none. So this draw is fixed: the same visits every time.
  it.runIf(oneRoom !== undefined)(
    "meets, in the one room, sounds presented again after a pause, pauses in a gap, and changes of device before and after a creature has gone home",
    async () => {
      const met: Record<keyof OneRoomPauseTally, number> = {
        presentedAgainCount: 0,
        gapPauseCount: 0,
        abandonedRunCount: 0,
        restartsPastAGoneCreatureCount: 0,
      };
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            roomsTogetherMaxCount: oneRoom?.roomsTogetherMaxCount ?? 1,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          const tally = checkPausesInOneRoom(harness, timeline.entries, run);
          met.presentedAgainCount += tally.presentedAgainCount;
          met.gapPauseCount += tally.gapPauseCount;
          met.abandonedRunCount += tally.abandonedRunCount;
          met.restartsPastAGoneCreatureCount +=
            tally.restartsPastAGoneCreatureCount;
        }),
        { numRuns: fixedRuns, seed: fixedSeed },
      );
      expect(met.presentedAgainCount, JSON.stringify(met)).toBeGreaterThan(0);
      expect(met.gapPauseCount, JSON.stringify(met)).toBeGreaterThan(0);
      expect(met.abandonedRunCount, JSON.stringify(met)).toBeGreaterThan(0);
      expect(
        met.restartsPastAGoneCreatureCount,
        JSON.stringify(met),
      ).toBeGreaterThan(0);
    },
    timeoutMs,
  );
});

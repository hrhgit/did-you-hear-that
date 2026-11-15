import fc from "fast-check";
import { describe, it, vi } from "vitest";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { checkPausesDiscardAndRepeat } from "./visit-flow-cp7-check";
import { createVisitHarness } from "./visit-flow-harness";
import { observeVisit } from "./visit-flow-timeline";

// CP7. Pauses discard and repeat (Universal; visit-flow design.md, CP7; R12.3 to R12.7, R13.1 to
// R13.3, R21.3). The visits render with the worst-case renderers (D26, audio-output D43). The
// check for one visit is `checkPausesDiscardAndRepeat`, which the regression file shares.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

describe("visit flow CP7. Pauses discard and repeat (Universal; R12.3 to R12.7, R13.1 to R13.3)", () => {
  it(
    "schedules nothing in a pause, presents the waiting trial again after it, and starts a room again after a device change",
    async () => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          checkPausesDiscardAndRepeat(harness, timeline.entries, run);
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

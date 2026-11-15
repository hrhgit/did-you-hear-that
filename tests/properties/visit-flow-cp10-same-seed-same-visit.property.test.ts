import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary, type VisitRun } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";

// CP10. Same seed, same visit (Universal; visit-flow design.md, CP10; R19.3). The visits render
// with the worst-case renderers (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** Plays `visitRun` on a fresh harness and returns everything the flow handed out and did. */
async function playOnFreshHarness(visitRun: VisitRun) {
  const harness = createVisitHarness({
    seed: visitRun.seed,
    performanceOffsetMs: visitRun.performanceOffsetMs,
  });
  const run = await playVisit(harness, visitRun.script);
  const final = harness.flow.snapshot();
  return {
    run,
    log:
      final.stage === "result" || final.stage === "missedSoundReplay"
        ? final.visitLog
        : null,
    snapshots: harness.snapshots,
    events: harness.events,
    presented: harness.presented,
    actions: harness.actions,
    schedules: harness.schedules,
  };
}

describe("visit flow CP10. Same seed, same visit (Universal; R19.3)", () => {
  it(
    "gives two flows with the same seed, given the same actions at the same times, the same log, snapshots and events",
    async () => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const first = await playOnFreshHarness(visitRun);
          const second = await playOnFreshHarness(visitRun);
          expect(second.run.ending).toBe("done");
          expect(second.log).toEqual(first.log);
          expect(second.snapshots).toEqual(first.snapshots);
          expect(second.events).toEqual(first.events);
          expect(second.presented).toEqual(first.presented);
          expect(second.actions).toEqual(first.actions);
          expect(second.schedules).toEqual(first.schedules);
          expect(second.run).toEqual(first.run);
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

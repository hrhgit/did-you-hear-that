import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { planMissedSoundReplay } from "../../src/session/missed-sound-replay-plan";
import type { VisitLog } from "../../src/session/visit-flow-types";
import {
  replayScriptArbitrary,
  visitLogArbitrary,
} from "./missed-sound-replay-arbitraries";
import type { ReplayHarness } from "./missed-sound-replay-harness";
import { createReplayHarness } from "./missed-sound-replay-harness";

// CP6. A replay follows from its log alone (Universal; missed-sound-replay design.md, CP6; R14,
// R13.5). For a drawn visit log and a replay script, two harnesses made from equal logs (the
// second from a JSON copy), with equal shells and timers and the same script, give equal views
// after every step, equal events and equal backend `schedule` calls, sample for sample. The plan
// equals the plan of a JSON copy of the log, and the log is deep-equal before and after the run.
// The check that the seed the flow draws on entering the stage equals `replayRenderSeed(log)` is
// part of CP10 (task 13), because it needs the flow.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 200;
const timeoutMs = 120_000;
/** How long the harnesses run on after the script's last entry. */
const tailMs = 60_000;

const jsonCopy = (log: VisitLog): VisitLog =>
  JSON.parse(JSON.stringify(log)) as VisitLog;

/** Whether two channels hold the same samples, bit for bit. */
function sameSamples(a: Float32Array, b: Float32Array): boolean {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(
    Buffer.from(b.buffer, b.byteOffset, b.byteLength),
  );
}

/** What a harness recorded, with the samples left out (they are compared bit for bit). */
function recordOf(harness: ReplayHarness) {
  return {
    steps: harness.steps,
    events: harness.events,
    plays: harness.plays,
    actions: harness.actions,
    reports: harness.reports,
    stopAlls: harness.stopAlls,
    schedules: harness.schedules.map((schedule) => ({
      seq: schedule.seq,
      atMs: schedule.atMs,
      startMs: schedule.startMs,
      sampleRateHz: schedule.sampleRateHz,
    })),
    backendCalls: harness.backendCalls().map((call) =>
      call.kind === "schedule"
        ? {
            kind: call.kind,
            startMs: call.startMs,
            sampleRateHz: call.sampleRateHz,
          }
        : call,
    ),
  };
}

describe("missed-sound replay CP6: a replay follows from its log alone", () => {
  it(
    "gives equal views, events and samples from equal logs, plans the same from a JSON copy, and leaves the log as it was",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitLogArbitrary,
          replayScriptArbitrary,
          async ({ log: drawnLog }, script) => {
            const drawnBefore = structuredClone(drawnLog);
            const first = await createReplayHarness({
              log: drawnLog,
              outputDelayMs: script.outputDelayMs,
            });
            const second = await createReplayHarness({
              log: jsonCopy(drawnLog),
              outputDelayMs: script.outputDelayMs,
            });
            const logBefore = structuredClone(first.log);
            // The two logs are equal as JSON values: a JSON copy writes −0 as 0, which a free
            // top of an earlier calibration may hold and the plan never reads.
            expect(jsonCopy(second.log)).toEqual(jsonCopy(first.log));

            expect(first.controller.plan).toEqual(
              planMissedSoundReplay(jsonCopy(first.log)),
            );
            expect(first.controller.plan).toEqual(second.controller.plan);

            await first.run(script, tailMs);
            await second.run(script, tailMs);

            expect(recordOf(second)).toEqual(recordOf(first));
            expect(second.schedules).toHaveLength(first.schedules.length);
            first.schedules.forEach((schedule, index) => {
              const other = second.schedules[index]!;
              expect(sameSamples(schedule.left, other.left)).toBe(true);
              expect(sameSamples(schedule.right, other.right)).toBe(true);
            });
            // Every play drew its render from the source of the log's render seed.
            for (const play of [...first.plays, ...second.plays]) {
              expect(play.withRenderSource).toBe(true);
            }

            // The replay writes nothing to the log (R13.5, D18).
            expect(first.log).toEqual(logBefore);
            expect(Object.isFrozen(first.log)).toBe(true);
            expect(drawnLog).toEqual(drawnBefore);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

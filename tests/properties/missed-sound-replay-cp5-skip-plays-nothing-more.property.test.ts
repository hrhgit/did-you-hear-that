import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { ReplayScript } from "./missed-sound-replay-arbitraries";
import {
  endingReplayScriptArbitrary,
  missedLogArbitrary,
} from "./missed-sound-replay-arbitraries";
import type { ReplayHarness } from "./missed-sound-replay-harness";
import { createReplayHarness } from "./missed-sound-replay-harness";

// CP5. A skipped or stopped replay plays nothing more (Universal; missed-sound-replay design.md,
// CP5; R10, R11.1, R11.6). For a drawn visit log with at least one miss and a replay script that
// ends with `proceed`, `stop` or a left page at a drawn time after `startReplay`, possibly in the
// middle of a sound, in a gap or during a pause: at the moment the stage is left, `stopAll` was
// called when a sound was under way (for skip and stop; the shell's own stop has already faded it
// for a left page), and after it, ten minutes of clock make no play, no backend `schedule` call
// and no event, and the controller has no pending timer.
//
// The first action of the run that leaves the stage is checked, which is the script's ending or
// an earlier `proceed`, `stop` or left page among its events. A `proceed` while a pause holds is
// not a skip: the stage accepts only `resume` and `stop` then (R11.7), so it is checked to be
// ignored instead.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 300;
const timeoutMs = 120_000;
/** How long the clocks move on after the stage is left (CP5: ten minutes). */
const afterMs = 10 * 60_000;

/** Whether a sound was under way just before the record with `seq`, at `atMs`. */
function soundUnderWay(
  harness: ReplayHarness,
  outputDelayMs: number,
  seq: number,
  atMs: number,
): boolean {
  const last = harness.plays
    .filter((play) => play.seq < seq && play.outcome.kind === "scheduled")
    .at(-1);
  if (last === undefined || last.outcome.kind !== "scheduled") {
    return false;
  }
  const cutSince = harness.reports.some(
    (report) => report.seq > last.seq && report.seq < seq,
  );
  if (cutSince) {
    return false;
  }
  // The start on the page clock as the timestamp pair gives it, never before the request.
  const startPageMs = Math.max(last.atMs, last.outcome.startMs + outputDelayMs);
  const endPageMs = startPageMs + (last.outcome.endMs - last.outcome.startMs);
  return atMs < endPageMs;
}

describe("missed-sound replay CP5: a skipped or stopped replay plays nothing more", () => {
  it(
    "silences a sound under way on skip and stop, shows the result, and plays and hands out nothing after it",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          missedLogArbitrary,
          endingReplayScriptArbitrary,
          async ({ log }, script) => {
            const harness = await createReplayHarness({
              log,
              outputDelayMs: script.outputDelayMs,
            });
            const played: ReplayScript = {
              ...script,
              events: [
                ...script.events,
                {
                  atMs: script.ending.atMs,
                  action: script.ending.action,
                  resumeAfterMs: null,
                },
              ],
            };
            await harness.run(played, 0);

            const leavingStep = harness.steps.find(
              (step) => step.stage !== "missedSoundReplay",
            );
            if (leavingStep === undefined) {
              // Only a proceed while a pause holds leaves the stage as it was: stop and a left
              // page always leave it, and so does a proceed with no pause.
              expect(script.ending.action).toBe("proceed");
              const proceeds = harness.actions.filter(
                (action) => action.name === "proceed",
              );
              expect(proceeds.length).toBeGreaterThan(0);
              for (const proceed of proceeds) {
                expect(proceed.pauseBefore).not.toBeNull();
                const before = harness.steps
                  .filter((step) => step.seq < proceed.seq)
                  .at(-1);
                expect(before?.canProceed).toBe(false);
              }
              expect(harness.stage()).toBe("missedSoundReplay");
              return;
            }
            expect(leavingStep.stage).toBe("result");
            const cause = leavingStep.cause;
            const leavingAction = harness.actions
              .filter((action) => action.seq < leavingStep.seq)
              .at(-1);
            const leavingReport = harness.reports
              .filter((report) => report.seq < leavingStep.seq)
              .at(-1);
            const left =
              cause.kind === "action"
                ? leavingAction
                : cause.kind === "stopReport"
                  ? leavingReport
                  : undefined;
            expect(left).toBeDefined();
            if (left === undefined) {
              return;
            }
            const stopAllsInStep = harness.stopAlls.filter(
              (stopAll) =>
                stopAll.seq > left.seq && stopAll.seq < leavingStep.seq,
            );
            const underWay = soundUnderWay(
              harness,
              script.outputDelayMs,
              left.seq,
              left.atMs,
            );
            if (cause.kind === "action") {
              expect(["proceed", "stop"]).toContain(cause.name);
              if (cause.name === "stop") {
                expect(stopAllsInStep).toHaveLength(1);
              } else {
                // Skip silences exactly when a sound may be under way (D14).
                expect(stopAllsInStep).toHaveLength(underWay ? 1 : 0);
              }
            } else {
              expect(cause).toEqual({ kind: "stopReport", reason: "pageLeft" });
            }

            const lastSeqAtLeaving = leavingStep.seq;
            await harness.advance(afterMs);
            expect(harness.stage()).toBe("result");
            expect(
              harness.plays.filter((play) => play.seq > lastSeqAtLeaving),
            ).toEqual([]);
            expect(
              harness.schedules.filter(
                (schedule) => schedule.seq > lastSeqAtLeaving,
              ),
            ).toEqual([]);
            expect(
              harness.events.filter((event) => event.seq > lastSeqAtLeaving),
            ).toEqual([]);
            expect(harness.pendingReplayTimerCount()).toBe(0);
            // Nothing scheduled after the stage was left reached the backend.
            const schedulesAtLeaving = harness.schedules.length;
            expect(
              harness.backendCalls().filter((call) => call.kind === "schedule"),
            ).toHaveLength(schedulesAtLeaving);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

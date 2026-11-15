import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { replayCopy } from "../../src/copy/replay-copy";
import { replayCounts } from "../../src/session/replay-counts";
import {
  nothingMissedLogArbitrary,
  replayScriptArbitrary,
} from "./missed-sound-replay-arbitraries";
import { createReplayHarness } from "./missed-sound-replay-harness";

// CP4. A visit with nothing missed skips the stage (Universal; missed-sound-replay design.md, CP4;
// R9). For a drawn visit log whose share of misses is 0 and a replay script, the controller's
// first view is `nothingMissed` with its one line and the counts of the whole log, no view has
// another phase, nothing plays, no event is handed out, `startReplay` changes nothing, and
// `proceed` leads to the result. The run through the flow is in the simulated visits (task 13).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 300;
const timeoutMs = 120_000;
/** How long the harness runs on after the script's last entry. */
const tailMs = 60_000;

describe("missed-sound replay CP4: a visit with nothing missed skips the stage", () => {
  it(
    "shows one line and the whole log's counts, plays nothing, hands out nothing, and goes on to the result on proceed",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          nothingMissedLogArbitrary,
          replayScriptArbitrary,
          async ({ log: drawnLog }, script) => {
            const harness = await createReplayHarness({
              log: drawnLog,
              outputDelayMs: script.outputDelayMs,
            });
            const { log } = harness;
            const whole = replayCounts(log, null);
            expect(harness.controller.plan.sounds).toEqual([]);

            const first = harness.steps[0]!.view;
            expect(first).toMatchObject({
              phase: "nothingMissed",
              line: replayCopy.nothingMissedLine,
              canStart: false,
              canSkip: false,
            });
            expect(
              first?.phase === "nothingMissed" && {
                left: first.counts.left,
                right: first.counts.right,
                throughTrialOrder: first.counts.throughTrialOrder,
              },
            ).toEqual({ ...whole, throughTrialOrder: null });

            await harness.run(script, tailMs);

            for (const step of harness.steps) {
              if (step.view !== null) {
                expect(step.view.phase).toBe("nothingMissed");
                expect(step.view).toEqual(first);
              }
              // No pause begins where nothing plays (R11.4).
              expect(step.pause).toBeNull();
              expect(step.activationRefused).toBe(false);
            }
            expect(harness.plays).toEqual([]);
            expect(harness.schedules).toEqual([]);
            expect(
              harness.backendCalls().filter((call) => call.kind === "schedule"),
            ).toEqual([]);
            expect(harness.events).toEqual([]);
            expect(harness.pendingReplayTimerCount()).toBe(0);

            // Every proceed, stop or left page given in the stage led to the result at once.
            const leaving = [
              ...harness.actions
                .filter(
                  (action) =>
                    (action.name === "proceed" || action.name === "stop") &&
                    action.stageBefore === "missedSoundReplay",
                )
                .map((action) => action.seq),
              ...harness.reports
                .filter(
                  (report) =>
                    report.reason === "pageLeft" &&
                    report.stageBefore === "missedSoundReplay",
                )
                .map((report) => report.seq),
            ];
            for (const leftAt of leaving) {
              const after = harness.steps.find((step) => step.seq > leftAt);
              expect(after?.stage).toBe("result");
            }

            // A startReplay in the stage changed nothing.
            for (const action of harness.actions) {
              if (
                action.name === "startReplay" &&
                action.stageBefore === "missedSoundReplay"
              ) {
                const after = harness.steps.find(
                  (step) => step.seq > action.seq,
                );
                expect(after?.stage).toBe("missedSoundReplay");
                expect(after?.view).toEqual(first);
              }
            }

            if (harness.stage() === "missedSoundReplay") {
              await harness.startReplay();
              expect(harness.current().view).toEqual(first);
              await harness.proceed();
            }
            expect(harness.stage()).toBe("result");
            await harness.advance(tailMs);
            expect(harness.plays).toEqual([]);
            expect(harness.events).toEqual([]);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { missedSoundReplayConfig } from "../../src/config/missed-sound-replay-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import { replayCopy } from "../../src/copy/replay-copy";
import { endLine } from "../../src/copy/replay-lines";
import { replayCounts } from "../../src/session/replay-counts";
import type { RefusalScriptEntry } from "./missed-sound-replay-arbitraries";
import {
  missedLogArbitrary,
  refusalScriptArbitrary,
  replayScriptArbitrary,
} from "./missed-sound-replay-arbitraries";
import type {
  RecordedReplayStep,
  ReplayHarness,
} from "./missed-sound-replay-harness";
import {
  createReplayHarness,
  expectedPlanIndexes,
  interruptionsAfter,
} from "./missed-sound-replay-harness";

// CP8. Pauses, endings and refusals (Universal; missed-sound-replay design.md, CP8; R11.2 to
// R11.5, R11.7 to R11.9, R12, R13.1, R13.2). For a drawn visit log with at least one miss and a
// replay script, and for one run in three a refusal script on a scripted output: no play while a
// pause holds, which shows its line and allows neither skip nor proceed; after a resume, the cut
// sound or the next one, one gap after the pause ended; a device change ends the replay; a refused
// sound is asked for again one gap later and the third refusal in a row ends the replay; a replay
// with no ending event and every pause resumed finishes within its bound; every finished view has
// its end line and the whole log's counts; and the log is unchanged.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 300;
const timeoutMs = 120_000;
/** How long the harness runs on after the script's last entry: more than any bound of the replay. */
const tailMs = 10 * 60_000;

const { replayGapMs } = missedSoundReplayConfig;
const { scheduleLeadMs } = audioOutputConfig;
const { refusedPlaysInARowMaxCount } = visitFlowConfig;
const { ghostSoundMaxDurationMs } = audioSafetyConfig;

const stepAfter = (
  harness: ReplayHarness,
  seq: number,
): RecordedReplayStep | undefined =>
  harness.steps.find((step) => step.seq > seq);

const stepBefore = (
  harness: ReplayHarness,
  seq: number,
): RecordedReplayStep | undefined =>
  harness.steps.filter((step) => step.seq < seq).at(-1);

/** What a step shows, without when and why it was recorded. */
const shown = (step: RecordedReplayStep | undefined) =>
  step === undefined
    ? undefined
    : {
        stage: step.stage,
        pause: step.pause,
        canProceed: step.canProceed,
        activationRefused: step.activationRefused,
        view: step.view,
      };

describe("missed-sound replay CP8: pauses, endings and refusals", () => {
  it(
    "pauses without playing, resumes with the cut or the next sound, ends on a device change or three refusals, and finishes within its bound",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          missedLogArbitrary,
          replayScriptArbitrary,
          fc.integer({ min: 1, max: 3 }),
          refusalScriptArbitrary,
          async ({ log: drawnLog }, script, pick, refusalScript) => {
            const refusals: readonly RefusalScriptEntry[] | null =
              pick === 1 ? refusalScript : null;
            const delayMs = script.outputDelayMs;
            const harness = await createReplayHarness({
              log: drawnLog,
              outputDelayMs: delayMs,
              refusals,
            });
            const { log } = harness;
            const logBefore = structuredClone(log);
            const { plan } = harness.controller;
            await harness.run(script, tailMs);

            const indexes = expectedPlanIndexes(harness, delayMs);
            const whole = replayCounts(log, null);

            // No play while a pause holds, and only in the stage (R11.2, R11.7).
            for (const play of harness.plays) {
              const before = stepBefore(harness, play.seq);
              expect(before?.stage).toBe("missedSoundReplay");
              expect(before?.pause).toBeNull();
            }

            for (const step of harness.steps) {
              if (step.view === null) {
                continue;
              }
              if (step.pause !== null) {
                // A pause holds only while the sounds play, and shows its own line (R11.7).
                expect(step.view.phase).toBe("playing");
                expect(step.canProceed).toBe(false);
                expect(step.view.canSkip).toBe(false);
                expect(
                  step.view.phase === "playing" && step.view.pauseLine,
                ).toBe(replayCopy.pauseLines[step.pause]);
                expect(
                  step.view.phase === "playing" && step.view.resumeLabel,
                ).toBe(replayCopy.resumeButton);
              } else {
                expect(step.canProceed).toBe(true);
                if (step.view.phase === "playing") {
                  expect(step.view.pauseLine).toBeNull();
                  expect(step.view.canSkip).toBe(true);
                }
              }
              if (step.view.phase === "finished") {
                // Every finished view has its end line and the whole log's counts (R13.2).
                expect(step.view.endLine).toBe(
                  endLine(
                    step.view.ending,
                    plan.sounds.length,
                    plan.missedSounds.length,
                  ),
                );
                expect(step.view.counts).toMatchObject({
                  throughTrialOrder: null,
                  left: whole.left,
                  right: whole.right,
                });
              }
            }

            // Reports in a phase where nothing plays begin no pause (R11.4); a device change in
            // announcing or playing ends the replay and nothing plays after it (R11.5).
            for (const report of harness.reports) {
              if (report.stageBefore !== "missedSoundReplay") {
                continue;
              }
              const before = stepBefore(harness, report.seq);
              const after = stepAfter(harness, report.seq);
              const phaseBefore = before?.view?.phase;
              if (
                (report.reason === "hidden" ||
                  report.reason === "interrupted") &&
                phaseBefore !== "playing"
              ) {
                expect(after?.pause).toBeNull();
              }
              if (
                report.reason === "deviceChanged" &&
                (phaseBefore === "announcing" || phaseBefore === "playing")
              ) {
                expect(after?.pause).toBeNull();
                expect(after?.view).toMatchObject({
                  phase: "finished",
                  ending: "deviceChanged",
                });
                expect(
                  harness.plays.filter((play) => play.seq > report.seq),
                ).toEqual([]);
              }
              if (report.reason === "pageLeft") {
                expect(after?.stage).toBe("result");
              }
            }

            // `pause()` is ignored; while a pause holds, `proceed` and `startReplay` are too
            // (R11.7, R11.8).
            for (const action of harness.actions) {
              const ignored =
                action.name === "pause" ||
                (action.pauseBefore !== null &&
                  (action.name === "proceed" || action.name === "startReplay"));
              if (ignored && action.stageBefore === "missedSoundReplay") {
                expect(shown(stepAfter(harness, action.seq))).toEqual(
                  shown(stepBefore(harness, action.seq)),
                );
              }
            }

            // After a resume the shell accepts, the cut sound or the next one, one gap after the
            // pause ended (R11.3).
            harness.steps.forEach((step, stepIndex) => {
              const before = harness.steps[stepIndex - 1];
              if (
                before?.pause === null ||
                before === undefined ||
                step.pause !== null ||
                step.view?.phase !== "playing" ||
                step.cause.kind !== "action" ||
                step.cause.name !== "resume"
              ) {
                return;
              }
              const dueMs = step.atMs + replayGapMs;
              const cutBefore = interruptionsAfter(harness, step.seq).some(
                (cut) => cut.atMs < dueMs,
              );
              if (cutBefore) {
                return;
              }
              const nextIndex = harness.plays.findIndex(
                (play) => play.seq > step.seq,
              );
              const next = harness.plays[nextIndex];
              expect(next).toBeDefined();
              expect(next?.atMs).toBe(dueMs);
              const planned = plan.sounds[indexes[nextIndex]!]!;
              expect(next?.request).toEqual({
                soundId: planned.room.roomId,
                ear: planned.ear,
                levelDb: planned.askedLevelDb,
                purpose: "replay",
              });
            });

            // Refusals (R12): notRunning acts as a stop report, notCalibrated as a device change,
            // any other is asked for again one gap later, and the third in a row ends the replay.
            let inARow = 0;
            harness.plays.forEach((play, playIndex) => {
              const after = stepAfter(harness, play.seq);
              if (play.outcome.kind === "scheduled") {
                inARow = 0;
                return;
              }
              const { reason } = play.outcome;
              if (reason === "notRunning") {
                // As a stop report with the shell's reason, or `interrupted` when it gives none
                // or `control` (R12.1).
                const state = play.shellStateBefore;
                expect(after?.pause).toBe(
                  state.kind === "stopped" && state.reason !== "control"
                    ? state.reason
                    : "interrupted",
                );
                return;
              }
              if (reason === "notCalibrated") {
                expect(after?.view).toMatchObject({
                  phase: "finished",
                  ending: "deviceChanged",
                });
                expect(harness.plays[playIndex + 1]).toBeUndefined();
                return;
              }
              inARow += 1;
              if (inARow >= refusedPlaysInARowMaxCount) {
                expect(after?.view).toMatchObject({
                  phase: "finished",
                  ending: "soundRefused",
                });
                expect(harness.plays[playIndex + 1]).toBeUndefined();
                return;
              }
              const dueMs = play.atMs + replayGapMs;
              if (
                interruptionsAfter(harness, play.seq).some(
                  (cut) => cut.atMs < dueMs,
                )
              ) {
                return;
              }
              const next = harness.plays[playIndex + 1];
              expect(next?.atMs).toBe(dueMs);
              expect(next?.request).toEqual(play.request);
            });

            // A replay with no ending event and every pause resumed finishes within its bound.
            const endingInScript = script.events.some((event) =>
              ["proceed", "stop", "pageLeft", "deviceChanged"].includes(
                event.action,
              ),
            );
            const firstPlaying = harness.steps.find(
              (step) => step.view?.phase === "playing",
            );
            if (
              !endingInScript &&
              firstPlaying !== undefined &&
              harness.pause() === null
            ) {
              let pausedMs = 0;
              let pauseStartMs: number | null = null;
              for (const step of harness.steps) {
                if (step.pause !== null && pauseStartMs === null) {
                  pauseStartMs = step.atMs;
                } else if (step.pause === null && pauseStartMs !== null) {
                  pausedMs += step.atMs - pauseStartMs;
                  pauseStartMs = null;
                }
              }
              const boundMs =
                firstPlaying.atMs -
                harness.enteredAtMs +
                pausedMs +
                plan.sounds.length *
                  (replayGapMs + scheduleLeadMs + ghostSoundMaxDurationMs) *
                  refusedPlaysInARowMaxCount;
              const finished = harness.steps.find(
                (step) => step.view?.phase === "finished",
              );
              expect(finished).toBeDefined();
              expect(finished!.atMs - harness.enteredAtMs).toBeLessThanOrEqual(
                boundMs,
              );
            }

            // The replay writes nothing to the log, its pauses included (R11.9, D18).
            expect(log).toEqual(logBefore);
            expect(log.pauses).toEqual(drawnLog.pauses);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

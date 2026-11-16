import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { VisitTrial } from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";
import {
  observeVisit,
  sameTrialPlace,
  visitStartMs,
  type PracticePresentedEntry,
  type PresentedEntry,
} from "./visit-flow-timeline";

// CP2. The log holds exactly the played trials, in order (Universal; visit-flow design.md, CP2;
// R10.1, R10.2, R7.11, R12.3, R12.4; brief property 1). The visits render with the worst-case
// renderers (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

/** Whether `samples` holds a sample that is not zero. */
const hasSound = (samples: Float32Array): boolean =>
  samples.some((sample) => sample !== 0);

/** Whether every sample of `samples` is exactly +0. */
const isExactZero = (samples: Float32Array): boolean =>
  samples.every((sample) => Object.is(sample, 0));

describe("visit flow CP2. The log holds exactly the played trials, in order (Universal; R10.1, R10.2)", () => {
  it(
    "logs every presented trial once, in order, as the sounds the backend was given and as scored or discarded",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitRunArbitrary({ withEnding: false }),
          async (visitRun) => {
            const harness = createVisitHarness({
              seed: visitRun.seed,
              performanceOffsetMs: visitRun.performanceOffsetMs,
            });
            const timeline = observeVisit(harness);
            const run = await playVisit(timeline.driver, visitRun.script);
            const snapshot = harness.flow.snapshot();
            expect(run.ending).toBe("done");
            expect(snapshot.stage).toBe("result");
            if (snapshot.stage !== "result") {
              return;
            }
            const { entries } = timeline;
            const startMs = visitStartMs(entries);
            const { trials } = snapshot.visitLog;
            const presented = entries.filter(
              (entry): entry is PresentedEntry => entry.kind === "presented",
            );

            // One for one with the presented trials, with the same fields.
            expect(trials).toHaveLength(presented.length);
            trials.forEach((trial, index) => {
              const shown = presented[index];
              if (shown === undefined) {
                return;
              }
              expect({
                roomIndex: trial.roomIndex,
                attempt: trial.attempt,
                trialNumber: trial.trialNumber,
                kind: trial.kind,
                ear: trial.ear,
                levelDb: trial.requestedLevelDb,
                windowStartMs: trial.windowStartMs,
                presentedAtMs: trial.presentedAtMs,
              }).toEqual({
                roomIndex: shown.trial.roomIndex,
                attempt: shown.trial.attempt,
                trialNumber: shown.trial.trialNumber,
                kind: shown.trial.kind,
                ear: shown.trial.ear,
                levelDb: shown.trial.levelDb,
                windowStartMs: shown.trial.windowStartMs - startMs,
                presentedAtMs: shown.atMs - startMs,
              });
            });

            // `order` from 1 without a gap; presentation times never decrease.
            expect(trials.map((trial) => trial.order)).toEqual(
              trials.map((_, index) => index + 1),
            );
            trials.slice(1).forEach((trial, index) => {
              expect(trial.presentedAtMs).toBeGreaterThanOrEqual(
                trials[index]?.presentedAtMs ?? Number.NEGATIVE_INFINITY,
              );
            });

            // The sound trials are the backend's schedule calls in rooms, one ear each.
            const roomSchedules = harness.schedules.filter(
              (schedule) => schedule.stage === "room" && !schedule.practice,
            );
            const soundTrials = trials.filter(
              (trial) => trial.kind === "sound",
            );
            expect(roomSchedules).toHaveLength(soundTrials.length);
            soundTrials.forEach((trial, index) => {
              const schedule = roomSchedules[index];
              if (schedule === undefined || trial.ear === null) {
                return;
              }
              expect(schedule.atMs - startMs).toBe(trial.presentedAtMs);
              const other = trial.ear === "left" ? "right" : "left";
              expect(hasSound(schedule[trial.ear])).toBe(true);
              expect(isExactZero(schedule[other])).toBe(true);
            });

            // Nothing is scheduled while a no-sound trial waits for its decision.
            const endOf = (trial: VisitTrial): number =>
              trial.status === "scored"
                ? trial.scoredAtMs
                : trial.discardedAtMs;
            for (const trial of trials) {
              if (trial.kind !== "noSound") {
                continue;
              }
              const during = harness.schedules.filter(
                (schedule) =>
                  schedule.atMs - startMs >= trial.presentedAtMs &&
                  schedule.atMs - startMs <= endOf(trial),
              );
              expect(during).toEqual([]);
            }

            // Practice sounds are logged apart, one for one with the practice presented, and each
            // was a practice schedule on one ear (audible-start, light plan).
            const practicePresented = entries.filter(
              (entry): entry is PracticePresentedEntry =>
                entry.kind === "practicePresented",
            );
            const practiceTrials = snapshot.visitLog.practice?.trials ?? [];
            expect(practiceTrials).toHaveLength(practicePresented.length);
            practiceTrials.forEach((trial, index) => {
              const shown = practicePresented[index];
              expect(trial.order).toBe(index + 1);
              expect({
                roomIndex: trial.roomIndex,
                attempt: trial.attempt,
                practiceNumber: trial.practiceNumber,
                ear: trial.ear,
                levelDb: trial.requestedLevelDb,
                windowStartMs: trial.windowStartMs,
              }).toEqual({
                roomIndex: shown?.trial.roomIndex,
                attempt: shown?.trial.attempt,
                practiceNumber: shown?.trial.trialNumber,
                ear: shown?.trial.ear,
                levelDb: shown?.trial.levelDb,
                windowStartMs: (shown?.trial.windowStartMs ?? 0) - startMs,
              });
            });
            const practiceSchedules = harness.schedules.filter(
              (schedule) => schedule.practice,
            );
            expect(practiceSchedules).toHaveLength(practiceTrials.length);
            practiceSchedules.forEach((schedule, index) => {
              const ear = practiceTrials[index]?.ear ?? "left";
              const other = ear === "left" ? "right" : "left";
              expect(hasSound(schedule[ear])).toBe(true);
              expect(isExactZero(schedule[other])).toBe(true);
            });

            // Discarded exactly when a pause (a device change included) came before its decision.
            presented.forEach((shown, index) => {
              const trial = trials[index];
              if (trial === undefined) {
                return;
              }
              const next = entries
                .slice(shown.seq + 1)
                .find(
                  (entry) =>
                    (entry.kind === "event" &&
                      entry.event.kind === "trialScored" &&
                      sameTrialPlace(entry.event.trial, shown.trial)) ||
                    (entry.kind === "snapshot" &&
                      entry.snapshot.pause !== null),
                );
              expect(next).toBeDefined();
              if (next?.kind === "snapshot") {
                expect(trial.status).toBe("discarded");
                if (trial.status === "discarded") {
                  expect(trial.discardedAtMs).toBe(next.atMs - startMs);
                }
              } else {
                expect(trial.status).toBe("scored");
              }
            });
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

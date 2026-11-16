import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import type {
  Ear,
  LoggedIgnoredAnswer,
  ScoredVisitTrial,
} from "../../src/session/visit-flow-types";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";
import {
  observeVisit,
  sameTrialPlace,
  visitStartMs,
  type ActionEntry,
  type PracticePresentedEntry,
  type PresentedEntry,
} from "./visit-flow-timeline";

// CP4. Answers count against their windows (Universal; visit-flow design.md, CP4; R7.6 to R7.8,
// R8.1, R8.2, R10.4). The visits render with the worst-case renderers (D26, audio-output D43).
//
// An answer can only decide a trial while that trial waits for its decision: from its
// presentation until it is decided. An answer given after a window has closed, with a time stamp
// inside the window, comes too late to decide it, and the flow logs it as ignored. So the answers
// that are matched against a trial's window are the ones given while it waited (R7.6, "the trial
// waiting to be Scored").
//
// The practice before a room's counting (audible-start, light plan of 2026-11-16) is held to the
// same windows. Its answers are logged apart, in the practice of the log, so the answers ignored
// while a room practises are checked there and the ones ignored while it counts as before.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 50;
const timeoutMs = 120_000;

const { responseWindowMs } = hearingMethodConfig;

/** The time an answer counts at (R7.8, D33): its time stamp, unless missing, not finite or ahead. */
function answerTimeOf(entry: ActionEntry): number {
  const pressedAtMs = entry.args[1];
  return typeof pressedAtMs === "number" &&
    Number.isFinite(pressedAtMs) &&
    pressedAtMs <= entry.atMs
    ? pressedAtMs
    : entry.atMs;
}

const sideOf = (entry: ActionEntry): Ear => entry.args[0] as Ear;

describe("visit flow CP4. Answers count against their windows (Universal; R7.6 to R7.8, R8)", () => {
  it(
    "decides each trial by the first answer in its window, at the window's end without one, and logs every other answer in a room as ignored",
    async () => {
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          expect(run.ending).toBe("done");
          const { entries } = timeline;
          const startMs = visitStartMs(entries);

          const decidingAnswers = new Set<number>();
          const lastPresented: PresentedEntry[] = [];
          const lastPractice: PracticePresentedEntry[] = [];
          for (const entry of entries) {
            if (entry.kind === "presented") {
              lastPresented.push(entry);
            }
            if (entry.kind === "practicePresented") {
              lastPractice.push(entry);
            }
            if (
              entry.kind === "event" &&
              entry.event.kind === "practiceSoundScored"
            ) {
              const practice = entry.event.trial;
              const place = {
                roomIndex: practice.roomIndex,
                attempt: practice.attempt,
                trialNumber: practice.practiceNumber,
              };
              const shown = [...lastPractice]
                .reverse()
                .find((presented) => sameTrialPlace(presented.trial, place));
              expect(shown).toBeDefined();
              if (shown === undefined) {
                continue;
              }
              const windowStartMs = shown.trial.windowStartMs;
              expect(practice.windowStartMs).toBe(windowStartMs - startMs);
              const windowEndMs = windowStartMs + responseWindowMs;
              const first = entries.find(
                (candidate): candidate is ActionEntry =>
                  candidate.kind === "action" &&
                  candidate.name === "answer" &&
                  candidate.seq > shown.seq &&
                  candidate.seq < entry.seq &&
                  candidate.snapshotBefore.stage === "room" &&
                  candidate.snapshotBefore.pause === null &&
                  windowStartMs <= answerTimeOf(candidate) &&
                  answerTimeOf(candidate) < windowEndMs,
              );
              if (first !== undefined) {
                decidingAnswers.add(first.seq);
                const side = sideOf(first);
                expect(practice.response).toBe(side);
                expect(practice.answeredAtMs).toBe(
                  answerTimeOf(first) - startMs,
                );
                expect(practice.scoredAtMs).toBe(first.atMs - startMs);
                expect(practice.outcome).toBe(
                  side === practice.ear ? "caught" : "wrongSide",
                );
              } else {
                expect(practice.response).toBe("none");
                expect(practice.answeredAtMs).toBeNull();
                expect(practice.scoredAtMs).toBe(windowEndMs - startMs);
                expect(entry.cause).toBe("timer");
                expect(practice.outcome).toBe("missed");
              }
              continue;
            }
            if (entry.kind !== "event" || entry.event.kind !== "trialScored") {
              continue;
            }
            const trial: ScoredVisitTrial = entry.event.trial;
            const shown = [...lastPresented]
              .reverse()
              .find((presented) => sameTrialPlace(presented.trial, trial));
            expect(shown).toBeDefined();
            if (shown === undefined) {
              continue;
            }
            const windowStartMs = shown.trial.windowStartMs;
            const windowEndMs = windowStartMs + responseWindowMs;
            const given = entries.filter(
              (candidate): candidate is ActionEntry =>
                candidate.kind === "action" &&
                candidate.name === "answer" &&
                candidate.seq > shown.seq &&
                candidate.seq < entry.seq &&
                candidate.snapshotBefore.stage === "room" &&
                candidate.snapshotBefore.pause === null,
            );
            const first = given.find((answer) => {
              const atMs = answerTimeOf(answer);
              return windowStartMs <= atMs && atMs < windowEndMs;
            });
            if (first !== undefined) {
              decidingAnswers.add(first.seq);
              const answeredAtMs = answerTimeOf(first) - startMs;
              const side = sideOf(first);
              expect(trial.response).toBe(side);
              expect(trial.answeredAtMs).toBe(answeredAtMs);
              expect(trial.responseTimeMs).toBe(
                answeredAtMs - (windowStartMs - startMs),
              );
              expect(trial.scoredAtMs).toBe(first.atMs - startMs);
              expect(entry.seq).toBeLessThanOrEqual(first.endSeq);
              expect(trial.outcome).toBe(
                trial.kind === "noSound"
                  ? "falseAlarm"
                  : side === trial.ear
                    ? "caught"
                    : "wrongSide",
              );
            } else {
              expect(trial.response).toBe("none");
              expect(trial.answeredAtMs).toBeNull();
              expect(trial.responseTimeMs).toBeNull();
              expect(trial.scoredAtMs).toBe(windowEndMs - startMs);
              expect(entry.cause).toBe("timer");
              expect(trial.outcome).toBe(
                trial.kind === "noSound" ? "noResponse" : "missed",
              );
            }
          }

          // Every other answer in a room while no pause held is ignored, and nothing else is.
          const expectedIgnored: LoggedIgnoredAnswer[] = [];
          const expectedPracticeIgnored: LoggedIgnoredAnswer[] = [];
          let attempt = 0;
          for (const entry of entries) {
            if (entry.kind === "event" && entry.event.kind === "roomStarted") {
              attempt = entry.event.attempt;
            }
            if (
              entry.kind !== "action" ||
              entry.name !== "answer" ||
              entry.snapshotBefore.stage !== "room" ||
              entry.snapshotBefore.pause !== null ||
              decidingAnswers.has(entry.seq)
            ) {
              continue;
            }
            const ignored = {
              atMs: answerTimeOf(entry) - startMs,
              side: sideOf(entry),
              roomIndex: entry.snapshotBefore.room.roomIndex,
              attempt,
            };
            if (entry.snapshotBefore.practice?.phase === "practice") {
              expectedPracticeIgnored.push(ignored);
            } else {
              expectedIgnored.push(ignored);
            }
          }
          const final = harness.flow.snapshot();
          if (final.stage === "result") {
            expect(final.visitLog.ignoredAnswers).toEqual(expectedIgnored);
            expect(final.visitLog.practice?.ignoredAnswers ?? []).toEqual(
              expectedPracticeIgnored,
            );
          }
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

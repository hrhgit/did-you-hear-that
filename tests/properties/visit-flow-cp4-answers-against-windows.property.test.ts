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
import { createVisitHarness, roomRuns } from "./visit-flow-harness";
import {
  observeVisit,
  sameTrialPlace,
  visitStartMs,
  type ActionEntry,
  type PracticePresentedEntry,
  type PresentedEntry,
  type ReminderPresentedEntry,
  type TimelineEntry,
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
//
// The property holds however the rooms run (one-room design.md, D1). One room at a time, an
// ignored answer is logged against the room. In the one room it is logged against the creature it
// could have been for: the one being introduced, in the roll call, and the one whose turn waits,
// in the counting (one-room design.md, "The flow").
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

/** An ignored answer the log must hold. */
interface ExpectedIgnoredAnswer {
  readonly atMs: number;
  readonly side: Ear;
  /** The room it is logged against, or null for any room whose creature was still about. */
  readonly roomIndex: number | null;
  readonly attempt: number;
  /** The rooms whose creatures were still about when it was pressed. */
  readonly about: readonly number[];
}

/**
 * The room of the creature whose turn waited when an answer was ignored in the counting of the one
 * room. The page is never told whose turn it is, so it is read from what came next: the room of
 * the next trial presented or decided in the same room run. A trial that a pause discards is
 * presented again, and the turn stays with its creature through the pause. Null when the run was
 * cut short before that, by a change of device or by the visit's end.
 */
function waitingRoomAfter(
  entries: readonly TimelineEntry[],
  seq: number,
): number | null {
  for (const entry of entries.slice(seq + 1)) {
    if (entry.kind === "presented") {
      return entry.trial.roomIndex;
    }
    if (entry.kind === "event" && entry.event.kind === "trialScored") {
      return entry.event.trial.roomIndex;
    }
    if (entry.kind === "event" && entry.event.kind === "roomStarted") {
      return null;
    }
  }
  return null;
}

/** Checks that the log's ignored answers are the expected ones, in order, and nothing else. */
function expectIgnoredAnswers(
  logged: readonly LoggedIgnoredAnswer[],
  expected: readonly ExpectedIgnoredAnswer[],
): void {
  expect(logged).toEqual(
    expected.map((wanted, index) => ({
      atMs: wanted.atMs,
      side: wanted.side,
      roomIndex: wanted.roomIndex ?? logged[index]?.roomIndex,
      attempt: wanted.attempt,
    })),
  );
  expected.forEach((wanted, index) => {
    if (wanted.roomIndex === null) {
      expect(wanted.about).toContain(logged[index]?.roomIndex);
    }
  });
}

describe("visit flow CP4. Answers count against their windows (Universal; R7.6 to R7.8, R8)", () => {
  it.each(roomRuns)(
    "decides each trial by the first answer in its window, at the window's end without one, and logs every other answer in a room as ignored ($name)",
    async ({ roomsTogetherMaxCount, together }) => {
      // The ignored answers that were held to the room of one creature in the counting, and those
      // of them whose creature was not the first one still about, over all the visits.
      let heldToACreatureCount = 0;
      let heldToALaterCreatureCount = 0;
      await fc.assert(
        fc.asyncProperty(visitRunArbitrary(), async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
            roomsTogetherMaxCount,
          });
          const timeline = observeVisit(harness);
          const run = await playVisit(timeline.driver, visitRun.script);
          expect(run.ending).toBe("done");
          const { entries } = timeline;
          const startMs = visitStartMs(entries);

          const decidingAnswers = new Set<number>();
          const lastPresented: PresentedEntry[] = [];
          const lastPractice: PracticePresentedEntry[] = [];
          const lastReminder: ReminderPresentedEntry[] = [];
          for (const entry of entries) {
            if (entry.kind === "reminderPresented") {
              lastReminder.push(entry);
            }
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
            if (
              entry.kind === "event" &&
              entry.event.kind === "reminderSoundScored"
            ) {
              // A reminder sound after a long quiet (the game layer) is held to its window too.
              // Only one sound waits at a time, so it is the last reminder presented.
              const reminder = entry.event.trial;
              const shown = [...lastReminder].pop();
              expect(shown).toBeDefined();
              if (shown === undefined) {
                continue;
              }
              const windowStartMs = shown.trial.windowStartMs;
              expect(reminder.windowStartMs).toBe(windowStartMs - startMs);
              // A late sound keeps its whole window (headphone-traits R1.5).
              const windowEndMs =
                windowStartMs +
                responseWindowMs +
                (reminder.timingOffsetMs ?? 0);
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
                expect(reminder.response).toBe(side);
                expect(reminder.scoredAtMs).toBe(first.atMs - startMs);
                expect(reminder.outcome).toBe(
                  side === reminder.ear ? "caught" : "wrongSide",
                );
              } else {
                expect(reminder.response).toBe("none");
                expect(reminder.scoredAtMs).toBe(windowEndMs - startMs);
                expect(reminder.outcome).toBe("missed");
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
            const windowEndMs =
              windowStartMs + responseWindowMs + (trial.timingOffsetMs ?? 0);
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
          const expectedIgnored: ExpectedIgnoredAnswer[] = [];
          const expectedPracticeIgnored: ExpectedIgnoredAnswer[] = [];
          let attempt = 0;
          // The rooms whose creatures are about: started, and not yet finished. The searches that
          // take turns in one run share its number.
          const about = new Set<number>();
          for (const entry of entries) {
            if (entry.kind === "event" && entry.event.kind === "roomStarted") {
              attempt = entry.event.attempt;
              about.add(entry.event.room.roomIndex);
            }
            if (entry.kind === "event" && entry.event.kind === "roomFinished") {
              about.delete(entry.event.room.roomIndex);
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
            const inPractice =
              entry.snapshotBefore.practice?.phase === "practice";
            let roomIndex: number | null = entry.snapshotBefore.room.roomIndex;
            if (together && inPractice) {
              // The roll call says who is being introduced, and the answer is theirs.
              const practising = entry.snapshotBefore.practice?.practising;
              expect(practising).toBeDefined();
              expect(practising).not.toBeNull();
              roomIndex = practising?.roomIndex ?? null;
            } else if (together) {
              const firstAbout = roomIndex;
              roomIndex = waitingRoomAfter(entries, entry.seq);
              if (roomIndex !== null) {
                expect(about).toContain(roomIndex);
                heldToACreatureCount += 1;
                if (roomIndex !== firstAbout) {
                  heldToALaterCreatureCount += 1;
                }
              }
            }
            const ignored = {
              atMs: answerTimeOf(entry) - startMs,
              side: sideOf(entry),
              roomIndex,
              attempt,
              about: [...about],
            };
            if (inPractice) {
              expectedPracticeIgnored.push(ignored);
            } else {
              expectedIgnored.push(ignored);
            }
          }
          const final = harness.flow.snapshot();
          if (final.stage === "result") {
            expectIgnoredAnswers(
              final.visitLog.ignoredAnswers,
              expectedIgnored,
            );
            expectIgnoredAnswers(
              final.visitLog.practice?.ignoredAnswers ?? [],
              expectedPracticeIgnored,
            );
          }
        }),
        { numRuns: runs },
      );
      // In the one room the answers were held to the creature whose turn waited, and that was
      // often not the first creature still about, or the check above would be the old one.
      if (together) {
        expect(heldToACreatureCount).toBeGreaterThan(0);
        expect(heldToALaterCreatureCount).toBeGreaterThan(0);
      } else {
        expect(heldToACreatureCount).toBe(0);
      }
    },
    timeoutMs,
  );
});

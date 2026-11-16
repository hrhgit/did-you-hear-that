import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import type { StopReason } from "../../src/audio/output/output-types";
import type { SwappedRepeatRun } from "../../src/session/visit-flow-types";
import type { RepeatRefusalScript } from "./swapped-repeat-arbitraries";
import {
  repeatLogCaseArbitrary,
  repeatRefusalScriptArbitrary,
  repeatScriptArbitrary,
} from "./swapped-repeat-arbitraries";
import type {
  RecordedRepeatStep,
  RepeatHarness,
} from "./swapped-repeat-harness";
import { createRepeatHarness } from "./swapped-repeat-harness";

// CP6. Pauses, device changes and refusals (Universal; swapped-repeat design.md, CP6; R5.2, R5.6,
// R14.3 to R14.6, R14.8 to R14.10, R15). For a drawn visit log at the result and a repeat script,
// and for one run in three a refusal script on the scripted output, played on the repeat harness:
// - while a pause holds, no sound is asked for, `canProceed` is false and the view's `pauseLine`
//   is the line of its reason; a pause of the room that ends with the room going on presents the
//   trial that was waiting, after its own gap;
// - every pause is written to the record's `pauses` with the stage `swappedRepeat`, and none to
//   the visit log;
// - a `deviceChanged` report in the room gives `finished` with `deviceChanged`, no record and no
//   sound after it; before the room it gives `unavailable` with `calibrationGone`; a hidden page or
//   an interruption begins no pause outside the room;
// - a hidden page or an interruption in `check` while a check waits sets `awaitingAnswer` to false
//   and gives `cutLine`, and an answer then is ignored;
// - a refused check gives its line and counts nothing, `notRunning` acts as a stop report and
//   `notCalibrated` gives `unavailable` with `calibrationGone`;
// - trial refusals follow the room runner's rule: `notRunning` as a stop report, `notCalibrated`
//   as a device change, any other the same trial again after its own gap, recorded in
//   `refusedPlays`; `refusedPlaysInARowMaxCount` in a row give `finished` with `soundRefused` after
//   `stopAll`, and then the result with the same log;
// - with the shell's own refusals only, no run ends `soundRefused`.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/**
 * Runs (design.md, "Run counts and time"; Q9, decided by the owner's coordinator on 2026-11-16,
 * at the owner's request).
 */
const runs = 300;
const timeoutMs = 120_000;
const { refusedPlaysInARowMaxCount } = visitFlowConfig;
/** Times on the log's clock and on the timer's differ by the visit's start, up to rounding. */
const sameTimeMs = 1e-6;

/** No refusal script in two runs of three, one in the third (CP6). */
const refusalsArbitrary: fc.Arbitrary<RepeatRefusalScript | null> = fc.oneof(
  { arbitrary: fc.constant(null), weight: 2 },
  { arbitrary: repeatRefusalScriptArbitrary, weight: 1 },
);

function stepAfter(
  harness: RepeatHarness,
  seq: number,
): RecordedRepeatStep | undefined {
  return harness.steps.find((step) => step.seq > seq);
}

function stepBefore(
  harness: RepeatHarness,
  seq: number,
): RecordedRepeatStep | undefined {
  return harness.steps.filter((step) => step.seq < seq).at(-1);
}

function checkPauses(harness: RepeatHarness): void {
  for (const sound of harness.sounds) {
    expect(sound.pauseBefore).toBeNull();
  }
  for (const step of harness.steps) {
    if (step.pause !== null) {
      expect(step.canProceed).toBe(false);
      expect(step.view?.phase).toBe("room");
      if (step.view?.phase === "room") {
        expect(step.view.pauseLine).toBe(
          swappedRepeatCopy.pauseLines[step.pause],
        );
      }
    }
  }
  for (const visit of harness.visits) {
    const steps = harness.steps.filter(
      (step) => step.visitIndex === visit.index,
    );
    const begun = steps.filter(
      (step, index) =>
        step.pause !== null &&
        (index === 0 || steps[index - 1]!.pause === null),
    ).length;
    if (visit.record !== null) {
      expect(visit.record.pauses).toHaveLength(begun);
      for (const pause of visit.record.pauses) {
        expect(pause.stage).toBe("swappedRepeat");
        expect(pause.roomIndex).toBe(visit.floorIndex);
      }
      checkResumes(visit.record);
    }
  }
  expect(harness.log).toEqual(harness.logBefore);
}

/** After each pause of a run that went on, the trial that was waiting comes next, after its own gap. */
function checkResumes(record: SwappedRepeatRun): void {
  const gapOf = new Map(
    record.trials.map((trial) => [trial.trialNumber, trial.gapBeforeMs]),
  );
  const presentations = [
    ...record.trials.map((trial) => ({
      atMs: trial.presentedAtMs,
      trialNumber: trial.trialNumber,
    })),
    ...record.refusedPlays.map((refusal) => ({
      atMs: refusal.atMs,
      trialNumber: refusal.trialNumber,
    })),
  ].sort((a, b) => a.atMs - b.atMs);
  for (const pause of record.pauses) {
    const scoredBefore = record.trials.filter(
      (trial) =>
        trial.status === "scored" &&
        trial.scoredAtMs <= pause.startedAtMs + sameTimeMs,
    ).length;
    const next = presentations.find(
      (presentation) => presentation.atMs >= pause.endedAtMs - sameTimeMs,
    );
    expect(next).toBeDefined();
    if (next === undefined) {
      return;
    }
    expect(next.trialNumber).toBe(scoredBefore + 1);
    // Its own gap, from the last resume before it: a pause may follow this one before the trial.
    const resumedAtMs = Math.max(
      ...record.pauses
        .map((each) => each.endedAtMs)
        .filter((endedAtMs) => endedAtMs <= next.atMs + sameTimeMs),
    );
    expect(
      Math.abs(
        next.atMs - resumedAtMs - (gapOf.get(next.trialNumber) ?? Number.NaN),
      ),
    ).toBeLessThan(sameTimeMs);
  }
}

function checkReports(harness: RepeatHarness): void {
  for (const report of harness.reports) {
    if (report.stageBefore !== "swappedRepeat") {
      continue;
    }
    const after = stepAfter(harness, report.seq);
    expect(after).toBeDefined();
    if (after === undefined) {
      return;
    }
    const phase = report.phaseBefore;
    const visit = harness.visits[report.visitIndex ?? -1]!;
    switch (report.reason) {
      case "deviceChanged":
        if (phase === "room") {
          expect(after.view).toMatchObject({
            phase: "finished",
            ending: "deviceChanged",
            comparison: null,
          });
          expect(after.pause).toBeNull();
          expect(visit.record).toBeNull();
          expect(
            harness.sounds.filter(
              (sound) =>
                sound.visitIndex === visit.index && sound.seq > report.seq,
            ),
          ).toEqual([]);
        } else if (
          phase === "instruction" ||
          phase === "check" ||
          phase === "ready"
        ) {
          expect(after.view).toMatchObject({
            phase: "unavailable",
            reason: "calibrationGone",
          });
        } else {
          expect(after.view?.phase).toBe(phase);
        }
        break;
      case "hidden":
      case "interrupted": {
        const before = stepBefore(harness, report.seq);
        if (phase !== "room") {
          expect(after.pause).toBeNull();
          expect(after.view?.phase).toBe(phase);
        } else if (report.pauseBefore === null) {
          expect(after.pause).toBe(report.reason);
        } else {
          expect(after.pause).toBe(report.pauseBefore);
        }
        if (
          phase === "check" &&
          before?.view?.phase === "check" &&
          before.view.awaitingAnswer
        ) {
          expect(after.view).toMatchObject({
            phase: "check",
            awaitingAnswer: false,
            cutLine: swappedRepeatCopy.cutLine,
          });
          // An answer before the check is played again is ignored.
          const nextCheck =
            harness.sounds.find(
              (sound) => sound.kind === "check" && sound.seq > report.seq,
            )?.seq ?? Number.POSITIVE_INFINITY;
          for (const action of harness.actions) {
            if (
              action.name === "answerSwapCheck" &&
              action.visitIndex === visit.index &&
              action.seq > report.seq &&
              action.seq < nextCheck
            ) {
              const following = stepAfter(harness, action.seq);
              if (following?.view?.phase === "check") {
                expect(following.view.awaitingAnswer).toBe(false);
                expect(following.view.judgement).toBe(
                  after.view?.phase === "check" ? after.view.judgement : null,
                );
              } else {
                expect(following?.view?.phase).not.toBe("ready");
              }
            }
          }
        }
        break;
      }
      case "pageLeft":
        expect(after.stage).toBe("result");
        break;
    }
  }
}

/** The reason a refusal `notRunning` passes on: the shell's stop reason, or `interrupted`. */
function notRunningReason(
  state: RepeatHarness["sounds"][number]["shellStateBefore"],
): StopReason {
  return state.kind === "stopped" && state.reason !== "control"
    ? state.reason
    : "interrupted";
}

function checkCheckRefusals(harness: RepeatHarness): void {
  for (const visit of harness.visits) {
    const accepted = harness.actions.filter(
      (action) =>
        action.name === "answerSwapCheck" &&
        action.visitIndex === visit.index &&
        action.phaseBefore === "check" &&
        action.pauseBefore === null &&
        stepBefore(harness, action.seq)?.view?.phase === "check" &&
        (stepBefore(harness, action.seq)?.view as { awaitingAnswer?: boolean })
          .awaitingAnswer === true,
    );
    if (visit.record !== null) {
      // Only answered checks count: a refused or cut check counts nothing.
      expect(visit.record.swapChecks).toHaveLength(accepted.length);
      const confirmedAt = accepted.findIndex((action) => {
        const following = stepAfter(harness, action.seq);
        return following?.view?.phase === "ready";
      });
      expect(confirmedAt).toBeGreaterThanOrEqual(0);
    }
  }
  for (const sound of harness.sounds) {
    if (sound.kind !== "check" || sound.outcome.kind !== "refused") {
      continue;
    }
    const after = stepAfter(harness, sound.seq);
    const reason = sound.outcome.reason;
    if (reason === "notRunning") {
      const call = harness.notRunningCalls.find(
        (entry) => entry.seq > sound.seq,
      );
      expect(call?.reason).toBe(notRunningReason(sound.shellStateBefore));
      continue;
    }
    if (reason === "notCalibrated") {
      expect(after?.view).toMatchObject({
        phase: "unavailable",
        reason: "calibrationGone",
      });
      continue;
    }
    expect(after?.view).toMatchObject({
      phase: "check",
      playRefusal: reason,
      playRefusalLine: swappedRepeatCopy.playRefusedLine,
    });
  }
}

function checkTrialRefusals(
  harness: RepeatHarness,
  refusals: RepeatRefusalScript | null,
): void {
  for (const visit of harness.visits) {
    let inARow = 0;
    const trials = harness.sounds.filter(
      (sound) => sound.kind === "trial" && sound.visitIndex === visit.index,
    );
    for (const sound of trials) {
      const after = stepAfter(harness, sound.seq);
      if (sound.outcome.kind === "scheduled") {
        inARow = 0;
        continue;
      }
      const reason = sound.outcome.reason;
      if (reason === "notRunning") {
        const call = harness.notRunningCalls.find(
          (entry) => entry.seq > sound.seq,
        );
        const expected = notRunningReason(sound.shellStateBefore);
        expect(call?.reason).toBe(expected);
        if (expected === "hidden" || expected === "interrupted") {
          expect(after?.pause).toBe(expected);
        }
        continue;
      }
      if (reason === "notCalibrated") {
        expect(after?.view).toMatchObject({
          phase: "finished",
          ending: "deviceChanged",
        });
        expect(visit.record).toBeNull();
        continue;
      }
      inARow += 1;
      if (visit.record !== null) {
        const logged = visit.record.refusedPlays.find(
          (entry) =>
            Math.abs(entry.atMs + harness.visitStartedAtMs - sound.atMs) <
            sameTimeMs,
        );
        expect(logged?.reason).toBe(reason);
      }
      if (inARow >= refusedPlaysInARowMaxCount) {
        expect(after?.view).toMatchObject({
          phase: "finished",
          ending: "soundRefused",
          comparison: null,
        });
        expect(
          harness.stopAlls.some(
            (stopAll) =>
              stopAll.seq > sound.seq &&
              after !== undefined &&
              stopAll.seq < after.seq,
          ),
        ).toBe(true);
        expect(visit.record).toBeNull();
      } else {
        expect(after?.view?.phase).toBe("room");
      }
    }
    const ended = harness.steps.some(
      (step) =>
        step.visitIndex === visit.index &&
        step.view?.phase === "finished" &&
        step.view.ending === "soundRefused",
    );
    if (refusals === null) {
      expect(ended).toBe(false);
    }
    if (ended) {
      // The visit and its result are kept: the stage goes back to the result with the same log.
      expect(visit.left).not.toBeNull();
    }
  }
  expect(harness.stage()).not.toBe("swappedRepeat");
  expect(harness.log).toEqual(harness.logBefore);
}

describe("swapped repeat CP6: pauses, device changes and refusals", () => {
  it(
    "pauses only the room, writes its pauses to the record, ends on a device change, sets a cut check back and follows the room runner's rule for refusals",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          repeatLogCaseArbitrary,
          repeatScriptArbitrary,
          refusalsArbitrary,
          async (logCase, script, refusals) => {
            const harness = await createRepeatHarness({
              logCase,
              outputDelayMs: script.outputDelayMs,
              refusals,
            });
            await harness.run(script);
            checkPauses(harness);
            checkReports(harness);
            checkCheckRefusals(harness);
            checkTrialRefusals(harness, refusals);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

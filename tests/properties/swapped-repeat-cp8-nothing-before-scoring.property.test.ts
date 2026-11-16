import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { roomCopy } from "../../src/copy/room-copy";
import { swappedCaughtLine } from "../../src/copy/swapped-repeat-lines";
import { earpieceOnEar } from "../../src/session/earpiece-on-ear";
import {
  repeatLogCaseArbitrary,
  roomRepeatScriptArbitrary,
} from "./swapped-repeat-arbitraries";
import type { RepeatHarness } from "./swapped-repeat-harness";
import { createRepeatHarness } from "./swapped-repeat-harness";

// CP8. Nothing gives a sound away before the answer (Universal; swapped-repeat design.md, CP8;
// R16; visit-flow R11.2, R11.3; product.md). For a drawn visit log at the result and a repeat
// script whose first visit to the stage reaches the room unless an event ends it, played on the
// repeat harness:
// - between the presentation of each trial and its scoring no snapshot is published and no event
//   is handed out;
// - each `swappedTrialScored` event comes in the step that scores its trial, for the trial that
//   was presented, never for a discarded one, with the reaction `ripple` exactly for a caught
//   sound, `noSoundLine` exactly for an answer on a no-sound trial and `none` otherwise, and its
//   line is `swappedCaughtLine` of its ear, earpiece, pitch and played level, or
//   `roomCopy.noSoundLine`, or null;
// - every view of the phase `room` without a pause is equal to the first of its visit.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 200;
const timeoutMs = 120_000;

const swapped = earpieceOnEar("swapped");

function checkPresentations(harness: RepeatHarness): void {
  for (const presented of harness.presented) {
    const visitIndex = presented.visitIndex;
    // What ended the trial's wait for an answer: its event, or a step that left the room unpaused.
    const event = harness.events.find(
      (entry) => entry.visitIndex === visitIndex && entry.seq > presented.seq,
    );
    const interrupted = harness.steps.find(
      (step) =>
        step.seq > presented.seq &&
        (step.stage !== "swappedRepeat" ||
          step.visitIndex !== visitIndex ||
          step.pause !== null ||
          step.view?.phase !== "room"),
    );
    const scoredFirst =
      event !== undefined &&
      (interrupted === undefined || event.seq < interrupted.seq);
    const endSeq = scoredFirst
      ? event.seq
      : (interrupted?.seq ?? Number.POSITIVE_INFINITY);
    expect(
      harness.steps.filter(
        (step) =>
          step.seq > presented.seq && step.seq < endSeq && step.published,
      ),
    ).toEqual([]);
    if (!scoredFirst) {
      // A trial cut off by a pause or an ending is never scored: no event names it before it is
      // presented again.
      expect(
        harness.events.filter(
          (entry) => entry.seq > presented.seq && entry.seq < endSeq,
        ),
      ).toEqual([]);
      continue;
    }
    const { trial } = event.event;
    expect(trial.trialNumber).toBe(presented.trial.trialNumber);
    expect(trial.kind).toBe(presented.trial.kind);
    expect(trial.status).toBe("scored");
    // In the step that scores it: the scoring time is the event's time on the log's clock.
    expect(
      Math.abs(trial.scoredAtMs + harness.visitStartedAtMs - event.atMs),
    ).toBeLessThan(1e-6);
  }
}

function checkEvents(harness: RepeatHarness): void {
  for (const { event, visitIndex } of harness.events) {
    const { trial } = event;
    const visit = harness.visits[visitIndex ?? -1]!;
    expect(event.runNumber).toBe(visit.runNumber);
    expect(event.room).toEqual(harness.log.rooms[visit.floorIndex]);
    expect(trial.status).toBe("scored");
    const caught = trial.kind === "sound" && trial.outcome === "caught";
    const falseAlarm =
      trial.kind === "noSound" && trial.outcome === "falseAlarm";
    expect(event.reaction).toBe(
      caught ? "ripple" : falseAlarm ? "noSoundLine" : "none",
    );
    if (caught && trial.kind === "sound") {
      expect(event.line).toBe(
        swappedCaughtLine(
          trial.ear,
          swapped[trial.ear],
          event.room.frequencyHz,
          trial.playedLevelDb,
        ),
      );
    } else if (falseAlarm) {
      expect(event.line).toBe(roomCopy.noSoundLine);
    } else {
      expect(event.line).toBeNull();
    }
    if (visit.record !== null) {
      expect(
        visit.record.trials.some(
          (logged) =>
            logged.status === "scored" &&
            logged.order === trial.order &&
            logged.trialNumber === trial.trialNumber,
        ),
      ).toBe(true);
    }
  }
  for (const visit of harness.visits) {
    if (visit.record !== null) {
      expect(
        harness.events.filter((entry) => entry.visitIndex === visit.index),
      ).toHaveLength(
        visit.record.trials.filter((logged) => logged.status === "scored")
          .length,
      );
    }
  }
}

function checkRoomViews(harness: RepeatHarness): void {
  for (const visit of harness.visits) {
    const views = harness.steps
      .filter(
        (step) =>
          step.visitIndex === visit.index &&
          step.pause === null &&
          step.view?.phase === "room",
      )
      .map((step) => step.view);
    for (const view of views) {
      expect(view).toEqual(views[0]);
    }
  }
}

describe("swapped repeat CP8: nothing gives a sound away before the answer", () => {
  it(
    "publishes nothing between a trial's presentation and its scoring, hands out its event as it is scored, and keeps the room's view the same",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          repeatLogCaseArbitrary,
          roomRepeatScriptArbitrary,
          async (logCase, script) => {
            const harness = await createRepeatHarness({
              logCase,
              outputDelayMs: script.outputDelayMs,
            });
            await harness.run(script);
            checkPresentations(harness);
            checkEvents(harness);
            checkRoomViews(harness);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

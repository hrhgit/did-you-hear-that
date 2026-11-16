import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  endingRepeatScriptArbitrary,
  repeatLogCaseArbitrary,
} from "./swapped-repeat-arbitraries";
import type {
  RecordedRepeatStep,
  RepeatHarness,
  RepeatStageVisit,
} from "./swapped-repeat-harness";
import { createRepeatHarness, soundPageTimes } from "./swapped-repeat-harness";

// CP5. Nothing sounds before a press; every ending plays nothing more (Universal; swapped-repeat
// design.md, CP5; R3.6, R3.7, R4.2, R6, R11.3, R14.2, R14.7). For a drawn visit log at the result
// and a repeat script whose visit to the stage ends with `proceed`, `stop` or a left page at a
// drawn time, possibly during the hiss, in the room, in a gap or during a pause:
// - every hiss is played in the step of a press of `playSwapCheck`; every trial sound in the phase
//   `room` with no pause, after the press of `startSwappedRoom` that began the room; every pause of
//   the room that ends with the room going on ends on a press of `resume`; no sound is asked for in
//   `unavailable`, `instruction`, `ready` or `finished`;
// - when the stage is left, `stopAll` was called in that step when a sound of the stage was under
//   way (for `proceed` and `stop`; a left page has stopped the shell already), and `stop` always
//   calls it; the stage is `result`, and ten more minutes of clock make no request, no backend
//   `schedule` and no event, and leave no pending timer of the controller;
// - a run ended this way gives no record, the result's `swappedRepeats` is as before, and the
//   floor still offers the repeat: choosing it again enters the stage;
// - every view has a non-empty `stopLabel`.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 300;
const timeoutMs = 120_000;
/** How long the clocks move on after the stage is left (CP5: ten minutes). */
const afterMs = 10 * 60_000;

/** The step in which a record with this `seq` was made: the first step recorded after it. */
function stepOf(
  harness: RepeatHarness,
  seq: number,
): RecordedRepeatStep | undefined {
  return harness.steps.find((step) => step.seq > seq);
}

function checkPresses(harness: RepeatHarness): void {
  for (const sound of harness.sounds) {
    expect(["check", "room"]).toContain(sound.phaseBefore);
    const cause = stepOf(harness, sound.seq)?.cause;
    if (sound.kind === "check") {
      expect(sound.phaseBefore).toBe("check");
      expect(cause).toMatchObject({ kind: "action", name: "playSwapCheck" });
      continue;
    }
    expect(sound.phaseBefore).toBe("room");
    expect(sound.pauseBefore).toBeNull();
    // The room began in this visit to the stage, on a press of startSwappedRoom.
    const begin = harness.beginRooms
      .filter(
        (mark) => mark.visitIndex === sound.visitIndex && mark.seq < sound.seq,
      )
      .at(-1);
    expect(begin).toBeDefined();
    const beginCause =
      begin === undefined ? undefined : stepOf(harness, begin.seq)?.cause;
    expect(beginCause).toMatchObject({
      kind: "action",
      name: "startSwappedRoom",
    });
  }
  // Every pause of the room that ends with the room going on ends on a press of resume.
  harness.steps.forEach((step, index) => {
    const before = harness.steps[index - 1];
    if (
      before !== undefined &&
      before.pause !== null &&
      step.pause === null &&
      step.stage === "swappedRepeat" &&
      step.view?.phase === "room"
    ) {
      expect(step.cause).toMatchObject({ kind: "action", name: "resume" });
    }
  });
}

/** Whether a sound of the stage was under way when the record with `seq` came, at `atMs`. */
function soundUnderWay(
  harness: RepeatHarness,
  seq: number,
  atMs: number,
): boolean {
  const last = harness.sounds
    .filter((sound) => sound.seq < seq && sound.outcome.kind === "scheduled")
    .at(-1);
  if (last === undefined) {
    return false;
  }
  const cut =
    harness.reports.some(
      (report) => report.seq > last.seq && report.seq < seq,
    ) ||
    harness.stopAlls.some(
      (stopAll) => stopAll.seq > last.seq && stopAll.seq < seq,
    );
  const times = soundPageTimes(last, harness.outputDelayMs);
  return !cut && times !== null && atMs < times.endPageMs;
}

async function checkEnding(
  harness: RepeatHarness,
  visit: RepeatStageVisit,
): Promise<void> {
  const left = visit.left;
  expect(left).not.toBeNull();
  if (left === null) {
    return;
  }
  expect(harness.stage()).toBe("result");
  const leavingAction = harness.actions
    .filter((action) => action.seq < left.seq)
    .at(-1);
  const leavingReport = harness.reports
    .filter((report) => report.seq < left.seq)
    .at(-1);
  const by = left.by === "pageLeft" ? leavingReport : leavingAction;
  expect(by).toBeDefined();
  if (by === undefined) {
    return;
  }
  const stopAllsInStep = harness.stopAlls.filter(
    (stopAll) => stopAll.seq > by.seq && stopAll.seq < left.seq,
  );
  const underWay = soundUnderWay(harness, by.seq, by.atMs);
  if (left.by === "stop") {
    expect(stopAllsInStep).toHaveLength(1);
  } else if (left.by === "proceed") {
    if (underWay) {
      expect(stopAllsInStep).toHaveLength(1);
    }
  } else {
    expect(left.by).toBe("pageLeft");
  }
  expect(harness.pendingControllerTimerCount()).toBe(0);

  const leftInRoom = by.phaseBefore === "room";
  if (leftInRoom) {
    expect(visit.record).toBeNull();
    expect(harness.swappedRepeats()).toEqual([]);
  }

  const seqAtLeaving = harness.current().seq;
  const schedulesAtLeaving = harness.schedules.length;
  await harness.advance(afterMs);
  expect(harness.stage()).toBe("result");
  expect(harness.sounds.filter((sound) => sound.seq > left.seq)).toEqual([]);
  expect(harness.events.filter((event) => event.seq > left.seq)).toEqual([]);
  expect(harness.schedules).toHaveLength(schedulesAtLeaving);
  expect(
    harness.steps.filter(
      (step) => step.seq > seqAtLeaving && step.stage !== "result",
    ),
  ).toEqual([]);
  expect(harness.pendingControllerTimerCount()).toBe(0);

  // The floor still offers the repeat after a run that gave no record.
  if (visit.record === null && left.by !== "pageLeft") {
    expect(harness.summary.rooms[visit.floorIndex]!.swappedRepeatOffered).toBe(
      true,
    );
    await harness.act("chooseSwappedRepeat", { roomIndex: visit.floorIndex });
    expect(harness.stage()).toBe("swappedRepeat");
    expect(harness.visits).toHaveLength(2);
    await harness.act("stop");
  }
}

describe("swapped repeat CP5: nothing sounds before a press; every ending plays nothing more", () => {
  it(
    "plays only on presses and in the check or the room, and after proceed, stop or a left page plays and hands out nothing more",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          repeatLogCaseArbitrary,
          endingRepeatScriptArbitrary,
          async (logCase, script) => {
            const harness = await createRepeatHarness({
              logCase,
              outputDelayMs: script.outputDelayMs,
            });
            await harness.run(script, { ending: script.ending });
            const visit = harness.visits[0];
            expect(visit).toBeDefined();
            if (visit === undefined) {
              return;
            }
            checkPresses(harness);
            await checkEnding(harness, visit);
            for (const step of harness.steps) {
              if (step.view !== null) {
                expect(step.view.stopLabel.length).toBeGreaterThan(0);
              }
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import { earpieceOnEar } from "../../src/session/earpiece-on-ear";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type { Ear } from "../../src/session/visit-flow-types";
import {
  repeatLogCaseArbitrary,
  repeatScriptArbitrary,
} from "./swapped-repeat-arbitraries";
import type { RepeatHarness } from "./swapped-repeat-harness";
import { createRepeatHarness, filledChannel } from "./swapped-repeat-harness";

// CP3. Every sound and every answer names its earpiece, and nothing assumes a swap (Universal;
// swapped-repeat design.md, CP3; R8, R9). For a drawn visit log at the result, an imbalance and a
// repeat script of one or two visits to the stage, played on the repeat harness by a simulated
// visitor in Worn_Headphones that hears each trial from the channel the backend was given:
// - a swap check fills the left channel only;
// - a trial sound fills only the channel of `earpieceOnEar("swapped")[ear]` of the trial it
//   presented, and that trial's `earpiece` in the record and in the hook is that channel;
// - every scored trial answered with a side names the earpiece on the ear named, every ignored
//   answer the earpiece on its side, every swap check the left earpiece, and the record's
//   `earpieceOnEar` is the swap;
// - no trial sound is asked for while the earpiece state is not `swapped`, and a room starts only
//   after a `confirmed` check of the same visit to the stage, with no other answer after it;
// - while the visitor wears what the record says, every trial it heard on an ear is recorded with
//   that ear, through the earpiece the backend filled;
// - after the stage is left in any way past `instruction`, the result's `turnBackLine` is the
//   Turn_Back_Line and the earpiece state is `unknown`, and a second visit to the stage plays no
//   trial before its own `confirmed` check;
// - the visit log deep-equals itself before and after, and the summary is the summary of it.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 300;
const timeoutMs = 120_000;

const swapped = earpieceOnEar("swapped");
/** Times on the log's clock and on the timer's differ by the visit's start, up to rounding. */
const sameTimeMs = 1e-6;

function checkSounds(harness: RepeatHarness): void {
  for (const schedule of harness.schedules) {
    const sound = harness.sounds[schedule.soundIndex]!;
    const channel = filledChannel(schedule);
    if (sound.kind === "check") {
      expect(channel).toBe("left");
      continue;
    }
    expect(channel).toBe(sound.request?.ear);
    const presented = harness.presented.find(
      (entry) => entry.soundIndex === schedule.soundIndex,
    );
    expect(presented).toBeDefined();
    if (presented === undefined || presented.trial.ear === null) {
      return;
    }
    expect(channel).toBe(swapped[presented.trial.ear]);
    expect(presented.trial.earpiece).toBe(channel);
    expect(presented.filledEarpiece).toBe(channel);
  }
  for (const entry of harness.presented) {
    const visit = harness.visits[entry.visitIndex ?? -1];
    expect(entry.trial.swappedRepeatRunNumber).toBe(visit?.runNumber);
    expect(entry.trial.earpiece).toBe(
      entry.trial.ear === null ? null : swapped[entry.trial.ear],
    );
    // While the visitor wears the swap the record names, it heard the sound on the trial's ear.
    if (
      entry.trial.kind === "sound" &&
      entry.soundIndex !== null &&
      isSwap(harness.sounds[entry.soundIndex]!.visitorEarpieceOnEar)
    ) {
      expect(entry.heardOnEar).toBe(entry.trial.ear);
    }
  }
}

const isSwap = (wearing: Readonly<Record<Ear, Ear>>): boolean =>
  wearing.left === swapped.left && wearing.right === swapped.right;

function checkRecords(harness: RepeatHarness): void {
  for (const visit of harness.visits) {
    const record = visit.record;
    if (record === null) {
      continue;
    }
    expect(record.earpieceOnEar).toEqual({ left: "right", right: "left" });
    expect(record.swapChecks.length).toBeGreaterThan(0);
    for (const check of record.swapChecks) {
      expect(check.earpiece).toBe("left");
    }
    expect(record.swapChecks.at(-1)?.judgement).toBe("confirmed");
    for (const answer of record.ignoredAnswers) {
      expect(answer.earpiece).toBe(swapped[answer.side]);
    }
    for (const trial of record.trials) {
      expect(trial.earpiece).toBe(
        trial.kind === "sound" ? swapped[trial.ear] : null,
      );
      expect(trial.responseEarpiece).toBe(
        trial.status === "scored" && trial.response !== "none"
          ? swapped[trial.response]
          : null,
      );
      if (trial.kind !== "sound") {
        continue;
      }
      // The channel the backend actually filled for this trial.
      const sound = harness.sounds.find(
        (candidate) =>
          candidate.kind === "trial" &&
          candidate.visitIndex === visit.index &&
          candidate.outcome.kind === "scheduled" &&
          Math.abs(
            candidate.atMs - (trial.presentedAtMs + harness.visitStartedAtMs),
          ) < sameTimeMs,
      );
      expect(sound).toBeDefined();
      if (sound?.scheduleIndex === null || sound === undefined) {
        continue;
      }
      const channel = filledChannel(harness.schedules[sound.scheduleIndex]!);
      expect(trial.earpiece).toBe(channel);
      if (isSwap(sound.visitorEarpieceOnEar)) {
        const heardOn = (["left", "right"] as const).find(
          (ear) => sound.visitorEarpieceOnEar[ear] === channel,
        );
        expect(heardOn).toBe(trial.ear);
      }
    }
  }
}

function checkNothingAssumesASwap(harness: RepeatHarness): void {
  for (const sound of harness.sounds) {
    if (sound.kind === "trial") {
      expect(sound.earpiecesBefore).toBe("swapped");
      expect(sound.phaseBefore).toBe("room");
    }
  }
  for (const begin of harness.beginRooms) {
    const visit = harness.visits[begin.visitIndex ?? -1];
    expect(visit).toBeDefined();
    if (visit === undefined) {
      return;
    }
    // In this visit to the stage, the last view before the room started was `ready`, which only a
    // confirmed check of this visit gives and which no answer leaves, with the earpieces swapped.
    const before = harness.steps.filter(
      (step) =>
        step.seq < begin.seq &&
        step.seq > visit.seq &&
        step.visitIndex === visit.index &&
        step.view !== null,
    );
    expect(before.at(-1)?.view?.phase).toBe("ready");
    expect(before.at(-1)?.earpieces).toBe("swapped");
  }
}

function checkLeaving(harness: RepeatHarness): void {
  for (const visit of harness.visits) {
    if (visit.left === null || !visit.instructionShown) {
      continue;
    }
    const after = harness.steps.find(
      (step) => step.seq > visit.left!.seq && step.stage === "result",
    );
    expect(after).toBeDefined();
    expect(after?.earpieces).toBe("unknown");
    expect(after?.result?.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
    // Nothing sets the earpieces back to as marked after a repeat: every later result keeps the line.
    for (const later of harness.steps.filter(
      (step) => step.seq > visit.left!.seq && step.stage === "result",
    )) {
      expect(later.earpieces).not.toBe("asMarked");
      expect(later.result?.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
    }
  }
  for (const step of harness.steps) {
    if (step.stage === "result" && step.earpieces === "asMarked") {
      expect(step.result?.turnBackLine).toBeNull();
    }
  }
}

describe("swapped repeat CP3: every sound and every answer names its earpiece, and nothing assumes a swap", () => {
  it(
    "names the earpiece of every sound, trial, answer and check, plays no trial before a confirmed swap, and asks to turn back",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          repeatLogCaseArbitrary,
          repeatScriptArbitrary,
          async (logCase, script) => {
            const harness = await createRepeatHarness({
              logCase,
              outputDelayMs: script.outputDelayMs,
            });
            await harness.run(script);
            checkSounds(harness);
            checkRecords(harness);
            checkNothingAssumesASwap(harness);
            checkLeaving(harness);
            expect(harness.log).toEqual(harness.logBefore);
            expect(harness.summary).toEqual(summarizeVisit(harness.logBefore));
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

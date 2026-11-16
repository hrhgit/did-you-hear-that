import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { measureFadeLengths } from "../../src/audio/synth/measure/fade-lengths";
import type { Ear } from "../../src/session/visit-flow-types";
import {
  repeatLogCaseArbitrary,
  repeatScriptArbitrary,
} from "./swapped-repeat-arbitraries";
import type { RepeatHarness } from "./swapped-repeat-harness";
import { createRepeatHarness, filledChannel } from "./swapped-repeat-harness";

// CP7. Every sound of the repeat is safe (Universal; swapped-repeat design.md, CP7; R17;
// audio-safety rules 1 to 6). For a drawn visit log at the result and a repeat script played on
// the repeat harness, for every backend `schedule` of the stage:
// - one channel holds a sample that is not zero and every sample of the other is `+0`;
// - the peak is at most `ceilingFraction`, and the sound lasts at most `ghostSoundMaxDurationMs`;
// - `measureFadeLengths` gives at least `fadeMinMs` for the fade in and the fade out;
// - a swap check went through `playHeadphoneCheck` and asked for `headphoneCheckLevelDb`, and
//   played no louder;
// - a trial went through `play` with the Purpose `trial`, at most at the run's search cap, and was
//   played at the level it asked for;
// - `beginRoom` was called after the last check and before the first trial of each visit to the
//   stage, and within the run no trial on a channel rises more than one upward step above the one
//   before it on that channel;
// - no request has the Purpose `replay`.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 200;
const timeoutMs = 120_000;

const { ceilingFraction, fadeMinMs, ghostSoundMaxDurationMs } =
  audioSafetyConfig;
const { headphoneCheckLevelDb } = audioOutputConfig;
const { upwardStepDb } = hearingMethodConfig;

function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function checkSchedules(harness: RepeatHarness): void {
  for (const schedule of harness.schedules) {
    const channel = filledChannel(schedule);
    expect(channel).not.toBeNull();
    if (channel === null) {
      return;
    }
    const own = schedule[channel];
    const other = channel === "left" ? schedule.right : schedule.left;
    expect(other.every((sample) => Object.is(sample, 0))).toBe(true);
    expect(peakOf(own)).toBeLessThanOrEqual(ceilingFraction);
    expect((own.length * 1000) / schedule.sampleRateHz).toBeLessThanOrEqual(
      ghostSoundMaxDurationMs,
    );
    const fades = measureFadeLengths(own, schedule.sampleRateHz);
    expect(fades.fadeInMs).toBeGreaterThanOrEqual(fadeMinMs);
    expect(fades.fadeOutMs).toBeGreaterThanOrEqual(fadeMinMs);

    const sound = harness.sounds[schedule.soundIndex]!;
    expect(sound.outcome.kind).toBe("scheduled");
    if (sound.outcome.kind !== "scheduled") {
      return;
    }
    if (sound.kind === "check") {
      expect(sound.request).toBeNull();
      // Asked for at the check's level. The rise limit of the output stage acts on the check too
      // ("Which limits of the output stage act on each sound of the repeat"), so it may play lower.
      expect(sound.outcome.requestedLevelDb).toBe(headphoneCheckLevelDb);
      expect(sound.outcome.playedLevelDb).toBeLessThanOrEqual(
        headphoneCheckLevelDb,
      );
      continue;
    }
    const visit = harness.visits[sound.visitIndex ?? -1]!;
    const capDb = harness.summary.rooms[visit.floorIndex]!.searchCapDb;
    expect(sound.request?.purpose).toBe("trial");
    expect(sound.request!.levelDb).toBeLessThanOrEqual(capDb);
    expect(sound.outcome.playedLevelDb).toBe(sound.request!.levelDb);
  }
  for (const sound of harness.sounds) {
    expect(sound.request?.purpose).not.toBe("replay");
  }
}

function checkRises(harness: RepeatHarness): void {
  for (const visit of harness.visits) {
    const sounds = harness.sounds.filter(
      (sound) =>
        sound.visitIndex === visit.index && sound.scheduleIndex !== null,
    );
    const trials = sounds.filter((sound) => sound.kind === "trial");
    if (trials.length === 0) {
      continue;
    }
    const begin = harness.beginRooms.filter(
      (mark) => mark.visitIndex === visit.index,
    );
    expect(begin).toHaveLength(1);
    const lastCheck = sounds.filter((sound) => sound.kind === "check").at(-1);
    expect(begin[0]!.seq).toBeLessThan(trials[0]!.seq);
    if (lastCheck !== undefined) {
      expect(begin[0]!.seq).toBeGreaterThan(lastCheck.seq);
    }
    const previous: Record<Ear, number | null> = { left: null, right: null };
    for (const trial of trials) {
      if (trial.outcome.kind !== "scheduled" || trial.request === null) {
        continue;
      }
      const channel = trial.request.ear;
      const before = previous[channel];
      if (before !== null) {
        expect(trial.outcome.playedLevelDb - before).toBeLessThanOrEqual(
          upwardStepDb,
        );
      }
      previous[channel] = trial.outcome.playedLevelDb;
    }
  }
}

describe("swapped repeat CP7: every sound of the repeat is safe", () => {
  it(
    "plays every check and trial on one channel with exact zero on the other, faded, short, within the ceiling and the cap, at the level asked, rising one step at most",
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
            checkSchedules(harness);
            checkRises(harness);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

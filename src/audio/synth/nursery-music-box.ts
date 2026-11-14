import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import type { EventDecay } from "./event-envelope";
import { eventEnvelope } from "./event-envelope";
import { finishSound } from "./finish-sound";
import { planNurseryMusicBox } from "./nursery-music-box-plan";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The nursery, a few notes of a music box: sines a semitone apart around 2 kHz, each with a
 * gentle rise and a ringing decay that ends in a release. The notes overlap a little.
 */
export function renderNurseryMusicBox(
  sampleRateHz: number,
  random: RandomSource,
): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.nursery;
  const plan = planNurseryMusicBox(random);
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const samples = new Float64Array(sampleCount);
  const decay: EventDecay = {
    kind: "note",
    timeConstantMs: config.noteDecayTimeConstantMs,
    lengthMs: config.noteLengthMs,
    releaseMs: config.noteReleaseMs,
  };

  for (const note of plan.notes) {
    const firstIndex = Math.max(
      0,
      Math.ceil((note.onsetMs * sampleRateHz) / 1000),
    );
    const lastIndex = Math.min(
      sampleCount - 1,
      Math.floor(((note.onsetMs + config.noteLengthMs) * sampleRateHz) / 1000),
    );
    for (let n = firstIndex; n <= lastIndex; n += 1) {
      const sinceOnsetMs = (n * 1000) / sampleRateHz - note.onsetMs;
      const envelope = eventEnvelope(sinceOnsetMs, config.noteAttackMs, decay);
      samples[n] +=
        envelope *
        Math.sin(
          (2 * Math.PI * note.frequencyHz * sinceOnsetMs) / 1000 +
            note.startPhaseRadians,
        );
    }
  }
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

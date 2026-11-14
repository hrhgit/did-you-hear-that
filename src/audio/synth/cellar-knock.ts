import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { planCellarKnock } from "./cellar-knock-plan";
import { decibelsToGain } from "./decibels-to-gain";
import type { EventDecay } from "./event-envelope";
import { eventEnvelope } from "./event-envelope";
import { finishSound } from "./finish-sound";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The cellar, a dull knock: a few sine bursts near 500 Hz, each with a raised-cosine rise and
 * fall. The rise is slow enough to keep the knock inside its band, so it sounds like a soft thud.
 */
export function renderCellarKnock(
  sampleRateHz: number,
  random: RandomSource,
): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.cellar;
  const plan = planCellarKnock(random);
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const samples = new Float64Array(sampleCount);
  const decay: EventDecay = {
    kind: "raisedCosine",
    decayMs: config.knockDecayMs,
  };
  const knockLengthMs = config.knockAttackMs + config.knockDecayMs;

  for (const knock of plan.knocks) {
    const gain = decibelsToGain(knock.levelDb);
    const firstIndex = Math.max(
      0,
      Math.ceil((knock.onsetMs * sampleRateHz) / 1000),
    );
    const lastIndex = Math.min(
      sampleCount - 1,
      Math.floor(((knock.onsetMs + knockLengthMs) * sampleRateHz) / 1000),
    );
    for (let n = firstIndex; n <= lastIndex; n += 1) {
      const sinceOnsetMs = (n * 1000) / sampleRateHz - knock.onsetMs;
      const envelope = eventEnvelope(sinceOnsetMs, config.knockAttackMs, decay);
      samples[n] +=
        gain *
        envelope *
        Math.sin(
          (2 * Math.PI * knock.carrierHz * sinceOnsetMs) / 1000 +
            knock.startPhaseRadians,
        );
    }
  }
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

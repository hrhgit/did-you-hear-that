import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { planCorridorHum } from "./corridor-hum-plan";
import { finishSound } from "./finish-sound";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The corridor, a hummed note, slightly unsteady: one sine near 1 kHz whose pitch follows the sum
 * of slow sinusoids and whose level dips slowly. No harmonics, because they would fall outside
 * the band.
 *
 * The instantaneous frequency `centre × (1 + Σ a sin(2π r t + φ))` is integrated in closed form,
 * so the phase does not depend on the sample rate.
 */
export function renderCorridorHum(
  sampleRateHz: number,
  random: RandomSource,
): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.corridor;
  const plan = planCorridorHum(random);
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const samples = new Float64Array(sampleCount);
  const depth = config.pitchWobbleDepthFraction;

  for (let n = 0; n < sampleCount; n += 1) {
    const timeSeconds = n / sampleRateHz;
    const timeMs = timeSeconds * 1000;
    let cycles = timeSeconds;
    for (const wobble of plan.pitchWobbles) {
      cycles +=
        (depth *
          (Math.cos(wobble.phaseRadians) -
            Math.cos(
              2 * Math.PI * wobble.rateHz * timeSeconds + wobble.phaseRadians,
            ))) /
        (2 * Math.PI * wobble.rateHz);
    }
    const phaseRadians =
      plan.startPhaseRadians + 2 * Math.PI * config.centreHz * cycles;
    const body =
      raisedCosineRamp(timeMs / config.bodyAttackMs) *
      raisedCosineRamp((config.durationMs - timeMs) / config.bodyReleaseMs);
    const levelWobble =
      1 -
      config.levelWobbleDepthFraction *
        (0.5 +
          0.5 *
            Math.sin(
              2 * Math.PI * plan.levelWobble.rateHz * timeSeconds +
                plan.levelWobble.phaseRadians,
            ));
    samples[n] = body * levelWobble * Math.sin(phaseRadians);
  }
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { planAtticWhine } from "./attic-whine-plan";
import { finishSound } from "./finish-sound";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The attic, a thin whine: one sine near 8 kHz whose pitch wobbles slowly, with a slow rise and a
 * slower fall.
 *
 * The instantaneous frequency `carrier × (1 + a sin(2π r t + φ))` is integrated in closed form, so
 * the phase does not depend on the sample rate.
 */
export function renderAtticWhine(
  sampleRateHz: number,
  random: RandomSource,
): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.attic;
  const plan = planAtticWhine(random);
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const samples = new Float64Array(sampleCount);
  const rateHz = plan.pitchWobbleRateHz;
  const wobblePhase = plan.pitchWobblePhaseRadians;

  for (let n = 0; n < sampleCount; n += 1) {
    const timeSeconds = n / sampleRateHz;
    const timeMs = timeSeconds * 1000;
    const cycles =
      timeSeconds +
      (config.pitchWobbleDepthFraction *
        (Math.cos(wobblePhase) -
          Math.cos(2 * Math.PI * rateHz * timeSeconds + wobblePhase))) /
        (2 * Math.PI * rateHz);
    const phaseRadians =
      plan.startPhaseRadians + 2 * Math.PI * plan.carrierHz * cycles;
    const body =
      raisedCosineRamp(timeMs / config.bodyAttackMs) *
      raisedCosineRamp((config.durationMs - timeMs) / config.bodyReleaseMs);
    samples[n] = body * Math.sin(phaseRadians);
  }
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

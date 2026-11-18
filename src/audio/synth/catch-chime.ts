import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { finishSound } from "./finish-sound";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The chime after a caught sound (the game layer, 2026-11-17): a few sine partials with a short
 * rise and an exponential fall. It takes no random source, so every chime is the same.
 */
export function renderCatchChime(sampleRateHz: number): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.chime;
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const samples = new Float64Array(sampleCount);
  for (let n = 0; n < sampleCount; n += 1) {
    const timeSeconds = n / sampleRateHz;
    const timeMs = timeSeconds * 1000;
    const envelope =
      raisedCosineRamp(timeMs / config.attackMs) *
      Math.exp(-timeMs / config.decayTimeConstantMs);
    let value = 0;
    config.partialFrequenciesHz.forEach((frequencyHz, index) => {
      value +=
        (config.partialGains[index] ?? 0) *
        Math.sin(2 * Math.PI * frequencyHz * timeSeconds);
    });
    samples[n] = envelope * value;
  }
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

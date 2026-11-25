import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { finishSound } from "./finish-sound";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The puff when a creature gets to Jack (the game layer, 2026-11-20): a soft tone that falls from
 * `startHz` towards `endHz` and dies away. It takes no random source, so every puff is the same.
 */
export function renderSnuff(sampleRateHz: number): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.snuff;
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const samples = new Float64Array(sampleCount);
  let phase = 0;
  for (let n = 0; n < sampleCount; n += 1) {
    const timeMs = (n / sampleRateHz) * 1000;
    const frequencyHz =
      config.endHz +
      (config.startHz - config.endHz) *
        Math.exp(-timeMs / config.sweepTimeConstantMs);
    phase += (2 * Math.PI * frequencyHz) / sampleRateHz;
    let value = Math.sin(phase);
    config.overtoneGains.forEach((gain, index) => {
      value += gain * Math.sin((index + 2) * phase);
    });
    samples[n] =
      raisedCosineRamp(timeMs / config.attackMs) *
      Math.exp(-timeMs / config.decayTimeConstantMs) *
      value;
  }
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { decibelsToGain } from "./decibels-to-gain";
import { finishSound } from "./finish-sound";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { shapedNoise } from "./shaped-noise";
import { planStairsScrape } from "./stairs-scrape-plan";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * Gain of the scrape's noise at a frequency: 1 within `noiseHalfWidthOctaveFraction` of the
 * centre, then a raised-cosine fall to 0 over the next `noiseTaperOctaveFraction`, in octaves.
 */
function noiseGainAtHz(frequencyHz: number): number {
  const config = ghostSoundConfig.stairs;
  const distanceOctaveFraction = Math.abs(
    Math.log2(frequencyHz / config.centreHz),
  );
  const outerOctaveFraction =
    config.noiseHalfWidthOctaveFraction + config.noiseTaperOctaveFraction;
  return raisedCosineRamp(
    (outerOctaveFraction - distanceOctaveFraction) /
      config.noiseTaperOctaveFraction,
  );
}

/**
 * The stairs, a dry scrape: noise confined to the middle of the 4 kHz band, shaped by a pattern
 * of overlapping sine-squared grains.
 */
export function renderStairsScrape(
  sampleRateHz: number,
  random: RandomSource,
): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.stairs;
  const plan = planStairsScrape(random);
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const noise = shapedNoise(sampleCount, sampleRateHz, noiseGainAtHz, random);

  const envelope = new Float64Array(sampleCount);
  for (const grain of plan.grains) {
    const gain = decibelsToGain(grain.levelDb);
    const firstIndex = Math.max(
      0,
      Math.ceil((grain.startMs * sampleRateHz) / 1000),
    );
    const lastIndex = Math.min(
      sampleCount - 1,
      Math.floor(((grain.startMs + grain.lengthMs) * sampleRateHz) / 1000),
    );
    for (let n = firstIndex; n <= lastIndex; n += 1) {
      const sinceStartMs = (n * 1000) / sampleRateHz - grain.startMs;
      envelope[n] +=
        gain * Math.sin((Math.PI * sinceStartMs) / grain.lengthMs) ** 2;
    }
  }

  const samples = noise.map((value, n) => value * envelope[n]);
  return finishSound(samples, sampleRateHz, config.outerFadeMs);
}

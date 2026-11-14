import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { ghostSoundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "./decibels-to-gain";
import { finishSound } from "./finish-sound";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { shapedNoise } from "./shaped-noise";
import { validateSampleRate } from "./validate-sample-rate";

/**
 * The calibration shape in decibels at a frequency: the configured room band levels at the room
 * centres, interpolated linearly in log frequency between them, and held at the end values below
 * the cellar and above the attic.
 */
function shapeLevelDb(frequencyHz: number): number {
  const centresHz = ghostSoundIds.map((id) => ghostSoundConfig[id].centreHz);
  const levelsDb = ghostSoundIds.map(
    (id) => soundRulesConfig.calibrationShapeDb[id],
  );
  if (frequencyHz <= centresHz[0]) {
    return levelsDb[0];
  }
  for (let index = 1; index < centresHz.length; index += 1) {
    if (frequencyHz <= centresHz[index]) {
      const position =
        Math.log2(frequencyHz / centresHz[index - 1]) /
        Math.log2(centresHz[index] / centresHz[index - 1]);
      return (
        levelsDb[index - 1] + position * (levelsDb[index] - levelsDb[index - 1])
      );
    }
  }
  return levelsDb[levelsDb.length - 1];
}

/**
 * Amplitude of the hiss at a frequency. A third-octave band holds a number of bins proportional to
 * its centre frequency, so the amplitude per bin falls as `1 / sqrt(f)` for the band energies to
 * follow the shape. The low and high cuts are raised-cosine slopes in log frequency. The overall
 * scale does not matter, because `finishSound` sets the RMS.
 */
function hissGainAtHz(frequencyHz: number): number {
  const config = ghostSoundConfig.calibration;
  const lowCutGain = raisedCosineRamp(
    Math.log2(frequencyHz / config.lowCutStartHz) /
      Math.log2(config.lowCutEndHz / config.lowCutStartHz),
  );
  const highCutGain = raisedCosineRamp(
    Math.log2(config.highCutEndHz / frequencyHz) /
      Math.log2(config.highCutEndHz / config.highCutStartHz),
  );
  return (
    (decibelsToGain(shapeLevelDb(frequencyHz)) / Math.sqrt(frequencyHz)) *
    lowCutGain *
    highCutGain
  );
}

/**
 * The calibration noise, a steady hiss shaped like hands rubbing: noise with fixed magnitudes and
 * random phases whose room band levels follow `calibrationShapeDb` (D8, D11). Its level does not
 * change apart from the outer fades (R5.6). At sample rates below 32000 Hz the high cut lies above
 * the Nyquist frequency, and the noise simply stops there.
 */
export function renderCalibrationHiss(
  sampleRateHz: number,
  random: RandomSource,
): Float32Array {
  validateSampleRate(sampleRateHz);
  const config = ghostSoundConfig.calibration;
  const sampleCount = Math.floor((config.durationMs * sampleRateHz) / 1000);
  const noise = shapedNoise(sampleCount, sampleRateHz, hissGainAtHz, random);
  return finishSound(noise, sampleRateHz, config.outerFadeMs);
}

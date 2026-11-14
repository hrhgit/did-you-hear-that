import type { RandomSource } from "../../config/seeded-random";
import { dftAnyLength } from "./dft-any-length";

/**
 * Noise with a fixed magnitude spectrum and random phases, built in the frequency domain (D11).
 *
 * The noise is exactly one period long: its transform length M is `sampleCount` itself, so every
 * buffer has the magnitudes it was given and no part of a longer period is cut off (D36). For each
 * bin k with 1 ≤ k < M/2, in that order, the magnitude is `gainAtHz(k × sampleRate / M)` and the
 * phase is drawn uniformly from 0 to 2π, one draw per bin whatever its gain. The conjugate bin is
 * set to match, bin 0 and (for even M) bin M/2 stay zero, and the inverse transform gives the
 * samples. Only the phases are random.
 */
export function shapedNoise(
  sampleCount: number,
  sampleRateHz: number,
  gainAtHz: (frequencyHz: number) => number,
  random: RandomSource,
): Float64Array {
  const length = sampleCount;
  if (length < 1) {
    return new Float64Array(0);
  }
  const real = new Float64Array(length);
  const imag = new Float64Array(length);
  for (let bin = 1; bin < length - bin; bin += 1) {
    const magnitude = gainAtHz((bin * sampleRateHz) / length);
    const phaseRadians = 2 * Math.PI * random.next();
    real[bin] = magnitude * Math.cos(phaseRadians);
    imag[bin] = magnitude * Math.sin(phaseRadians);
    real[length - bin] = real[bin];
    imag[length - bin] = -imag[bin];
  }
  dftAnyLength(real, imag, "inverse");
  return real;
}

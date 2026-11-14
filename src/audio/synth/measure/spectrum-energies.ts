import { soundRulesConfig } from "../../../config/sound-rules-config";
import type { BandEdges } from "../band-edges";
import { fftInPlace } from "../fft";

export interface BandEnergy {
  /** Energy of the bins whose centre frequency lies inside the band, edges included. */
  readonly inBandEnergy: number;
  /** Energy of every other bin from 0 Hz to the Nyquist frequency, summed on its own (D32). */
  readonly outOfBandEnergy: number;
}

export interface SpectrumEnergies {
  readonly fftLength: number;
  readonly binWidthHz: number;
  /** Parseval's sum over every bin. Equals the sum of squared samples. */
  readonly totalEnergy: number;
  /** One entry per requested band, in the order requested. */
  readonly bands: readonly BandEnergy[];
}

/**
 * Splits the energy of a buffer between bands (D3). The buffer is zero-padded to the smallest
 * power of two M that is at least its length and gives bins no wider than
 * `spectrumBinWidthMaxHz`, and transformed with a rectangular window. The one-sided energy of bin
 * k is `(re² + im²) / M`, doubled for every bin except 0 and M/2, so the energies add up to the
 * sum of squared samples. A bin belongs to a band when `k × sampleRate / M` lies inside it.
 *
 * The input is not modified.
 */
export function spectrumEnergies(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  bands: readonly BandEdges[],
): SpectrumEnergies {
  const shortestLength = Math.max(
    samples.length,
    Math.ceil(sampleRateHz / soundRulesConfig.spectrumBinWidthMaxHz),
    1,
  );
  let fftLength = 1;
  while (fftLength < shortestLength) {
    fftLength *= 2;
  }

  const real = new Float64Array(fftLength);
  const imag = new Float64Array(fftLength);
  real.set(samples);
  fftInPlace(real, imag, "forward");

  const inBand = bands.map(() => 0);
  const outOfBand = bands.map(() => 0);
  let totalEnergy = 0;
  const lastBin = fftLength / 2;
  for (let bin = 0; bin <= lastBin; bin += 1) {
    const isEdgeBin = bin === 0 || bin === lastBin;
    const binEnergy =
      ((real[bin] ** 2 + imag[bin] ** 2) / fftLength) * (isEdgeBin ? 1 : 2);
    totalEnergy += binEnergy;
    const binHz = (bin * sampleRateHz) / fftLength;
    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index];
      if (binHz >= band.lowHz && binHz <= band.highHz) {
        inBand[index] += binEnergy;
      } else {
        outOfBand[index] += binEnergy;
      }
    }
  }

  return Object.freeze({
    fftLength,
    binWidthHz: sampleRateHz / fftLength,
    totalEnergy,
    bands: Object.freeze(
      bands.map((_, index) =>
        Object.freeze({
          inBandEnergy: inBand[index],
          outOfBandEnergy: outOfBand[index],
        }),
      ),
    ),
  });
}

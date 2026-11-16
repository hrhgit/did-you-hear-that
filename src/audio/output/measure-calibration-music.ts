import { gainToDecibels } from "./gain-to-decibels";

/** The level of the decoded calibration music, as fractions of full scale. */
export interface CalibrationMusicMeasure {
  /** The RMS of every sample. */
  readonly rmsFraction: number;
  /** The largest absolute sample. */
  readonly peakFraction: number;
  /** The peak above the RMS, in decibels: `20 × log10(peakFraction / rmsFraction)`. */
  readonly crestDb: number;
}

/**
 * Measures the decoded calibration music (`.kiro/specs/audible-start/design.md`, "Loading"; R4.3).
 * A pure function of the samples. Gives null for a buffer that is empty, silent or holds a sample
 * that is not finite, so that the output stage falls back to the hiss (R4.4).
 */
export function measureCalibrationMusic(
  samples: ArrayLike<number>,
): CalibrationMusicMeasure | null {
  const sampleCount = samples.length;
  if (sampleCount === 0) {
    return null;
  }
  let sumOfSquares = 0;
  let peakFraction = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = samples[index];
    if (typeof sample !== "number" || !Number.isFinite(sample)) {
      return null;
    }
    const magnitude = Math.abs(sample);
    sumOfSquares += sample * sample;
    if (magnitude > peakFraction) {
      peakFraction = magnitude;
    }
  }
  const rmsFraction = Math.sqrt(sumOfSquares / sampleCount);
  if (
    !(peakFraction > 0) ||
    !(rmsFraction > 0) ||
    !Number.isFinite(rmsFraction)
  ) {
    return null;
  }
  return Object.freeze({
    rmsFraction,
    peakFraction,
    crestDb: gainToDecibels(peakFraction / rmsFraction),
  });
}

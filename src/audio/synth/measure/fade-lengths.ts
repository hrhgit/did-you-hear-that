export interface FadeLengths {
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

/**
 * The inverse of the raised-cosine ramp `(1 − cos(πu)) / 2` on [0, 1]. The measurement keeps its
 * own copy and does not import the synthesis ramp, so that it stays independent of the code it
 * judges (R11.3, D13).
 */
function rampInverse(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.acos(1 - 2 * clamped) / Math.PI;
}

/** Largest absolute sample value. NaN if any sample is NaN. */
function peakOf(samples: Float32Array | Float64Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

/**
 * Fade-in length in samples (D4): the longest raised-cosine ramp, started at the sample before
 * the first non-zero one, that the running peak of the buffer never rises above, relative to the
 * buffer's overall peak. Reading the samples in `order` "reversed" gives the fade-out length.
 */
function fadeLengthSamples(
  samples: Float32Array | Float64Array,
  peak: number,
  order: "forward" | "reversed",
): number {
  const length = samples.length;
  const at = (index: number): number =>
    Math.abs(samples[order === "forward" ? index : length - 1 - index]);

  let onset = 0;
  while (onset < length && at(onset) === 0) {
    onset += 1;
  }
  if (onset === length) {
    return 0;
  }

  let runningPeak = 0;
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = onset; index < length; index += 1) {
    const value = at(index);
    if (value > runningPeak) {
      // The candidate only falls where the running peak rises, so it is computed only there.
      runningPeak = value;
      const rampPosition = rampInverse(runningPeak / peak);
      if (rampPosition > 0) {
        shortest = Math.min(shortest, (index - onset + 1) / rampPosition);
      }
      if (runningPeak >= peak) {
        break;
      }
    }
  }
  return shortest;
}

/**
 * Measures the fade-in and fade-out lengths of a buffer in milliseconds (D4). A sound that
 * reaches its peak at time t after its onset measures at most t. A sound that jumps from exact
 * silence to its peak measures one sample. An all-zero buffer measures 0. A buffer holding NaN
 * measures NaN.
 *
 * The input is not modified.
 */
export function measureFadeLengths(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
): FadeLengths {
  const peak = peakOf(samples);
  if (Number.isNaN(peak)) {
    return Object.freeze({ fadeInMs: Number.NaN, fadeOutMs: Number.NaN });
  }
  if (peak === 0) {
    return Object.freeze({ fadeInMs: 0, fadeOutMs: 0 });
  }
  const toMs = (sampleCount: number): number =>
    (sampleCount * 1000) / sampleRateHz;
  return Object.freeze({
    fadeInMs: toMs(fadeLengthSamples(samples, peak, "forward")),
    fadeOutMs: toMs(fadeLengthSamples(samples, peak, "reversed")),
  });
}

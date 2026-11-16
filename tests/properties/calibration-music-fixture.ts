// Deterministic samples that stand in for the decoded calibration music under Node (audible-start
// design.md, "Testing the music under Node"). Made in code, so no audio file is added, converted
// or decoded (R28.2): a sum of sine partials under a slow envelope, shaped to a chosen crest
// factor and scaled to a chosen RMS, at a chosen rate.

/** The partials of the fixture: frequency and amplitude. All lie below 11 025 Hz. */
const partials: readonly {
  readonly frequencyHz: number;
  readonly gain: number;
}[] = Object.freeze([
  { frequencyHz: 196, gain: 1 },
  { frequencyHz: 293.66, gain: 0.6 },
  { frequencyHz: 392, gain: 0.45 },
  { frequencyHz: 587.33, gain: 0.3 },
  { frequencyHz: 783.99, gain: 0.2 },
  { frequencyHz: 1174.66, gain: 0.12 },
]);
/** The envelope rises and falls once in this long. */
const envelopePeriodMs = 1500;

export interface CalibrationMusicFixtureOptions {
  /** The peak above the RMS, in decibels; above 0. */
  readonly crestDb: number;
  /** The RMS of the samples, as a fraction of full scale; above 0. */
  readonly rmsFraction: number;
  readonly sampleRateHz: number;
  /** 2000 ms by default. */
  readonly durationMs?: number;
}

/** The RMS of samples whose magnitudes above `limit` are held at `limit`, from sorted magnitudes. */
function clippedRms(
  sortedMagnitudes: Float64Array,
  prefixSquares: Float64Array,
  limit: number,
): number {
  // The count of magnitudes below the limit, by binary search.
  let low = 0;
  let high = sortedMagnitudes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sortedMagnitudes[middle] < limit) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const sumOfSquares =
    prefixSquares[low] + (sortedMagnitudes.length - low) * limit * limit;
  return Math.sqrt(sumOfSquares / sortedMagnitudes.length);
}

/**
 * Samples with the chosen crest factor and RMS, as closely as 32-bit samples allow. A crest
 * factor above the base signal's comes from one raised sample in the middle; one below it from
 * clipping the base signal at the level that gives it. Deterministic: the same options give the
 * same samples.
 */
export function calibrationMusicFixture(
  options: CalibrationMusicFixtureOptions,
): Float32Array {
  const { crestDb, rmsFraction, sampleRateHz } = options;
  const durationMs = options.durationMs ?? 2000;
  if (!(crestDb > 0) || !(rmsFraction > 0) || !(sampleRateHz > 0)) {
    throw new RangeError(
      `A fixture needs a crest factor, an RMS and a rate above 0, but got ${crestDb} dB, ${rmsFraction} and ${sampleRateHz} Hz.`,
    );
  }
  const sampleCount = Math.floor((durationMs * sampleRateHz) / 1000);
  const base = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const timeS = index / sampleRateHz;
    const envelope =
      0.6 + 0.4 * Math.sin((2 * Math.PI * timeS * 1000) / envelopePeriodMs);
    let value = 0;
    for (const [order, partial] of partials.entries()) {
      value +=
        partial.gain *
        Math.sin(2 * Math.PI * partial.frequencyHz * timeS + order * 0.7);
    }
    base[index] = envelope * value;
  }

  const crestGain = 10 ** (crestDb / 20);
  let sumOfSquares = 0;
  let peak = 0;
  for (const value of base) {
    sumOfSquares += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const baseCrestGain = peak / Math.sqrt(sumOfSquares / sampleCount);

  const shaped = new Float64Array(base);
  if (crestGain >= baseCrestGain) {
    // Raise one sample to v, with v / sqrt((S' + v²) / N) = C: v = C·sqrt(S' / (N − C²)).
    const middle = Math.floor(sampleCount / 2);
    const othersSquares = sumOfSquares - base[middle] * base[middle];
    if (!(sampleCount > crestGain * crestGain)) {
      throw new RangeError(
        `${sampleCount} samples are too few for a crest factor of ${crestDb} dB.`,
      );
    }
    shaped[middle] =
      crestGain *
      Math.sqrt(othersSquares / (sampleCount - crestGain * crestGain));
  } else {
    const sortedMagnitudes = Float64Array.from(base, Math.abs).sort();
    const prefixSquares = new Float64Array(sampleCount + 1);
    for (let index = 0; index < sampleCount; index += 1) {
      prefixSquares[index + 1] =
        prefixSquares[index] +
        sortedMagnitudes[index] * sortedMagnitudes[index];
    }
    // The crest factor of the clipped signal rises with the limit; search for the limit.
    let low = 0;
    let high = peak;
    for (let round = 0; round < 80; round += 1) {
      const limit = (low + high) / 2;
      const crest = limit / clippedRms(sortedMagnitudes, prefixSquares, limit);
      if (crest < crestGain) {
        low = limit;
      } else {
        high = limit;
      }
    }
    const limit = (low + high) / 2;
    for (let index = 0; index < sampleCount; index += 1) {
      shaped[index] = Math.min(limit, Math.max(-limit, shaped[index]));
    }
  }

  let shapedSquares = 0;
  for (const value of shaped) {
    shapedSquares += value * value;
  }
  const scale = rmsFraction / Math.sqrt(shapedSquares / sampleCount);
  return Float32Array.from(shaped, (value) => value * scale);
}

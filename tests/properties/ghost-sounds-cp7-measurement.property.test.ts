import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { bandEdges } from "../../src/audio/synth/band-edges";
import { fftInPlace } from "../../src/audio/synth/fft";
import { checkSound } from "../../src/audio/synth/measure/check-sound";
import { measureFadeLengths } from "../../src/audio/synth/measure/fade-lengths";
import { measureSound } from "../../src/audio/synth/measure/measure-sound";
import { spectrumEnergies } from "../../src/audio/synth/measure/spectrum-energies";
import { reportSampleRateArbitrary, seedArbitrary } from "./sound-arbitraries";

const runs = 100;
const sampleRateHz = 48000;
const samplesPerMs = sampleRateHz / 1000;

/** `length` samples from -1 to 1, drawn from `seed`. */
function randomSamples(length: number, seed: number): Float64Array {
  const random = createSeededRandom(seed);
  return Float64Array.from({ length }, () => 2 * random.next() - 1);
}

function sumOfSquares(samples: Float64Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return sum;
}

/** Forward DFT by its definition, with a table of the N roots of unity. */
function directDft(
  real: Float64Array,
  imag: Float64Array,
): [Float64Array, Float64Array] {
  const length = real.length;
  const cosines = Float64Array.from({ length }, (_, m) =>
    Math.cos((2 * Math.PI * m) / length),
  );
  const sines = Float64Array.from(
    { length },
    (_, m) => -Math.sin((2 * Math.PI * m) / length),
  );
  const outReal = new Float64Array(length);
  const outImag = new Float64Array(length);
  for (let k = 0; k < length; k += 1) {
    let sumReal = 0;
    let sumImag = 0;
    for (let n = 0, m = 0; n < length; n += 1, m = (m + k) % length) {
      sumReal += real[n] * cosines[m] - imag[n] * sines[m];
      sumImag += real[n] * sines[m] + imag[n] * cosines[m];
    }
    outReal[k] = sumReal;
    outImag[k] = sumImag;
  }
  return [outReal, outImag];
}

/** A constant 1 with raised-cosine fades of `fadeLength` samples at both ends, each from a zero. */
function constantWithFades(length: number, fadeLength: number): Float64Array {
  const ramp = (index: number): number =>
    index >= fadeLength
      ? 1
      : (1 - Math.cos((Math.PI * index) / fadeLength)) / 2;
  return Float64Array.from({ length }, (_, n) =>
    Math.min(ramp(n), ramp(length - 1 - n)),
  );
}

describe("ghost sounds CP7. The measurement is right on signals with known answers (R11.4 to R11.7)", () => {
  it("fftInPlace matches a direct DFT within 1e-9 of the signal's energy (Universal)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12 }),
        seedArbitrary,
        (exponent, seed) => {
          const length = 2 ** exponent;
          const real = randomSamples(length, seed);
          const imag = randomSamples(length, (seed ^ 0x5bd1e995) >>> 0);
          const energy = sumOfSquares(real) + sumOfSquares(imag);
          const [expectedReal, expectedImag] = directDft(real, imag);
          const actualReal = real.slice();
          const actualImag = imag.slice();
          fftInPlace(actualReal, actualImag, "forward");
          let errorEnergy = 0;
          for (let k = 0; k < length; k += 1) {
            errorEnergy +=
              (actualReal[k] - expectedReal[k]) ** 2 +
              (actualImag[k] - expectedImag[k]) ** 2;
          }
          // Divided by N to put the spectrum error on the scale of the signal's energy (D31).
          expect(errorEnergy / length).toBeLessThanOrEqual(1e-9 * energy);
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);

  it("spectrumEnergies reports a total equal to the sum of squares within 1e-9 relative (Universal)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20000 }),
        seedArbitrary,
        reportSampleRateArbitrary,
        (length, seed, rateHz) => {
          const samples = randomSamples(length, seed);
          const expected = sumOfSquares(samples);
          const { totalEnergy } = spectrumEnergies(samples, rateHz, []);
          expect(Math.abs(totalEnergy - expected)).toBeLessThanOrEqual(
            1e-9 * expected,
          );
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);

  it("measures raised-cosine fades of any length L within one sample of L (Universal)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 20000 }),
        fc.integer({ min: 10, max: 500 }),
        (length, fadeLength) => {
          const { fadeInMs, fadeOutMs } = measureFadeLengths(
            constantWithFades(length, fadeLength),
            sampleRateHz,
          );
          expect(
            Math.abs(fadeInMs * samplesPerMs - fadeLength),
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(fadeOutMs * samplesPerMs - fadeLength),
          ).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);

  it("measures a fade in of at most one sample for a step after any number of zeros (Universal)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.double({ min: 1e-6, max: 1, noNaN: true }),
        (zeroCount, level) => {
          const samples = new Float64Array(zeroCount + 1000).fill(
            level,
            zeroCount,
          );
          const { fadeInMs } = measureFadeLengths(samples, sampleRateHz);
          expect(fadeInMs * samplesPerMs).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);

  describe("examples", () => {
    const band500 = bandEdges(500, soundRulesConfig.bandWidthOctaveFraction);
    const band4000 = bandEdges(4000, soundRulesConfig.bandWidthOctaveFraction);

    function fadedTone(frequencyHz: number): Float64Array {
      const length = sampleRateHz;
      const fade = constantWithFades(length, sampleRateHz / 10);
      return fade.map(
        (gain, n) =>
          gain * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRateHz),
      );
    }

    function share(
      samples: Float64Array,
      band: { lowHz: number; highHz: number },
    ): number {
      const result = spectrumEnergies(samples, sampleRateHz, [band]);
      return result.bands[0].inBandEnergy / result.totalEnergy;
    }

    it("finds a 500 Hz tone with long fades more than 99.9 percent in band", () => {
      expect(share(fadedTone(500), band500)).toBeGreaterThan(0.999);
    });

    it("finds a 700 Hz tone less than 0.1 percent in the 500 Hz band", () => {
      expect(share(fadedTone(700), band500)).toBeLessThan(0.001);
    });

    it("finds white noise in the 4 kHz band within 10 percent of the band's share of the spectrum", () => {
      const expected = (band4000.highHz - band4000.lowHz) / (sampleRateHz / 2);
      const measured = share(randomSamples(2 * sampleRateHz, 2026), band4000);
      expect(Math.abs(measured / expected - 1)).toBeLessThan(0.1);
    });

    it("finds an all-zero buffer breaking band, fadeIn, fadeOut and level", () => {
      expect(
        checkSound(
          measureSound(new Float32Array(sampleRateHz), sampleRateHz, "stairs"),
        ).map((rule) => rule.rule),
      ).toEqual(["band", "fadeIn", "fadeOut", "level"]);
    });
  });
});

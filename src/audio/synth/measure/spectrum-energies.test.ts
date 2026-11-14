import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../../config/seeded-random";
import { soundRulesConfig } from "../../../config/sound-rules-config";
import { bandEdges } from "../band-edges";
import { spectrumEnergies } from "./spectrum-energies";

const band500 = bandEdges(500, soundRulesConfig.bandWidthOctaveFraction);

function sumOfSquares(samples: Float64Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return sum;
}

/** A sine at `frequencyHz` with raised-cosine fades of `fadeSeconds` at both ends. */
function fadedTone(
  frequencyHz: number,
  sampleRateHz: number,
  seconds: number,
  fadeSeconds: number,
): Float64Array {
  const length = Math.floor(seconds * sampleRateHz);
  const fadeLength = fadeSeconds * sampleRateHz;
  return Float64Array.from({ length }, (_, n) => {
    const edge = Math.min(n, length - 1 - n);
    const gain =
      edge >= fadeLength
        ? 1
        : (1 - Math.cos((Math.PI * edge) / fadeLength)) / 2;
    return gain * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRateHz);
  });
}

function inBandShare(samples: Float64Array, sampleRateHz: number): number {
  const result = spectrumEnergies(samples, sampleRateHz, [band500]);
  return result.bands[0].inBandEnergy / result.totalEnergy;
}

describe("spectrumEnergies", () => {
  it("reports a total equal to the sum of squared samples", () => {
    const random = createSeededRandom(7);
    const samples = Float64Array.from(
      { length: 30000 },
      () => 2 * random.next() - 1,
    );
    const result = spectrumEnergies(samples, 44100, [band500]);
    expect(
      Math.abs(result.totalEnergy - sumOfSquares(samples)),
    ).toBeLessThanOrEqual(1e-9 * sumOfSquares(samples));
    const { inBandEnergy, outOfBandEnergy } = result.bands[0];
    expect(
      Math.abs(inBandEnergy + outOfBandEnergy - result.totalEnergy),
    ).toBeLessThanOrEqual(1e-9 * result.totalEnergy);
  });

  it("uses bins at most 0.5 Hz wide at 22050, 44100, 48000 and 192000 Hz", () => {
    for (const sampleRateHz of [22050, 44100, 48000, 192000]) {
      const result = spectrumEnergies(new Float64Array(1000), sampleRateHz, []);
      expect(result.binWidthHz, `${sampleRateHz} Hz`).toBeLessThanOrEqual(
        soundRulesConfig.spectrumBinWidthMaxHz,
      );
      expect(result.binWidthHz).toBe(sampleRateHz / result.fftLength);
    }
  });

  it("pads to at least the buffer length", () => {
    const result = spectrumEnergies(new Float64Array(200000), 22050, []);
    expect(result.fftLength).toBe(262144);
  });

  it("counts a bin that lies exactly on a band edge as in band", () => {
    // At 22050 Hz the FFT has 65536 points. A cosine with exactly 1000 cycles in 65536 samples
    // puts all its energy into bin 1000.
    const sampleRateHz = 22050;
    const fftLength = 65536;
    const bin = 1000;
    const samples = Float64Array.from({ length: fftLength }, (_, n) =>
      Math.cos((2 * Math.PI * bin * n) / fftLength),
    );
    const binHz = (bin * sampleRateHz) / fftLength;
    const result = spectrumEnergies(samples, sampleRateHz, [
      { lowHz: binHz, highHz: binHz + 100 },
      { lowHz: binHz - 100, highHz: binHz },
      { lowHz: binHz + 1e-9, highHz: binHz + 100 },
    ]);
    expect(result.fftLength).toBe(fftLength);
    const [lowEdge, highEdge, justAbove] = result.bands;
    expect(lowEdge.inBandEnergy / result.totalEnergy).toBeGreaterThan(1 - 1e-9);
    expect(highEdge.inBandEnergy / result.totalEnergy).toBeGreaterThan(
      1 - 1e-9,
    );
    expect(justAbove.inBandEnergy / result.totalEnergy).toBeLessThan(1e-9);
  });

  it("finds a 500 Hz tone more than 99.9 percent in its band", () => {
    expect(inBandShare(fadedTone(500, 44100, 1, 0.1), 44100)).toBeGreaterThan(
      0.999,
    );
  });

  it("finds a 700 Hz tone less than 0.1 percent in the 500 Hz band", () => {
    expect(inBandShare(fadedTone(700, 44100, 1, 0.1), 44100)).toBeLessThan(
      0.001,
    );
  });

  it("does not modify its input", () => {
    const samples = fadedTone(500, 44100, 0.1, 0.02);
    const before = samples.slice();
    spectrumEnergies(samples, 44100, [band500]);
    expect(samples).toEqual(before);
  });
});

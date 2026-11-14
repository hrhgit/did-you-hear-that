import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../config/seeded-random";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { finishSound } from "./finish-sound";

const reference = soundRulesConfig.referenceRmsFraction;

function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function noise(length: number, seed: number): Float64Array {
  const random = createSeededRandom(seed);
  return Float64Array.from({ length }, () => 3 * (2 * random.next() - 1));
}

describe("finishSound", () => {
  it("makes the first and last samples exactly zero", () => {
    const finished = finishSound(new Float64Array(4410).fill(-0.7), 44100, 30);
    expect(Object.is(finished[0], 0)).toBe(true);
    expect(Object.is(finished[finished.length - 1], 0)).toBe(true);
  });

  it("scales to the reference RMS within 1e-6 dB", () => {
    for (const [length, seed] of [
      [44100, 1],
      [57600, 2],
      [1000, 3],
    ]) {
      const finished = finishSound(noise(length, seed), 48000, 50);
      expect(
        Math.abs(20 * Math.log10(rmsOf(finished) / reference)),
      ).toBeLessThan(1e-6);
    }
  });

  it("applies the raised-cosine outer fade without rounding its length", () => {
    const sampleRateHz = 44100;
    const finished = finishSound(
      new Float64Array(44100).fill(1),
      sampleRateHz,
      30,
    );
    const fadeSamples = (30 * sampleRateHz) / 1000;
    const middle = finished[22050];
    for (const n of [1, 100, 1000]) {
      const expected = (1 - Math.cos((Math.PI * n) / fadeSamples)) / 2;
      expect(finished[n] / middle).toBeCloseTo(expected, 6);
      expect(finished[44100 - 1 - n] / middle).toBeCloseTo(expected, 6);
    }
    expect(finished[1400]).toBe(middle);
  });

  it("returns a new Float32Array and leaves its input alone", () => {
    const input = noise(2000, 4);
    const before = input.slice();
    const finished = finishSound(input, 44100, 20);
    expect(finished).toBeInstanceOf(Float32Array);
    expect(finished).toHaveLength(2000);
    expect(input).toEqual(before);
    expect(finishSound(input, 44100, 20)).not.toBe(finished);
  });

  it("throws an Error for an all-zero input", () => {
    expect(() => finishSound(new Float64Array(1000), 44100, 30)).toThrow(Error);
    expect(() => finishSound(new Float64Array(0), 44100, 30)).toThrow(Error);
  });
});

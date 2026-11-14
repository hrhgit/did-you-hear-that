import { describe, expect, it } from "vitest";
import type { RandomSource } from "../../config/seeded-random";
import { createSeededRandom } from "../../config/seeded-random";
import { dftAnyLength } from "./dft-any-length";
import { shapedNoise } from "./shaped-noise";

const sampleRateHz = 48000;
const gainAtHz = (frequencyHz: number): number =>
  frequencyHz > 3000 && frequencyHz < 5000 ? 1 + frequencyHz / 10000 : 0.01;

function countingRandom(seed: number): {
  random: RandomSource;
  calls: () => number;
} {
  const inner = createSeededRandom(seed);
  let count = 0;
  return {
    random: {
      seed,
      next: () => {
        count += 1;
        return inner.next();
      },
    },
    calls: () => count,
  };
}

describe("shapedNoise", () => {
  it("returns equal samples for equal seeds and different samples for different seeds", () => {
    const first = shapedNoise(
      5000,
      sampleRateHz,
      gainAtHz,
      createSeededRandom(1),
    );
    const again = shapedNoise(
      5000,
      sampleRateHz,
      gainAtHz,
      createSeededRandom(1),
    );
    const other = shapedNoise(
      5000,
      sampleRateHz,
      gainAtHz,
      createSeededRandom(2),
    );
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("returns the requested number of samples", () => {
    for (const length of [1, 2, 4096, 5000, 5001]) {
      expect(
        shapedNoise(length, sampleRateHz, gainAtHz, createSeededRandom(1)),
      ).toHaveLength(length);
    }
    expect(
      shapedNoise(0, sampleRateHz, gainAtHz, createSeededRandom(1)),
    ).toHaveLength(0);
  });

  for (const length of [4096, 5000, 5001]) {
    it(`gives every bin of the transform of a ${length}-sample output exactly the gain as its magnitude (D11, D36)`, () => {
      const samples = shapedNoise(
        length,
        sampleRateHz,
        gainAtHz,
        createSeededRandom(5),
      );
      const real = samples.slice();
      const imag = new Float64Array(length);
      dftAnyLength(real, imag, "forward");
      for (let bin = 1; bin < length - bin; bin += 1) {
        const magnitude = Math.hypot(real[bin], imag[bin]);
        expect(
          Math.abs(magnitude - gainAtHz((bin * sampleRateHz) / length)),
        ).toBeLessThan(1e-9);
      }
      expect(Math.hypot(real[0], imag[0])).toBeLessThan(1e-9);
      if (length % 2 === 0) {
        expect(Math.hypot(real[length / 2], imag[length / 2])).toBeLessThan(
          1e-9,
        );
      }
    });
  }

  it("draws one phase per bin k with 1 <= k < M/2, whatever the gain", () => {
    for (const [length, expected] of [
      [5000, 2499],
      [5001, 2500],
      [8192, 4095],
    ]) {
      const { random, calls } = countingRandom(9);
      shapedNoise(length, sampleRateHz, () => 0, random);
      expect(calls()).toBe(expected);
    }
  });
});

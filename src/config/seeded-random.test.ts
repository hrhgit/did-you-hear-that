import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeededRandom } from "./seeded-random";

/** Draws `count` outputs and scales each back to the 32-bit integer sfc32 produced. */
function firstOutputsAsIntegers(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random.next() * 2 ** 32);
}

describe("createSeededRandom", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("known answers", () => {
    // Computed once from this implementation and checked against a separate trace of the
    // splitmix32 and sfc32 pseudo-code in design.md. A change here means the algorithm changed,
    // and every recorded seed in a regression test would replay differently.
    it("pins the first five outputs for seed 0", () => {
      expect(firstOutputsAsIntegers(0, 5)).toEqual([
        4205396811, 3543653536, 1222415357, 3047368389, 387095348,
      ]);
    });

    it("pins the first five outputs for seed 1", () => {
      expect(firstOutputsAsIntegers(1, 5)).toEqual([
        1828152527, 3394835397, 2967886022, 2251045104, 4148684523,
      ]);
    });
  });

  describe("seed validation", () => {
    it.each([
      ["-1", -1],
      ["2^32", 2 ** 32],
      ["0.5", 0.5],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
    ])("throws a RangeError naming the value for %s", (_label, seed) => {
      expect(() => createSeededRandom(seed)).toThrow(RangeError);
      expect(() => createSeededRandom(seed)).toThrow(
        `but got ${String(seed)}.`,
      );
    });

    it("accepts the smallest and the largest seed", () => {
      expect(() => createSeededRandom(0)).not.toThrow();
      expect(() => createSeededRandom(2 ** 32 - 1)).not.toThrow();
    });
  });

  it("reports the seed it was given", () => {
    expect(createSeededRandom(0).seed).toBe(0);
    expect(createSeededRandom(123456789).seed).toBe(123456789);
    expect(createSeededRandom(2 ** 32 - 1).seed).toBe(2 ** 32 - 1);
  });

  it("keeps the seed read-only", () => {
    const random = createSeededRandom(7);
    const writable = random as { seed: number };
    expect(() => {
      writable.seed = 8;
    }).toThrow(TypeError);
    expect(random.seed).toBe(7);
  });

  it("reads neither Math.random nor the clock", () => {
    const forbidden = (): never => {
      throw new Error("a seeded source must not read this");
    };
    vi.spyOn(Math, "random").mockImplementation(forbidden);
    vi.spyOn(Date, "now").mockImplementation(forbidden);
    vi.spyOn(performance, "now").mockImplementation(forbidden);

    const random = createSeededRandom(42);
    expect(() => {
      for (let index = 0; index < 100; index += 1) {
        random.next();
      }
    }).not.toThrow();
  });

  it("is roughly uniform over 100 000 draws", () => {
    const drawCount = 100_000;
    const binCount = 10;
    const expectedPerBin = drawCount / binCount;
    const bins = new Array<number>(binCount).fill(0);
    const random = createSeededRandom(20261113);
    let sum = 0;
    for (let index = 0; index < drawCount; index += 1) {
      const value = random.next();
      sum += value;
      bins[Math.floor(value * binCount)] += 1;
    }

    expect(Math.abs(sum / drawCount - 0.5)).toBeLessThanOrEqual(0.01);
    for (const count of bins) {
      expect(Math.abs(count - expectedPerBin)).toBeLessThanOrEqual(
        expectedPerBin * 0.05,
      );
    }
  });
});

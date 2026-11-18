import { describe, expect, it } from "vitest";
import { turnSeedOf } from "./turn-seed";

describe("turnSeedOf", () => {
  it("gives a whole number from 0 to 2³² − 1", () => {
    for (const seeds of [
      [],
      [0],
      [0xffffffff],
      [1, 2, 3],
      [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff],
    ]) {
      const seed = turnSeedOf(seeds);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("gives the same seed for the same engine seeds", () => {
    expect(turnSeedOf([12, 9000, 4_000_000_000])).toBe(
      turnSeedOf([12, 9000, 4_000_000_000]),
    );
  });

  it("is the 32-bit FNV-1a fold of the seeds' bytes, low byte first", () => {
    // No seed: the fold's first value.
    expect(turnSeedOf([])).toBe(0x811c9dc5);
    // The four bytes 0, 0, 0, 0.
    expect(turnSeedOf([0])).toBe(0x4b95f515);
  });

  it("changes with a seed, with the order and with the number of seeds", () => {
    const seeds = new Set([
      turnSeedOf([1, 2, 3]),
      turnSeedOf([1, 2, 4]),
      turnSeedOf([3, 2, 1]),
      turnSeedOf([1, 2]),
      turnSeedOf([1, 2, 3, 0]),
    ]);
    expect(seeds.size).toBe(5);
  });

  it("refuses a seed that is not a whole number from 0 to 2³² − 1", () => {
    for (const seed of [-1, 0.5, 0x100000000, Number.NaN, Infinity]) {
      expect(() => turnSeedOf([seed])).toThrow(RangeError);
    }
  });
});

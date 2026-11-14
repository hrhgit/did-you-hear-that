import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";

const largestSeed = 2 ** 32 - 1;
const anySeed = fc.integer({ min: 0, max: largestSeed });

/** Every number that is not an integer from 0 to 2^32 - 1. */
const invalidSeed = fc.oneof(
  // negative, down to -Infinity
  fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
  // too large, up to Infinity
  fc.double({ min: 2 ** 32, noNaN: true }),
  // fractional, inside the valid range
  fc
    .double({ min: 0, max: largestSeed, noNaN: true })
    .filter((value) => !Number.isInteger(value)),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

function draw(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random.next());
}

describe("createSeededRandom properties", () => {
  // Property 2 (R8.3, R8.5). The second source is created and drawn only after the first is
  // done, so any state shared between sources would make the sequences differ.
  it("returns the same sequence from two sources with the same seed", () => {
    fc.assert(
      fc.property(anySeed, fc.integer({ min: 1, max: 1000 }), (seed, count) => {
        const first = draw(seed, count);
        const second = draw(seed, count);
        expect(second).toEqual(first);
      }),
    );
  });

  // Property 3 (R8.2).
  it("returns only numbers in [0, 1)", () => {
    fc.assert(
      fc.property(anySeed, (seed) => {
        for (const value of draw(seed, 1000)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  // Property 4 (R8.4).
  it("throws a RangeError for every seed that is not an integer from 0 to 2^32 - 1", () => {
    fc.assert(
      fc.property(invalidSeed, (seed) => {
        expect(() => createSeededRandom(seed)).toThrow(RangeError);
      }),
    );
  });
});

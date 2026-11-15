import { describe, expect, it } from "vitest";
import { evenSelectionIndexes } from "./even-selection-indexes";

describe("evenSelectionIndexes", () => {
  it.each([
    [0, 2],
    [0, 20],
    [1, 20],
    [2, 2],
    [19, 20],
    [20, 20],
  ])("keeps every position of %i when the most count is %i", (count, max) => {
    expect(evenSelectionIndexes(count, max)).toEqual(
      Array.from({ length: count }, (_, index) => index),
    );
  });

  it("gives the 20 positions of the design's example of 56", () => {
    expect(evenSelectionIndexes(56, 20)).toEqual([
      0, 2, 5, 8, 11, 14, 17, 20, 23, 26, 28, 31, 34, 37, 40, 43, 46, 49, 52,
      55,
    ]);
  });

  it.each([
    [3, 2],
    [21, 20],
    [56, 20],
    [100, 7],
    [2000, 200],
  ])(
    "keeps exactly the most count, the first and the last, with gaps of floor or ceil of the step (%i of %i)",
    (count, max) => {
      const positions = evenSelectionIndexes(count, max);
      expect(positions).toHaveLength(max);
      expect(positions[0]).toBe(0);
      expect(positions.at(-1)).toBe(count - 1);
      const step = (count - 1) / (max - 1);
      for (let index = 1; index < positions.length; index += 1) {
        const gap = positions[index]! - positions[index - 1]!;
        expect([Math.floor(step), Math.ceil(step)]).toContain(gap);
        expect(gap).toBeGreaterThan(0);
      }
    },
  );

  it("gives a frozen result", () => {
    expect(Object.isFrozen(evenSelectionIndexes(5, 20))).toBe(true);
    expect(Object.isFrozen(evenSelectionIndexes(56, 20))).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws a RangeError for the count %s",
    (count) => {
      expect(() => evenSelectionIndexes(count, 20)).toThrow(RangeError);
    },
  );

  it.each([1, 0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws a RangeError for the most count %s",
    (max) => {
      expect(() => evenSelectionIndexes(10, max)).toThrow(RangeError);
    },
  );
});

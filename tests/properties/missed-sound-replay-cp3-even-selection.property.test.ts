import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evenSelectionIndexes } from "../../src/session/even-selection-indexes";

// CP3. The selection is evenly spread and the same every time (Universal; missed-sound-replay
// design.md, CP3; R5). For a count from 0 to 2000 and a most count from 2 to 200,
// `evenSelectionIndexes` gives every position when the count is at most the most count, and
// otherwise exactly the most count of positions, strictly increasing, from 0 to count − 1, with
// every gap `floor` or `ceil` of the step; two calls give equal arrays. Counts below 0 or not
// whole, and most counts below 2 or not whole, throw a `RangeError`. The 1000 runs are two
// properties of 1000 runs each: the positions, and the refused inputs.

/** Runs (design.md, "Run counts and time"). */
const runs = 1000;
const timeoutMs = 120_000;

const countMax = 2000;
const mostMin = 2;
const mostMax = 200;

describe("missed-sound replay CP3: the selection is evenly spread and the same every time", () => {
  it(
    "keeps every position, or exactly the most count evenly spread with the first and the last",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: countMax }),
          fc.integer({ min: mostMin, max: mostMax }),
          (count, most) => {
            const positions = evenSelectionIndexes(count, most);
            expect(evenSelectionIndexes(count, most)).toEqual(positions);
            if (count <= most) {
              expect(positions).toEqual(
                Array.from({ length: count }, (_, index) => index),
              );
              return;
            }
            expect(positions).toHaveLength(most);
            expect(positions[0]).toBe(0);
            expect(positions.at(-1)).toBe(count - 1);
            const step = (count - 1) / (most - 1);
            for (let index = 1; index < positions.length; index += 1) {
              const gap = positions[index]! - positions[index - 1]!;
              expect(gap).toBeGreaterThan(0);
              expect([Math.floor(step), Math.ceil(step)]).toContain(gap);
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "throws a RangeError for a count below 0 or not whole, and a most count below 2 or not whole",
    () => {
      const badCount = fc.oneof(
        fc.integer({ max: -1 }),
        fc.double({ noNaN: false }).filter((value) => !Number.isInteger(value)),
      );
      const badMost = fc.oneof(
        fc.integer({ max: mostMin - 1 }),
        fc.double({ noNaN: false }).filter((value) => !Number.isInteger(value)),
      );
      const goodCount = fc.integer({ min: 0, max: countMax });
      const goodMost = fc.integer({ min: mostMin, max: mostMax });
      fc.assert(
        fc.property(
          fc.oneof(
            fc.tuple(badCount, goodMost),
            fc.tuple(goodCount, badMost),
            fc.tuple(badCount, badMost),
          ),
          ([count, most]) => {
            expect(() => evenSelectionIndexes(count, most)).toThrow(RangeError);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

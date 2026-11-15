import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../config/seeded-random";
import { createSketchPen } from "./sketch-pen";

/** The numbers of one line's path data: start, control point and end. */
function numbersOf(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

describe("createSketchPen", () => {
  it("draws the same line for the same seed", () => {
    const first = createSketchPen(createSeededRandom(7)).line([0, 0], [200, 0]);
    expect(createSketchPen(createSeededRandom(7)).line([0, 0], [200, 0])).toBe(
      first,
    );
    expect(
      createSketchPen(createSeededRandom(8)).line([0, 0], [200, 0]),
    ).not.toBe(first);
  });

  it("runs a little past both ends of a line, and only a little", () => {
    const pen = createSketchPen(createSeededRandom(5));
    for (let count = 0; count < 200; count += 1) {
      const [startX, , , , endX] = numbersOf(pen.line([100, 50], [300, 50]));
      expect(startX).toBeLessThan(100);
      expect(startX).toBeGreaterThanOrEqual(94.9);
      expect(endX).toBeGreaterThan(300);
      expect(endX).toBeLessThanOrEqual(305.1);
    }
  });

  it("bows a line by less than two units", () => {
    const pen = createSketchPen(createSeededRandom(5));
    for (let count = 0; count < 200; count += 1) {
      const [, , , midY] = numbersOf(pen.line([100, 50], [300, 50]));
      expect(Math.abs((midY ?? 0) - 50)).toBeLessThan(2);
    }
  });

  it("draws nothing for a line with no length", () => {
    expect(createSketchPen(createSeededRandom(1)).line([4, 4], [4, 4])).toBe(
      "",
    );
  });

  it("draws one line for each side of a run and of a box", () => {
    const pen = createSketchPen(createSeededRandom(2));
    const count = (path: string): number => (path.match(/M/g) ?? []).length;
    expect(
      count(
        pen.through([
          [0, 0],
          [10, 0],
          [10, 10],
        ]),
      ),
    ).toBe(2);
    expect(count(pen.box(0, 0, 80, 40))).toBe(4);
  });
});

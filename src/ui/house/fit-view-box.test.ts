import { describe, expect, it } from "vitest";
import { fitViewBox } from "./fit-view-box";
import { houseViewBox } from "./house-geometry";

/** Where a point of the drawing lands in a box of pixels. */
function place(
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number] {
  const fit = fitViewBox(width, height);
  return [fit.offsetX + x * fit.scale, fit.offsetY + y * fit.scale];
}

const box = houseViewBox;
const centre = [box.x + box.width / 2, box.y + box.height / 2] as const;

describe("fitViewBox", () => {
  it("fills the height of a wide box and centres the drawing across it", () => {
    const fit = fitViewBox(3000, box.height * 2);
    expect(fit.scale).toBe(2);
    expect(place(3000, box.height * 2, box.x, box.y)[1]).toBeCloseTo(0, 9);
    expect(place(3000, box.height * 2, ...centre)[0]).toBeCloseTo(1500, 9);
  });

  it("fills the width of a tall box and centres the drawing down it", () => {
    const fit = fitViewBox(box.width / 2, 2000);
    expect(fit.scale).toBe(0.5);
    expect(place(box.width / 2, 2000, box.x, box.y)[0]).toBeCloseTo(0, 9);
    expect(place(box.width / 2, 2000, ...centre)[1]).toBeCloseTo(1000, 9);
  });

  it("puts the far corner of the view box at the far corner of a box of the same shape", () => {
    const [x, y] = place(
      box.width,
      box.height,
      box.x + box.width,
      box.y + box.height,
    );
    expect(x).toBeCloseTo(box.width, 9);
    expect(y).toBeCloseTo(box.height, 9);
  });

  it("gives a scale of 0 for a box with no area", () => {
    expect(fitViewBox(0, 500).scale).toBe(0);
    expect(fitViewBox(500, 0).scale).toBe(0);
    expect(fitViewBox(Number.NaN, 500).scale).toBe(0);
  });
});

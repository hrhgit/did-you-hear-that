import { describe, expect, it } from "vitest";
import {
  repeatCentreX,
  repeatCrossingLine,
  repeatEarLabelY,
  repeatEarpieceLabelYs,
  repeatEdgeX,
  repeatLightBox,
  repeatRunLabelYs,
  repeatStripBox,
  repeatStripHeight,
  repeatStripTops,
  repeatViewBox,
  repeatWingCentreX,
  repeatWingWidth,
} from "./repeat-geometry";

describe("the geometry of a swapped repeat's comparison", () => {
  it("keeps the room inside the drawing, with the lamp in the middle", () => {
    expect(repeatCentreX).toBe(repeatViewBox.width / 2);
    expect(repeatEdgeX("left", 1)).toBeGreaterThan(0);
    expect(repeatEdgeX("right", 1)).toBeLessThan(repeatViewBox.width);
    expect(repeatEdgeX("right", 1) - repeatEdgeX("left", 1)).toBe(
      2 * repeatWingWidth,
    );
  });

  it("starts the light at the middle and ends it at the end wall", () => {
    expect(repeatEdgeX("left", 0)).toBe(repeatCentreX);
    expect(repeatEdgeX("right", 0)).toBe(repeatCentreX);
    expect(repeatEdgeX("left", 0.25)).toBe(repeatCentreX - 40);
    expect(repeatEdgeX("right", 0.25)).toBe(repeatCentreX + 40);
  });

  it("mirrors the two wings", () => {
    for (const fraction of [0, 0.1, 0.5, 0.9, 1]) {
      expect(repeatCentreX - repeatEdgeX("left", fraction)).toBeCloseTo(
        repeatEdgeX("right", fraction) - repeatCentreX,
      );
    }
  });

  it("refuses a depth that is not a fraction", () => {
    for (const fraction of [-0.01, 1.01, Number.NaN, Infinity]) {
      expect(() => repeatEdgeX("left", fraction)).toThrow(RangeError);
    }
  });

  it("gives the light of a wing a box inside its strip", () => {
    for (const strip of [0, 1] as const) {
      const whole = repeatStripBox(strip);
      expect(whole.bottom - whole.top).toBe(repeatStripHeight);
      expect(whole.top).toBe(repeatStripTops[strip]);
      for (const side of ["left", "right"] as const) {
        const box = repeatLightBox(strip, side, 0.6);
        expect(box.left).toBeGreaterThanOrEqual(whole.left);
        expect(box.right).toBeLessThanOrEqual(whole.right);
        expect(box.right - box.left).toBeCloseTo(0.6 * repeatWingWidth);
        expect(box.top).toBe(whole.top);
        expect(box.bottom).toBe(whole.bottom);
      }
    }
  });

  it("puts the first run above the repeat, with room for the words", () => {
    const first = repeatStripBox(0);
    const second = repeatStripBox(1);
    expect(repeatEarLabelY).toBeLessThan(repeatRunLabelYs[0]);
    expect(repeatRunLabelYs[0]).toBeLessThan(first.top);
    expect(repeatEarpieceLabelYs[0]).toBeGreaterThan(first.bottom);
    expect(repeatEarpieceLabelYs[1]).toBeLessThan(second.top);
    expect(repeatRunLabelYs[1]).toBeGreaterThan(second.bottom);
    expect(repeatRunLabelYs[1]).toBeLessThan(repeatViewBox.height);
  });

  it("crosses the two earpiece lines between the labels", () => {
    const left = repeatCrossingLine("left");
    const right = repeatCrossingLine("right");
    // Each earpiece starts under its own ear and ends over the other one.
    expect(left[0][0]).toBe(repeatWingCentreX("left"));
    expect(left[1][0]).toBe(repeatWingCentreX("right"));
    expect(right[0][0]).toBe(repeatWingCentreX("right"));
    expect(right[1][0]).toBe(repeatWingCentreX("left"));
    for (const [from, to] of [left, right]) {
      expect(from[1]).toBeGreaterThan(repeatEarpieceLabelYs[0]);
      expect(to[1]).toBeLessThan(repeatEarpieceLabelYs[1] - 15);
      expect(from[1]).toBeLessThan(to[1]);
    }
  });
});

import { describe, expect, it } from "vitest";
import { ghostSoundIds } from "../../config/sound-id";
import {
  horizonY,
  jackFoot,
  jackSize,
  laneBox,
  reachOfDepth,
  resultViewBox,
  wingBox,
  wingEdgeX,
  wingLabelY,
  wingLightBox,
  wingWidth,
  yardCentreX,
} from "./result-geometry";

describe("the geometry of the result picture", () => {
  it("puts every candle in the middle of the yard", () => {
    expect(yardCentreX).toBe(resultViewBox.x + resultViewBox.width / 2);
    expect(wingWidth).toBe(168);
    for (const roomId of ghostSoundIds) {
      const lane = laneBox(roomId);
      expect(lane.left).toBe(yardCentreX - wingWidth);
      expect(lane.right).toBe(yardCentreX + wingWidth);
    }
  });

  it("starts the light at the candle and ends it at the end of the lane", () => {
    expect(wingEdgeX("left", 0)).toBe(yardCentreX);
    expect(wingEdgeX("right", 0)).toBe(yardCentreX);
    expect(wingEdgeX("left", 1)).toBe(yardCentreX - wingWidth);
    expect(wingEdgeX("right", 1)).toBe(yardCentreX + wingWidth);
    expect(wingEdgeX("left", 0.5)).toBe(yardCentreX - 84);
    expect(wingEdgeX("right", 0.5)).toBe(yardCentreX + 84);
  });

  it("gives the same reach to the same depth on both sides and in every lane", () => {
    for (const fraction of [0, 0.1, 0.37, 0.9, 1]) {
      for (const roomId of ghostSoundIds) {
        const left = wingLightBox(roomId, "left", fraction);
        const right = wingLightBox(roomId, "right", fraction);
        expect(left.right - left.left).toBeCloseTo(reachOfDepth(fraction));
        expect(right.right - right.left).toBeCloseTo(reachOfDepth(fraction));
        expect(left.right).toBe(yardCentreX);
        expect(right.left).toBe(yardCentreX);
      }
    }
  });

  it("makes a half lane's light as tall as its lane and never longer than the half", () => {
    for (const roomId of ghostSoundIds) {
      const lane = laneBox(roomId);
      for (const side of ["left", "right"] as const) {
        const whole = wingBox(roomId, side);
        expect(whole.top).toBe(lane.top);
        expect(whole.bottom).toBe(lane.bottom);
        const part = wingLightBox(roomId, side, 0.4);
        expect(part.left).toBeGreaterThanOrEqual(whole.left);
        expect(part.right).toBeLessThanOrEqual(whole.right);
      }
    }
  });

  it("puts the highest pitch at the top and keeps the lanes apart", () => {
    const fromTop = [...ghostSoundIds].reverse().map(laneBox);
    expect(fromTop[0]?.top ?? 0).toBeGreaterThan(horizonY);
    for (let index = 1; index < fromTop.length; index += 1) {
      expect(fromTop[index]?.top ?? 0).toBeGreaterThan(
        fromTop[index - 1]?.bottom ?? 0,
      );
    }
  });

  it("refuses a depth that is not a fraction", () => {
    for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => reachOfDepth(bad)).toThrow(RangeError);
      expect(() => wingEdgeX("left", bad)).toThrow(RangeError);
      expect(() => wingLightBox("attic", "right", bad)).toThrow(RangeError);
    }
  });

  it("seats Jack under the lowest lane and keeps everything inside the view box", () => {
    const lowest = laneBox(ghostSoundIds[0] ?? "cellar");
    expect(jackFoot[1] - jackSize).toBeGreaterThan(lowest.bottom);
    expect(jackFoot[1]).toBeLessThan(resultViewBox.y + resultViewBox.height);
    expect(wingLabelY).toBeGreaterThan(lowest.bottom);
    expect(wingLabelY).toBeLessThan(resultViewBox.y + resultViewBox.height);
    expect(yardCentreX - wingWidth).toBeGreaterThan(resultViewBox.x);
  });
});

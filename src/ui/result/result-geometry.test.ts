import { describe, expect, it } from "vitest";
import { ghostSoundIds } from "../../config/sound-id";
import {
  laneBox,
  reachOfDepth,
  tallLayout,
  wideLayout,
  wingBox,
  wingEdgeX,
  wingLightBox,
} from "./result-geometry";

describe.each([
  ["tall", tallLayout],
  ["wide", wideLayout],
] as const)("the geometry of the %s result picture", (_shape, layout) => {
  const { centreX, viewBox, wingWidth } = layout;

  it("puts every candle in the middle of the yard", () => {
    expect(centreX).toBe(viewBox.x + viewBox.width / 2);
    for (const roomId of ghostSoundIds) {
      const lane = laneBox(layout, roomId);
      expect(lane.left).toBe(centreX - wingWidth);
      expect(lane.right).toBe(centreX + wingWidth);
    }
  });

  it("starts the light at the candle and ends it at the end of the lane", () => {
    expect(wingEdgeX(layout, "left", 0)).toBe(centreX);
    expect(wingEdgeX(layout, "right", 0)).toBe(centreX);
    expect(wingEdgeX(layout, "left", 1)).toBe(centreX - wingWidth);
    expect(wingEdgeX(layout, "right", 1)).toBe(centreX + wingWidth);
    expect(wingEdgeX(layout, "left", 0.5)).toBe(centreX - wingWidth / 2);
    expect(wingEdgeX(layout, "right", 0.5)).toBe(centreX + wingWidth / 2);
  });

  it("gives the same reach to the same depth on both sides and in every lane", () => {
    for (const fraction of [0, 0.1, 0.37, 0.9, 1]) {
      for (const roomId of ghostSoundIds) {
        const left = wingLightBox(layout, roomId, "left", fraction);
        const right = wingLightBox(layout, roomId, "right", fraction);
        expect(left.right - left.left).toBeCloseTo(
          reachOfDepth(layout, fraction),
        );
        expect(right.right - right.left).toBeCloseTo(
          reachOfDepth(layout, fraction),
        );
        expect(left.right).toBe(centreX);
        expect(right.left).toBe(centreX);
      }
    }
  });

  it("makes a half lane's light as tall as its lane and never longer than the half", () => {
    for (const roomId of ghostSoundIds) {
      const lane = laneBox(layout, roomId);
      for (const side of ["left", "right"] as const) {
        const whole = wingBox(layout, roomId, side);
        expect(whole.top).toBe(lane.top);
        expect(whole.bottom).toBe(lane.bottom);
        const part = wingLightBox(layout, roomId, side, 0.4);
        expect(part.left).toBeGreaterThanOrEqual(whole.left);
        expect(part.right).toBeLessThanOrEqual(whole.right);
      }
    }
  });

  it("puts the highest pitch at the top and keeps the lanes apart, with room for each pitch's name", () => {
    const fromTop = [...ghostSoundIds]
      .reverse()
      .map((roomId) => laneBox(layout, roomId));
    expect(fromTop[0]?.top ?? 0).toBeGreaterThan(layout.horizonY);
    for (let index = 1; index < fromTop.length; index += 1) {
      expect(fromTop[index]?.top ?? 0).toBeGreaterThan(
        (fromTop[index - 1]?.bottom ?? 0) + 12,
      );
    }
  });

  it("keeps a creature no taller than its lane", () => {
    expect(layout.creatureSize).toBeLessThanOrEqual(layout.laneHeight);
  });

  it("refuses a depth that is not a fraction", () => {
    for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => reachOfDepth(layout, bad)).toThrow(RangeError);
      expect(() => wingEdgeX(layout, "left", bad)).toThrow(RangeError);
      expect(() => wingLightBox(layout, "attic", "right", bad)).toThrow(
        RangeError,
      );
    }
  });

  it("seats Jack under the lowest lane and keeps everything inside the view box", () => {
    const lowest = laneBox(layout, ghostSoundIds[0] ?? "cellar");
    expect(layout.jackFoot[1] - layout.jackSize).toBeGreaterThan(lowest.bottom);
    expect(layout.jackFoot[1]).toBeLessThan(viewBox.y + viewBox.height);
    expect(layout.wingLabelY).toBeGreaterThan(lowest.bottom);
    expect(layout.wingLabelY).toBeLessThan(viewBox.y + viewBox.height);
    expect(centreX - wingWidth).toBeGreaterThan(viewBox.x);
  });
});

describe("the two shapes of the result picture", () => {
  it("keeps the tall picture as it was and makes the lanes of the wide one longer", () => {
    expect(tallLayout.wingWidth).toBe(168);
    expect(wideLayout.viewBox.width).toBeGreaterThan(wideLayout.viewBox.height);
    expect(wideLayout.wingWidth).toBeGreaterThan(tallLayout.wingWidth * 2);
  });
});

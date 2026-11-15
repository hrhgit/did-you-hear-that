import { describe, expect, it } from "vitest";
import { ghostSoundIds } from "../../config/sound-id";
import { houseWalls, roomGeometry } from "../house/house-geometry";
import {
  atticTieBeamEnds,
  ceilingYAt,
  houseCentreX,
  reachOfDepth,
  resultLampOf,
  resultViewBox,
  wingBox,
  wingEdgeX,
  wingLabelY,
  wingLightBox,
  wingWidth,
} from "./result-geometry";

describe("the geometry of the result picture", () => {
  it("puts the middle of the house halfway between the inner faces of the walls", () => {
    expect(houseCentreX).toBe(360);
    expect(wingWidth).toBe(168);
    expect(houseCentreX - wingWidth).toBe(houseWalls.innerLeft);
    expect(houseCentreX + wingWidth).toBe(houseWalls.innerRight);
  });

  it("starts the light at the middle and ends it at the wall", () => {
    expect(wingEdgeX("left", 0)).toBe(houseCentreX);
    expect(wingEdgeX("right", 0)).toBe(houseCentreX);
    expect(wingEdgeX("left", 1)).toBe(houseWalls.innerLeft);
    expect(wingEdgeX("right", 1)).toBe(houseWalls.innerRight);
    expect(wingEdgeX("left", 0.5)).toBe(276);
    expect(wingEdgeX("right", 0.5)).toBe(444);
  });

  it("gives the same reach to the same depth on both sides and on every floor", () => {
    for (const fraction of [0, 0.1, 0.37, 0.9, 1]) {
      expect(houseCentreX - wingEdgeX("left", fraction)).toBeCloseTo(
        reachOfDepth(fraction),
      );
      expect(wingEdgeX("right", fraction) - houseCentreX).toBeCloseTo(
        reachOfDepth(fraction),
      );
      for (const roomId of ghostSoundIds) {
        const left = wingLightBox(roomId, "left", fraction);
        const right = wingLightBox(roomId, "right", fraction);
        expect(left.right - left.left).toBeCloseTo(right.right - right.left);
        expect(left.right).toBe(houseCentreX);
        expect(right.left).toBe(houseCentreX);
      }
    }
  });

  it("makes a wing's light as tall as its room and never wider than its wing", () => {
    for (const roomId of ghostSoundIds) {
      const room = roomGeometry[roomId];
      for (const side of ["left", "right"] as const) {
        const whole = wingBox(roomId, side);
        expect(whole.top).toBe(room.top);
        expect(whole.bottom).toBe(room.bottom);
        expect(whole.left).toBeGreaterThanOrEqual(room.left);
        expect(whole.right).toBeLessThanOrEqual(room.right);
        const part = wingLightBox(roomId, side, 0.4);
        expect(part.left).toBeGreaterThanOrEqual(whole.left);
        expect(part.right).toBeLessThanOrEqual(whole.right);
      }
    }
  });

  it("refuses a depth that is not a fraction", () => {
    for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => reachOfDepth(bad)).toThrow(RangeError);
      expect(() => wingEdgeX("left", bad)).toThrow(RangeError);
      expect(() => wingLightBox("attic", "right", bad)).toThrow(RangeError);
    }
  });

  it("follows the roof for the attic's ceiling and is flat everywhere else", () => {
    expect(ceilingYAt("attic", houseCentreX)).toBe(houseWalls.ridgeInner[1]);
    expect(ceilingYAt("attic", houseWalls.innerLeft)).toBe(
      houseWalls.roofMeetsWallY,
    );
    expect(ceilingYAt("attic", houseWalls.innerRight)).toBe(
      houseWalls.roofMeetsWallY,
    );
    expect(ceilingYAt("attic", 276)).toBeCloseTo(
      (houseWalls.ridgeInner[1] + houseWalls.roofMeetsWallY) / 2,
    );
    expect(ceilingYAt("stairs", 200)).toBe(roomGeometry.stairs.top);
  });

  it("hangs every lamp in the middle, inside its room", () => {
    for (const roomId of ghostSoundIds) {
      const lamp = resultLampOf(roomId);
      const room = roomGeometry[roomId];
      expect(lamp.anchor[0]).toBe(houseCentreX);
      expect(lamp.anchor[1]).toBeGreaterThanOrEqual(room.top);
      expect(lamp.anchor[1] + lamp.cordLength + 20).toBeLessThan(room.bottom);
    }
  });

  it("ends the attic's tie beam on the inner faces of the roof", () => {
    const [left, right] = atticTieBeamEnds();
    expect(left[1]).toBe(right[1]);
    expect(ceilingYAt("attic", left[0])).toBeCloseTo(left[1]);
    expect(ceilingYAt("attic", right[0])).toBeCloseTo(right[1]);
    expect(houseCentreX - left[0]).toBeCloseTo(right[0] - houseCentreX);
  });

  it("keeps the house, the room names and the wing labels inside the view box", () => {
    expect(resultViewBox.x).toBeLessThanOrEqual(houseWalls.eaveLeft[0]);
    expect(resultViewBox.x + resultViewBox.width).toBeGreaterThan(
      houseWalls.eaveRight[0],
    );
    expect(resultViewBox.y).toBeLessThan(houseWalls.ridge[1]);
    expect(wingLabelY).toBeGreaterThan(houseWalls.footingY);
    expect(wingLabelY).toBeLessThan(resultViewBox.y + resultViewBox.height);
  });
});

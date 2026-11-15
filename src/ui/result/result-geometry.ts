import type { GhostSoundId } from "../../config/sound-id";
import {
  atticTieBeamY,
  houseWalls,
  roomGeometry,
} from "../house/house-geometry";
import type { Point } from "../house/sketch-pen";

/**
 * Where the light of the result picture sits, in the units of the house's drawing. On the result
 * every room the visit entered has one lamp in the middle, and its light reaches into the left
 * wing and into the right wing as far as the picture model says. These numbers place lines on a
 * drawing. None of them affects sound, timing or scoring.
 */

/** The part of the drawing the result shows: the house, the room names and the wing labels. */
export const resultViewBox = Object.freeze({
  x: 136,
  y: 50,
  width: 564,
  height: 906,
});

/** The middle of the house, where the lamp of every room hangs on the result. */
export const houseCentreX = (houseWalls.innerLeft + houseWalls.innerRight) / 2;

/** The width of one wing: from the middle of the house to the inner face of a wall. */
export const wingWidth = houseWalls.innerRight - houseCentreX;

/** Where the words "Left" and "Right" stand under the house. */
export const wingLabelY = 938;

/** A box of the drawing. `left` is less than or equal to `right`. */
export interface DrawingBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function requireFraction(fraction: number): void {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError(
      `A depth must be a fraction from 0 to 1, but got ${String(fraction)}.`,
    );
  }
}

/** How far from the middle of the house a depth lies, in the units of the drawing. */
export function reachOfDepth(fraction: number): number {
  requireFraction(fraction);
  return fraction * wingWidth;
}

/**
 * The x at which a depth lies in a wing. The light starts at the middle of the house, so a depth
 * of 0 is the middle and a depth of 1 is the inner face of the wing's outer wall.
 */
export function wingEdgeX(side: "left" | "right", fraction: number): number {
  const reach = reachOfDepth(fraction);
  return side === "left" ? houseCentreX - reach : houseCentreX + reach;
}

/**
 * The box a wing's light fills for a depth: from the middle of the house to the depth, as tall as
 * the room. The attic's box is cut to the roof by the room's outline when it is drawn.
 */
export function wingLightBox(
  roomId: GhostSoundId,
  side: "left" | "right",
  fraction: number,
): DrawingBox {
  const room = roomGeometry[roomId];
  const edge = wingEdgeX(side, fraction);
  return {
    left: Math.min(houseCentreX, edge),
    right: Math.max(houseCentreX, edge),
    top: room.top,
    bottom: room.bottom,
  };
}

/** The whole of one wing of a room. */
export function wingBox(
  roomId: GhostSoundId,
  side: "left" | "right",
): DrawingBox {
  return wingLightBox(roomId, side, 1);
}

/**
 * The height of a room's ceiling at `x`. Every room has a flat ceiling but the attic, whose
 * ceiling is the inner face of the roof.
 */
export function ceilingYAt(roomId: GhostSoundId, x: number): number {
  const room = roomGeometry[roomId];
  if (roomId !== "attic") {
    return room.top;
  }
  const ridge = houseWalls.ridgeInner;
  const distance = Math.min(Math.abs(x - ridge[0]), wingWidth);
  return (
    ridge[1] + ((houseWalls.roofMeetsWallY - ridge[1]) * distance) / wingWidth
  );
}

/** Where the cord of a room's lamp meets the ceiling on the result, and how long the cord is. */
export function resultLampOf(roomId: GhostSoundId): {
  readonly anchor: Point;
  readonly cordLength: number;
} {
  // The attic lamp hangs from the tie beam, as it does during the visit.
  if (roomId === "attic") {
    return { anchor: [houseCentreX, atticTieBeamY], cordLength: 18 };
  }
  return { anchor: [houseCentreX, roomGeometry[roomId].top], cordLength: 26 };
}

/** The two ends of the attic's tie beam, where it meets the inner faces of the roof. */
export function atticTieBeamEnds(): readonly [Point, Point] {
  const ridge = houseWalls.ridgeInner;
  const reach =
    ((atticTieBeamY - ridge[1]) / (houseWalls.roofMeetsWallY - ridge[1])) *
    wingWidth;
  return [
    [houseCentreX - reach, atticTieBeamY],
    [houseCentreX + reach, atticTieBeamY],
  ];
}

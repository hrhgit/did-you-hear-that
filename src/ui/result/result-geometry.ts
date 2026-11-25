import { ghostSoundIds, type GhostSoundId } from "../../config/sound-id";
import type { Point } from "../house/sketch-pen";

/**
 * Where the result picture sits, in the units of its drawing. The picture is the moonlit yard of
 * the visit: one lane for each creature, the highest pitch at the top, and Jack at the foot. From
 * a candle in the middle of each lane, light reaches into the left half and into the right half
 * of the lane as far as the picture model says. These numbers place shapes on a drawing. None of
 * them affects sound, timing or scoring.
 */

/** The part of the drawing the result shows: the sky, the lanes, Jack and the side labels. */
export const resultViewBox = Object.freeze({
  x: 0,
  y: 0,
  width: 440,
  height: 760,
});

/** Where the sky meets the ground of the yard. */
export const horizonY = 98;

/** The middle of the yard, where every lane's candle burns and Jack sits. */
export const yardCentreX = resultViewBox.width / 2;

/** The length of one half of a lane: from its candle to its end. */
export const wingWidth = 168;

/** How tall a lane is. */
export const laneHeight = 80;

/** From the top of one lane to the top of the next. */
const lanePitch = 106;

/** The top of the highest lane. */
const firstLaneTop = 130;

/** Where Jack sits on the grass, under the lanes. */
export const jackFoot: Point = [yardCentreX, 736];

/** Jack's width, in the units of the drawing. */
export const jackSize = 60;

/** Where the words "Left" and "Right" stand, either side of Jack. */
export const wingLabelY = 730;

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

/** The whole of a creature's lane, both halves. The highest pitch is at the top. */
export function laneBox(roomId: GhostSoundId): DrawingBox {
  const fromTop = ghostSoundIds.length - 1 - ghostSoundIds.indexOf(roomId);
  const top = firstLaneTop + fromTop * lanePitch;
  return {
    left: yardCentreX - wingWidth,
    right: yardCentreX + wingWidth,
    top,
    bottom: top + laneHeight,
  };
}

/** How far from the middle of the yard a depth lies, in the units of the drawing. */
export function reachOfDepth(fraction: number): number {
  requireFraction(fraction);
  return fraction * wingWidth;
}

/**
 * The x at which a depth lies in one half of a lane. The light starts at the candle, so a depth
 * of 0 is the middle and a depth of 1 is the end of the lane.
 */
export function wingEdgeX(side: "left" | "right", fraction: number): number {
  const reach = reachOfDepth(fraction);
  return side === "left" ? yardCentreX - reach : yardCentreX + reach;
}

/** The box a half lane's light fills for a depth: from the candle to the depth, as tall as the lane. */
export function wingLightBox(
  roomId: GhostSoundId,
  side: "left" | "right",
  fraction: number,
): DrawingBox {
  const lane = laneBox(roomId);
  const edge = wingEdgeX(side, fraction);
  return {
    left: Math.min(yardCentreX, edge),
    right: Math.max(yardCentreX, edge),
    top: lane.top,
    bottom: lane.bottom,
  };
}

/** The whole of one half of a lane. */
export function wingBox(
  roomId: GhostSoundId,
  side: "left" | "right",
): DrawingBox {
  return wingLightBox(roomId, side, 1);
}

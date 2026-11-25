import { ghostSoundIds, type GhostSoundId } from "../../config/sound-id";
import type { Point } from "../house/sketch-pen";

/**
 * Where the result picture sits, in the units of its drawing. The picture is the moonlit yard of
 * the visit: one lane for each creature, the highest pitch at the top, and Jack at the foot. From
 * a candle in the middle of each lane, light reaches into the left half and into the right half
 * of the lane as far as the picture model says. These numbers place shapes on a drawing. None of
 * them affects sound, timing or scoring.
 *
 * The picture has two shapes. A phone shows it tall, as wide as the screen. A computer shows it
 * wide over the words, with long lanes, so the light on the left and on the right can be told
 * apart at a glance. Both keep every lane on its own and Jack at the foot.
 */

/** The two shapes of the picture. */
export type ResultShape = "tall" | "wide";

/** A box of the drawing. `left` is less than or equal to `right`. */
export interface DrawingBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Where everything of one shape of the picture sits. */
export interface ResultLayout {
  readonly shape: ResultShape;
  /** The part of the drawing the result shows: the sky, the lanes, Jack and the side labels. */
  readonly viewBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Where the sky meets the ground of the yard. */
  readonly horizonY: number;
  /** The middle of the yard, where every lane's candle burns and Jack sits. */
  readonly centreX: number;
  /** The length of one half of a lane: from its candle to its end. */
  readonly wingWidth: number;
  /** How tall a lane is. */
  readonly laneHeight: number;
  /** From the top of one lane to the top of the next. */
  readonly lanePitch: number;
  /** The top of the highest lane. */
  readonly firstLaneTop: number;
  /** Where Jack sits on the grass, under the lanes. */
  readonly jackFoot: Point;
  /** Jack's width, in the units of the drawing. */
  readonly jackSize: number;
  /** Where the words "Left" and "Right" stand, either side of Jack. */
  readonly wingLabelY: number;
  /** The side of the square a creature is drawn in. */
  readonly creatureSize: number;
}

/** The picture on a phone: as tall as the five lanes and Jack need, as wide as the screen. */
export const tallLayout: ResultLayout = Object.freeze({
  shape: "tall",
  viewBox: Object.freeze({ x: 0, y: 0, width: 440, height: 760 }),
  horizonY: 98,
  centreX: 220,
  wingWidth: 168,
  laneHeight: 80,
  lanePitch: 106,
  firstLaneTop: 130,
  jackFoot: [220, 736] as Point,
  jackSize: 60,
  wingLabelY: 730,
  creatureSize: 74,
});

/** The picture on a computer: wide and low, with long lanes, over the words of the page. */
export const wideLayout: ResultLayout = Object.freeze({
  shape: "wide",
  viewBox: Object.freeze({ x: 0, y: 0, width: 960, height: 600 }),
  horizonY: 90,
  centreX: 480,
  wingWidth: 400,
  laneHeight: 62,
  lanePitch: 82,
  firstLaneTop: 114,
  jackFoot: [480, 586] as Point,
  jackSize: 50,
  wingLabelY: 580,
  creatureSize: 58,
});

/** The layout of a shape. */
export function layoutOf(shape: ResultShape): ResultLayout {
  return shape === "wide" ? wideLayout : tallLayout;
}

function requireFraction(fraction: number): void {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new RangeError(
      `A depth must be a fraction from 0 to 1, but got ${String(fraction)}.`,
    );
  }
}

/** The whole of a creature's lane, both halves. The highest pitch is at the top. */
export function laneBox(
  layout: ResultLayout,
  roomId: GhostSoundId,
): DrawingBox {
  const fromTop = ghostSoundIds.length - 1 - ghostSoundIds.indexOf(roomId);
  const top = layout.firstLaneTop + fromTop * layout.lanePitch;
  return {
    left: layout.centreX - layout.wingWidth,
    right: layout.centreX + layout.wingWidth,
    top,
    bottom: top + layout.laneHeight,
  };
}

/** How far from the middle of the yard a depth lies, in the units of the drawing. */
export function reachOfDepth(layout: ResultLayout, fraction: number): number {
  requireFraction(fraction);
  return fraction * layout.wingWidth;
}

/**
 * The x at which a depth lies in one half of a lane. The light starts at the candle, so a depth
 * of 0 is the middle and a depth of 1 is the end of the lane.
 */
export function wingEdgeX(
  layout: ResultLayout,
  side: "left" | "right",
  fraction: number,
): number {
  const reach = reachOfDepth(layout, fraction);
  return side === "left" ? layout.centreX - reach : layout.centreX + reach;
}

/** The box a half lane's light fills for a depth: from the candle to the depth, as tall as the lane. */
export function wingLightBox(
  layout: ResultLayout,
  roomId: GhostSoundId,
  side: "left" | "right",
  fraction: number,
): DrawingBox {
  const lane = laneBox(layout, roomId);
  const edge = wingEdgeX(layout, side, fraction);
  return {
    left: Math.min(layout.centreX, edge),
    right: Math.max(layout.centreX, edge),
    top: lane.top,
    bottom: lane.bottom,
  };
}

/** The whole of one half of a lane. */
export function wingBox(
  layout: ResultLayout,
  roomId: GhostSoundId,
  side: "left" | "right",
): DrawingBox {
  return wingLightBox(layout, roomId, side, 1);
}

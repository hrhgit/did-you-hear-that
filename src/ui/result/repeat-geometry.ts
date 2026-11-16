import type { Point } from "../house/sketch-pen";

/**
 * Where the lines of a swapped repeat's comparison sit, in the units of its own small drawing.
 * The drawing shows one room twice, one strip above the other: the first run on top, the run with
 * the headphones swapped under it. In both strips the visitor's left ear is at the left. Between
 * the strips two lines cross: each joins the places one earpiece had in the two runs. These
 * numbers place lines on a drawing. None of them affects sound, timing or scoring.
 */

/** The part of the drawing that is shown. */
export const repeatViewBox = Object.freeze({ width: 340, height: 318 });

/** The middle of the room, where its lamp hangs in both strips. */
export const repeatCentreX = repeatViewBox.width / 2;

/** The width of one wing: from the middle of the room to its end wall. */
export const repeatWingWidth = 160;

/** The height of one strip. */
export const repeatStripHeight = 56;

/** The top of each strip: the first run, then the repeat. */
export const repeatStripTops: readonly [number, number] = Object.freeze([
  50, 232,
]);

/** The baseline of the words that name the two ears, above everything. */
export const repeatEarLabelY = 14;

/** The baseline of each run's label: above the first strip, under the second. */
export const repeatRunLabelYs: readonly [number, number] = Object.freeze([
  38, 308,
]);

/** The baseline of the earpiece labels: under the first strip, above the second. */
export const repeatEarpieceLabelYs: readonly [number, number] = Object.freeze([
  126, 222,
]);

/** A box of the drawing. `left` is less than or equal to `right`. */
export interface RepeatBox {
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

/** The x at which a depth lies in a wing: 0 is the middle of the room, 1 is its end wall. */
export function repeatEdgeX(side: "left" | "right", fraction: number): number {
  requireFraction(fraction);
  const reach = fraction * repeatWingWidth;
  return side === "left" ? repeatCentreX - reach : repeatCentreX + reach;
}

/** The middle of a wing, where its earpiece label stands. */
export function repeatWingCentreX(side: "left" | "right"): number {
  return repeatEdgeX(side, 0.5);
}

/** The box a wing's light fills for a depth in one of the two strips. */
export function repeatLightBox(
  strip: 0 | 1,
  side: "left" | "right",
  fraction: number,
): RepeatBox {
  const edge = repeatEdgeX(side, fraction);
  const top = repeatStripTops[strip];
  return {
    left: Math.min(repeatCentreX, edge),
    right: Math.max(repeatCentreX, edge),
    top,
    bottom: top + repeatStripHeight,
  };
}

/** The whole of one strip: the room from end wall to end wall. */
export function repeatStripBox(strip: 0 | 1): RepeatBox {
  const top = repeatStripTops[strip];
  return {
    left: repeatEdgeX("left", 1),
    right: repeatEdgeX("right", 1),
    top,
    bottom: top + repeatStripHeight,
  };
}

/** How far the crossing lines keep from the earpiece labels they join. */
const crossingGap = 9;

/**
 * The line of one earpiece between the strips. In the first run an earpiece is on the ear of its
 * own name. In the repeat it is on the other ear, so its line runs from one wing to the other.
 */
export function repeatCrossingLine(
  earpiece: "left" | "right",
): readonly [Point, Point] {
  const other = earpiece === "left" ? "right" : "left";
  return [
    [repeatWingCentreX(earpiece), repeatEarpieceLabelYs[0] + crossingGap],
    [repeatWingCentreX(other), repeatEarpieceLabelYs[1] - 15 - crossingGap],
  ];
}

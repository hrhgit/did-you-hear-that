import type { RandomSource } from "../../config/seeded-random";

/** A point of the drawing, in the units of the house's view box. */
export type Point = readonly [x: number, y: number];

/**
 * Draws straight lines the way a draughtsman's pencil does: each line runs a little past both
 * of its ends, so corners cross, and bows very slightly along its length. Every line is path
 * data for one SVG `path`.
 */
export interface SketchPen {
  /** One line from `from` to `to`. */
  line(from: Point, to: Point): string;
  /** A run of lines through the points, each drawn on its own so every corner crosses. */
  through(points: readonly Point[]): string;
  /** The four sides of a rectangle. */
  box(left: number, top: number, right: number, bottom: number): string;
}

const overshootMin = 1.5;
const overshootMax = 5;
const bowMax = 1.3;

function round(value: number): string {
  return value.toFixed(1);
}

/**
 * Creates a pen. The random source decides only how far each line overshoots and bows, so the
 * same seed always gives the same drawing.
 */
export function createSketchPen(random: RandomSource): SketchPen {
  const between = (min: number, max: number): number =>
    min + (max - min) * random.next();

  const line = (from: Point, to: Point): string => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return "";
    }
    const ux = dx / length;
    const uy = dy / length;
    // Short lines overshoot less, so small details keep their shape.
    const reach = Math.min(1, length / 60);
    const before = between(overshootMin, overshootMax) * reach;
    const after = between(overshootMin, overshootMax) * reach;
    const bow = between(-bowMax, bowMax) * Math.min(1, length / 120);
    const startX = from[0] - ux * before;
    const startY = from[1] - uy * before;
    const endX = to[0] + ux * after;
    const endY = to[1] + uy * after;
    const midX = (from[0] + to[0]) / 2 - uy * bow;
    const midY = (from[1] + to[1]) / 2 + ux * bow;
    return `M${round(startX)} ${round(startY)}Q${round(midX)} ${round(midY)} ${round(endX)} ${round(endY)}`;
  };

  const through = (points: readonly Point[]): string => {
    const parts: string[] = [];
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (from !== undefined && to !== undefined) {
        parts.push(line(from, to));
      }
    }
    return parts.join("");
  };

  const box = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): string =>
    through([
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
      [left, top],
    ]);

  return { line, through, box };
}

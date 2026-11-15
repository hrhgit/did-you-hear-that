import { houseViewBox } from "./house-geometry";

/**
 * How the drawing sits inside a box of pixels: one scale, and where the drawing's origin lands.
 * A point (x, y) of the drawing is at (offsetX + x * scale, offsetY + y * scale).
 */
export interface ViewBoxFit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Fits the house's view box into a box of `width` by `height` pixels the way the drawing itself
 * is fitted: as large as it can be with its proportions kept, and centred. A layer drawn with
 * this fit lines up with the drawing. A box with no area gives a scale of 0.
 */
export function fitViewBox(width: number, height: number): ViewBoxFit {
  if (!(width > 0) || !(height > 0)) {
    return { scale: 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(
    width / houseViewBox.width,
    height / houseViewBox.height,
  );
  return {
    scale,
    offsetX: (width - houseViewBox.width * scale) / 2 - houseViewBox.x * scale,
    offsetY:
      (height - houseViewBox.height * scale) / 2 - houseViewBox.y * scale,
  };
}

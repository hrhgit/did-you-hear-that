import yardUrl from "./art/yard.webp";
import { paintedArt } from "./painted-art";

/**
 * The painted night behind the yard (2026-11-24): sky, moon, hills, bare trees and gravestones in
 * one picture, made once and drawn under everything the game paints. Until it has loaded, and on a
 * page that cannot load it, the yard is painted by code as before.
 *
 * The picture's horizon lies at `horizonFraction` of its height, level across its width. It is
 * always drawn with that row on the yard's own horizon, so the ground Jack and the creatures stand
 * on never moves against it.
 */

/** Where the horizon lies in the picture, as a fraction of its height: row 796 of 1020. */
export const horizonFraction = 796 / 1020;

/** The colours along the picture's top and bottom edges, for the sky above it and the ground below. */
const topColour = "#0c061d";
const bottomColour = "#0b0416";

const art = paintedArt(yardUrl);

/** The picture once it has loaded, or null before then. */
export const yardBackdrop = art.image;

/** Loads the picture once for the page. Resolves to null if it cannot be loaded. */
export const loadYardBackdrop = art.load;

/**
 * Draws the picture over the box from (left, top), `width` by `height`, with its horizon on
 * `horizonY`, scaled to the width of the box so the moon and the trees at its sides stay in view.
 * Where the box reaches above or below the picture, it goes on in the colour of the picture's
 * edge: plain night sky above and plain dark ground below. With `skyOnly` it draws nothing below the
 * horizon, for a yard whose ground is far deeper than the picture's and is painted by code.
 */
export function paintYardBackdrop(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  left: number,
  top: number,
  width: number,
  height: number,
  horizonY: number,
  skyOnly = false,
): void {
  const imageWidth = image.naturalWidth;
  const imageHeight = image.naturalHeight;
  const scale = width / imageWidth;
  const drawnHeight = imageHeight * scale;
  const y = horizonY - imageHeight * horizonFraction * scale;
  const bottom = top + height;
  ctx.save();
  if (skyOnly) {
    ctx.beginPath();
    ctx.rect(left, top, width, horizonY - top);
    ctx.clip();
  }
  if (y > top) {
    ctx.fillStyle = topColour;
    ctx.fillRect(left, top, width, y - top + 1);
  }
  if (y + drawnHeight < bottom) {
    ctx.fillStyle = bottomColour;
    ctx.fillRect(
      left,
      y + drawnHeight - 1,
      width,
      bottom - y - drawnHeight + 1,
    );
  }
  ctx.drawImage(image, left, y, width, drawnHeight);
  ctx.restore();
}

import jackUrl from "./art/jack.webp";
import { paintedArt } from "./painted-art";

/**
 * Jack's painted body (2026-11-24): an uncarved pumpkin with its stem, cut out of a picture. His
 * carved face, his glow and his flame stay painted by code over it, because the face grins and
 * flinches with the game.
 */
const art = paintedArt(jackUrl);

/** The picture once it has loaded, or null before then. */
export const jackBody = art.image;

/** Loads the picture once for the page. Resolves to null if it cannot be loaded. */
export const loadJackBody = art.load;

/**
 * Where the picture lies in Jack's own units, about the middle of his foot: his body is 108 wide,
 * from x −54 to 54, and stands on y 0. The picture is 640 by 571 and its body fills its width, so
 * it reaches up to the tip of the stem at about y −96.
 */
const bodyWidth = 108;
const bodyHeight = (bodyWidth * 571) / 640;

/** Draws the body; `hurt` from 1 just after a bite down to 0 makes it flash pale. */
export function paintJackBody(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  hurt: number,
): void {
  ctx.drawImage(image, -bodyWidth / 2, -bodyHeight, bodyWidth, bodyHeight);
  if (hurt > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, hurt) * 0.35;
    ctx.drawImage(image, -bodyWidth / 2, -bodyHeight, bodyWidth, bodyHeight);
    ctx.restore();
  }
}

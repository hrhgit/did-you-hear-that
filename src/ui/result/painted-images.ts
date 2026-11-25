import type { GhostSoundId } from "../../config/sound-id";
import { canPaint } from "../room/creature-art";
import { paintCreature } from "../room/creature-paint";
import { paintJack } from "../room/night-paint";

/**
 * The creatures and Jack as the room paints them, turned into still images the result picture can
 * hold. The picture is one SVG, saved as it is, so it cannot carry a canvas: each painting is made
 * once, at rest, and kept as a data address. On a page that cannot paint (the tests) there is none.
 */

/** A painted image and where its anchor point lies in it, as parts of its width and height. */
export interface PaintedImage {
  readonly href: string;
  /** The image's height over its width. */
  readonly aspect: number;
  /** Where the anchor (a creature's feet, Jack's base) lies, from the left, as a part of the width. */
  readonly anchorX: number;
  /** Where the anchor lies, from the top, as a part of the height. */
  readonly anchorY: number;
}

const cache = new Map<string, PaintedImage | null>();

function paint(
  doc: Document,
  key: string,
  box: { left: number; top: number; right: number; bottom: number },
  pixelsPerUnit: number,
  painter: (ctx: CanvasRenderingContext2D) => void,
): PaintedImage | null {
  const kept = cache.get(key);
  if (kept !== undefined) {
    return kept;
  }
  let image: PaintedImage | null = null;
  if (canPaint(doc)) {
    const canvas = doc.createElement("canvas");
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    canvas.width = Math.round(width * pixelsPerUnit);
    canvas.height = Math.round(height * pixelsPerUnit);
    const ctx = canvas.getContext("2d");
    if (ctx !== null) {
      ctx.scale(pixelsPerUnit, pixelsPerUnit);
      ctx.translate(-box.left, -box.top);
      painter(ctx);
      image = {
        href: canvas.toDataURL("image/png"),
        aspect: height / width,
        anchorX: -box.left / width,
        anchorY: -box.top / height,
      };
    }
  }
  cache.set(key, image);
  return image;
}

/** A creature standing at rest, its feet at the anchor. Its drawings are about 112 units tall. */
export function paintedCreature(
  doc: Document,
  id: GhostSoundId,
): PaintedImage | null {
  return paint(
    doc,
    `creature:${id}`,
    { left: -60, top: -112, right: 60, bottom: 8 },
    3,
    (ctx) => {
      paintCreature(ctx, id, { t: 0.6, mood: "awake", stride: 0, menace: 0 });
    },
  );
}

/** Jack with his candle lit and his sweets at his feet, his base at the anchor. */
export function paintedJack(doc: Document): PaintedImage | null {
  return paint(
    doc,
    "jack",
    { left: -120, top: -200, right: 120, bottom: 40 },
    3,
    (ctx) => {
      paintJack(ctx, 100, {
        t: 0,
        flame: 1,
        hurt: 0,
        pulse: 0,
        candy: 7,
        joy: 0,
      });
    },
  );
}

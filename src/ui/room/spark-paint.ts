const glowBlurPx = 8;
const sizeStep = 0.5;
const sampleSizes = [1.5, 2, 2.5, 3, 3.5, 4, 4.5] as const;

type PaintSpark = (
  ctx: CanvasRenderingContext2D,
  hue: string,
  size: number,
) => void;

function drawGlowingSpark(
  ctx: CanvasRenderingContext2D,
  hue: string,
  size: number,
): void {
  const point = size * 2;
  const notch = size * 0.6 * Math.SQRT1_2;
  ctx.fillStyle = hue;
  ctx.shadowColor = hue;
  ctx.shadowBlur = glowBlurPx;
  ctx.beginPath();
  ctx.moveTo(point, 0);
  ctx.lineTo(notch, notch);
  ctx.lineTo(0, point);
  ctx.lineTo(-notch, notch);
  ctx.lineTo(-point, 0);
  ctx.lineTo(-notch, -notch);
  ctx.lineTo(0, -point);
  ctx.lineTo(notch, -notch);
  ctx.closePath();
  ctx.fill();
}

/** Bake the sparks' glow once per display scale, before a turn can need it. */
export function createSparkPainter(
  doc: Document,
  hues: readonly string[],
  pixelRatio: number,
): PaintSpark {
  const columns = new Map(hues.map((hue, index) => [hue, index]));
  const largestSize = sampleSizes[sampleSizes.length - 1];
  const halfTilePx = Math.ceil(largestSize * 2 * pixelRatio + glowBlurPx * 2);
  const tilePx = halfTilePx * 2;
  const atlas = doc.createElement("canvas");
  atlas.width = tilePx * hues.length;
  atlas.height = tilePx * sampleSizes.length;
  const mask = doc.createElement("canvas");
  mask.width = tilePx;
  mask.height = tilePx;
  const atlasContext = atlas.getContext("2d", { willReadFrequently: true });
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (atlasContext === null || maskContext === null) {
    return drawGlowingSpark;
  }

  for (const [row, size] of sampleSizes.entries()) {
    maskContext.resetTransform();
    maskContext.clearRect(0, 0, tilePx, tilePx);
    maskContext.setTransform(
      pixelRatio,
      0,
      0,
      pixelRatio,
      halfTilePx,
      halfTilePx,
    );
    drawGlowingSpark(maskContext, "#fff", size);

    for (const [hue, column] of columns) {
      const x = column * tilePx;
      const y = row * tilePx;
      // Tint the same glow for every hue. The clip keeps the tint inside this tile.
      atlasContext.save();
      atlasContext.beginPath();
      atlasContext.rect(x, y, tilePx, tilePx);
      atlasContext.clip();
      atlasContext.drawImage(mask, x, y);
      atlasContext.globalCompositeOperation = "source-in";
      atlasContext.fillStyle = hue;
      atlasContext.fillRect(x, y, tilePx, tilePx);
      atlasContext.restore();
    }
  }
  // Finish deferred canvas drawing here so the first hit only reads the sheet.
  atlasContext.getImageData(0, 0, 1, 1);

  return (ctx, hue, size) => {
    const column = columns.get(hue);
    if (column === undefined) {
      drawGlowingSpark(ctx, hue, size);
      return;
    }
    // A nearby sample keeps the glow at roughly the same width for every spark size.
    const row = Math.max(
      0,
      Math.min(
        sampleSizes.length - 1,
        Math.round((size - sampleSizes[0]) / sizeStep),
      ),
    );
    const side = (tilePx * size) / (sampleSizes[row] * pixelRatio);
    ctx.drawImage(
      atlas,
      column * tilePx,
      row * tilePx,
      tilePx,
      tilePx,
      -side / 2,
      -side / 2,
      side,
      side,
    );
  };
}

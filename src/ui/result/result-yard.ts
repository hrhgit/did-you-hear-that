import { canPaint } from "../room/creature-art";
import { horizonY, resultViewBox } from "./result-geometry";

/**
 * The yard behind the result picture: the same night as the room the visit was played in, so the
 * picture after the visit looks like the place the visitor just left. A canvas behind the drawing
 * paints the sky, the moon, the hills, a bare tree, gravestones and the grass the lanes lie on.
 * The drawing itself, with its lanes and Jack, stays as it is, and so does the saved picture.
 *
 * Everything is painted in the units of the drawing's view box, so the horizon meets the
 * drawing's own at every size of the page.
 */

type Ctx = CanvasRenderingContext2D;

const tau = Math.PI * 2;

/** Where the sky meets the grass, in the units of the drawing. */
const groundY = horizonY;

/** A repeatable scatter: the same yard every time the page is drawn. */
function scatter(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** The yard, painted in drawing units over the box from (left, top) to (right, bottom). */
function paintYard(
  ctx: Ctx,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const random = scatter(11);
  const width = right - left;

  const sky = ctx.createLinearGradient(0, top, 0, groundY);
  sky.addColorStop(0, "#090716");
  sky.addColorStop(0.45, "#1b1236");
  sky.addColorStop(0.85, "#3a1f45");
  sky.addColorStop(1, "#5a2a3e");
  ctx.fillStyle = sky;
  ctx.fillRect(left, top, width, groundY - top);

  // Stars, thinner towards the hills.
  for (let star = 0; star < 70; star += 1) {
    const x = left + random() * width;
    const y = top + random() ** 1.6 * (groundY - top) * 0.75;
    const r = random() * 1.3 + 0.4;
    ctx.fillStyle = `rgba(255, 248, 230, ${String(0.25 + random() * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, tau);
    ctx.fill();
  }

  // The moon, high at the right, with its halo and its seas.
  const moonX = 372;
  const moonY = 46;
  const moonR = 17;
  const halo = ctx.createRadialGradient(
    moonX,
    moonY,
    moonR * 0.8,
    moonX,
    moonY,
    moonR * 5,
  );
  halo.addColorStop(0, "rgba(255, 236, 190, 0.32)");
  halo.addColorStop(1, "rgba(255, 236, 190, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(moonX - moonR * 5, moonY - moonR * 5, moonR * 10, moonR * 10);
  const face = ctx.createRadialGradient(
    moonX - moonR * 0.3,
    moonY - moonR * 0.3,
    moonR * 0.1,
    moonX,
    moonY,
    moonR,
  );
  face.addColorStop(0, "#fff8e2");
  face.addColorStop(0.7, "#f1dfb0");
  face.addColorStop(1, "#d9bf86");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, tau);
  ctx.fill();
  ctx.fillStyle = "rgba(170, 140, 90, 0.28)";
  for (const [dx, dy, r] of [
    [-0.3, -0.1, 0.22],
    [0.25, 0.25, 0.16],
    [0.1, -0.4, 0.11],
    [-0.15, 0.4, 0.09],
  ] as const) {
    ctx.beginPath();
    ctx.arc(moonX + dx * moonR, moonY + dy * moonR, r * moonR, 0, tau);
    ctx.fill();
  }

  // Two rows of far hills along the horizon.
  const hills = (
    crest: number,
    colour: string,
    bumps: number,
    amp: number,
  ): void => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(left, groundY + 1);
    for (let i = 0; i <= bumps; i += 1) {
      const x = left + (i / bumps) * width;
      ctx.lineTo(x, crest + Math.sin(i * 1.7 + crest) * amp + random() * amp);
    }
    ctx.lineTo(right, groundY + 1);
    ctx.closePath();
    ctx.fill();
  };
  hills(groundY - 26, "#24163a", 7, 9);
  hills(groundY - 12, "#1a1029", 6, 6);

  // A bare tree on the horizon at the left.
  const tree = (x: number, scale: number, lean: number): void => {
    ctx.save();
    ctx.translate(x, groundY + 1);
    ctx.scale(scale, scale);
    ctx.rotate(lean);
    ctx.strokeStyle = "#0c0814";
    ctx.lineCap = "round";
    const branch = (length: number, widthNow: number, depth: number): void => {
      ctx.lineWidth = widthNow;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -length);
      ctx.stroke();
      if (depth === 0) {
        return;
      }
      ctx.save();
      ctx.translate(0, -length);
      for (const turn of [-0.55, 0.45]) {
        ctx.save();
        ctx.rotate(turn + lean * 0.2 + (random() - 0.5) * 0.3);
        branch(length * (0.62 + random() * 0.15), widthNow * 0.66, depth - 1);
        ctx.restore();
      }
      ctx.restore();
    };
    branch(30, 5, 5);
    ctx.restore();
  };
  tree(44, 1, -0.1);

  // The grass, from the horizon down past the last lane, darker towards the visitor.
  const ground = ctx.createLinearGradient(0, groundY, 0, bottom);
  ground.addColorStop(0, "#241a30");
  ground.addColorStop(0.5, "#15101d");
  ground.addColorStop(1, "#0a070e");
  ctx.fillStyle = ground;
  ctx.fillRect(left, groundY, width, bottom - groundY);

  // Gravestones along the horizon.
  const stone = (x: number, w: number, h: number, tilt: number): void => {
    ctx.save();
    ctx.translate(x, groundY + 3);
    ctx.rotate(tilt);
    const rock = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
    rock.addColorStop(0, "#5a5470");
    rock.addColorStop(1, "#24203a");
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h + w / 2);
    ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 16, 30, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.75);
    ctx.lineTo(0, -h * 0.4);
    ctx.moveTo(-w * 0.18, -h * 0.62);
    ctx.lineTo(w * 0.18, -h * 0.62);
    ctx.stroke();
    ctx.restore();
  };
  stone(318, 13, 19, 0.08);
  stone(342, 10, 14, -0.1);
  stone(104, 11, 16, -0.06);

  // Tufts of grass scattered over the yard, thicker near the horizon.
  ctx.strokeStyle = "rgba(90, 64, 108, 0.55)";
  ctx.lineWidth = 1.1;
  for (let blade = 0; blade < width / 2; blade += 1) {
    const x = left + random() * width;
    const y = groundY + 2 + random() ** 1.8 * (bottom - groundY);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 4, y - 2 - random() * 5);
    ctx.stroke();
  }

  // Low fog drifting over the grass.
  for (const [x, y, r] of [
    [60, groundY + 20, 120],
    [380, groundY + 40, 140],
    [120, 420, 160],
    [360, 560, 150],
    [220, 700, 200],
  ] as const) {
    const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
    fog.addColorStop(0, "rgba(170, 150, 200, 0.09)");
    fog.addColorStop(1, "rgba(170, 150, 200, 0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.35);
    ctx.translate(-x, -y);
    ctx.fillStyle = fog;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, tau);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Puts the yard behind the drawing in the frame, and paints it again whenever the frame changes
 * size. Returns the call that paints it again after the drawing is replaced. On a page that cannot
 * paint (the tests) it adds nothing.
 */
export function attachResultYard(
  doc: Document,
  frame: HTMLElement,
  drawing: HTMLElement,
): () => void {
  const view = doc.defaultView;
  if (!canPaint(doc) || view === null) {
    return () => undefined;
  }
  const canvas = doc.createElement("canvas");
  canvas.className = "result-yard";
  canvas.setAttribute("aria-hidden", "true");
  frame.prepend(canvas);
  frame.dataset.yard = "true";

  let lastGeometry: readonly number[] | null = null;
  const repaint = (): void => {
    const section = drawing.querySelector("svg");
    if (section === null) {
      return;
    }
    const ratio = Math.min(2, view.devicePixelRatio || 1);
    const frameBox = frame.getBoundingClientRect();
    const box = section.getBoundingClientRect();
    if (box.width === 0 || frameBox.width === 0) {
      return;
    }
    // The drawing keeps its proportions inside its box, centred ("xMidYMid meet").
    const scale = Math.min(
      box.width / resultViewBox.width,
      box.height / resultViewBox.height,
    );
    const offsetX =
      box.left - frameBox.left + (box.width - resultViewBox.width * scale) / 2;
    const offsetY =
      box.top - frameBox.top + (box.height - resultViewBox.height * scale) / 2;
    const geometry = [
      ratio,
      frameBox.width,
      frameBox.height,
      scale,
      offsetX,
      offsetY,
    ];
    // Replacing the drawing and observing its frame can both ask for the same yard.
    if (lastGeometry?.every((value, index) => value === geometry[index])) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    const width = Math.max(1, Math.round(frameBox.width * ratio));
    const height = Math.max(1, Math.round(frameBox.height * ratio));
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(
      ratio * scale,
      0,
      0,
      ratio * scale,
      ratio * (offsetX - resultViewBox.x * scale),
      ratio * (offsetY - resultViewBox.y * scale),
    );
    paintYard(
      ctx,
      resultViewBox.x - offsetX / scale,
      resultViewBox.y - offsetY / scale,
      resultViewBox.x + (frameBox.width - offsetX) / scale,
      resultViewBox.y + (frameBox.height - offsetY) / scale,
    );
    lastGeometry = geometry;
  };

  canvas.addEventListener("contextrestored", () => {
    lastGeometry = null;
    repaint();
  });
  if (typeof view.ResizeObserver === "function") {
    new view.ResizeObserver(() => {
      repaint();
    }).observe(frame);
  }
  return repaint;
}

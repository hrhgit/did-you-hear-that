import { canPaint } from "../room/creature-art";
import { paintJack } from "../room/night-paint";
import { resultViewBox } from "./result-geometry";

/**
 * The yard around the house on the result page: the same night as the room the visit was played
 * in, so the picture after the visit looks like the place the visitor just left. A canvas behind
 * the drawing paints the sky, the moon, the hills, the ground the house stands in, a gravestone
 * and Jack on the grass. The drawing itself stays as it is, and so does the saved picture.
 *
 * Everything is painted in the units of the drawing's view box, so the ground meets the house's
 * own ground line at every size of the page.
 */

type Ctx = CanvasRenderingContext2D;

const tau = Math.PI * 2;

/** Where the house meets the ground, in the units of the drawing. */
const groundY = 742;

/** The inside of the house, roof to cellar floor: painted dark so the lit rooms glow against it. */
const houseInside: readonly (readonly [number, number])[] = [
  [150, 232],
  [360, 78],
  [570, 232],
  [540, 236],
  [540, 902],
  [180, 902],
  [180, 236],
];

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

  // The moon, high at the right of the roof, with its halo and its seas.
  const moonX = 640;
  const moonY = 128;
  const moonR = 26;
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

  // Two rows of far hills behind the house.
  const hills = (
    crest: number,
    colour: string,
    bumps: number,
    amp: number,
  ): void => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(left, groundY);
    for (let i = 0; i <= bumps; i += 1) {
      const x = left + (i / bumps) * width;
      ctx.lineTo(x, crest + Math.sin(i * 1.7 + crest) * amp + random() * amp);
    }
    ctx.lineTo(right, groundY);
    ctx.closePath();
    ctx.fill();
  };
  hills(632, "#24163a", 7, 16);
  hills(684, "#1a1029", 6, 12);

  // A bare tree at the left, half behind the house.
  const tree = (x: number, scale: number, lean: number): void => {
    ctx.save();
    ctx.translate(x, groundY);
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
    branch(150, 14, 6);
    ctx.restore();
  };
  tree(162, 1, -0.14);

  // The ground, from the foot of the hills down past the cellar floor.
  const ground = ctx.createLinearGradient(0, groundY, 0, bottom);
  ground.addColorStop(0, "#1c1426");
  ground.addColorStop(1, "#08060c");
  ctx.fillStyle = ground;
  ctx.fillRect(left, groundY, width, bottom - groundY);

  // The inside of the house, so the lit rooms glow against a dark house and not the sky.
  ctx.fillStyle = "#110b1c";
  ctx.beginPath();
  houseInside.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  ctx.fill();

  // Warm light from the house on the grass at its foot.
  const pool = ctx.createRadialGradient(360, groundY, 0, 360, groundY, 260);
  pool.addColorStop(0, "rgba(255, 170, 80, 0.16)");
  pool.addColorStop(1, "rgba(255, 170, 80, 0)");
  ctx.fillStyle = pool;
  ctx.fillRect(100, groundY - 60, 520, 120);

  // A gravestone at the right of the house.
  const stone = (x: number, w: number, h: number, tilt: number): void => {
    ctx.save();
    ctx.translate(x, groundY + 2);
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.75);
    ctx.lineTo(0, -h * 0.4);
    ctx.moveTo(-w * 0.18, -h * 0.62);
    ctx.lineTo(w * 0.18, -h * 0.62);
    ctx.stroke();
    ctx.restore();
  };
  stone(600, 22, 32, 0.08);

  // Grass along the ground line, leaving the house's own walls clear.
  ctx.strokeStyle = "rgba(70, 48, 84, 0.7)";
  ctx.lineWidth = 1.2;
  for (let blade = 0; blade < width / 3; blade += 1) {
    const x = left + random() * width;
    if (x > 176 && x < 544) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x, groundY + 1);
    ctx.lineTo(x + (random() - 0.5) * 5, groundY - 3 - random() * 7);
    ctx.stroke();
  }

  // Low fog over the grass.
  for (const [x, y, r] of [
    [180, groundY + 6, 140],
    [520, groundY + 2, 160],
    [700, groundY + 10, 120],
  ] as const) {
    const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
    fog.addColorStop(0, "rgba(170, 150, 200, 0.13)");
    fog.addColorStop(1, "rgba(170, 150, 200, 0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.3);
    ctx.translate(-x, -y);
    ctx.fillStyle = fog;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, tau);
    ctx.fill();
    ctx.restore();
  }

  // Jack on the grass at the right, his candle lit: the house waits for the next visit.
  const jackGlow = ctx.createRadialGradient(
    664,
    groundY - 14,
    0,
    664,
    groundY - 14,
    60,
  );
  jackGlow.addColorStop(0, "rgba(255, 150, 50, 0.28)");
  jackGlow.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = jackGlow;
  ctx.fillRect(604, groundY - 74, 120, 120);
  ctx.save();
  ctx.translate(666, groundY + 2);
  paintJack(ctx, 46, { t: 0, flame: 1, hurt: 0, pulse: 0, candy: 7, joy: 0 });
  ctx.restore();
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

  const repaint = (): void => {
    const section = drawing.querySelector("svg");
    const ctx = canvas.getContext("2d");
    if (section === null || ctx === null) {
      return;
    }
    const ratio = Math.min(2, view.devicePixelRatio || 1);
    const frameBox = frame.getBoundingClientRect();
    const box = section.getBoundingClientRect();
    if (box.width === 0 || frameBox.width === 0) {
      return;
    }
    const width = Math.max(1, Math.round(frameBox.width * ratio));
    const height = Math.max(1, Math.round(frameBox.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
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
  };

  if (typeof view.ResizeObserver === "function") {
    new view.ResizeObserver(() => {
      repaint();
    }).observe(frame);
  }
  return repaint;
}

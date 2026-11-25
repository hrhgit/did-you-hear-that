/**
 * The yard of the one room on a canvas (the rhythm game, 2026-11-18): a moonlit sky, the hill and
 * its gravestones, drifting fog, and Jack, the jack-o'-lantern in the middle, with the candle the
 * creatures come to snuff and the candy they come to take.
 */

import { jackBody, paintJackBody } from "./jack-body";

type Ctx = CanvasRenderingContext2D;

const tau = Math.PI * 2;

/** A repeatable scatter: the same yard every time the page is drawn. */
function scatter(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Where the ground meets the hill, as a fraction of the height. */
export const groundFraction = 0.78;

/** The part of the yard that never moves. Painted once for each size of the canvas. */
export function paintYard(ctx: Ctx, width: number, height: number): void {
  const random = scatter(7);
  const groundY = height * groundFraction;
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, "#090716");
  sky.addColorStop(0.45, "#1b1236");
  sky.addColorStop(0.85, "#3a1f45");
  sky.addColorStop(1, "#5a2a3e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Stars.
  for (let star = 0; star < Math.round((width * height) / 9000); star += 1) {
    const x = random() * width;
    const y = random() * groundY * 0.7;
    const r = random() * 1.1 + 0.25;
    ctx.fillStyle = `rgba(255, 248, 230, ${String(0.25 + random() * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, tau);
    ctx.fill();
  }

  // The moon, with its halo and its seas.
  const moonR = Math.min(width, height) * 0.085;
  // Low at the left, clear of the words that stand in the middle of the sky.
  const moonX = width * 0.14;
  const moonY = height * 0.32;
  const halo = ctx.createRadialGradient(
    moonX,
    moonY,
    moonR * 0.8,
    moonX,
    moonY,
    moonR * 4.5,
  );
  halo.addColorStop(0, "rgba(255, 236, 190, 0.35)");
  halo.addColorStop(1, "rgba(255, 236, 190, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
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

  // Far hills.
  const hills = (
    top: number,
    colour: string,
    bumps: number,
    amp: number,
  ): void => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let i = 0; i <= bumps; i += 1) {
      const x = (i / bumps) * width;
      ctx.lineTo(x, top + Math.sin(i * 1.7 + top) * amp + random() * amp * 0.4);
    }
    ctx.lineTo(width, groundY);
    ctx.closePath();
    ctx.fill();
  };
  hills(height * 0.6, "#24163a", 9, height * 0.03);
  hills(height * 0.68, "#1a1029", 7, height * 0.025);

  // Bare trees at the edges.
  const tree = (x: number, scale: number, lean: number): void => {
    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#0c0814";
    ctx.lineCap = "round";
    const branch = (
      length: number,
      angle: number,
      widthNow: number,
      depth: number,
    ): void => {
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
        ctx.rotate(turn + angle * 0.2 + (random() - 0.5) * 0.3);
        branch(
          length * (0.62 + random() * 0.15),
          angle,
          widthNow * 0.66,
          depth - 1,
        );
        ctx.restore();
      }
      ctx.restore();
    };
    ctx.rotate(lean);
    branch(90, lean, 12, 6);
    ctx.restore();
  };
  const treeScale = Math.min(height / 520, width / 700);
  tree(width * 0.05, treeScale * 1.25, 0.12);
  tree(width * 0.95, treeScale * 1.1, -0.1);

  // Gravestones and a fence on the hill.
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
    ctx.lineWidth = Math.max(1, w * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.75);
    ctx.lineTo(0, -h * 0.4);
    ctx.moveTo(-w * 0.18, -h * 0.62);
    ctx.lineTo(w * 0.18, -h * 0.62);
    ctx.stroke();
    ctx.restore();
  };
  const unit = Math.min(height, width * 1.1) / 100;
  stone(width * 0.18, unit * 5, unit * 7, -0.08);
  stone(width * 0.27, unit * 4, unit * 5.5, 0.06);
  stone(width * 0.72, unit * 4.5, unit * 6.5, 0.1);
  stone(width * 0.83, unit * 5.5, unit * 7.5, -0.05);
  ctx.strokeStyle = "#120c1e";
  ctx.lineWidth = Math.max(1, unit * 0.5);
  for (let post = 0; post < 14; post += 1) {
    const x = width * (0.34 + post * 0.024);
    if (x > width * 0.43 && x < width * 0.57) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, groundY - unit * 4);
    ctx.lineTo(x + unit * 0.4, groundY - unit * 4.8);
    ctx.stroke();
  }

  // The ground.
  const ground = ctx.createLinearGradient(0, groundY, 0, height);
  ground.addColorStop(0, "#1c1426");
  ground.addColorStop(1, "#08060c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, groundY, width, height - groundY);
  ctx.strokeStyle = "rgba(60, 40, 70, 0.5)";
  ctx.lineWidth = 1;
  for (let blade = 0; blade < width / 6; blade += 1) {
    const x = random() * width;
    ctx.beginPath();
    ctx.moveTo(x, groundY + 1);
    ctx.lineTo(x + (random() - 0.5) * 4, groundY - 2 - random() * unit * 1.2);
    ctx.stroke();
  }
}

/** Banks of fog that drift across the foot of the yard, and light from Jack on the ground. */
export function paintFog(
  ctx: Ctx,
  width: number,
  height: number,
  t: number,
  glow: number,
): void {
  const groundY = height * groundFraction;
  const pool = ctx.createRadialGradient(
    width / 2,
    groundY,
    0,
    width / 2,
    groundY,
    width * 0.3,
  );
  pool.addColorStop(0, `rgba(255, 150, 50, ${String(0.28 * glow)})`);
  pool.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = pool;
  // The whole circle of the light, so no edge of it shows as a line on the night.
  const poolR = width * 0.3;
  ctx.fillRect(width / 2 - poolR, groundY - poolR, poolR * 2, poolR * 2);
  for (let bank = 0; bank < 6; bank += 1) {
    const speed = 0.012 + bank * 0.004;
    const x = ((t * speed + bank * 0.21) % 1.4) * width * 1.2 - width * 0.3;
    const y = groundY - height * 0.02 + (bank % 3) * height * 0.04;
    const r = width * (0.16 + (bank % 2) * 0.06);
    const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
    fog.addColorStop(0, "rgba(170, 150, 200, 0.14)");
    fog.addColorStop(1, "rgba(170, 150, 200, 0)");
    ctx.fillStyle = fog;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.32);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, tau);
    ctx.fill();
    ctx.restore();
  }
}

/** How Jack looks this moment. */
export interface JackPose {
  readonly t: number;
  /** Jack's flame, from 0 (out) to 1 (full). */
  readonly flame: number;
  /** From 1 just after a creature bit him down to 0. */
  readonly hurt: number;
  /** From 1 on a beat down to 0. He swells a little with the beat. */
  readonly pulse: number;
  /** How many sweets are left in the pile, from 0 to 7. */
  readonly candy: number;
  /** From 1 just after a catch down to 0: he grins wider. */
  readonly joy: number;
}

const candyColours = [
  "#ff4a7a",
  "#4ad0ff",
  "#ffd23a",
  "#8cff6a",
  "#c78aff",
  "#ff8a3a",
  "#ffffff",
];

/** One wrapped sweet, about its middle. */
export function paintSweet(ctx: Ctx, index: number, size: number): void {
  const colour = candyColours[index % candyColours.length] ?? "#ff4a7a";
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(-size * 1.6, -size * 0.6);
  ctx.lineTo(-size * 0.8, 0);
  ctx.lineTo(-size * 1.6, size * 0.6);
  ctx.closePath();
  ctx.moveTo(size * 1.6, -size * 0.6);
  ctx.lineTo(size * 0.8, 0);
  ctx.lineTo(size * 1.6, size * 0.6);
  ctx.closePath();
  ctx.fill();
  const shine = ctx.createRadialGradient(
    -size * 0.3,
    -size * 0.3,
    0,
    0,
    0,
    size,
  );
  shine.addColorStop(0, "#ffffff");
  shine.addColorStop(0.3, colour);
  shine.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, tau);
  ctx.fill();
}

/** Jack's body as code paints it, until the painted one has loaded. */
function paintCodeBody(ctx: Ctx, hurt: number): void {
  const ribs: readonly (readonly [number, number, number])[] = [
    [-30, 22, 38],
    [30, 22, 38],
    [-16, 26, 41],
    [16, 26, 41],
    [0, 24, 42],
  ];
  for (const [x, rx, ry] of ribs) {
    const skin = ctx.createRadialGradient(
      x * 0.6 - 8,
      -56,
      4,
      x,
      -40,
      ry * 1.2,
    );
    skin.addColorStop(0, hurt > 0.4 ? "#ffb08a" : "#ffad3a");
    skin.addColorStop(0.55, "#ef7a12");
    skin.addColorStop(1, "#8a3404");
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(x, -40, rx, ry, 0, 0, tau);
    ctx.fill();
    ctx.strokeStyle = "rgba(110, 40, 0, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // Stem and leaf.
  ctx.fillStyle = "#4a5a1a";
  ctx.beginPath();
  ctx.moveTo(-5, -78);
  ctx.quadraticCurveTo(-6, -92, 3, -98);
  ctx.lineTo(7, -95);
  ctx.quadraticCurveTo(2, -88, 5, -78);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5f7a22";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -82);
  ctx.bezierCurveTo(16, -92, 24, -84, 18, -78);
  ctx.stroke();
}

/**
 * Jack about the middle of his foot, `size` pixels tall. His carved face glows with the candle
 * inside, as bright as his flame, and flickers.
 */
export function paintJack(ctx: Ctx, size: number, pose: JackPose): void {
  const { t, flame, hurt, pulse, joy } = pose;
  const s = size / 100;
  ctx.save();
  ctx.scale(s, s);
  // The pile of candy at his feet.
  const pile: readonly (readonly [number, number])[] = [
    [-46, -3],
    [-36, -2],
    [40, -3],
    [50, -2],
    [-42, -10],
    [45, -10],
    [31, -4],
  ];
  pile.slice(0, pose.candy).forEach(([x, y], index) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(index * 0.7);
    paintSweet(ctx, index, 4.2);
    ctx.restore();
  });
  const shake = hurt > 0 ? Math.sin(t * 70) * hurt * 5 : 0;
  ctx.translate(shake, 0);
  const swell = 1 + pulse * 0.035 + joy * 0.03;
  ctx.scale(swell, 2 - swell);
  const flicker = 0.82 + Math.sin(t * 13) * 0.06 + Math.sin(t * 31 + 1) * 0.05;
  const light = Math.max(0, Math.min(1, flame)) * flicker;

  // His glow on the night.
  const aura = ctx.createRadialGradient(0, -42, 10, 0, -42, 120);
  aura.addColorStop(0, `rgba(255, 150, 40, ${String(0.45 * light)})`);
  aura.addColorStop(1, "rgba(255, 120, 30, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(-120, -162, 240, 240);

  // His body: the painted pumpkin once it has loaded; until then ribbed, lit from inside.
  const painted = jackBody();
  if (painted !== null) {
    paintJackBody(ctx, painted, hurt);
  } else {
    paintCodeBody(ctx, hurt);
  }

  // The carved face, glowing as bright as the flame.
  const carved = ctx.createRadialGradient(0, -40, 2, 0, -40, 40);
  carved.addColorStop(0, `rgba(255, 250, 200, ${String(0.25 + light * 0.75)})`);
  carved.addColorStop(
    0.5,
    `rgba(255, 200, 60, ${String(0.15 + light * 0.85)})`,
  );
  carved.addColorStop(1, `rgba(200, 80, 10, ${String(0.2 + light * 0.6)})`);
  // Eyes: triangles that squint with joy and widen in fright.
  const squint = joy * 5 - hurt * 4;
  const grin = 1 + joy * 0.25 - hurt * 0.35;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 9, -48 + squint * 0.4);
    ctx.lineTo(side * 25, -48 + squint * 0.4);
    ctx.lineTo(side * 17, -64 + squint);
    ctx.closePath();
  }
  ctx.moveTo(-4, -36);
  ctx.lineTo(4, -36);
  ctx.lineTo(0, -43);
  ctx.closePath();
  // The grin, with its teeth.
  ctx.moveTo(-30, -28);
  ctx.quadraticCurveTo(0, -6 * grin - 8, 30, -28);
  ctx.quadraticCurveTo(22, -14 * grin, 13, -16);
  ctx.lineTo(9, -10 * grin - 6);
  ctx.lineTo(4, -17);
  ctx.quadraticCurveTo(0, -12 * grin - 4, -4, -17);
  ctx.lineTo(-9, -10 * grin - 6);
  ctx.lineTo(-13, -16);
  ctx.quadraticCurveTo(-22, -14 * grin, -30, -28);
  ctx.closePath();
  // The hollow inside and the cut edge of the rind, then the light of the candle in it.
  ctx.fillStyle = "#2a1206";
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 32, 4, 0.9)";
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.stroke();
  if (light >= 0.05) {
    ctx.save();
    ctx.shadowColor = `rgba(255, 190, 60, ${String(light)})`;
    ctx.shadowBlur = 18 * light;
    ctx.fillStyle = carved;
    ctx.fill();
    ctx.restore();
  }

  // The candle's flame, which shows through the top of his head.
  if (flame > 0.02) {
    const height = 8 + flame * 14 + Math.sin(t * 17) * 1.5;
    const sway = Math.sin(t * 5.3) * 2;
    ctx.save();
    ctx.translate(0, -76);
    ctx.globalCompositeOperation = "lighter";
    const fire = ctx.createRadialGradient(
      0,
      -height * 0.4,
      0,
      0,
      -height * 0.4,
      height,
    );
    fire.addColorStop(0, "rgba(255, 255, 220, 0.95)");
    fire.addColorStop(0.4, "rgba(255, 190, 60, 0.75)");
    fire.addColorStop(1, "rgba(255, 90, 20, 0)");
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(-6, -height * 0.6, sway, -height);
    ctx.quadraticCurveTo(6, -height * 0.6, 5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

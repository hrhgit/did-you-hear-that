import type { GhostSoundId } from "../../config/sound-id";

/**
 * The creatures of the house, painted on a canvas (the rhythm game, 2026-11-18): Thump the
 * skeleton, Murmur the ghost, Tink the black cat with her bell, Scritch the spider and Squeak the
 * bat. Each is painted about its feet: x from −50 to 50, y from −100 (the top) to 0 (the floor),
 * so a caller only moves, scales and turns the canvas. `t` is the time in seconds; every limb
 * moves with it, so painting each frame makes the creature breathe, blink and walk.
 */
export interface CreaturePose {
  /** Seconds, for every movement that keeps its own time. */
  readonly t: number;
  /** `awake` as it stands, `asleep` with its eyes shut, `hurt` while it is kicked or bites. */
  readonly mood: "awake" | "asleep" | "hurt";
  /** From 0 (still) to 1: how fast it walks, which swings legs and wings harder. */
  readonly stride: number;
  /** From 0 to 1: how much its jaw opens, its claws reach or its back arches, to bite. */
  readonly menace: number;
}

type Ctx = CanvasRenderingContext2D;

const tau = Math.PI * 2;

/** A smooth wave from −1 to 1, `speed` times a second, offset by `phase` turns. */
const wave = (t: number, speed: number, phase = 0): number =>
  Math.sin((t * speed + phase) * tau);

/** Whether the eyes are shut this moment: a quick blink every few seconds, never in step. */
function blinking(t: number, seed: number): boolean {
  const period = 3.1 + seed * 0.7;
  return (t + seed * 1.3) % period < 0.12;
}

function softShadow(ctx: Ctx, width: number): void {
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, width);
  shade.addColorStop(0, "rgba(0, 0, 0, 0.45)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.save();
  ctx.scale(1, 0.22);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, width, 0, tau);
  ctx.fill();
  ctx.restore();
}

/** Two glowing eyes. `shape` 0 is round, 1 a slit for the cat. */
function glowEyes(
  ctx: Ctx,
  pose: CreaturePose,
  seed: number,
  eyes: readonly (readonly [number, number])[],
  radius: number,
  colour: string,
  shape: "round" | "slit" = "round",
): void {
  const shut = pose.mood === "asleep" || blinking(pose.t, seed);
  for (const [x, y] of eyes) {
    if (shut) {
      ctx.strokeStyle = "rgba(20, 10, 10, 0.85)";
      ctx.lineWidth = radius * 0.45;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - radius, y);
      ctx.quadraticCurveTo(x, y + radius * 0.6, x + radius, y);
      ctx.stroke();
      continue;
    }
    ctx.save();
    ctx.shadowColor = colour;
    ctx.shadowBlur = radius * 3;
    const glow = ctx.createRadialGradient(x, y - radius * 0.3, 0, x, y, radius);
    glow.addColorStop(0, "#fffbe6");
    glow.addColorStop(0.35, colour);
    glow.addColorStop(1, "rgba(0, 0, 0, 0.6)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      radius,
      radius * (shape === "slit" ? 1.15 : 1),
      0,
      0,
      tau,
    );
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#120707";
    ctx.beginPath();
    if (shape === "slit") {
      ctx.ellipse(x, y, radius * 0.22, radius * 0.9, 0, 0, tau);
    } else {
      ctx.arc(x + radius * 0.15, y + radius * 0.1, radius * 0.42, 0, tau);
    }
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x - radius * 0.35, y - radius * 0.4, radius * 0.2, 0, tau);
    ctx.fill();
  }
}

// ─── Thump, the skeleton ─────────────────────────────────────────────────────────────────

function bone(ctx: Ctx): CanvasGradient {
  const fill = ctx.createLinearGradient(-30, -100, 30, 0);
  fill.addColorStop(0, "#fbf6e8");
  fill.addColorStop(0.55, "#e6dcc2");
  fill.addColorStop(1, "#b8a882");
  return fill;
}

function limb(
  ctx: Ctx,
  x0: number,
  y0: number,
  angle1: number,
  length1: number,
  angle2: number,
  length2: number,
  width: number,
): readonly [number, number] {
  const x1 = x0 + Math.sin(angle1) * length1;
  const y1 = y0 + Math.cos(angle1) * length1;
  const x2 = x1 + Math.sin(angle1 + angle2) * length2;
  const y2 = y1 + Math.cos(angle1 + angle2) * length2;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x1, y1, width * 0.62, 0, tau);
  ctx.fill();
  return [x2, y2];
}

function paintSkeleton(ctx: Ctx, pose: CreaturePose): void {
  const { t, stride, menace } = pose;
  const step = wave(t, 1.6 + stride * 1.4) * (0.15 + stride * 0.45);
  const bob = Math.abs(wave(t, 1.6 + stride * 1.4)) * 2.5 * (0.4 + stride);
  softShadow(ctx, 30);
  ctx.save();
  ctx.translate(0, -bob);
  const fill = bone(ctx);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  // Legs.
  limb(ctx, -7, -40, step, 20, -Math.max(0, step) * 0.8, 19, 4.5);
  limb(ctx, 7, -40, -step, 20, -Math.max(0, -step) * 0.8, 19, 4.5);
  ctx.beginPath();
  ctx.ellipse(-9 + step * 20, -2, 7, 3, 0, 0, tau);
  ctx.ellipse(9 - step * 20, -2, 7, 3, 0, 0, tau);
  ctx.fill();
  // Pelvis.
  ctx.beginPath();
  ctx.moveTo(-12, -44);
  ctx.quadraticCurveTo(0, -52, 12, -44);
  ctx.quadraticCurveTo(8, -36, 0, -38);
  ctx.quadraticCurveTo(-8, -36, -12, -44);
  ctx.fill();
  // Spine.
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.lineTo(0, -66);
  ctx.stroke();
  // Ribs, which breathe.
  const breath = 1 + wave(t, 0.5) * 0.04;
  ctx.lineWidth = 2.6;
  for (let rib = 0; rib < 4; rib += 1) {
    const y = -64 + rib * 4.6;
    const w = (13 - rib * 1.6) * breath;
    ctx.beginPath();
    ctx.moveTo(-1, y);
    ctx.bezierCurveTo(-w, y - 2, -w, y + 3, -2, y + 3.4);
    ctx.moveTo(1, y);
    ctx.bezierCurveTo(w, y - 2, w, y + 3, 2, y + 3.4);
    ctx.stroke();
  }
  // Arms: they swing with the walk, and reach out to grab.
  const reach = menace * 1.3;
  limb(
    ctx,
    -12,
    -66,
    -0.35 - step * 0.8 - reach,
    15,
    -0.5 + reach * 0.4,
    14,
    3.6,
  );
  const [hx, hy] = limb(
    ctx,
    12,
    -66,
    0.35 + step * 0.8 + reach,
    15,
    0.5 - reach * 0.4,
    14,
    3.6,
  );
  // A bone in its hand, to knock with.
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(0.6 + step);
  ctx.beginPath();
  ctx.roundRect(-1.6, -9, 3.2, 18, 1.6);
  ctx.arc(-2, -9, 2.4, 0, tau);
  ctx.arc(2, -9, 2.4, 0, tau);
  ctx.arc(-2, 9, 2.4, 0, tau);
  ctx.arc(2, 9, 2.4, 0, tau);
  ctx.fill();
  ctx.restore();
  // Skull.
  ctx.save();
  ctx.translate(0, -82);
  ctx.rotate(wave(t, 0.7) * 0.06);
  ctx.shadowColor = "rgba(255, 240, 200, 0.35)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(0, -3, 14, 13, 0, 0, tau);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(-8.5, 4, 17, 6, 3);
  ctx.fill();
  // The jaw chatters, and drops open to bite.
  const jaw = 1 + Math.abs(wave(t, 3.2)) * 1.4 + menace * 5;
  ctx.beginPath();
  ctx.roundRect(-8, 8 + jaw, 16, 6, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(70, 50, 30, 0.55)";
  ctx.lineWidth = 0.9;
  for (let tooth = -6; tooth <= 6; tooth += 3) {
    ctx.beginPath();
    ctx.moveTo(tooth, 6);
    ctx.lineTo(tooth, 10);
    ctx.moveTo(tooth, 8 + jaw);
    ctx.lineTo(tooth, 11 + jaw);
    ctx.stroke();
  }
  ctx.fillStyle = "#1b1010";
  ctx.beginPath();
  ctx.ellipse(-5.6, -3, 4.6, 5.2, 0.2, 0, tau);
  ctx.ellipse(5.6, -3, 4.6, 5.2, -0.2, 0, tau);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 1.5);
  ctx.lineTo(-2.2, 5);
  ctx.lineTo(2.2, 5);
  ctx.fill();
  // Cracks.
  ctx.strokeStyle = "rgba(90, 70, 40, 0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(4, -15);
  ctx.lineTo(6, -11);
  ctx.lineTo(4, -9);
  ctx.stroke();
  glowEyes(
    ctx,
    pose,
    0,
    [
      [-5.6, -3],
      [5.6, -3],
    ],
    2.4,
    pose.mood === "hurt" ? "#ff5a3a" : "#ff9a2e",
  );
  ctx.restore();
  ctx.restore();
}

// ─── Murmur, the ghost ───────────────────────────────────────────────────────────────────

function paintGhost(ctx: Ctx, pose: CreaturePose): void {
  const { t, stride, menace } = pose;
  const hover = 8 + wave(t, 0.6) * 4;
  ctx.save();
  ctx.globalAlpha *= 0.55;
  softShadow(ctx, 26 - hover * 0.6);
  ctx.restore();
  ctx.save();
  ctx.translate(0, -hover);
  ctx.rotate(wave(t, 0.45) * 0.05 + stride * 0.12);
  const lean = stride * 6;
  const body = ctx.createRadialGradient(-6, -70, 4, 0, -50, 52);
  body.addColorStop(0, "rgba(255, 255, 255, 0.98)");
  body.addColorStop(0.55, "rgba(214, 232, 255, 0.9)");
  body.addColorStop(1, "rgba(140, 170, 230, 0.35)");
  ctx.shadowColor = "rgba(170, 210, 255, 0.85)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-24, -42);
  ctx.bezierCurveTo(-26, -92, 26, -92, 24, -42);
  // The hem ripples.
  const folds = 5;
  for (let fold = 0; fold <= folds; fold += 1) {
    const x = 24 - (fold / folds) * 48;
    const y = -6 + wave(t, 1.4, fold * 0.23) * 4;
    ctx.quadraticCurveTo(x + 5 + lean, y + 8, x - lean * 0.3, y);
  }
  ctx.bezierCurveTo(-28, -20, -26, -32, -24, -42);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Little arms that wave, and reach to grab.
  ctx.fillStyle = "rgba(230, 240, 255, 0.92)";
  for (const side of [-1, 1]) {
    const lift = wave(t, 0.9, side * 0.25) * 0.25 + menace * 0.9;
    ctx.save();
    ctx.translate(side * 22, -52);
    ctx.rotate(side * (0.9 - lift));
    ctx.beginPath();
    ctx.ellipse(0, 9, 5, 11, 0, 0, tau);
    ctx.fill();
    ctx.restore();
  }
  // Face.
  const shut = pose.mood === "asleep" || blinking(t, 1);
  ctx.fillStyle = "#151025";
  if (shut) {
    ctx.strokeStyle = "#151025";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12, -64);
    ctx.quadraticCurveTo(-8, -61, -4, -64);
    ctx.moveTo(4, -64);
    ctx.quadraticCurveTo(8, -61, 12, -64);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(-8, -65, 4.2, 6.4, 0, 0, tau);
    ctx.ellipse(8, -65, 4.2, 6.4, 0, 0, tau);
    ctx.fill();
    ctx.fillStyle = "rgba(160, 220, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(-9.3, -67.5, 1.4, 0, tau);
    ctx.arc(6.7, -67.5, 1.4, 0, tau);
    ctx.fill();
  }
  ctx.fillStyle = "#151025";
  const mouth = 3 + Math.abs(wave(t, 0.8)) * 1.6 + menace * 4;
  ctx.beginPath();
  ctx.ellipse(0, -52, 3.2 + menace * 2, mouth, 0, 0, tau);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 140, 170, 0.35)";
  ctx.beginPath();
  ctx.ellipse(-14, -56, 3.4, 2, 0, 0, tau);
  ctx.ellipse(14, -56, 3.4, 2, 0, 0, tau);
  ctx.fill();
  ctx.restore();
}

// ─── Tink, the black cat with her bell ───────────────────────────────────────────────────

function paintCat(ctx: Ctx, pose: CreaturePose): void {
  const { t, stride, menace } = pose;
  const step = wave(t, 1.8 + stride * 1.6) * (0.1 + stride * 0.5);
  const arch = menace * 10;
  softShadow(ctx, 32);
  const fur = ctx.createLinearGradient(0, -80, 0, 0);
  fur.addColorStop(0, "#2a2238");
  fur.addColorStop(0.6, "#120e1a");
  fur.addColorStop(1, "#07060a");
  const rim = "rgba(160, 120, 255, 0.55)";
  ctx.fillStyle = fur;
  ctx.strokeStyle = "#0b0910";
  // Tail: it curls and sways, and bristles to bite.
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 5 + menace * 3;
  ctx.strokeStyle = "#110d18";
  ctx.shadowColor = rim;
  ctx.shadowBlur = 6;
  const sway = wave(t, 0.5) * 8;
  ctx.beginPath();
  ctx.moveTo(-18, -26);
  ctx.bezierCurveTo(-38, -30, -36 + sway, -62, -26 + sway, -70 - menace * 6);
  ctx.quadraticCurveTo(-20 + sway, -74, -18 + sway * 1.2, -68);
  ctx.stroke();
  ctx.restore();
  // Legs.
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#0e0b14";
  for (const [x, phase] of [
    [-13, 0],
    [-6, 0.5],
    [9, 0.5],
    [15, 0],
  ] as const) {
    const swing =
      Math.sin((t * (1.8 + stride * 1.6) + phase) * tau) * (2 + stride * 7);
    ctx.beginPath();
    ctx.moveTo(x, -22);
    ctx.lineTo(x + swing, -2);
    ctx.stroke();
  }
  // Body, which arches to bite.
  ctx.save();
  ctx.shadowColor = rim;
  ctx.shadowBlur = 10;
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.moveTo(-22, -24);
  ctx.bezierCurveTo(-24, -44 - arch, 18, -46 - arch, 22, -28);
  ctx.bezierCurveTo(22, -16, -20, -14, -22, -24);
  ctx.fill();
  ctx.restore();
  // Head.
  ctx.save();
  ctx.translate(18, -44 - arch * 0.5 + step * 2);
  ctx.rotate(wave(t, 0.35) * 0.08);
  ctx.shadowColor = rim;
  ctx.shadowBlur = 10;
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 12, 0, 0, tau);
  ctx.fill();
  const twitch = blinking(t * 1.7, 4) ? 0.18 : 0;
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(-10 - twitch * 6, -22);
  ctx.lineTo(-2, -10);
  ctx.moveTo(2, -10);
  ctx.lineTo(10, -22);
  ctx.lineTo(12, -4);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 150, 190, 0.55)";
  ctx.beginPath();
  ctx.moveTo(-9, -8);
  ctx.lineTo(-8.5, -17);
  ctx.lineTo(-4.5, -10);
  ctx.moveTo(4.5, -10);
  ctx.lineTo(8.5, -17);
  ctx.lineTo(9, -8);
  ctx.fill();
  glowEyes(
    ctx,
    pose,
    2,
    [
      [-5.5, -1],
      [5.5, -1],
    ],
    3.6,
    pose.mood === "hurt" ? "#ff6040" : "#c8f046",
    "slit",
  );
  ctx.fillStyle = "#ff8fb0";
  ctx.beginPath();
  ctx.moveTo(-1.4, 4);
  ctx.lineTo(1.4, 4);
  ctx.lineTo(0, 5.6);
  ctx.fill();
  ctx.strokeStyle = "rgba(230, 220, 255, 0.55)";
  ctx.lineWidth = 0.6;
  for (const side of [-1, 1]) {
    for (const lift of [-1.5, 0.5, 2.5]) {
      ctx.beginPath();
      ctx.moveTo(side * 4, 5);
      ctx.lineTo(side * 17, 4 + lift * 1.6);
      ctx.stroke();
    }
  }
  if (menace > 0.2) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-3, 7);
    ctx.lineTo(-2, 7 + menace * 4);
    ctx.lineTo(-1, 7);
    ctx.moveTo(1, 7);
    ctx.lineTo(2, 7 + menace * 4);
    ctx.lineTo(3, 7);
    ctx.fill();
  }
  ctx.restore();
  // Collar and bell, which swings.
  ctx.save();
  ctx.translate(13, -34 - arch * 0.5);
  ctx.strokeStyle = "#c2263a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(4, -6, 9, 0.5, 2.6);
  ctx.stroke();
  ctx.translate(2, 3);
  ctx.rotate(wave(t, 1.6) * 0.5);
  const gold = ctx.createRadialGradient(-1.5, 2, 0.5, 0, 3, 5);
  gold.addColorStop(0, "#fff6c0");
  gold.addColorStop(0.5, "#f2c13a");
  gold.addColorStop(1, "#8a5a10");
  ctx.fillStyle = gold;
  ctx.shadowColor = "rgba(255, 210, 90, 0.8)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(0, 4, 4.2, 0, tau);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#3a2508";
  ctx.fillRect(-2.4, 4.4, 4.8, 0.9);
  ctx.restore();
}

// ─── Scritch, the spider ─────────────────────────────────────────────────────────────────

function paintSpider(ctx: Ctx, pose: CreaturePose): void {
  const { t, stride, menace } = pose;
  const speed = 2 + stride * 3;
  softShadow(ctx, 36);
  const rise = 22 + wave(t, speed) * 1.2 + menace * 6;
  // Eight legs, each with a knee, stepping in turn.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const side of [-1, 1]) {
    for (let leg = 0; leg < 4; leg += 1) {
      const phase = leg * 0.25 + (side > 0 ? 0.5 : 0);
      const lift =
        Math.max(0, Math.sin((t * speed + phase) * tau)) * (3 + stride * 6);
      const shift = Math.cos((t * speed + phase) * tau) * (1.5 + stride * 4);
      const rootX = side * (4 + leg * 2);
      const rootY = -rise - 4 + leg * 2;
      const footX = side * (22 + leg * 7) + shift;
      const kneeX = side * (14 + leg * 6) + shift * 0.5;
      const kneeY = -rise - 18 - leg * 1.5 + (leg === 0 ? -menace * 10 : 0);
      ctx.strokeStyle = "#1a1016";
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo(kneeX, kneeY - 4, kneeX, kneeY);
      ctx.lineTo(footX, -lift);
      ctx.stroke();
      ctx.strokeStyle = "rgba(200, 120, 160, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY + 1);
      ctx.lineTo(footX, -lift);
      ctx.stroke();
    }
  }
  // Abdomen with its mark.
  ctx.save();
  const sheen = ctx.createRadialGradient(-6, -rise - 22, 2, 0, -rise - 14, 22);
  sheen.addColorStop(0, "#5a3a52");
  sheen.addColorStop(0.5, "#24141f");
  sheen.addColorStop(1, "#0a0509");
  ctx.fillStyle = sheen;
  ctx.shadowColor = "rgba(255, 80, 120, 0.35)";
  ctx.shadowBlur = 12;
  const breath = 1 + wave(t, 0.6) * 0.03;
  ctx.beginPath();
  ctx.ellipse(-6, -rise - 14, 18 * breath, 15 * breath, -0.2, 0, tau);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#d62a40";
  ctx.beginPath();
  ctx.moveTo(-10, -rise - 22);
  ctx.lineTo(-4, -rise - 22);
  ctx.lineTo(-7, -rise - 15);
  ctx.lineTo(-4, -rise - 8);
  ctx.lineTo(-10, -rise - 8);
  ctx.lineTo(-7, -rise - 15);
  ctx.fill();
  // Head, with its many eyes and fangs.
  const head = ctx.createRadialGradient(10, -rise - 10, 1, 12, -rise - 8, 11);
  head.addColorStop(0, "#4a2e40");
  head.addColorStop(1, "#0c060a");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(13, -rise - 8, 10, 8.5, 0, 0, tau);
  ctx.fill();
  const colour = pose.mood === "hurt" ? "#ffd040" : "#ff3048";
  glowEyes(
    ctx,
    pose,
    3,
    [
      [10, -rise - 11],
      [16, -rise - 11],
    ],
    2.4,
    colour,
  );
  glowEyes(
    ctx,
    pose,
    3,
    [
      [7, -rise - 7],
      [13, -rise - 6],
      [19, -rise - 7],
    ],
    1.3,
    colour,
  );
  ctx.fillStyle = "#e8d8c8";
  const fang = 3 + menace * 3 + Math.abs(wave(t, 2.4)) * 0.8;
  ctx.beginPath();
  ctx.moveTo(10, -rise - 2);
  ctx.quadraticCurveTo(10, -rise - 2 + fang, 12, -rise - 1 + fang);
  ctx.lineTo(12, -rise - 2);
  ctx.moveTo(16, -rise - 2);
  ctx.quadraticCurveTo(16, -rise - 2 + fang, 14, -rise - 1 + fang);
  ctx.lineTo(14, -rise - 2);
  ctx.fill();
  ctx.restore();
}

// ─── Squeak, the bat ─────────────────────────────────────────────────────────────────────

function paintBat(ctx: Ctx, pose: CreaturePose): void {
  const { t, stride, menace } = pose;
  const flapSpeed = 2.4 + stride * 3;
  const flap = wave(t, flapSpeed);
  const height = 54 + wave(t, flapSpeed / 2) * 4;
  ctx.save();
  ctx.globalAlpha *= 0.4;
  softShadow(ctx, 22);
  ctx.restore();
  ctx.save();
  ctx.translate(0, -height);
  ctx.rotate(stride * 0.14 + menace * 0.25);
  const membrane = ctx.createLinearGradient(0, -20, 0, 20);
  membrane.addColorStop(0, "#3a2433");
  membrane.addColorStop(1, "#150a12");
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    const lift = flap * 16;
    ctx.fillStyle = membrane;
    ctx.shadowColor = "rgba(255, 90, 130, 0.3)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.quadraticCurveTo(22, -16 - lift, 46, -10 - lift * 1.3);
    ctx.quadraticCurveTo(42, -2 - lift * 0.8, 44, 6 - lift * 0.6);
    ctx.quadraticCurveTo(36, 0 - lift * 0.5, 32, 8 - lift * 0.4);
    ctx.quadraticCurveTo(24, 2 - lift * 0.3, 20, 10 - lift * 0.2);
    ctx.quadraticCurveTo(13, 4, 6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(120, 70, 100, 0.8)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(46, -10 - lift * 1.3);
    ctx.moveTo(18, -8 - lift * 0.5);
    ctx.lineTo(32, 8 - lift * 0.4);
    ctx.moveTo(14, -6 - lift * 0.3);
    ctx.lineTo(20, 10 - lift * 0.2);
    ctx.stroke();
    ctx.restore();
  }
  // Body and head.
  const fur = ctx.createRadialGradient(-2, -6, 1, 0, 0, 14);
  fur.addColorStop(0, "#5a3a40");
  fur.addColorStop(1, "#1a0e12");
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, 2, 8, 11, 0, 0, tau);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -9, 8.5, 0, tau);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -12);
  ctx.lineTo(-6, -24);
  ctx.lineTo(-1.5, -15);
  ctx.moveTo(1.5, -15);
  ctx.lineTo(6, -24);
  ctx.lineTo(7, -12);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 140, 170, 0.45)";
  ctx.beginPath();
  ctx.moveTo(-5.5, -14);
  ctx.lineTo(-5.4, -20);
  ctx.lineTo(-3, -15.5);
  ctx.moveTo(3, -15.5);
  ctx.lineTo(5.4, -20);
  ctx.lineTo(5.5, -14);
  ctx.fill();
  glowEyes(
    ctx,
    pose,
    5,
    [
      [-3.4, -10],
      [3.4, -10],
    ],
    2.3,
    pose.mood === "hurt" ? "#ffe040" : "#ff4a5a",
  );
  ctx.fillStyle = "#fff";
  const fang = 2.4 + menace * 2.4;
  ctx.beginPath();
  ctx.moveTo(-2.4, -5);
  ctx.lineTo(-1.6, -5 + fang);
  ctx.lineTo(-0.8, -5);
  ctx.moveTo(0.8, -5);
  ctx.lineTo(1.6, -5 + fang);
  ctx.lineTo(2.4, -5);
  ctx.fill();
  ctx.restore();
}

const painters: Readonly<
  Record<GhostSoundId, (ctx: Ctx, pose: CreaturePose) => void>
> = Object.freeze({
  cellar: paintSkeleton,
  corridor: paintGhost,
  nursery: paintCat,
  stairs: paintSpider,
  attic: paintBat,
});

/** Paints a creature about its feet at the canvas's origin, in the units described above. */
export function paintCreature(
  ctx: Ctx,
  id: GhostSoundId,
  pose: CreaturePose,
): void {
  ctx.save();
  painters[id](ctx, pose);
  ctx.restore();
}

/**
 * The shadow of a creature not yet known: a hunched wisp of smoke with two embers for eyes. Both
 * sides of a turn draw the same shadow, so it never tells which creature comes, or whether one
 * comes at all. `fade` from 0 to 1 thickens it as it creeps in.
 */
export function paintShadow(
  ctx: Ctx,
  t: number,
  fade: number,
  seed: number,
): void {
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, fade));
  ctx.save();
  ctx.globalAlpha *= 0.6;
  softShadow(ctx, 28);
  ctx.restore();
  const smoke = ctx.createRadialGradient(0, -46, 4, 0, -40, 42);
  smoke.addColorStop(0, "rgba(18, 6, 28, 0.95)");
  smoke.addColorStop(0.6, "rgba(30, 10, 44, 0.75)");
  smoke.addColorStop(1, "rgba(30, 10, 44, 0)");
  ctx.fillStyle = smoke;
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  for (let lobe = 0; lobe <= 8; lobe += 1) {
    const angle = Math.PI + (lobe / 8) * Math.PI;
    const radius = 32 + wave(t, 0.9, lobe * 0.17 + seed) * 5;
    ctx.lineTo(
      Math.cos(angle) * radius * 0.8,
      -36 + Math.sin(angle) * radius * 1.1,
    );
  }
  ctx.lineTo(26, 0);
  for (let wisp = 0; wisp <= 6; wisp += 1) {
    const x = 26 - (wisp / 6) * 52;
    ctx.lineTo(x, -wave(t, 1.6, wisp * 0.3 + seed) * 4 - 2);
  }
  ctx.closePath();
  ctx.fill();
  const flicker = 0.75 + wave(t, 2.2, seed) * 0.25;
  ctx.shadowColor = `rgba(255, 120, 40, ${String(flicker)})`;
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(255, 170, 70, ${String(flicker)})`;
  for (const x of [-8, 8]) {
    ctx.beginPath();
    ctx.ellipse(
      x,
      -52,
      3.4,
      blinking(t, seed + 2) ? 0.6 : 2.2,
      x * 0.02,
      0,
      tau,
    );
    ctx.fill();
  }
  ctx.restore();
}

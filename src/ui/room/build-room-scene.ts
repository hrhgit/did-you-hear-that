import type { GhostSoundId } from "../../config/sound-id";
import type { RhythmJudgement } from "../../config/rhythm-config";
import { createSeededRandom } from "../../config/seeded-random";
import { canPaint } from "./creature-art";
import { paintCreature, paintShadow } from "./creature-paint";
import {
  groundFraction,
  paintFog,
  paintJack,
  paintSweet,
  paintYard,
} from "./night-paint";

/** A side of the room: the side a sound came from. */
export type RoomSide = "left" | "right";

/** A creature that stands in the room in plain view, and where. */
export interface RoomFeature {
  readonly id: GhostSoundId;
  /**
   * `centre`: over Jack, in the middle, which tells no side. Otherwise on a side: for a practice
   * sound while it plays, or for a sound that is played again after every answer has been given.
   */
  readonly place: "centre" | RoomSide;
  /** Whether it is making its sound now. */
  readonly sounding: boolean;
}

/** The room's beat on the page clock (`RoomBeat`). */
export interface SceneBeat {
  readonly firstBeatAtMs: number;
  readonly beatMs: number;
  readonly beatsPerBar: number;
}

/** How the night stands, as the heads-up display shows it. */
export interface SceneStanding {
  readonly score: number;
  readonly combo: number;
  /** Jack's flame, from 0 to 1. */
  readonly flame: number;
  /** The whole of it in words, for a visitor who cannot see it. */
  readonly label: string;
  /** Said once the candle has gone out and been lit again, or null. */
  readonly relitLine: string | null;
}

/** The words the display shows, from `rhythmCopy`. */
export interface SceneWords {
  readonly sceneLabel: string;
  readonly comboWord: string;
  readonly scoreWord: string;
  readonly warmUpWord: string;
  readonly judgementWords: Readonly<Record<RhythmJudgement, string>>;
  readonly kickAtNothingWord: string;
}

/**
 * The picture of the one room (the rhythm game, 2026-11-18): a moonlit yard with Jack, the
 * jack-o'-lantern, in the middle, painted on a canvas every frame. On every turn two shadows creep
 * in on the beat, one from each side, alike, to reach Jack on the turn's off-beat. When the turn
 * is scored the shadow of the sound's side becomes its creature and is kicked away, or bites Jack;
 * the other dissolves. Over it, a display of the combo, the score and Jack's flame.
 */
export interface RoomScene {
  readonly element: HTMLElement;
  /** Who stands in plain view, or null for nobody. The one before leaves in a fade. */
  setFeatured(feature: RoomFeature | null): void;
  /** The beat the room plays, or null while none plays. Jack swells on each beat. */
  setBeat(beat: SceneBeat | null): void;
  /** How the night stands, or null while nothing counts (`warmUp` says whether the room practises). */
  setStanding(standing: SceneStanding | null, warmUp: boolean): void;
  /** A turn is coming at `atMs` on the page clock: a shadow creeps in from each side. */
  cue(atMs: number, beatMs: number): void;
  /** A caught sound: its creature is kicked away from Jack on its side. */
  caught(side: RoomSide, id: GhostSoundId, judgement?: RhythmJudgement): void;
  /** A sound that went by, or was answered on the other side: its creature bites Jack. */
  slipped(side: RoomSide, id: GhostSoundId, judgement?: RhythmJudgement): void;
  /** A turn with no sound: the shadows go. A kick at one of them (`trick`) meets only smoke. */
  passed(judgement: "steady" | "trick", side: RoomSide | null): void;
  /** A kick that met no turn at all. */
  whiff(side: RoomSide): void;
  /** Rings from a side, with nobody new on it. */
  rings(side: RoomSide): void;
  /** The creature in plain view hops once. Does nothing when nobody stands there. */
  cheer(): void;
  /** Takes away everything a sound left in the yard. */
  clear(): void;
}

/** The colour of each creature's glow, as `room.css` gives it. */
const hues: Readonly<Record<GhostSoundId, string>> = Object.freeze({
  cellar: "#ef6f7a",
  corridor: "#a77bff",
  nursery: "#6fc3b8",
  stairs: "#9ccf6a",
  attic: "#7aa2ff",
});

const judgementHues: Readonly<Record<RhythmJudgement, string>> = Object.freeze({
  perfect: "#ffe27a",
  great: "#7ef0c8",
  good: "#8fb8ff",
  miss: "#ff6a6a",
  wrong: "#ff8a4a",
  trick: "#c9a0ff",
  steady: "#c8c0e0",
});

interface Shadow {
  readonly side: RoomSide;
  readonly cuedAtMs: number;
  readonly atMs: number;
  readonly seed: number;
  goneAtMs: number | null;
}

interface Actor {
  readonly id: GhostSoundId;
  readonly side: RoomSide;
  readonly kind: "kicked" | "bite";
  readonly startMs: number;
  readonly hue: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly bornMs: number;
  readonly lifeMs: number;
  readonly hue: string;
  readonly size: number;
  readonly kind: "spark" | "smoke" | "sweet" | "ring";
  readonly spin: number;
}

interface Swoosh {
  readonly side: RoomSide;
  readonly startMs: number;
  readonly hit: boolean;
}

interface Featured {
  readonly feature: RoomFeature;
  readonly sinceMs: number;
  cheerMs: number;
  leavingSinceMs: number | null;
}

const kickMs = 950;
const biteMs = 1250;
/** How long a shadow lingers past its off-beat before it fades by itself (a turn's window and more). */
const shadowLingerMs = 2600;

export function buildRoomScene(doc: Document, words: SceneWords): RoomScene {
  // The sparks scatter by a source of their own: they say nothing of any trial, and a page drawn
  // twice scatters them alike.
  const sparks = createSeededRandom(20261118);
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    children: readonly Node[] = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    element.className = className;
    element.append(...children);
    return element;
  };

  const canvas = make("canvas", "room-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const picture = make("div", "room-picture", [canvas]);
  picture.setAttribute("role", "img");
  picture.setAttribute("aria-label", words.sceneLabel);

  // The display. Plain text, so it can be read and tested; the canvas only paints.
  const comboCount = make("span", "rhythm-combo-count");
  const comboWord = make("span", "rhythm-combo-word");
  comboWord.textContent = words.comboWord;
  const combo = make("div", "rhythm-combo", [comboCount, comboWord]);
  const scoreValue = make("span", "rhythm-score-value");
  const scoreWord = make("span", "rhythm-score-word");
  scoreWord.textContent = words.scoreWord;
  const score = make("div", "rhythm-score", [scoreWord, scoreValue]);
  const flameFill = make("span", "rhythm-flame-fill");
  const flame = make("div", "rhythm-flame", [flameFill]);
  const relit = make("p", "rhythm-relit");
  relit.hidden = true;
  const warmUp = make("p", "rhythm-warm-up");
  warmUp.textContent = words.warmUpWord;
  const hud = make("div", "rhythm-hud", [combo, score, flame, relit, warmUp]);
  hud.setAttribute("role", "group");
  hud.hidden = true;
  const pops = {
    left: make("div", "rhythm-pop rhythm-pop-left"),
    right: make("div", "rhythm-pop rhythm-pop-right"),
    centre: make("div", "rhythm-pop rhythm-pop-centre"),
  };
  for (const pop of Object.values(pops)) {
    pop.setAttribute("aria-hidden", "true");
  }

  picture.append(pops.left, pops.right, pops.centre);
  const element = make("div", "room-scene", [picture, hud]);
  // What the canvas draws, kept as plain attributes so it can be read and tested: who stands in
  // plain view and where, and the last thing a scored turn drew, with a count that tells a new
  // drawing from the one before.
  let drawings = 0;
  const record = (
    outcome: "none" | "caught" | "slipped" | "steady" | "trick" | "whiff",
    side: RoomSide | null,
    id: GhostSoundId | null,
  ): void => {
    if (outcome !== "none") {
      drawings += 1;
    }
    element.dataset.outcome = outcome;
    element.dataset.outcomeSide = side ?? "none";
    element.dataset.outcomeCreature = id ?? "none";
    element.dataset.drawings = String(drawings);
  };
  let ringCount = 0;
  let cheers = 0;
  element.dataset.cheers = "0";
  element.dataset.featured = "none";
  element.dataset.featuredPlace = "none";
  element.dataset.sounding = "false";
  element.dataset.rings = "0";
  element.dataset.ringsSide = "none";
  element.dataset.cues = "0";
  record("none", null, null);

  const view = doc.defaultView;
  const now = (): number => view?.performance.now() ?? 0;
  const reducedMotion = (): boolean =>
    view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  // ─── State ─────────────────────────────────────────────────────────────────────────────
  let beat: SceneBeat | null = null;
  let shadows: Shadow[] = [];
  let actors: Actor[] = [];
  let particles: Particle[] = [];
  let swooshes: Swoosh[] = [];
  let ringsAt: { side: RoomSide; startMs: number }[] = [];
  let featured: Featured | null = null;
  let leaving: Featured | null = null;
  let flameTarget = 1;
  let flameShown = 1;
  let hurtAtMs = -1e9;
  let joyAtMs = -1e9;
  let shakeAtMs = -1e9;
  let seedCount = 0;
  let comboShown = -1;

  const pop = (
    where: RoomSide | "centre",
    text: string,
    hue: string,
    big: boolean,
  ): void => {
    const word = make("span", "rhythm-pop-word");
    word.textContent = text;
    word.style.setProperty("--pop-hue", hue);
    if (big) {
      word.dataset.big = "true";
    }
    pops[where].replaceChildren(word);
  };

  // ─── Geometry ──────────────────────────────────────────────────────────────────────────
  let width = 1;
  let height = 1;
  let ratio = 1;
  let yard: HTMLCanvasElement | null = null;

  const layout = () => {
    const groundY = height * groundFraction;
    const jackSize = Math.min(height * 0.2, width * 0.2);
    const creatureSize = Math.min(height * 0.19, width * 0.17);
    const cx = width / 2;
    return {
      groundY,
      jackSize,
      creatureSize,
      cx,
      /** Where a creature stands when it reaches Jack, on a side. */
      strikeX: (side: RoomSide) =>
        cx + (side === "left" ? -1 : 1) * jackSize * 1.05,
      /** Where a shadow comes from. */
      edgeX: (side: RoomSide) =>
        side === "left" ? -creatureSize * 0.6 : width + creatureSize * 0.6,
      /** Where a creature of the roll call stands on a side. */
      standX: (side: RoomSide) =>
        cx + (side === "left" ? -1 : 1) * Math.min(width * 0.3, jackSize * 2.6),
    };
  };

  const resize = (): boolean => {
    const rect = picture.getBoundingClientRect();
    const nextRatio = Math.min(2, view?.devicePixelRatio ?? 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height && nextRatio === ratio && yard !== null) {
      return true;
    }
    width = w;
    height = h;
    ratio = nextRatio;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    yard = doc.createElement("canvas");
    yard.width = canvas.width;
    yard.height = canvas.height;
    const yardCtx = yard.getContext("2d");
    if (yardCtx === null) {
      return false;
    }
    yardCtx.scale(ratio, ratio);
    paintYard(yardCtx, w, h);
    return true;
  };

  // ─── Painting ──────────────────────────────────────────────────────────────────────────
  const ease = (x: number): number => 1 - (1 - x) ** 3;
  const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

  const burst = (
    x: number,
    y: number,
    hue: string,
    count: number,
    kind: Particle["kind"],
    speed: number,
  ): void => {
    const born = now();
    for (let index = 0; index < count; index += 1) {
      const angle = sparks.next() * Math.PI * 2;
      const v = speed * (0.4 + sparks.next() * 0.8);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - speed * 0.4,
        bornMs: born,
        lifeMs: 500 + sparks.next() * 600,
        hue,
        size: 1.5 + sparks.next() * 3,
        kind,
        spin: sparks.next() * 6,
      });
    }
  };

  const paintFrame = (ctx: CanvasRenderingContext2D, nowMs: number): void => {
    const t = nowMs / 1000;
    const g = layout();
    const still = reducedMotion();
    const motion = still ? "still" : "moving";
    if (element.dataset.motion !== motion) {
      element.dataset.motion = motion;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const shake = still ? 0 : Math.max(0, 1 - (nowMs - shakeAtMs) / 380);
    if (shake > 0) {
      ctx.translate(
        Math.sin(nowMs * 0.09) * shake * 7,
        Math.cos(nowMs * 0.11) * shake * 4,
      );
    }
    if (yard !== null) {
      ctx.drawImage(yard, 0, 0, width, height);
    }
    flameShown += (flameTarget - flameShown) * 0.08;
    paintFog(ctx, width, height, still ? 0 : t, flameShown);

    // The beat: a pulse on every beat, stronger on the first of a bar.
    let pulse = 0;
    if (beat !== null && nowMs >= beat.firstBeatAtMs) {
      const since = (nowMs - beat.firstBeatAtMs) % beat.beatMs;
      const index = Math.floor((nowMs - beat.firstBeatAtMs) / beat.beatMs);
      const barStart = index % beat.beatsPerBar === 0;
      pulse = Math.exp(-since / 110) * (barStart ? 1 : 0.65);
    }
    if (pulse > 0.02) {
      ctx.save();
      ctx.translate(g.cx, g.groundY);
      ctx.scale(1, 0.25);
      ctx.strokeStyle = `rgba(255, 170, 80, ${String(pulse * 0.55)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, g.jackSize * (0.8 + (1 - pulse) * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // The strike marks on each side, where a turn's creature reaches Jack.
    for (const side of ["left", "right"] as const) {
      const x = g.strikeX(side);
      ctx.save();
      ctx.translate(x, g.groundY);
      ctx.scale(1, 0.28);
      ctx.strokeStyle = `rgba(230, 210, 255, ${String(0.16 + pulse * 0.2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, g.creatureSize * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Shadows, creeping in on the beat, and the rings that close on their off-beat.
    if (featured === null) {
      shadows = shadows.filter((shadow) => {
        const gone = shadow.goneAtMs ?? shadow.atMs + shadowLingerMs;
        return nowMs < gone + 500;
      });
      for (const shadow of shadows) {
        const span = Math.max(1, shadow.atMs - shadow.cuedAtMs);
        const progress = clamp01((nowMs - shadow.cuedAtMs) / span);
        const goneSince =
          nowMs - (shadow.goneAtMs ?? shadow.atMs + shadowLingerMs);
        const fadeOut = goneSince > 0 ? 1 - goneSince / 500 : 1;
        const dir = shadow.side === "left" ? 1 : -1;
        const x =
          g.edgeX(shadow.side) +
          (g.strikeX(shadow.side) - g.edgeX(shadow.side)) * ease(progress);
        const hop = still
          ? 0
          : Math.abs(Math.sin(progress * Math.PI * 4)) * g.creatureSize * 0.05;
        ctx.save();
        ctx.translate(x, g.groundY - hop);
        ctx.scale((dir * g.creatureSize) / 100, g.creatureSize / 100);
        paintShadow(
          ctx,
          still ? 0 : t,
          Math.min(progress * 1.6, 1) * fadeOut,
          shadow.seed,
        );
        ctx.restore();
        if (progress < 1 && shadow.goneAtMs === null) {
          const ring = 1 + (1 - progress) * 2.2;
          ctx.save();
          ctx.translate(g.strikeX(shadow.side), g.groundY);
          ctx.scale(1, 0.28);
          ctx.strokeStyle = `rgba(255, 200, 120, ${String(0.15 + progress * 0.6)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, g.creatureSize * 0.42 * ring, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Jack, between the sides.
    const hurt = Math.max(0, 1 - (nowMs - hurtAtMs) / 700);
    const joy = Math.max(0, 1 - (nowMs - joyAtMs) / 600);
    ctx.save();
    ctx.translate(g.cx, g.groundY + g.jackSize * 0.04);
    paintJack(ctx, g.jackSize, {
      t: still ? 0 : t,
      flame: flameShown,
      hurt: still ? 0 : hurt,
      pulse: still ? 0 : pulse,
      candy: Math.max(0, Math.min(7, Math.ceil(flameShown * 7))),
      joy,
    });
    ctx.restore();

    // Who stands in plain view.
    for (const shown of [leaving, featured]) {
      if (shown === null) {
        continue;
      }
      const { feature } = shown;
      const enter = clamp01((nowMs - shown.sinceMs) / 350);
      const exit =
        shown.leavingSinceMs === null
          ? 1
          : 1 - clamp01((nowMs - shown.leavingSinceMs) / 450);
      if (exit <= 0) {
        continue;
      }
      const x = feature.place === "centre" ? g.cx : g.standX(feature.place);
      const y =
        feature.place === "centre" ? g.groundY - g.jackSize * 1.15 : g.groundY;
      const cheer = Math.max(0, 1 - (nowMs - shown.cheerMs) / 500);
      const hop = still ? 0 : Math.sin(cheer * Math.PI) * g.creatureSize * 0.25;
      const dir = feature.place === "right" ? -1 : 1;
      ctx.save();
      ctx.globalAlpha = enter * exit;
      ctx.translate(x, y - hop);
      const size = g.creatureSize * (feature.place === "centre" ? 0.85 : 1);
      ctx.scale((dir * size) / 100, size / 100);
      if (feature.sounding) {
        ctx.shadowColor = hues[feature.id];
        ctx.shadowBlur = 30;
      }
      paintCreature(ctx, feature.id, {
        t: still ? 0 : t,
        mood: "awake",
        stride: 0,
        menace: 0,
      });
      ctx.restore();
    }
    if (
      leaving !== null &&
      leaving.leavingSinceMs !== null &&
      nowMs - leaving.leavingSinceMs > 450
    ) {
      leaving = null;
    }

    // Creatures of scored turns: kicked away, or biting Jack.
    actors = actors.filter(
      (actor) =>
        nowMs - actor.startMs < (actor.kind === "kicked" ? kickMs : biteMs),
    );
    for (const actor of actors) {
      const p = clamp01(
        (nowMs - actor.startMs) / (actor.kind === "kicked" ? kickMs : biteMs),
      );
      const outward = actor.side === "left" ? -1 : 1;
      const strike = g.strikeX(actor.side);
      let x: number;
      let y = g.groundY;
      let rotation = 0;
      let alpha: number;
      let scale = 1;
      let menace = 0;
      let stride = 0;
      if (actor.kind === "kicked") {
        const fly = ease(p);
        x = strike + outward * fly * width * 0.55;
        y =
          g.groundY -
          Math.sin(fly * Math.PI * 0.9) * height * 0.32 -
          fly * height * 0.1;
        rotation = still ? 0 : outward * fly * Math.PI * 3;
        alpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
        scale = 1 - fly * 0.45;
      } else {
        // A lunge into Jack, a moment there, and off with a sweet.
        const lunge = clamp01(p / 0.2);
        const back = clamp01((p - 0.42) / 0.58);
        const contact = strike - outward * g.jackSize * 0.45;
        x =
          strike +
          (contact - strike) * ease(lunge) +
          (g.edgeX(actor.side) - contact) * back * back;
        menace = p < 0.45 ? 1 : 1 - back;
        stride = back > 0 ? 1 : 0.4;
        alpha = back < 0.7 ? 1 : 1 - (back - 0.7) / 0.3;
        if (back > 0) {
          // Off it goes, with a sweet.
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(
            x - outward * g.creatureSize * 0.05,
            g.groundY - g.creatureSize * 0.55,
          );
          ctx.rotate(t * 8);
          paintSweet(ctx, Math.floor(actor.startMs) % 7, g.creatureSize * 0.06);
          ctx.restore();
        }
      }
      const facing = back(actor, p) ? outward : -outward;
      ctx.save();
      ctx.globalAlpha = clamp01(alpha);
      ctx.translate(
        x,
        y - g.creatureSize * 0.45 * (actor.kind === "kicked" ? 1 : 0),
      );
      ctx.rotate(rotation);
      ctx.translate(
        0,
        g.creatureSize * 0.45 * (actor.kind === "kicked" ? 1 : 0),
      );
      ctx.scale(
        (facing * g.creatureSize * scale) / 100,
        (g.creatureSize * scale) / 100,
      );
      ctx.shadowColor = actor.hue;
      ctx.shadowBlur = 24;
      paintCreature(ctx, actor.id, {
        t: still ? 0 : t,
        mood: "hurt",
        stride,
        menace,
      });
      ctx.restore();
    }

    // The kicks: a swoosh of light from Jack's side.
    swooshes = swooshes.filter((swoosh) => nowMs - swoosh.startMs < 320);
    for (const swoosh of swooshes) {
      const p = (nowMs - swoosh.startMs) / 320;
      const outward = swoosh.side === "left" ? -1 : 1;
      const x = g.strikeX(swoosh.side);
      const y = g.groundY - g.creatureSize * 0.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(outward, 1);
      ctx.strokeStyle = swoosh.hit
        ? `rgba(255, 235, 150, ${String(1 - p)})`
        : `rgba(220, 210, 255, ${String((1 - p) * 0.7)})`;
      ctx.lineWidth = (swoosh.hit ? 7 : 4) * (1 - p * 0.6);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(
        -g.creatureSize * 0.35,
        0,
        g.creatureSize * 0.55,
        -1.2 + p * 0.8,
        0.2 + p * 1.2,
      );
      ctx.stroke();
      ctx.restore();
    }

    // Sound rings.
    ringsAt = ringsAt.filter((ring) => nowMs - ring.startMs < 1400);
    for (const ring of ringsAt) {
      const x =
        featured !== null && featured.feature.place === ring.side
          ? g.standX(ring.side)
          : g.strikeX(ring.side);
      for (let index = 0; index < 3; index += 1) {
        const p = (nowMs - ring.startMs - index * 180) / 1000;
        if (p < 0 || p > 1) {
          continue;
        }
        ctx.strokeStyle = `rgba(255, 230, 170, ${String((1 - p) * 0.6)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          x,
          g.groundY - g.creatureSize * 0.5,
          g.creatureSize * (0.3 + p * 0.9),
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }

    // Sparks, smoke and sweets.
    const dt = 1 / 60;
    particles = particles.filter(
      (particle) => nowMs - particle.bornMs < particle.lifeMs,
    );
    for (const particle of particles) {
      const life = (nowMs - particle.bornMs) / particle.lifeMs;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.kind === "smoke" ? -20 : 260) * dt;
      ctx.save();
      ctx.globalAlpha = 1 - life;
      if (particle.kind === "smoke") {
        const r = particle.size * (4 + life * 10);
        const puff = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          r,
        );
        puff.addColorStop(0, "rgba(60, 30, 80, 0.5)");
        puff.addColorStop(1, "rgba(60, 30, 80, 0)");
        ctx.fillStyle = puff;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (particle.kind === "sweet") {
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin + life * 8);
        paintSweet(ctx, Math.floor(particle.spin * 10), particle.size * 1.4);
      } else {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = particle.hue;
        ctx.shadowColor = particle.hue;
        ctx.shadowBlur = 8;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin + life * 4);
        ctx.beginPath();
        for (let point = 0; point < 4; point += 1) {
          const angle = (point / 4) * Math.PI * 2;
          ctx.lineTo(
            Math.cos(angle) * particle.size * 2,
            Math.sin(angle) * particle.size * 2,
          );
          ctx.lineTo(
            Math.cos(angle + Math.PI / 4) * particle.size * 0.6,
            Math.sin(angle + Math.PI / 4) * particle.size * 0.6,
          );
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // A dark vignette, which closes in as Jack's flame burns down.
    const dark = ctx.createRadialGradient(
      g.cx,
      g.groundY - g.jackSize,
      g.jackSize * 1.5,
      g.cx,
      height / 2,
      Math.max(width, height) * 0.8,
    );
    dark.addColorStop(0, "rgba(0, 0, 0, 0)");
    dark.addColorStop(
      1,
      `rgba(0, 0, 0, ${String(0.35 + (1 - flameShown) * 0.35)})`,
    );
    ctx.fillStyle = dark;
    ctx.fillRect(-20, -20, width + 40, height + 40);
    if (hurt > 0 && !still) {
      ctx.fillStyle = `rgba(180, 20, 30, ${String(hurt * 0.18)})`;
      ctx.fillRect(-20, -20, width + 40, height + 40);
    }
  };

  /** Whether a biting creature has turned to go. */
  function back(actor: Actor, p: number): boolean {
    return actor.kind === "kicked" || p > 0.42;
  }

  const painting = canPaint(doc);
  if (painting && view !== null) {
    const frame = (nowMs: number): void => {
      if (element.isConnected && resize()) {
        const ctx = canvas.getContext("2d");
        if (ctx !== null) {
          paintFrame(ctx, nowMs);
        }
      }
      view.requestAnimationFrame(frame);
    };
    view.requestAnimationFrame(frame);
  }

  /** The shadow of a side that is still under way, which the turn's outcome now resolves. */
  const resolveShadows = (atMs: number): void => {
    for (const shadow of shadows) {
      if (shadow.goneAtMs === null) {
        shadow.goneAtMs = atMs;
      }
    }
  };

  const smokeAt = (side: RoomSide): void => {
    if (!painting) {
      return;
    }
    const g = layout();
    burst(
      g.strikeX(side),
      g.groundY - g.creatureSize * 0.4,
      "#3a1a4a",
      6,
      "smoke",
      40,
    );
  };

  return {
    element,
    setFeatured(feature) {
      const key = feature === null ? null : `${feature.id}@${feature.place}`;
      const shownKey =
        featured === null
          ? null
          : `${featured.feature.id}@${featured.feature.place}`;
      if (key === shownKey) {
        if (
          featured !== null &&
          feature !== null &&
          featured.feature.sounding !== feature.sounding
        ) {
          featured = { ...featured, feature };
          element.dataset.sounding = String(feature.sounding);
        }
        return;
      }
      if (featured !== null) {
        leaving = { ...featured, leavingSinceMs: now() };
      }
      featured =
        feature === null
          ? null
          : { feature, sinceMs: now(), cheerMs: -1e9, leavingSinceMs: null };
      element.dataset.featured = feature === null ? "none" : feature.id;
      element.dataset.featuredPlace = feature === null ? "none" : feature.place;
      element.dataset.sounding = String(feature?.sounding ?? false);
    },
    setBeat(next) {
      beat = next;
    },
    setStanding(standing, warming) {
      warmUp.hidden = !warming;
      if (standing === null) {
        hud.hidden = !warming;
        combo.hidden = true;
        score.hidden = true;
        flame.hidden = true;
        relit.hidden = true;
        hud.removeAttribute("aria-label");
        flameTarget = 1;
        comboShown = -1;
        return;
      }
      hud.hidden = false;
      combo.hidden = false;
      score.hidden = false;
      flame.hidden = false;
      if (hud.getAttribute("aria-label") !== standing.label) {
        hud.setAttribute("aria-label", standing.label);
      }
      const comboText = String(standing.combo);
      if (comboCount.textContent !== comboText) {
        comboCount.textContent = comboText;
      }
      if (standing.combo !== comboShown) {
        // Two names of one animation take turns, so each change starts it again.
        combo.dataset.bump = combo.dataset.bump === "a" ? "b" : "a";
        combo.dataset.combo =
          standing.combo === 0 ? "none" : standing.combo >= 10 ? "hot" : "some";
        comboShown = standing.combo;
      }
      const scoreText = standing.score.toLocaleString("en-US");
      if (scoreValue.textContent !== scoreText) {
        scoreValue.textContent = scoreText;
      }
      flameFill.style.setProperty("--flame", String(clamp01(standing.flame)));
      flameTarget = clamp01(standing.flame);
      relit.hidden = standing.relitLine === null;
      relit.textContent = standing.relitLine ?? "";
    },
    cue(atMs, beatMs) {
      // Both sides alike: two shadows, one seed for both, the same path mirrored.
      seedCount += 1;
      element.dataset.cues = String(seedCount);
      const cuedAtMs = Math.min(now(), atMs - beatMs);
      for (const side of ["left", "right"] as const) {
        shadows.push({
          side,
          cuedAtMs,
          atMs,
          seed: seedCount * 0.37,
          goneAtMs: null,
        });
      }
    },
    caught(side, id, judgement) {
      resolveShadows(now());
      record("caught", side, id);
      actors.push({ id, side, kind: "kicked", startMs: now(), hue: hues[id] });
      swooshes.push({ side, startMs: now(), hit: true });
      joyAtMs = now();
      const hue = judgementHues[judgement ?? "good"];
      if (painting) {
        const g = layout();
        burst(
          g.strikeX(side),
          g.groundY - g.creatureSize * 0.45,
          hue,
          judgement === "perfect" ? 26 : 16,
          "spark",
          260,
        );
        burst(
          g.strikeX(side),
          g.groundY - g.creatureSize * 0.45,
          hues[id],
          8,
          "spark",
          180,
        );
      }
      ringsAt.push({ side, startMs: now() });
      ringCount += 1;
      element.dataset.rings = String(ringCount);
      element.dataset.ringsSide = side;
      if (judgement !== undefined) {
        pop(
          side,
          words.judgementWords[judgement],
          hue,
          judgement === "perfect",
        );
      }
    },
    slipped(side, id, judgement) {
      resolveShadows(now());
      record("slipped", side, id);
      actors.push({ id, side, kind: "bite", startMs: now(), hue: hues[id] });
      const other: RoomSide = side === "left" ? "right" : "left";
      if (judgement === "wrong") {
        swooshes.push({ side: other, startMs: now(), hit: false });
        smokeAt(other);
      }
      // The bite lands a moment after the lunge begins.
      const landAt = now() + biteMs * 0.18;
      hurtAtMs = landAt;
      shakeAtMs = landAt;
      if (painting) {
        const g = layout();
        view?.setTimeout(() => {
          const x = g.cx + (side === "left" ? -1 : 1) * g.jackSize * 0.4;
          burst(x, g.groundY - g.jackSize * 0.5, "#ff8a3a", 14, "spark", 200);
          particles.push({
            x,
            y: g.groundY - g.jackSize * 0.3,
            vx: (side === "left" ? -1 : 1) * 120,
            vy: -260,
            bornMs: now(),
            lifeMs: 900,
            hue: "#fff",
            size: g.creatureSize * 0.05,
            kind: "sweet",
            spin: sparks.next() * 6,
          });
        }, biteMs * 0.18);
      }
      if (judgement !== undefined) {
        pop(
          side,
          words.judgementWords[judgement],
          judgementHues[judgement],
          false,
        );
      }
    },
    passed(judgement, side) {
      resolveShadows(now());
      record(judgement, judgement === "trick" ? side : null, null);
      if (judgement === "trick" && side !== null) {
        swooshes.push({ side, startMs: now(), hit: false });
        smokeAt(side);
        hurtAtMs = now();
        pop(side, words.judgementWords.trick, judgementHues.trick, false);
        return;
      }
      smokeAt("left");
      smokeAt("right");
      pop("centre", words.judgementWords.steady, judgementHues.steady, false);
    },
    whiff(side) {
      record("whiff", side, null);
      swooshes.push({ side, startMs: now(), hit: false });
      pop(side, words.kickAtNothingWord, judgementHues.trick, false);
    },
    rings(side) {
      ringsAt.push({ side, startMs: now() });
      ringCount += 1;
      element.dataset.rings = String(ringCount);
      element.dataset.ringsSide = side;
    },
    cheer() {
      if (featured !== null) {
        featured.cheerMs = now();
        joyAtMs = now();
        cheers += 1;
        element.dataset.cheers = String(cheers);
      }
    },
    clear() {
      shadows = [];
      actors = [];
      particles = [];
      swooshes = [];
      ringsAt = [];
      record("none", null, null);
      element.dataset.ringsSide = "none";
      for (const where of Object.values(pops)) {
        where.replaceChildren();
      }
    },
  };
}

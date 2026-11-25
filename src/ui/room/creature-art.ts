import type { GhostSoundId } from "../../config/sound-id";
import { paintCreature } from "./creature-paint";

/**
 * How a creature is drawn. `awake`: as it stands in the room. `asleep`: once it has gone home,
 * with its eyes shut. `outline`: the faint shape of one that went by.
 */
export type CreatureMood = "awake" | "asleep" | "outline";

/** Whether the page can paint at all: a page built for the tests has no canvas to paint on. */
export function canPaint(doc: Document): boolean {
  const view = doc.defaultView;
  return (
    view !== null &&
    typeof view.requestAnimationFrame === "function" &&
    !view.navigator.userAgent.includes("jsdom")
  );
}

/** Every portrait on the page, painted again on one shared frame clock. */
const portraits = new Set<HTMLCanvasElement>();
let ticking = false;

function paintPortrait(canvas: HTMLCanvasElement, nowMs: number): void {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  const ratio = Math.min(
    2,
    canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1,
  );
  const width = Math.max(1, Math.round(cssWidth * ratio));
  const height = Math.max(1, Math.round(cssHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const id = canvas.dataset.creature as GhostSoundId;
  const mood = (canvas.dataset.mood ?? "awake") as CreatureMood;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) / 112;
  ctx.translate(width / 2, height / 2 + 50 * scale);
  ctx.scale(scale, scale);
  if (mood === "outline") {
    ctx.globalAlpha = 0.35;
  }
  // A creature asleep keeps still; an awake one breathes, blinks and sways in place. Each keeps
  // its own phase, so the row never moves in step.
  const phase =
    canvas.dataset.phase === undefined ? 0 : Number(canvas.dataset.phase);
  paintCreature(ctx, id, {
    t: mood === "asleep" ? phase : nowMs / 1000 + phase,
    mood: mood === "asleep" ? "asleep" : "awake",
    stride: 0,
    menace: 0,
  });
}

function tick(nowMs: number): void {
  for (const canvas of portraits) {
    if (!canvas.isConnected) {
      continue;
    }
    paintPortrait(canvas, nowMs);
  }
  const view = [...portraits][0]?.ownerDocument.defaultView;
  if (portraits.size === 0 || view === null || view === undefined) {
    ticking = false;
    return;
  }
  view.requestAnimationFrame(tick);
}

let phaseCount = 0;

/**
 * Draws a creature as one canvas that paints itself again every frame (the rhythm game,
 * 2026-11-18). The drawing says nothing the words beside it do not say, so it is hidden from
 * anything that reads the page aloud. Its glow comes from `room.css`, by `data-creature`.
 */
export function drawCreature(
  doc: Document,
  id: GhostSoundId,
  mood: CreatureMood = "awake",
): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.className = "creature-art";
  canvas.dataset.creature = id;
  canvas.dataset.mood = mood;
  phaseCount += 1;
  canvas.dataset.phase = String((phaseCount * 0.37) % 3);
  canvas.setAttribute("aria-hidden", "true");
  if (canPaint(doc)) {
    portraits.add(canvas);
    if (!ticking) {
      ticking = true;
      doc.defaultView?.requestAnimationFrame(tick);
    }
  }
  return canvas;
}

/** Changes how a drawn creature looks. */
export function setCreatureMood(art: Element, mood: CreatureMood): void {
  if (art.getAttribute("data-mood") !== mood) {
    art.setAttribute("data-mood", mood);
  }
}

/** Stops painting portraits that have left the page for good. */
export function forgetLostPortraits(): void {
  for (const canvas of portraits) {
    if (!canvas.isConnected) {
      portraits.delete(canvas);
    }
  }
}

import { ambientMotionConfig } from "../../config/ambient-motion-config";
import type { RandomSource } from "../../config/seeded-random";
import type { GhostSoundId } from "../../config/sound-id";
import {
  createAmbientSchedule,
  type DoorShadow,
  type LampNudge,
} from "../ambient/ambient-schedule";
import { createDust, dustPosition } from "../ambient/dust";
import {
  doorShadowPosition,
  doorShadowStrength,
  lampAngleDegrees,
  nudgeStillSwings,
} from "../ambient/lamp-swing";
import {
  rippleDurationMs,
  rippleGlowStrength,
  rippleRings,
  sightingAt,
  sightingDurationMs,
  type SightingKind,
} from "../ripple/ripple-rings";
import type { HouseSection } from "./draw-house-section";
import { fitViewBox } from "./fit-view-box";
import { roomGeometry, type RoomGeometry } from "./house-geometry";

/** The side of the room a ripple starts from. */
export type RippleSide = "left" | "right";

/**
 * Everything in the house that moves: dust, the lamp, the shadow under the door, the ripple of a
 * caught sound and the shape of a scored one. It is told which room is lit and when to draw a
 * ripple or a shape, and nothing else.
 */
export interface MotionLayer {
  /** The canvas to lay exactly over the drawing of the house. */
  readonly canvas: HTMLCanvasElement;
  /** The room whose dust and lamp move. `null` stills everything. */
  setLitRoom(roomId: GhostSoundId | null): void;
  /** Draws a ripple from one wall of the lit room. Call it only after a trial has been scored. */
  ripple(side: RippleSide): void;
  /**
   * Draws the shape of a scored sound by one wall of the lit room: lit and near for a caught
   * sound, faint and leaving for one that went by. Call it only after a trial has been scored.
   */
  sighting(side: RippleSide, kind: SightingKind): void;
  /** Stops drawing and lets go of the page. */
  stop(): void;
}

export interface MotionLayerOptions {
  readonly doc: Document;
  readonly view: Window;
  readonly house: HouseSection;
  /** A random source of its own. It must not be shared with anything that schedules sound. */
  readonly random: RandomSource;
}

interface ActiveRipple {
  readonly side: RippleSide;
  readonly roomId: GhostSoundId;
  readonly startedMs: number;
  readonly reducedMotion: boolean;
}

interface ActiveSighting {
  readonly side: RippleSide;
  readonly kind: SightingKind;
  readonly roomId: GhostSoundId;
  readonly startedMs: number;
  readonly reducedMotion: boolean;
}

const doorGapLeft = 458;
const doorGapWidth = 40;
const doorShadowWidth = 18;

/** Height at which a ripple starts on the wall: the middle of the wall's upright part. */
function rippleHeight(room: RoomGeometry): number {
  // An outline runs clockwise from the bottom left, so its second point is the top of the wall.
  const wallTop = room.outline[1]?.[1] ?? room.top;
  return (wallTop + room.bottom) / 2;
}

function traceOutline(
  context: CanvasRenderingContext2D,
  room: RoomGeometry,
): void {
  context.beginPath();
  room.outline.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.closePath();
}

/**
 * Starts the moving layer of the house. Ambient motion follows a schedule drawn from `random`
 * and from the clock of the page. With reduced motion it runs at a small fraction of its speed
 * and a ripple becomes a still glow.
 */
export function startMotionLayer(options: MotionLayerOptions): MotionLayer {
  const { doc, view, house, random } = options;
  const canvas = doc.createElement("canvas");
  canvas.className = "house-motion";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");

  const schedule = createAmbientSchedule(random);
  const dust = createDust(random);
  const reducedMotionQuery = view.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  const rootStyle = view.getComputedStyle(doc.documentElement);
  const lampColour =
    rootStyle.getPropertyValue("--color-lamp").trim() || "#f3b562";
  const graphiteColour =
    rootStyle.getPropertyValue("--color-graphite").trim() || "#8a93a6";

  let litRoom: GhostSoundId | null = null;
  let swungLamp: GhostSoundId | null = null;
  let nudges: LampNudge[] = [];
  let shadow: DoorShadow | null = null;
  let ripples: ActiveRipple[] = [];
  let sightings: ActiveSighting[] = [];
  let ambientMs = 0;
  let lastFrameMs: number | null = null;
  let frame: number | null = null;
  let stopped = false;

  const resize = (): void => {
    const ratio = Math.min(view.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  const stillLamp = (): void => {
    if (swungLamp !== null) {
      house.lampOf(swungLamp).style.transform = "";
      swungLamp = null;
    }
    house.doorGap.setAttribute("opacity", "0");
  };

  const moveLampAndShadow = (roomId: GhostSoundId, reduced: boolean): void => {
    for (const event of schedule.takeUntil(ambientMs)) {
      if (event.kind === "lampNudge") {
        nudges.push(event);
      } else {
        shadow = event;
      }
    }
    nudges = nudges.filter((nudge) => nudgeStillSwings(nudge, ambientMs));
    const swing = reduced ? ambientMotionConfig.reducedMotionSwingFraction : 1;
    const angle = lampAngleDegrees(nudges, ambientMs) * swing;
    if (swungLamp !== null && swungLamp !== roomId) {
      house.lampOf(swungLamp).style.transform = "";
    }
    house.lampOf(roomId).style.transform = `rotate(${angle.toFixed(3)}deg)`;
    swungLamp = roomId;

    if (shadow !== null && roomId === "corridor") {
      const strength = doorShadowStrength(shadow, ambientMs);
      const travel = doorGapWidth - doorShadowWidth;
      house.doorGap.setAttribute(
        "x",
        (doorGapLeft + travel * doorShadowPosition(shadow, ambientMs)).toFixed(
          2,
        ),
      );
      house.doorGap.setAttribute("width", String(doorShadowWidth));
      house.doorGap.setAttribute("opacity", (strength * 0.85).toFixed(3));
    } else {
      house.doorGap.setAttribute("opacity", "0");
    }
  };

  const drawDust = (
    target: CanvasRenderingContext2D,
    room: RoomGeometry,
  ): void => {
    const bulbX = room.lampAnchor[0];
    const bulbY = room.lampAnchor[1] + room.lampCordLength + 14;
    target.save();
    traceOutline(target, room);
    target.clip();
    target.fillStyle = lampColour;
    for (const mote of dust) {
      const place = dustPosition(mote, ambientMs);
      const x = room.left + place.x * (room.right - room.left);
      const y = room.top + place.y * (room.bottom - room.top);
      // A mote shows only where the lamp's light reaches it, and fades near floor and ceiling.
      const reach = Math.max(0, 1 - Math.hypot(x - bulbX, y - bulbY) / 190);
      const edge = Math.sin(Math.PI * place.y);
      const alpha = 0.6 * reach * edge;
      if (alpha <= 0.01) {
        continue;
      }
      target.globalAlpha = alpha;
      target.beginPath();
      target.arc(x, y, mote.radius, 0, 2 * Math.PI);
      target.fill();
    }
    target.restore();
  };

  const drawRipple = (
    target: CanvasRenderingContext2D,
    ripple: ActiveRipple,
    nowMs: number,
  ): void => {
    const room = roomGeometry[ripple.roomId];
    const age = nowMs - ripple.startedMs;
    const wallX = ripple.side === "left" ? room.left : room.right;
    const y = rippleHeight(room);
    const reachAcross = room.right - room.left;
    target.save();
    traceOutline(target, room);
    target.clip();
    if (ripple.reducedMotion) {
      const strength = rippleGlowStrength(age);
      const glow = target.createRadialGradient(wallX, y, 0, wallX, y, 120);
      glow.addColorStop(0, lampColour);
      glow.addColorStop(1, "transparent");
      target.globalAlpha = 0.55 * strength;
      target.fillStyle = glow;
      target.fillRect(room.left, room.top, reachAcross, room.bottom - room.top);
    } else {
      target.strokeStyle = lampColour;
      target.lineCap = "round";
      for (const ring of rippleRings(age)) {
        target.globalAlpha = ring.strength;
        target.lineWidth = 3.2 - ring.spread * 1.8;
        target.beginPath();
        target.arc(wallX, y, 6 + ring.spread * reachAcross, 0, 2 * Math.PI);
        target.stroke();
      }
    }
    target.restore();
  };

  /**
   * The shape of a scored sound: a small hooded figure with a ragged hem, drawn in the pencil's
   * line. A caught one stands in the lamp's colour a little way in from its wall and rises a
   * touch. One that went by is a broken grey line that leaves through its wall.
   */
  const drawSighting = (
    target: CanvasRenderingContext2D,
    sighting: ActiveSighting,
    nowMs: number,
  ): void => {
    const now = sightingAt(sighting.kind, nowMs - sighting.startedMs);
    if (now === null) {
      return;
    }
    const room = roomGeometry[sighting.roomId];
    const roomWidth = room.right - room.left;
    const height = (room.bottom - room.top) * 0.44;
    const width = height * 0.62;
    const inward = sighting.side === "left" ? 1 : -1;
    const wallX = sighting.side === "left" ? room.left : room.right;
    const caught = sighting.kind === "caught";
    const drift = sighting.reducedMotion ? 0 : now.drift;
    // A caught shape stands a fifth of the way in. One that went by starts there and leaves.
    const x = wallX + inward * roomWidth * (caught ? 0.2 : 0.2 - 0.24 * drift);
    const y = rippleHeight(room) - (caught ? 6 * drift : 0);
    const half = width / 2;
    const top = y - height / 2;
    const bottom = y + height / 2;

    target.save();
    traceOutline(target, room);
    target.clip();
    target.globalAlpha = now.strength * (caught ? 0.95 : 0.6);
    target.strokeStyle = caught ? lampColour : graphiteColour;
    target.fillStyle = caught ? lampColour : graphiteColour;
    target.lineWidth = caught ? 2.2 : 1.6;
    target.lineCap = "round";
    target.lineJoin = "round";
    target.setLineDash(caught ? [] : [5, 6]);
    target.beginPath();
    target.moveTo(x - half, bottom);
    target.lineTo(x - half, top + half);
    target.arc(x, top + half, half, Math.PI, 0);
    target.lineTo(x + half, bottom);
    // The hem: three scallops back to where the line began.
    const scallop = width / 3;
    for (let index = 0; index < 3; index += 1) {
      const fromX = x + half - index * scallop;
      target.quadraticCurveTo(
        fromX - scallop / 2,
        bottom - height * 0.14,
        fromX - scallop,
        bottom,
      );
    }
    target.stroke();
    if (caught) {
      target.save();
      target.globalAlpha *= 0.14;
      target.fill();
      target.restore();
    }
    // Two eyes, looking into the room.
    target.setLineDash([]);
    const eyeY = top + half * 0.95;
    for (const offset of [-0.32, 0.32]) {
      target.beginPath();
      target.ellipse(
        x + offset * half * 1.1 + inward * half * 0.12,
        eyeY,
        half * 0.13,
        half * 0.2,
        0,
        0,
        2 * Math.PI,
      );
      target.fill();
    }
    target.restore();
  };

  const draw = (nowMs: number): void => {
    frame = null;
    if (stopped) {
      return;
    }
    const reduced = reducedMotionQuery.matches;
    const elapsed =
      lastFrameMs === null ? 0 : Math.min(nowMs - lastFrameMs, 250);
    lastFrameMs = nowMs;
    ambientMs +=
      elapsed * (reduced ? ambientMotionConfig.reducedMotionSpeedFraction : 1);
    ripples = ripples.filter(
      (ripple) =>
        nowMs - ripple.startedMs < rippleDurationMs(ripple.reducedMotion),
    );
    sightings = sightings.filter(
      (sighting) =>
        nowMs - sighting.startedMs < sightingDurationMs(sighting.kind),
    );

    if (litRoom === null) {
      stillLamp();
    } else {
      moveLampAndShadow(litRoom, reduced);
    }

    if (context !== null) {
      resize();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const fit = fitViewBox(canvas.width, canvas.height);
      if (fit.scale > 0) {
        context.setTransform(
          fit.scale,
          0,
          0,
          fit.scale,
          fit.offsetX,
          fit.offsetY,
        );
        if (litRoom !== null) {
          drawDust(context, roomGeometry[litRoom]);
        }
        for (const ripple of ripples) {
          drawRipple(context, ripple, nowMs);
        }
        for (const sighting of sightings) {
          drawSighting(context, sighting, nowMs);
        }
      }
    }

    if (litRoom !== null || ripples.length > 0 || sightings.length > 0) {
      frame = view.requestAnimationFrame(draw);
    } else {
      lastFrameMs = null;
    }
  };

  const wake = (): void => {
    if (!stopped && frame === null) {
      frame = view.requestAnimationFrame(draw);
    }
  };

  return {
    canvas,
    setLitRoom(roomId) {
      litRoom = roomId;
      wake();
    },
    ripple(side) {
      if (litRoom === null || stopped) {
        return;
      }
      ripples.push({
        side,
        roomId: litRoom,
        startedMs: view.performance.now(),
        reducedMotion: reducedMotionQuery.matches,
      });
      wake();
    },
    sighting(side, kind) {
      if (litRoom === null || stopped) {
        return;
      }
      sightings.push({
        side,
        kind,
        roomId: litRoom,
        startedMs: view.performance.now(),
        reducedMotion: reducedMotionQuery.matches,
      });
      wake();
    },
    stop() {
      stopped = true;
      if (frame !== null) {
        view.cancelAnimationFrame(frame);
        frame = null;
      }
      stillLamp();
    },
  };
}

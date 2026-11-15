import {
  ambientMotionConfig,
  type AmbientMotionConfig,
} from "../../config/ambient-motion-config";
import type { DoorShadow, LampNudge } from "./ambient-schedule";

/**
 * The angle of the lamp at `nowMs`, in degrees from straight down. Each nudge starts a swing that
 * dies away, and the swings add up. A nudge in the future adds nothing. The result never leaves
 * the range of `lampMaxDegrees`.
 */
export function lampAngleDegrees(
  nudges: readonly LampNudge[],
  nowMs: number,
  config: AmbientMotionConfig = ambientMotionConfig,
): number {
  let angle = 0;
  for (const nudge of nudges) {
    const age = nowMs - nudge.atMs;
    if (age < 0) {
      continue;
    }
    angle +=
      nudge.degrees *
      Math.exp(-age / config.lampDecayMs) *
      Math.sin((2 * Math.PI * age) / config.lampPeriodMs);
  }
  return Math.max(
    -config.lampMaxDegrees,
    Math.min(config.lampMaxDegrees, angle),
  );
}

/** Whether a nudge still moves the lamp by an amount anyone could see. */
export function nudgeStillSwings(
  nudge: LampNudge,
  nowMs: number,
  config: AmbientMotionConfig = ambientMotionConfig,
): boolean {
  const age = nowMs - nudge.atMs;
  return Math.abs(nudge.degrees) * Math.exp(-age / config.lampDecayMs) > 0.02;
}

/**
 * How dark the shadow under the door is at `nowMs`, from 0 (none) to 1. It rises and falls
 * smoothly over the shadow's duration and is 0 before and after.
 */
export function doorShadowStrength(shadow: DoorShadow, nowMs: number): number {
  const age = nowMs - shadow.atMs;
  if (age <= 0 || age >= shadow.durationMs) {
    return 0;
  }
  return Math.sin((Math.PI * age) / shadow.durationMs) ** 2;
}

/**
 * Where the shadow is along the gap under the door at `nowMs`, from 0 (one end) to 1 (the other).
 * It crosses once while it passes.
 */
export function doorShadowPosition(shadow: DoorShadow, nowMs: number): number {
  const age = nowMs - shadow.atMs;
  return Math.max(0, Math.min(1, age / shadow.durationMs));
}

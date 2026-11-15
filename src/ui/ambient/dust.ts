import {
  ambientMotionConfig,
  type AmbientMotionConfig,
} from "../../config/ambient-motion-config";
import type { RandomSource } from "../../config/seeded-random";

/** One mote of dust. Its path is fixed when it is made. */
export interface DustMote {
  /** Where it starts, as fractions of the room's width and height. */
  readonly startX: number;
  readonly startY: number;
  /** Time it takes to sink from the ceiling to the floor. */
  readonly fallMs: number;
  /** How far it wanders to each side, as a fraction of the room's width. */
  readonly swayWidth: number;
  /** Time of one sway from side to side and back. */
  readonly swayMs: number;
  /** Where in its sway it starts, in radians. */
  readonly swayPhase: number;
  /** Radius in the units of the drawing. */
  readonly radius: number;
}

/** A mote's place at one moment, as fractions of the room's width and height. */
export interface DustPosition {
  readonly x: number;
  readonly y: number;
}

/** Makes the motes of one visit. The same seed gives the same motes. */
export function createDust(
  random: RandomSource,
  config: AmbientMotionConfig = ambientMotionConfig,
): DustMote[] {
  const motes: DustMote[] = [];
  for (let index = 0; index < config.dustCount; index += 1) {
    motes.push({
      startX: random.next(),
      startY: random.next(),
      fallMs:
        config.dustFallMinMs +
        random.next() * (config.dustFallMaxMs - config.dustFallMinMs),
      swayWidth: 0.01 + random.next() * 0.035,
      swayMs: 7000 + random.next() * 9000,
      swayPhase: random.next() * 2 * Math.PI,
      radius: 0.7 + random.next() * 0.9,
    });
  }
  return motes;
}

/**
 * Where a mote is at `nowMs`. It sinks at a steady pace and starts again at the ceiling when it
 * reaches the floor, swaying a little on the way. Both coordinates stay within 0 to 1.
 */
export function dustPosition(mote: DustMote, nowMs: number): DustPosition {
  const fallen = (mote.startY + nowMs / mote.fallMs) % 1;
  const sway =
    mote.swayWidth *
    Math.sin((2 * Math.PI * nowMs) / mote.swayMs + mote.swayPhase);
  const x = mote.startX + sway;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: fallen < 0 ? fallen + 1 : fallen,
  };
}

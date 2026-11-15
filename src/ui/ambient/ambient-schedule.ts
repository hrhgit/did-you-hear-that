import {
  ambientMotionConfig,
  type AmbientMotionConfig,
} from "../../config/ambient-motion-config";
import type { RandomSource } from "../../config/seeded-random";

/** The lamp is pushed a little to one side. `degrees` is signed: negative swings it left first. */
export interface LampNudge {
  readonly kind: "lampNudge";
  readonly atMs: number;
  readonly degrees: number;
}

/** A shadow passes under the corridor door, taking `durationMs`. */
export interface DoorShadow {
  readonly kind: "doorShadow";
  readonly atMs: number;
  readonly durationMs: number;
}

export type AmbientEvent = LampNudge | DoorShadow;

/**
 * The things that happen in the lit room, in time order. The schedule is drawn from its own
 * random source. It takes no other input, so it cannot depend on when a sound plays or on which
 * side (product.md, Experience rules).
 */
export interface AmbientSchedule {
  /** Every event at or before `untilMs` that has not been handed out yet, earliest first. */
  takeUntil(untilMs: number): AmbientEvent[];
}

function between(random: RandomSource, low: number, high: number): number {
  return low + random.next() * (high - low);
}

/**
 * Creates the schedule of ambient motion. Time starts at 0 when the schedule is made. The same
 * seed gives the same events whatever the times at which `takeUntil` is called, because the next
 * event of each kind is always drawn when the one before it is handed out.
 */
export function createAmbientSchedule(
  random: RandomSource,
  config: AmbientMotionConfig = ambientMotionConfig,
): AmbientSchedule {
  const drawNudge = (afterMs: number): LampNudge => {
    const atMs =
      afterMs +
      between(random, config.lampNudgeGapMinMs, config.lampNudgeGapMaxMs);
    const size = between(
      random,
      config.lampNudgeMinDegrees,
      config.lampNudgeMaxDegrees,
    );
    return {
      kind: "lampNudge",
      atMs,
      degrees: random.next() < 0.5 ? -size : size,
    };
  };
  const drawShadow = (afterMs: number): DoorShadow => ({
    kind: "doorShadow",
    atMs:
      afterMs +
      between(random, config.doorShadowGapMinMs, config.doorShadowGapMaxMs),
    durationMs: between(random, config.doorShadowMinMs, config.doorShadowMaxMs),
  });

  let nextNudge = drawNudge(0);
  let nextShadow = drawShadow(0);

  return {
    takeUntil(untilMs) {
      const due: AmbientEvent[] = [];
      for (;;) {
        if (nextNudge.atMs <= nextShadow.atMs) {
          if (nextNudge.atMs > untilMs) {
            return due;
          }
          due.push(nextNudge);
          nextNudge = drawNudge(nextNudge.atMs);
        } else {
          if (nextShadow.atMs > untilMs) {
            return due;
          }
          due.push(nextShadow);
          // The next shadow waits until this one has passed.
          nextShadow = drawShadow(nextShadow.atMs + nextShadow.durationMs);
        }
      }
    },
  };
}

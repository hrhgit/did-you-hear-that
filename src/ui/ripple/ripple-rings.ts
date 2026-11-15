import { rippleConfig, type RippleConfig } from "../../config/ripple-config";

/** One ring of a ripple at one moment. */
export interface RippleRing {
  /** How far the ring has spread, from 0 (at the wall) to 1 (across the whole room). */
  readonly spread: number;
  /** How strongly it is drawn, from 0 to 1. */
  readonly strength: number;
}

/** How long a whole ripple lasts, from its first ring's start to its last ring's end. */
export function rippleDurationMs(
  reducedMotion: boolean,
  config: RippleConfig = rippleConfig,
): number {
  return reducedMotion
    ? config.reducedMotionGlowMs
    : config.ringMs + (config.ringCount - 1) * config.ringGapMs;
}

/** Rises from 0 to 1 over `fadeInMs`, then falls back to 0 by `totalMs`, with no step anywhere. */
function swell(ageMs: number, fadeInMs: number, totalMs: number): number {
  if (ageMs <= 0 || ageMs >= totalMs) {
    return 0;
  }
  if (ageMs < fadeInMs) {
    return Math.sin((Math.PI / 2) * (ageMs / fadeInMs)) ** 2;
  }
  return (
    Math.cos((Math.PI / 2) * ((ageMs - fadeInMs) / (totalMs - fadeInMs))) ** 2
  );
}

/**
 * The rings of a ripple that is `ageMs` old. Each ring starts at the wall, spreads across the
 * room while slowing down, and fades. Rings that have not started or have ended are left out.
 */
export function rippleRings(
  ageMs: number,
  config: RippleConfig = rippleConfig,
): RippleRing[] {
  const rings: RippleRing[] = [];
  for (let index = 0; index < config.ringCount; index += 1) {
    const ringAge = ageMs - index * config.ringGapMs;
    if (ringAge <= 0 || ringAge >= config.ringMs) {
      continue;
    }
    const progress = ringAge / config.ringMs;
    rings.push({
      spread: 1 - (1 - progress) ** 2,
      // Later rings are fainter, like the second and third ring on water.
      strength:
        swell(ringAge, config.fadeInMinMs, config.ringMs) *
        (1 - index / (config.ringCount + 1)),
    });
  }
  return rings;
}

/**
 * How strongly the still glow that stands in for a ripple is drawn when it is `ageMs` old, from
 * 0 to 1. Used when the visitor has asked for reduced motion.
 */
export function rippleGlowStrength(
  ageMs: number,
  config: RippleConfig = rippleConfig,
): number {
  return swell(ageMs, config.fadeInMinMs * 1.5, config.reducedMotionGlowMs);
}

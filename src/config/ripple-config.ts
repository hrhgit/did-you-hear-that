/**
 * How the ripple of a caught sound is drawn, and the shape that shows with it or leaves when a
 * sound went by. Both appear only after their trial has been scored, so nothing here can give a
 * sound away. These values do not affect sound or scoring.
 * Every field name ends in its unit.
 */
export interface RippleConfig {
  /** Number of rings in one ripple. */
  readonly ringCount: number;
  /** Time between the start of one ring and the next. */
  readonly ringGapMs: number;
  /** Time one ring takes to cross the room and fade. */
  readonly ringMs: number;
  /** With reduced motion a ripple is a still glow at the wall that lasts this long. */
  readonly reducedMotionGlowMs: number;
  /** Shortest time any ripple takes to reach its brightest, so that it never flashes. */
  readonly fadeInMinMs: number;
  /** How long the shape of a caught sound shows beside its ripple. */
  readonly sightingMs: number;
  /** How long the fainter shape of a sound that went by shows as it leaves. */
  readonly slippedSightingMs: number;
}

export const rippleConfig: RippleConfig = Object.freeze({
  ringCount: 3,
  ringGapMs: 340,
  ringMs: 2200,
  reducedMotionGlowMs: 1600,
  fadeInMinMs: 240,
  sightingMs: 1900,
  slippedSightingMs: 1500,
});

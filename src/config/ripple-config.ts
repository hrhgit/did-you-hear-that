/**
 * How the ripple of a caught sound is drawn. A ripple appears only after its trial has been
 * scored, so nothing here can give a sound away. These values do not affect sound or scoring.
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
}

export const rippleConfig: RippleConfig = Object.freeze({
  ringCount: 3,
  ringGapMs: 340,
  ringMs: 2200,
  reducedMotionGlowMs: 1600,
  fadeInMinMs: 240,
});

/**
 * How the lit room moves while the visitor listens: dust in the lamp light, the lamp swinging on
 * its cord and a shadow passing under a door. These values shape a schedule that is drawn from its
 * own random source and knows nothing about any trial (product.md, Experience rules). They do not
 * affect sound or scoring. Every field name ends in its unit.
 */
export interface AmbientMotionConfig {
  /** Shortest and longest wait between two nudges of the lamp. */
  readonly lampNudgeGapMinMs: number;
  readonly lampNudgeGapMaxMs: number;
  /** Smallest and largest swing a nudge adds, to either side. */
  readonly lampNudgeMinDegrees: number;
  readonly lampNudgeMaxDegrees: number;
  /** Time of one full swing of the lamp. */
  readonly lampPeriodMs: number;
  /** Time after which a swing has faded to about a third of its size. */
  readonly lampDecayMs: number;
  /** The lamp never swings further than this, however many nudges add up. */
  readonly lampMaxDegrees: number;
  /** Shortest and longest wait between two shadows under the door. */
  readonly doorShadowGapMinMs: number;
  readonly doorShadowGapMaxMs: number;
  /** Shortest and longest time one shadow takes to pass. */
  readonly doorShadowMinMs: number;
  readonly doorShadowMaxMs: number;
  /** Number of dust motes in the lit room. */
  readonly dustCount: number;
  /** Shortest and longest time a mote takes to sink from the ceiling to the floor. */
  readonly dustFallMinMs: number;
  readonly dustFallMaxMs: number;
  /** With reduced motion, time runs at this fraction of its speed for all ambient motion. */
  readonly reducedMotionSpeedFraction: number;
  /** With reduced motion, the lamp swings at this fraction of its size. */
  readonly reducedMotionSwingFraction: number;
}

export const ambientMotionConfig: AmbientMotionConfig = Object.freeze({
  lampNudgeGapMinMs: 5000,
  lampNudgeGapMaxMs: 14000,
  lampNudgeMinDegrees: 0.5,
  lampNudgeMaxDegrees: 2,
  lampPeriodMs: 2700,
  lampDecayMs: 4200,
  lampMaxDegrees: 4,
  doorShadowGapMinMs: 17000,
  doorShadowGapMaxMs: 46000,
  doorShadowMinMs: 2600,
  doorShadowMaxMs: 5200,
  dustCount: 18,
  dustFallMinMs: 38000,
  dustFallMaxMs: 90000,
  reducedMotionSpeedFraction: 0.08,
  reducedMotionSwingFraction: 0.15,
});

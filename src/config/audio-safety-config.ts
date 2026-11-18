/**
 * Values from the "Current values" table in `.kiro/steering/audio-safety.md`. The project owner
 * dropped the audio safety rules on 2026-11-17: these are defaults, and may be changed freely.
 * The output stage enforces only the ceiling, which is the top of the level scale. The fade and
 * the length are what the house's sounds are built to, not limits on what may be played.
 *
 * The absolute digital ceiling from the same table has been added to this file by the
 * audio-output spec, which owns it (ghost-sounds design.md, D1; audio-output design.md, D1).
 * Every field name ends in its unit.
 */
export interface AudioSafetyConfig {
  /** Shortest fade in and fade out the house's sounds are built with. */
  readonly fadeMinMs: number;
  /**
   * Longest single ghost sound as built, also used for the calibration noise (ghost-sounds D8), and
   * the length the visit flow's timings are measured from. The calibration music plays without a
   * break. The output stage no longer refuses a longer sound (2026-11-17).
   */
  readonly ghostSoundMaxDurationMs: number;
  /** Largest absolute value of any output sample, as a fraction of full scale. Equal is allowed. */
  readonly ceilingFraction: number;
}

/** Freezes a value and everything reachable from it, so no field can change at run time. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export const audioSafetyConfig: AudioSafetyConfig = deepFreeze({
  // "Shortest fade the house's sounds are built with | 20 ms"
  fadeMinMs: 20,
  // "Longest ghost sound as built | 1.5 s"
  ghostSoundMaxDurationMs: 1500,
  // "Absolute digital ceiling | no output sample beyond 0.25 of full scale, about 12 dB below full scale"
  ceilingFraction: 0.25,
});

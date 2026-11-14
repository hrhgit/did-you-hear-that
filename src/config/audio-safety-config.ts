/**
 * Values from the "Initial values" table in `.kiro/steering/audio-safety.md`. They are starting
 * values chosen on the cautious side. They may be made stricter at any time. Loosening one (a
 * shorter fade, a longer sound, a higher ceiling) needs the project owner's approval first.
 *
 * The absolute digital ceiling from the same table is added to this file by the audio-output
 * spec, which owns it (ghost-sounds design.md, D1). Every field name ends in its unit.
 */
export interface AudioSafetyConfig {
  /** Shortest fade in and fade out of any sound. */
  readonly fadeMinMs: number;
  /** Longest single ghost sound. Also applied to the calibration noise (ghost-sounds D8). */
  readonly ghostSoundMaxDurationMs: number;
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
  // "Shortest fade in and fade out | 20 ms"
  fadeMinMs: 20,
  // "Longest ghost sound | 1.5 s"
  ghostSoundMaxDurationMs: 1500,
});

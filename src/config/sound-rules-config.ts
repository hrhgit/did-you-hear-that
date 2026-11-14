import type { GhostSoundId } from "./sound-id";

/**
 * The values that decide the sound rules and how they are measured, from
 * `docs/briefs/02-ghost-sounds.md` and the Decisions section of
 * `.kiro/specs/ghost-sounds/design.md`. The shortest fade and the longest sound are not here: they
 * come from the steering and live in `audio-safety-config.ts`. Every field name ends in its unit.
 */
export interface SoundRulesConfig {
  /** Width of a room's band, as a fraction of an octave, centred geometrically on the room pitch. */
  readonly bandWidthOctaveFraction: number;
  /** Smallest distance of out-of-band energy below in-band energy. */
  readonly outOfBandBelowInBandMinDb: number;
  /** RMS of every sound over its whole buffer, as a fraction of full scale. */
  readonly referenceRmsFraction: number;
  /** Largest allowed distance of a sound's RMS from the reference RMS. */
  readonly levelToleranceDb: number;
  /** Widest spectrum bin the band measurement may use. */
  readonly spectrumBinWidthMaxHz: number;
  /** Lowest sample rate the render functions accept. */
  readonly sampleRateMinHz: number;
  /** Design margin between any planned frequency and a band edge. Checked in config tests only. */
  readonly bandEdgeMarginOctaveFraction: number;
  /** Target level of the calibration noise in each room band, relative to its loudest room band. */
  readonly calibrationShapeDb: Readonly<Record<GhostSoundId, number>>;
  /** Largest allowed distance of a measured room band level from `calibrationShapeDb`. */
  readonly calibrationShapeToleranceDb: number;
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

export const soundRulesConfig: SoundRulesConfig = deepFreeze({
  // Brief 02: "one third of an octave around the centre". Geometric, base 2 (D2)
  bandWidthOctaveFraction: 1 / 3,
  // Brief 02: "at least 30 dB below the energy inside it"
  outOfBandBelowInBandMinDb: 30,
  // D7: about 26 dB below full scale, so no buffer clips on its own
  referenceRmsFraction: 0.05,
  // D7: absorbs only the rounding to 32-bit floats
  levelToleranceDb: 0.01,
  // D3: zero-padding to at least two seconds of samples
  spectrumBinWidthMaxHz: 0.5,
  // D12: the lowest common rate that carries the attic band
  sampleRateMinHz: 22050,
  // D10: room for the spread caused by the envelopes
  bandEdgeMarginOctaveFraction: 1 / 24,
  // D8: a starting guess with no measured source, to be tuned by ear
  calibrationShapeDb: {
    cellar: -9,
    corridor: -6,
    nursery: -3,
    stairs: 0,
    attic: -2,
  },
  // D8
  calibrationShapeToleranceDb: 1,
});

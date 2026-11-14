/**
 * The parameters of each of the six sounds, from the Sound parameters table in
 * `.kiro/specs/ghost-sounds/design.md`. Every value is a starting point, to be tuned by ear once
 * the audio-output listening page exists (D29). Times are in milliseconds, frequencies in hertz,
 * level ranges in decibels and depths as fractions.
 *
 * The object is keyed by sound id. Every field of each entry ends in its unit (D30).
 *
 * A "range" in decibels gives the spread of a level drawn per event: a value of 3 means each event
 * is drawn from -3 dB to 0 dB. A "depth" is the size of a slow modulation as a fraction of the
 * modulated quantity.
 */
export interface CellarKnockConfig {
  readonly centreHz: number;
  readonly durationMs: number;
  readonly outerFadeMs: number;
  readonly knockCount: number;
  readonly firstKnockOnsetMinMs: number;
  readonly firstKnockOnsetMaxMs: number;
  readonly knockIntervalMinMs: number;
  readonly knockIntervalMaxMs: number;
  readonly knockAttackMs: number;
  readonly knockDecayMs: number;
  /** Largest relative distance of a knock's carrier from the centre. */
  readonly knockCarrierDeviationMaxFraction: number;
  readonly knockLevelRangeDb: number;
}

export interface CorridorHumConfig {
  readonly centreHz: number;
  readonly durationMs: number;
  readonly outerFadeMs: number;
  readonly bodyAttackMs: number;
  readonly bodyReleaseMs: number;
  /** Number of slow sinusoids added to the pitch. */
  readonly pitchWobbleSinusoidCount: number;
  /** Depth of each pitch sinusoid. */
  readonly pitchWobbleDepthFraction: number;
  readonly pitchWobbleRateMinHz: number;
  readonly pitchWobbleRateMaxHz: number;
  readonly levelWobbleDepthFraction: number;
  readonly levelWobbleRateMinHz: number;
  readonly levelWobbleRateMaxHz: number;
}

export interface NurseryMusicBoxConfig {
  readonly centreHz: number;
  readonly durationMs: number;
  readonly outerFadeMs: number;
  readonly noteCount: number;
  readonly noteFrequenciesHz: readonly number[];
  readonly firstNoteOnsetMinMs: number;
  readonly firstNoteOnsetMaxMs: number;
  readonly noteIntervalMinMs: number;
  readonly noteIntervalMaxMs: number;
  readonly noteAttackMs: number;
  readonly noteDecayTimeConstantMs: number;
  readonly noteLengthMs: number;
  readonly noteReleaseMs: number;
}

export interface StairsScrapeConfig {
  readonly centreHz: number;
  readonly durationMs: number;
  readonly outerFadeMs: number;
  /** The noise is flat within this distance of the centre, in octaves. */
  readonly noiseHalfWidthOctaveFraction: number;
  /** Then it falls to zero over this distance, in octaves. */
  readonly noiseTaperOctaveFraction: number;
  readonly grainLengthMinMs: number;
  readonly grainLengthMaxMs: number;
  readonly grainSpacingMinMs: number;
  readonly grainSpacingMaxMs: number;
  readonly grainLevelRangeDb: number;
}

export interface AtticWhineConfig {
  readonly centreHz: number;
  readonly durationMs: number;
  readonly outerFadeMs: number;
  readonly bodyAttackMs: number;
  readonly bodyReleaseMs: number;
  readonly carrierDeviationMaxFraction: number;
  readonly pitchWobbleDepthFraction: number;
  readonly pitchWobbleRateMinHz: number;
  readonly pitchWobbleRateMaxHz: number;
}

export interface CalibrationHissConfig {
  readonly durationMs: number;
  readonly outerFadeMs: number;
  /** The low cut rises from zero here, with a raised cosine in log frequency... */
  readonly lowCutStartHz: number;
  /** ...to full gain here. */
  readonly lowCutEndHz: number;
  /** The high cut falls from full gain here, with a raised cosine in log frequency... */
  readonly highCutStartHz: number;
  /** ...to zero here. */
  readonly highCutEndHz: number;
}

export interface GhostSoundConfig {
  readonly cellar: CellarKnockConfig;
  readonly corridor: CorridorHumConfig;
  readonly nursery: NurseryMusicBoxConfig;
  readonly stairs: StairsScrapeConfig;
  readonly attic: AtticWhineConfig;
  readonly calibration: CalibrationHissConfig;
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

// Every value below comes from the Sound parameters table in design.md ("ghost-sound-config.ts"),
// which takes the feasibility sketches and adjusts them for D5 (every event rises over at least
// the shortest fade) and D6 (outer fades of 30 ms for tones and 50 ms for noise).
export const ghostSoundConfig: GhostSoundConfig = deepFreeze({
  cellar: {
    // hearing-method.md, "Rooms, full visit"
    centreHz: 500,
    durationMs: 900,
    // D6: tone sound
    outerFadeMs: 30,
    knockCount: 3,
    firstKnockOnsetMinMs: 30,
    firstKnockOnsetMaxMs: 70,
    knockIntervalMinMs: 220,
    knockIntervalMaxMs: 320,
    // D5, and the band rule at 500 Hz (Feasibility)
    knockAttackMs: 25,
    knockDecayMs: 90,
    knockCarrierDeviationMaxFraction: 0.01,
    knockLevelRangeDb: 3,
  },
  corridor: {
    centreHz: 1000,
    durationMs: 1200,
    // D6: tone sound
    outerFadeMs: 30,
    bodyAttackMs: 150,
    bodyReleaseMs: 200,
    // design.md: "0.0075 for each of two slow sinusoids" (D30)
    pitchWobbleSinusoidCount: 2,
    pitchWobbleDepthFraction: 0.0075,
    pitchWobbleRateMinHz: 2,
    pitchWobbleRateMaxHz: 5,
    levelWobbleDepthFraction: 0.2,
    levelWobbleRateMinHz: 1.5,
    levelWobbleRateMaxHz: 3,
  },
  nursery: {
    centreHz: 2000,
    durationMs: 1400,
    // D6: tone sound
    outerFadeMs: 30,
    noteCount: 4,
    // 2000 Hz times 2^(k/12) for k = -1, 0, 1: three pitches a semitone apart
    noteFrequenciesHz: [2000 * 2 ** (-1 / 12), 2000, 2000 * 2 ** (1 / 12)],
    firstNoteOnsetMinMs: 30,
    firstNoteOnsetMaxMs: 50,
    noteIntervalMinMs: 240,
    noteIntervalMaxMs: 290,
    // D5
    noteAttackMs: 25,
    noteDecayTimeConstantMs: 120,
    noteLengthMs: 400,
    noteReleaseMs: 60,
  },
  stairs: {
    centreHz: 4000,
    durationMs: 800,
    // D6 gives noise sounds 50 ms. D37: 80 ms, because with 50 ms a few seeds in a thousand
    // measured a fade out just under 20 ms
    outerFadeMs: 80,
    noiseHalfWidthOctaveFraction: 1 / 12,
    noiseTaperOctaveFraction: 1 / 24,
    // D5: a grain's sine-squared envelope peaks at its middle, so its rise is half its length
    grainLengthMinMs: 40,
    grainLengthMaxMs: 60,
    grainSpacingMinMs: 20,
    grainSpacingMaxMs: 40,
    grainLevelRangeDb: 8,
  },
  attic: {
    centreHz: 8000,
    durationMs: 1200,
    // D6: tone sound
    outerFadeMs: 30,
    bodyAttackMs: 200,
    bodyReleaseMs: 300,
    carrierDeviationMaxFraction: 0.005,
    pitchWobbleDepthFraction: 0.005,
    pitchWobbleRateMinHz: 3,
    pitchWobbleRateMaxHz: 6,
  },
  calibration: {
    // D8: at most the longest ghost sound
    durationMs: 1500,
    // D6: noise sound
    outerFadeMs: 50,
    lowCutStartHz: 250,
    lowCutEndHz: 354,
    highCutStartHz: 11314,
    highCutEndHz: 16000,
  },
});

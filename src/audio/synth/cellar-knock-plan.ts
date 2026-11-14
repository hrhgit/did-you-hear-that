import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { drawUniform } from "./draw-uniform";

export interface CellarKnock {
  /** Start of the knock's attack, from the start of the sound. */
  readonly onsetMs: number;
  readonly carrierHz: number;
  readonly levelDb: number;
  readonly startPhaseRadians: number;
}

export interface CellarKnockPlan {
  readonly knocks: readonly CellarKnock[];
}

/**
 * Draws every random choice of one cellar knock sound: `knockCount` soft tone bursts near the
 * room pitch (R5.1).
 */
export function planCellarKnock(random: RandomSource): CellarKnockPlan {
  // Draw order, fixed so that a seed always gives the same plan:
  // 1. the first onset, from firstKnockOnsetMinMs to firstKnockOnsetMaxMs
  // 2. knockCount - 1 intervals, from knockIntervalMinMs to knockIntervalMaxMs, in knock order
  // 3. for each knock in order: the carrier deviation, the level, the start phase
  const config = ghostSoundConfig.cellar;
  const onsetsMs = [
    drawUniform(
      random,
      config.firstKnockOnsetMinMs,
      config.firstKnockOnsetMaxMs,
    ),
  ];
  for (let index = 1; index < config.knockCount; index += 1) {
    onsetsMs.push(
      onsetsMs[index - 1] +
        drawUniform(
          random,
          config.knockIntervalMinMs,
          config.knockIntervalMaxMs,
        ),
    );
  }
  const knocks = onsetsMs.map((onsetMs) => {
    const deviationFraction = drawUniform(
      random,
      -config.knockCarrierDeviationMaxFraction,
      config.knockCarrierDeviationMaxFraction,
    );
    const levelDb = drawUniform(random, -config.knockLevelRangeDb, 0);
    const startPhaseRadians = drawUniform(random, 0, 2 * Math.PI);
    return Object.freeze({
      onsetMs,
      carrierHz: config.centreHz * (1 + deviationFraction),
      levelDb,
      startPhaseRadians,
    });
  });
  return Object.freeze({ knocks: Object.freeze(knocks) });
}

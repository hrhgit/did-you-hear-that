import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { drawUniform } from "./draw-uniform";

export interface StairsGrain {
  readonly startMs: number;
  readonly lengthMs: number;
  readonly levelDb: number;
}

export interface StairsScrapePlan {
  readonly grains: readonly StairsGrain[];
}

/**
 * Draws the grain pattern of one stairs scrape (R5.4). Grains start at 0 ms and follow one another
 * at drawn spacings, until the next start would be at or after `durationMs − grainLengthMinMs`.
 * The grain count therefore depends on the spacings drawn (D10). The noise phases are drawn by
 * `shapedNoise` after the plan.
 */
export function planStairsScrape(random: RandomSource): StairsScrapePlan {
  // Draw order, fixed so that a seed always gives the same plan. For each grain in order, starting
  // at 0 ms: its length, its level, then the spacing to the next start. The spacing drawn after
  // the last grain is the one that reaches the limit, and is not used.
  const config = ghostSoundConfig.stairs;
  const lastStartBeforeMs = config.durationMs - config.grainLengthMinMs;
  const grains: StairsGrain[] = [];
  let startMs = 0;
  while (startMs < lastStartBeforeMs) {
    const lengthMs = drawUniform(
      random,
      config.grainLengthMinMs,
      config.grainLengthMaxMs,
    );
    const levelDb = drawUniform(random, -config.grainLevelRangeDb, 0);
    grains.push(Object.freeze({ startMs, lengthMs, levelDb }));
    startMs += drawUniform(
      random,
      config.grainSpacingMinMs,
      config.grainSpacingMaxMs,
    );
  }
  return Object.freeze({ grains: Object.freeze(grains) });
}

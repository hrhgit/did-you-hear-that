import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { drawUniform } from "./draw-uniform";

export interface AtticWhinePlan {
  readonly carrierHz: number;
  readonly pitchWobbleRateHz: number;
  readonly pitchWobblePhaseRadians: number;
  readonly startPhaseRadians: number;
}

/** Draws every random choice of one attic whine: one thin sustained tone (R5.5). */
export function planAtticWhine(random: RandomSource): AtticWhinePlan {
  // Draw order, fixed so that a seed always gives the same plan:
  // 1. the carrier deviation, within plus or minus carrierDeviationMaxFraction
  // 2. the pitch wobble rate
  // 3. the pitch wobble phase
  // 4. the start phase of the tone
  const config = ghostSoundConfig.attic;
  const deviationFraction = drawUniform(
    random,
    -config.carrierDeviationMaxFraction,
    config.carrierDeviationMaxFraction,
  );
  const pitchWobbleRateHz = drawUniform(
    random,
    config.pitchWobbleRateMinHz,
    config.pitchWobbleRateMaxHz,
  );
  const pitchWobblePhaseRadians = drawUniform(random, 0, 2 * Math.PI);
  const startPhaseRadians = drawUniform(random, 0, 2 * Math.PI);
  return Object.freeze({
    carrierHz: config.centreHz * (1 + deviationFraction),
    pitchWobbleRateHz,
    pitchWobblePhaseRadians,
    startPhaseRadians,
  });
}

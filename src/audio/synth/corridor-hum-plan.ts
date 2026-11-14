import { ghostSoundConfig } from "../../config/ghost-sound-config";
import type { RandomSource } from "../../config/seeded-random";
import { drawUniform } from "./draw-uniform";

export interface SlowSinusoid {
  readonly rateHz: number;
  readonly phaseRadians: number;
}

export interface CorridorHumPlan {
  /** `pitchWobbleSinusoidCount` slow sinusoids added to the pitch. */
  readonly pitchWobbles: readonly SlowSinusoid[];
  readonly levelWobble: SlowSinusoid;
  readonly startPhaseRadians: number;
}

/** Draws every random choice of one corridor hum: one slightly unsteady sustained tone (R5.2). */
export function planCorridorHum(random: RandomSource): CorridorHumPlan {
  // Draw order, fixed so that a seed always gives the same plan:
  // 1. for each pitch wobble in order: its rate, then its phase
  // 2. the level wobble's rate, then its phase
  // 3. the start phase of the tone
  const config = ghostSoundConfig.corridor;
  const pitchWobbles: SlowSinusoid[] = [];
  for (let index = 0; index < config.pitchWobbleSinusoidCount; index += 1) {
    const rateHz = drawUniform(
      random,
      config.pitchWobbleRateMinHz,
      config.pitchWobbleRateMaxHz,
    );
    const phaseRadians = drawUniform(random, 0, 2 * Math.PI);
    pitchWobbles.push(Object.freeze({ rateHz, phaseRadians }));
  }
  const levelRateHz = drawUniform(
    random,
    config.levelWobbleRateMinHz,
    config.levelWobbleRateMaxHz,
  );
  const levelPhaseRadians = drawUniform(random, 0, 2 * Math.PI);
  const startPhaseRadians = drawUniform(random, 0, 2 * Math.PI);
  return Object.freeze({
    pitchWobbles: Object.freeze(pitchWobbles),
    levelWobble: Object.freeze({
      rateHz: levelRateHz,
      phaseRadians: levelPhaseRadians,
    }),
    startPhaseRadians,
  });
}

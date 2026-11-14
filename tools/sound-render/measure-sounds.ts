import { checkSound } from "../../src/audio/synth/measure/check-sound";
import { measureSound } from "../../src/audio/synth/measure/measure-sound";
import type {
  BrokenRule,
  SoundMeasurement,
} from "../../src/audio/synth/measure/measurement-types";
import type { RenderFunction } from "../../src/audio/synth/sound-renderers";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { SoundId } from "../../src/config/sound-id";

/**
 * The rates and seeds of the report and of every render check (R12.1, D16). They are constants of
 * the tool and not config values, because they change nothing a visitor hears.
 */
export const reportSampleRatesHz: readonly number[] = Object.freeze([
  44100, 48000,
]);
export const reportSeeds: readonly number[] = Object.freeze(
  Array.from({ length: 10 }, (_, index) => index + 1),
);

/** One render of one sound at one rate with one seed, measured and checked. */
export interface SoundRun {
  readonly soundId: SoundId;
  readonly sampleRateHz: number;
  readonly seed: number;
  /** Null when the renderer threw. */
  readonly measurement: SoundMeasurement | null;
  readonly brokenRules: readonly BrokenRule[];
  /** The message of the error the renderer threw, otherwise null. */
  readonly errorMessage: string | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Renders each sound at each report rate with each report seed, using a new seeded random source
 * for every render, and measures and checks every buffer. A renderer that throws becomes a run
 * with its error message instead of stopping the others (R12.6). Runs come in the order sound,
 * rate, seed.
 */
export function measureSounds(
  soundIds: readonly SoundId[],
  renderers: Readonly<Record<SoundId, RenderFunction>>,
): readonly SoundRun[] {
  const runs: SoundRun[] = [];
  for (const soundId of soundIds) {
    for (const sampleRateHz of reportSampleRatesHz) {
      for (const seed of reportSeeds) {
        let samples: Float32Array;
        try {
          samples = renderers[soundId](sampleRateHz, createSeededRandom(seed));
        } catch (error) {
          runs.push(
            Object.freeze({
              soundId,
              sampleRateHz,
              seed,
              measurement: null,
              brokenRules: Object.freeze([]),
              errorMessage: messageOf(error),
            }),
          );
          continue;
        }
        const measurement = measureSound(samples, sampleRateHz, soundId);
        runs.push(
          Object.freeze({
            soundId,
            sampleRateHz,
            seed,
            measurement,
            brokenRules: Object.freeze(checkSound(measurement)),
            errorMessage: null,
          }),
        );
      }
    }
  }
  return Object.freeze(runs);
}

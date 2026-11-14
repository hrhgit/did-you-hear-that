import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { checkSound } from "../../src/audio/synth/measure/check-sound";
import { measureSound } from "../../src/audio/synth/measure/measure-sound";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import { reportSampleRateArbitrary, seedArbitrary } from "./sound-arbitraries";

/** Runs per sound (design.md, Correctness properties and D21). */
const runsPerSound = 100;

describe("ghost sounds CP1. Every sound meets its rules at 44100 and 48000 Hz (Universal; R6.1, R7.1, R7.2, R8.1, R9.1, R9.2, R10.1, R10.3, R16.1; brief property)", () => {
  for (const soundId of soundIds) {
    it(`holds for the ${soundId} sound`, () => {
      fc.assert(
        fc.property(
          seedArbitrary,
          reportSampleRateArbitrary,
          (seed, sampleRateHz) => {
            const samples = soundRenderers[soundId](
              sampleRateHz,
              createSeededRandom(seed),
            );
            expect(
              checkSound(measureSound(samples, sampleRateHz, soundId)),
            ).toEqual([]);
          },
        ),
        { numRuns: runsPerSound },
      );
    }, 120_000);
  }
});

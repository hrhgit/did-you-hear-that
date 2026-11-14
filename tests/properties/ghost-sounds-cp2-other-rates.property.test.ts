import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { checkSound } from "../../src/audio/synth/measure/check-sound";
import { measureSound } from "../../src/audio/synth/measure/measure-sound";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import { otherSampleRateArbitrary, seedArbitrary } from "./sound-arbitraries";

/** Runs per sound (design.md, Correctness properties and D21). */
const runsPerSound = 25;

describe("ghost sounds CP2. Every sound meets its rules at other supported rates (Universal; R4.4, R16.2)", () => {
  for (const soundId of soundIds) {
    it(`holds for the ${soundId} sound`, () => {
      fc.assert(
        fc.property(
          seedArbitrary,
          otherSampleRateArbitrary,
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

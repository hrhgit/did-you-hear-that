import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import {
  seedPairArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/** Runs per sound (design.md, Correctness properties). */
const runsPerSound = 50;

describe("ghost sounds CP4. Different seeds, different samples (Universal; R4.6, R16.4)", () => {
  for (const soundId of soundIds) {
    it(`holds for the ${soundId} sound`, () => {
      fc.assert(
        fc.property(
          seedPairArbitrary,
          supportedSampleRateArbitrary,
          ([firstSeed, secondSeed], sampleRateHz) => {
            const render = soundRenderers[soundId];
            const first = render(sampleRateHz, createSeededRandom(firstSeed));
            const second = render(sampleRateHz, createSeededRandom(secondSeed));
            expect(second.length).toBe(first.length);
            expect(
              first.some((sample, index) => sample !== second[index]),
            ).toBe(true);
          },
        ),
        { numRuns: runsPerSound },
      );
    }, 120_000);
  }
});

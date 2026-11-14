import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import {
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/** Runs per sound (design.md, Correctness properties). */
const runsPerSound = 50;

describe("ghost sounds CP3. Same seed, same samples (Universal; R4.5, R16.4)", () => {
  for (const soundId of soundIds) {
    it(`holds for the ${soundId} sound`, () => {
      fc.assert(
        fc.property(
          seedArbitrary,
          supportedSampleRateArbitrary,
          (seed, sampleRateHz) => {
            const render = soundRenderers[soundId];
            const first = render(sampleRateHz, createSeededRandom(seed));
            const second = render(sampleRateHz, createSeededRandom(seed));
            expect(second).not.toBe(first);
            expect(second.length).toBe(first.length);
            const differingIndex = first.findIndex(
              (sample, index) => !Object.is(sample, second[index]),
            );
            expect(differingIndex).toBe(-1);
          },
        ),
        { numRuns: runsPerSound },
      );
    }, 120_000);
  }
});

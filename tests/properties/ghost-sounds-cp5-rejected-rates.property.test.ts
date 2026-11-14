import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RandomSource } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import { rejectedSampleRateArbitrary } from "./sound-arbitraries";

const runs = 200;

describe("ghost sounds CP5. Unsupported rates are rejected (Universal; R4.3, R16.3)", () => {
  it("makes every render function throw a RangeError before any random draw", () => {
    fc.assert(
      fc.property(rejectedSampleRateArbitrary, (sampleRateHz) => {
        for (const soundId of soundIds) {
          let draws = 0;
          const random: RandomSource = {
            seed: 0,
            next: () => {
              draws += 1;
              return 0.5;
            },
          };
          expect(() => soundRenderers[soundId](sampleRateHz, random)).toThrow(
            RangeError,
          );
          expect(draws, soundId).toBe(0);
        }
      }),
      { numRuns: runs },
    );
  }, 120_000);
});

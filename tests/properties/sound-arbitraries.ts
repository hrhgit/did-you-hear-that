import fc from "fast-check";
import type { SoundId } from "../../src/config/sound-id";
import { soundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";

/** Every seed `createSeededRandom` accepts: 0 to 2^32 − 1. */
export const seedArbitrary: fc.Arbitrary<number> = fc.integer({
  min: 0,
  max: 0xffffffff,
});

/** Two different seeds. */
export const seedPairArbitrary: fc.Arbitrary<readonly [number, number]> = fc
  .tuple(seedArbitrary, seedArbitrary)
  .filter(([first, second]) => first !== second);

/** The two rates of the report and of CP1 (R16.1). */
export const reportSampleRatesHz: readonly number[] = Object.freeze([
  44100, 48000,
]);

export const reportSampleRateArbitrary: fc.Arbitrary<number> = fc.constantFrom(
  ...reportSampleRatesHz,
);

/** The other common rates named by R16.2. */
export const otherCommonSampleRatesHz: readonly number[] = Object.freeze([
  22050, 32000, 88200, 96000, 192000,
]);

/** CP2's rates: the other common rates, and any integer from the lowest rate to 192000 Hz. */
export const otherSampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(...otherCommonSampleRatesHz),
  fc.integer({ min: soundRulesConfig.sampleRateMinHz, max: 192000 }),
);

/** Any supported rate, for properties that do not measure: CP1's and CP2's rates together. */
export const supportedSampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  reportSampleRateArbitrary,
  otherSampleRateArbitrary,
);

/**
 * CP5's rates: any double below the lowest supported rate, including zero, negatives and
 * −Infinity, and the values that are not finite.
 */
export const rejectedSampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.double({
    max: soundRulesConfig.sampleRateMinHz,
    maxExcluded: true,
    noNaN: true,
  }),
  fc.constantFrom(
    0,
    -0,
    -1,
    soundRulesConfig.sampleRateMinHz - 1e-6,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ),
);

export const soundIdArbitrary: fc.Arbitrary<SoundId> = fc.constantFrom(
  ...soundIds,
);

// The path arbitraries of CP8 live in tools/sound-render/changed-path-arbitraries.ts, next to the
// code they test, because files in tests may not import from tools (D39).

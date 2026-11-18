import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SoundId } from "../../src/config/sound-id";
import { ghostSoundIds } from "../../src/config/sound-id";
import type {
  EarChoice,
  PlaybackRequest,
  PreparationRefusal,
} from "../../src/audio/output/output-types";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import { longestSampleCount } from "./output-arbitraries";
import {
  rejectedSampleRateArbitrary,
  soundIdArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/** Runs (design.md, Correctness properties). */
const runs = 200;

/** The rate used to build a buffer when the request's own rate is not supported. */
const fallbackSampleRateHz = 44100;

type Fault =
  | { readonly kind: "unsupportedSampleRate"; readonly sampleRateHz: number }
  | { readonly kind: "emptyBuffer" }
  | {
      readonly kind: "notFinite";
      readonly position: number;
      readonly value: number;
    }
  | { readonly kind: "invalidLevel"; readonly levelDb: number }
  | { readonly kind: "invalidCalibrationGain"; readonly gain: number }
  | { readonly kind: "bothEarsForGhostSound"; readonly soundId: SoundId }
  | { readonly kind: "silentBuffer" };

/** The base request as it is. */
const noFault = { kind: "none" } as const;

const nonFinite = fc.constantFrom(
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
);

const faultArbitrary: fc.Arbitrary<Fault> = fc.oneof(
  fc.record({
    kind: fc.constant("unsupportedSampleRate" as const),
    sampleRateHz: rejectedSampleRateArbitrary,
  }),
  fc.record({ kind: fc.constant("emptyBuffer" as const) }),
  fc.record({
    kind: fc.constant("notFinite" as const),
    position: fc.double({ min: 0, max: 1, noNaN: true }),
    value: nonFinite,
  }),
  fc.record({ kind: fc.constant("invalidLevel" as const), levelDb: nonFinite }),
  fc.record({
    kind: fc.constant("invalidCalibrationGain" as const),
    gain: fc.oneof(
      fc.constantFrom(0, -0, Number.NaN, Number.POSITIVE_INFINITY),
      fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
    ),
  }),
  fc.record({
    kind: fc.constant("bothEarsForGhostSound" as const),
    soundId: fc.constantFrom(...ghostSoundIds),
  }),
  fc.record({ kind: fc.constant("silentBuffer" as const) }),
);

interface Base {
  readonly sampleRateHz: number;
  readonly durationFraction: number;
  readonly amplitude: number;
  readonly frequencyFraction: number;
  readonly soundId: SoundId;
  readonly ear: "left" | "right";
  readonly levelDb: number;
  readonly calibrationGain: number;
}

/** A request that would be accepted, apart from the fault added to it. */
const baseArbitrary: fc.Arbitrary<Base> = fc.record({
  sampleRateHz: supportedSampleRateArbitrary,
  durationFraction: fc.double({ min: 0.2, max: 1, noNaN: true }),
  amplitude: fc.double({ min: 1e-3, max: 1, noNaN: true }),
  frequencyFraction: fc.double({ min: 0.001, max: 0.4, noNaN: true }),
  soundId: soundIdArbitrary,
  ear: fc.constantFrom("left" as const, "right" as const),
  levelDb: fc.double({ min: -70, max: 15, noNaN: true }),
  calibrationGain: fc.double({ min: 1e-4, max: 1, noNaN: true }),
});

/** A tone with raised-cosine fades of 30 ms at each end. */
function fadedTone(
  base: Base,
  sampleRateHz: number,
  length: number,
): Float32Array {
  const fadeSampleCount = 0.03 * sampleRateHz;
  const samples = new Float32Array(length);
  for (let n = 0; n < length; n += 1) {
    const weight = Math.min(
      1,
      n / fadeSampleCount,
      (length - 1 - n) / fadeSampleCount,
    );
    samples[n] =
      base.amplitude *
      ((1 - Math.cos(Math.PI * weight)) / 2) *
      Math.sin(Math.PI * base.frequencyFraction * n);
  }
  return samples;
}

function build(
  base: Base,
  fault: Fault | typeof noFault,
): { request: PlaybackRequest; expected: PreparationRefusal | null } {
  const sampleRateHz =
    fault.kind === "unsupportedSampleRate"
      ? fault.sampleRateHz
      : base.sampleRateHz;
  const bufferRateHz =
    fault.kind === "unsupportedSampleRate"
      ? fallbackSampleRateHz
      : base.sampleRateHz;
  const longest = longestSampleCount(bufferRateHz);
  const length =
    fault.kind === "emptyBuffer"
      ? 0
      : Math.max(2, Math.floor(base.durationFraction * longest));
  let samples = fadedTone(base, bufferRateHz, length);
  if (fault.kind === "notFinite") {
    samples[Math.min(length - 1, Math.floor(fault.position * length))] =
      fault.value;
  }
  if (fault.kind === "silentBuffer") {
    samples = new Float32Array(length);
  }
  const soundId =
    fault.kind === "bothEarsForGhostSound" ? fault.soundId : base.soundId;
  const earChoice: EarChoice =
    fault.kind === "bothEarsForGhostSound" ? "both" : base.ear;
  const expected: PreparationRefusal | null =
    fault.kind === "none" ? null : fault.kind;
  return {
    request: {
      samples,
      sampleRateHz,
      soundId,
      earChoice,
      requestedLevelDb:
        fault.kind === "invalidLevel" ? fault.levelDb : base.levelDb,
      calibrationGain:
        fault.kind === "invalidCalibrationGain"
          ? fault.gain
          : base.calibrationGain,
    },
    expected,
  };
}

describe("audio output CP4. Broken requests are refused (Universal; R6.3, R7.6, R10.4, R10.5)", () => {
  it("refuses a request with one fault, with the reason of that fault", () => {
    fc.assert(
      fc.property(baseArbitrary, faultArbitrary, (base, fault) => {
        const { request, expected } = build(base, fault);
        expect(preparePlayback(request)).toEqual({
          kind: "refused",
          reason: expected,
        });
      }),
      { numRuns: runs },
    );
  }, 120_000);

  it("accepts the same requests without the fault", () => {
    fc.assert(
      fc.property(baseArbitrary, (base) => {
        const { request, expected } = build(base, noFault);
        expect(expected).toBeNull();
        expect(preparePlayback(request).kind).toBe("ready");
      }),
      { numRuns: runs },
    );
  }, 120_000);
});

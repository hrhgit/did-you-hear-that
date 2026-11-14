import fc from "fast-check";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { SoundId } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import type {
  Ear,
  EarChoice,
  PlaybackRequest,
} from "../../src/audio/output/output-types";
import {
  rejectedSampleRateArbitrary,
  seedArbitrary,
  soundIdArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

// Arbitraries for the audio-output properties (design.md, Correctness properties). Buffers and
// requests are drawn as small specs and turned into samples inside the property, so that
// fast-check prints, shrinks and replays a case without storing its samples.

const { capRelativeToAnchorDb } = hearingMethodConfig;
const { ghostSoundMaxDurationMs } = audioSafetyConfig;

/** The rate used to build a buffer when the request's own rate is not supported. */
const fallbackSampleRateHz = 44100;

/** The longest buffer `preparePlayback` accepts at a rate. */
export function longestSampleCount(sampleRateHz: number): number {
  return Math.floor((ghostSoundMaxDurationMs * sampleRateHz) / 1000);
}

export type BufferShape =
  | "noise"
  | "sine"
  | "constant"
  | "step"
  | "impulse"
  | "zeros"
  | "fadedTone"
  | "shipped";

export interface BufferSpec {
  readonly shape: BufferShape;
  /** Where in 1 … longest the length falls, from 0 to 1. Ignored for a shipped sound. */
  readonly lengthFraction: number;
  /** Multiplies every sample. */
  readonly scale: number;
  /** Seed of the buffer's own content. */
  readonly seed: number;
  /** The sound rendered for the shape `shipped`. */
  readonly shippedSoundId: SoundId;
  /** Positions, as fractions of the length, that hold NaN or an infinity. Empty unless wild. */
  readonly nonFinite: readonly { position: number; value: number }[];
}

const shapeArbitrary: fc.Arbitrary<BufferShape> = fc.constantFrom(
  "noise",
  "sine",
  "constant",
  "step",
  "impulse",
  "zeros",
  "fadedTone",
  "shipped",
);

/** Log-uniform from 1e-30 to 1e30, plus exactly 1. */
const scaleArbitrary: fc.Arbitrary<number> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(1) },
  {
    weight: 4,
    arbitrary: fc
      .double({ min: -30, max: 30, noNaN: true })
      .map((exponent) => 10 ** exponent),
  },
);

/** Lengths lean towards very short buffers as well as spreading over the whole range. */
const lengthFractionArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, 1),
  fc.double({ min: 0, max: 1, noNaN: true }),
  fc.double({ min: 0, max: 1e-3, noNaN: true }),
);

const nonFiniteValueArbitrary: fc.Arbitrary<number> = fc.constantFrom(
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
);

function bufferSpecArbitraryWith(
  nonFinite: fc.Arbitrary<readonly { position: number; value: number }[]>,
): fc.Arbitrary<BufferSpec> {
  return fc.record({
    shape: shapeArbitrary,
    lengthFraction: lengthFractionArbitrary,
    scale: scaleArbitrary,
    seed: seedArbitrary,
    shippedSoundId: soundIdArbitrary,
    nonFinite,
  });
}

/** A buffer of any shape, length and scale, with finite samples. */
export const bufferSpecArbitrary: fc.Arbitrary<BufferSpec> =
  bufferSpecArbitraryWith(fc.constant([]));

/** The "wild" variant: also NaN or ±Infinity at one to three random positions. */
export const wildBufferSpecArbitrary: fc.Arbitrary<BufferSpec> = fc.oneof(
  bufferSpecArbitrary,
  bufferSpecArbitraryWith(
    fc.array(
      fc.record({
        position: fc.double({ min: 0, max: 1, noNaN: true }),
        value: nonFiniteValueArbitrary,
      }),
      { minLength: 1, maxLength: 3 },
    ),
  ),
);

/** Raised-cosine value at u, 0 below 0 and 1 above 1. The tests keep their own copy. */
function ramp(position: number): number {
  if (position <= 0) {
    return 0;
  }
  if (position >= 1) {
    return 1;
  }
  return (1 - Math.cos(Math.PI * position)) / 2;
}

/** Builds the samples a spec describes, at `sampleRateHz` or, if that is not supported, 44100. */
export function materializeBuffer(
  spec: BufferSpec,
  sampleRateHz: number,
): Float32Array {
  const rateHz =
    Number.isFinite(sampleRateHz) &&
    sampleRateHz >= soundRulesConfig.sampleRateMinHz
      ? sampleRateHz
      : fallbackSampleRateHz;
  const random = createSeededRandom(spec.seed);
  let values: Float32Array;
  if (spec.shape === "shipped") {
    values = soundRenderers[spec.shippedSoundId](rateHz, random);
  } else {
    const longest = longestSampleCount(rateHz);
    const length = 1 + Math.floor(spec.lengthFraction * (longest - 1));
    values = new Float32Array(length);
    const sign = random.next() < 0.5 ? -1 : 1;
    const position = Math.floor(random.next() * length);
    const frequencyHz = 20 + random.next() * (rateHz / 2 - 20);
    const phase = random.next() * 2 * Math.PI;
    const fadeSampleCount = Math.floor(random.next() * 0.1 * rateHz);
    for (let n = 0; n < length; n += 1) {
      const sine = Math.sin((2 * Math.PI * frequencyHz * n) / rateHz + phase);
      switch (spec.shape) {
        case "noise":
          values[n] = 2 * random.next() - 1;
          break;
        case "sine":
          values[n] = sine;
          break;
        case "constant":
          values[n] = sign;
          break;
        case "step":
          values[n] = n >= position ? sign : 0;
          break;
        case "impulse":
          values[n] = n === position ? sign : 0;
          break;
        case "zeros":
          values[n] = 0;
          break;
        case "fadedTone":
          values[n] =
            sine *
            Math.min(
              ramp(n / fadeSampleCount),
              ramp((length - 1 - n) / fadeSampleCount),
            );
          break;
      }
    }
  }
  const samples = values.map((value) => value * spec.scale);
  for (const { position, value } of spec.nonFinite) {
    samples[
      Math.min(samples.length - 1, Math.floor(position * samples.length))
    ] = value;
  }
  return samples;
}

/** −200 to +200 dB, plus ±Infinity, NaN, the anchor cap and values just above it. */
export const levelArbitrary: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: -200, max: 200, noNaN: true }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      capRelativeToAnchorDb,
      capRelativeToAnchorDb + 1e-12,
      capRelativeToAnchorDb + 1e-9,
      capRelativeToAnchorDb + 1e-3,
      capRelativeToAnchorDb + 1,
    ),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ),
  },
);

/** Finite levels only, from −200 to +200 dB, with the anchor cap and values just above it. */
export const finiteLevelArbitrary: fc.Arbitrary<number> = levelArbitrary.filter(
  (levelDb) => Number.isFinite(levelDb),
);

/** Log-uniform from 1e-12 to 1e12. */
export const validCalibrationGainArbitrary: fc.Arbitrary<number> = fc
  .double({ min: -12, max: 12, noNaN: true })
  .map((exponent) => 10 ** exponent);

/** Valid gains, plus 0, negatives, NaN and +Infinity. */
export const calibrationGainArbitrary: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: validCalibrationGainArbitrary },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      0,
      -0,
      -1,
      -1e-6,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ),
  },
);

/** The previous gain on one ear, before it is turned into a number. */
export type PreviousGainSpec =
  | null
  /** This many dB below the request's capped gain: positive is a rise, negative a fall. */
  | { readonly kind: "relative"; readonly riseDb: number }
  | { readonly kind: "absolute"; readonly gain: number };

const previousGainSpecArbitrary: fc.Arbitrary<PreviousGainSpec> = fc.oneof(
  fc.constant(null),
  fc.record({
    kind: fc.constant("relative" as const),
    riseDb: fc.oneof(
      fc.double({ min: -20, max: 30, noNaN: true }),
      fc.constantFrom(
        hearingMethodConfig.upwardStepDb,
        hearingMethodConfig.upwardStepDb - 1e-9,
        hearingMethodConfig.upwardStepDb + 1e-6,
      ),
    ),
  }),
  fc.record({
    kind: fc.constant("absolute" as const),
    gain: validCalibrationGainArbitrary,
  }),
);

export type PreviousGainsSpec = null | Readonly<Record<Ear, PreviousGainSpec>>;

export const previousGainsSpecArbitrary: fc.Arbitrary<PreviousGainsSpec> =
  fc.oneof(
    fc.constant(null),
    fc.record({
      left: previousGainSpecArbitrary,
      right: previousGainSpecArbitrary,
    }),
  );

export const earChoiceArbitrary: fc.Arbitrary<EarChoice> = fc.constantFrom(
  "left",
  "right",
  "both",
);

export const oneEarArbitrary: fc.Arbitrary<Ear> = fc.constantFrom(
  "left",
  "right",
);

/** Mostly supported rates, sometimes rejected ones. */
export const anySampleRateArbitrary: fc.Arbitrary<number> = fc.oneof(
  { weight: 9, arbitrary: supportedSampleRateArbitrary },
  { weight: 1, arbitrary: rejectedSampleRateArbitrary },
);

export interface RequestSpec {
  readonly buffer: BufferSpec;
  readonly sampleRateHz: number;
  readonly soundId: SoundId;
  readonly earChoice: EarChoice;
  readonly requestedLevelDb: number;
  readonly calibrationGain: number;
  readonly previous: PreviousGainsSpec;
}

/** A request spec with every field drawn from the given arbitraries. */
export function requestSpecArbitrary(
  options: {
    readonly buffer?: fc.Arbitrary<BufferSpec>;
    readonly sampleRateHz?: fc.Arbitrary<number>;
    readonly earChoice?: fc.Arbitrary<EarChoice>;
    readonly requestedLevelDb?: fc.Arbitrary<number>;
    readonly calibrationGain?: fc.Arbitrary<number>;
  } = {},
): fc.Arbitrary<RequestSpec> {
  return fc.record({
    buffer: options.buffer ?? bufferSpecArbitrary,
    sampleRateHz: options.sampleRateHz ?? anySampleRateArbitrary,
    soundId: soundIdArbitrary,
    earChoice: options.earChoice ?? earChoiceArbitrary,
    requestedLevelDb: options.requestedLevelDb ?? levelArbitrary,
    calibrationGain: options.calibrationGain ?? calibrationGainArbitrary,
    previous: previousGainsSpecArbitrary,
  });
}

/** Any request: wild buffers, any rate, any level, any gain. */
export const anyRequestSpecArbitrary: fc.Arbitrary<RequestSpec> =
  requestSpecArbitrary({ buffer: wildBufferSpecArbitrary });

function previousGain(
  spec: PreviousGainSpec,
  request: RequestSpec,
): number | null {
  if (spec === null) {
    return null;
  }
  if (spec.kind === "absolute") {
    return spec.gain;
  }
  const cappedLevelDb = Math.min(
    request.requestedLevelDb,
    capRelativeToAnchorDb,
  );
  return request.calibrationGain * decibelsToGain(cappedLevelDb - spec.riseDb);
}

/**
 * Builds the request a spec describes. A relative previous gain that comes out as zero, not
 * finite or negative (because the level or the gain itself is not valid) is passed on as it is.
 */
export function materializeRequest(spec: RequestSpec): PlaybackRequest {
  return {
    samples: materializeBuffer(spec.buffer, spec.sampleRateHz),
    sampleRateHz: spec.sampleRateHz,
    soundId: spec.soundId,
    earChoice: spec.earChoice,
    requestedLevelDb: spec.requestedLevelDb,
    calibrationGain: spec.calibrationGain,
    previousAppliedGain:
      spec.previous === null
        ? null
        : {
            left: previousGain(spec.previous.left, spec),
            right: previousGain(spec.previous.right, spec),
          },
  };
}

/** Grid settings of the calibration control from the Keep_Minimum to the top, in dB. */
export function keepableSettingArbitrary(topDb: number): fc.Arbitrary<number> {
  const { calibrationSettingKeepMinDb, calibrationSettingStepDb } =
    audioOutputConfig;
  const stepCount = Math.round(
    (topDb - calibrationSettingKeepMinDb) / calibrationSettingStepDb,
  );
  return fc
    .integer({ min: 0, max: stepCount })
    .map((k) => calibrationSettingKeepMinDb + k * calibrationSettingStepDb);
}

/**
 * Levels on the search's grid, `startingLevelDb + k × upwardStepDb`, from `floorDb` up to the
 * highest grid level at or below `topDb`.
 */
export function gridLevelsUpTo(topDb: number): readonly number[] {
  const { startingLevelDb, upwardStepDb, floorDb } = hearingMethodConfig;
  const levels: number[] = [];
  const lowestK = Math.ceil((floorDb - startingLevelDb) / upwardStepDb - 1e-9);
  for (let k = lowestK; startingLevelDb + k * upwardStepDb <= topDb; k += 1) {
    levels.push(startingLevelDb + k * upwardStepDb);
  }
  return levels;
}

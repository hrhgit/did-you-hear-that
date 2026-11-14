import { raisedCosineRamp } from "../../src/audio/synth/raised-cosine-ramp";
import type { RenderFunction } from "../../src/audio/synth/sound-renderers";
import { ghostSoundConfig } from "../../src/config/ghost-sound-config";
import type { GhostSoundId, SoundId } from "../../src/config/sound-id";
import { ghostSoundIds, soundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";

// Stand-in renderers for the tests of the render tool. They are not ghost sounds: each is a sum of
// steady sines with raised-cosine fades, which the measurement judges in a few milliseconds and
// whose rule results are known in advance. Nothing here plays sound.

export type Renderers = Readonly<Record<SoundId, RenderFunction>>;

interface ToneOptions {
  /** Frequencies of the sines and their amplitudes before scaling. */
  readonly partials: readonly { frequencyHz: number; amplitude: number }[];
  readonly durationMs: number;
  /** 0 for no fade at all, so the sound starts and stops at full level. */
  readonly fadeMs: number;
  /** Start phase of every sine, in radians. */
  readonly startPhase: number;
  /** The RMS of the result as a fraction of full scale. */
  readonly rmsFraction: number;
}

/** A sum of sines with a raised-cosine fade at each end, scaled to the given RMS. */
function renderTones(sampleRateHz: number, options: ToneOptions): Float32Array {
  const sampleCount = Math.floor((options.durationMs * sampleRateHz) / 1000);
  const fadeSamples = (options.fadeMs * sampleRateHz) / 1000;
  const samples = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRateHz;
    let value = 0;
    for (const { frequencyHz, amplitude } of options.partials) {
      value +=
        amplitude *
        Math.sin(2 * Math.PI * frequencyHz * time + options.startPhase);
    }
    const fade =
      fadeSamples === 0
        ? 1
        : raisedCosineRamp(index / fadeSamples) *
          raisedCosineRamp((sampleCount - 1 - index) / fadeSamples);
    samples[index] = value * fade;
  }
  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  const scale = options.rmsFraction / Math.sqrt(sumOfSquares / sampleCount);
  return Float32Array.from(samples, (sample) => sample * scale);
}

const goodTone = {
  durationMs: 1000,
  fadeMs: 200,
  startPhase: 0,
  rmsFraction: soundRulesConfig.referenceRmsFraction,
} as const;

/** One sine at the given multiple of the sound's centre. */
function ghostTone(
  soundId: GhostSoundId,
  overrides: Partial<ToneOptions> & { centreMultiple?: number } = {},
): RenderFunction {
  const { centreMultiple = 1, ...rest } = overrides;
  return (sampleRateHz) =>
    renderTones(sampleRateHz, {
      ...goodTone,
      partials: [
        {
          frequencyHz: ghostSoundConfig[soundId].centreHz * centreMultiple,
          amplitude: 1,
        },
      ],
      ...rest,
    });
}

/** One sine at each room centre, with the amplitudes of the calibration shape. */
function calibrationTones(
  shapeDb: Readonly<Record<GhostSoundId, number>>,
  overrides: Partial<ToneOptions> = {},
): RenderFunction {
  return (sampleRateHz) =>
    renderTones(sampleRateHz, {
      ...goodTone,
      partials: ghostSoundIds.map((id) => ({
        frequencyHz: ghostSoundConfig[id].centreHz,
        amplitude: 10 ** (shapeDb[id] / 20),
      })),
      ...overrides,
    });
}

function forEverySound(
  ghost: (soundId: GhostSoundId) => RenderFunction,
  calibration: RenderFunction,
): Renderers {
  return Object.freeze(
    Object.fromEntries(
      soundIds.map((soundId) => [
        soundId,
        soundId === "calibration" ? calibration : ghost(soundId),
      ]),
    ) as Record<SoundId, RenderFunction>,
  );
}

const goodCalibration = calibrationTones(soundRulesConfig.calibrationShapeDb);

/** Renderers that meet every rule. */
export const goodRenderers: Renderers = forEverySound(
  (soundId) => ghostTone(soundId),
  goodCalibration,
);

/** Ghost sounds a fifth above their band, which breaks the band rule. The calibration is good. */
export const bandBreakingRenderers: Renderers = forEverySound(
  (soundId) => ghostTone(soundId, { centreMultiple: 1.5 }),
  goodCalibration,
);

/** Every sound without its fades: it starts at full level and stops at full level. */
export const fadeSkippingRenderers: Renderers = forEverySound(
  (soundId) => ghostTone(soundId, { fadeMs: 0 }),
  calibrationTones(soundRulesConfig.calibrationShapeDb, { fadeMs: 0 }),
);

/** The message of the error the throwing renderers throw. */
export const thrownMessage = "the knock planner ran out of knocks.";

/** Every renderer throws an `Error`. */
export const throwingRenderers: Renderers = forEverySound(
  () => () => {
    throw new Error(thrownMessage);
  },
  () => {
    throw new Error(thrownMessage);
  },
);

/**
 * Renderer sets that between them break every rule in each of the ways `checkSound` can describe,
 * for the banned-term check of everything the tool can print (R12.7, D22).
 */
export const everyBrokenRuleRenderers: readonly Renderers[] = Object.freeze([
  bandBreakingRenderers,
  fadeSkippingRenderers,
  throwingRenderers,
  // Nonzero first and last samples.
  forEverySound(
    (soundId) => ghostTone(soundId, { fadeMs: 0, startPhase: Math.PI / 2 }),
    calibrationTones(soundRulesConfig.calibrationShapeDb, {
      fadeMs: 0,
      startPhase: Math.PI / 2,
    }),
  ),
  // Too long, and twice the reference RMS.
  forEverySound(
    (soundId) => ghostTone(soundId, { durationMs: 2000, rmsFraction: 0.1 }),
    calibrationTones(soundRulesConfig.calibrationShapeDb, {
      durationMs: 2000,
      rmsFraction: 0.1,
    }),
  ),
  // A peak above full scale.
  forEverySound(
    (soundId) => ghostTone(soundId, { rmsFraction: 1 }),
    calibrationTones(soundRulesConfig.calibrationShapeDb, { rmsFraction: 1 }),
  ),
  // Silence, and a calibration noise with only one room band.
  forEverySound(
    () => (sampleRateHz) => new Float32Array(Math.floor(sampleRateHz)),
    (sampleRateHz) =>
      renderTones(sampleRateHz, {
        ...goodTone,
        partials: [
          { frequencyHz: ghostSoundConfig.stairs.centreHz, amplitude: 1 },
        ],
      }),
  ),
  // Not a number, and a calibration noise with a flat shape.
  forEverySound(
    () => (sampleRateHz) =>
      new Float32Array(Math.floor(sampleRateHz)).fill(Number.NaN),
    calibrationTones({
      cellar: 0,
      corridor: 0,
      nursery: 0,
      stairs: 0,
      attic: 0,
    }),
  ),
]);

/** Wraps renderers so that every call is counted. */
export function countingRenderers(renderers: Renderers): {
  readonly renderers: Renderers;
  readonly calls: () => readonly SoundId[];
} {
  const calls: SoundId[] = [];
  const wrapped = Object.fromEntries(
    soundIds.map((soundId) => [
      soundId,
      ((sampleRateHz, random) => {
        calls.push(soundId);
        return renderers[soundId](sampleRateHz, random);
      }) satisfies RenderFunction,
    ]),
  ) as Record<SoundId, RenderFunction>;
  return { renderers: Object.freeze(wrapped), calls: () => [...calls] };
}

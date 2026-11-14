import { ghostSoundConfig } from "../../../config/ghost-sound-config";
import type { GhostSoundId, SoundId } from "../../../config/sound-id";
import { ghostSoundIds } from "../../../config/sound-id";
import { soundRulesConfig } from "../../../config/sound-rules-config";
import { bandEdges } from "../band-edges";
import { measureFadeLengths } from "./fade-lengths";
import type { SoundMeasurement } from "./measurement-types";
import { spectrumEnergies } from "./spectrum-energies";

/** 20 log10 of an amplitude ratio. */
function amplitudeRatioToDb(ratio: number): number {
  return 20 * Math.log10(ratio);
}

/** 10 log10 of an energy ratio. */
function energyRatioToDb(ratio: number): number {
  return 10 * Math.log10(ratio);
}

function isGhostSoundId(soundId: SoundId): soundId is GhostSoundId {
  return (ghostSoundIds as readonly SoundId[]).includes(soundId);
}

function bandOf(soundId: GhostSoundId) {
  return bandEdges(
    ghostSoundConfig[soundId].centreHz,
    soundRulesConfig.bandWidthOctaveFraction,
  );
}

interface BandFields {
  readonly inBandShareFraction: number | null;
  readonly outOfBandRatioDb: number | null;
  readonly roomBandLevelsDb: Readonly<Record<GhostSoundId, number>> | null;
  readonly calibrationShapeDistanceMaxDb: number | null;
}

function ghostBandFields(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  soundId: GhostSoundId,
): BandFields {
  const energies = spectrumEnergies(samples, sampleRateHz, [bandOf(soundId)]);
  const { inBandEnergy, outOfBandEnergy } = energies.bands[0];
  return {
    inBandShareFraction:
      energies.totalEnergy > 0 ? inBandEnergy / energies.totalEnergy : 0,
    // +Infinity when there is no in-band energy, so that the band rule is broken (R6.2).
    outOfBandRatioDb:
      inBandEnergy > 0
        ? energyRatioToDb(outOfBandEnergy / inBandEnergy)
        : Number.POSITIVE_INFINITY,
    roomBandLevelsDb: null,
    calibrationShapeDistanceMaxDb: null,
  };
}

function calibrationBandFields(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
): BandFields {
  const energies = spectrumEnergies(
    samples,
    sampleRateHz,
    ghostSoundIds.map(bandOf),
  );
  const roomEnergies = energies.bands.map((band) => band.inBandEnergy);
  const loudest = Math.max(...roomEnergies);
  const levels = Object.fromEntries(
    ghostSoundIds.map((id, index) => [
      id,
      loudest > 0
        ? energyRatioToDb(roomEnergies[index] / loudest)
        : Number.NEGATIVE_INFINITY,
    ]),
  ) as Record<GhostSoundId, number>;
  // With no energy in any room band the shape cannot be met, so the distance is +Infinity (D33).
  const distance =
    loudest > 0
      ? Math.max(
          ...ghostSoundIds.map((id) =>
            Math.abs(levels[id] - soundRulesConfig.calibrationShapeDb[id]),
          ),
        )
      : Number.POSITIVE_INFINITY;
  return {
    inBandShareFraction: null,
    outOfBandRatioDb: null,
    roomBandLevelsDb: Object.freeze(levels),
    calibrationShapeDistanceMaxDb: distance,
  };
}

/**
 * Measures one buffer of the sound `soundId` at `sampleRateHz` (R11.1). For a ghost sound it
 * measures the energy in and outside the sound's band. For the calibration noise it measures the
 * level of each room band relative to the loudest one and the largest distance from the
 * configured shape (D8).
 *
 * When the RMS is zero the level deviation is −Infinity and the crest factor is 0 (D33). The input
 * is not modified.
 */
export function measureSound(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  soundId: SoundId,
): SoundMeasurement {
  const sampleCount = samples.length;
  let sumOfSquares = 0;
  let peakFraction = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
    peakFraction = Math.max(peakFraction, Math.abs(sample));
  }
  const rmsFraction =
    sampleCount > 0 ? Math.sqrt(sumOfSquares / sampleCount) : 0;
  const { fadeInMs, fadeOutMs } = measureFadeLengths(samples, sampleRateHz);
  const bandFields = isGhostSoundId(soundId)
    ? ghostBandFields(samples, sampleRateHz, soundId)
    : calibrationBandFields(samples, sampleRateHz);

  return Object.freeze({
    soundId,
    sampleRateHz,
    sampleCount,
    firstSample: sampleCount > 0 ? samples[0] : 0,
    lastSample: sampleCount > 0 ? samples[sampleCount - 1] : 0,
    durationMs: (sampleCount * 1000) / sampleRateHz,
    rmsFraction,
    levelDeviationDb: amplitudeRatioToDb(
      rmsFraction / soundRulesConfig.referenceRmsFraction,
    ),
    peakFraction,
    crestFactorDb:
      rmsFraction > 0 ? amplitudeRatioToDb(peakFraction / rmsFraction) : 0,
    fadeInMs,
    fadeOutMs,
    ...bandFields,
  });
}

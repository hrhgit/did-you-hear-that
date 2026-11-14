import type { GhostSoundId, SoundId } from "../../../config/sound-id";

export type RuleName =
  | "band"
  | "fadeIn"
  | "fadeOut"
  | "duration"
  | "level"
  | "peak"
  | "calibrationShape";

export interface SoundMeasurement {
  readonly soundId: SoundId;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly firstSample: number;
  readonly lastSample: number;
  readonly durationMs: number;
  readonly rmsFraction: number;
  readonly levelDeviationDb: number;
  readonly peakFraction: number;
  readonly crestFactorDb: number;
  readonly fadeInMs: number; // 0 when the buffer is all zeros
  readonly fadeOutMs: number;
  /** Ghost sounds only, otherwise null. */
  readonly inBandShareFraction: number | null;
  readonly outOfBandRatioDb: number | null; // +Infinity when there is no in-band energy
  /** Calibration only, otherwise null. Band level of each room band, relative to the loudest. */
  readonly roomBandLevelsDb: Readonly<Record<GhostSoundId, number>> | null;
  readonly calibrationShapeDistanceMaxDb: number | null;
}

export interface BrokenRule {
  readonly rule: RuleName;
  readonly measured: number;
  readonly limit: number;
  readonly description: string; // for example "out-of-band energy -27.4 dB, limit -30 dB"
}

import { audioOutputConfig } from "../../config/audio-output-config";

/**
 * The Played_Setting of the calibration music after one step of `calibrationMusicGainStepMs`
 * (`.kiro/specs/audible-start/design.md`, "Playing"; R5.3 to R5.5, D6). A pure function.
 *
 * - Rising, it is the lower of the target and `playedDb` plus the rise of one step,
 *   `calibrationRiseMaxDb × calibrationMusicGainStepMs / calibrationMusicRisePeriodMs`. With the
 *   shipped config that is the whole control (40 dB), so the music reaches the target in one step:
 *   the owner dropped the 5 dB in 2 seconds on 2026-11-16 after playing.
 * - Falling, it is the target, reached within the one step.
 * - Never above `topDb`, the Control_Top of the music. A target that is NaN counts as `playedDb`.
 *
 * It does not round to the control's grid: between grid settings the music passes through the
 * values of each step. Keeping a calibration rounds down to the grid (R5.8).
 */
export function nextCalibrationMusicSettingDb(
  playedDb: number,
  targetDb: number,
  topDb: number,
): number {
  const {
    calibrationRiseMaxDb,
    calibrationMusicGainStepMs,
    calibrationMusicRisePeriodMs,
  } = audioOutputConfig;
  const riseStepDb =
    (calibrationRiseMaxDb * calibrationMusicGainStepMs) /
    calibrationMusicRisePeriodMs;
  const wantedDb = Number.isNaN(targetDb) ? playedDb : targetDb;
  const nextDb =
    wantedDb > playedDb ? Math.min(wantedDb, playedDb + riseStepDb) : wantedDb;
  return Math.min(nextDb, topDb);
}

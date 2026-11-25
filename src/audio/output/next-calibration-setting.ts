import { audioOutputConfig } from "../../config/audio-output-config";
import { calibrationSettingTopDb } from "./calibration-setting-top";

/** A request this close above a grid setting still counts as that setting (D36). */
const gridToleranceSteps = 1e-9;

/**
 * The Calibration_Setting of the next Calibration_Repeat (R16.1, R16.2, D8). A pure function.
 *
 * - With no previous repeat in this calibration, it is the request, held to the top of the control
 *   and rounded down to the grid, so the first repeat plays where the calibration starts: the middle
 *   of the control (the owner's request of 2026-11-18). NaN counts as the bottom.
 * - Otherwise it is the request (NaN counts as the previous setting), limited to at most
 *   `calibrationRiseMaxDb` above the previous setting and to the Control_Range, and rounded down
 *   to the control's grid, `calibrationSettingMinDb + k × calibrationSettingStepDb`. With the
 *   shipped config the rise covers the whole control, so the next repeat plays the request: the
 *   owner dropped the 5 dB per repeat on 2026-11-16 after playing.
 */
export function nextCalibrationSettingDb(
  requestedDb: number,
  previousDb: number | null,
): number {
  const {
    calibrationSettingMinDb,
    calibrationSettingStepDb,
    calibrationRiseMaxDb,
  } = audioOutputConfig;
  // The first repeat has no previous setting to rise from, so only the top limits it.
  const wantedDb = Number.isNaN(requestedDb)
    ? (previousDb ?? calibrationSettingMinDb)
    : requestedDb;
  const limitedDb = Math.min(
    wantedDb,
    previousDb === null
      ? Number.POSITIVE_INFINITY
      : previousDb + calibrationRiseMaxDb,
    calibrationSettingTopDb(),
  );
  const stepCount = Math.floor(
    (limitedDb - calibrationSettingMinDb) / calibrationSettingStepDb +
      gridToleranceSteps,
  );
  return Math.max(
    calibrationSettingMinDb,
    calibrationSettingMinDb + stepCount * calibrationSettingStepDb,
  );
}

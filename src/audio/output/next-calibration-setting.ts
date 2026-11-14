import { audioOutputConfig } from "../../config/audio-output-config";
import { calibrationSettingTopDb } from "./calibration-setting-top";

/** A request this close above a grid setting still counts as that setting (D36). */
const gridToleranceSteps = 1e-9;

/**
 * The Calibration_Setting of the next Calibration_Repeat (R16.1, R16.2, D8). A pure function.
 *
 * - With no previous repeat in this calibration, it is the bottom of the control, whatever was
 *   requested.
 * - Otherwise it is the request (NaN counts as the previous setting), limited to at most
 *   `calibrationRiseMaxDb` above the previous setting and to the Control_Range, and rounded down
 *   to the control's grid, `calibrationSettingMinDb + k × calibrationSettingStepDb`.
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
  if (previousDb === null) {
    return calibrationSettingMinDb;
  }
  const wantedDb = Number.isNaN(requestedDb) ? previousDb : requestedDb;
  const limitedDb = Math.min(
    wantedDb,
    previousDb + calibrationRiseMaxDb,
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

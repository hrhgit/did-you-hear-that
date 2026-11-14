import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { ghostSoundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { roomTopLevelDb } from "./room-top-level";

/**
 * The Calibration_Setting_Top (D8): the highest setting on the control's grid,
 * `calibrationSettingMinDb + k × calibrationSettingStepDb`, at which both hold:
 *
 * - the calibration noise at its Peak_Bound, at Level `max(0, headphoneCheckLevelDb)`, has a
 *   peak at most the ceiling;
 * - every ghost sound has a Room_Top_Level of at least `roomTopMinDb`.
 *
 * Both conditions only get harder as the setting rises, so the grid is walked up from the bottom
 * until one breaks. Throws when even the bottom breaks one, which only a config change can cause.
 * With the shipped values the top is −4 dB.
 */
export function calibrationSettingTopDb(): number {
  const {
    calibrationSettingMinDb,
    calibrationSettingStepDb,
    headphoneCheckLevelDb,
    peakBoundDb,
    roomTopMinDb,
  } = audioOutputConfig;
  const loudestCalibrationLevelDb = Math.max(0, headphoneCheckLevelDb);

  const holdsAt = (settingDb: number): boolean => {
    const calibrationGain = decibelsToGain(settingDb);
    const calibrationPeakFraction =
      soundRulesConfig.referenceRmsFraction *
      decibelsToGain(peakBoundDb.calibration) *
      calibrationGain *
      decibelsToGain(loudestCalibrationLevelDb);
    return (
      calibrationPeakFraction <= audioSafetyConfig.ceilingFraction &&
      ghostSoundIds.every(
        (soundId) => roomTopLevelDb(soundId, calibrationGain) >= roomTopMinDb,
      )
    );
  };

  if (!holdsAt(calibrationSettingMinDb)) {
    throw new RangeError(
      `No calibration setting from ${calibrationSettingMinDb} dB up keeps the calibration noise within the ceiling and every room at ${roomTopMinDb} dB or more. Check audioOutputConfig.`,
    );
  }
  let stepCount = 0;
  while (
    holdsAt(
      calibrationSettingMinDb + (stepCount + 1) * calibrationSettingStepDb,
    )
  ) {
    stepCount += 1;
  }
  return calibrationSettingMinDb + stepCount * calibrationSettingStepDb;
}

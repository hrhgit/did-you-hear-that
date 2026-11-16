import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { gainToDecibels } from "./gain-to-decibels";

/**
 * The Music_Top (`.kiro/specs/audible-start/design.md`, "The top of the control"; D7): the highest
 * setting on the control's grid, `calibrationSettingMinDb + k × calibrationSettingStepDb`, at
 * which the calibration music's peak stays within the ceiling. The music plays at
 * Music_Level_Gain, which gives it the reference RMS at the anchor, so at setting S its peak is
 * `referenceRmsFraction × 10^((S + crestDb) / 20)`, and the top is `13.98 − crestDb` rounded down
 * to the grid. With the measured crest factor of 18.40 dB (44.1 kHz) or 18.44 dB (48 kHz) it is
 * −5 dB.
 *
 * Rounding never moves the setting up: a setting whose peak would be above the ceiling, by any
 * margin, is never given. For a crest factor so large that even the bottom of the control would
 * break the ceiling, the result lies below the bottom, on the same grid, and the output stage
 * falls back to the hiss (R4.4).
 */
export function calibrationMusicTopDb(crestDb: number): number {
  if (!Number.isFinite(crestDb) || crestDb < 0) {
    throw new RangeError(
      `A crest factor must be a finite number from 0 dB up, but got ${String(crestDb)}.`,
    );
  }
  const { calibrationSettingMinDb, calibrationSettingStepDb } =
    audioOutputConfig;
  const peakWithinCeiling = (settingDb: number): boolean =>
    soundRulesConfig.referenceRmsFraction *
      decibelsToGain(settingDb + crestDb) <=
    audioSafetyConfig.ceilingFraction;
  const highestDb =
    gainToDecibels(
      audioSafetyConfig.ceilingFraction / soundRulesConfig.referenceRmsFraction,
    ) - crestDb;
  let stepCount = Math.floor(
    (highestDb - calibrationSettingMinDb) / calibrationSettingStepDb,
  );
  // Floating point may put the rounded setting a hair above the limit, or one step below it.
  while (
    !peakWithinCeiling(
      calibrationSettingMinDb + stepCount * calibrationSettingStepDb,
    )
  ) {
    stepCount -= 1;
  }
  while (
    peakWithinCeiling(
      calibrationSettingMinDb + (stepCount + 1) * calibrationSettingStepDb,
    )
  ) {
    stepCount += 1;
  }
  return calibrationSettingMinDb + stepCount * calibrationSettingStepDb;
}

/**
 * The Control_Top with the calibration music (D7): the lower of its Music_Top and the top of the
 * control for the hiss, `calibrationSettingTopDb()`, which also keeps every room at the anchor or
 * above. −5 dB with the shipped file; the hiss keeps −4 dB.
 */
export function calibrationControlTopDb(crestDb: number): number {
  return Math.min(calibrationMusicTopDb(crestDb), calibrationSettingTopDb());
}

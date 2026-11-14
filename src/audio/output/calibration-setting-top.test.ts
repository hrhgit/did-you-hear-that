import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { ghostSoundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { roomTopLevelDb } from "./room-top-level";

const {
  calibrationSettingKeepMinDb,
  calibrationSettingMinDb,
  calibrationSettingStepDb,
  headphoneCheckLevelDb,
  peakBoundDb,
  roomTopMinDb,
} = audioOutputConfig;

/** Peak of the calibration noise at its Peak_Bound, at a setting and a level. */
function calibrationPeakFraction(settingDb: number, levelDb: number): number {
  return (
    soundRulesConfig.referenceRmsFraction *
    decibelsToGain(peakBoundDb.calibration) *
    decibelsToGain(settingDb) *
    decibelsToGain(levelDb)
  );
}

describe("calibrationSettingTopDb", () => {
  it("is -4 dB with the shipped config (D8)", () => {
    expect(calibrationSettingTopDb()).toBe(-4);
  });

  it("lies on the control's grid", () => {
    const stepCount =
      (calibrationSettingTopDb() - calibrationSettingMinDb) /
      calibrationSettingStepDb;
    expect(Number.isInteger(stepCount)).toBe(true);
  });

  it("is at least the Keep_Minimum (R2.4)", () => {
    expect(calibrationSettingKeepMinDb).toBeLessThanOrEqual(
      calibrationSettingTopDb(),
    );
  });

  it("keeps the calibration noise at its Peak_Bound within the ceiling at Level 0 and at the headphone check level (R2.5)", () => {
    const topDb = calibrationSettingTopDb();
    for (const levelDb of [0, headphoneCheckLevelDb]) {
      expect(
        calibrationPeakFraction(topDb, levelDb),
        `${levelDb} dB`,
      ).toBeLessThanOrEqual(audioSafetyConfig.ceilingFraction);
    }
  });

  it("keeps every ghost room at or above roomTopMinDb at the top, and not one step higher", () => {
    const topDb = calibrationSettingTopDb();
    for (const soundId of ghostSoundIds) {
      expect(
        roomTopLevelDb(soundId, decibelsToGain(topDb)),
        soundId,
      ).toBeGreaterThanOrEqual(roomTopMinDb);
    }
    const aboveDb = topDb + calibrationSettingStepDb;
    const breaks =
      calibrationPeakFraction(aboveDb, Math.max(0, headphoneCheckLevelDb)) >
        audioSafetyConfig.ceilingFraction ||
      ghostSoundIds.some(
        (soundId) =>
          roomTopLevelDb(soundId, decibelsToGain(aboveDb)) < roomTopMinDb,
      );
    expect(breaks).toBe(true);
  });

  it("is set by the stairs room with the shipped config (D8)", () => {
    // The calibration noise alone would allow up to about -1.5 dB, the stairs room up to -3.02.
    const aboveDb = calibrationSettingTopDb() + calibrationSettingStepDb;
    expect(roomTopLevelDb("stairs", decibelsToGain(aboveDb))).toBeLessThan(
      roomTopMinDb,
    );
    expect(calibrationPeakFraction(aboveDb, 0)).toBeLessThanOrEqual(
      audioSafetyConfig.ceilingFraction,
    );
  });
});

import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { nextCalibrationMusicSettingDb } from "./next-calibration-music-setting";

const {
  calibrationRiseMaxDb,
  calibrationMusicGainStepMs,
  calibrationMusicRisePeriodMs,
  calibrationSettingMinDb,
} = audioOutputConfig;

const riseStepDb =
  (calibrationRiseMaxDb * calibrationMusicGainStepMs) /
  calibrationMusicRisePeriodMs;

describe("nextCalibrationMusicSettingDb", () => {
  it("rises by 0.25 dB a step with the shipped config", () => {
    expect(riseStepDb).toBe(0.25);
    expect(nextCalibrationMusicSettingDb(-60, -5, -5)).toBe(-59.75);
  });

  it("never rises by more than 0.25 dB in one step", () => {
    for (let playedDb = -60; playedDb <= -5; playedDb += 0.7) {
      for (let targetDb = -60; targetDb <= -5; targetDb += 1) {
        const nextDb = nextCalibrationMusicSettingDb(playedDb, targetDb, -5);
        expect(nextDb - playedDb).toBeLessThanOrEqual(0.25 + 1e-12);
      }
    }
  });

  it("stops at the target when the target is within one step", () => {
    expect(nextCalibrationMusicSettingDb(-20.1, -20, -5)).toBe(-20);
  });

  it("falls to the target in one step", () => {
    expect(nextCalibrationMusicSettingDb(-5, -60, -5)).toBe(-60);
    expect(nextCalibrationMusicSettingDb(-12.5, -30, -5)).toBe(-30);
  });

  it("stays where it is at the target", () => {
    expect(nextCalibrationMusicSettingDb(-27, -27, -5)).toBe(-27);
  });

  it("is never above the top", () => {
    expect(nextCalibrationMusicSettingDb(-5.1, 0, -5)).toBe(-5);
    expect(nextCalibrationMusicSettingDb(-5, 3, -5)).toBe(-5);
    expect(nextCalibrationMusicSettingDb(-3, -3, -5)).toBe(-5);
    expect(
      nextCalibrationMusicSettingDb(-5, Number.POSITIVE_INFINITY, -5),
    ).toBe(-5);
  });

  it("holds for a target that is NaN", () => {
    expect(nextCalibrationMusicSettingDb(-30, Number.NaN, -5)).toBe(-30);
  });

  it("takes 22 seconds from the bottom to −5 dB, and 13.2 seconds to −27 dB", () => {
    const stepsTo = (targetDb: number) => {
      let playedDb = calibrationSettingMinDb;
      let stepCount = 0;
      while (playedDb < targetDb) {
        playedDb = nextCalibrationMusicSettingDb(playedDb, targetDb, -5);
        stepCount += 1;
      }
      return stepCount;
    };
    expect(stepsTo(-5) * calibrationMusicGainStepMs).toBe(22000);
    expect(stepsTo(-27) * calibrationMusicGainStepMs).toBe(13200);
  });
});

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

// The owner dropped the slow rise on 2026-11-16 after playing: the music follows the control,
// reaching any setting on it in one step's ramp of 100 ms.
describe("nextCalibrationMusicSettingDb", () => {
  it("rises by up to the whole control in one step with the shipped config", () => {
    expect(riseStepDb).toBe(40);
    expect(nextCalibrationMusicSettingDb(-40, -5, -5)).toBe(-5);
  });

  it("never rises by more than one step's rise", () => {
    for (let playedDb = -40; playedDb <= -5; playedDb += 0.7) {
      for (let targetDb = -40; targetDb <= -5; targetDb += 1) {
        const nextDb = nextCalibrationMusicSettingDb(playedDb, targetDb, -5);
        expect(nextDb - playedDb).toBeLessThanOrEqual(riseStepDb + 1e-12);
      }
    }
  });

  it("stops at the target", () => {
    expect(nextCalibrationMusicSettingDb(-20.1, -20, -5)).toBe(-20);
    expect(nextCalibrationMusicSettingDb(-40, -27, -5)).toBe(-27);
  });

  it("falls to the target in one step", () => {
    expect(nextCalibrationMusicSettingDb(-5, -40, -5)).toBe(-40);
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

  it("takes one step from the bottom to −5 dB and to −27 dB", () => {
    const stepsTo = (targetDb: number) => {
      let playedDb = calibrationSettingMinDb;
      let stepCount = 0;
      while (playedDb < targetDb) {
        playedDb = nextCalibrationMusicSettingDb(playedDb, targetDb, -5);
        stepCount += 1;
      }
      return stepCount;
    };
    expect(stepsTo(-5) * calibrationMusicGainStepMs).toBe(100);
    expect(stepsTo(-27) * calibrationMusicGainStepMs).toBe(100);
  });
});

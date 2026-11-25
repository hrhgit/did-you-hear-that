import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { nextCalibrationSettingDb } from "./next-calibration-setting";

const { calibrationSettingMinDb, calibrationRiseMaxDb } = audioOutputConfig;

describe("nextCalibrationSettingDb", () => {
  it("plays the first repeat where it is asked, held to the control (R16.1)", () => {
    const topDb = calibrationSettingTopDb();
    const middleDb =
      calibrationSettingMinDb +
      Math.floor((topDb - calibrationSettingMinDb) / 2);
    expect(nextCalibrationSettingDb(middleDb, null)).toBe(middleDb);
    expect(nextCalibrationSettingDb(-37.2, null)).toBe(-38);
    expect(nextCalibrationSettingDb(20, null)).toBe(topDb);
    expect(nextCalibrationSettingDb(Number.POSITIVE_INFINITY, null)).toBe(
      topDb,
    );
    expect(nextCalibrationSettingDb(-100, null)).toBe(calibrationSettingMinDb);
    expect(nextCalibrationSettingDb(Number.NEGATIVE_INFINITY, null)).toBe(
      calibrationSettingMinDb,
    );
    expect(nextCalibrationSettingDb(Number.NaN, null)).toBe(
      calibrationSettingMinDb,
    );
  });

  it("rounds a request down to the 1 dB grid (R16.2)", () => {
    expect(nextCalibrationSettingDb(-37.2, -40)).toBe(-38);
    expect(nextCalibrationSettingDb(-37.999, -40)).toBe(-38);
    expect(nextCalibrationSettingDb(-38, -40)).toBe(-38);
    expect(nextCalibrationSettingDb(-20.5, -22)).toBe(-21);
  });

  it("counts a request a hair below a grid setting as that setting", () => {
    expect(nextCalibrationSettingDb(-38 - 1e-12, -40)).toBe(-38);
  });

  // The owner dropped the 5 dB limit on 2026-11-16 after playing: the hiss follows the control.
  it("goes from the bottom to any setting of the control in one repeat (R16.2, D8)", () => {
    const topDb = calibrationSettingTopDb();
    expect(calibrationRiseMaxDb).toBeGreaterThanOrEqual(
      topDb - calibrationSettingMinDb,
    );
    expect(nextCalibrationSettingDb(-10, -40)).toBe(-10);
    expect(nextCalibrationSettingDb(-27, -40)).toBe(-27);
    expect(nextCalibrationSettingDb(Number.POSITIVE_INFINITY, -40)).toBe(topDb);
  });

  it("falls by any amount", () => {
    expect(nextCalibrationSettingDb(-40, -10)).toBe(-40);
    expect(nextCalibrationSettingDb(-37, -5)).toBe(-37);
  });

  it("keeps the setting within the Control_Range", () => {
    const topDb = calibrationSettingTopDb();
    expect(nextCalibrationSettingDb(20, topDb - 2)).toBe(topDb);
    expect(nextCalibrationSettingDb(20, topDb)).toBe(topDb);
    expect(nextCalibrationSettingDb(-100, -30)).toBe(calibrationSettingMinDb);
    expect(nextCalibrationSettingDb(Number.NEGATIVE_INFINITY, -30)).toBe(
      calibrationSettingMinDb,
    );
  });

  it("treats NaN as the previous setting", () => {
    expect(nextCalibrationSettingDb(Number.NaN, -32)).toBe(-32);
    expect(nextCalibrationSettingDb(Number.NaN, calibrationSettingMinDb)).toBe(
      calibrationSettingMinDb,
    );
  });

  it("climbs from the bottom to the top in one repeat after the first", () => {
    const topDb = calibrationSettingTopDb();
    const played = [nextCalibrationSettingDb(calibrationSettingMinDb, null)];
    while (played[played.length - 1] < topDb) {
      played.push(nextCalibrationSettingDb(topDb, played[played.length - 1]));
    }
    expect(played).toEqual([calibrationSettingMinDb, topDb]);
  });
});

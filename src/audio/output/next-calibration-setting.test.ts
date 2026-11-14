import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { nextCalibrationSettingDb } from "./next-calibration-setting";

const { calibrationSettingMinDb, calibrationRiseMaxDb } = audioOutputConfig;

describe("nextCalibrationSettingDb", () => {
  it("plays the first repeat at the bottom of the control whatever is asked (R16.1)", () => {
    for (const requestedDb of [
      -60,
      -30,
      0,
      20,
      -100,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(
        nextCalibrationSettingDb(requestedDb, null),
        String(requestedDb),
      ).toBe(calibrationSettingMinDb);
    }
  });

  it("rounds a request down to the 1 dB grid (R16.2)", () => {
    expect(nextCalibrationSettingDb(-57.2, -60)).toBe(-58);
    expect(nextCalibrationSettingDb(-57.999, -60)).toBe(-58);
    expect(nextCalibrationSettingDb(-58, -60)).toBe(-58);
    expect(nextCalibrationSettingDb(-20.5, -22)).toBe(-21);
  });

  it("counts a request a hair below a grid setting as that setting", () => {
    expect(nextCalibrationSettingDb(-58 - 1e-12, -60)).toBe(-58);
  });

  it(`rises by at most ${calibrationRiseMaxDb} dB from the previous repeat (R16.2, D8)`, () => {
    expect(nextCalibrationSettingDb(-10, -60)).toBe(-60 + calibrationRiseMaxDb);
    expect(nextCalibrationSettingDb(-54.5, -60)).toBe(-55);
    expect(nextCalibrationSettingDb(-30, -40)).toBe(-40 + calibrationRiseMaxDb);
    expect(nextCalibrationSettingDb(Number.POSITIVE_INFINITY, -40)).toBe(
      -40 + calibrationRiseMaxDb,
    );
  });

  it("falls by any amount", () => {
    expect(nextCalibrationSettingDb(-60, -10)).toBe(-60);
    expect(nextCalibrationSettingDb(-37, -5)).toBe(-37);
  });

  it("keeps the setting within the Control_Range", () => {
    const topDb = calibrationSettingTopDb();
    expect(nextCalibrationSettingDb(20, topDb - 2)).toBe(topDb);
    expect(nextCalibrationSettingDb(20, topDb)).toBe(topDb);
    expect(nextCalibrationSettingDb(-100, -50)).toBe(calibrationSettingMinDb);
    expect(nextCalibrationSettingDb(Number.NEGATIVE_INFINITY, -50)).toBe(
      calibrationSettingMinDb,
    );
  });

  it("treats NaN as the previous setting", () => {
    expect(nextCalibrationSettingDb(Number.NaN, -42)).toBe(-42);
    expect(nextCalibrationSettingDb(Number.NaN, calibrationSettingMinDb)).toBe(
      calibrationSettingMinDb,
    );
  });

  it("climbs from the bottom to the top in steps of at most the rise limit", () => {
    const topDb = calibrationSettingTopDb();
    const played = [nextCalibrationSettingDb(topDb, null)];
    while (played[played.length - 1] < topDb) {
      played.push(nextCalibrationSettingDb(topDb, played[played.length - 1]));
    }
    expect(played[0]).toBe(calibrationSettingMinDb);
    expect(played[played.length - 1]).toBe(topDb);
    for (let index = 1; index < played.length; index += 1) {
      expect(played[index] - played[index - 1]).toBeLessThanOrEqual(
        calibrationRiseMaxDb,
      );
    }
    // From -60 to -4 in steps of 5 dB: 12 repeats after the first (D8, "about a dozen").
    expect(played.length).toBe(13);
  });
});

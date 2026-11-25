import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import {
  calibrationStartSettingDb,
  calibrationTargetSettingDb,
} from "./calibration-target-setting";

const { calibrationSettingMinDb, calibrationSettingStepDb } = audioOutputConfig;

/** The control of the hiss with the shipped config: −40 to −4 dB in steps of 1 dB. */
const control = Object.freeze({
  bottomDb: calibrationSettingMinDb,
  topDb: calibrationSettingTopDb(),
  stepDb: calibrationSettingStepDb,
});

describe("calibrationTargetSettingDb", () => {
  it("is the control of the shipped config this file assumes", () => {
    expect(control).toEqual({ bottomDb: -40, topDb: -4, stepDb: 1 });
  });

  // The table of "The calibration target" in design.md, row by row.
  it.each([-40, -39, -30, -27, -5, -4])(
    "gives a setting on the grid, in range, as itself: %s",
    (settingDb) => {
      expect(calibrationTargetSettingDb(settingDb, control)).toBe(settingDb);
    },
  );

  it.each([
    [-39.5, -40],
    [-30.000001, -31],
    [-20.999, -21],
    [-4.5, -5],
  ])(
    "rounds a setting between grid settings down: %s gives %s",
    (settingDb, expectedDb) => {
      expect(calibrationTargetSettingDb(settingDb, control)).toBe(expectedDb);
    },
  );

  it("counts a setting within 10⁻⁹ of a step below a grid setting as that setting, as next-calibration-setting.ts does", () => {
    expect(calibrationTargetSettingDb(-20 - 1e-12, control)).toBe(-20);
    expect(calibrationTargetSettingDb(-20 - 1e-6, control)).toBe(-21);
  });

  it.each([-40.5, -41, -1000, -Number.MAX_VALUE, Number.NEGATIVE_INFINITY])(
    "gives the bottom below the bottom and for −Infinity: %s",
    (settingDb) => {
      expect(calibrationTargetSettingDb(settingDb, control)).toBe(-40);
    },
  );

  it.each([-3.5, -3, 0, 15, Number.MAX_VALUE, Number.POSITIVE_INFINITY])(
    "gives the top above the top and for +Infinity: %s",
    (settingDb) => {
      expect(calibrationTargetSettingDb(settingDb, control)).toBe(-4);
    },
  );

  it.each([Number.NaN, "-20", undefined, null, {}, [-20], true])(
    "gives null for NaN and for a value that is not a number: %s",
    (settingDb) => {
      expect(calibrationTargetSettingDb(settingDb, control)).toBeNull();
    },
  );

  it("works on any grid it is given", () => {
    const coarse = { bottomDb: -10, topDb: 2, stepDb: 2.5 };
    expect(calibrationTargetSettingDb(-6, coarse)).toBe(-7.5);
    expect(calibrationTargetSettingDb(1.9, coarse)).toBe(0);
    expect(calibrationTargetSettingDb(10, coarse)).toBe(0);
    expect(calibrationTargetSettingDb(-11, coarse)).toBe(-10);
  });

  it.each([
    { bottomDb: Number.NaN, topDb: -4, stepDb: 1 },
    { bottomDb: -60, topDb: Number.POSITIVE_INFINITY, stepDb: 1 },
    { bottomDb: -60, topDb: -61, stepDb: 1 },
    { bottomDb: -60, topDb: -4, stepDb: 0 },
    { bottomDb: -60, topDb: -4, stepDb: Number.NaN },
  ])("throws a RangeError for a control that is no control: %o", (bad) => {
    expect(() => calibrationTargetSettingDb(-20, bad)).toThrow(RangeError);
  });
});

describe("calibrationStartSettingDb", () => {
  // The middle of the hiss's control, −40 to −4 dB: −22 dB (R19.5, the owner's 2026-11-18 request).
  it("starts the hiss in the middle of its control, −22 dB", () => {
    expect(calibrationStartSettingDb(control)).toBe(-22);
  });

  // The music's control tops out at −5 dB, so its middle is −22.5 dB, rounded down to −23 dB.
  it("starts the music in the middle of its control, rounded down to −23 dB", () => {
    expect(
      calibrationStartSettingDb({ bottomDb: -40, topDb: -5, stepDb: 1 }),
    ).toBe(-23);
  });

  it("is always on the grid and inside the control", () => {
    const coarse = { bottomDb: -10, topDb: 2, stepDb: 2.5 };
    expect(calibrationStartSettingDb(coarse)).toBe(-5);
    expect(
      calibrationStartSettingDb({ bottomDb: -40, topDb: -40, stepDb: 1 }),
    ).toBe(-40);
  });

  it("throws a RangeError for a control that is no control", () => {
    expect(() =>
      calibrationStartSettingDb({ bottomDb: -4, topDb: -40, stepDb: 1 }),
    ).toThrow(RangeError);
  });
});

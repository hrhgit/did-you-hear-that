import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import {
  classifyAccuracy,
  lowestGridLevelAtOrAboveDb,
  type AccuracySettings,
} from "./classify-accuracy";
import type { RunEarResult } from "./search-under-test";

// Shipped settings: start -25, upward step 5, floor -70, cap 5.
const classify = (earResult: RunEarResult, trueThresholdDb: number) =>
  classifyAccuracy(earResult, trueThresholdDb, hearingMethodConfig);
const found = (thresholdDb: number): RunEarResult => ({
  state: "found",
  thresholdDb,
});

describe("lowestGridLevelAtOrAboveDb (D42)", () => {
  it("is the true threshold itself when it lies on the grid", () => {
    expect(lowestGridLevelAtOrAboveDb(-55, hearingMethodConfig)).toBe(-55);
    expect(lowestGridLevelAtOrAboveDb(-25, hearingMethodConfig)).toBe(-25);
    expect(lowestGridLevelAtOrAboveDb(15, hearingMethodConfig)).toBe(15);
  });

  it("is the next level up when the true threshold lies between levels", () => {
    expect(lowestGridLevelAtOrAboveDb(-55.1, hearingMethodConfig)).toBe(-55);
    expect(lowestGridLevelAtOrAboveDb(-54.9, hearingMethodConfig)).toBe(-50);
    expect(lowestGridLevelAtOrAboveDb(-0.1, hearingMethodConfig)).toBe(0);
  });

  it("does not move a level of the grid up through rounding", () => {
    expect(lowestGridLevelAtOrAboveDb(-45 + 1e-12, hearingMethodConfig)).toBe(
      -45,
    );
    expect(
      lowestGridLevelAtOrAboveDb(0.1 + 0.2 - 0.3, hearingMethodConfig),
    ).toBe(0);
  });

  it("follows the grid of the settings, also outside the floor and the cap", () => {
    expect(lowestGridLevelAtOrAboveDb(-80.5, hearingMethodConfig)).toBe(-80);
    expect(lowestGridLevelAtOrAboveDb(21, hearingMethodConfig)).toBe(25);
    const other = {
      startingLevelDb: 1,
      upwardStepDb: 3,
      floorDb: -20,
      capRelativeToAnchorDb: 10,
    };
    expect(lowestGridLevelAtOrAboveDb(-3.1, other)).toBe(-2);
    expect(lowestGridLevelAtOrAboveDb(-2, other)).toBe(-2);
    expect(lowestGridLevelAtOrAboveDb(-1.9, other)).toBe(1);
  });
});

describe("classifyAccuracy (D42)", () => {
  describe("found", () => {
    it("is accurate at the grid level at or above a true threshold on the grid, and one step either side", () => {
      expect(classify(found(-55), -55)).toBe("accurate");
      expect(classify(found(-60), -55)).toBe("accurate");
      expect(classify(found(-50), -55)).toBe("accurate");
    });

    it("is wrong two steps from a true threshold on the grid", () => {
      expect(classify(found(-65), -55)).toBe("wrong");
      expect(classify(found(-45), -55)).toBe("wrong");
    });

    it("is accurate 5.1 dB above a true threshold just below a level, which the first version counted as wrong", () => {
      expect(classify(found(-50), -55.1)).toBe("accurate");
      expect(classify(found(-60), -55.1)).toBe("accurate");
      expect(classify(found(-45), -55.1)).toBe("wrong");
      expect(classify(found(-65), -55.1)).toBe("wrong");
    });

    it("is accurate up to 9.9 dB above a true threshold just above a level, and wrong 5.1 dB below it", () => {
      expect(classify(found(-45), -54.9)).toBe("accurate");
      expect(classify(found(-55), -54.9)).toBe("accurate");
      expect(classify(found(-40), -54.9)).toBe("wrong");
      expect(classify(found(-60), -54.9)).toBe("wrong");
    });

    it("reads an estimate off the grid against the interval of the band", () => {
      expect(classify(found(-52.5), -55.1)).toBe("accurate");
      expect(classify(found(-49.9), -55.1)).toBe("wrong");
      expect(classify(found(-60.1), -55.1)).toBe("wrong");
    });

    it("takes the step and the grid from the settings", () => {
      const other: AccuracySettings = {
        startingLevelDb: 0,
        upwardStepDb: 2,
        floorDb: -20,
        capRelativeToAnchorDb: 10,
      };
      // The lowest level of the 2 dB grid at or above -3.1 is -2.
      expect(classifyAccuracy(found(-2), -3.1, other)).toBe("accurate");
      expect(classifyAccuracy(found(-4), -3.1, other)).toBe("accurate");
      expect(classifyAccuracy(found(0), -3.1, other)).toBe("accurate");
      expect(classifyAccuracy(found(-6), -3.1, other)).toBe("wrong");
      expect(classifyAccuracy(found(2), -3.1, other)).toBe("wrong");
    });
  });

  describe("betterThanFloor", () => {
    const betterThanFloor: RunEarResult = { state: "betterThanFloor" };

    it("is accurate when the grid level at or above the true threshold is at most one step above the floor", () => {
      expect(classify(betterThanFloor, -65)).toBe("accurate");
      expect(classify(betterThanFloor, -69.9)).toBe("accurate");
      expect(classify(betterThanFloor, -70)).toBe("accurate");
      expect(classify(betterThanFloor, -90)).toBe("accurate");
    });

    it("is wrong once that level is two steps above the floor", () => {
      expect(classify(betterThanFloor, -64.9)).toBe("wrong");
      expect(classify(betterThanFloor, -40)).toBe("wrong");
    });

    it("takes the step and the floor from the settings", () => {
      const other: AccuracySettings = {
        startingLevelDb: 0,
        upwardStepDb: 2,
        floorDb: -20,
        capRelativeToAnchorDb: 10,
      };
      expect(classifyAccuracy(betterThanFloor, -18, other)).toBe("accurate");
      expect(classifyAccuracy(betterThanFloor, -17.9, other)).toBe("wrong");
    });
  });

  describe("worseThanCap", () => {
    const worseThanCap: RunEarResult = { state: "worseThanCap" };

    it("is accurate when the grid level at or above the true threshold is the cap or louder", () => {
      expect(classify(worseThanCap, 0.1)).toBe("accurate");
      expect(classify(worseThanCap, 5)).toBe("accurate");
      expect(classify(worseThanCap, 35)).toBe("accurate");
    });

    it("is wrong once that level is below the cap, including a true threshold exactly one step below it", () => {
      expect(classify(worseThanCap, 0)).toBe("wrong");
      expect(classify(worseThanCap, -40)).toBe("wrong");
    });

    it("takes the step and the cap from the settings", () => {
      const other: AccuracySettings = {
        startingLevelDb: 0,
        upwardStepDb: 2,
        floorDb: -20,
        capRelativeToAnchorDb: 10,
      };
      expect(classifyAccuracy(worseThanCap, 8.1, other)).toBe("accurate");
      expect(classifyAccuracy(worseThanCap, 8, other)).toBe("wrong");
    });
  });

  it("is flagged for unreliable, wherever the true threshold is", () => {
    for (const trueThresholdDb of [-90, -70, -50, 15, 35]) {
      expect(classify({ state: "unreliable" }, trueThresholdDb)).toBe(
        "flagged",
      );
    }
  });

  it("is wrong for unreported, wherever the true threshold is", () => {
    for (const trueThresholdDb of [-90, -70, -50, 15, 35]) {
      expect(classify({ state: "unreported" }, trueThresholdDb)).toBe("wrong");
    }
  });
});

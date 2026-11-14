import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { classifyAccuracy } from "./classify-accuracy";
import type { RunEarResult } from "./search-under-test";

// Shipped settings: floor -70, cap 15.
const classify = (earResult: RunEarResult, trueThresholdDb: number) =>
  classifyAccuracy(earResult, trueThresholdDb, hearingMethodConfig);

describe("classifyAccuracy (D18)", () => {
  describe("found", () => {
    const found: RunEarResult = { state: "found", thresholdDb: -50 };

    it("is accurate within 5 dB of the true threshold, both ends included", () => {
      expect(classify(found, -50)).toBe("accurate");
      expect(classify(found, -55)).toBe("accurate");
      expect(classify(found, -45)).toBe("accurate");
    });

    it("is wrong just past 5 dB on either side", () => {
      expect(classify(found, -55.1)).toBe("wrong");
      expect(classify(found, -44.9)).toBe("wrong");
    });
  });

  describe("betterThanFloor", () => {
    const betterThanFloor: RunEarResult = { state: "betterThanFloor" };

    it("is accurate when the true threshold is at most 5 dB above the floor", () => {
      expect(classify(betterThanFloor, -65)).toBe("accurate");
      expect(classify(betterThanFloor, -70)).toBe("accurate");
      expect(classify(betterThanFloor, -90)).toBe("accurate");
    });

    it("is wrong just past 5 dB above the floor", () => {
      expect(classify(betterThanFloor, -64.9)).toBe("wrong");
    });
  });

  describe("worseThanCap", () => {
    const worseThanCap: RunEarResult = { state: "worseThanCap" };

    it("is accurate when the true threshold is at most 5 dB below the cap", () => {
      expect(classify(worseThanCap, 10)).toBe("accurate");
      expect(classify(worseThanCap, 15)).toBe("accurate");
      expect(classify(worseThanCap, 35)).toBe("accurate");
    });

    it("is wrong just past 5 dB below the cap", () => {
      expect(classify(worseThanCap, 9.9)).toBe("wrong");
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

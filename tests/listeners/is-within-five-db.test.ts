import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { isWithinFiveDb } from "./is-within-five-db";
import type { RunEarResult } from "./search-under-test";

// Shipped settings: floor -70, cap 15.
const within = (earResult: RunEarResult, trueThresholdDb: number) =>
  isWithinFiveDb(earResult, trueThresholdDb, hearingMethodConfig);

describe("isWithinFiveDb, the original measure of property 1 (D18, D37, D42)", () => {
  describe("found", () => {
    const found: RunEarResult = { state: "found", thresholdDb: -50 };

    it("is within 5 dB of the true threshold, both ends included", () => {
      expect(within(found, -50)).toBe(true);
      expect(within(found, -55)).toBe(true);
      expect(within(found, -45)).toBe(true);
    });

    it("is not just past 5 dB on either side", () => {
      expect(within(found, -55.1)).toBe(false);
      expect(within(found, -44.9)).toBe(false);
    });
  });

  describe("betterThanFloor", () => {
    const betterThanFloor: RunEarResult = { state: "betterThanFloor" };

    it("is within when the true threshold is at most 5 dB above the floor", () => {
      expect(within(betterThanFloor, -65)).toBe(true);
      expect(within(betterThanFloor, -70)).toBe(true);
      expect(within(betterThanFloor, -90)).toBe(true);
    });

    it("is not just past 5 dB above the floor", () => {
      expect(within(betterThanFloor, -64.9)).toBe(false);
    });
  });

  describe("worseThanCap", () => {
    const worseThanCap: RunEarResult = { state: "worseThanCap" };

    it("is within when the true threshold is at most 5 dB below the cap", () => {
      expect(within(worseThanCap, 10)).toBe(true);
      expect(within(worseThanCap, 15)).toBe(true);
      expect(within(worseThanCap, 35)).toBe(true);
    });

    it("is not just past 5 dB below the cap", () => {
      expect(within(worseThanCap, 9.9)).toBe(false);
    });
  });

  it("is never within for unreliable or unreported, wherever the true threshold is", () => {
    for (const trueThresholdDb of [-90, -70, -50, 15, 35]) {
      expect(within({ state: "unreliable" }, trueThresholdDb)).toBe(false);
      expect(within({ state: "unreported" }, trueThresholdDb)).toBe(false);
    }
  });
});

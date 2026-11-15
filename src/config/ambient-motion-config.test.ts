import { describe, expect, it } from "vitest";
import { ambientMotionConfig } from "./ambient-motion-config";

describe("ambientMotionConfig", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(ambientMotionConfig)).toBe(true);
  });

  it("holds only finite positive numbers", () => {
    for (const [name, value] of Object.entries(ambientMotionConfig)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
  });

  it("orders every minimum below its maximum", () => {
    const c = ambientMotionConfig;
    expect(c.lampNudgeGapMinMs).toBeLessThan(c.lampNudgeGapMaxMs);
    expect(c.lampNudgeMinDegrees).toBeLessThan(c.lampNudgeMaxDegrees);
    expect(c.doorShadowGapMinMs).toBeLessThan(c.doorShadowGapMaxMs);
    expect(c.doorShadowMinMs).toBeLessThan(c.doorShadowMaxMs);
    expect(c.dustFallMinMs).toBeLessThan(c.dustFallMaxMs);
  });

  it("keeps the lamp's swing small, so nothing on screen moves fast", () => {
    expect(ambientMotionConfig.lampMaxDegrees).toBeLessThanOrEqual(6);
    expect(ambientMotionConfig.lampNudgeMaxDegrees).toBeLessThanOrEqual(
      ambientMotionConfig.lampMaxDegrees,
    );
  });

  it("slows and shrinks motion when reduced motion is asked for", () => {
    expect(ambientMotionConfig.reducedMotionSpeedFraction).toBeLessThan(0.25);
    expect(ambientMotionConfig.reducedMotionSwingFraction).toBeLessThan(0.25);
  });

  it("holds whole numbers of motes", () => {
    expect(Number.isInteger(ambientMotionConfig.dustCount)).toBe(true);
  });
});

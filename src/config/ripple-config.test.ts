import { describe, expect, it } from "vitest";
import { rippleConfig } from "./ripple-config";

describe("rippleConfig", () => {
  it("is frozen and holds only finite positive numbers", () => {
    expect(Object.isFrozen(rippleConfig)).toBe(true);
    for (const [name, value] of Object.entries(rippleConfig)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
  });

  it("has a whole number of rings", () => {
    expect(Number.isInteger(rippleConfig.ringCount)).toBe(true);
  });

  it("never lets a ripple reach its brightest in less than a fifth of a second", () => {
    expect(rippleConfig.fadeInMinMs).toBeGreaterThanOrEqual(200);
    expect(rippleConfig.fadeInMinMs).toBeLessThan(rippleConfig.ringMs / 2);
    expect(rippleConfig.fadeInMinMs).toBeLessThan(
      rippleConfig.reducedMotionGlowMs / 2,
    );
  });
});

import { describe, expect, it } from "vitest";
import { raisedCosineRamp } from "./raised-cosine-ramp";

describe("raisedCosineRamp", () => {
  it("is 0 at 0 and below", () => {
    expect(raisedCosineRamp(0)).toBe(0);
    expect(raisedCosineRamp(-0.5)).toBe(0);
    expect(raisedCosineRamp(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("is 1 at 1 and above", () => {
    expect(raisedCosineRamp(1)).toBe(1);
    expect(raisedCosineRamp(7)).toBe(1);
  });

  it("is 0.5 at 0.5", () => {
    expect(raisedCosineRamp(0.5)).toBeCloseTo(0.5, 15);
  });

  it("is monotone", () => {
    let previous = raisedCosineRamp(-0.1);
    for (let step = -100; step <= 1100; step += 1) {
      const value = raisedCosineRamp(step / 1000);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

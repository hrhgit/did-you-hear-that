import { describe, expect, it } from "vitest";
import { swappedRepeatConfig } from "./swapped-repeat-config";

describe("swappedRepeatConfig", () => {
  it("holds the value of the design, from brief 08 (R2.1)", () => {
    expect(swappedRepeatConfig).toEqual({ unclearBelowLimitFraction: 0.5 });
  });

  it("ends every field name with its unit (R2.2)", () => {
    for (const fieldName of Object.keys(swappedRepeatConfig)) {
      expect(fieldName).toMatch(/Fraction$/);
    }
  });

  it("is deeply frozen (R2.1, R2.2)", () => {
    expect(Object.isFrozen(swappedRepeatConfig)).toBe(true);
    for (const value of Object.values(swappedRepeatConfig)) {
      if (typeof value === "object" && value !== null) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
  });

  it("gives a share of the limit above 0 and below 1 (R2.2)", () => {
    expect(swappedRepeatConfig.unclearBelowLimitFraction).toBeGreaterThan(0);
    expect(swappedRepeatConfig.unclearBelowLimitFraction).toBeLessThan(1);
  });
});

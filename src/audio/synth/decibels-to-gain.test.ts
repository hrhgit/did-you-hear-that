import { describe, expect, it } from "vitest";
import { decibelsToGain } from "./decibels-to-gain";

describe("decibelsToGain", () => {
  it("converts levels in decibels to amplitude gains", () => {
    expect(decibelsToGain(0)).toBe(1);
    expect(decibelsToGain(-20)).toBeCloseTo(0.1, 15);
    expect(decibelsToGain(20)).toBeCloseTo(10, 12);
    expect(decibelsToGain(-6)).toBeCloseTo(0.501187, 6);
  });
});

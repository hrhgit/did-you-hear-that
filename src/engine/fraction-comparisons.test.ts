import { describe, expect, it } from "vitest";
import { atLeastFraction, atMostFraction } from "./fraction-comparisons";

/** Clearly larger than the 1e-9 tolerance, small enough to sit just past a limit. */
const pastTolerance = 1e-6;

describe("atLeastFraction", () => {
  it("counts 3 of 20 at 0.15 as at least", () => {
    expect(atLeastFraction(3, 20, 0.15)).toBe(true);
  });

  it("does not count a share just below the limit by more than the tolerance", () => {
    expect(atLeastFraction(3 - pastTolerance, 20, 0.15)).toBe(false);
    expect(atLeastFraction(3, 20, 0.15 + pastTolerance)).toBe(false);
  });

  it("counts a share below the limit by less than the tolerance as at least", () => {
    expect(atLeastFraction(3 - 1e-12, 20, 0.15)).toBe(true);
  });
});

describe("atMostFraction", () => {
  it("counts 13 of 53 at 0.25 as at most", () => {
    expect(atMostFraction(13, 53, 0.25)).toBe(true);
  });

  it("does not count 14 of 54 at 0.25 as at most", () => {
    expect(atMostFraction(14, 54, 0.25)).toBe(false);
  });

  it("counts 3 of 10 at 0.3 as at most", () => {
    expect(atMostFraction(3, 10, 0.3)).toBe(true);
  });

  it("does not count a share just above the limit by more than the tolerance", () => {
    expect(atMostFraction(3 + pastTolerance, 10, 0.3)).toBe(false);
    expect(atMostFraction(3, 10, 0.3 - pastTolerance)).toBe(false);
  });

  it("counts a share above the limit by less than the tolerance as at most", () => {
    expect(atMostFraction(3 + 1e-12, 10, 0.3)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { validateSampleRate } from "./validate-sample-rate";

describe("validateSampleRate", () => {
  it("accepts 22050 and 192000 Hz", () => {
    expect(() => validateSampleRate(22050)).not.toThrow();
    expect(() => validateSampleRate(192000)).not.toThrow();
    expect(() => validateSampleRate(44100.5)).not.toThrow();
  });

  for (const rate of [
    22049.9,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    it(`rejects ${String(rate)} with a RangeError naming the value and 22050`, () => {
      expect(() => validateSampleRate(rate)).toThrow(RangeError);
      expect(() => validateSampleRate(rate)).toThrow(String(rate));
      expect(() => validateSampleRate(rate)).toThrow("22050");
    });
  }
});

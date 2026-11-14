import { describe, expect, it } from "vitest";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { gainToDecibels } from "./gain-to-decibels";

describe("gainToDecibels", () => {
  it("gives 0 dB for a gain of 1", () => {
    expect(gainToDecibels(1)).toBe(0);
  });

  it("converts gains to levels", () => {
    expect(gainToDecibels(0.1)).toBeCloseTo(-20, 12);
    expect(gainToDecibels(10)).toBeCloseTo(20, 12);
    expect(gainToDecibels(0.5)).toBeCloseTo(-6.0206, 4);
  });

  it("inverts decibelsToGain within 1e-12 dB from -200 to +60 dB", () => {
    for (let tenthsDb = -2000; tenthsDb <= 600; tenthsDb += 1) {
      const levelDb = tenthsDb / 10;
      const roundTripDb = gainToDecibels(decibelsToGain(levelDb));
      expect(Math.abs(roundTripDb - levelDb), `${levelDb} dB`).toBeLessThan(
        1e-12,
      );
    }
  });
});

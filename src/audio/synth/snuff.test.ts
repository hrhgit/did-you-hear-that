import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { renderSnuff } from "./snuff";

describe("renderSnuff (the game layer, 2026-11-20)", () => {
  const rateHz = 48_000;
  const samples = renderSnuff(rateHz);

  it("starts and ends on exact zero, and ends before the shortest gap between trials", () => {
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(0);
    expect(samples.length / rateHz).toBeLessThan(0.8);
  });

  it("has the reference RMS of every sound", () => {
    let sumOfSquares = 0;
    for (const sample of samples) {
      sumOfSquares += sample * sample;
    }
    expect(Math.sqrt(sumOfSquares / samples.length)).toBeCloseTo(
      soundRulesConfig.referenceRmsFraction,
      6,
    );
  });

  it("peaks under its Peak_Bound", () => {
    let peak = 0;
    let sumOfSquares = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
      sumOfSquares += sample * sample;
    }
    const peakDb =
      20 * Math.log10(peak / Math.sqrt(sumOfSquares / samples.length));
    expect(peakDb).toBeLessThan(audioOutputConfig.peakBoundDb.snuff);
  });

  it("is the same every time", () => {
    expect(renderSnuff(rateHz)).toEqual(samples);
  });
});

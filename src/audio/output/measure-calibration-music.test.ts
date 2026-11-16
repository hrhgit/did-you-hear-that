import { describe, expect, it } from "vitest";
import { measureCalibrationMusic } from "./measure-calibration-music";

describe("measureCalibrationMusic", () => {
  it("gives the RMS, the peak and the crest factor of the samples", () => {
    const measure = measureCalibrationMusic([0.5, -0.5, 0.5, -0.5]);
    expect(measure).not.toBeNull();
    expect(measure?.rmsFraction).toBeCloseTo(0.5, 12);
    expect(measure?.peakFraction).toBe(0.5);
    expect(measure?.crestDb).toBeCloseTo(0, 12);
  });

  it("gives a sine's crest factor of 3.01 dB", () => {
    const sampleCount = 48000;
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = 0.8 * Math.sin((2 * Math.PI * 1000 * index) / 48000);
    }
    const measure = measureCalibrationMusic(samples);
    expect(measure?.rmsFraction).toBeCloseTo(0.8 / Math.SQRT2, 5);
    expect(measure?.peakFraction).toBeCloseTo(0.8, 5);
    expect(measure?.crestDb).toBeCloseTo(3.0103, 3);
  });

  it("takes the peak from the largest magnitude, negative or positive", () => {
    expect(measureCalibrationMusic([0.1, -0.9, 0.2])?.peakFraction).toBeCloseTo(
      0.9,
      12,
    );
  });

  it("gives null for an empty buffer", () => {
    expect(measureCalibrationMusic([])).toBeNull();
    expect(measureCalibrationMusic(new Float32Array(0))).toBeNull();
  });

  it("gives null for a silent buffer", () => {
    expect(measureCalibrationMusic(new Float32Array(1000))).toBeNull();
    expect(measureCalibrationMusic([0, -0, 0])).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "gives null for a buffer that holds %s",
    (bad) => {
      expect(measureCalibrationMusic([0.1, bad, 0.1])).toBeNull();
    },
  );

  it("freezes what it gives", () => {
    expect(Object.isFrozen(measureCalibrationMusic([0.1, -0.2]))).toBe(true);
  });
});

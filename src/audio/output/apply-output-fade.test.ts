import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { measureFadeLengths } from "../synth/measure/fade-lengths";
import { applyOutputFade } from "./apply-output-fade";

const { outputFadeMs } = audioOutputConfig;

describe("applyOutputFade", () => {
  it("returns a new 64-bit buffer and leaves the input as it was", () => {
    const samples = new Float32Array(2000).fill(0.5);
    const faded = applyOutputFade(samples, 44100);
    expect(faded).toBeInstanceOf(Float64Array);
    expect(faded).not.toBe(samples);
    expect(faded.length).toBe(samples.length);
    expect(samples.every((sample) => sample === 0.5)).toBe(true);
  });

  it("makes the first and last samples exactly +0, also for negative samples", () => {
    for (const value of [0.5, -0.5, -1e-30]) {
      const faded = applyOutputFade(new Float32Array(5000).fill(value), 48000);
      expect(Object.is(faded[0], 0), `${value} first`).toBe(true);
      expect(Object.is(faded[faded.length - 1], 0), `${value} last`).toBe(true);
    }
  });

  it("turns -0 into +0 everywhere", () => {
    const faded = applyOutputFade(new Float32Array(3000).fill(-0), 44100);
    expect(faded.every((sample) => Object.is(sample, 0))).toBe(true);
  });

  for (const sampleRateHz of [44100, 48000]) {
    it(`gives a constant buffer a measured fade of ${outputFadeMs} ms within one sample at ${sampleRateHz} Hz`, () => {
      const faded = applyOutputFade(
        new Float32Array(sampleRateHz).fill(0.3),
        sampleRateHz,
      );
      const { fadeInMs, fadeOutMs } = measureFadeLengths(faded, sampleRateHz);
      const msPerSample = 1000 / sampleRateHz;
      expect(Math.abs(fadeInMs - outputFadeMs)).toBeLessThanOrEqual(
        msPerSample,
      );
      expect(Math.abs(fadeOutMs - outputFadeMs)).toBeLessThanOrEqual(
        msPerSample,
      );
    });
  }

  it("leaves the middle of a long buffer unchanged", () => {
    const sampleRateHz = 48000;
    const faded = applyOutputFade(
      new Float32Array(sampleRateHz).fill(0.125),
      sampleRateHz,
    );
    const fadeSampleCount = (outputFadeMs * sampleRateHz) / 1000;
    for (
      let n = Math.ceil(fadeSampleCount);
      n < sampleRateHz - 1 - fadeSampleCount;
      n += 1
    ) {
      expect(faded[n]).toBe(0.125);
    }
  });

  it("keeps a buffer shorter than two fades at zero at both ends", () => {
    const sampleRateHz = 44100;
    const fadeSampleCount = (outputFadeMs * sampleRateHz) / 1000;
    for (const length of [1, 2, 3, 100, Math.floor(fadeSampleCount * 1.5)]) {
      const faded = applyOutputFade(
        new Float32Array(length).fill(0.5),
        sampleRateHz,
      );
      expect(Object.is(faded[0], 0), `${length} first`).toBe(true);
      expect(Object.is(faded[length - 1], 0), `${length} last`).toBe(true);
      expect(
        faded.every((sample) => sample >= 0 && sample <= 0.5),
        `${length} within the input`,
      ).toBe(true);
    }
  });
});

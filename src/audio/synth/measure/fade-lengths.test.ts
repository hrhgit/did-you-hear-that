import { describe, expect, it } from "vitest";
import { measureFadeLengths } from "./fade-lengths";

const sampleRateHz = 44100;
const msPerSample = 1000 / sampleRateHz;

/** Raised-cosine value at position `index` of a ramp of `length` samples that starts at 0. */
function ramp(index: number, length: number): number {
  return index >= length ? 1 : (1 - Math.cos((Math.PI * index) / length)) / 2;
}

/**
 * `leadingZeros` exact zeros, then a constant of 1 with raised-cosine fades of `fadeLength`
 * samples at both ends. Each fade starts on an exact zero.
 */
function constantWithFades(
  bodyLength: number,
  fadeLength: number,
  leadingZeros = 0,
): Float64Array {
  const samples = new Float64Array(leadingZeros + bodyLength);
  for (let n = 0; n < bodyLength; n += 1) {
    samples[leadingZeros + n] = Math.min(
      ramp(n, fadeLength),
      ramp(bodyLength - 1 - n, fadeLength),
    );
  }
  return samples;
}

describe("measureFadeLengths", () => {
  it("measures raised-cosine fades of 441 samples within one sample at both ends", () => {
    const { fadeInMs, fadeOutMs } = measureFadeLengths(
      constantWithFades(10000, 441),
      sampleRateHz,
    );
    expect(Math.abs(fadeInMs / msPerSample - 441)).toBeLessThanOrEqual(1);
    expect(Math.abs(fadeOutMs / msPerSample - 441)).toBeLessThanOrEqual(1);
  });

  it("measures the same fade from the onset when exact zeros come first", () => {
    const { fadeInMs } = measureFadeLengths(
      constantWithFades(10000, 441, 3000),
      sampleRateHz,
    );
    expect(Math.abs(fadeInMs / msPerSample - 441)).toBeLessThanOrEqual(1);
  });

  it("measures the same on a Float32Array", () => {
    const { fadeInMs, fadeOutMs } = measureFadeLengths(
      Float32Array.from(constantWithFades(10000, 441, 100)),
      sampleRateHz,
    );
    expect(Math.abs(fadeInMs / msPerSample - 441)).toBeLessThanOrEqual(1);
    expect(Math.abs(fadeOutMs / msPerSample - 441)).toBeLessThanOrEqual(1);
  });

  it("measures at most one sample for a step after exact zeros", () => {
    const samples = new Float64Array(5000);
    samples.fill(0.5, 1234);
    const { fadeInMs } = measureFadeLengths(samples, sampleRateHz);
    expect(fadeInMs).toBeLessThanOrEqual(msPerSample);
  });

  it("measures at most one sample for a buffer that starts at full level", () => {
    const samples = new Float64Array(5000).fill(0.5);
    const { fadeInMs, fadeOutMs } = measureFadeLengths(samples, sampleRateHz);
    expect(fadeInMs).toBeLessThanOrEqual(msPerSample);
    expect(fadeOutMs).toBeLessThanOrEqual(msPerSample);
  });

  it("measures at most 15 ms for a signal whose peak comes 15 ms after its onset", () => {
    // The rise starts on the last exact zero, at index 499, and peaks 15 ms later.
    const riseLength = Math.floor(0.015 * sampleRateHz);
    const samples = new Float64Array(20000);
    for (let k = 1; k <= riseLength; k += 1) {
      samples[499 + k] = k / riseLength;
    }
    samples.fill(0.5, 500 + riseLength, 19000);
    const { fadeInMs } = measureFadeLengths(samples, sampleRateHz);
    expect(fadeInMs).toBeLessThanOrEqual(15);
  });

  it("measures 0 for an all-zero buffer", () => {
    expect(measureFadeLengths(new Float64Array(1000), sampleRateHz)).toEqual({
      fadeInMs: 0,
      fadeOutMs: 0,
    });
    expect(measureFadeLengths(new Float64Array(0), sampleRateHz)).toEqual({
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  });

  it("measures NaN for a buffer that holds NaN", () => {
    const samples = constantWithFades(5000, 441);
    samples[2000] = Number.NaN;
    const { fadeInMs, fadeOutMs } = measureFadeLengths(samples, sampleRateHz);
    expect(fadeInMs).toBeNaN();
    expect(fadeOutMs).toBeNaN();
  });

  it("does not modify its input", () => {
    const samples = constantWithFades(5000, 441);
    const before = samples.slice();
    measureFadeLengths(samples, sampleRateHz);
    expect(samples).toEqual(before);
  });
});

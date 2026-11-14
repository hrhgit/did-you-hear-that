import { describe, expect, it } from "vitest";
import { ghostSoundIds } from "../../../config/sound-id";
import { createSeededRandom } from "../../../config/seeded-random";
import { soundRulesConfig } from "../../../config/sound-rules-config";
import { measureSound } from "./measure-sound";

const sampleRateHz = 48000;
const reference = soundRulesConfig.referenceRmsFraction;

/** A sine with raised-cosine fades of `fadeSamples` at both ends, scaled to `rms`. */
function fadedTone(
  frequencyHz: number,
  length: number,
  fadeSamples: number,
  rms: number,
): Float64Array {
  const samples = Float64Array.from({ length }, (_, n) => {
    const edge = Math.min(n, length - 1 - n);
    const gain =
      edge >= fadeSamples
        ? 1
        : (1 - Math.cos((Math.PI * edge) / fadeSamples)) / 2;
    return gain * Math.sin((2 * Math.PI * frequencyHz * n) / sampleRateHz);
  });
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  const scale = rms / Math.sqrt(sum / length);
  return samples.map((sample) => sample * scale);
}

describe("measureSound", () => {
  it("measures a faded 500 Hz tone as the cellar", () => {
    const samples = fadedTone(500, 48000, 2400, reference);
    const measurement = measureSound(samples, sampleRateHz, "cellar");
    expect(measurement.soundId).toBe("cellar");
    expect(measurement.sampleRateHz).toBe(sampleRateHz);
    expect(measurement.sampleCount).toBe(48000);
    expect(measurement.durationMs).toBe(1000);
    // The tone's last sample may be -0, which is an exact digital zero.
    expect(measurement.firstSample === 0).toBe(true);
    expect(measurement.lastSample === 0).toBe(true);
    expect(measurement.rmsFraction).toBeCloseTo(reference, 12);
    expect(Math.abs(measurement.levelDeviationDb)).toBeLessThan(1e-9);
    expect(measurement.inBandShareFraction).toBeGreaterThan(0.999);
    expect(measurement.outOfBandRatioDb).toBeLessThan(-30);
    expect(measurement.fadeInMs).toBeGreaterThan(49);
    expect(measurement.fadeOutMs).toBeGreaterThan(49);
    // A sine's peak is sqrt(2) times its RMS, about 3 dB, a little more with fades.
    expect(measurement.crestFactorDb).toBeGreaterThan(3);
    expect(measurement.crestFactorDb).toBeLessThan(3.5);
    expect(measurement.crestFactorDb).toBeCloseTo(
      20 * Math.log10(measurement.peakFraction / measurement.rmsFraction),
      12,
    );
    expect(measurement.roomBandLevelsDb).toBeNull();
    expect(measurement.calibrationShapeDistanceMaxDb).toBeNull();
  });

  it("finds the same tone far out of the attic band", () => {
    const samples = fadedTone(500, 48000, 2400, reference);
    const measurement = measureSound(samples, sampleRateHz, "attic");
    expect(measurement.inBandShareFraction).toBeLessThan(1e-6);
    expect(measurement.outOfBandRatioDb).toBeGreaterThan(30);
  });

  it("measures room band levels for the calibration noise, the loudest at 0 dB", () => {
    const random = createSeededRandom(3);
    const samples = Float64Array.from(
      { length: 48000 },
      () => 0.1 * (2 * random.next() - 1),
    );
    const measurement = measureSound(samples, sampleRateHz, "calibration");
    expect(measurement.inBandShareFraction).toBeNull();
    expect(measurement.outOfBandRatioDb).toBeNull();
    const levels = measurement.roomBandLevelsDb;
    expect(levels).not.toBeNull();
    if (levels === null) {
      return;
    }
    expect(Object.keys(levels)).toEqual([...ghostSoundIds]);
    expect(Math.max(...ghostSoundIds.map((id) => levels[id]))).toBe(0);
    // White noise: band energy grows with band width, which is proportional to the centre.
    // From 500 Hz to 8 kHz that is 4 octaves, about 12 dB.
    expect(levels.attic).toBe(0);
    // The cellar band holds about 116 independent bins of one second of noise, so allow 1.5 dB.
    expect(Math.abs(levels.cellar + 12)).toBeLessThan(1.5);
    const expectedDistance = Math.max(
      ...ghostSoundIds.map((id) =>
        Math.abs(levels[id] - soundRulesConfig.calibrationShapeDb[id]),
      ),
    );
    expect(measurement.calibrationShapeDistanceMaxDb).toBe(expectedDistance);
  });

  it("reports a silent buffer with zero RMS, no in-band energy and zero fades", () => {
    const measurement = measureSound(
      new Float32Array(1000),
      sampleRateHz,
      "stairs",
    );
    expect(measurement.rmsFraction).toBe(0);
    expect(measurement.levelDeviationDb).toBe(Number.NEGATIVE_INFINITY);
    expect(measurement.crestFactorDb).toBe(0);
    expect(measurement.inBandShareFraction).toBe(0);
    expect(measurement.outOfBandRatioDb).toBe(Number.POSITIVE_INFINITY);
    expect(measurement.fadeInMs).toBe(0);
    expect(measurement.fadeOutMs).toBe(0);
  });

  it("reports a silent calibration buffer with an infinite shape distance", () => {
    const measurement = measureSound(
      new Float32Array(1000),
      sampleRateHz,
      "calibration",
    );
    expect(measurement.calibrationShapeDistanceMaxDb).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("does not modify its input", () => {
    const samples = Float32Array.from(fadedTone(1000, 4800, 480, reference));
    const before = samples.slice();
    measureSound(samples, sampleRateHz, "corridor");
    expect(samples).toEqual(before);
  });
});

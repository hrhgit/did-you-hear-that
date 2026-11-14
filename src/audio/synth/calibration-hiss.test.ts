import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { createSeededRandom } from "../../config/seeded-random";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { renderCalibrationHiss } from "./calibration-hiss";
import { checkSound } from "./measure/check-sound";
import { measureSound } from "./measure/measure-sound";

const config = ghostSoundConfig.calibration;
const seeds = [1, 2, 3];

describe("renderCalibrationHiss", () => {
  for (const sampleRateHz of [44100, 48000]) {
    for (const seed of seeds) {
      describe(`at ${sampleRateHz} Hz with seed ${seed}`, () => {
        const samples = renderCalibrationHiss(
          sampleRateHz,
          createSeededRandom(seed),
        );

        it("meets every sound rule", () => {
          expect(
            checkSound(measureSound(samples, sampleRateHz, "calibration")),
          ).toEqual([]);
        });

        it("holds no NaN and starts and ends on exact zeros", () => {
          expect(samples.some(Number.isNaN)).toBe(false);
          expect(Object.is(samples[0], 0)).toBe(true);
          expect(Object.is(samples[samples.length - 1], 0)).toBe(true);
        });

        it("has the configured duration, rounded down to whole samples", () => {
          expect(samples).toHaveLength(
            Math.floor((config.durationMs * sampleRateHz) / 1000),
          );
        });
      });
    }
  }

  for (const sampleRateHz of [22050, 44100, 48000]) {
    it(`follows the calibration shape within the tolerance at ${sampleRateHz} Hz (R10.3)`, () => {
      const measurement = measureSound(
        renderCalibrationHiss(sampleRateHz, createSeededRandom(4)),
        sampleRateHz,
        "calibration",
      );
      expect(measurement.calibrationShapeDistanceMaxDb).toBeLessThanOrEqual(
        soundRulesConfig.calibrationShapeToleranceDb,
      );
    });
  }

  it("keeps a steady level between its fades: 50 ms windows vary by less than 1.5 dB (R5.6)", () => {
    for (const sampleRateHz of [44100, 48000]) {
      for (const seed of seeds) {
        const samples = renderCalibrationHiss(
          sampleRateHz,
          createSeededRandom(seed),
        );
        const windowLength = Math.floor((50 * sampleRateHz) / 1000);
        const start = Math.ceil((config.outerFadeMs * sampleRateHz) / 1000);
        const end = samples.length - start;
        const windowRms: number[] = [];
        for (
          let first = start;
          first + windowLength <= end;
          first += windowLength
        ) {
          let sum = 0;
          for (let n = first; n < first + windowLength; n += 1) {
            sum += samples[n] * samples[n];
          }
          windowRms.push(Math.sqrt(sum / windowLength));
        }
        expect(windowRms.length).toBeGreaterThan(20);
        const spreadDb =
          20 * Math.log10(Math.max(...windowRms) / Math.min(...windowRms));
        expect(spreadDb, `${sampleRateHz} Hz, seed ${seed}`).toBeLessThan(1.5);
      }
    }
  });

  it("throws a RangeError for an unsupported sample rate", () => {
    expect(() => renderCalibrationHiss(16000, createSeededRandom(1))).toThrow(
      RangeError,
    );
  });

  // Cases found by a sweep of seeds while this sound was written, before the property tests
  // existed. With noise cut from a power-of-two period about twice the buffer length, these seeds
  // measured the calibration shape off by 1.035, 1.023 and 1.040 dB, against a limit of 1 dB. Noise
  // that is exactly one buffer long fixes them (D36).
  for (const seed of [1082, 1140, 1276]) {
    it(`regression: calibration shape more than 1 dB off (sweep, calibration, seed ${seed}, 44100 Hz)`, () => {
      const measurement = measureSound(
        renderCalibrationHiss(44100, createSeededRandom(seed)),
        44100,
        "calibration",
      );
      expect(checkSound(measurement)).toEqual([]);
    });
  }
});

import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { createSeededRandom } from "../../config/seeded-random";
import { planCorridorHum } from "./corridor-hum-plan";
import { renderCorridorHum } from "./corridor-hum";
import { checkSound } from "./measure/check-sound";
import { measureSound } from "./measure/measure-sound";

const config = ghostSoundConfig.corridor;
const seeds = [1, 2, 3];
const sampleRatesHz = [44100, 48000];

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("renderCorridorHum", () => {
  for (const sampleRateHz of sampleRatesHz) {
    for (const seed of seeds) {
      describe(`at ${sampleRateHz} Hz with seed ${seed}`, () => {
        const samples = renderCorridorHum(
          sampleRateHz,
          createSeededRandom(seed),
        );

        it("meets every sound rule", () => {
          expect(
            checkSound(measureSound(samples, sampleRateHz, "corridor")),
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

  it("returns a new buffer on every call", () => {
    const first = renderCorridorHum(44100, createSeededRandom(1));
    const second = renderCorridorHum(44100, createSeededRandom(1));
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("throws a RangeError for an unsupported sample rate", () => {
    expect(() => renderCorridorHum(16000, createSeededRandom(1))).toThrow(
      RangeError,
    );
  });
});

describe("planCorridorHum", () => {
  it("returns a deeply frozen plan", () => {
    for (const seed of seeds) {
      expect(isDeeplyFrozen(planCorridorHum(createSeededRandom(seed)))).toBe(
        true,
      );
    }
  });

  it("plans pitchWobbleSinusoidCount pitch wobbles", () => {
    for (const seed of seeds) {
      expect(
        planCorridorHum(createSeededRandom(seed)).pitchWobbles,
      ).toHaveLength(config.pitchWobbleSinusoidCount);
    }
  });
});

import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { createSeededRandom } from "../../config/seeded-random";
import { planAtticWhine } from "./attic-whine-plan";
import { renderAtticWhine } from "./attic-whine";
import { checkSound } from "./measure/check-sound";
import { measureSound } from "./measure/measure-sound";

const config = ghostSoundConfig.attic;
const seeds = [1, 2, 3];
const sampleRatesHz = [44100, 48000];

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("renderAtticWhine", () => {
  for (const sampleRateHz of sampleRatesHz) {
    for (const seed of seeds) {
      describe(`at ${sampleRateHz} Hz with seed ${seed}`, () => {
        const samples = renderAtticWhine(
          sampleRateHz,
          createSeededRandom(seed),
        );

        it("meets every sound rule", () => {
          expect(
            checkSound(measureSound(samples, sampleRateHz, "attic")),
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
    const first = renderAtticWhine(44100, createSeededRandom(1));
    const second = renderAtticWhine(44100, createSeededRandom(1));
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("throws a RangeError for an unsupported sample rate", () => {
    expect(() => renderAtticWhine(16000, createSeededRandom(1))).toThrow(
      RangeError,
    );
  });
});

describe("planAtticWhine", () => {
  it("returns a deeply frozen plan", () => {
    for (const seed of seeds) {
      expect(isDeeplyFrozen(planAtticWhine(createSeededRandom(seed)))).toBe(
        true,
      );
    }
  });

  it("keeps the carrier within its configured deviation", () => {
    for (const seed of seeds) {
      const { carrierHz } = planAtticWhine(createSeededRandom(seed));
      expect(Math.abs(carrierHz / config.centreHz - 1)).toBeLessThanOrEqual(
        config.carrierDeviationMaxFraction,
      );
    }
  });
});

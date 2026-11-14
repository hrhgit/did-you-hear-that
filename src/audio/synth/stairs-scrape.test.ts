import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { createSeededRandom } from "../../config/seeded-random";
import { planStairsScrape } from "./stairs-scrape-plan";
import { renderStairsScrape } from "./stairs-scrape";
import { checkSound } from "./measure/check-sound";
import { measureSound } from "./measure/measure-sound";

const config = ghostSoundConfig.stairs;
const seeds = [1, 2, 3];
const sampleRatesHz = [44100, 48000];

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("renderStairsScrape", () => {
  for (const sampleRateHz of sampleRatesHz) {
    for (const seed of seeds) {
      describe(`at ${sampleRateHz} Hz with seed ${seed}`, () => {
        const samples = renderStairsScrape(
          sampleRateHz,
          createSeededRandom(seed),
        );

        it("meets every sound rule", () => {
          expect(
            checkSound(measureSound(samples, sampleRateHz, "stairs")),
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
    const first = renderStairsScrape(44100, createSeededRandom(1));
    const second = renderStairsScrape(44100, createSeededRandom(1));
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("throws a RangeError for an unsupported sample rate", () => {
    expect(() => renderStairsScrape(16000, createSeededRandom(1))).toThrow(
      RangeError,
    );
  });
});

describe("planStairsScrape", () => {
  it("returns a deeply frozen plan", () => {
    for (const seed of seeds) {
      expect(isDeeplyFrozen(planStairsScrape(createSeededRandom(seed)))).toBe(
        true,
      );
    }
  });

  it("starts the first grain at 0 and every grain before durationMs - grainLengthMinMs", () => {
    for (const seed of seeds) {
      const { grains } = planStairsScrape(createSeededRandom(seed));
      expect(grains.length).toBeGreaterThan(0);
      expect(grains[0].startMs).toBe(0);
      for (const grain of grains) {
        expect(grain.startMs).toBeLessThan(
          config.durationMs - config.grainLengthMinMs,
        );
      }
    }
  });
});

// Cases found by a sweep of 1000 seeds while this sound was written, before the property tests
// existed. With an outer fade of 50 ms these seeds measured a fade out of 19.2 to 19.9 ms, under
// the 20 ms limit, because the loudest instant of the scrape fell inside the fade-out. The outer
// fade is now 80 ms (D37).
describe("stairs scrape regressions", () => {
  for (const [seed, sampleRateHz] of [
    [100349, 44100],
    [100850, 44100],
    [100041, 48000],
    [100349, 48000],
    [100740, 48000],
    [100850, 48000],
  ]) {
    it(`regression: fade out under 20 ms (sweep, stairs, seed ${seed}, ${sampleRateHz} Hz)`, () => {
      const measurement = measureSound(
        renderStairsScrape(sampleRateHz, createSeededRandom(seed)),
        sampleRateHz,
        "stairs",
      );
      expect(checkSound(measurement)).toEqual([]);
    });
  }
});

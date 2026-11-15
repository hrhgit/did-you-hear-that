import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../../src/config/seeded-random";
import {
  balanceLabels,
  guessFromScreen,
  type LeakSample,
} from "./guess-from-screen";

/** Samples whose features are drawn without looking at the label. */
function independentSamples(seed: number, count: number): LeakSample[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => ({
    features: [
      Math.floor(random.next() * 4),
      Math.floor(random.next() * 3),
      Math.floor(random.next() * 5),
    ],
    label: random.next() < 0.5 ? "left" : "right",
  }));
}

/** Samples in which one feature agrees with the label `share` of the time. */
function leakySamples(
  seed: number,
  count: number,
  share: number,
): LeakSample[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => {
    const label = random.next() < 0.5 ? "left" : "right";
    const told =
      random.next() < share ? label : random.next() < 0.5 ? "left" : "right";
    return {
      features: [
        Math.floor(random.next() * 4),
        told === "left" ? 0 : 1,
        Math.floor(random.next() * 5),
      ],
      label,
    };
  });
}

describe("guessFromScreen", () => {
  it("does no better than chance when the screen is independent of the sound", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const verdict = guessFromScreen(
        independentSamples(seed, 4000),
        independentSamples(seed + 100, 4000),
      );
      expect(verdict.leaks, `seed ${String(seed)}`).toBe(false);
      expect(verdict.accuracy).toBeLessThanOrEqual(verdict.limit);
    }
  });

  it("catches a screen that gives the side away one time in ten", () => {
    const verdict = guessFromScreen(
      leakySamples(11, 4000, 0.1),
      leakySamples(12, 4000, 0.1),
    );
    expect(verdict.leaks).toBe(true);
    expect(verdict.chosenFeatures).toContain(1);
  });

  it("catches a screen that always gives the side away", () => {
    const verdict = guessFromScreen(
      leakySamples(21, 500, 1),
      leakySamples(22, 500, 1),
    );
    expect(verdict.accuracy).toBe(1);
    expect(verdict.leaks).toBe(true);
  });

  it("catches a leak that only two features together give away", () => {
    const make = (seed: number): LeakSample[] => {
      const random = createSeededRandom(seed);
      return Array.from({ length: 3000 }, () => {
        const first = random.next() < 0.5 ? 0 : 1;
        const second = random.next() < 0.5 ? 0 : 1;
        return {
          features: [first, second],
          label: first === second ? "sound" : "none",
        };
      });
    };
    const verdict = guessFromScreen(make(31), make(32));
    expect(verdict.chosenFeatures).toEqual([0, 1]);
    expect(verdict.leaks).toBe(true);
  });

  it("measures chance as the share of the most common label", () => {
    const samples = (seed: number): LeakSample[] => {
      const random = createSeededRandom(seed);
      return Array.from({ length: 2000 }, () => ({
        features: [Math.floor(random.next() * 3)],
        label: random.next() < 0.75 ? "sound" : "none",
      }));
    };
    const verdict = guessFromScreen(samples(41), samples(42));
    expect(verdict.chance).toBeGreaterThan(0.7);
    expect(verdict.chance).toBeLessThan(0.8);
    expect(verdict.leaks).toBe(false);
  });

  it("refuses empty lists and samples of different lengths", () => {
    const one: LeakSample = { features: [1], label: "left" };
    expect(() => guessFromScreen([], [one])).toThrow(RangeError);
    expect(() => guessFromScreen([one], [])).toThrow(RangeError);
    expect(() =>
      guessFromScreen([one], [{ features: [1, 2], label: "left" }]),
    ).toThrow(RangeError);
  });
});

/** Four trials in five have a sound, and the screen marks one sound in ten. */
function confirmingSamples(seed: number, count: number): LeakSample[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => {
    const label = random.next() < 0.8 ? "sound" : "noSound";
    return {
      features: [label === "sound" && random.next() < 0.1 ? 1 : 0],
      label,
    };
  });
}

describe("balanceLabels", () => {
  it("keeps the same number of every label, in the old order", () => {
    const samples = confirmingSamples(21, 1000);
    const balanced = balanceLabels(samples, createSeededRandom(22));
    const rare = samples.filter((sample) => sample.label === "noSound").length;
    expect(
      balanced.filter((sample) => sample.label === "noSound"),
    ).toHaveLength(rare);
    expect(balanced.filter((sample) => sample.label === "sound")).toHaveLength(
      rare,
    );
    const places = balanced.map((sample) => samples.indexOf(sample));
    expect(places).toEqual([...places].sort((a, b) => a - b));
    expect(new Set(places).size).toBe(places.length);
  });

  it("lets the predictor catch a screen that only confirms a sound one time in ten", () => {
    // Guessing "sound" every time is already right four times in five, so the mark changes no
    // guess and the predictor sees nothing.
    expect(
      guessFromScreen(confirmingSamples(23, 8000), confirmingSamples(24, 8000))
        .leaks,
    ).toBe(false);
    const verdict = guessFromScreen(
      balanceLabels(confirmingSamples(23, 8000), createSeededRandom(25)),
      balanceLabels(confirmingSamples(24, 8000), createSeededRandom(26)),
    );
    expect(verdict.chance).toBeCloseTo(0.5, 5);
    expect(verdict.leaks).toBe(true);
  });
});

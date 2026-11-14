import { describe, expect, it } from "vitest";
import { checkSound } from "../../src/audio/synth/measure/check-sound";
import { measureSound } from "../../src/audio/synth/measure/measure-sound";
import type { RenderFunction } from "../../src/audio/synth/sound-renderers";
import { soundRenderers } from "../../src/audio/synth/sound-renderers";
import { createSeededRandom } from "../../src/config/seeded-random";
import {
  measureSounds,
  reportSampleRatesHz,
  reportSeeds,
} from "./measure-sounds";

describe("measureSounds", () => {
  it("uses the rates 44100 and 48000 Hz and the seeds 1 to 10 (D16)", () => {
    expect(reportSampleRatesHz).toEqual([44100, 48000]);
    expect(reportSeeds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(Object.isFrozen(reportSampleRatesHz)).toBe(true);
    expect(Object.isFrozen(reportSeeds)).toBe(true);
  });

  it("measures the real attic whine as the property tests do, in the order rate, seed", () => {
    const runs = measureSounds(["attic"], soundRenderers);
    expect(
      runs.map((run) => [run.soundId, run.sampleRateHz, run.seed]),
    ).toEqual(
      reportSampleRatesHz.flatMap((rate) =>
        reportSeeds.map((seed) => ["attic", rate, seed]),
      ),
    );
    for (const run of runs) {
      const expected = measureSound(
        soundRenderers.attic(run.sampleRateHz, createSeededRandom(run.seed)),
        run.sampleRateHz,
        "attic",
      );
      expect(run.measurement).toEqual(expected);
      expect(run.brokenRules).toEqual(checkSound(expected));
      expect(run.brokenRules).toEqual([]);
      expect(run.errorMessage).toBeNull();
    }
  }, 60_000);

  it("turns a throwing renderer into runs with its message and keeps measuring", () => {
    const calls: number[] = [];
    const throwing: RenderFunction = (sampleRate, random) => {
      calls.push(random.seed);
      if (random.seed === 3) {
        throw new Error(`no knock at ${sampleRate} Hz`);
      }
      return soundRenderers.cellar(sampleRate, random);
    };
    const runs = measureSounds(["cellar"], {
      ...soundRenderers,
      cellar: throwing,
    });
    expect(calls).toEqual([...reportSeeds, ...reportSeeds]);
    expect(runs).toHaveLength(20);
    const thrown = runs.filter((run) => run.errorMessage !== null);
    expect(
      thrown.map((run) => [run.sampleRateHz, run.seed, run.errorMessage]),
    ).toEqual([
      [44100, 3, "no knock at 44100 Hz"],
      [48000, 3, "no knock at 48000 Hz"],
    ]);
    for (const run of thrown) {
      expect(run.measurement).toBeNull();
      expect(run.brokenRules).toEqual([]);
    }
    for (const run of runs.filter((each) => each.errorMessage === null)) {
      expect(run.brokenRules).toEqual([]);
    }
  }, 60_000);

  it("records a thrown value that is not an Error", () => {
    const runs = measureSounds(["attic"], {
      ...soundRenderers,
      attic: () => {
        throw "out of whine";
      },
    });
    expect(new Set(runs.map((run) => run.errorMessage))).toEqual(
      new Set(["out of whine"]),
    );
  });

  it("returns frozen runs", () => {
    const runs = measureSounds(["attic"], {
      ...soundRenderers,
      attic: () => {
        throw new Error("x");
      },
    });
    expect(Object.isFrozen(runs)).toBe(true);
    expect(runs.every((run) => Object.isFrozen(run))).toBe(true);
  });
});

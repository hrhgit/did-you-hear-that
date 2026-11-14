import { describe, expect, it } from "vitest";
import { ghostSoundConfig } from "../../config/ghost-sound-config";
import { createSeededRandom } from "../../config/seeded-random";
import { planNurseryMusicBox } from "./nursery-music-box-plan";
import { renderNurseryMusicBox } from "./nursery-music-box";
import { checkSound } from "./measure/check-sound";
import { measureSound } from "./measure/measure-sound";

const config = ghostSoundConfig.nursery;
const seeds = [1, 2, 3];
const sampleRatesHz = [44100, 48000];

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("renderNurseryMusicBox", () => {
  for (const sampleRateHz of sampleRatesHz) {
    for (const seed of seeds) {
      describe(`at ${sampleRateHz} Hz with seed ${seed}`, () => {
        const samples = renderNurseryMusicBox(
          sampleRateHz,
          createSeededRandom(seed),
        );

        it("meets every sound rule", () => {
          expect(
            checkSound(measureSound(samples, sampleRateHz, "nursery")),
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
    const first = renderNurseryMusicBox(44100, createSeededRandom(1));
    const second = renderNurseryMusicBox(44100, createSeededRandom(1));
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("throws a RangeError for an unsupported sample rate", () => {
    expect(() => renderNurseryMusicBox(16000, createSeededRandom(1))).toThrow(
      RangeError,
    );
  });
});

describe("planNurseryMusicBox", () => {
  it("returns a deeply frozen plan", () => {
    for (const seed of seeds) {
      expect(
        isDeeplyFrozen(planNurseryMusicBox(createSeededRandom(seed))),
      ).toBe(true);
    }
  });

  it("plans noteCount notes from the configured pitches, none equal to the one before", () => {
    for (const seed of seeds) {
      const { notes } = planNurseryMusicBox(createSeededRandom(seed));
      expect(notes).toHaveLength(config.noteCount);
      for (const [index, note] of notes.entries()) {
        expect(config.noteFrequenciesHz).toContain(note.frequencyHz);
        if (index > 0) {
          expect(note.frequencyHz).not.toBe(notes[index - 1].frequencyHz);
        }
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import type { RandomSource } from "../../config/seeded-random";
import { createSeededRandom } from "../../config/seeded-random";
import type { SoundId } from "../../config/sound-id";
import { soundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import type { RenderFunction } from "../synth/sound-renderers";
import { soundRenderers } from "../synth/sound-renderers";
import { renderPlayableBuffer } from "./render-playable-buffer";

const { renderAttemptsMaxCount, peakBoundDb } = audioOutputConfig;

function boundOf(soundId: SoundId): number {
  return (
    soundRulesConfig.referenceRmsFraction * decibelsToGain(peakBoundDb[soundId])
  );
}

/**
 * Renderers that give the corridor sound a buffer whose peak is `peaks[i]` on the i-th call, and
 * record the random source and its first draw on every call.
 */
function scriptedRenderers(peaks: readonly number[]): {
  renderers: Readonly<Record<SoundId, RenderFunction>>;
  calls: { random: RandomSource; firstDraw: number }[];
} {
  const calls: { random: RandomSource; firstDraw: number }[] = [];
  const corridor: RenderFunction = (_sampleRate, random) => {
    const peak = peaks[calls.length] ?? 0;
    calls.push({ random, firstDraw: random.next() });
    const samples = new Float32Array(100);
    samples[50] = peak;
    return samples;
  };
  return { renderers: { ...soundRenderers, corridor }, calls };
}

describe("renderPlayableBuffer", () => {
  it("renders again from the same source, moved on, while the peak is above the bound (R9.1)", () => {
    const bound = boundOf("corridor");
    const { renderers, calls } = scriptedRenderers([
      bound * 1.01,
      bound * 2,
      bound * 0.9,
    ]);
    const random = createSeededRandom(7);
    const result = renderPlayableBuffer("corridor", 48000, random, renderers);
    expect(result.kind).toBe("ready");
    expect(result.kind === "ready" && result.attemptCount).toBe(3);
    expect(calls.map((call) => call.random)).toEqual([random, random, random]);
    expect(new Set(calls.map((call) => call.firstDraw)).size).toBe(3);
  });

  it("accepts a peak exactly at the bound", () => {
    // The largest 32-bit value that is not above the 64-bit bound.
    const bound = boundOf("corridor");
    const view = new Float32Array([bound]);
    if (view[0] > bound) {
      new Uint32Array(view.buffer)[0] -= 1;
    }
    expect(view[0]).toBeLessThanOrEqual(bound);
    const { renderers } = scriptedRenderers([view[0]]);
    const result = renderPlayableBuffer(
      "corridor",
      48000,
      createSeededRandom(1),
      renderers,
    );
    expect(result.kind === "ready" && result.attemptCount).toBe(1);
  });

  it(`refuses with peakBoundNotMet after ${renderAttemptsMaxCount} renders above the bound`, () => {
    const bound = boundOf("corridor");
    const { renderers, calls } = scriptedRenderers(
      Array.from({ length: renderAttemptsMaxCount + 1 }, () => bound * 1.5),
    );
    expect(
      renderPlayableBuffer("corridor", 48000, createSeededRandom(1), renderers),
    ).toEqual({ kind: "refused", reason: "peakBoundNotMet" });
    expect(calls.length).toBe(renderAttemptsMaxCount);
  });

  it(`accepts a render on attempt ${renderAttemptsMaxCount}`, () => {
    const bound = boundOf("corridor");
    const peaks = [
      ...Array.from({ length: renderAttemptsMaxCount - 1 }, () => bound * 1.5),
      bound * 0.5,
    ];
    const { renderers } = scriptedRenderers(peaks);
    const result = renderPlayableBuffer(
      "corridor",
      48000,
      createSeededRandom(1),
      renderers,
    );
    expect(result.kind === "ready" && result.attemptCount).toBe(
      renderAttemptsMaxCount,
    );
  });

  it("refuses with renderFailed when the render function throws", () => {
    expect(renderPlayableBuffer("attic", 16000, createSeededRandom(1))).toEqual(
      { kind: "refused", reason: "renderFailed" },
    );
    const throwing: RenderFunction = () => {
      throw new Error("broken");
    };
    expect(
      renderPlayableBuffer("nursery", 48000, createSeededRandom(1), {
        ...soundRenderers,
        nursery: throwing,
      }),
    ).toEqual({ kind: "refused", reason: "renderFailed" });
  });

  // Measured when this test was written: every case took one render, except the stairs scrape at
  // seed 2 and 44100 Hz, which took two (design.md, D37).
  for (const sampleRateHz of [44100, 48000]) {
    it(`accepts every sound at seeds 1 to 10 at ${sampleRateHz} Hz with the real renderers`, () => {
      for (const soundId of soundIds) {
        for (let seed = 1; seed <= 10; seed += 1) {
          const result = renderPlayableBuffer(
            soundId,
            sampleRateHz,
            createSeededRandom(seed),
          );
          expect(result.kind, `${soundId} seed ${seed}`).toBe("ready");
          if (result.kind === "ready") {
            expect(result.attemptCount).toBeGreaterThanOrEqual(1);
            expect(result.attemptCount).toBeLessThanOrEqual(
              renderAttemptsMaxCount,
            );
            const peak = result.samples.reduce(
              (largest, sample) => Math.max(largest, Math.abs(sample)),
              0,
            );
            expect(peak).toBeLessThanOrEqual(boundOf(soundId));
          }
        }
      }
    });
  }
});

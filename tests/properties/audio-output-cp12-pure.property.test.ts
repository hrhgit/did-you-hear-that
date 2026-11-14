import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { PreparedPlayback } from "../../src/audio/output/output-types";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import { renderPlayableBuffer } from "../../src/audio/output/render-playable-buffer";
import {
  anyRequestSpecArbitrary,
  materializeRequest,
} from "./output-arbitraries";
import {
  seedArbitrary,
  soundIdArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/** Runs (design.md, Correctness properties). */
const runs = 100;

function sameSamples(first: Float32Array, second: Float32Array): boolean {
  return (
    first.length === second.length &&
    first.every((sample, n) => Object.is(sample, second[n]))
  );
}

function expectSameResult(
  first: PreparedPlayback,
  second: PreparedPlayback,
): void {
  if (first.kind === "refused" || second.kind === "refused") {
    expect(second).toEqual(first);
    return;
  }
  expect(sameSamples(first.left, second.left)).toBe(true);
  expect(sameSamples(first.right, second.right)).toBe(true);
  for (const field of [
    "requestedLevelDb",
    "playedLevelDb",
    "appliedGain",
    "clampLimit",
    "peakFraction",
  ] as const) {
    expect(Object.is(second[field], first[field]), field).toBe(true);
  }
}

describe("audio output CP12. The core is pure (Universal; R3.5)", () => {
  it("gives equal results for equal requests and leaves the input samples unchanged", () => {
    fc.assert(
      fc.property(anyRequestSpecArbitrary, (spec) => {
        const request = materializeRequest(spec);
        const inputCopy = Float32Array.from(request.samples);
        const first = preparePlayback(request);
        const again = preparePlayback(request);
        const fromEqualRequest = preparePlayback(materializeRequest(spec));
        expect(sameSamples(request.samples, inputCopy)).toBe(true);
        expectSameResult(first, again);
        expectSameResult(first, fromEqualRequest);
      }),
      { numRuns: runs },
    );
  }, 120_000);

  it("renders equal playable buffers with equal attempt counts from equal seeds", () => {
    fc.assert(
      fc.property(
        soundIdArbitrary,
        supportedSampleRateArbitrary,
        seedArbitrary,
        (soundId, sampleRateHz, seed) => {
          const first = renderPlayableBuffer(
            soundId,
            sampleRateHz,
            createSeededRandom(seed),
          );
          const second = renderPlayableBuffer(
            soundId,
            sampleRateHz,
            createSeededRandom(seed),
          );
          expect(second.kind).toBe(first.kind);
          if (first.kind === "ready" && second.kind === "ready") {
            expect(second.attemptCount).toBe(first.attemptCount);
            expect(second.samples).not.toBe(first.samples);
            expect(sameSamples(first.samples, second.samples)).toBe(true);
          }
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import {
  anyRequestSpecArbitrary,
  materializeRequest,
} from "./output-arbitraries";

/** Runs (design.md, Correctness properties). */
const runs = 300;

describe("audio output CP1. Nothing goes beyond the ceiling (Universal; R7.1, R7.2, R7.7, R20.1; brief property 1)", () => {
  it("refuses, or keeps every sample within the ceiling and the played level at most the request", () => {
    const { ceilingFraction } = audioSafetyConfig;
    fc.assert(
      fc.property(anyRequestSpecArbitrary, (spec) => {
        const result = preparePlayback(materializeRequest(spec));
        if (result.kind === "refused") {
          expect(result.reason).not.toBe("beyondCeiling");
          return;
        }
        for (const channel of [result.left, result.right]) {
          const beyond = channel.findIndex(
            (sample) => !(Math.abs(sample) <= ceilingFraction),
          );
          expect(beyond).toBe(-1);
        }
        expect(result.peakFraction).toBeLessThanOrEqual(ceilingFraction);
        expect(result.playedLevelDb).toBeLessThanOrEqual(spec.requestedLevelDb);
      }),
      { numRuns: runs },
    );
  }, 120_000);
});

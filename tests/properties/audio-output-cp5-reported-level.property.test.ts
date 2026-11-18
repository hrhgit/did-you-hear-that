import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import { applyOutputFade } from "../../src/audio/output/apply-output-fade";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import {
  finiteLevelArbitrary,
  materializeRequest,
  requestSpecArbitrary,
  validCalibrationGainArbitrary,
} from "./output-arbitraries";
import { supportedSampleRateArbitrary } from "./sound-arbitraries";

/** Runs (design.md, Correctness properties). */
const runs = 300;

/** Relative distance of two gains, 0 when both are 0. */
function relativeDistance(actual: number, expected: number): number {
  if (actual === expected) {
    return 0;
  }
  return (
    Math.abs(actual - expected) / Math.max(Math.abs(actual), Math.abs(expected))
  );
}

describe("audio output CP5. The level reported is the level played (Universal; R7.4, R8.1, R8.2)", () => {
  it("reports the level and gain that produced the samples", () => {
    const { ceilingFraction } = audioSafetyConfig;
    fc.assert(
      fc.property(
        requestSpecArbitrary({
          sampleRateHz: supportedSampleRateArbitrary,
          requestedLevelDb: finiteLevelArbitrary,
          calibrationGain: validCalibrationGainArbitrary,
        }),
        (spec) => {
          const request = materializeRequest(spec);
          const result = preparePlayback(request);
          if (result.kind === "refused") {
            return;
          }
          if (result.clampLimit === null) {
            expect(result.playedLevelDb).toBe(spec.requestedLevelDb);
          }
          expect(result.requestedLevelDb).toBe(spec.requestedLevelDb);
          expect(
            relativeDistance(
              result.appliedGain,
              spec.calibrationGain * decibelsToGain(result.playedLevelDb),
            ),
          ).toBeLessThanOrEqual(1e-9);

          const faded = applyOutputFade(request.samples, request.sampleRateHz);
          const playedChannels =
            spec.earChoice === "both"
              ? [result.left, result.right]
              : spec.earChoice === "left"
                ? [result.left]
                : [result.right];
          for (const channel of playedChannels) {
            expect(channel.length).toBe(faded.length);
            const differing = channel.findIndex(
              (sample, n) =>
                !Object.is(
                  sample,
                  Math.fround(faded[n] * result.appliedGain) + 0,
                ),
            );
            expect(differing).toBe(-1);
          }

          if (result.clampLimit === "ceiling") {
            expect(result.peakFraction).toBeGreaterThanOrEqual(
              ceilingFraction * (1 - 1e-6),
            );
          }
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});

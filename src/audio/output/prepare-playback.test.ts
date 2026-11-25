import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { applyOutputFade } from "./apply-output-fade";
import { gainToDecibels } from "./gain-to-decibels";
import type { PlaybackRequest, PreparedPlayback } from "./output-types";
import { preparePlayback } from "./prepare-playback";

const { ceilingFraction, ghostSoundMaxDurationMs } = audioSafetyConfig;
const { capRelativeToAnchorDb } = hearingMethodConfig;
const sampleRateHz = 44100;

/** One second of a constant, which the Output_Fade alone fades to 25 ms at each end. */
function constant(value: number, length = sampleRateHz): Float32Array {
  return new Float32Array(length).fill(value);
}

function request(overrides: Partial<PlaybackRequest> = {}): PlaybackRequest {
  return {
    samples: constant(0.05),
    sampleRateHz,
    soundId: "corridor",
    earChoice: "left",
    requestedLevelDb: 0,
    calibrationGain: 1,
    ...overrides,
  };
}

function ready(
  result: PreparedPlayback,
): Extract<PreparedPlayback, { kind: "ready" }> {
  if (result.kind !== "ready") {
    throw new Error(`Expected a ready playback, but got ${result.reason}.`);
  }
  return result;
}

function peakOf(samples: Float32Array): number {
  return samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
}

describe("preparePlayback", () => {
  describe("refusals, in the order of the steps", () => {
    it("refuses a sample rate below the lowest supported rate or not finite (R10.5)", () => {
      for (const rate of [
        soundRulesConfig.sampleRateMinHz - 1,
        0,
        -48000,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]) {
        expect(
          preparePlayback(request({ sampleRateHz: rate })),
          String(rate),
        ).toEqual({ kind: "refused", reason: "unsupportedSampleRate" });
      }
    });

    it("refuses an empty buffer (R10.3)", () => {
      expect(
        preparePlayback(request({ samples: new Float32Array(0) })),
      ).toEqual({ kind: "refused", reason: "emptyBuffer" });
    });

    it("plays a buffer longer than the longest ghost sound (the length limit was dropped on 2026-11-17)", () => {
      const longestCount = Math.floor(
        (ghostSoundMaxDurationMs * sampleRateHz) / 1000,
      );
      expect(
        preparePlayback(request({ samples: constant(0.05, longestCount * 4) }))
          .kind,
      ).toBe("ready");
    });

    it("refuses a buffer holding NaN or an infinity (R10.4)", () => {
      for (const bad of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        const samples = constant(0.05);
        samples[1234] = bad;
        expect(preparePlayback(request({ samples })), String(bad)).toEqual({
          kind: "refused",
          reason: "notFinite",
        });
      }
    });

    it("refuses a level that is not finite (R7.6)", () => {
      for (const levelDb of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        expect(
          preparePlayback(request({ requestedLevelDb: levelDb })),
          String(levelDb),
        ).toEqual({ kind: "refused", reason: "invalidLevel" });
      }
    });

    it("refuses a calibration gain that is not finite or not above zero (R7.6)", () => {
      for (const gain of [0, -0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(
          preparePlayback(request({ calibrationGain: gain })),
          String(gain),
        ).toEqual({ kind: "refused", reason: "invalidCalibrationGain" });
      }
    });

    it("refuses a ghost sound in both ears (R6.3, D21)", () => {
      expect(
        preparePlayback(request({ soundId: "stairs", earChoice: "both" })),
      ).toEqual({ kind: "refused", reason: "bothEarsForGhostSound" });
    });

    it("refuses a buffer that is silent once faded (R10.4)", () => {
      expect(preparePlayback(request({ samples: constant(0) }))).toEqual({
        kind: "refused",
        reason: "silentBuffer",
      });
      // A single sample at the very start is removed by the fade.
      const samples = new Float32Array(1000);
      samples[0] = 0.1;
      expect(preparePlayback(request({ samples }))).toEqual({
        kind: "refused",
        reason: "silentBuffer",
      });
    });

    it("plays a buffer that jumps from silence to its peak in the middle (the fade-length check was dropped on 2026-11-17)", () => {
      const samples = new Float32Array(sampleRateHz);
      samples.fill(0.05, 20000);
      expect(preparePlayback(request({ samples })).kind).toBe("ready");
    });

    it("never reaches the beyondCeiling guard, even at the largest gains (R7.7)", () => {
      for (const calibrationGain of [1, 1e6, 1e12, 1e300]) {
        for (const peak of [0.5, 1, 3e38]) {
          const result = ready(
            preparePlayback(
              request({
                samples: constant(peak),
                calibrationGain,
                requestedLevelDb: capRelativeToAnchorDb,
              }),
            ),
          );
          expect(result.peakFraction).toBeLessThanOrEqual(ceilingFraction);
        }
      }
    });
  });

  describe("no anchor cap in the output stage (dropped on 2026-11-17)", () => {
    it("plays a request of +20 dB as asked when the ceiling allows it", () => {
      const result = ready(
        preparePlayback(
          request({ requestedLevelDb: 20, calibrationGain: 0.01 }),
        ),
      );
      expect(result.requestedLevelDb).toBe(20);
      expect(result.playedLevelDb).toBe(20);
      expect(result.clampLimit).toBeNull();
      expect(result.appliedGain).toBe(0.01 * decibelsToGain(20));
    });
  });

  describe("the ceiling (R7.4, D5)", () => {
    it("turns a buffer with peak 0.5 at gain 1 and Level 0 down to a peak at the ceiling", () => {
      const samples = constant(0.5);
      const result = ready(preparePlayback(request({ samples })));
      expect(result.clampLimit).toBe("ceiling");
      expect(result.peakFraction).toBeLessThanOrEqual(ceilingFraction);
      expect(result.peakFraction).toBeGreaterThanOrEqual(
        ceilingFraction * (1 - 1e-6),
      );
      expect(peakOf(result.left)).toBe(result.peakFraction);
      expect(result.playedLevelDb).toBeCloseTo(
        gainToDecibels(result.appliedGain),
        12,
      );
      expect(result.playedLevelDb).toBeCloseTo(gainToDecibels(0.5), 6);
    });

    it("scales the whole sound and clips nothing (R7.5)", () => {
      const samples = new Float32Array(sampleRateHz);
      for (let n = 0; n < samples.length; n += 1) {
        samples[n] = 0.9 * Math.sin((2 * Math.PI * 1000 * n) / sampleRateHz);
      }
      const result = ready(preparePlayback(request({ samples })));
      const faded = applyOutputFade(samples, sampleRateHz);
      for (let n = 0; n < samples.length; n += 1) {
        expect(result.left[n]).toBe(
          Math.fround(faded[n] * result.appliedGain) + 0,
        );
      }
    });
  });

  describe("channels (R6.1, R6.2, R6.4)", () => {
    it("fills the other channel with +0 and nothing else", () => {
      for (const earChoice of ["left", "right"] as const) {
        const result = ready(preparePlayback(request({ earChoice })));
        const other = earChoice === "left" ? result.right : result.left;
        const played = earChoice === "left" ? result.left : result.right;
        expect(other.length).toBe(played.length);
        expect(other.every((sample) => Object.is(sample, 0))).toBe(true);
        expect(peakOf(played)).toBeGreaterThan(0);
      }
    });

    it("turns -0 into +0 in the played channel", () => {
      // A tiny negative buffer whose output rounds to zero in 32 bits.
      const result = ready(
        preparePlayback(
          request({ samples: constant(-1e-30), requestedLevelDb: -400 }),
        ),
      );
      expect(result.left.every((sample) => Object.is(sample, 0))).toBe(true);
    });

    it("plays the calibration noise in both ears with the same samples in two arrays", () => {
      const result = ready(
        preparePlayback(request({ soundId: "calibration", earChoice: "both" })),
      );
      expect(result.right).not.toBe(result.left);
      expect(Array.from(result.right)).toEqual(Array.from(result.left));
    });

    it("starts and ends every channel at +0", () => {
      const result = ready(preparePlayback(request({ earChoice: "right" })));
      for (const channel of [result.left, result.right]) {
        expect(Object.is(channel[0], 0)).toBe(true);
        expect(Object.is(channel[channel.length - 1], 0)).toBe(true);
      }
    });
  });

  it("leaves the input samples unchanged", () => {
    const samples = constant(0.7);
    const copy = Float32Array.from(samples);
    preparePlayback(request({ samples, requestedLevelDb: 20 }));
    expect(Array.from(samples)).toEqual(Array.from(copy));
  });

  it("plays exactly the requested level when no limit applies (R8.1)", () => {
    for (const levelDb of [-70, -25.5, -3.14159, 0, 3, capRelativeToAnchorDb]) {
      const calibrationGain = decibelsToGain(-30);
      const result = ready(
        preparePlayback(
          request({ requestedLevelDb: levelDb, calibrationGain }),
        ),
      );
      expect(result.clampLimit, String(levelDb)).toBeNull();
      expect(result.playedLevelDb).toBe(levelDb);
      expect(result.appliedGain).toBe(
        calibrationGain * decibelsToGain(levelDb),
      );
    }
  });

  it("plays a very low level as exact silence instead of refusing it", () => {
    const result = ready(preparePlayback(request({ requestedLevelDb: -1e6 })));
    expect(result.peakFraction).toBe(0);
    expect(result.playedLevelDb).toBe(-1e6);
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import { measureFadeLengths } from "../../src/audio/synth/measure/fade-lengths";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { PreparedPlayback } from "../../src/audio/output/output-types";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import { renderPlayableBuffer } from "../../src/audio/output/render-playable-buffer";
import { roomTopLevelDb } from "../../src/audio/output/room-top-level";
import {
  anyRequestSpecArbitrary,
  keepableSettingArbitrary,
  materializeRequest,
} from "./output-arbitraries";
import {
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/**
 * Runs over arbitrary buffers, and runs per shipped sound. The design gives 50 per shipped sound;
 * D28 halved that to 25 because CP3 and CP6 together took more than 30 seconds.
 */
const runs = 300;
const runsPerSound = 25;

/** The condition of CP3 for one result that is not refused. */
function expectFaded(
  result: Extract<PreparedPlayback, { kind: "ready" }>,
  sampleRateHz: number,
): void {
  for (const [name, channel] of [
    ["left", result.left],
    ["right", result.right],
  ] as const) {
    expect(Object.is(channel[0], 0), `${name} first sample`).toBe(true);
    expect(
      Object.is(channel[channel.length - 1], 0),
      `${name} last sample`,
    ).toBe(true);
    if (channel.some((sample) => sample !== 0)) {
      const { fadeInMs, fadeOutMs } = measureFadeLengths(channel, sampleRateHz);
      expect(fadeInMs, `${name} fade in`).toBeGreaterThanOrEqual(
        audioSafetyConfig.fadeMinMs,
      );
      expect(fadeOutMs, `${name} fade out`).toBeGreaterThanOrEqual(
        audioSafetyConfig.fadeMinMs,
      );
    }
  }
}

describe("audio output CP3. Every sound fades in and out (Universal; R10.1, R10.2, R20.3; brief property 3)", () => {
  it("starts and ends every channel of every playback at +0 with fades of at least the shortest fade", () => {
    fc.assert(
      fc.property(anyRequestSpecArbitrary, (spec) => {
        const result = preparePlayback(materializeRequest(spec));
        if (result.kind === "ready") {
          expectFaded(result, spec.sampleRateHz);
        }
      }),
      { numRuns: runs },
    );
  }, 120_000);

  const topDb = calibrationSettingTopDb();
  for (const soundId of soundIds) {
    it(`plays the ${soundId} sound at any seed, rate and level up to its room top, faded`, () => {
      fc.assert(
        fc.property(
          seedArbitrary,
          supportedSampleRateArbitrary,
          keepableSettingArbitrary(topDb),
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.constantFrom("left", "right", "both"),
          (seed, sampleRateHz, settingDb, levelFraction, earChoice) => {
            const calibrationGain = decibelsToGain(settingDb);
            const { floorDb } = hearingMethodConfig;
            const topLevelDb = roomTopLevelDb(soundId, calibrationGain);
            const levelDb = floorDb + levelFraction * (topLevelDb - floorDb);
            const buffer = renderPlayableBuffer(
              soundId,
              sampleRateHz,
              createSeededRandom(seed),
            );
            expect(buffer.kind).toBe("ready");
            if (buffer.kind !== "ready") {
              return;
            }
            const result = preparePlayback({
              samples: buffer.samples,
              sampleRateHz,
              soundId,
              earChoice:
                soundId === "calibration" || earChoice !== "both"
                  ? earChoice
                  : "left",
              requestedLevelDb: levelDb,
              calibrationGain,
              previousAppliedGain: null,
            });
            expect(result.kind).toBe("ready");
            if (result.kind === "ready") {
              expectFaded(result, sampleRateHz);
            }
          },
        ),
        { numRuns: runsPerSound },
      );
    }, 120_000);
  }
});

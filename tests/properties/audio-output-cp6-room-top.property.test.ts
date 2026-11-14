import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import { soundIds } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import { gainToDecibels } from "../../src/audio/output/gain-to-decibels";
import { preparePlayback } from "../../src/audio/output/prepare-playback";
import { renderPlayableBuffer } from "../../src/audio/output/render-playable-buffer";
import { roomTopLevelDb } from "../../src/audio/output/room-top-level";
import { gridLevelsUpTo, keepableSettingArbitrary } from "./output-arbitraries";
import {
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

/**
 * Runs per sound. The design gives 100; D28 halved that to 50 because CP3 and CP6 together took
 * more than 30 seconds.
 */
const runsPerSound = 50;

function rmsOf(samples: Float32Array): number {
  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

describe("audio output CP6. A room at or below its top is never clamped (Universal; R8.3, R9.1, R9.4, R11.6)", () => {
  const topDb = calibrationSettingTopDb();
  for (const soundId of soundIds) {
    it(`plays the ${soundId} sound at every grid level up to its room top as asked, at the reference RMS`, () => {
      fc.assert(
        fc.property(
          seedArbitrary,
          supportedSampleRateArbitrary,
          keepableSettingArbitrary(topDb),
          fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
          fc.constantFrom("left", "right", "both"),
          (seed, sampleRateHz, settingDb, levelFraction, earChoice) => {
            const calibrationGain = decibelsToGain(settingDb);
            // The grid levels from the floor to the highest one at or below the room top, the
            // levels the search may ask for with roomSearchCapDb of that top as its cap.
            const levels = gridLevelsUpTo(
              roomTopLevelDb(soundId, calibrationGain),
            );
            const levelDb = levels[Math.floor(levelFraction * levels.length)];
            const buffer = renderPlayableBuffer(
              soundId,
              sampleRateHz,
              createSeededRandom(seed),
            );
            expect(buffer.kind).toBe("ready");
            if (buffer.kind !== "ready") {
              return;
            }
            const ear =
              soundId === "calibration" || earChoice !== "both"
                ? earChoice
                : "left";
            const result = preparePlayback({
              samples: buffer.samples,
              sampleRateHz,
              soundId,
              earChoice: ear,
              requestedLevelDb: levelDb,
              calibrationGain,
              previousAppliedGain: null,
            });
            expect(result.kind).toBe("ready");
            if (result.kind !== "ready") {
              return;
            }
            expect(result.clampLimit).toBeNull();
            expect(result.playedLevelDb).toBe(levelDb);
            const played = ear === "right" ? result.right : result.left;
            const distanceDb = Math.abs(
              gainToDecibels(
                rmsOf(played) /
                  (soundRulesConfig.referenceRmsFraction * result.appliedGain),
              ),
            );
            expect(distanceDb).toBeLessThanOrEqual(
              soundRulesConfig.levelToleranceDb,
            );
          },
        ),
        { numRuns: runsPerSound },
      );
    }, 120_000);
  }
});

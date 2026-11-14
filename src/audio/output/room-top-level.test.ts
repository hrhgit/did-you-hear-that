import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import type { SoundId } from "../../config/sound-id";
import { soundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { gainToDecibels } from "./gain-to-decibels";
import { roomTopLevelDb } from "./room-top-level";

/**
 * The table of room tops in design.md ("What the visit flow does with it"), to two decimals. The
 * design rounds them to one decimal; with the shipped config each is
 * `13.98 − peakBoundDb − Calibration_Setting`, at most +15.
 */
const roomTopTableDb: Readonly<
  Record<number, Readonly<Record<SoundId, number>>>
> = {
  [-40]: {
    cellar: 15,
    corridor: 15,
    nursery: 15,
    stairs: 15,
    attic: 15,
    calibration: 15,
  },
  [-19]: {
    cellar: 15,
    corridor: 15,
    nursery: 15,
    stairs: 15,
    attic: 15,
    calibration: 15,
  },
  [-10]: {
    cellar: 10.48,
    corridor: 15,
    nursery: 13.98,
    stairs: 6.98,
    attic: 15,
    calibration: 8.48,
  },
  [-4]: {
    cellar: 4.48,
    corridor: 12.48,
    nursery: 7.98,
    stairs: 0.98,
    attic: 13.48,
    calibration: 2.48,
  },
};

describe("roomTopLevelDb", () => {
  for (const [settingText, tops] of Object.entries(roomTopTableDb)) {
    const settingDb = Number(settingText);
    it(`gives the room tops of the design table at a calibration setting of ${settingDb} dB`, () => {
      for (const soundId of soundIds) {
        expect(
          Math.abs(
            roomTopLevelDb(soundId, decibelsToGain(settingDb)) - tops[soundId],
          ),
          soundId,
        ).toBeLessThanOrEqual(0.01);
      }
    });
  }

  it("follows the formula of R9.2", () => {
    for (const soundId of soundIds) {
      for (const calibrationGain of [1e-6, 0.01, 0.5, 1, 30]) {
        const expected = Math.min(
          hearingMethodConfig.capRelativeToAnchorDb,
          gainToDecibels(
            audioSafetyConfig.ceilingFraction /
              (soundRulesConfig.referenceRmsFraction *
                decibelsToGain(audioOutputConfig.peakBoundDb[soundId]) *
                calibrationGain),
          ),
        );
        expect(roomTopLevelDb(soundId, calibrationGain)).toBe(expected);
      }
    }
  });

  it("puts a buffer at its Peak_Bound exactly at the ceiling when the ceiling sets the top", () => {
    const calibrationGain = decibelsToGain(-4);
    for (const soundId of soundIds) {
      const topDb = roomTopLevelDb(soundId, calibrationGain);
      const peakFraction =
        soundRulesConfig.referenceRmsFraction *
        decibelsToGain(audioOutputConfig.peakBoundDb[soundId]) *
        calibrationGain *
        decibelsToGain(topDb);
      expect(peakFraction / audioSafetyConfig.ceilingFraction).toBeCloseTo(
        1,
        12,
      );
    }
  });
});

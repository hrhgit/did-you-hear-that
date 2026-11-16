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
 * The table of room tops in design.md ("What the visit flow does with it"), to two decimals, with
 * the cap of 5 dB above the anchor (audible-start design.md, "The cap"). With the shipped config
 * each is `13.98 − peakBoundDb − Calibration_Setting`, at most +5.
 */
const roomTopTableDb: Readonly<
  Record<number, Readonly<Record<SoundId, number>>>
> = {
  [-40]: {
    cellar: 5,
    corridor: 5,
    nursery: 5,
    stairs: 5,
    attic: 5,
    calibration: 5,
  },
  [-19]: {
    cellar: 5,
    corridor: 5,
    nursery: 5,
    stairs: 5,
    attic: 5,
    calibration: 5,
  },
  [-10]: {
    cellar: 5,
    corridor: 5,
    nursery: 5,
    stairs: 5,
    attic: 5,
    calibration: 5,
  },
  [-4]: {
    cellar: 4.48,
    corridor: 5,
    nursery: 5,
    stairs: 0.98,
    attic: 5,
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
    const setByCeiling = soundIds.filter(
      (soundId) =>
        roomTopLevelDb(soundId, calibrationGain) <
        hearingMethodConfig.capRelativeToAnchorDb,
    );
    // At −4 dB the ceiling sets the top of the cellar, the stairs and the calibration noise.
    expect(setByCeiling).toEqual(["cellar", "stairs", "calibration"]);
    for (const soundId of setByCeiling) {
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

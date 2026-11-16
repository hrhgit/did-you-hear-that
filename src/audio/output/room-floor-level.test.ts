import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import { soundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { roomFloorLevelDb } from "./room-floor-level";

const { floorDb } = hearingMethodConfig;

describe("roomFloorLevelDb", () => {
  it.each([
    [-60, 2.02],
    [-40, -17.98],
    [-27, -30.98],
    [-16, -41.98],
    [-5, -52.98],
    [-4, -53.98],
    [0, -57.98],
    [12, -69.98],
  ])(
    "gives −57.98 − S at the setting S = %d dB for every sound (design table)",
    (settingDb, expectedDb) => {
      for (const soundId of soundIds) {
        const levelDb = roomFloorLevelDb(soundId, decibelsToGain(settingDb));
        expect(Math.abs(levelDb - expectedDb), soundId).toBeLessThanOrEqual(
          0.01,
        );
      }
    },
  );

  it("follows the formula of the design", () => {
    for (const soundId of soundIds) {
      for (const calibrationGain of [1e-3, 0.01, 0.5, 1, 30]) {
        const playableLevelDb =
          20 *
          Math.log10(
            audioOutputConfig.playableRmsMinFraction /
              (soundRulesConfig.referenceRmsFraction * calibrationGain),
          );
        expect(roomFloorLevelDb(soundId, calibrationGain)).toBe(
          Math.max(floorDb, playableLevelDb),
        );
      }
    }
  });

  it("gives a sound at the floor exactly the playable RMS where the playable RMS sets it", () => {
    for (const settingDb of [-27, -16, -5, -4]) {
      const calibrationGain = decibelsToGain(settingDb);
      const levelDb = roomFloorLevelDb("stairs", calibrationGain);
      const rmsFraction =
        soundRulesConfig.referenceRmsFraction *
        calibrationGain *
        decibelsToGain(levelDb);
      expect(
        rmsFraction / audioOutputConfig.playableRmsMinFraction,
      ).toBeCloseTo(1, 12);
    }
  });

  it("is never below the fixed floor of −70 dB", () => {
    for (const settingDb of [12.5, 13, 20, 40]) {
      for (const soundId of soundIds) {
        expect(
          roomFloorLevelDb(soundId, decibelsToGain(settingDb)),
          soundId,
        ).toBe(floorDb);
      }
    }
  });

  it("throws for a name that is no sound", () => {
    expect(() => roomFloorLevelDb("cupboard" as "cellar", 1)).toThrow(
      RangeError,
    );
  });

  it("is not rounded", () => {
    expect(
      Number.isInteger(roomFloorLevelDb("cellar", decibelsToGain(-27))),
    ).toBe(false);
  });
});

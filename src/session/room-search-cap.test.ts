import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { SoundId } from "../config/sound-id";
import { ghostSoundIds, soundIds } from "../config/sound-id";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import { rangeReport } from "../audio/output/range-report";
import { validateSearchSettings } from "../engine/validate-search-settings";
import { roomSearchCapDb } from "./room-search-cap";

const { capRelativeToAnchorDb, startingLevelDb, upwardStepDb } =
  hearingMethodConfig;

/**
 * The calibration gain of a setting. The session may not import the synth's `decibelsToGain`, so
 * the test keeps its own conversion.
 */
function settingGain(settingDb: number): number {
  return 10 ** (settingDb / 20);
}

function capAt(settingDb: number, soundId: SoundId): number {
  const top = rangeReport(settingGain(settingDb)).rooms[soundId].topLevelDb;
  return roomSearchCapDb(top, hearingMethodConfig);
}

describe("roomSearchCapDb", () => {
  // The bracketed values of the room-top table in design.md, with the cap of 5 dB above the
  // anchor (audible-start design.md, "The cap").
  it.each([
    [
      -40,
      {
        cellar: 5,
        corridor: 5,
        nursery: 5,
        stairs: 5,
        attic: 5,
        calibration: 5,
      },
    ],
    [
      -19,
      {
        cellar: 5,
        corridor: 5,
        nursery: 5,
        stairs: 5,
        attic: 5,
        calibration: 5,
      },
    ],
    [
      -10,
      {
        cellar: 5,
        corridor: 5,
        nursery: 5,
        stairs: 5,
        attic: 5,
        calibration: 5,
      },
    ],
    [
      -4,
      {
        cellar: 0,
        corridor: 5,
        nursery: 5,
        stairs: 0,
        attic: 5,
        calibration: 0,
      },
    ],
  ] as const)(
    "rounds the room tops at the setting %d dB down to the grid as the table says",
    (settingDb, expected) => {
      for (const soundId of soundIds) {
        expect(capAt(settingDb, soundId), soundId).toBe(expected[soundId]);
      }
    },
  );

  it("keeps a top that lies exactly on the grid, or a rounding error below it", () => {
    // The highest, 3, is the cap of 5 dB itself, three steps above the start of −10 dB.
    for (const k of [-9, -1, 0, 1, 3]) {
      const gridDb = startingLevelDb + k * upwardStepDb;
      expect(roomSearchCapDb(gridDb, hearingMethodConfig)).toBe(gridDb);
      expect(roomSearchCapDb(gridDb - 1e-12, hearingMethodConfig)).toBe(gridDb);
      expect(roomSearchCapDb(gridDb - 0.01, hearingMethodConfig)).toBe(
        gridDb - upwardStepDb,
      );
      expect(roomSearchCapDb(gridDb + 4.99, hearingMethodConfig)).toBe(gridDb);
    }
  });

  it("never goes above the anchor cap", () => {
    for (const topDb of [
      capRelativeToAnchorDb,
      capRelativeToAnchorDb + 0.5,
      20,
      40,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(roomSearchCapDb(topDb, hearingMethodConfig)).toBe(
        capRelativeToAnchorDb,
      );
    }
  });

  it("gives a cap the threshold search accepts, for every ghost room at every keepable setting", () => {
    const { calibrationSettingKeepMinDb, calibrationSettingStepDb } =
      audioOutputConfig;
    const topDb = calibrationSettingTopDb();
    for (
      let settingDb = calibrationSettingKeepMinDb;
      settingDb <= topDb;
      settingDb += calibrationSettingStepDb
    ) {
      for (const soundId of ghostSoundIds) {
        const cap = capAt(settingDb, soundId);
        expect(() =>
          validateSearchSettings({
            ...hearingMethodConfig,
            capRelativeToAnchorDb: cap,
          }),
        ).not.toThrow();
      }
    }
  });
});

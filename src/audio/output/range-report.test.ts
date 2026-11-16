import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import type { SoundId } from "../../config/sound-id";
import { ghostSoundIds, soundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { rangeReport } from "./range-report";
import { roomTopLevelDb } from "./room-top-level";

const { capRelativeToAnchorDb, floorDb } = hearingMethodConfig;

/**
 * The table of room tops in design.md, to two decimals, for the rooms below the cap of +5 dB
 * (audible-start design.md, "The cap").
 */
const ceilingTopsDb: Readonly<
  Record<number, Partial<Record<SoundId, number>>>
> = {
  [-40]: {},
  [-19]: {},
  [-10]: {},
  [-4]: {
    cellar: 4.48,
    stairs: 0.98,
    calibration: 2.48,
  },
};

/** The sounds whose top lies below +5 dB in the same table. */
const setByCeiling: Readonly<Record<number, readonly SoundId[]>> = {
  [-40]: [],
  [-19]: [],
  [-10]: [],
  [-4]: ["cellar", "stairs", "calibration"],
};

describe("rangeReport", () => {
  for (const [settingText, ceilingRooms] of Object.entries(setByCeiling)) {
    const settingDb = Number(settingText);
    it(`reports every room's top, what sets it and its distance below the cap at ${settingDb} dB (R9.5)`, () => {
      const calibrationGain = decibelsToGain(settingDb);
      const report = rangeReport(calibrationGain);
      expect(report.calibrationSettingDb).toBeCloseTo(settingDb, 12);
      expect(report.calibrationGain).toBe(calibrationGain);
      expect(Object.keys(report.rooms)).toEqual([...soundIds]);
      for (const soundId of soundIds) {
        const room = report.rooms[soundId];
        expect(room.topLevelDb, soundId).toBe(
          roomTopLevelDb(soundId, calibrationGain),
        );
        const tableTopDb =
          ceilingTopsDb[settingDb][soundId] ?? capRelativeToAnchorDb;
        expect(
          Math.abs(room.topLevelDb - tableTopDb),
          soundId,
        ).toBeLessThanOrEqual(0.01);
        expect(room.setBy, soundId).toBe(
          ceilingRooms.includes(soundId) ? "ceiling" : "anchorCap",
        );
        expect(room.belowAnchorCapDb, soundId).toBe(
          capRelativeToAnchorDb - room.topLevelDb,
        );
        expect(room.belowAnchorCapDb, soundId).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("counts the ghost rooms below +5 dB as the design table does", () => {
    const counts = [-40, -19, -10, -4].map(
      (settingDb) =>
        ghostSoundIds.filter(
          (soundId) =>
            rangeReport(decibelsToGain(settingDb)).rooms[soundId].setBy ===
            "ceiling",
        ).length,
    );
    expect(counts).toEqual([0, 0, 0, 2]);
  });

  it("gives the RMS of a sound at the floor as a fraction of full scale (R9.5, D7)", () => {
    const report = rangeReport(decibelsToGain(-4));
    expect(report.floorRmsFraction).toBe(
      soundRulesConfig.referenceRmsFraction *
        decibelsToGain(-4) *
        decibelsToGain(floorDb),
    );
    // About 1.0e-5 of full scale, about 100 dB below it (design.md, Measurements).
    expect(report.floorRmsFraction).toBeGreaterThan(0.99e-5);
    expect(report.floorRmsFraction).toBeLessThan(1.01e-5);
  });

  it("is frozen", () => {
    const report = rangeReport(1);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.rooms)).toBe(true);
    expect(Object.isFrozen(report.rooms.stairs)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { ghostSoundIds } from "../config/sound-id";
import { rangeReport } from "../audio/output/range-report";
import { roomSearchCapDb } from "./room-search-cap";
import { roomSearchFloorDb } from "./room-search-floor";

const { floorDb, startingLevelDb, upwardStepDb } = hearingMethodConfig;

/**
 * The calibration gain of a setting. The session may not import the synth's `decibelsToGain`, so
 * the test keeps its own conversion.
 */
function settingGain(settingDb: number): number {
  return 10 ** (settingDb / 20);
}

describe("roomSearchFloorDb", () => {
  // The table of "The playable floor" in audible-start design.md: the exact floor −57.98 − S and
  // the Search_Floor in brackets, the same for every room.
  it.each([
    [-27, -30.98, -30],
    [-16, -41.98, -40],
    [-5, -52.98, -50],
    [-4, -53.98, -50],
  ])(
    "gives the Search_Floor of the design table at the setting %d dB",
    (settingDb, exactDb, searchFloorDb) => {
      const report = rangeReport(settingGain(settingDb));
      for (const soundId of ghostSoundIds) {
        const floorLevelDb = report.rooms[soundId].floorLevelDb;
        expect(Math.abs(floorLevelDb - exactDb), soundId).toBeLessThanOrEqual(
          0.01,
        );
        expect(
          roomSearchFloorDb(floorLevelDb, hearingMethodConfig),
          soundId,
        ).toBe(searchFloorDb);
      }
    },
  );

  it("keeps a floor that lies exactly on the grid, or a rounding error above it", () => {
    for (const k of [-9, -2, -1, 0, 1, 3]) {
      const gridDb = startingLevelDb + k * upwardStepDb;
      expect(roomSearchFloorDb(gridDb, hearingMethodConfig)).toBe(gridDb);
      expect(roomSearchFloorDb(gridDb + 1e-12, hearingMethodConfig)).toBe(
        gridDb,
      );
      expect(roomSearchFloorDb(gridDb + 0.01, hearingMethodConfig)).toBe(
        gridDb + upwardStepDb,
      );
      expect(roomSearchFloorDb(gridDb - 4.99, hearingMethodConfig)).toBe(
        gridDb,
      );
    }
  });

  it("rounds up, so that no level of the search lies below the exact floor", () => {
    for (let floorLevelDb = -69.5; floorLevelDb <= 0; floorLevelDb += 0.37) {
      const searchFloorDb = roomSearchFloorDb(
        floorLevelDb,
        hearingMethodConfig,
      );
      expect(searchFloorDb).toBeGreaterThanOrEqual(floorLevelDb - 1e-9);
      expect(searchFloorDb).toBeLessThan(floorLevelDb + upwardStepDb);
      expect(
        Number.isInteger((searchFloorDb - startingLevelDb) / upwardStepDb),
      ).toBe(true);
    }
  });

  it("is never below the settings' floor", () => {
    for (const floorLevelDb of [
      floorDb,
      floorDb - 0.5,
      floorDb - 20,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(roomSearchFloorDb(floorLevelDb, hearingMethodConfig)).toBe(
        floorDb,
      );
    }
  });

  it("lies below every room's Search_Cap at the settings of the design table", () => {
    for (const settingDb of [-27, -16, -5, -4]) {
      const report = rangeReport(settingGain(settingDb));
      for (const soundId of ghostSoundIds) {
        const room = report.rooms[soundId];
        expect(
          roomSearchFloorDb(room.floorLevelDb, hearingMethodConfig),
          soundId,
        ).toBeLessThan(roomSearchCapDb(room.topLevelDb, hearingMethodConfig));
      }
    }
  });
});

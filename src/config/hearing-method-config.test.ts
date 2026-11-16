import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "./hearing-method-config";

const config = hearingMethodConfig;

describe("hearingMethodConfig", () => {
  it("holds the hearing method table and the threshold search rule values, and nothing else", () => {
    expect(config).toEqual({
      downwardStepDb: 10,
      upwardStepDb: 5,
      startingLevelDb: -25,
      capRelativeToAnchorDb: 5,
      floorDb: -70,
      responseWindowMs: 2000,
      gapBetweenTrialsMinMs: 1500,
      gapBetweenTrialsMaxMs: 4000,
      noSoundTrialShareMinFraction: 0.15,
      noSoundTrialShareMaxFraction: 0.25,
      falseAlarmRateUnreliableAboveFraction: 0.3,
      trialLimitPerEarPerRoomCount: 20,
      swappedRepeatDifferenceDb: 15,
      roomFrequenciesHz: {
        quick: [1000, 4000, 8000],
        full: [500, 1000, 2000, 4000, 8000],
      },
      noSoundTrialProbabilityFraction: 0.2,
      thresholdCatchesMinCount: 2,
      thresholdCatchShareMinFraction: 0.5,
      floorCatchesForBetterThanFloorCount: 2,
      capMissesForWorseThanCapCount: 2,
      inconsistentCatchMarginDb: 10,
    });
  });

  it("ends every field name with its unit", () => {
    for (const fieldName of Object.keys(config)) {
      expect(fieldName).toMatch(/(Db|Ms|Hz|Fraction|Count)$/);
    }
  });

  describe("invariants", () => {
    it("orders the floor below the starting level and the starting level below the cap", () => {
      expect(config.floorDb).toBeLessThan(config.startingLevelDb);
      expect(config.startingLevelDb).toBeLessThan(config.capRelativeToAnchorDb);
    });

    it("keeps the cap at 5 dB above the anchor or lower (audible-start R2.3)", () => {
      expect(
        config.capRelativeToAnchorDb,
        "capRelativeToAnchorDb is above 5 dB. It was made stricter on 2026-11-16; a higher cap needs the project owner's approval first.",
      ).toBeLessThanOrEqual(5);
    });

    it("has positive step sizes", () => {
      expect(config.downwardStepDb).toBeGreaterThan(0);
      expect(config.upwardStepDb).toBeGreaterThan(0);
    });

    it("has a positive minimum gap that is not above the maximum gap", () => {
      expect(config.gapBetweenTrialsMinMs).toBeGreaterThan(0);
      expect(config.gapBetweenTrialsMinMs).toBeLessThanOrEqual(
        config.gapBetweenTrialsMaxMs,
      );
    });

    it("keeps the no-sound shares and the false alarm limit between 0 and 1", () => {
      for (const fraction of [
        config.noSoundTrialShareMinFraction,
        config.noSoundTrialShareMaxFraction,
        config.falseAlarmRateUnreliableAboveFraction,
      ]) {
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1);
      }
      expect(config.noSoundTrialShareMinFraction).toBeLessThanOrEqual(
        config.noSoundTrialShareMaxFraction,
      );
    });

    it("has a positive integer trial limit", () => {
      expect(Number.isInteger(config.trialLimitPerEarPerRoomCount)).toBe(true);
      expect(config.trialLimitPerEarPerRoomCount).toBeGreaterThan(0);
    });

    it("keeps the no-sound trial probability within the no-sound share range", () => {
      expect(config.noSoundTrialProbabilityFraction).toBeGreaterThanOrEqual(
        config.noSoundTrialShareMinFraction,
      );
      expect(config.noSoundTrialProbabilityFraction).toBeLessThanOrEqual(
        config.noSoundTrialShareMaxFraction,
      );
    });

    it("keeps the threshold catch share from 0 to 1", () => {
      expect(config.thresholdCatchShareMinFraction).toBeGreaterThanOrEqual(0);
      expect(config.thresholdCatchShareMinFraction).toBeLessThanOrEqual(1);
    });

    it("has positive integer counts for the threshold, floor and cap rules", () => {
      for (const count of [
        config.thresholdCatchesMinCount,
        config.floorCatchesForBetterThanFloorCount,
        config.capMissesForWorseThanCapCount,
      ]) {
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThan(0);
      }
    });

    it("has a positive integer inconsistent catch margin", () => {
      expect(Number.isInteger(config.inconsistentCatchMarginDb)).toBe(true);
      expect(config.inconsistentCatchMarginDb).toBeGreaterThan(0);
    });

    it("lists the rooms of each visit in strictly ascending order", () => {
      for (const roomsHz of Object.values(config.roomFrequenciesHz)) {
        expect(roomsHz.length).toBeGreaterThan(0);
        for (let index = 1; index < roomsHz.length; index += 1) {
          expect(roomsHz[index]).toBeGreaterThan(roomsHz[index - 1]);
        }
      }
    });

    it("makes every quick visit room a full visit room", () => {
      for (const roomHz of config.roomFrequenciesHz.quick) {
        expect(config.roomFrequenciesHz.full).toContain(roomHz);
      }
    });
  });

  describe("freezing", () => {
    it("freezes the object, the room lists object and every room list", () => {
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.roomFrequenciesHz)).toBe(true);
      expect(Object.isFrozen(config.roomFrequenciesHz.quick)).toBe(true);
      expect(Object.isFrozen(config.roomFrequenciesHz.full)).toBe(true);
    });

    it("throws a TypeError when a field is assigned and keeps its value", () => {
      const writable = config as { downwardStepDb: number };
      expect(() => {
        writable.downwardStepDb = 3;
      }).toThrow(TypeError);
      expect(config.downwardStepDb).toBe(10);
    });

    it("throws a TypeError when a room list is replaced and keeps its value", () => {
      const writable = config.roomFrequenciesHz as { quick: readonly number[] };
      expect(() => {
        writable.quick = [250];
      }).toThrow(TypeError);
      expect(config.roomFrequenciesHz.quick).toEqual([1000, 4000, 8000]);
    });

    it("throws a TypeError when an element of a room list is assigned and keeps its value", () => {
      const writable = config.roomFrequenciesHz.full as number[];
      expect(() => {
        writable[0] = 250;
      }).toThrow(TypeError);
      expect(() => {
        writable.push(16000);
      }).toThrow(TypeError);
      expect(config.roomFrequenciesHz.full).toEqual([
        500, 1000, 2000, 4000, 8000,
      ]);
    });
  });
});

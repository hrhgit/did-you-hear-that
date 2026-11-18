import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "./audio-output-config";
import { audioSafetyConfig } from "./audio-safety-config";
import { hearingMethodConfig } from "./hearing-method-config";
import { everySoundId, soundIds } from "./sound-id";

describe("audioOutputConfig", () => {
  it("ends every field name with its unit (R2.2)", () => {
    for (const fieldName of Object.keys(audioOutputConfig)) {
      expect(fieldName).toMatch(/(Db|Ms|Hz|Fraction|Count)$/);
    }
  });

  it("is deeply frozen (R2.2)", () => {
    expect(Object.isFrozen(audioOutputConfig)).toBe(true);
    expect(Object.isFrozen(audioOutputConfig.peakBoundDb)).toBe(true);
  });

  describe("invariants against the steering and the search (R2.3)", () => {
    it("makes the output fade at least as long as the shortest fade", () => {
      expect(audioOutputConfig.outputFadeMs).toBeGreaterThanOrEqual(
        audioSafetyConfig.fadeMinMs,
      );
    });

    it("makes the stop fade at least as long as the shortest fade", () => {
      expect(audioOutputConfig.stopFadeMs).toBeGreaterThanOrEqual(
        audioSafetyConfig.fadeMinMs,
      );
    });

    it("lets the calibration sound reach any setting of the control in one move", () => {
      const { calibrationRiseMaxDb, calibrationSettingMinDb } =
        audioOutputConfig;
      expect(calibrationRiseMaxDb).toBeGreaterThanOrEqual(
        0 - calibrationSettingMinDb,
      );
    });

    it("plays the headphone check at most at the anchor cap", () => {
      expect(audioOutputConfig.headphoneCheckLevelDb).toBeLessThanOrEqual(
        hearingMethodConfig.capRelativeToAnchorDb,
      );
    });

    it("asks every room to reach at least the starting level", () => {
      expect(audioOutputConfig.roomTopMinDb).toBeGreaterThanOrEqual(
        hearingMethodConfig.startingLevelDb,
      );
    });
  });

  describe("the calibration control (R2.4)", () => {
    it("puts the bottom of the control below the Keep_Minimum", () => {
      expect(audioOutputConfig.calibrationSettingMinDb).toBeLessThan(
        audioOutputConfig.calibrationSettingKeepMinDb,
      );
    });

    it("puts the Keep_Minimum on the step grid that starts at the bottom", () => {
      const stepCount =
        (audioOutputConfig.calibrationSettingKeepMinDb -
          audioOutputConfig.calibrationSettingMinDb) /
        audioOutputConfig.calibrationSettingStepDb;
      expect(Math.abs(stepCount - Math.round(stepCount))).toBeLessThan(1e-9);
    });

    it("has a positive step", () => {
      expect(audioOutputConfig.calibrationSettingStepDb).toBeGreaterThan(0);
    });
  });

  describe("the calibration music (audible-start design.md, Config)", () => {
    it("has the values of the audible-start design", () => {
      expect(audioOutputConfig.calibrationSettingSpanMinDb).toBe(10);
      expect(audioOutputConfig.calibrationMusicRisePeriodMs).toBe(100);
      expect(audioOutputConfig.calibrationMusicGainStepMs).toBe(100);
      expect(audioOutputConfig.calibrationMusicLoadMaxMs).toBe(10000);
    });

    it("ends the name of every music value with its unit", () => {
      for (const fieldName of [
        "calibrationSettingSpanMinDb",
        "calibrationMusicRisePeriodMs",
        "calibrationMusicGainStepMs",
        "calibrationMusicLoadMaxMs",
      ]) {
        expect(Object.keys(audioOutputConfig)).toContain(fieldName);
        expect(fieldName).toMatch(/(Db|Ms)$/);
      }
    });

    it("divides the rise period into a whole number of gain steps", () => {
      const { calibrationMusicRisePeriodMs, calibrationMusicGainStepMs } =
        audioOutputConfig;
      expect(calibrationMusicGainStepMs).toBeGreaterThan(0);
      expect(calibrationMusicGainStepMs).toBeLessThanOrEqual(
        calibrationMusicRisePeriodMs,
      );
      expect(
        Number.isInteger(
          calibrationMusicRisePeriodMs / calibrationMusicGainStepMs,
        ),
      ).toBe(true);
    });

    it("gives a positive span and a positive load limit", () => {
      expect(audioOutputConfig.calibrationSettingSpanMinDb).toBeGreaterThan(0);
      expect(audioOutputConfig.calibrationMusicLoadMaxMs).toBeGreaterThan(0);
    });
  });

  describe("the playable floor (audible-start design.md, Config)", () => {
    it("has the values of the audible-start design", () => {
      expect(audioOutputConfig.playableRmsMinFraction).toBe(10 ** (-84 / 20));
      expect(audioOutputConfig.playableRangeBelowAnchorMinDb).toBe(30);
    });

    it("puts the playable RMS 84 dB below full scale, about 6.31e-5", () => {
      expect(
        20 * Math.log10(audioOutputConfig.playableRmsMinFraction),
      ).toBeCloseTo(-84, 12);
      expect(audioOutputConfig.playableRmsMinFraction).toBeGreaterThan(6.3e-5);
      expect(audioOutputConfig.playableRmsMinFraction).toBeLessThan(6.32e-5);
    });

    it("ends the name of every floor value with its unit", () => {
      for (const fieldName of [
        "playableRmsMinFraction",
        "playableRangeBelowAnchorMinDb",
      ]) {
        expect(Object.keys(audioOutputConfig)).toContain(fieldName);
        expect(fieldName).toMatch(/(Db|Fraction)$/);
      }
    });

    it("gives a positive range below the anchor", () => {
      expect(audioOutputConfig.playableRangeBelowAnchorMinDb).toBeGreaterThan(
        0,
      );
    });
  });

  describe("playable buffers (D6)", () => {
    it("gives a Peak_Bound to exactly the six sounds and the chime", () => {
      expect(Object.keys(audioOutputConfig.peakBoundDb)).toEqual([
        ...everySoundId,
      ]);
    });

    it("makes every Peak_Bound positive", () => {
      for (const soundId of soundIds) {
        expect(audioOutputConfig.peakBoundDb[soundId], soundId).toBeGreaterThan(
          0,
        );
      }
    });

    it("tries a positive whole number of renders", () => {
      expect(Number.isInteger(audioOutputConfig.renderAttemptsMaxCount)).toBe(
        true,
      );
      expect(audioOutputConfig.renderAttemptsMaxCount).toBeGreaterThan(0);
    });
  });
});

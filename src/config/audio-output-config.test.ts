import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "./audio-output-config";
import { audioSafetyConfig } from "./audio-safety-config";
import { hearingMethodConfig } from "./hearing-method-config";
import { soundIds } from "./sound-id";

const loosening =
  "needs the project owner's approval first (.kiro/specs/audio-output/design.md, D32)";

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

    it("lets calibration repeats rise by at most one upward step", () => {
      expect(audioOutputConfig.calibrationRiseMaxDb).toBeLessThanOrEqual(
        hearingMethodConfig.upwardStepDb,
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

  describe("playable buffers (D6)", () => {
    it("gives a Peak_Bound to exactly the six sounds", () => {
      expect(Object.keys(audioOutputConfig.peakBoundDb)).toEqual([...soundIds]);
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

  describe("loosening guards (R2.6, D32)", () => {
    it("keeps the output fade at 25 ms or longer", () => {
      expect(
        audioOutputConfig.outputFadeMs,
        `outputFadeMs is below 25 ms. A shorter output fade ${loosening}.`,
      ).toBeGreaterThanOrEqual(25);
    });

    it("keeps the stop fade at 20 ms or longer", () => {
      expect(
        audioOutputConfig.stopFadeMs,
        `stopFadeMs is below 20 ms. A shorter stop fade ${loosening}.`,
      ).toBeGreaterThanOrEqual(20);
    });

    it("keeps the bottom of the calibration control at -60 dB or lower", () => {
      expect(
        audioOutputConfig.calibrationSettingMinDb,
        `calibrationSettingMinDb is above -60 dB. A louder first calibration repeat ${loosening}.`,
      ).toBeLessThanOrEqual(-60);
    });

    it("keeps the Keep_Minimum at -40 dB or higher", () => {
      expect(
        audioOutputConfig.calibrationSettingKeepMinDb,
        `calibrationSettingKeepMinDb is below -40 dB. Keeping a lower setting ${loosening}.`,
      ).toBeGreaterThanOrEqual(-40);
    });

    it("keeps the rise between calibration repeats at 5 dB or less", () => {
      expect(
        audioOutputConfig.calibrationRiseMaxDb,
        `calibrationRiseMaxDb is above 5 dB. A larger rise between repeats ${loosening}.`,
      ).toBeLessThanOrEqual(5);
    });

    it("keeps the headphone check level at 0 dB or lower", () => {
      expect(
        audioOutputConfig.headphoneCheckLevelDb,
        `headphoneCheckLevelDb is above 0 dB. A louder headphone check ${loosening}.`,
      ).toBeLessThanOrEqual(0);
    });
  });
});

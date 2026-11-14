import { describe, expect, it } from "vitest";
import { ghostSoundIds } from "./sound-id";
import { soundRulesConfig } from "./sound-rules-config";

describe("soundRulesConfig", () => {
  it("holds the values of design.md, and nothing else", () => {
    expect(soundRulesConfig).toEqual({
      bandWidthOctaveFraction: 1 / 3,
      outOfBandBelowInBandMinDb: 30,
      referenceRmsFraction: 0.05,
      levelToleranceDb: 0.01,
      spectrumBinWidthMaxHz: 0.5,
      sampleRateMinHz: 22050,
      bandEdgeMarginOctaveFraction: 1 / 24,
      calibrationShapeDb: {
        cellar: -9,
        corridor: -6,
        nursery: -3,
        stairs: 0,
        attic: -2,
      },
      calibrationShapeToleranceDb: 1,
    });
  });

  it("ends every field name with its unit", () => {
    for (const fieldName of Object.keys(soundRulesConfig)) {
      expect(fieldName).toMatch(/(Db|Ms|Hz|Fraction|Count)$/);
    }
  });

  it("is deeply frozen", () => {
    expect(Object.isFrozen(soundRulesConfig)).toBe(true);
    expect(Object.isFrozen(soundRulesConfig.calibrationShapeDb)).toBe(true);
  });

  it("gives the calibration shape one value per room, the largest of them 0", () => {
    const shape = soundRulesConfig.calibrationShapeDb;
    expect(Object.keys(shape).sort()).toEqual([...ghostSoundIds].sort());
    expect(Math.max(...ghostSoundIds.map((id) => shape[id]))).toBe(0);
  });
});

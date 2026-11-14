import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { ThresholdSearchSettings } from "./search-types";
import { validateSearchSettings } from "./validate-search-settings";

const settingsFieldNames = [
  "downwardStepDb",
  "upwardStepDb",
  "startingLevelDb",
  "capRelativeToAnchorDb",
  "floorDb",
  "gapBetweenTrialsMinMs",
  "gapBetweenTrialsMaxMs",
  "noSoundTrialShareMinFraction",
  "noSoundTrialShareMaxFraction",
  "noSoundTrialProbabilityFraction",
  "falseAlarmRateUnreliableAboveFraction",
  "trialLimitPerEarPerRoomCount",
  "thresholdCatchesMinCount",
  "thresholdCatchShareMinFraction",
  "floorCatchesForBetterThanFloorCount",
  "capMissesForWorseThanCapCount",
  "inconsistentCatchMarginDb",
].sort();

function withChanges(
  changes: Partial<Record<keyof ThresholdSearchSettings, unknown>>,
): ThresholdSearchSettings {
  return { ...hearingMethodConfig, ...changes } as ThresholdSearchSettings;
}

describe("validateSearchSettings", () => {
  it("accepts the shipped config", () => {
    expect(() => validateSearchSettings(hearingMethodConfig)).not.toThrow();
  });

  it("returns a frozen copy holding exactly the settings fields", () => {
    const input = { ...hearingMethodConfig };
    const result = validateSearchSettings(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(result).sort()).toEqual(settingsFieldNames);
    for (const field of settingsFieldNames) {
      expect(result[field as keyof ThresholdSearchSettings]).toBe(
        hearingMethodConfig[field as keyof ThresholdSearchSettings],
      );
    }
  });

  const rejected: {
    requirement: string;
    description: string;
    changes: Partial<Record<keyof ThresholdSearchSettings, unknown>>;
    field: string;
  }[] = [
    {
      requirement: "R2.3",
      description: "a fractional starting level",
      changes: { startingLevelDb: -25.5 },
      field: "startingLevelDb",
    },
    {
      requirement: "R2.3",
      description: "a fractional inconsistent catch margin",
      changes: { inconsistentCatchMarginDb: 7.5 },
      field: "inconsistentCatchMarginDb",
    },
    {
      requirement: "R2.3",
      description: "a level that is not a number",
      changes: { floorDb: "-70" },
      field: "floorDb",
    },
    {
      requirement: "R2.4",
      description: "a zero upward step",
      changes: { upwardStepDb: 0 },
      field: "upwardStepDb",
    },
    {
      requirement: "R2.4",
      description: "a negative downward step",
      changes: { downwardStepDb: -10 },
      field: "downwardStepDb",
    },
    {
      requirement: "R2.4",
      description: "a downward step that is not a multiple of the upward step",
      changes: { downwardStepDb: 12 },
      field: "downwardStepDb",
    },
    {
      requirement: "R2.5",
      description: "a floor not below the cap",
      changes: { floorDb: 15, startingLevelDb: 15 },
      field: "floorDb",
    },
    {
      requirement: "R2.5",
      description: "a starting level above the cap",
      changes: { startingLevelDb: 20 },
      field: "startingLevelDb",
    },
    {
      requirement: "R2.5",
      description: "a floor off the level grid",
      changes: { floorDb: -62 },
      field: "floorDb",
    },
    {
      requirement: "R2.5",
      description: "a cap off the level grid",
      changes: { capRelativeToAnchorDb: 12 },
      field: "capRelativeToAnchorDb",
    },
    {
      requirement: "R2.6",
      description: "a zero minimum gap",
      changes: { gapBetweenTrialsMinMs: 0 },
      field: "gapBetweenTrialsMinMs",
    },
    {
      requirement: "R2.6",
      description: "a fractional maximum gap",
      changes: { gapBetweenTrialsMaxMs: 4000.5 },
      field: "gapBetweenTrialsMaxMs",
    },
    {
      requirement: "R2.6",
      description: "a minimum gap above the maximum gap",
      changes: { gapBetweenTrialsMinMs: 4001 },
      field: "gapBetweenTrialsMinMs",
    },
    {
      requirement: "R2.7",
      description: "a false alarm limit above 1",
      changes: { falseAlarmRateUnreliableAboveFraction: 1.2 },
      field: "falseAlarmRateUnreliableAboveFraction",
    },
    {
      requirement: "R2.7",
      description: "a negative threshold catch share",
      changes: { thresholdCatchShareMinFraction: -0.1 },
      field: "thresholdCatchShareMinFraction",
    },
    {
      requirement: "R2.7",
      description: "a share minimum above the share maximum",
      changes: {
        noSoundTrialShareMinFraction: 0.3,
        noSoundTrialShareMaxFraction: 0.2,
      },
      field: "noSoundTrialShareMinFraction",
    },
    {
      requirement: "R2.7",
      description: "a no-sound probability outside the share range",
      changes: { noSoundTrialProbabilityFraction: 0.3 },
      field: "noSoundTrialProbabilityFraction",
    },
    {
      requirement: "R2.8",
      description: "a zero trial limit",
      changes: { trialLimitPerEarPerRoomCount: 0 },
      field: "trialLimitPerEarPerRoomCount",
    },
    {
      requirement: "R2.8",
      description: "a fractional threshold catch count",
      changes: { thresholdCatchesMinCount: 2.5 },
      field: "thresholdCatchesMinCount",
    },
    {
      requirement: "R2.8",
      description: "a zero inconsistent catch margin",
      changes: { inconsistentCatchMarginDb: 0 },
      field: "inconsistentCatchMarginDb",
    },
    {
      requirement: "R2.9",
      description:
        "a share range of 0.30 to 0.31, which no whole number of no-sound trials reaches with 4 sound trials",
      changes: {
        noSoundTrialShareMinFraction: 0.3,
        noSoundTrialShareMaxFraction: 0.31,
        noSoundTrialProbabilityFraction: 0.3,
      },
      field: "noSoundTrialShareMinFraction",
    },
    {
      requirement: "R2.9",
      description:
        "a share maximum of 1, which leaves the room without a limit",
      changes: {
        noSoundTrialShareMaxFraction: 1,
      },
      field: "noSoundTrialShareMaxFraction",
    },
  ];

  for (const { requirement, description, changes, field } of rejected) {
    it(`rejects ${description} (${requirement}) with a RangeError naming ${field}`, () => {
      const settings = withChanges(changes);
      expect(() => validateSearchSettings(settings)).toThrow(RangeError);
      expect(() => validateSearchSettings(settings)).toThrow(
        new RegExp(`\\b${field}\\b`),
      );
    });
  }

  it("names the sound trial count that no share in range fits (R2.9)", () => {
    expect(() =>
      validateSearchSettings(
        withChanges({
          noSoundTrialShareMinFraction: 0.3,
          noSoundTrialShareMaxFraction: 0.31,
          noSoundTrialProbabilityFraction: 0.3,
        }),
      ),
    ).toThrow(/with 4 sound trials/);
  });
});

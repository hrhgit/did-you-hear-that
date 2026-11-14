import fc from "fast-check";
import { describe, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp5LevelsInRangeCheck } from "./checks/cp5-levels-in-range-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

const check = cp5LevelsInRangeCheck;

describe("CP5. Levels stay in range and climb gently (Universal; R5.4, R5.5, R5.7; brief property 3)", () => {
  it("holds with the shipped settings", () => {
    fc.assert(
      check.property(specSearchUnderTest, fc.constant(hearingMethodConfig)),
      check.parameters,
    );
  }, 30_000);

  it("holds with any valid settings (D21)", () => {
    fc.assert(
      check.property(specSearchUnderTest, validSettingsArbitrary),
      check.parameters,
    );
  }, 30_000);
});

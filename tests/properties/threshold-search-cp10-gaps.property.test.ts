import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp10GapMeansCheck } from "./checks/cp10-gap-means-check";
import { cp10GapsInRangeCheck } from "./checks/cp10-gaps-in-range-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

describe("CP10. Gaps do not depend on the trial (Universal and Statistical; R3.6)", () => {
  it("draws every gap as whole milliseconds in range with the shipped settings", () => {
    fc.assert(
      cp10GapsInRangeCheck.property(
        specSearchUnderTest,
        fc.constant(hearingMethodConfig),
      ),
      cp10GapsInRangeCheck.parameters,
    );
  }, 30_000);

  it("draws every gap as whole milliseconds in range with any valid settings", () => {
    fc.assert(
      cp10GapsInRangeCheck.property(
        specSearchUnderTest,
        validSettingsArbitrary,
      ),
      cp10GapsInRangeCheck.parameters,
    );
  }, 30_000);

  it(
    "keeps the mean gaps of no-sound and sound trials, and of left and right trials, within 50 ms (seed 20261118)",
    () => {
      const verdict = cp10GapMeansCheck.evaluate(
        specSearchUnderTest,
        hearingMethodConfig,
      );
      expect(verdict.firstCounterexample ?? null).toBeNull();
      expect(verdict.holds).toBe(true);
    },
    cp10GapMeansCheck.parameters.timeoutMs,
  );
});

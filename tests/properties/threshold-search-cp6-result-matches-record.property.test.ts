import fc from "fast-check";
import { describe, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { cp6ResultMatchesRecordCheck as check } from "./checks/cp6-result-matches-record-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

describe("CP6. The result agrees with its own record (Universal; R4, R5, R6, R7, R8, R11)", () => {
  it("agrees with the oracle with the shipped settings", () => {
    fc.assert(
      check.property(fc.constant(hearingMethodConfig)),
      check.parameters,
    );
  }, 30_000);

  it("agrees with the oracle with any valid settings", () => {
    fc.assert(check.property(validSettingsArbitrary), check.parameters);
  }, 30_000);
});

import fc from "fast-check";
import { describe, it } from "vitest";
import { cp13SettingsValidationCheck as check } from "./checks/cp13-settings-validation-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

describe("CP13. Settings validation (Universal; R2)", () => {
  it("accepts every valid settings object and rejects each single-rule mutation naming the field", () => {
    fc.assert(check.property(validSettingsArbitrary), check.parameters);
  }, 30_000);
});

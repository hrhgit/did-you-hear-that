import fc from "fast-check";
import { describe, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp7NoSoundShareCheck } from "./checks/cp7-no-sound-share-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

const check = cp7NoSoundShareCheck;

describe("CP7. The no-sound share is always in range (Universal; R9.3, R9.4; brief property 4)", () => {
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

import fc from "fast-check";
import { describe, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp9SameSeedSameRoomCheck } from "./checks/cp9-same-seed-same-room-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

const check = cp9SameSeedSameRoomCheck;

describe("CP9. Same seed, same responses, same room (Universal; R1.5; brief property 5)", () => {
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

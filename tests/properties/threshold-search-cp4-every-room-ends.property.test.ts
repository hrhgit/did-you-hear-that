import fc from "fast-check";
import { describe, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp4EveryRoomEndsCheck } from "./checks/cp4-every-room-ends-check";
import { cp4RoomTrialLimitCheck } from "./checks/cp4-room-trial-limit-check";
import { validSettingsArbitrary } from "./checks/valid-settings-arbitrary";

const shipped = fc.constant(hearingMethodConfig);

describe("CP4. Every room ends (Universal; R10.1, R10.2, R10.3; brief property 2)", () => {
  it("ends every room within the per-ear limit with the shipped settings", () => {
    fc.assert(
      cp4EveryRoomEndsCheck.property(specSearchUnderTest, shipped),
      cp4EveryRoomEndsCheck.parameters,
    );
  }, 30_000);

  it("ends every room within the per-ear limit with any valid settings (D21)", () => {
    fc.assert(
      cp4EveryRoomEndsCheck.property(
        specSearchUnderTest,
        validSettingsArbitrary,
      ),
      cp4EveryRoomEndsCheck.parameters,
    );
  }, 30_000);

  it("ends every room within Room_Trial_Limit with the shipped settings", () => {
    fc.assert(
      cp4RoomTrialLimitCheck.property(shipped),
      cp4RoomTrialLimitCheck.parameters,
    );
  }, 30_000);

  it("ends every room within Room_Trial_Limit with any valid settings", () => {
    fc.assert(
      cp4RoomTrialLimitCheck.property(validSettingsArbitrary),
      cp4RoomTrialLimitCheck.parameters,
    );
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { roomLimits } from "./room-limits";

describe("roomLimits", () => {
  it("gives 2, 4, 40, 13 and 53 for the shipped settings", () => {
    expect(roomLimits(hearingMethodConfig)).toEqual({
      minimumEarPresentationCount: 2,
      minimumRoomSoundTrialCount: 4,
      maximumRoomSoundTrialCount: 40,
      maximumRoomNoSoundTrialCount: 13,
      roomTrialLimitCount: 53,
    });
  });

  it("matches a hand-computed case with other counts", () => {
    // Smallest of 3, 4, 5 and 10 is 3, so 6 to 20 sound trials. The most no-sound trials with
    // 20 sound trials at a 0.3 maximum: 8 / 28 = 0.286 fits and 9 / 29 = 0.310 does not.
    expect(
      roomLimits({
        ...hearingMethodConfig,
        thresholdCatchesMinCount: 3,
        floorCatchesForBetterThanFloorCount: 4,
        capMissesForWorseThanCapCount: 5,
        trialLimitPerEarPerRoomCount: 10,
        noSoundTrialShareMaxFraction: 0.3,
      }),
    ).toEqual({
      minimumEarPresentationCount: 3,
      minimumRoomSoundTrialCount: 6,
      maximumRoomSoundTrialCount: 20,
      maximumRoomNoSoundTrialCount: 8,
      roomTrialLimitCount: 28,
    });
  });

  it("lets the trial limit bound the minimum when it is the smallest count", () => {
    expect(
      roomLimits({ ...hearingMethodConfig, trialLimitPerEarPerRoomCount: 1 })
        .minimumEarPresentationCount,
    ).toBe(1);
  });

  it("throws a RangeError naming the field when the share maximum is 1", () => {
    expect(() =>
      roomLimits({ ...hearingMethodConfig, noSoundTrialShareMaxFraction: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      roomLimits({ ...hearingMethodConfig, noSoundTrialShareMaxFraction: 1 }),
    ).toThrow(/noSoundTrialShareMaxFraction/);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(roomLimits(hearingMethodConfig))).toBe(true);
  });
});

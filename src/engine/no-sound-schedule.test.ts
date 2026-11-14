import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createNoSoundSchedule } from "./no-sound-schedule";

const schedule = createNoSoundSchedule(hearingMethodConfig);

describe("createNoSoundSchedule with the shipped settings", () => {
  describe("mayAddNoSoundTrial", () => {
    it("allows a no-sound trial at the start of a room (1 of 5 is at most 0.25)", () => {
      expect(
        schedule.mayAddNoSoundTrial({
          noSound: 0,
          sound: 0,
          remainingSoundLowerBound: 4,
        }),
      ).toBe(true);
    });

    it("forbids a second no-sound trial before any sound trial (2 of 6 is above 0.25)", () => {
      expect(
        schedule.mayAddNoSoundTrial({
          noSound: 1,
          sound: 0,
          remainingSoundLowerBound: 4,
        }),
      ).toBe(false);
    });

    it("allows a no-sound trial that brings the worst-case share exactly to the maximum", () => {
      // With one more no-sound trial and one more sound trial: 5 of 20 is exactly 0.25.
      expect(
        schedule.mayAddNoSoundTrial({
          noSound: 4,
          sound: 14,
          remainingSoundLowerBound: 1,
        }),
      ).toBe(true);
    });
  });

  describe("needsClosingTrial", () => {
    it("needs a closing trial after 4 sound trials and no no-sound trial", () => {
      expect(schedule.needsClosingTrial({ noSound: 0, sound: 4 })).toBe(true);
    });

    it("needs none after 4 sound trials and 1 no-sound trial (1 of 5 is at least 0.15)", () => {
      expect(schedule.needsClosingTrial({ noSound: 1, sound: 4 })).toBe(false);
    });

    it("needs none when the share is exactly the minimum (3 of 20)", () => {
      expect(schedule.needsClosingTrial({ noSound: 3, sound: 17 })).toBe(false);
    });
  });
});

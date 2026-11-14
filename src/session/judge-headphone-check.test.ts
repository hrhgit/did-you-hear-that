import { describe, expect, it } from "vitest";
import type { HeadphoneCheckAnswer } from "./judge-headphone-check";
import { judgeHeadphoneCheck } from "./judge-headphone-check";

describe("judgeHeadphoneCheck", () => {
  it.each([
    ["left", "correct"],
    ["right", "swapped"],
    ["bothSides", "bothSides"],
    ["nothingHeard", "notHeard"],
  ] as const)(
    "judges the answer %s as %s (R17.3, R17.7)",
    (answer, judgement) => {
      expect(judgeHeadphoneCheck(answer)).toBe(judgement);
    },
  );

  it("throws for anything else", () => {
    expect(() => judgeHeadphoneCheck("both" as HeadphoneCheckAnswer)).toThrow(
      RangeError,
    );
  });
});

import { describe, expect, it } from "vitest";
import { judgeSwapCheck } from "./judge-swap-check";
import type { HeadphoneCheckAnswer } from "./visit-flow-types";

describe("judgeSwapCheck", () => {
  it.each([
    ["right", "confirmed"],
    ["left", "notSwapped"],
    ["bothSides", "bothSides"],
    ["nothingHeard", "notHeard"],
  ] as const)("judges %s as %s", (answer, judgement) => {
    expect(judgeSwapCheck(answer)).toBe(judgement);
  });

  it.each(["Left", "", "both", "up", null, undefined, 0])(
    "throws a RangeError for %j",
    (answer) => {
      expect(() => judgeSwapCheck(answer as HeadphoneCheckAnswer)).toThrow(
        RangeError,
      );
    },
  );
});

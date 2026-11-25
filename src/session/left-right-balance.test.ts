import { describe, expect, it } from "vitest";
import { estimateBalance } from "./left-right-balance";

const pairs = (differences: number[]) =>
  differences.map((difference, index) => ({
    frequencyHz: 500 * 2 ** index,
    leftDb: -30 + difference,
    rightDb: -30,
  }));

describe("estimateBalance", () => {
  it("needs three pitches", () => {
    expect(estimateBalance(pairs([6, 6]))).toBeNull();
  });

  it("calls the sides even when they found about the same", () => {
    expect(estimateBalance(pairs([1, -1, 0, 2]))).toEqual({
      kind: "even",
      pitchCount: 4,
    });
  });

  it("names the side that needed louder sounds at every pitch", () => {
    expect(estimateBalance(pairs([6, 5, 7, 6, 1]))).toEqual({
      kind: "offset",
      quieterSide: "left",
      offsetDb: 6,
      pitchCount: 5,
    });
    expect(estimateBalance(pairs([-5, -5, -6]))).toMatchObject({
      quieterSide: "right",
    });
  });

  it("says nothing when the gap changes with pitch", () => {
    expect(estimateBalance(pairs([0, 10, -10, 12]))).toBeNull();
  });

  it("says nothing between even and offset", () => {
    expect(estimateBalance(pairs([3, 3, 3]))).toBeNull();
  });
});

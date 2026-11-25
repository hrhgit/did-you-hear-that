import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import {
  balanceOffsetLine,
  delayLine,
  headphoneTraitsCopy,
  quietCutLine,
} from "./headphone-traits-copy";

const lines = [
  ...[0, 40, 140, 300].flatMap((ms) =>
    (["quick", "noticeable", "long"] as const).map((band) =>
      delayLine(ms, band),
    ),
  ),
  ...[-50, -32.5, 0, 3].map(quietCutLine),
  ...[4, 6.4, 12].flatMap((db) => [
    balanceOffsetLine("left", db),
    balanceOffsetLine("right", db),
  ]),
];

describe("headphone traits copy", () => {
  it("writes the rows", () => {
    expect(delayLine(140, "noticeable")).toBe("About 140 ms, noticeable");
    expect(delayLine(0, "quick")).toBe("Quick");
    expect(quietCutLine(-32.5)).toBe(
      "Nothing below about 32 dB under your calibration",
    );
    expect(balanceOffsetLine("right", 6.4)).toBe(
      "Right side needed about 6 dB more",
    );
  });

  it("uses no banned term", () => {
    for (const line of lines) {
      for (const term of bannedTerms) {
        expect(line.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  it("refuses a value that is not finite", () => {
    expect(() => delayLine(Number.NaN, "quick")).toThrow(RangeError);
    expect(() => quietCutLine(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => balanceOffsetLine("left", Number.NaN)).toThrow(RangeError);
  });

  it("keeps the fixed lines", () => {
    expect(headphoneTraitsCopy.heading).toBe("Your headphones");
  });
});

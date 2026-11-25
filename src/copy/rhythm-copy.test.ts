import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { findBannedTerms } from "./find-banned-terms";
import {
  flameLabel,
  relitLine,
  rhythmCopy,
  rhythmHudLabel,
  standingLabel,
} from "./rhythm-copy";

describe("the words of the rhythm game (2026-11-18)", () => {
  it("uses no banned term", () => {
    const words = [
      rhythmCopy.jackName,
      rhythmCopy.comboWord,
      rhythmCopy.scoreWord,
      rhythmCopy.kickAtNothingWord,
      rhythmCopy.warmUpWord,
      ...Object.values(rhythmCopy.judgementWords),
    ];
    for (const word of words) {
      expect(findBannedTerms(word, bannedTerms)).toEqual([]);
    }
  });

  it("names the score, the combo and Jack's flame for a visitor who cannot see them", () => {
    expect(standingLabel(4200, 12)).toBe("4200 points, combo 12");
    expect(flameLabel(70, 100)).toBe("Jack's flame: 70 of 100");
    expect(rhythmHudLabel(4200, 12, 69.6, 100)).toBe(
      "4200 points, combo 12. Jack's flame: 70 of 100",
    );
    fc.assert(
      fc.property(
        fc.nat(1e6),
        fc.nat(999),
        fc.nat(100),
        (score, combo, flame) => {
          expect(
            findBannedTerms(
              rhythmHudLabel(score, combo, flame, 100),
              bannedTerms,
            ),
          ).toEqual([]);
        },
      ),
    );
  });

  it("says Jack was lit again only once his candle went out", () => {
    expect(relitLine(0)).toBeNull();
    expect(relitLine(1)).toBe("Jack's candle went out once and was lit again.");
    expect(relitLine(3)).toBe(
      "Jack's candle went out 3 times and was lit again.",
    );
  });

  it("refuses counts that are not whole numbers from 0 up, and a flame overfull", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => standingLabel(bad, 0)).toThrow(RangeError);
      expect(() => standingLabel(0, bad)).toThrow(RangeError);
      expect(() => flameLabel(bad, 100)).toThrow(RangeError);
      expect(() => relitLine(bad)).toThrow(RangeError);
    }
    expect(() => flameLabel(101, 100)).toThrow(RangeError);
    expect(() => flameLabel(0, 0)).toThrow(RangeError);
  });
});

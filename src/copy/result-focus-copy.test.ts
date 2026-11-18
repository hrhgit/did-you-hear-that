import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { findBannedTerms } from "./find-banned-terms";
import {
  closeLine,
  focusFloorLabel,
  focusHeading,
  focusLine,
  focusPointKindOrder,
  focusPointLine,
  pictureKeyCopy,
  resultFocusCopy,
  type FocusPointKindName,
  type FocusPointWords,
} from "./result-focus-copy";
import {
  chaseScoreCopy,
  longestRowLine,
  roomCaughtLine,
  totalCaughtLine,
} from "./result-page-copy";
import { wingValue, type WingWords } from "./result-lines";

function expectClean(text: string): void {
  expect(text, text).not.toBe("");
  expect(text.trim(), text).toBe(text);
  expect(findBannedTerms(text, bannedTerms), text).toEqual([]);
}

const everyPoint: readonly FocusPointWords[] = [
  { kind: "followsEar" },
  { kind: "followsEarpiece" },
  { kind: "repeatUnclear" },
  { kind: "farApart", rightMinusLeftDb: 18, atLeast: false },
  { kind: "farApart", rightMinusLeftDb: -18, atLeast: true },
  { kind: "dark", sides: ["left"] },
  { kind: "dark", sides: ["left", "right"] },
  { kind: "unsettled", sides: ["right"] },
  { kind: "unsettled", sides: ["right", "left"] },
];

describe("the focus card's constant copy", () => {
  it.each([
    ...Object.entries(resultFocusCopy),
    ...Object.entries(pictureKeyCopy),
    ...Object.entries(chaseScoreCopy),
  ])("%s is non-empty, trimmed and uses no banned term", (_key, text) => {
    expectClean(text);
  });

  it("orders every kind once, the most pressing first", () => {
    expect(focusPointKindOrder).toEqual([
      "followsEar",
      "dark",
      "farApart",
      "unsettled",
      "followsEarpiece",
      "repeatUnclear",
    ]);
    expect(Object.isFrozen(focusPointKindOrder)).toBe(true);
  });
});

describe("focusPointLine", () => {
  it.each(everyPoint)("gives a clean line for %o", (point) => {
    expectClean(focusPointLine(point));
  });

  it("names the quieter side first, rounded to whole decibels", () => {
    expect(
      focusPointLine({
        kind: "farApart",
        rightMinusLeftDb: 17.6,
        atLeast: false,
      }),
    ).toBe("You caught a sound 18 dB quieter on your left than on your right.");
    expect(
      focusPointLine({
        kind: "farApart",
        rightMinusLeftDb: -20,
        atLeast: true,
      }),
    ).toBe(
      "You caught a sound at least 20 dB quieter on your right than on your left.",
    );
  });

  it("says where a side stayed dark or found no level", () => {
    expect(focusPointLine({ kind: "dark", sides: ["left"] })).toBe(
      "You did not catch the loudest sound the house may play on your left.",
    );
    expect(
      focusPointLine({ kind: "unsettled", sides: ["left", "right"] }),
    ).toBe("The house found no level on either side.");
  });

  it.each([
    { kind: "farApart", rightMinusLeftDb: Number.NaN, atLeast: false },
    { kind: "farApart", rightMinusLeftDb: Infinity, atLeast: false },
    { kind: "farApart", rightMinusLeftDb: 0.4, atLeast: false },
    { kind: "dark", sides: [] },
    { kind: "dark", sides: ["left", "left"] },
    { kind: "unsettled", sides: ["left", "right", "left"] },
    { kind: "unsettled", sides: ["middle"] },
    { kind: "nowhere" },
  ] as unknown as FocusPointWords[])("refuses %o", (point) => {
    expect(() => focusPointLine(point)).toThrow(RangeError);
  });
});

describe("focusHeading and focusLine", () => {
  it.each(focusPointKindOrder)(
    "gives a clean heading and line for %s, for one floor and for more",
    (kind) => {
      for (const floorCount of [1, 2, 3]) {
        expectClean(focusHeading(kind, floorCount, floorCount));
        expectClean(focusLine(kind, floorCount));
      }
    },
  );

  it("counts the floors that stand out, never ranking them", () => {
    expect(focusHeading("farApart", 1, 1)).toBe(
      "Your left and right were far apart on one floor",
    );
    expect(focusHeading("unsettled", 3, 4)).toBe(
      "The house found no level on 3 floors",
    );
    expect(focusLine("unsettled", 1)).toContain("that room");
    expect(focusLine("farApart", 2)).toContain("those rooms");
  });

  it("counts the dark sides, not the floors, for a dark heading", () => {
    expect(focusHeading("dark", 1, 1)).toBe("One side stayed dark");
    expect(focusHeading("dark", 1, 2)).toBe("Some sides stayed dark");
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses %s floors", (floorCount) => {
    expect(() => focusHeading("dark", floorCount, 1)).toThrow(RangeError);
    expect(() => focusLine("dark", floorCount)).toThrow(RangeError);
  });

  it("refuses an unknown kind", () => {
    const unknown = "loudest" as FocusPointKindName;
    expect(() => focusHeading(unknown, 1, 1)).toThrow(RangeError);
    expect(() => focusLine(unknown, 1)).toThrow(RangeError);
  });
});

describe("closeLine", () => {
  it("gives the swap limit in whole decibels and asks to save only when the visit can be", () => {
    expect(closeLine(15, false)).toBe(
      "No floor showed a difference of 15 dB or more between your left and your right.",
    );
    expect(closeLine(14.6, true)).toBe(
      `No floor showed a difference of 15 dB or more between your left and your right. ${resultFocusCopy.keepLine}`,
    );
    expectClean(closeLine(15, true));
  });

  it.each([0, -5, Number.NaN, Infinity])("refuses a limit of %s", (limit) => {
    expect(() => closeLine(limit, true)).toThrow(RangeError);
  });
});

describe("focusFloorLabel", () => {
  it("names the room and its pitch", () => {
    expect(focusFloorLabel("Stairs", "4 kHz")).toBe("Stairs, 4 kHz");
  });
});

describe("wingValue", () => {
  function wing(
    state: WingWords["state"],
    thresholdDb: number | null = null,
  ): WingWords {
    return {
      state,
      thresholdDb,
      reasons: state === "unreliable" ? ["trialLimit"] : [],
    };
  }

  it("gives a found level relative to the calibration, in whole decibels", () => {
    expect(wingValue(wing("found", -29.6))).toEqual({
      value: "30 dB quieter",
      note: "than your calibration",
    });
    expect(wingValue(wing("found", 4))).toEqual({
      value: "4 dB louder",
      note: "than your calibration",
    });
    expect(wingValue(wing("found", -0.4))).toEqual({
      value: "As loud",
      note: "as your calibration",
    });
  });

  it.each(["found", "betterThanFloor", "worseThanCap", "unreliable"] as const)(
    "gives clean words for a %s wing",
    (state) => {
      const words = wingValue(wing(state, state === "found" ? -30 : null));
      expectClean(words.value);
      expectClean(words.note);
    },
  );

  it("refuses a wing that does not hold together", () => {
    expect(() => wingValue(wing("found", null))).toThrow(RangeError);
    expect(() => wingValue(wing("worseThanCap", -20))).toThrow(RangeError);
  });
});

describe("the chase's counts", () => {
  it("counts sounds caught and rows", () => {
    expect(totalCaughtLine(1)).toBe("1 caught in all");
    expect(totalCaughtLine(23)).toBe("23 caught in all");
    expect(longestRowLine(1)).toBe("Never two in a row");
    expect(longestRowLine(6)).toBe("Longest row: 6 in a row");
    expect(roomCaughtLine("Cellar", 7)).toBe("Cellar: 7 caught");
  });

  it.each([-1, 1.5, Number.NaN])("refuses a count of %s", (count) => {
    expect(() => totalCaughtLine(count)).toThrow(RangeError);
    expect(() => longestRowLine(count)).toThrow(RangeError);
    expect(() => roomCaughtLine("Cellar", count)).toThrow(RangeError);
  });
});

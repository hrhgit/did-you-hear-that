import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { curveGridLabel, resultCurveCopy } from "./result-curve-copy";

describe("result curve copy", () => {
  it("labels the grid with a true minus sign", () => {
    expect(curveGridLabel(-20)).toBe("−20");
    expect(curveGridLabel(0)).toBe("0");
    expect(curveGridLabel(10)).toBe("10");
  });

  it("uses no banned term", () => {
    const text = [
      ...Object.values(resultCurveCopy),
      ...[-60, -10, 0, 10].map(curveGridLabel),
    ]
      .join(" ")
      .toLowerCase();
    for (const term of bannedTerms) {
      expect(text).not.toMatch(new RegExp(`\\b${term.toLowerCase()}\\b`));
    }
  });
});

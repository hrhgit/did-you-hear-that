import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { findBannedTerms } from "./find-banned-terms";

describe("findBannedTerms", () => {
  it.each([
    ["Normal", "normal"],
    ["normally", "normal"],
    ["passed", "pass"],
    ["non-clinical", "clinical"],
    ["dB HL", "dB HL"],
    ["hearing\nlevel", "hearing level"],
    ["people  your age", "people your age"],
  ])("finds a banned term in %j", (text, term) => {
    expect(findBannedTerms(text, bannedTerms)).toContain(term);
  });

  it.each(["passage", "lossless", "scoreboard", "deafening"])(
    "finds nothing in %j",
    (text) => {
      expect(findBannedTerms(text, bannedTerms)).toEqual([]);
    },
  );

  it.each([
    ["DIAGNOSED.", "diagnose"],
    ["(fails)", "fail"],
    ["scores, again", "score"],
    ["HEALTHY", "healthy"],
  ])("handles case, endings and punctuation in %j", (text, term) => {
    expect(findBannedTerms(text, bannedTerms)).toEqual([term]);
  });

  it("does not match a term with a letter or digit attached", () => {
    expect(findBannedTerms("xnormal 2pass fail3 passé", bannedTerms)).toEqual(
      [],
    );
  });

  it("returns the terms in list order, each once", () => {
    expect(
      findBannedTerms(
        "Score and fail, then pass, then normal, then pass again.",
        bannedTerms,
      ),
    ).toEqual(["normal", "pass", "fail", "score"]);
  });

  it("reports a term listed twice only once", () => {
    expect(findBannedTerms("loss", ["loss", "loss"])).toEqual(["loss"]);
  });

  it("treats regular expression characters in a term literally", () => {
    expect(findBannedTerms("a.b", ["a.b"])).toEqual(["a.b"]);
    expect(findBannedTerms("axb", ["a.b"])).toEqual([]);
  });

  it("finds nothing in the placeholder strings", () => {
    expect(findBannedTerms("Did You Hear That?", bannedTerms)).toEqual([]);
    expect(findBannedTerms("The house is not open yet.", bannedTerms)).toEqual(
      [],
    );
  });
});

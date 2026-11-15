import { describe, expect, it } from "vitest";
import {
  canonicalHeadphoneName,
  sameHeadphoneNameKey,
} from "./canonical-headphone-name";

describe("canonicalHeadphoneName", () => {
  it("keeps a tidy name as it is, with its letter case", () => {
    expect(canonicalHeadphoneName("White Earbuds")).toBe("White Earbuds");
  });

  it("normalises to NFC", () => {
    const decomposed = "Cafe\u0301 cans";
    expect(canonicalHeadphoneName(decomposed)).toBe("Caf\u00e9 cans");
    expect(canonicalHeadphoneName(decomposed)).toBe(
      canonicalHeadphoneName("Caf\u00e9 cans"),
    );
  });

  it("makes every run of white space one space", () => {
    expect(canonicalHeadphoneName("Big   cans")).toBe("Big cans");
    expect(canonicalHeadphoneName("Big\t\tcans\nleft")).toBe("Big cans left");
    expect(canonicalHeadphoneName("Big\u00a0\u2003cans")).toBe("Big cans");
    expect(canonicalHeadphoneName("Big\r\n cans")).toBe("Big cans");
  });

  it("makes every run of control characters one space", () => {
    expect(canonicalHeadphoneName("Big\u0000cans")).toBe("Big cans");
    expect(canonicalHeadphoneName("Big\u0007\u001b cans")).toBe("Big cans");
    expect(canonicalHeadphoneName("Big\u007fcans")).toBe("Big cans");
  });

  it("trims", () => {
    expect(canonicalHeadphoneName("  Big cans \n")).toBe("Big cans");
    expect(canonicalHeadphoneName("\u0000Big cans\u0000")).toBe("Big cans");
  });

  it("gives null when nothing is left", () => {
    expect(canonicalHeadphoneName("")).toBeNull();
    expect(canonicalHeadphoneName("   ")).toBeNull();
    expect(canonicalHeadphoneName("\t\n\u0000\u00a0")).toBeNull();
  });

  it("gives the same tidy name again for a tidy name", () => {
    for (const typed of [
      "  a  b ",
      "Cafe\u0301",
      "x\u0000\u0301y",
      "🎧 \n 🎧",
    ]) {
      const tidy = canonicalHeadphoneName(typed) as string;
      expect(canonicalHeadphoneName(tidy)).toBe(tidy);
    }
  });
});

describe("sameHeadphoneNameKey", () => {
  it("ignores letter case and spacing", () => {
    expect(sameHeadphoneNameKey("White Earbuds")).toBe("white earbuds");
    expect(sameHeadphoneNameKey("  WHITE\t earbuds ")).toBe(
      sameHeadphoneNameKey("white earbuds"),
    );
  });

  it("matches composed and decomposed forms", () => {
    expect(sameHeadphoneNameKey("CAFE\u0301")).toBe(
      sameHeadphoneNameKey("caf\u00e9"),
    );
  });

  it("gives null for a name with no tidy form", () => {
    expect(sameHeadphoneNameKey("")).toBeNull();
    expect(sameHeadphoneNameKey(" \n ")).toBeNull();
  });

  it("does not change the tidy name, which keeps the visitor's letter case", () => {
    const typed = "Studio MONITORS";
    sameHeadphoneNameKey(typed);
    expect(canonicalHeadphoneName(typed)).toBe("Studio MONITORS");
  });
});

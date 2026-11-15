import { describe, expect, it } from "vitest";
import { bannedTerms, limitsStatementAllowedTerms } from "./banned-terms";

describe("bannedTerms", () => {
  it("has no empty entries", () => {
    for (const term of bannedTerms) {
      expect(term.length, JSON.stringify(term)).toBeGreaterThan(0);
    }
  });

  it("has no leading or trailing spaces", () => {
    for (const term of bannedTerms) {
      expect(term, JSON.stringify(term)).toBe(term.trim());
    }
  });

  it("has no repeated entries, ignoring letter case", () => {
    const lowerCaseTerms = bannedTerms.map((term) => term.toLowerCase());
    expect(new Set(lowerCaseTerms).size).toBe(lowerCaseTerms.length);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(bannedTerms)).toBe(true);
  });
});

describe("limitsStatementAllowedTerms", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(limitsStatementAllowedTerms)).toBe(true);
  });

  it("holds only terms that are in bannedTerms", () => {
    for (const term of limitsStatementAllowedTerms) {
      expect(bannedTerms, JSON.stringify(term)).toContain(term);
    }
  });
});

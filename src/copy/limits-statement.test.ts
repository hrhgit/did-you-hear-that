import { describe, expect, it } from "vitest";
import {
  bannedTerms,
  limitsStatementAllowedTerms,
} from "../config/banned-terms";
import { findBannedTerms } from "./find-banned-terms";
import { limitsStatement } from "./limits-statement";

const otherBannedTerms = bannedTerms.filter(
  (term) => !limitsStatementAllowedTerms.includes(term),
);

/** Where `term` first stands as a word in `sentence`, ignoring letter case, or −1. */
function wordIndex(sentence: string, term: string): number {
  const match = new RegExp(
    `(?<![\\p{L}\\p{N}])${term}(?![\\p{L}\\p{N}])`,
    "iu",
  ).exec(sentence);
  return match === null ? -1 : match.index;
}

describe("limitsStatement", () => {
  it("holds the heading and the four sentences of the design, in order (R17.1)", () => {
    expect(limitsStatement.heading).toBe("What this picture can tell you");
    expect(limitsStatement.sentences).toEqual([
      "Headphones differ at every pitch, so floors cannot be compared with each other.",
      "What can be compared is your left against your right on one floor, and this visit against your own later visits with the same headphones.",
      "This is not a diagnosis, and it has not been checked against clinical equipment.",
      "See a hearing professional if a difference between your left and your right is still there after you swap the headphones, if your hearing changes suddenly, or if ringing in your ears does not go away.",
    ]);
    expect(Object.keys(limitsStatement)).toEqual(["heading", "sentences"]);
  });

  it("uses each allowed term only after the word not in the same sentence (R17.5)", () => {
    let allowedTermUses = 0;
    for (const sentence of limitsStatement.sentences) {
      for (const term of findBannedTerms(
        sentence,
        limitsStatementAllowedTerms,
      )) {
        allowedTermUses += 1;
        const termAt = wordIndex(sentence, term);
        const notAt = wordIndex(sentence, "not");
        expect(
          termAt,
          `${term} in ${JSON.stringify(sentence)}`,
        ).toBeGreaterThan(-1);
        expect(notAt, `"not" in ${JSON.stringify(sentence)}`).toBeGreaterThan(
          -1,
        );
        expect(notAt, `${term} in ${JSON.stringify(sentence)}`).toBeLessThan(
          termAt,
        );
      }
    }
    expect(allowedTermUses).toBe(2);
  });

  it("uses no other banned term (R17.3)", () => {
    expect(findBannedTerms(limitsStatement.heading, bannedTerms)).toEqual([]);
    for (const sentence of limitsStatement.sentences) {
      expect(findBannedTerms(sentence, otherBannedTerms), sentence).toEqual([]);
    }
  });

  it("is frozen, and so is its array of sentences", () => {
    expect(Object.isFrozen(limitsStatement)).toBe(true);
    expect(Object.isFrozen(limitsStatement.sentences)).toBe(true);
  });
});

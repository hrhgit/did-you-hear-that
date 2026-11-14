import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bannedTerms } from "../../src/config/banned-terms";
import { findBannedTerms } from "../../src/copy/find-banned-terms";

const allowedEndings = ["", "s", "es", "d", "ed", "ing", "ly"];

/**
 * Characters that are neither letters nor digits, so they end a word. The matcher treats a digit
 * next to a term as part of the word, so the boundary must be neither.
 */
const boundary = fc.constantFrom(
  " ",
  "\n",
  "\t",
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  "-",
  "(",
  ")",
  '"',
  "'",
  "\u2014",
  "\u00a0",
);

const anyText = fc.oneof(fc.string(), fc.string({ unit: "grapheme" }));

/** Either nothing, or any text followed by a boundary character. */
const before = fc.oneof(
  fc.constant(""),
  fc.tuple(anyText, boundary).map(([text, end]) => text + end),
);

/** Either nothing, or a boundary character followed by any text. */
const after = fc.oneof(
  fc.constant(""),
  fc.tuple(boundary, anyText).map(([start, text]) => start + text),
);

/** A banned term with each letter in either case and each space widened to some whitespace. */
const writtenTerm = fc.constantFrom(...bannedTerms).chain((term) =>
  fc
    .tuple(
      fc.array(fc.boolean(), {
        minLength: term.length,
        maxLength: term.length,
      }),
      fc.array(fc.constantFrom(" ", "  ", "\n", "\t", " \n "), {
        minLength: term.length,
        maxLength: term.length,
      }),
    )
    .map(([upper, spaces]) => ({
      term,
      written: [...term]
        .map((character, index) =>
          character === " "
            ? spaces[index]
            : upper[index]
              ? character.toUpperCase()
              : character.toLowerCase(),
        )
        .join(""),
    })),
);

describe("findBannedTerms properties", () => {
  // Property 7 (R3.8).
  it("reports a banned term in any case, with any allowed ending, between word boundaries", () => {
    fc.assert(
      fc.property(
        writtenTerm,
        fc.constantFrom(...allowedEndings),
        before,
        after,
        ({ term, written }, ending, prefix, suffix) => {
          const text = prefix + written + ending + suffix;
          expect(findBannedTerms(text, bannedTerms)).toContain(term);
        },
      ),
    );
  });
});

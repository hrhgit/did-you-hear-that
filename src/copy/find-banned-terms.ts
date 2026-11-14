/** The endings a banned term may carry and still count as the same word. */
const allowedEndings = ["s", "es", "d", "ed", "ing", "ly"];

/**
 * Builds the pattern for one term: the whole word or phrase in any letter case, optionally
 * followed by one allowed ending, with no letter or digit directly before or after. Each space in
 * the term matches any run of whitespace, including a line break.
 */
function termPattern(term: string): RegExp {
  const escaped = term
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll(" ", "\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?:${allowedEndings.join("|")})?(?![\\p{L}\\p{N}])`,
    "iu",
  );
}

/**
 * Returns the terms that appear in `text`, each once, in the order of `terms`. So "Normal",
 * "normally", "passed" and "non-clinical" match, while "passage", "lossless" and "scoreboard" do
 * not.
 */
export function findBannedTerms(
  text: string,
  terms: readonly string[],
): string[] {
  const found: string[] = [];
  for (const term of terms) {
    if (!found.includes(term) && termPattern(term).test(text)) {
      found.push(term);
    }
  }
  return found;
}

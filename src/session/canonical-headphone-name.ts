/** Every run of white space or control characters. */
const spacing = /[\s\p{Cc}]+/gu;

/**
 * The tidy form of the name the visitor typed for the headphones (result-page design.md, "The
 * archive", D11): Unicode NFC, every run of white space and control characters made one space,
 * and trimmed. Null when nothing is left. The visitor's letter case is kept. A pure function.
 */
export function canonicalHeadphoneName(typed: string): string | null {
  const tidy = typed.normalize("NFC").replace(spacing, " ").trim();
  return tidy === "" ? null : tidy;
}

/**
 * The key two names are matched by: the tidy name in lower case, or null for no name. Lower case
 * comes from `toLowerCase`, which does not depend on the browser's language. Two names with no
 * tidy form never match, because unnamed headphones may be different headphones.
 */
export function sameHeadphoneNameKey(typed: string): string | null {
  const tidy = canonicalHeadphoneName(typed);
  return tidy === null ? null : tidy.toLowerCase();
}

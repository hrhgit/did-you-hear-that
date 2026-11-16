/** A line as its first sentence and whatever follows it. */
export interface LeadAndRest {
  readonly lead: string;
  /** Empty when the line is one sentence. */
  readonly rest: string;
}

/**
 * Parts a line after its first sentence, so that the page can let the first sentence stand out.
 * No word is changed, added or dropped: `lead` and `rest` joined by one space are the line again.
 * A full stop inside a number, such as "2.5", does not end a sentence.
 */
export function leadSentence(line: string): LeadAndRest {
  const end = line.indexOf(". ");
  if (end < 0) {
    return { lead: line, rest: "" };
  }
  return { lead: line.slice(0, end + 1), rest: line.slice(end + 2) };
}

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bannedTerms,
  limitsStatementAllowedTerms,
} from "../../src/config/banned-terms";
import { findBannedTerms } from "../../src/copy/find-banned-terms";
import { limitsStatement } from "../../src/copy/limits-statement";
import { resultPicture } from "../../src/session/result-picture";
import {
  listScenarioArbitrary,
  pictureInputWithEarlierArbitrary,
  playListScenario,
} from "./result-page-arbitraries";
import {
  accuracyWords,
  decibelsWithoutAllowedForm,
  exportedCopyTexts,
  listTexts,
  outcomeTexts,
  pictureTexts,
  wordsHeld,
  type PlacedText,
} from "./result-page-text";

// CP1. Safe wording (Universal; result-page design.md, CP1; R12.4, R16, R17, R18; brief
// property "Safe wording"). For any picture input, with an earlier visit or none, and for any list
// state, unreadable count and refusal, every string the picture, the lists and the outcomes give,
// and every string exported from this spec's copy files, keeps the rules of wording.md.

/** Runs (design.md, "Run counts and time"). */
const runs = 1000;
const timeoutMs = 120_000;

/** The strings of `texts` that break a rule of CP1, each with its place and the rule. */
function wordingFaults(texts: readonly PlacedText[]): string[] {
  const faults: string[] = [];
  for (const { place, text, limitsSentence } of texts) {
    const banned = findBannedTerms(text, bannedTerms);
    const notAllowed = limitsSentence
      ? banned.filter((term) => !limitsStatementAllowedTerms.includes(term))
      : banned;
    if (notAllowed.length > 0) {
      faults.push(`${place} holds ${notAllowed.join(", ")}: ${text}`);
    }
    for (const miss of decibelsWithoutAllowedForm(text)) {
      faults.push(`${place} has a level without its label: ${miss}`);
    }
    const accuracy = wordsHeld(text, accuracyWords);
    if (accuracy.length > 0) {
      faults.push(
        `${place} speaks of accuracy (${accuracy.join(", ")}): ${text}`,
      );
    }
    if (text.length === 0 || text.trim() !== text) {
      faults.push(`${place} is empty or not trimmed: ${JSON.stringify(text)}`);
    }
  }
  return faults;
}

describe("result page CP1. Safe wording (Universal; R12.4, R16, R17, R18)", () => {
  it(
    "keeps banned terms, unlabelled levels, accuracy words and typed names out of every string of the picture, the lists and the outcomes",
    () => {
      const exported = exportedCopyTexts();
      fc.assert(
        fc.property(
          pictureInputWithEarlierArbitrary,
          listScenarioArbitrary,
          (drawnInput, scenario) => {
            const picture = resultPicture(drawnInput.input);
            expect(picture.limitsStatement).toBe(limitsStatement);

            const run = playListScenario(scenario);
            const generated: PlacedText[] = [
              ...pictureTexts(picture),
              ...run.lists.flatMap((list, index) =>
                listTexts(list, `lists[${String(index)}]`),
              ),
              ...run.outcomes.flatMap((outcome, index) =>
                outcomeTexts(outcome, `outcomes[${String(index)}]`),
              ),
            ];
            expect(wordingFaults([...generated, ...exported])).toEqual([]);

            const pictureName =
              drawnInput.input.kind === "saved"
                ? drawnInput.input.savedVisit.headphoneName
                : null;
            const earlierName =
              drawnInput.input.earlierVisit?.headphoneName ?? null;
            const names = [
              ...run.tidyNames,
              ...(pictureName === null ? [] : [pictureName]),
              ...(earlierName === null ? [] : [earlierName]),
            ].map((name) => name.toLowerCase());
            const holdingNames = generated.filter(({ text }) =>
              names.some((name) => text.toLowerCase().includes(name)),
            );
            expect(holdingNames).toEqual([]);
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

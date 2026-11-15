import * as comparisonLinesModule from "../../src/copy/comparison-lines";
import * as limitsStatementModule from "../../src/copy/limits-statement";
import * as resultLinesModule from "../../src/copy/result-lines";
import * as resultPageCopyModule from "../../src/copy/result-page-copy";
import { roomNames } from "../../src/copy/room-copy";
import * as savedVisitLinesModule from "../../src/copy/saved-visit-lines";
import type {
  DeleteOutcome,
  ResultPicture,
  SavedVisitList,
  SaveOutcome,
} from "../../src/session/result-page-types";

// The generated text of the result page and the word lists of CP1 and CP2 (result-page design.md,
// "Correctness properties"). Generated text is every field the contract describes as something to
// show or say. Code values (kind, state, ear, room ids, saved visit ids) and the visitor's own data
// (the headphone name, the summary, the log) are not generated text.

/** One string to check, with where it came from. */
export interface PlacedText {
  /** Such as "picture.floors[1].left.line" or "lists[2].lines[0]". */
  readonly place: string;
  readonly text: string;
  /** The position of the floor it belongs to, or null for a string outside the floors. */
  readonly floorIndex: number | null;
  /** True for the heading and the four sentences of the limits statement. */
  readonly inLimitsStatement: boolean;
  /** True for the four sentences of the limits statement, the only strings exempt from the banned terms. */
  readonly limitsSentence: boolean;
}

function placed(
  place: string,
  text: string,
  floorIndex: number | null = null,
): PlacedText {
  return {
    place,
    text,
    floorIndex,
    inLimitsStatement: false,
    limitsSentence: false,
  };
}

/** The generated text of a picture, floor by floor and then outside the floors. */
export function pictureTexts(
  picture: ResultPicture,
  prefix = "picture",
): PlacedText[] {
  const texts: PlacedText[] = [];
  picture.floors.forEach((floor, index) => {
    const at = `${prefix}.floors[${String(index)}]`;
    texts.push(placed(`${at}.roomName`, floor.roomName, index));
    texts.push(placed(`${at}.pitchLabel`, floor.pitchLabel, index));
    for (const wing of [floor.left, floor.right]) {
      texts.push(placed(`${at}.${wing.ear}.line`, wing.line, index));
      if (wing.reasonLine !== null) {
        texts.push(
          placed(`${at}.${wing.ear}.reasonLine`, wing.reasonLine, index),
        );
      }
    }
    texts.push(placed(`${at}.differenceLabel`, floor.differenceLabel, index));
    texts.push(placed(`${at}.differenceLine`, floor.differenceLine, index));
    if (floor.swappedRepeat !== null) {
      texts.push(
        placed(`${at}.swappedRepeat.line`, floor.swappedRepeat.line, index),
      );
      texts.push(
        placed(
          `${at}.swappedRepeat.buttonLabel`,
          floor.swappedRepeat.buttonLabel,
          index,
        ),
      );
    }
    texts.push(placed(`${at}.description`, floor.description, index));
  });
  texts.push(placed(`${prefix}.heading`, picture.heading));
  texts.push(placed(`${prefix}.dateLabel`, picture.dateLabel));
  texts.push(placed(`${prefix}.visitTypeLabel`, picture.visitTypeLabel));
  texts.push(placed(`${prefix}.falseAlarmLine`, picture.falseAlarmLine));
  if (picture.visitNotice !== null) {
    texts.push(
      placed(`${prefix}.visitNotice.heading`, picture.visitNotice.heading),
    );
    texts.push(placed(`${prefix}.visitNotice.line`, picture.visitNotice.line));
  }
  texts.push({
    ...placed(
      `${prefix}.limitsStatement.heading`,
      picture.limitsStatement.heading,
    ),
    inLimitsStatement: true,
  });
  picture.limitsStatement.sentences.forEach((sentence, index) => {
    texts.push({
      ...placed(
        `${prefix}.limitsStatement.sentences[${String(index)}]`,
        sentence,
      ),
      inLimitsStatement: true,
      limitsSentence: true,
    });
  });
  if (picture.comparison !== null) {
    texts.push(placed(`${prefix}.comparison.line`, picture.comparison.line));
  }
  texts.push(placed(`${prefix}.imageCaption`, picture.imageCaption));
  texts.push(placed(`${prefix}.imageFileBaseName`, picture.imageFileBaseName));
  return texts;
}

/** The generated text of a list: its lines and each listing's labels. */
export function listTexts(list: SavedVisitList, prefix: string): PlacedText[] {
  const texts: PlacedText[] = list.lines.map((line, index) =>
    placed(`${prefix}.lines[${String(index)}]`, line),
  );
  list.visits.forEach((listing, index) => {
    const at = `${prefix}.visits[${String(index)}]`;
    texts.push(placed(`${at}.dateLabel`, listing.dateLabel));
    texts.push(placed(`${at}.visitTypeLabel`, listing.visitTypeLabel));
    texts.push(placed(`${at}.deleteLabel`, listing.deleteLabel));
  });
  return texts;
}

/** The generated text of a save or delete outcome: its line. */
export function outcomeTexts(
  outcome: SaveOutcome | DeleteOutcome,
  prefix: string,
): PlacedText[] {
  return [placed(`${prefix}.line`, outcome.line)];
}

/** Every string reachable from a module's exports. Functions are not strings and are skipped. */
function exportedStrings(
  moduleName: string,
  exports: Record<string, unknown>,
): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      found.push({ path, text: value });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        walk(nested, `${path}.${key}`);
      }
    }
  };
  for (const [name, value] of Object.entries(exports)) {
    walk(value, `${moduleName}.${name}`);
  }
  return found;
}

/** Every string exported from the copy files of this spec, with the limits statement marked. */
export function exportedCopyTexts(): PlacedText[] {
  const limits = exportedStrings("limitsStatement", limitsStatementModule).map(
    ({ path, text }) => ({
      ...placed(path, text),
      inLimitsStatement: true,
      limitsSentence: path.includes(".sentences."),
    }),
  );
  const others = [
    ...exportedStrings("resultPageCopy", resultPageCopyModule),
    ...exportedStrings("resultLines", resultLinesModule),
    ...exportedStrings("savedVisitLines", savedVisitLinesModule),
    ...exportedStrings("comparisonLines", comparisonLinesModule),
  ].map(({ path, text }) => placed(path, text));
  return [...limits, ...others];
}

// ─── CP1: the allowed forms of a level ─────────────────────────────────────────────────────

/** What may follow "{n} dB" (CP1). */
export const decibelFollowers: readonly string[] = Object.freeze([
  " quieter than your calibration",
  " louder than your calibration",
  " quieter on the left",
  " quieter on the right",
  " quieter on your left than on your right",
  " quieter on your right than on your left",
  " apart here",
]);

/** Words about accuracy that no string may hold (CP1). */
export const accuracyWords: readonly string[] = Object.freeze([
  "accurate",
  "accuracy",
  "precise",
  "precision",
  "exact",
  "exactly",
  "validated",
  "verified",
  "guaranteed",
  "certain",
]);

/** The places in `text` where "{n} dB" is not followed by an allowed form, and the text is not "0 dB". */
export function decibelsWithoutAllowedForm(text: string): string[] {
  if (text === "0 dB") {
    return [];
  }
  const misses: string[] = [];
  for (const match of text.matchAll(/(?<![\d.])\d+ dB/g)) {
    const rest = text.slice((match.index ?? 0) + match[0].length);
    if (!decibelFollowers.some((follower) => rest.startsWith(follower))) {
      misses.push(text.slice(match.index ?? 0));
    }
  }
  return misses;
}

// ─── CP2: words of comparison, rooms and pitches ───────────────────────────────────────────

/** The allowed forms removed before the words of comparison are looked for (CP2). */
export const comparisonAllowedForms: readonly RegExp[] = Object.freeze([
  /\d+ dB quieter on your left than on your right/g,
  /\d+ dB quieter on your right than on your left/g,
  /\d+ dB quieter than your calibration/g,
  /\d+ dB louder than your calibration/g,
  /as loud as your calibration/g,
  /Quieter than this house can whisper/g,
  /\d+ dB quieter on the left/g,
  /\d+ dB quieter on the right/g,
  /more than \d+(?:\.\d+)? percent of the times I made no sound/g,
  /The quietest sounds you caught/g,
  /The quietest sound you caught here/g,
  /the loudest sound the house may play here/g,
  /as many as the house keeps/g,
]);

/** Words that would compare, rank, average or sum floors (CP2). */
export const comparisonWords: readonly string[] = Object.freeze([
  "than",
  "more",
  "less",
  "fewer",
  "most",
  "least",
  "better",
  "worse",
  "best",
  "worst",
  "higher",
  "lower",
  "highest",
  "lowest",
  "deeper",
  "shallower",
  "deepest",
  "quieter",
  "louder",
  "quietest",
  "loudest",
  "average",
  "mean",
  "median",
  "total",
  "overall",
  "sum",
  "combined",
  "altogether",
  "together",
  "rank",
  "ranked",
  "compare",
  "compared",
  "comparison",
  "floors",
]);

/** The text with every allowed form of CP2 removed. */
export function withoutAllowedForms(text: string): string {
  return comparisonAllowedForms.reduce(
    (rest, form) => rest.replace(form, " "),
    text,
  );
}

/** Whether `text` holds `word` as a whole word, in any letter case. */
export function holdsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}

/** The words of `words` that `text` holds as whole words. */
export function wordsHeld(text: string, words: readonly string[]): string[] {
  return words.filter((word) => holdsWord(text, word));
}

/** The room names of the house. */
export const allRoomNames: readonly string[] = Object.freeze(
  Object.values(roomNames),
);

/** Every pitch label in `text`, such as "500 Hz" or "4 kHz". */
export function pitchLabelsIn(text: string): string[] {
  return [...text.matchAll(/(?<![\d.])\d+(?:\.\d+)? k?Hz/g)].map(
    (match) => match[0],
  );
}

/** Every number in `text`, as written: whole numbers and numbers with a decimal point. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

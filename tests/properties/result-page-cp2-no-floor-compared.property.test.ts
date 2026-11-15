import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resultPageConfig } from "../../src/config/result-page-config";
import { pitchLabel, roomNames } from "../../src/copy/room-copy";
import type {
  ResultPicture,
  SavedVisitList,
  VisitSummary,
} from "../../src/session/result-page-types";
import { resultPicture } from "../../src/session/result-picture";
import type { VisitEarResult } from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";
import {
  listScenarioArbitrary,
  pictureInputWithEarlierArbitrary,
  playListScenario,
} from "./result-page-arbitraries";
import {
  allRoomNames,
  comparisonWords,
  holdsWord,
  listTexts,
  numbersIn,
  outcomeTexts,
  pictureTexts,
  pitchLabelsIn,
  withoutAllowedForms,
  wordsHeld,
  type PlacedText,
} from "./result-page-text";

// CP2. No text compares floors (Universal; result-page design.md, CP2; R14; brief property "The
// picture never orders or connects floors"). For the inputs of CP1, with an earlier visit or none:
// a floor's strings name only its own room and pitch, the strings outside the floors name none, no
// string but the limits statement holds a word of comparison once the allowed forms are removed,
// every number is one the design allows in its place (the comparison line only the earlier
// visit's date), and the floors are in the order of the house.

/** Runs (design.md, "Run counts and time"). */
const runs = 1000;
const timeoutMs = 120_000;

/** The numbers of a "YYYY-MM-DD" date shown in words: its day and year. */
function shownDateNumbers(localDate: string): number[] {
  const [year, , day] = localDate.split("-").map(Number);
  return [day as number, year as number];
}

/** The number of a date's month, which only the image's file name shows. */
function monthNumber(localDate: string): number {
  return Number(localDate.split("-")[1]);
}

function wholeSize(valueDb: number): number {
  return Math.abs(Math.round(valueDb));
}

function foundSizes(...results: VisitEarResult[]): number[] {
  return results.flatMap((result) =>
    result.state === "found" ? [wholeSize(result.thresholdDb)] : [],
  );
}

/** The numbers allowed in each floor's strings: its pitch, its own found thresholds and its own difference. */
function floorNumbers(summary: VisitSummary): number[][] {
  return summary.rooms.map((room) => [
    ...numbersIn(pitchLabel(room.room.frequencyHz)),
    ...foundSizes(room.left, room.right),
    ...(room.rightMinusLeftDb === null
      ? []
      : [wholeSize(room.rightMinusLeftDb)]),
  ]);
}

/** The numbers allowed outside the floors of a picture. */
function pictureNumbers(summary: VisitSummary, localDate: string): number[] {
  return [
    summary.pooledFalseAlarmCount,
    summary.pooledNoSoundTrialCount,
    Math.round(summary.visitFalseAlarmRateLimitFraction * 1000) / 10,
    ...shownDateNumbers(localDate),
    summary.rooms.length,
  ];
}

const configCounts = [
  resultPageConfig.savedVisitsMaxCount,
  resultPageConfig.headphoneNameMaxCharacterCount,
];

/** The numbers allowed in a list's strings: its visits' dates and room counts, its unreadable count and the config's counts. */
function listNumbers(list: SavedVisitList): number[] {
  return [
    ...list.visits.flatMap((listing) => [
      ...shownDateNumbers(listing.visit.savedOnLocalDate),
      listing.visit.summary.rooms.length,
    ]),
    list.unreadableCount,
    ...configCounts,
  ];
}

/** The strings of `texts` that break a rule of CP2, each with its place and the rule. */
function floorFaults(
  picture: ResultPicture,
  summary: VisitSummary,
  localDate: string,
  earlierLocalDate: string | null,
  pictureTextList: readonly PlacedText[],
): string[] {
  const faults: string[] = [];
  const allowedInFloor = floorNumbers(summary);
  const allowedOutside = pictureNumbers(summary, localDate);
  for (const { place, text, floorIndex } of pictureTextList) {
    if (floorIndex !== null) {
      const floor = picture.floors[floorIndex];
      if (floor === undefined) {
        faults.push(`${place} belongs to no floor`);
        continue;
      }
      const ownName = roomNames[floor.room.roomId];
      for (const name of allRoomNames) {
        if (name !== ownName && holdsWord(text, name)) {
          faults.push(`${place} names another room, ${name}: ${text}`);
        }
      }
      for (const label of pitchLabelsIn(text)) {
        if (label !== floor.pitchLabel) {
          faults.push(`${place} names another pitch, ${label}: ${text}`);
        }
      }
      for (const number of numbersIn(text)) {
        if (!(allowedInFloor[floorIndex] ?? []).includes(number)) {
          faults.push(
            `${place} holds a number not its own, ${String(number)}: ${text}`,
          );
        }
      }
    } else {
      // The comparison line shows the earlier visit's date and no other number.
      const allowed = place.endsWith(".comparison.line")
        ? earlierLocalDate === null
          ? []
          : shownDateNumbers(earlierLocalDate)
        : place.endsWith(".imageFileBaseName")
          ? [...allowedOutside, monthNumber(localDate)]
          : allowedOutside;
      for (const number of numbersIn(text)) {
        if (!allowed.includes(number)) {
          faults.push(
            `${place} holds a number the design does not allow, ${String(number)}: ${text}`,
          );
        }
      }
    }
  }
  return faults;
}

/** The faults of a string outside the floors, or of any string, that CP2 checks everywhere. */
function textFaults(texts: readonly PlacedText[]): string[] {
  const faults: string[] = [];
  for (const { place, text, floorIndex, inLimitsStatement } of texts) {
    if (floorIndex === null) {
      for (const name of allRoomNames) {
        if (holdsWord(text, name)) {
          faults.push(
            `${place} names a room outside the floors, ${name}: ${text}`,
          );
        }
      }
      for (const label of pitchLabelsIn(text)) {
        faults.push(
          `${place} names a pitch outside the floors, ${label}: ${text}`,
        );
      }
    }
    if (!inLimitsStatement) {
      const words = wordsHeld(withoutAllowedForms(text), comparisonWords);
      if (words.length > 0) {
        faults.push(
          `${place} holds a word of comparison (${words.join(", ")}): ${text}`,
        );
      }
    }
  }
  return faults;
}

describe("result page CP2. No text compares floors (Universal; R14)", () => {
  it(
    "names only a floor's own room and pitch in it, compares nothing, holds only allowed numbers, and keeps the house's order",
    () => {
      fc.assert(
        fc.property(
          pictureInputWithEarlierArbitrary,
          listScenarioArbitrary,
          (drawnInput, scenario) => {
            const picture = resultPicture(drawnInput.input);
            const { summary } = drawnInput.drawn.visit;
            const texts = pictureTexts(picture);
            expect(
              floorFaults(
                picture,
                summary,
                drawnInput.localDate,
                drawnInput.input.earlierVisit?.savedOnLocalDate ?? null,
                texts,
              ),
            ).toEqual([]);

            const run = playListScenario(scenario);
            const listFaults: string[] = [];
            run.lists.forEach((list, index) => {
              const allowed = listNumbers(list);
              for (const { place, text } of listTexts(
                list,
                `lists[${String(index)}]`,
              )) {
                for (const number of numbersIn(text)) {
                  if (!allowed.includes(number)) {
                    listFaults.push(
                      `${place} holds a number the design does not allow, ${String(number)}: ${text}`,
                    );
                  }
                }
              }
            });
            const outcomeTextList = run.outcomes.flatMap((outcome, index) =>
              outcomeTexts(outcome, `outcomes[${String(index)}]`),
            );
            for (const { place, text } of outcomeTextList) {
              for (const number of numbersIn(text)) {
                if (!configCounts.includes(number)) {
                  listFaults.push(
                    `${place} holds a number the design does not allow, ${String(number)}: ${text}`,
                  );
                }
              }
            }
            expect(listFaults).toEqual([]);

            expect(
              textFaults([
                ...texts,
                ...run.lists.flatMap((list, index) =>
                  listTexts(list, `lists[${String(index)}]`),
                ),
                ...outcomeTextList,
              ]),
            ).toEqual([]);

            const visitType = drawnInput.drawn.visit.visitLog.visitType;
            expect(picture.floors.map((floor) => floor.room)).toEqual(
              summary.rooms.map((room) => room.room),
            );
            expect(picture.floors.map((floor) => floor.room)).toEqual(
              visitRooms(visitType),
            );
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

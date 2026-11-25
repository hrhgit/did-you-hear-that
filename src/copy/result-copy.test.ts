import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import type { VisitType } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import * as comparisonLinesModule from "./comparison-lines";
import {
  comparisonCopy,
  earlierVisitLine,
  earlierVisitUnreliableLine,
} from "./comparison-lines";
import { findBannedTerms } from "./find-banned-terms";
import * as resultPage from "./result-page-copy";
import { resultPageCopy } from "./result-page-copy";
import * as resultLinesModule from "./result-lines";
import type {
  UnreliableReasonName,
  WingStateName,
  WingWords,
} from "./result-lines";
import {
  differenceLabel,
  differenceLine,
  falseAlarmLine,
  floorDescription,
  playableFloorLine,
  swappedRepeatLine,
  unreliableReasonLine,
  visitNoticeLine,
  wingLine,
} from "./result-lines";
import * as savedVisitLinesModule from "./saved-visit-lines";
import type { DeleteRefusalName, SaveRefusalName } from "./saved-visit-lines";
import {
  deleteRefusedLine,
  deleteVisitLabel,
  imageCaption,
  imageFileBaseName,
  saveRefusedLine,
  unreadableEntriesLine,
  visitDateLabel,
  visitTypeLabel,
} from "./saved-visit-lines";

// The copy of the result page (result-page design.md, "The copy" and "The copy tests").

/** Every string reachable from a module's exports, with the path to it. */
function stringsOf(
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

const constantStrings = [
  ...stringsOf("resultPage", resultPage),
  ...stringsOf("resultLines", resultLinesModule),
  ...stringsOf("savedVisitLines", savedVisitLinesModule),
  ...stringsOf("comparisonLines", comparisonLinesModule),
];

const wingStates: readonly WingStateName[] = [
  "found",
  "betterThanFloor",
  "worseThanCap",
  "unreliable",
];
const reasons: readonly UnreliableReasonName[] = [
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
  "levelNotAsAsked",
  "visitFalseAlarmRate",
];
const saveRefusals: readonly SaveRefusalName[] = [
  "robotMode",
  "unavailable",
  "unreadable",
  "refused",
  "full",
  "tooMany",
  "nameTooLong",
];
const deleteRefusals: readonly DeleteRefusalName[] = [
  "robotMode",
  "unavailable",
  "unreadable",
  "refused",
  "notFound",
];
const visitTypes: readonly VisitType[] = ["full"];
const differences = [-40, -15, -0.4, 0, 0.4, 15, 40];
const thresholds = [-70, -35, -12.6, -0.4, 0, 0.4, 5, 15];
const counts = [0, 1, 2, 3, 9, 21];
const limits = [0.15, 0.2, 0.25, 0.125, 0.05, 0.3, 1];
const dates = [
  "2026-01-01",
  "2026-01-31",
  "2026-02-28",
  "2028-02-29",
  "2026-04-30",
  "2026-06-30",
  "2026-11-20",
  "2026-12-31",
  "2027-01-01",
  "2030-12-31",
];
const roomCounts = [1, 3, 5];
const frequencies = [500, 1000, 2000, 4000, 8000];

const found = (thresholdDb: number): WingWords => ({
  state: "found",
  thresholdDb,
  reasons: [],
});
const betterThanFloor: WingWords = {
  state: "betterThanFloor",
  thresholdDb: null,
  reasons: [],
};
const worseThanCap: WingWords = {
  state: "worseThanCap",
  thresholdDb: null,
  reasons: [],
};
const unreliable = (...why: UnreliableReasonName[]): WingWords => ({
  state: "unreliable",
  thresholdDb: null,
  reasons: why,
});

/** Every wing the representative inputs use. */
const representativeWings: readonly WingWords[] = [
  ...thresholds.map(found),
  betterThanFloor,
  worseThanCap,
  unreliable(),
  ...reasons.map((reason) => unreliable(reason)),
  unreliable("trialLimit", "levelNotAsAsked", "visitFalseAlarmRate"),
];

/** The output of every function for the representative inputs of the design. */
function representativeOutputs(): string[] {
  const outputs: string[] = [];
  for (const noSoundTrialCount of counts) {
    for (let falseAlarms = 0; falseAlarms <= noSoundTrialCount; falseAlarms++) {
      outputs.push(falseAlarmLine(falseAlarms, noSoundTrialCount));
    }
  }
  outputs.push(...limits.map(visitNoticeLine));
  outputs.push(...representativeWings.map(wingLine));
  outputs.push(...reasons.map(unreliableReasonLine));
  for (const difference of [null, ...differences]) {
    outputs.push(differenceLabel(difference), differenceLine(difference));
  }
  outputs.push(...differences.map(swappedRepeatLine));
  for (const [index, roomId] of ghostSoundIds.entries()) {
    const frequencyHz = frequencies[index];
    for (const left of representativeWings) {
      for (const right of representativeWings) {
        const difference =
          left.state === "found" && right.state === "found"
            ? (right.thresholdDb as number) - (left.thresholdDb as number)
            : null;
        outputs.push(
          floorDescription(roomId, frequencyHz, left, right, difference),
        );
      }
    }
  }
  for (const date of dates) {
    outputs.push(visitDateLabel(date), imageFileBaseName(date));
    outputs.push(earlierVisitLine(date), earlierVisitUnreliableLine(date));
    for (const visitType of visitTypes) {
      for (const roomCount of roomCounts) {
        outputs.push(
          visitTypeLabel(visitType, roomCount),
          imageCaption(date, visitType, roomCount),
          deleteVisitLabel(date, visitType, roomCount),
        );
      }
    }
  }
  for (const reason of saveRefusals) {
    outputs.push(saveRefusedLine(reason));
    outputs.push(
      saveRefusedLine(reason, {
        savedVisitsMaxCount: 10,
        headphoneNameMaxCharacterCount: 24,
      }),
    );
    outputs.push(
      saveRefusedLine(reason, {
        savedVisitsMaxCount: 50,
        headphoneNameMaxCharacterCount: 80,
      }),
    );
  }
  outputs.push(...deleteRefusals.map(deleteRefusedLine));
  outputs.push(...[1, 2, 3, 9, 21].map(unreadableEntriesLine));
  return outputs;
}

/** What may follow a number of decibels (result-page design.md, CP1). */
const decibelEndings = [
  " quieter than your calibration",
  " louder than your calibration",
  " quieter on the left",
  " quieter on the right",
  " quieter on your left than on your right",
  " quieter on your right than on your left",
  " apart here",
];

/** The numbers of decibels in `text` that are not followed by an allowed form. */
function unlabelledDecibels(text: string): string[] {
  if (text === "0 dB") {
    return [];
  }
  const unlabelled: string[] = [];
  for (const match of text.matchAll(/\d+ dB/g)) {
    const after = text.slice(match.index + match[0].length);
    if (!decibelEndings.some((ending) => after.startsWith(ending))) {
      unlabelled.push(`${match[0]}${after.slice(0, 30)}`);
    }
  }
  return unlabelled;
}

const accuracyWords =
  /\b(accurate|accuracy|precise|precision|exact|exactly|validated|verified|guaranteed|certain)\b/i;

const outputs = representativeOutputs();

describe("the result page's constant copy", () => {
  it("has strings to check", () => {
    expect(constantStrings.length).toBeGreaterThanOrEqual(30);
  });

  it.each(constantStrings)(
    "$path is non-empty, trimmed and uses no banned term",
    ({ text }) => {
      expect(text).not.toBe("");
      expect(text.trim()).toBe(text);
      expect(findBannedTerms(text, bannedTerms)).toEqual([]);
      expect(text).not.toMatch(accuracyWords);
    },
  );

  it("holds every fixed string of the design, word for word", () => {
    expect(resultPageCopy).toEqual({
      heading: "The quietest sounds you caught",
      leftLabel: "Left",
      rightLabel: "Right",
      differenceHeading: "Left and right",
      visitNoticeHeading: "This whole visit is unreliable",
      swappedRepeatButton: "Swap the headphones and visit this room again",
      savePictureButton: "Save picture",
      pictureNotSavedLine:
        "The picture could not be saved just now. Try again.",
      headphoneNameLabel: "Name your headphones, if you like.",
      saveButton: "Save this visit",
      notSavedLine: "Not saved yet. If you leave now, nothing is kept.",
      savedLine: "Saved in this browser. Nothing has left it.",
      renamedLine: "The name of the headphones was changed.",
      mayBeClearedLine: "Your browser may clear saved visits on its own.",
      savedVisitsHeading: "Visits saved in this browser",
      noSavedVisitsLine: "None yet.",
      headphonesLabel: "Headphones",
      unnamedHeadphonesLabel: "Not named",
      showButton: "Show its picture",
      backToThisVisitButton: "Back to this visit",
      deleteButton: "Delete",
      deleteAllButton: "Delete all saved visits",
      deleteAllQuestion: "Delete every saved visit? This cannot be undone.",
      deleteAllConfirmButton: "Delete them all",
      deleteAllCancelButton: "Keep them",
      deletedLine: "The visit was deleted.",
      allDeletedLine: "Every saved visit was deleted.",
      unavailableListLine:
        "This browser does not let the house keep visits, so none can be saved or shown here.",
      unreadableListLine:
        "The visits saved in this browser could not be read. Delete them all to save new ones.",
      robotModeLine: "Robot mode keeps nothing in this browser.",
    });
    expect(Object.isFrozen(resultPageCopy)).toBe(true);
  });
});

describe("falseAlarmLine", () => {
  it("gives the lines of the design", () => {
    expect(falseAlarmLine(2, 9)).toBe(
      "You answered 2 of 9 times when I made no sound.",
    );
    expect(falseAlarmLine(0, 2)).toBe(
      "You answered 0 of 2 times when I made no sound.",
    );
    expect(falseAlarmLine(0, 1)).toBe(
      "I made no sound once, and you did not answer.",
    );
    expect(falseAlarmLine(1, 1)).toBe(
      "I made no sound once, and you answered.",
    );
    expect(falseAlarmLine(0, 0)).toBe(
      "I made a sound every time on this visit.",
    );
  });

  it("refuses counts that do not fit", () => {
    for (const [falseAlarms, noSoundTrials] of [
      [-1, 3],
      [1, -1],
      [1.5, 3],
      [1, 3.5],
      [4, 3],
      [1, 0],
      [Number.NaN, 3],
      [1, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(
        () => falseAlarmLine(falseAlarms, noSoundTrials),
        `${String(falseAlarms)} of ${String(noSoundTrials)}`,
      ).toThrow(RangeError);
    }
  });
});

describe("visitNoticeLine", () => {
  const line = (percent: string): string =>
    `You answered more than ${percent} percent of the times I made no sound, so this visit cannot show what you caught. Walk through the house again, and answer only when you hear something.`;

  it("names the limit as a percentage to one decimal place, without a trailing .0", () => {
    expect(visitNoticeLine(0.2)).toBe(line("20"));
    expect(visitNoticeLine(0.15)).toBe(line("15"));
    expect(visitNoticeLine(0.25)).toBe(line("25"));
    expect(visitNoticeLine(0.125)).toBe(line("12.5"));
    expect(visitNoticeLine(0.3)).toBe(line("30"));
    expect(visitNoticeLine(1)).toBe(line("100"));
  });

  it("refuses a limit outside (0, 1]", () => {
    for (const bad of [0, -0.2, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => visitNoticeLine(bad), String(bad)).toThrow(RangeError);
    }
  });
});

describe("wingLine", () => {
  it("gives the line of each state", () => {
    expect(wingLine(found(-35))).toBe(
      "The quietest sound you caught here was 35 dB quieter than your calibration.",
    );
    expect(wingLine(found(5))).toBe(
      "The quietest sound you caught here was 5 dB louder than your calibration.",
    );
    expect(wingLine(found(0))).toBe(
      "The quietest sound you caught here was as loud as your calibration.",
    );
    expect(wingLine(betterThanFloor)).toBe(
      "Quieter than this house can whisper.",
    );
    expect(wingLine(worseThanCap)).toBe(
      "You did not catch the loudest sound the house may play here.",
    );
    expect(wingLine(unreliable("trialLimit"))).toBe(
      "This room should be visited again.",
    );
  });

  it("always labels a found level as relative to the visitor's own calibration", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 200, noNaN: true }),
        (thresholdDb) => {
          const text = wingLine(found(thresholdDb));
          expect(text).toMatch(/your calibration\.$/);
          expect(text).not.toMatch(/-|−/);
          expect(unlabelledDecibels(text)).toEqual([]);
        },
      ),
    );
  });

  it("refuses a wing whose fields do not fit its state", () => {
    const bad: WingWords[] = [
      { state: "found", thresholdDb: null, reasons: [] },
      { state: "found", thresholdDb: Number.NaN, reasons: [] },
      { state: "found", thresholdDb: -20, reasons: ["trialLimit"] },
      { state: "betterThanFloor", thresholdDb: -70, reasons: [] },
      { state: "worseThanCap", thresholdDb: null, reasons: ["trialLimit"] },
      {
        state: "unreliable",
        thresholdDb: null,
        reasons: ["unknown" as UnreliableReasonName],
      },
      { state: "unknown" as WingStateName, thresholdDb: null, reasons: [] },
    ];
    for (const wing of bad) {
      expect(() => wingLine(wing), JSON.stringify(wing)).toThrow(RangeError);
    }
  });
});

describe("unreliableReasonLine", () => {
  it("gives the line of each reason", () => {
    expect(reasons.map(unreliableReasonLine)).toEqual([
      "Your answers here had not settled when the house ran out of tries.",
      "One catch here did not fit with your other answers.",
      "In this room you often answered when I made no sound.",
      "A sound here was not played at the level the house asked for.",
      "On this visit you often answered when I made no sound.",
    ]);
  });

  it("refuses an unknown reason", () => {
    expect(() =>
      unreliableReasonLine("unknown" as UnreliableReasonName),
    ).toThrow(RangeError);
  });
});

describe("differenceLabel and differenceLine", () => {
  it("give a dash and a sentence without a difference", () => {
    expect(differenceLabel(null)).toBe("–");
    expect(differenceLine(null)).toBe(
      "There is no left and right difference to show here, because one side has no level.",
    );
  });

  it("give 0 dB and the same level for a difference that rounds to 0", () => {
    for (const difference of [0, -0, 0.4, -0.4]) {
      expect(differenceLabel(difference)).toBe("0 dB");
      expect(differenceLine(difference)).toBe(
        "At this pitch you caught the same level on your left and on your right.",
      );
    }
  });

  it("name the side the quieter sound was caught on, in whole decibels", () => {
    expect(differenceLabel(15)).toBe("15 dB quieter on the left");
    expect(differenceLabel(-15)).toBe("15 dB quieter on the right");
    expect(differenceLabel(14.6)).toBe("15 dB quieter on the left");
    expect(differenceLine(15)).toBe(
      "At this pitch you caught a sound 15 dB quieter on your left than on your right.",
    );
    expect(differenceLine(-40)).toBe(
      "At this pitch you caught a sound 40 dB quieter on your right than on your left.",
    );
  });

  it("refuse a difference that is not finite", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => differenceLabel(bad)).toThrow(RangeError);
      expect(() => differenceLine(bad)).toThrow(RangeError);
    }
  });
});

describe("swappedRepeatLine", () => {
  const line = (size: number): string =>
    `Your left and right are ${String(size)} dB apart here. A swap tells whether the difference stays with your ears or moves with the headphones.`;

  it("gives the size of the difference whichever side is quieter", () => {
    expect(swappedRepeatLine(15)).toBe(line(15));
    expect(swappedRepeatLine(-15)).toBe(line(15));
    expect(swappedRepeatLine(-24.6)).toBe(line(25));
  });

  it("refuses a difference that is not finite", () => {
    expect(() => swappedRepeatLine(Number.NaN)).toThrow(RangeError);
    expect(() => swappedRepeatLine(Number.NEGATIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("floorDescription", () => {
  it("gives the example of the design", () => {
    expect(
      floorDescription(
        "stairs",
        4000,
        found(-35),
        unreliable("inconsistentCatch", "visitFalseAlarmRate"),
        null,
      ),
    ).toBe(
      "Scritch, 4 kHz. Left: The quietest sound you caught here was 35 dB quieter than your calibration. Right: This room should be visited again. One catch here did not fit with your other answers. There is no left and right difference to show here, because one side has no level.",
    );
  });

  it("gives both levels and the difference when both wings are found", () => {
    expect(floorDescription("cellar", 500, found(-20), found(-5), 15)).toBe(
      "Thump, 500 Hz. Left: The quietest sound you caught here was 20 dB quieter than your calibration. Right: The quietest sound you caught here was 5 dB quieter than your calibration. At this pitch you caught a sound 15 dB quieter on your left than on your right.",
    );
  });

  it("gives the line of each state without a number when a wing has none", () => {
    expect(
      floorDescription("attic", 8000, betterThanFloor, worseThanCap, null),
    ).toBe(
      "Squeak, 8 kHz. Left: Quieter than this house can whisper. Right: You did not catch the loudest sound the house may play here. There is no left and right difference to show here, because one side has no level.",
    );
  });

  it("refuses a room, a pitch or a difference that does not fit", () => {
    expect(() =>
      floorDescription("roof" as GhostSoundId, 1000, found(-20), found(-20), 0),
    ).toThrow(RangeError);
    expect(() =>
      floorDescription("corridor", 0, found(-20), found(-20), 0),
    ).toThrow(RangeError);
    expect(() =>
      floorDescription("corridor", 1000, found(-20), found(-20), null),
    ).toThrow(RangeError);
    expect(() =>
      floorDescription("corridor", 1000, found(-20), worseThanCap, 10),
    ).toThrow(RangeError);
    expect(() =>
      floorDescription("corridor", 1000, found(-20), found(-5), Number.NaN),
    ).toThrow(RangeError);
  });
});

describe("visitDateLabel, imageFileBaseName and imageCaption", () => {
  it("write the date in English with no leading zero on the day", () => {
    expect(visitDateLabel("2026-11-20")).toBe("20 November 2026");
    expect(visitDateLabel("2027-01-05")).toBe("5 January 2027");
    expect(visitDateLabel("2026-12-31")).toBe("31 December 2026");
    expect(visitDateLabel("2028-02-29")).toBe("29 February 2028");
    expect(dates.map(visitDateLabel)).toEqual([
      "1 January 2026",
      "31 January 2026",
      "28 February 2026",
      "29 February 2028",
      "30 April 2026",
      "30 June 2026",
      "20 November 2026",
      "31 December 2026",
      "1 January 2027",
      "31 December 2030",
    ]);
  });

  it("name the image file and caption the image", () => {
    expect(imageFileBaseName("2026-11-20")).toBe(
      "did-you-hear-that-2026-11-20",
    );
    expect(imageCaption("2026-11-20", "full", 3)).toBe(
      "Did You Hear That? A first listen on 20 November 2026. Full visit, 3 rooms.",
    );
  });

  it("refuse a date that is not a calendar date", () => {
    for (const bad of [
      "",
      "2026-11-31",
      "2026-02-29",
      "2100-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-11-00",
      "2026-1-05",
      "20 November 2026",
      "2026-11-20T00:00",
      " 2026-11-20",
    ]) {
      expect(() => visitDateLabel(bad), bad).toThrow(RangeError);
      expect(() => imageFileBaseName(bad), bad).toThrow(RangeError);
      expect(() => imageCaption(bad, "full", 5), bad).toThrow(RangeError);
      expect(() => deleteVisitLabel(bad, "full", 5), bad).toThrow(RangeError);
    }
    expect(visitDateLabel("2000-02-29")).toBe("29 February 2000");
  });
});

describe("visitTypeLabel and deleteVisitLabel", () => {
  it("name the visit by its number of rooms", () => {
    expect(visitTypeLabel("full", 3)).toBe("Full visit, 3 rooms");
    expect(visitTypeLabel("full", 5)).toBe("Full visit, 5 rooms");
    expect(visitTypeLabel("full", 1)).toBe("Full visit, 1 room");
  });

  it("names the delete control of one visit", () => {
    expect(deleteVisitLabel("2026-11-20", "full", 5)).toBe(
      "Delete the visit of 20 November 2026, full visit, 5 rooms",
    );
    expect(deleteVisitLabel("2026-11-20", "full", 3)).toBe(
      "Delete the visit of 20 November 2026, full visit, 3 rooms",
    );
  });

  it("refuse a room count below 1 or not whole, and an unknown visit type", () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(() => visitTypeLabel("full", bad), String(bad)).toThrow(
        RangeError,
      );
      expect(() => imageCaption("2026-11-20", "full", bad)).toThrow(RangeError);
      expect(() => deleteVisitLabel("2026-11-20", "full", bad)).toThrow(
        RangeError,
      );
    }
    expect(() => visitTypeLabel("medium" as VisitType, 3)).toThrow(RangeError);
  });
});

describe("saveRefusedLine and deleteRefusedLine", () => {
  it("give the line of each save refusal, with the limits of the config", () => {
    expect(saveRefusals.map((reason) => saveRefusedLine(reason))).toEqual([
      "Robot mode keeps nothing in this browser.",
      "This browser does not let the house save visits. The picture stays here until you leave the page.",
      "The visits already saved in this browser could not be read. Delete them all, then save again.",
      "This browser would not save the visit. The picture stays here until you leave the page.",
      "This browser has no room left to save the visit. Delete a saved visit, then save again.",
      "20 visits are saved, as many as the house keeps. Delete one, then save again.",
      "The name can have up to 40 characters.",
    ]);
  });

  it("take the two limits as settings", () => {
    const settings = {
      savedVisitsMaxCount: 10,
      headphoneNameMaxCharacterCount: 24,
    };
    expect(saveRefusedLine("tooMany", settings)).toBe(
      "10 visits are saved, as many as the house keeps. Delete one, then save again.",
    );
    expect(saveRefusedLine("nameTooLong", settings)).toBe(
      "The name can have up to 24 characters.",
    );
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(() =>
        saveRefusedLine("tooMany", { ...settings, savedVisitsMaxCount: bad }),
      ).toThrow(RangeError);
      expect(() =>
        saveRefusedLine("nameTooLong", {
          ...settings,
          headphoneNameMaxCharacterCount: bad,
        }),
      ).toThrow(RangeError);
    }
  });

  it("give the line of each delete refusal", () => {
    expect(deleteRefusals.map(deleteRefusedLine)).toEqual([
      "Robot mode keeps nothing in this browser.",
      "This browser does not let the house delete saved visits just now.",
      "The saved visits could not be read, so one cannot be deleted on its own. Delete them all instead.",
      "This browser would not delete the visit just now. Try again.",
      "That visit is no longer saved in this browser.",
    ]);
  });

  it("refuse an unknown refusal", () => {
    expect(() => saveRefusedLine("lost" as SaveRefusalName)).toThrow(
      RangeError,
    );
    expect(() => deleteRefusedLine("lost" as DeleteRefusalName)).toThrow(
      RangeError,
    );
  });
});

describe("unreadableEntriesLine", () => {
  it("gives the line for one and for several", () => {
    expect(unreadableEntriesLine(1)).toBe(
      "1 saved visit could not be read and is not shown. Deleting all saved visits removes it.",
    );
    expect(unreadableEntriesLine(3)).toBe(
      "3 saved visits could not be read and are not shown. Deleting all saved visits removes them.",
    );
  });

  it("refuses a count below 1 or not whole", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => unreadableEntriesLine(bad), String(bad)).toThrow(RangeError);
    }
  });
});

describe("the comparison's copy", () => {
  it("holds the fixed strings of the design, word for word", () => {
    expect(comparisonCopy).toEqual({
      headphoneNameHint:
        "Use the same name next time, and this visit is drawn there as faint outlines.",
      noEarlierVisitLine:
        "No earlier visit with headphones of this name is saved in this browser.",
    });
    expect(Object.isFrozen(comparisonCopy)).toBe(true);
  });

  it("names the earlier visit's date and says each visit is relative to its own calibration", () => {
    expect(earlierVisitLine("2026-11-12")).toBe(
      "The faint outlines are your visit of 12 November 2026 with headphones of the same name. Each visit is relative to its own calibration.",
    );
    expect(earlierVisitLine("2027-01-01")).toBe(
      "The faint outlines are your visit of 1 January 2027 with headphones of the same name. Each visit is relative to its own calibration.",
    );
  });

  it("says that an earlier visit unreliable as a whole has no outlines", () => {
    expect(earlierVisitUnreliableLine("2026-11-12")).toBe(
      "Your visit of 12 November 2026 with headphones of the same name was unreliable as a whole, so it has no outlines.",
    );
  });

  it("refuses a date that is not a calendar date", () => {
    for (const bad of [
      "",
      "2026-11-31",
      "2026-02-29",
      "2026-13-01",
      "12 November 2026",
      "2026-1-5",
    ]) {
      expect(() => earlierVisitLine(bad), bad).toThrow(RangeError);
      expect(() => earlierVisitUnreliableLine(bad), bad).toThrow(RangeError);
    }
  });
});

describe("the output of every function for the representative inputs", () => {
  it("has outputs to check, from wings in every state", () => {
    expect(outputs.length).toBeGreaterThan(1000);
    expect(new Set(representativeWings.map((wing) => wing.state))).toEqual(
      new Set(wingStates),
    );
  });

  it("is non-empty, trimmed and uses no banned term", () => {
    for (const text of outputs) {
      expect(text, JSON.stringify(text)).not.toBe("");
      expect(text.trim(), JSON.stringify(text)).toBe(text);
      expect(findBannedTerms(text, bannedTerms), text).toEqual([]);
    }
  });

  it("says nothing about accuracy", () => {
    for (const text of outputs) {
      expect(text).not.toMatch(accuracyWords);
    }
  });

  it("labels every level as relative to the visitor's own calibration", () => {
    for (const text of outputs) {
      expect(unlabelledDecibels(text), text).toEqual([]);
      for (const match of text.matchAll(/\d+ dB (quieter|louder)(?! on )/g)) {
        expect(
          text
            .slice(match.index)
            .startsWith(`${match[0]} than your calibration`),
          text,
        ).toBe(true);
      }
    }
  });
});

describe("playableFloorLine (audible-start R22)", () => {
  it("names each side, in either order, and is null for none", () => {
    expect(playableFloorLine([])).toBeNull();
    expect(playableFloorLine(["left"])).toMatch(/^On your left side, /);
    expect(playableFloorLine(["right"])).toMatch(/^On your right side, /);
    expect(playableFloorLine(["right", "left"])).toBe(
      playableFloorLine(["left", "right"]),
    );
    expect(playableFloorLine(["left", "right"])).toMatch(/^On both sides, /);
  });

  it("says the house stops there at this volume, names wireless headphones, and asks nothing", () => {
    for (const sides of [["left"], ["right"], ["left", "right"]] as const) {
      const line = playableFloorLine(sides) ?? "";
      expect(line).toContain(
        "as quiet as the house can play through these headphones at this volume",
      );
      expect(line).toContain("Wireless headphones");
      expect(line).not.toMatch(/Bluetooth|\?/);
      expect(findBannedTerms(line, bannedTerms)).toEqual([]);
      expect(line.trim()).toBe(line);
    }
  });
});

import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { findBannedTerms } from "../copy/find-banned-terms";
import { limitsStatement } from "../copy/limits-statement";
import { closeLine, resultFocusCopy } from "../copy/result-focus-copy";
import { outcomeLines } from "../copy/swapped-repeat-lines";
import type { ResultPicture, VisitToSave } from "./result-page-types";
import { resultFocus, type ResultFocus } from "./result-focus";
import { resultPicture } from "./result-picture";
import { summarizeVisit } from "./summarize-visit";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  SwappedRepeatComparison,
  SwappedRepeatOutcome,
  VisitLog,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Summaries made with summarizeVisit from hand-built visit logs, as in result-picture.test.ts. Only
// the fields the summary reads carry meaning; the rest are filled with plausible values.

const counts = {
  presentationCount: 12,
  catchCount: 6,
  wrongSideCount: 1,
  missCount: 5,
};

function found(thresholdDb: number): LoggedEarResult {
  return { ...counts, state: "found", thresholdDb };
}
const betterThanFloor: LoggedEarResult = {
  ...counts,
  state: "betterThanFloor",
};
const worseThanCap: LoggedEarResult = { ...counts, state: "worseThanCap" };
const unreliable: LoggedEarResult = {
  ...counts,
  state: "unreliable",
  reasons: ["trialLimit"],
};

interface RoomPlan {
  readonly left: LoggedEarResult;
  readonly right: LoggedEarResult;
  readonly falseAlarmCount?: number;
  readonly searchFloorDb?: number;
}

const noSoundTrialCount = 7;

function attempt(roomIndex: number, plan: RoomPlan): LoggedRoomAttempt {
  const falseAlarmCount = plan.falseAlarmCount ?? 0;
  const falseAlarmRateFraction = falseAlarmCount / noSoundTrialCount;
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 1000 + roomIndex,
    calibrationIndex: 0,
    searchCapDb: 15,
    ...(plan.searchFloorDb === undefined
      ? {}
      : { searchFloorDb: plan.searchFloorDb }),
    startedAtMs: 100000 * roomIndex,
    endedAtMs: 100000 * roomIndex + 90000,
    ending: "finished",
    result: {
      left: plan.left,
      right: plan.right,
      noSoundTrialCount,
      falseAlarmCount,
      falseAlarmRateFraction,
      falseAlarmRateAboveLimit:
        falseAlarmRateFraction >
        hearingMethodConfig.falseAlarmRateUnreliableAboveFraction,
    },
  };
}

/** A quick visit: the corridor, the stairs and the attic, from the bottom of the house up. */
function visitOf(plans: readonly [RoomPlan, RoomPlan, RoomPlan]): VisitToSave {
  const visitLog: VisitLog = {
    formatVersion: 1,
    visitType: "quick",
    visitSeed: 42,
    rooms: visitRooms("quick"),
    calibrations: [
      {
        calibrationIndex: 0,
        settingDb: -20,
        roomTopLevelDb: {
          cellar: 5,
          corridor: 5,
          nursery: 5,
          stairs: 5,
          attic: 5,
        },
        keptAtMs: 500,
        anchor: "music",
      },
    ],
    headphoneChecks: [],
    roomAttempts: plans.map((plan, roomIndex) => attempt(roomIndex, plan)),
    trials: [],
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
  return { visitLog, summary: summarizeVisit(visitLog) };
}

const close: RoomPlan = { left: found(-30), right: found(-25) };

/** A floor with its swapped repeat ended in `outcome`. The focus reads the outcome alone. */
function withRepeat(
  picture: ResultPicture,
  roomIndex: number,
  outcome: SwappedRepeatOutcome,
): ResultPicture {
  const repeat = { outcome } as SwappedRepeatComparison;
  return {
    ...picture,
    floors: picture.floors.map((floor) =>
      floor.room.roomIndex === roomIndex ? { ...floor, repeat } : floor,
    ),
  };
}

function focusOf(
  visit: VisitToSave,
  options: {
    readonly picture?: ResultPicture;
    readonly canStillSave?: boolean;
  } = {},
): ResultFocus {
  return resultFocus({
    picture:
      options.picture ??
      resultPicture({
        kind: "live",
        visit,
        localDate: "2026-11-17",
        earlierVisit: null,
      }),
    summary: visit.summary,
    floorDb: hearingMethodConfig.floorDb,
    swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
    canStillSave: options.canStillSave ?? true,
  });
}

function pictureOf(visit: VisitToSave): ResultPicture {
  return resultPicture({
    kind: "live",
    visit,
    localDate: "2026-11-17",
    earlierVisit: null,
  });
}

function wordsOf(focus: ResultFocus): string[] {
  return [
    focus.heading,
    focus.line,
    ...focus.points.flatMap((point) => [
      point.line,
      point.roomName,
      point.pitchLabel,
    ]),
  ];
}

describe("resultFocus", () => {
  describe("a whole visit to walk again", () => {
    it("puts the visit notice first and names no floor", () => {
      const guessed: RoomPlan = { ...close, falseAlarmCount: 2 };
      const visit = visitOf([
        guessed,
        { left: found(-50), right: found(-20), falseAlarmCount: 2 },
        guessed,
      ]);
      expect(visit.summary.visitFalseAlarmRateAboveLimit).toBe(true);
      const picture = pictureOf(visit);
      const focus = focusOf(visit, { picture });
      expect(focus).toEqual({
        kind: "walkAgain",
        heading: picture.visitNotice?.heading,
        line: picture.visitNotice?.line,
        points: [],
      });
    });
  });

  describe("no floor that stands out", () => {
    it("says left and right stayed close, and asks to save a visit not yet saved", () => {
      const focus = focusOf(visitOf([close, close, close]));
      expect(focus.kind).toBe("close");
      expect(focus.heading).toBe(resultFocusCopy.closeHeading);
      expect(focus.line).toBe(
        closeLine(hearingMethodConfig.swappedRepeatDifferenceDb, true),
      );
      expect(focus.line).toContain(resultFocusCopy.keepLine);
      expect(focus.points).toEqual([]);
    });

    it("leaves out the line about saving once the visit cannot be saved", () => {
      const focus = focusOf(visitOf([close, close, close]), {
        canStillSave: false,
      });
      expect(focus.line).toBe(
        "No floor showed a difference of 15 dB or more between your left and your right.",
      );
    });

    it("lets a difference just under the swap limit pass", () => {
      const focus = focusOf(
        visitOf([close, { left: found(-40), right: found(-26) }, close]),
      );
      expect(focus.kind).toBe("close");
    });

    it("lets both sides quieter than the house can whisper pass", () => {
      const focus = focusOf(
        visitOf([
          { left: betterThanFloor, right: betterThanFloor },
          close,
          close,
        ]),
      );
      expect(focus.kind).toBe("close");
    });
  });

  describe("one floor that stands out", () => {
    it("names left and right far apart from the swap limit on", () => {
      const focus = focusOf(
        visitOf([close, { left: found(-40), right: found(-25) }, close]),
      );
      expect(focus).toEqual({
        kind: "farApart",
        heading: "Your left and right were far apart on one floor",
        line: "Swapping the headphones and visiting that room again tells whether the difference stays with your ears or moves with the headphones.",
        points: [
          {
            kind: "farApart",
            roomId: "stairs",
            roomIndex: 1,
            roomName: "Stairs",
            pitchLabel: "4 kHz",
            line: "You caught a sound 15 dB quieter on your left than on your right.",
          },
        ],
      });
    });

    it("names the right as quieter when it is", () => {
      const focus = focusOf(
        visitOf([{ left: found(-20), right: found(-42) }, close, close]),
      );
      expect(focus.points[0]?.line).toBe(
        "You caught a sound 22 dB quieter on your right than on your left.",
      );
    });

    it("gives the least gap when one side was quieter than the house can whisper", () => {
      // The other side lies 20 dB above the quietest level the house plays.
      const focus = focusOf(
        visitOf([close, close, { left: betterThanFloor, right: found(-50) }]),
      );
      expect(focus.kind).toBe("farApart");
      expect(focus.points.map((point) => point.line)).toEqual([
        "You caught a sound at least 20 dB quieter on your left than on your right.",
      ]);
      const mirrored = focusOf(
        visitOf([close, close, { left: found(-50), right: betterThanFloor }]),
      );
      expect(mirrored.points[0]?.line).toBe(
        "You caught a sound at least 20 dB quieter on your right than on your left.",
      );
    });

    it("lets a least gap under the swap limit pass", () => {
      const focus = focusOf(
        visitOf([close, close, { left: betterThanFloor, right: found(-60) }]),
      );
      expect(focus.kind).toBe("close");
    });

    it("measures the least gap from the floor's own quietest level when it has one", () => {
      const focus = focusOf(
        visitOf([
          close,
          close,
          { left: betterThanFloor, right: found(-50), searchFloorDb: -60 },
        ]),
      );
      expect(focus.kind).toBe("close");
    });

    it("names a dark side, and either side when both stayed dark", () => {
      const one = focusOf(
        visitOf([close, { left: found(-30), right: worseThanCap }, close]),
      );
      expect(one.kind).toBe("dark");
      expect(one.heading).toBe("One side stayed dark");
      expect(one.points[0]?.line).toBe(
        "You did not catch the loudest sound the house may play on your right.",
      );
      const both = focusOf(
        visitOf([close, { left: worseThanCap, right: worseThanCap }, close]),
      );
      expect(both.heading).toBe("Some sides stayed dark");
      expect(both.points[0]?.line).toBe(
        "You did not catch the loudest sound the house may play on either side.",
      );
    });

    it("names a side with no level", () => {
      const focus = focusOf(
        visitOf([{ left: unreliable, right: found(-30) }, close, close]),
      );
      expect(focus.kind).toBe("unsettled");
      expect(focus.heading).toBe("The house found no level on one floor");
      expect(focus.points[0]?.line).toBe(
        "The house found no level on your left.",
      );
    });

    it("puts a dark side before a side with no level on the same floor", () => {
      const focus = focusOf(
        visitOf([close, { left: unreliable, right: worseThanCap }, close]),
      );
      expect(focus.points.map((point) => point.kind)).toEqual(["dark"]);
    });
  });

  describe("the swapped repeat of a floor", () => {
    const visit = visitOf([
      { left: found(-40), right: found(-20) },
      close,
      close,
    ]);

    it.each([
      [
        "followsEar",
        "followsEar",
        "A difference stayed with your ears",
        limitsStatement.sentences[3],
      ],
      [
        "followsEarpiece",
        "followsEarpiece",
        "The difference went with the headphones",
        outcomeLines("followsEarpiece", null)[0],
      ],
      [
        "unclear",
        "repeatUnclear",
        "The swap gave no clear answer",
        "With the headphones swapped, the answers did not point to your ears or to the headphones.",
      ],
    ] as const)(
      "speaks for the floor after a %s repeat, in place of its gap",
      (outcome, kind, heading, line) => {
        const focus = focusOf(visit, {
          picture: withRepeat(pictureOf(visit), 0, outcome),
        });
        expect(focus.kind).toBe(kind);
        expect(focus.heading).toBe(heading);
        expect(focus.line).toBe(line);
        expect(focus.points.map((point) => point.kind)).toEqual([kind]);
      },
    );
  });

  describe("more than one floor", () => {
    it("puts the most pressing kind first, then each kind from the top of the house down", () => {
      const visit = visitOf([
        { left: found(-40), right: found(-20) },
        { left: unreliable, right: found(-30) },
        { left: found(-45), right: found(-25) },
      ]);
      const focus = focusOf(visit);
      expect(focus.kind).toBe("farApart");
      expect(focus.heading).toBe(
        "Your left and right were far apart on 2 floors",
      );
      expect(focus.line).toContain("those rooms");
      expect(focus.points.map((point) => [point.kind, point.roomId])).toEqual([
        ["farApart", "attic"],
        ["farApart", "corridor"],
        ["unsettled", "stairs"],
      ]);
    });

    it("puts a floor whose difference stayed with the ears before a dark side", () => {
      const visit = visitOf([
        { left: found(-40), right: found(-20) },
        close,
        { left: found(-30), right: worseThanCap },
      ]);
      const focus = focusOf(visit, {
        picture: withRepeat(pictureOf(visit), 0, "followsEar"),
      });
      expect(focus.points.map((point) => point.kind)).toEqual([
        "followsEar",
        "dark",
      ]);
    });

    it("counts the dark sides of every dark floor for its heading", () => {
      const focus = focusOf(
        visitOf([
          { left: worseThanCap, right: found(-30) },
          close,
          { left: found(-30), right: worseThanCap },
        ]),
      );
      expect(focus.heading).toBe("Some sides stayed dark");
      expect(focus.points).toHaveLength(2);
    });
  });

  describe("its words", () => {
    it("uses no banned term in any focus", () => {
      const visits = [
        visitOf([close, close, close]),
        visitOf([
          { left: found(-40), right: found(-20) },
          { left: unreliable, right: worseThanCap },
          { left: betterThanFloor, right: found(-40) },
        ]),
      ];
      for (const visit of visits) {
        for (const canStillSave of [true, false]) {
          for (const text of wordsOf(focusOf(visit, { canStillSave }))) {
            expect(findBannedTerms(text, bannedTerms), text).toEqual([]);
          }
        }
      }
    });
  });

  describe("a pure function", () => {
    it("returns frozen data and the same focus for the same input", () => {
      const visit = visitOf([
        { left: found(-40), right: found(-20) },
        { left: unreliable, right: found(-30) },
        close,
      ]);
      const focus = focusOf(visit);
      expect(Object.isFrozen(focus)).toBe(true);
      expect(Object.isFrozen(focus.points)).toBe(true);
      expect(focus.points.every((point) => Object.isFrozen(point))).toBe(true);
      expect(focusOf(visit)).toEqual(focus);
    });
  });
});

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { limitsStatement } from "../copy/limits-statement";
import { resultPageCopy } from "../copy/result-page-copy";
import { lightDepthFraction } from "./light-depth-fraction";
import type {
  ResultPicture,
  SavedVisit,
  VisitToSave,
} from "./result-page-types";
import { resultPicture } from "./result-picture";
import { summarizeVisit } from "./summarize-visit";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  VisitLog,
  VisitTrial,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Summaries made with summarizeVisit from hand-built visit logs. Only the fields the summary reads
// carry meaning; the rest are filled with plausible values.

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
function unreliable(
  ...reasons: ("trialLimit" | "inconsistentCatch" | "falseAlarmRate")[]
): LoggedEarResult {
  return { ...counts, state: "unreliable", reasons };
}

interface RoomPlan {
  readonly left: LoggedEarResult;
  readonly right: LoggedEarResult;
  readonly noSoundTrialCount?: number;
  readonly falseAlarmCount?: number;
  readonly searchCapDb?: number;
}

function attempt(roomIndex: number, plan: RoomPlan): LoggedRoomAttempt {
  const noSoundTrialCount = plan.noSoundTrialCount ?? 7;
  const falseAlarmCount = plan.falseAlarmCount ?? 0;
  const falseAlarmRateFraction =
    noSoundTrialCount > 0 ? falseAlarmCount / noSoundTrialCount : 0;
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 1000 + roomIndex,
    calibrationIndex: 0,
    searchCapDb: plan.searchCapDb ?? 15,
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

/** A decided sound trial in this room played at another level than asked. */
function clampedTrial(roomIndex: number): VisitTrial {
  return {
    order: 1,
    roomIndex,
    attempt: 1,
    trialNumber: 1,
    gapBeforeMs: 2000,
    presentedAtMs: 2000,
    windowStartMs: 2050,
    kind: "sound",
    ear: "left",
    requestedLevelDb: 15,
    playedLevelDb: 10,
    clampLimit: "anchorCap",
    status: "scored",
    response: "left",
    outcome: "caught",
    answeredAtMs: 2700,
    responseTimeMs: 650,
    scoredAtMs: 2700,
  };
}

function makeLog(
  visitType: "quick" | "full",
  plans: readonly RoomPlan[],
  trials: readonly VisitTrial[] = [],
): VisitLog {
  return {
    formatVersion: 1,
    visitType,
    visitSeed: 42,
    rooms: visitRooms(visitType),
    calibrations: [],
    headphoneChecks: [],
    roomAttempts: plans.map((plan, roomIndex) => attempt(roomIndex, plan)),
    trials,
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
}

function visitOf(
  visitType: "quick" | "full",
  plans: readonly RoomPlan[],
  options: {
    readonly trials?: readonly VisitTrial[];
    readonly visitLimitFraction?: number;
  } = {},
): VisitToSave {
  const visitLog = makeLog(visitType, plans, options.trials);
  const summary =
    options.visitLimitFraction === undefined
      ? summarizeVisit(visitLog)
      : summarizeVisit(visitLog, {
          swappedRepeatDifferenceDb:
            hearingMethodConfig.swappedRepeatDifferenceDb,
          visitFalseAlarmRateUnreliableAboveFraction:
            options.visitLimitFraction,
        });
  return { visitLog, summary };
}

function live(visit: VisitToSave, localDate = "2026-11-20"): ResultPicture {
  return resultPicture({ kind: "live", visit, localDate, earlierVisit: null });
}

function savedVisitOf(
  visit: VisitToSave,
  change: Partial<SavedVisit> = {},
): SavedVisit {
  return {
    savedVisitId: "3f9a0c11",
    savedAtEpochMs: 1795180800000,
    savedOnLocalDate: "2026-11-12",
    visitType: visit.visitLog.visitType,
    headphoneName: "White earbuds",
    summary: visit.summary,
    visitLog: visit.visitLog,
    floorDb: hearingMethodConfig.floorDb,
    swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
    ...change,
  };
}

function saved(savedVisit: SavedVisit): ResultPicture {
  return resultPicture({ kind: "saved", savedVisit, earlierVisit: null });
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

/** One room of each kind: found on both sides 15 dB apart, the two ends, and an unreliable ear. */
const mixedQuick: readonly RoomPlan[] = [
  { left: found(-40), right: found(-25), falseAlarmCount: 1 },
  { left: betterThanFloor, right: worseThanCap },
  {
    left: unreliable("inconsistentCatch", "falseAlarmRate"),
    right: found(-30),
  },
];

describe("resultPicture", () => {
  describe("floors and closed rooms", () => {
    it("gives a quick visit three floors in visit order and the cellar and nursery closed", () => {
      const picture = live(visitOf("quick", mixedQuick));
      expect(picture.floors.map((floor) => floor.room)).toEqual(
        visitRooms("quick"),
      );
      expect(picture.floors.map((floor) => floor.roomName)).toEqual([
        "Corridor",
        "Stairs",
        "Attic",
      ]);
      expect(picture.floors.map((floor) => floor.pitchLabel)).toEqual([
        "1 kHz",
        "4 kHz",
        "8 kHz",
      ]);
      expect(picture.closedRoomIds).toEqual(["cellar", "nursery"]);
    });

    it("gives a long visit five floors from the cellar up and no closed room", () => {
      const plan: RoomPlan = { left: found(-20), right: found(-20) };
      const picture = live(visitOf("full", [plan, plan, plan, plan, plan]));
      expect(picture.floors.map((floor) => floor.room.roomId)).toEqual([
        "cellar",
        "corridor",
        "nursery",
        "stairs",
        "attic",
      ]);
      expect(picture.closedRoomIds).toEqual([]);
    });

    it("keeps the order of the house whatever the results", () => {
      const reversed = live(
        visitOf("quick", [
          { left: found(10), right: found(10) },
          { left: found(-30), right: found(-30) },
          { left: found(-65), right: found(-65) },
        ]),
      );
      expect(reversed.floors.map((floor) => floor.room.roomIndex)).toEqual([
        0, 1, 2,
      ]);
    });
  });

  describe("wings", () => {
    const picture = live(visitOf("quick", mixedQuick));
    const [first, second, third] = picture.floors;

    it("gives a found wing its level relative to the calibration and its depth on the floor's scale", () => {
      expect(first?.left).toEqual({
        ear: "left",
        state: "found",
        lightDepthFraction: lightDepthFraction(
          { ...counts, state: "found", thresholdDb: -40 },
          { searchCapDb: 15, floorDb: -70 },
        ),
        line: "The quietest sound you caught here was 40 dB quieter than your calibration.",
        reasonLine: null,
        earlier: null,
      });
      expect(first?.left.lightDepthFraction).toBeCloseTo(
        0.1 + (0.8 * 55) / 85,
        10,
      );
    });

    it("gives better than floor the far wall and its line", () => {
      expect(second?.left).toEqual({
        ear: "left",
        state: "betterThanFloor",
        lightDepthFraction: 1,
        line: "Quieter than this house can whisper.",
        reasonLine: null,
        earlier: null,
      });
    });

    it("gives worse than cap a dark wing and its line", () => {
      expect(second?.right).toEqual({
        ear: "right",
        state: "worseThanCap",
        lightDepthFraction: 0,
        line: "You did not catch the loudest sound the house may play here.",
        reasonLine: null,
        earlier: null,
      });
    });

    it("gives an unreliable wing no depth, its line and the line of its first reason", () => {
      expect(third?.left).toEqual({
        ear: "left",
        state: "unreliable",
        lightDepthFraction: null,
        line: "This room should be visited again.",
        reasonLine: "One catch here did not fit with your other answers.",
        earlier: null,
      });
    });

    it("gives levelNotAsAsked its reason line", () => {
      const clamped = live(
        visitOf("quick", mixedQuick, { trials: [clampedTrial(1)] }),
      );
      expect(clamped.floors[1]?.left.state).toBe("unreliable");
      expect(clamped.floors[1]?.left.reasonLine).toBe(
        "A sound here was not played at the level the house asked for.",
      );
    });

    it("draws each floor on its own loudest level", () => {
      const capped = live(
        visitOf("quick", [
          { left: found(-25), right: found(-25), searchCapDb: 0 },
          { left: found(-25), right: found(-25) },
          { left: found(-25), right: found(-25) },
        ]),
      );
      expect(capped.floors[0]?.left.lightDepthFraction).toBeCloseTo(
        0.1 + (0.8 * 25) / 70,
        10,
      );
      expect(capped.floors[1]?.left.lightDepthFraction).toBeCloseTo(
        0.1 + (0.8 * 40) / 85,
        10,
      );
    });

    it("describes each floor in words", () => {
      expect(third?.description).toBe(
        "Attic, 8 kHz. Left: This room should be visited again. One catch here did not fit with your other answers. Right: The quietest sound you caught here was 30 dB quieter than your calibration. There is no left and right difference to show here, because one side has no level.",
      );
    });
  });

  describe("left and right", () => {
    function floorWith(left: number, right: number) {
      return live(
        visitOf("quick", [
          { left: found(left), right: found(right) },
          { left: worseThanCap, right: found(-20) },
          { left: found(-20), right: found(-20) },
        ]),
      ).floors;
    }

    it("gives a dash and its line when one side has no level", () => {
      const floor = floorWith(-20, -20)[1];
      expect(floor?.rightMinusLeftDb).toBeNull();
      expect(floor?.differenceLabel).toBe("–");
      expect(floor?.differenceLine).toBe(
        "There is no left and right difference to show here, because one side has no level.",
      );
    });

    it("gives 0 dB for the same level on both sides", () => {
      const floor = floorWith(-20, -20)[0];
      expect(floor?.rightMinusLeftDb).toBe(0);
      expect(floor?.differenceLabel).toBe("0 dB");
      expect(floor?.differenceLine).toBe(
        "On this floor you caught the same level on your left and on your right.",
      );
    });

    it("names the left for +15 dB", () => {
      const floor = floorWith(-40, -25)[0];
      expect(floor?.rightMinusLeftDb).toBe(15);
      expect(floor?.differenceLabel).toBe("15 dB quieter on the left");
      expect(floor?.differenceLine).toBe(
        "On this floor you caught a sound 15 dB quieter on your left than on your right.",
      );
    });

    it("names the right for −15 dB", () => {
      const floor = floorWith(-25, -40)[0];
      expect(floor?.rightMinusLeftDb).toBe(-15);
      expect(floor?.differenceLabel).toBe("15 dB quieter on the right");
      expect(floor?.differenceLine).toBe(
        "On this floor you caught a sound 15 dB quieter on your right than on your left.",
      );
    });
  });

  describe("the swapped repeat", () => {
    const visit = visitOf("quick", mixedQuick);

    it("is offered on a live picture where the summary offers it, with the room index, its line and its button", () => {
      expect(
        visit.summary.rooms.map((room) => room.swappedRepeatOffered),
      ).toEqual([true, false, false]);
      const picture = live(visit);
      expect(picture.floors[0]?.swappedRepeat).toEqual({
        roomIndex: 0,
        line: "Your left and right are 15 dB apart here. Swap the headphones, so that the left earpiece is on your right ear, and visit this room again. That helps tell whether the difference stays with your ears or moves with the headphones.",
        buttonLabel: resultPageCopy.swappedRepeatButton,
      });
      expect(picture.floors[1]?.swappedRepeat).toBeNull();
      expect(picture.floors[2]?.swappedRepeat).toBeNull();
    });

    it("is never offered on a saved picture", () => {
      const picture = saved(savedVisitOf(visit));
      expect(picture.floors.map((floor) => floor.swappedRepeat)).toEqual([
        null,
        null,
        null,
      ]);
      expect(picture.floors[0]?.differenceLabel).toBe(
        "15 dB quieter on the left",
      );
    });
  });

  describe("above the picture", () => {
    it("gives the pooled false alarm line", () => {
      const picture = live(
        visitOf("quick", [
          { ...mixedQuick[0], noSoundTrialCount: 3, falseAlarmCount: 1 },
          { ...mixedQuick[1], noSoundTrialCount: 3, falseAlarmCount: 0 },
          { ...mixedQuick[2], noSoundTrialCount: 3, falseAlarmCount: 1 },
        ]),
      );
      expect(picture.falseAlarmLine).toBe(
        "You answered 2 of 9 times when I made no sound.",
      );
    });

    it("gives no notice when the visit is not marked", () => {
      const visit = visitOf("quick", mixedQuick);
      expect(visit.summary.visitFalseAlarmRateAboveLimit).toBe(false);
      expect(live(visit).visitNotice).toBeNull();
    });

    it("gives the notice with the summary's own limit when the visit is marked", () => {
      const guessed = mixedQuick.map((plan) => ({
        ...plan,
        noSoundTrialCount: 7,
        falseAlarmCount: 2,
      }));
      const visit = visitOf("quick", guessed);
      expect(visit.summary.visitFalseAlarmRateAboveLimit).toBe(true);
      const picture = live(visit);
      expect(picture.visitNotice).toEqual({
        heading: "This whole visit is unreliable",
        line: "You answered more than 20 percent of the times I made no sound, so this visit cannot show what you caught. Walk through the house again, and answer only when you hear something.",
      });
      expect(
        picture.floors.flatMap((floor) => [
          floor.left.reasonLine,
          floor.right.reasonLine,
        ]),
      ).toContain("On this visit you often answered when I made no sound.");
      expect(
        picture.floors.every(
          (floor) =>
            floor.left.lightDepthFraction === null &&
            floor.right.lightDepthFraction === null,
        ),
      ).toBe(true);
    });

    it("names whatever limit the summary was judged by", () => {
      const guessed = mixedQuick.map((plan) => ({
        ...plan,
        noSoundTrialCount: 7,
        falseAlarmCount: 1,
      }));
      const visit = visitOf("quick", guessed, { visitLimitFraction: 0.125 });
      expect(visit.summary.visitFalseAlarmRateAboveLimit).toBe(true);
      expect(live(visit).visitNotice?.line).toContain("more than 12.5 percent");
    });

    it("holds the limits statement constant itself", () => {
      expect(live(visitOf("quick", mixedQuick)).limitsStatement).toBe(
        limitsStatement,
      );
      expect(
        saved(savedVisitOf(visitOf("quick", mixedQuick))).limitsStatement,
      ).toBe(limitsStatement);
    });

    it("has no comparison until the comparison tasks are built", () => {
      const picture = live(visitOf("quick", mixedQuick));
      expect(picture.comparison).toBeNull();
      expect(
        picture.floors.every(
          (floor) =>
            floor.left.earlier === null && floor.right.earlier === null,
        ),
      ).toBe(true);
    });
  });

  describe("the quietest level", () => {
    const visit = visitOf("quick", mixedQuick);

    it("comes from the config for a live picture", () => {
      expect(live(visit).floors[0]?.left.lightDepthFraction).toBeCloseTo(
        0.1 + (0.8 * (15 + 40)) / (15 - hearingMethodConfig.floorDb),
        10,
      );
    });

    it("comes from the saved visit for a saved picture", () => {
      const picture = saved(savedVisitOf(visit, { floorDb: -80 }));
      expect(picture.floors[0]?.left.lightDepthFraction).toBeCloseTo(
        0.1 + (0.8 * 55) / 95,
        10,
      );
      expect(picture.floors[0]?.left.lightDepthFraction).not.toBe(
        live(visit).floors[0]?.left.lightDepthFraction,
      );
    });
  });

  describe("labels", () => {
    it("labels a live picture with the date it is given", () => {
      const picture = live(visitOf("quick", mixedQuick), "2026-11-20");
      expect(picture.kind).toBe("live");
      expect(picture.visitType).toBe("quick");
      expect(picture.heading).toBe("The quietest sounds you caught");
      expect(picture.dateLabel).toBe("20 November 2026");
      expect(picture.visitTypeLabel).toBe("Short visit, 3 rooms");
      expect(picture.imageCaption).toBe(
        "Did You Hear That? A first listen on 20 November 2026. Short visit, 3 rooms.",
      );
      expect(picture.imageFileBaseName).toBe("did-you-hear-that-2026-11-20");
    });

    it("labels a saved picture with the date it was saved and its visit type", () => {
      const plan: RoomPlan = { left: found(-20), right: found(-25) };
      const picture = saved(
        savedVisitOf(visitOf("full", [plan, plan, plan, plan, plan]), {
          savedOnLocalDate: "2026-01-01",
        }),
      );
      expect(picture.kind).toBe("saved");
      expect(picture.visitType).toBe("full");
      expect(picture.dateLabel).toBe("1 January 2026");
      expect(picture.visitTypeLabel).toBe("Long visit, 5 rooms");
      expect(picture.imageCaption).toBe(
        "Did You Hear That? A first listen on 1 January 2026. Long visit, 5 rooms.",
      );
      expect(picture.imageFileBaseName).toBe("did-you-hear-that-2026-01-01");
    });
  });

  describe("a pure function", () => {
    it("gives a deeply frozen picture", () => {
      expect(isDeepFrozen(live(visitOf("quick", mixedQuick)))).toBe(true);
      expect(
        isDeepFrozen(saved(savedVisitOf(visitOf("quick", mixedQuick)))),
      ).toBe(true);
    });

    it("gives equal pictures for equal inputs", () => {
      expect(live(visitOf("quick", mixedQuick))).toEqual(
        live(visitOf("quick", mixedQuick)),
      );
      const visit = visitOf("quick", mixedQuick);
      expect(saved(savedVisitOf(visit))).toEqual(saved(savedVisitOf(visit)));
    });

    it("neither changes nor freezes its input", () => {
      const visit = visitOf("quick", mixedQuick);
      const thawed: VisitToSave = JSON.parse(JSON.stringify(visit));
      const before = JSON.stringify(thawed);
      live(thawed);
      saved(savedVisitOf(thawed));
      expect(JSON.stringify(thawed)).toBe(before);
      expect(Object.isFrozen(thawed.summary.rooms[0])).toBe(false);
      expect(Object.isFrozen(thawed.summary.rooms[0]?.room)).toBe(false);
    });

    it("gives a floor of its own rather than the summary's room", () => {
      const visit = visitOf("quick", mixedQuick);
      const picture = live(visit);
      expect(picture.floors[0]?.room).toEqual(visit.summary.rooms[0]?.room);
      expect(picture.floors[0]?.room).not.toBe(visit.summary.rooms[0]?.room);
    });
  });
});

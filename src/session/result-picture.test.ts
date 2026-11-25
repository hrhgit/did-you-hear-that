import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { limitsStatement } from "../copy/limits-statement";
import { playableFloorLine } from "../copy/result-lines";
import { resultPageCopy } from "../copy/result-page-copy";
import { lightDepthFraction } from "./light-depth-fraction";
import type {
  ResultPicture,
  SavedVisit,
  VisitToSave,
} from "./result-page-types";
import { resultPicture } from "./result-picture";
import { summarizeVisit } from "./summarize-visit";
import { swappedRepeatComparison } from "./swapped-repeat-comparison";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  SwappedRepeatRun,
  VisitLog,
  LoggedCalibration,
  VisitTrial,
} from "./visit-flow-types";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type { VisitRoom } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

/** The three rooms most tests of this file use, as the three-room visit of the earlier spec had them. */
const threeRooms: readonly VisitRoom[] = ["corridor", "stairs", "attic"].map(
  (roomId, roomIndex) => ({
    ...visitRooms("full").find((room) => room.roomId === roomId)!,
    roomIndex,
  }),
);

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
    clampLimit: "ceiling",
    status: "scored",
    response: "left",
    outcome: "caught",
    answeredAtMs: 2700,
    responseTimeMs: 650,
    scoredAtMs: 2700,
  };
}

/**
 * The calibration of every hand-built log: anchored with the music, as a visit recorded now is, or
 * with the hiss, or without an anchor (`hands`), as every visit recorded before audible-start.
 */
function calibrationOf(anchor: "music" | "hiss" | "hands"): LoggedCalibration {
  return {
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
    ...(anchor === "hands" ? {} : { anchor }),
  };
}

function makeLog(
  visitType: "full",
  plans: readonly RoomPlan[],
  trials: readonly VisitTrial[] = [],
  anchor: "music" | "hiss" | "hands" = "music",
): VisitLog {
  return {
    formatVersion: 1,
    visitType,
    visitSeed: 42,
    rooms: plans.length === 3 ? threeRooms : visitRooms(visitType),
    calibrations: [calibrationOf(anchor)],
    headphoneChecks: [],
    roomAttempts: plans.map((plan, roomIndex) => attempt(roomIndex, plan)),
    trials,
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
}

function visitOf(
  visitType: "full",
  plans: readonly RoomPlan[],
  options: {
    readonly trials?: readonly VisitTrial[];
    readonly visitLimitFraction?: number;
    readonly anchor?: "music" | "hiss" | "hands";
  } = {},
): VisitToSave {
  const visitLog = makeLog(visitType, plans, options.trials, options.anchor);
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
    swappedRepeats: [],
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
      const picture = live(visitOf("full", mixedQuick));
      expect(picture.floors.map((floor) => floor.room)).toEqual(threeRooms);
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
        visitOf("full", [
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
    const picture = live(visitOf("full", mixedQuick));
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
        valueLabel: "40 dB quieter",
        valueNote: "than your calibration",
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
        valueLabel: "Quieter still",
        valueNote: "than this house can whisper",
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
        valueLabel: "Not caught",
        valueNote: "even the loudest sound the house may play here went by",
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
        valueLabel: "No level",
        valueNote: "this room should be visited again",
      });
    });

    it("gives levelNotAsAsked its reason line", () => {
      const clamped = live(
        visitOf("full", mixedQuick, { trials: [clampedTrial(1)] }),
      );
      expect(clamped.floors[1]?.left.state).toBe("unreliable");
      expect(clamped.floors[1]?.left.reasonLine).toBe(
        "A sound here was not played at the level the house asked for.",
      );
    });

    it("draws each floor on its own loudest level", () => {
      const capped = live(
        visitOf("full", [
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
        visitOf("full", [
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
    const visit = visitOf("full", mixedQuick);

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

    it("draws no repeat beside any floor, live or saved, for a visit without records", () => {
      const full = visitOf("full", [
        ...mixedQuick,
        { left: found(-20), right: found(-45) },
        { left: worseThanCap, right: found(-10) },
      ]);
      for (const shown of [visit, full]) {
        const pictures = [live(shown), saved(savedVisitOf(shown))];
        for (const picture of pictures) {
          expect(picture.floors.length).toBe(shown.summary.rooms.length);
          expect(picture.floors.map((floor) => floor.repeat)).toEqual(
            shown.summary.rooms.map(() => null),
          );
        }
      }
    });
  });

  describe("a swapped repeat beside its floor (swapped-repeat R12)", () => {
    // Floors 0 and 2 offer the repeat; floor 1 does not.
    const twoOffered: readonly RoomPlan[] = [
      { left: found(-40), right: found(-25) },
      { left: found(-30), right: found(-30) },
      { left: found(-20), right: found(-45) },
    ];
    const visit = visitOf("full", twoOffered);

    /** A finished repeat of one floor whose ears gave these results, made as the controller makes it. */
    function recordOf(
      roomIndex: number,
      left: LoggedEarResult,
      right: LoggedEarResult,
    ): SwappedRepeatRun {
      const firstRun = visit.summary.rooms[roomIndex]!;
      const recorder = createVisitLogRecorder({
        visitType: visit.visitLog.visitType,
        visitSeed: visit.visitLog.visitSeed,
        rooms: visit.visitLog.rooms,
        startedAtMs: 0,
      });
      const attemptNumber = recorder.attemptStarted({
        roomIndex,
        engineSeed: 77,
        calibrationIndex: 0,
        searchCapDb: firstRun.searchCapDb,
        startedAtMs: 400000,
      });
      recorder.attemptEnded({
        roomIndex,
        attempt: attemptNumber,
        endedAtMs: 490000,
        ending: "finished",
        result: {
          left,
          right,
          noSoundTrialCount: 6,
          falseAlarmCount: 0,
          falseAlarmRateFraction: 0,
          falseAlarmRateAboveLimit: false,
        },
      });
      return swappedRepeatRunOf({
        runNumber: 1,
        runLog: recorder.log(),
        swapChecks: [
          {
            answer: "right",
            judgement: "confirmed",
            earpiece: "left",
            answeredAtMs: 395000,
          },
        ],
        firstRun,
      });
    }

    const record = recordOf(0, found(-40), found(-25));
    const withRecord: VisitToSave = { ...visit, swappedRepeats: [record] };

    /** A picture with its floors' `repeat` and `swappedRepeat` left out, for comparing the rest. */
    function withoutRepeats(picture: ResultPicture) {
      return {
        ...picture,
        floors: picture.floors.map((floor) =>
          Object.fromEntries(
            Object.entries(floor).filter(
              ([key]) => key !== "repeat" && key !== "swappedRepeat",
            ),
          ),
        ),
      };
    }

    it("gives a live floor with a record its Comparison and no offer; the other offered floor keeps its offer", () => {
      const without = live(visit);
      const picture = live(withRecord);
      expect(record.outcome).toBe("followsEar");
      expect(picture.floors[0]?.repeat).toEqual(
        swappedRepeatComparison(
          visit.summary.rooms[0]!,
          record,
          hearingMethodConfig.floorDb,
        ),
      );
      expect(picture.floors[0]?.swappedRepeat).toBeNull();
      expect(picture.floors[1]?.repeat).toBeNull();
      expect(picture.floors[1]?.swappedRepeat).toBeNull();
      expect(picture.floors[2]?.repeat).toBeNull();
      expect(picture.floors[2]?.swappedRepeat).toEqual(
        without.floors[2]?.swappedRepeat,
      );
      expect(picture.floors[2]?.swappedRepeat).not.toBeNull();
      expect(withoutRepeats(picture)).toEqual(withoutRepeats(without));
      expect(isDeepFrozen(picture)).toBe(true);
    });

    it("gives a saved floor with a record its Comparison on the saved visit's own quietest level, and changes nothing else", () => {
      const floorDb = -60;
      const savedWithout = savedVisitOf(visit, { floorDb });
      const savedWith = savedVisitOf(visit, {
        floorDb,
        swappedRepeats: [record],
      });
      const without = saved(savedWithout);
      const picture = saved(savedWith);
      expect(picture.floors[0]?.repeat).toEqual(
        swappedRepeatComparison(visit.summary.rooms[0]!, record, floorDb),
      );
      expect(picture.floors.map((floor) => floor.swappedRepeat)).toEqual([
        null,
        null,
        null,
      ]);
      expect(picture.floors.slice(1).map((floor) => floor.repeat)).toEqual([
        null,
        null,
      ]);
      expect(withoutRepeats(picture)).toEqual(withoutRepeats(without));
      expect(picture.floors.map((floor) => floor.swappedRepeat)).toEqual(
        without.floors.map((floor) => floor.swappedRepeat),
      );
    });

    it("draws a record of each floor beside its own floor, whatever its outcome", () => {
      const unclear = recordOf(2, found(-30), found(-30));
      const picture = live({ ...visit, swappedRepeats: [record, unclear] });
      expect(picture.floors[0]?.repeat?.runs[1].left.thresholdDb).toBe(-40);
      expect(picture.floors[2]?.repeat).toMatchObject({
        roomIndex: 2,
        outcome: "unclear",
        unclearReason: "differenceShrank",
      });
      expect(picture.floors.map((floor) => floor.swappedRepeat)).toEqual([
        null,
        null,
        null,
      ]);
    });

    it("draws a VisitToSave without the field, and one with an empty list, as a visit without records", () => {
      const missing: VisitToSave = {
        visitLog: visit.visitLog,
        summary: visit.summary,
      };
      expect("swappedRepeats" in missing).toBe(false);
      expect(live(missing)).toEqual(live({ ...visit, swappedRepeats: [] }));
      expect(live(missing).floors.map((floor) => floor.repeat)).toEqual([
        null,
        null,
        null,
      ]);
      const savedMissing = {
        ...savedVisitOf(visit),
        swappedRepeats: undefined,
      } as unknown as SavedVisit;
      expect(saved(savedMissing)).toEqual(saved(savedVisitOf(visit)));
    });

    it("neither changes nor freezes the records it draws", () => {
      const thawed: SwappedRepeatRun = JSON.parse(JSON.stringify(record));
      const before = JSON.stringify(thawed);
      live({ ...visit, swappedRepeats: [thawed] });
      saved(savedVisitOf(visit, { swappedRepeats: [thawed] }));
      expect(JSON.stringify(thawed)).toBe(before);
      expect(Object.isFrozen(thawed)).toBe(false);
      expect(Object.isFrozen(thawed.left)).toBe(false);
    });
  });

  describe("above the picture", () => {
    it("gives the pooled false alarm line", () => {
      const picture = live(
        visitOf("full", [
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
      const visit = visitOf("full", mixedQuick);
      expect(visit.summary.visitFalseAlarmRateAboveLimit).toBe(false);
      expect(live(visit).visitNotice).toBeNull();
    });

    it("gives the notice with the summary's own limit when the visit is marked", () => {
      const guessed = mixedQuick.map((plan) => ({
        ...plan,
        noSoundTrialCount: 7,
        falseAlarmCount: 2,
      }));
      const visit = visitOf("full", guessed);
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
      const visit = visitOf("full", guessed, { visitLimitFraction: 0.125 });
      expect(visit.summary.visitFalseAlarmRateAboveLimit).toBe(true);
      expect(live(visit).visitNotice?.line).toContain("more than 12.5 percent");
    });

    it("holds the limits statement constant itself", () => {
      expect(live(visitOf("full", mixedQuick)).limitsStatement).toBe(
        limitsStatement,
      );
      expect(
        saved(savedVisitOf(visitOf("full", mixedQuick))).limitsStatement,
      ).toBe(limitsStatement);
    });

    it("has no comparison until the comparison tasks are built", () => {
      const picture = live(visitOf("full", mixedQuick));
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
    const visit = visitOf("full", mixedQuick);

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

  describe("the line at the quietest the house can play (audible-start R22)", () => {
    /** A quick visit whose first floor has these results, its attempt with this Search_Floor. */
    const firstFloor = (
      left: LoggedEarResult,
      right: LoggedEarResult,
      searchFloorDb?: number,
    ): VisitToSave => {
      const visit = visitOf("full", [
        { left, right },
        { left: found(-40), right: found(-40) },
        { left: found(-40), right: found(-40) },
      ]);
      if (searchFloorDb === undefined) {
        return visit;
      }
      const visitLog: VisitLog = {
        ...visit.visitLog,
        roomAttempts: visit.visitLog.roomAttempts.map((attempt) => ({
          ...attempt,
          searchFloorDb,
        })),
      };
      return { visitLog, summary: summarizeVisit(visitLog) };
    };

    it("names a side better than the floor, and ends the floor's description with it", () => {
      const floor = live(firstFloor(betterThanFloor, worseThanCap)).floors[0];
      expect(floor?.playableFloorLine).toBe(playableFloorLine(["left"]));
      expect(floor?.playableFloorLine).toMatch(/^On your left side, /);
      expect(
        floor?.description.endsWith(` ${String(floor.playableFloorLine)}`),
      ).toBe(true);
    });

    it("names a side found at most one upward step above the Search_Floor, and no side above that", () => {
      const step = hearingMethodConfig.upwardStepDb;
      const floor = live(
        firstFloor(found(-30 + step), found(-30 + step + 1), -30),
      ).floors[0];
      expect(floor?.playableFloorLine).toBe(playableFloorLine(["left"]));
      const both = live(firstFloor(found(-30), betterThanFloor, -30)).floors[0];
      expect(both?.playableFloorLine).toMatch(/^On both sides, /);
    });

    it("is null when no side reached it, and leaves the description as it was", () => {
      const floor = live(firstFloor(found(-20), unreliable("trialLimit"), -30))
        .floors[0];
      expect(floor?.playableFloorLine).toBeNull();
      expect(floor?.description).not.toContain(
        "as quiet as the house can play",
      );
      expect(
        live(visitOf("full", mixedQuick)).floors[0]?.playableFloorLine,
      ).toBeNull();
    });

    it("uses the saved visit's quietest level for a floor saved without a Search_Floor", () => {
      // Found at -68 dB: within a step of the live config's floor, far above the saved -80 dB.
      const visit = firstFloor(found(-68), worseThanCap);
      expect(
        hearingMethodConfig.floorDb + hearingMethodConfig.upwardStepDb,
      ).toBeGreaterThanOrEqual(-68);
      expect(live(visit).floors[0]?.playableFloorLine).toBe(
        playableFloorLine(["left"]),
      );
      expect(
        saved(savedVisitOf(visit, { floorDb: -80 })).floors[0]
          ?.playableFloorLine,
      ).toBeNull();
    });
  });

  describe("labels", () => {
    it("labels a live picture with the date it is given", () => {
      const picture = live(visitOf("full", mixedQuick), "2026-11-20");
      expect(picture.kind).toBe("live");
      expect(picture.visitType).toBe("full");
      expect(picture.heading).toBe("The quietest sounds you caught");
      expect(picture.dateLabel).toBe("20 November 2026");
      expect(picture.visitTypeLabel).toBe("Full visit, 3 rooms");
      expect(picture.imageCaption).toBe(
        "Did You Hear That? A first listen on 20 November 2026. Full visit, 3 rooms.",
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
      expect(picture.visitTypeLabel).toBe("Full visit, 5 rooms");
      expect(picture.imageCaption).toBe(
        "Did You Hear That? A first listen on 1 January 2026. Full visit, 5 rooms.",
      );
      expect(picture.imageFileBaseName).toBe("did-you-hear-that-2026-01-01");
    });
  });

  describe("an earlier visit", () => {
    const fivePlans: readonly RoomPlan[] = [
      { left: found(-20), right: found(-30) },
      { left: found(-25), right: worseThanCap },
      { left: betterThanFloor, right: found(-35) },
      { left: found(-40), right: found(-40), searchCapDb: 0 },
      { left: found(-10), right: found(-15) },
    ];
    const shownFull = visitOf("full", fivePlans);

    function withEarlier(
      visit: VisitToSave,
      earlierVisit: SavedVisit | null,
    ): ResultPicture {
      return resultPicture({
        kind: "live",
        visit,
        localDate: "2026-11-20",
        earlierVisit,
      });
    }

    function withoutComparison(picture: ResultPicture) {
      return {
        ...picture,
        comparison: null,
        floors: picture.floors.map((floor) => ({
          ...floor,
          left: { ...floor.left, earlier: null },
          right: { ...floor.right, earlier: null },
        })),
      };
    }

    it("gives outlines on the floors whose room the earlier visit also entered, and only there", () => {
      const earlier = savedVisitOf(
        visitOf("full", [
          { left: found(-30), right: found(-30) },
          { left: found(-30), right: found(-30) },
          { left: found(-30), right: found(-30) },
        ]),
      );
      const picture = withEarlier(shownFull, earlier);
      expect(
        picture.floors.map((floor) => [
          floor.room.roomId,
          floor.left.earlier !== null,
          floor.right.earlier !== null,
        ]),
      ).toEqual([
        ["cellar", false, false],
        ["corridor", true, true],
        ["nursery", false, false],
        ["stairs", true, true],
        ["attic", true, true],
      ]);
      expect(picture.floors[0]?.left.earlier).toBeNull();
      expect(picture.floors[1]?.left.earlier).toEqual({
        state: "found",
        outlineDepthFraction: lightDepthFraction(
          { ...counts, state: "found", thresholdDb: -30 },
          { searchCapDb: 15, floorDb: hearingMethodConfig.floorDb },
        ),
      });
    });

    it("matches floors by room, not by their place in the visit", () => {
      const quickShown = visitOf("full", [
        { left: found(-20), right: found(-20) },
        { left: found(-20), right: found(-20) },
        { left: found(-20), right: found(-20) },
      ]);
      const picture = withEarlier(quickShown, savedVisitOf(shownFull));
      // The quick visit's rooms are the corridor, the stairs and the attic: the long visit's
      // second, fourth and fifth rooms.
      expect(picture.floors.map((floor) => floor.left.earlier?.state)).toEqual([
        "found",
        "found",
        "found",
      ]);
      expect(picture.floors.map((floor) => floor.right.earlier?.state)).toEqual(
        ["worseThanCap", "found", "found"],
      );
      expect(picture.floors[1]?.right.earlier?.outlineDepthFraction).toBe(
        lightDepthFraction(
          { ...counts, state: "found", thresholdDb: -40 },
          { searchCapDb: 15, floorDb: hearingMethodConfig.floorDb },
        ),
      );
    });

    it("gives each state of an earlier ear its outline, and none for an unreliable one", () => {
      const earlier = savedVisitOf(
        visitOf("full", [
          { left: betterThanFloor, right: worseThanCap },
          { left: unreliable("trialLimit"), right: found(-30) },
          { left: found(-30), right: unreliable("inconsistentCatch") },
          { left: found(-30), right: found(-30) },
          { left: found(-30), right: found(-30) },
        ]),
      );
      const picture = withEarlier(shownFull, earlier);
      expect(picture.floors[0]?.left.earlier).toEqual({
        state: "betterThanFloor",
        outlineDepthFraction: 1,
      });
      expect(picture.floors[0]?.right.earlier).toEqual({
        state: "worseThanCap",
        outlineDepthFraction: 0,
      });
      expect(picture.floors[1]?.left.earlier).toEqual({
        state: "unreliable",
        outlineDepthFraction: null,
      });
      expect(picture.floors[2]?.right.earlier).toEqual({
        state: "unreliable",
        outlineDepthFraction: null,
      });
    });

    it("places an outline on the shown floor's own scale, not the earlier floor's", () => {
      // The shown stairs reach only 0 dB; the earlier stairs reached 15 dB.
      const earlier = savedVisitOf(
        visitOf("full", [
          { left: found(-30), right: found(-30) },
          { left: found(-30), right: found(-30) },
          { left: found(-30), right: found(-30) },
          { left: found(-25), right: found(5) },
          { left: found(-30), right: found(-30) },
        ]),
        { floorDb: -60 },
      );
      const picture = withEarlier(shownFull, earlier);
      const stairs = picture.floors[3];
      expect(stairs?.room.roomId).toBe("stairs");
      expect(stairs?.left.earlier?.outlineDepthFraction).toBeCloseTo(
        0.1 + (0.8 * 25) / (0 - hearingMethodConfig.floorDb),
        10,
      );
      // An earlier threshold louder than the shown floor's loudest is held at its shallow end.
      expect(stairs?.right.earlier?.outlineDepthFraction).toBe(0.1);
      // A saved shown visit uses its own floorDb for the outlines too.
      const savedPicture = resultPicture({
        kind: "saved",
        savedVisit: savedVisitOf(shownFull, { floorDb: -80 }),
        earlierVisit: earlier,
      });
      expect(
        savedPicture.floors[3]?.left.earlier?.outlineDepthFraction,
      ).toBeCloseTo(0.1 + (0.8 * 25) / 80, 10);
    });

    it("draws the outline and the light on one scale, so equal levels give equal depths", () => {
      const picture = withEarlier(shownFull, savedVisitOf(shownFull));
      for (const floor of picture.floors) {
        for (const shownWing of [floor.left, floor.right]) {
          expect(shownWing.earlier).toEqual({
            state: shownWing.state,
            outlineDepthFraction: shownWing.lightDepthFraction,
          });
        }
      }
    });

    it("names the earlier visit's date when it was not marked as a whole", () => {
      const earlier = savedVisitOf(shownFull, {
        savedVisitId: "0a1b2c3d",
        savedOnLocalDate: "2026-11-12",
      });
      expect(withEarlier(shownFull, earlier).comparison).toEqual({
        earlierSavedVisitId: "0a1b2c3d",
        line: "The faint outlines are your visit of 12 November 2026 with headphones of the same name. Each visit is relative to its own calibration.",
      });
    });

    it("draws nothing of an earlier visit whose anchor was set another way, and names none (audible-start R11.3)", () => {
      for (const [shownAnchor, earlierAnchor] of [
        ["music", "hiss"],
        ["hiss", "music"],
        ["music", "hands"],
        ["hiss", "hands"],
      ] as const) {
        const shown = visitOf("full", fivePlans, { anchor: shownAnchor });
        const earlier = savedVisitOf(
          visitOf("full", fivePlans, { anchor: earlierAnchor }),
        );
        const picture = withEarlier(shown, earlier);
        expect(
          picture.comparison,
          `${shownAnchor} ${earlierAnchor}`,
        ).toBeNull();
        for (const floor of picture.floors) {
          expect(floor.left.earlier).toBeNull();
          expect(floor.right.earlier).toBeNull();
        }
        expect(picture).toEqual(withEarlier(shown, null));
      }
    });

    it("compares two visits anchored the same way, the hands among them", () => {
      for (const anchor of ["music", "hiss", "hands"] as const) {
        const shown = savedVisitOf(visitOf("full", fivePlans, { anchor }), {
          savedVisitId: "11111111",
        });
        const earlier = savedVisitOf(visitOf("full", fivePlans, { anchor }), {
          savedVisitId: "22222222",
        });
        const picture = resultPicture({
          kind: "saved",
          savedVisit: shown,
          earlierVisit: earlier,
        });
        expect(picture.comparison?.earlierSavedVisitId, anchor).toBe(
          "22222222",
        );
        for (const floor of picture.floors) {
          expect(floor.left.earlier).not.toBeNull();
          expect(floor.right.earlier).not.toBeNull();
        }
      }
    });

    it("compares floor by floor: a floor whose calibration was set another way gets no mark", () => {
      const shown = visitOf("full", fivePlans);
      // A second calibration with the hiss, from which the third floor's result comes.
      const visitLog: VisitLog = {
        ...shown.visitLog,
        calibrations: [
          calibrationOf("music"),
          { ...calibrationOf("hiss"), calibrationIndex: 1 },
        ],
        roomAttempts: shown.visitLog.roomAttempts.map((roomAttempt) =>
          roomAttempt.roomIndex === 2
            ? { ...roomAttempt, calibrationIndex: 1 }
            : roomAttempt,
        ),
      };
      const earlier = savedVisitOf(visitOf("full", fivePlans));
      const picture = withEarlier({ ...shown, visitLog }, earlier);
      expect(picture.comparison?.earlierSavedVisitId).toBe(
        earlier.savedVisitId,
      );
      picture.floors.forEach((floor, floorIndex) => {
        expect(floor.left.earlier === null, String(floorIndex)).toBe(
          floorIndex === 2,
        );
        expect(floor.right.earlier === null, String(floorIndex)).toBe(
          floorIndex === 2,
        );
      });
    });

    it("says that an earlier visit marked as a whole has no outlines, and draws none", () => {
      const guessed = visitOf(
        "full",
        fivePlans.map((plan) => ({
          ...plan,
          noSoundTrialCount: 7,
          falseAlarmCount: 2,
        })),
      );
      expect(guessed.summary.visitFalseAlarmRateAboveLimit).toBe(true);
      const earlier = savedVisitOf(guessed, {
        savedVisitId: "0a1b2c3e",
        savedOnLocalDate: "2026-02-28",
      });
      const picture = withEarlier(shownFull, earlier);
      expect(picture.comparison).toEqual({
        earlierSavedVisitId: "0a1b2c3e",
        line: "Your visit of 28 February 2026 with headphones of the same name was unreliable as a whole, so it has no outlines.",
      });
      for (const floor of picture.floors) {
        expect(floor.left.earlier?.outlineDepthFraction).toBeNull();
        expect(floor.right.earlier?.outlineDepthFraction).toBeNull();
      }
    });

    it("changes nothing but the outlines and the comparison", () => {
      const earlier = savedVisitOf(visitOf("full", mixedQuick));
      for (const shown of [shownFull, visitOf("full", mixedQuick)]) {
        expect(withoutComparison(withEarlier(shown, earlier))).toEqual(
          withEarlier(shown, null),
        );
        expect(
          withoutComparison(
            resultPicture({
              kind: "saved",
              savedVisit: savedVisitOf(shown),
              earlierVisit: earlier,
            }),
          ),
        ).toEqual(saved(savedVisitOf(shown)));
      }
    });

    it("gives, without an earlier visit, every outline and the comparison null", () => {
      for (const picture of [
        withEarlier(shownFull, null),
        live(visitOf("full", mixedQuick)),
        saved(savedVisitOf(visitOf("full", mixedQuick))),
      ]) {
        expect(picture.comparison).toBeNull();
        for (const floor of picture.floors) {
          expect(floor.left.earlier).toBeNull();
          expect(floor.right.earlier).toBeNull();
        }
        expect(withoutComparison(picture)).toEqual(picture);
      }
    });

    it("gives a deeply frozen picture and neither changes nor freezes the earlier visit", () => {
      const earlier: SavedVisit = JSON.parse(
        JSON.stringify(savedVisitOf(visitOf("full", mixedQuick))),
      );
      const before = JSON.stringify(earlier);
      const picture = withEarlier(shownFull, earlier);
      expect(isDeepFrozen(picture)).toBe(true);
      expect(JSON.stringify(earlier)).toBe(before);
      expect(Object.isFrozen(earlier.summary.rooms[0])).toBe(false);
      expect(withEarlier(shownFull, earlier)).toEqual(picture);
    });
  });

  describe("a pure function", () => {
    it("gives a deeply frozen picture", () => {
      expect(isDeepFrozen(live(visitOf("full", mixedQuick)))).toBe(true);
      expect(
        isDeepFrozen(saved(savedVisitOf(visitOf("full", mixedQuick)))),
      ).toBe(true);
    });

    it("gives equal pictures for equal inputs", () => {
      expect(live(visitOf("full", mixedQuick))).toEqual(
        live(visitOf("full", mixedQuick)),
      );
      const visit = visitOf("full", mixedQuick);
      expect(saved(savedVisitOf(visit))).toEqual(saved(savedVisitOf(visit)));
    });

    it("neither changes nor freezes its input", () => {
      const visit = visitOf("full", mixedQuick);
      const thawed: VisitToSave = JSON.parse(JSON.stringify(visit));
      const before = JSON.stringify(thawed);
      live(thawed);
      saved(savedVisitOf(thawed));
      expect(JSON.stringify(thawed)).toBe(before);
      expect(Object.isFrozen(thawed.summary.rooms[0])).toBe(false);
      expect(Object.isFrozen(thawed.summary.rooms[0]?.room)).toBe(false);
    });

    it("gives a floor of its own rather than the summary's room", () => {
      const visit = visitOf("full", mixedQuick);
      const picture = live(visit);
      expect(picture.floors[0]?.room).toEqual(visit.summary.rooms[0]?.room);
      expect(picture.floors[0]?.room).not.toBe(visit.summary.rooms[0]?.room);
    });
  });
});

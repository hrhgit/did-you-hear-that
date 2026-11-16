import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import {
  differenceLabel,
  unreliableReasonLine,
  wingLine,
} from "../copy/result-lines";
import { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import {
  comparisonDescription,
  outcomeLines,
} from "../copy/swapped-repeat-lines";
import { lightDepthFraction } from "./light-depth-fraction";
import { swappedRepeatComparison } from "./swapped-repeat-comparison";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type {
  LoggedEarResult,
  RoomSummary,
  SwappedRepeatRun,
  VisitEarResult,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// The Comparison of a floor's first run and its repeat (swapped-repeat design.md, "The
// Comparison"), on records made by swappedRepeatRunOf from a run's own recorder log.

const rooms = visitRooms("full");
const floorDb = hearingMethodConfig.floorDb;

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

const found = (thresholdDb: number) =>
  ({ ...counts, state: "found", thresholdDb }) as const;

/** The first run of a floor: 20 dB quieter on the left, so the repeat is offered. */
function firstRunOf(
  roomIndex: number,
  searchCapDb: number,
  left = -40,
  right = -20,
): RoomSummary {
  return Object.freeze({
    room: rooms[roomIndex],
    left: Object.freeze(found(left)) as VisitEarResult,
    right: Object.freeze(found(right)) as VisitEarResult,
    searchCapDb,
    noSoundTrialCount: 3,
    falseAlarmCount: 0,
    rightMinusLeftDb: right - left,
    swappedRepeatOffered: true,
  });
}

/** A repeat record of the floor with these search results and no trials. */
function recordOf(
  firstRun: RoomSummary,
  left: LoggedEarResult,
  right: LoggedEarResult,
  runNumber = 1,
): SwappedRepeatRun {
  const recorder = createVisitLogRecorder({
    visitType: "full",
    visitSeed: 1,
    rooms,
    startedAtMs: 0,
  });
  const roomIndex = firstRun.room.roomIndex;
  recorder.attemptStarted({
    roomIndex,
    engineSeed: 5,
    calibrationIndex: 0,
    searchCapDb: firstRun.searchCapDb,
    startedAtMs: 1000,
  });
  recorder.attemptEnded({
    roomIndex,
    attempt: 1,
    endedAtMs: 90_000,
    ending: "finished",
    result: {
      left,
      right,
      noSoundTrialCount: 0,
      falseAlarmCount: 0,
      falseAlarmRateFraction: 0,
      falseAlarmRateAboveLimit: false,
    },
  });
  return swappedRepeatRunOf({
    runNumber,
    runLog: recorder.log(),
    swapChecks: [
      {
        answer: "right",
        judgement: "confirmed",
        earpiece: "left",
        answeredAtMs: 500,
      },
    ],
    firstRun,
  });
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("swappedRepeatComparison", () => {
  const firstRun = firstRunOf(3, 10);
  const record = recordOf(firstRun, found(-45), found(-25), 2);
  const comparison = swappedRepeatComparison(firstRun, record, floorDb);

  it("names the floor, the run, the heading and the two runs' labels", () => {
    expect(comparison.roomIndex).toBe(3);
    expect(comparison.runNumber).toBe(2);
    expect(comparison.heading).toBe(swappedRepeatCopy.comparisonHeading);
    expect(comparison.runs.map((run) => [run.arrangement, run.label])).toEqual([
      ["asMarked", "Headphones as marked"],
      ["swapped", "Headphones swapped"],
    ]);
  });

  it("gives the wings by ear, each with the earpiece on it in that run and its label", () => {
    const [first, repeat] = comparison.runs;
    expect([
      first.left.ear,
      first.left.earpiece,
      first.left.earpieceLabel,
    ]).toEqual(["left", "left", "Left earpiece"]);
    expect([
      first.right.ear,
      first.right.earpiece,
      first.right.earpieceLabel,
    ]).toEqual(["right", "right", "Right earpiece"]);
    expect([
      repeat.left.ear,
      repeat.left.earpiece,
      repeat.left.earpieceLabel,
    ]).toEqual(["left", "right", "Right earpiece"]);
    expect([
      repeat.right.ear,
      repeat.right.earpiece,
      repeat.right.earpieceLabel,
    ]).toEqual(["right", "left", "Left earpiece"]);
  });

  it("puts both runs on the floor's own scale, from the first run's cap to the floor", () => {
    const scale = { searchCapDb: firstRun.searchCapDb, floorDb };
    const [first, repeat] = comparison.runs;
    expect(first.left.lightDepthFraction).toBe(
      lightDepthFraction(firstRun.left, scale),
    );
    expect(first.right.lightDepthFraction).toBe(
      lightDepthFraction(firstRun.right, scale),
    );
    expect(repeat.left.lightDepthFraction).toBe(
      lightDepthFraction(record.left, scale),
    );
    expect(repeat.right.lightDepthFraction).toBe(
      lightDepthFraction(record.right, scale),
    );
    // The same level gives the same depth on another floor only when that floor has the same cap.
    const otherCap = swappedRepeatComparison(
      firstRunOf(3, 15),
      recordOf(firstRunOf(3, 15), found(-45), found(-25)),
      floorDb,
    );
    expect(otherCap.runs[1].left.lightDepthFraction).not.toBe(
      repeat.left.lightDepthFraction,
    );
  });

  it("gives each wing its state, level, line and reason line as the picture does", () => {
    expect(comparison.runs[1].left).toEqual({
      ear: "left",
      earpiece: "right",
      earpieceLabel: "Right earpiece",
      state: "found",
      thresholdDb: -45,
      lightDepthFraction: lightDepthFraction(record.left, {
        searchCapDb: 10,
        floorDb,
      }),
      line: wingLine({ state: "found", thresholdDb: -45, reasons: [] }),
      reasonLine: null,
    });
    const unreliable = recordOf(firstRun, found(-45), {
      ...counts,
      state: "unreliable",
      reasons: ["inconsistentCatch", "falseAlarmRate"],
    });
    const withUnreliable = swappedRepeatComparison(
      firstRun,
      unreliable,
      floorDb,
    );
    expect(withUnreliable.runs[1].right).toEqual({
      ear: "right",
      earpiece: "left",
      earpieceLabel: "Left earpiece",
      state: "unreliable",
      thresholdDb: null,
      lightDepthFraction: null,
      line: wingLine({ state: "unreliable", thresholdDb: null, reasons: [] }),
      reasonLine: unreliableReasonLine("inconsistentCatch"),
    });
    const whisper = swappedRepeatComparison(
      firstRun,
      recordOf(firstRun, { ...counts, state: "betterThanFloor" }, found(-25)),
      floorDb,
    );
    expect(whisper.runs[1].left.state).toBe("betterThanFloor");
    expect(whisper.runs[1].left.thresholdDb).toBeNull();
    expect(whisper.runs[1].left.lightDepthFraction).toBe(
      lightDepthFraction(
        { ...counts, state: "betterThanFloor" },
        { searchCapDb: 10, floorDb },
      ),
    );
  });

  it("gives each run its difference and its difference label", () => {
    expect(comparison.runs[0].rightMinusLeftDb).toBe(20);
    expect(comparison.runs[0].differenceLabel).toBe(differenceLabel(20));
    expect(comparison.runs[1].rightMinusLeftDb).toBe(20);
    expect(comparison.runs[1].differenceLabel).toBe(
      "20 dB quieter on the left",
    );
    const noLevel = swappedRepeatComparison(
      firstRun,
      recordOf(firstRun, found(-45), { ...counts, state: "worseThanCap" }),
      floorDb,
    );
    expect(noLevel.runs[1].rightMinusLeftDb).toBeNull();
    expect(noLevel.runs[1].differenceLabel).toBe(differenceLabel(null));
  });

  it("gives the record's outcome with its label, lines and description from the copy", () => {
    expect(comparison.outcome).toBe("followsEar");
    expect(comparison.unclearReason).toBeNull();
    expect(comparison.outcomeLabel).toBe(
      swappedRepeatCopy.outcomeLabels.followsEar,
    );
    expect(comparison.outcomeLines).toEqual(outcomeLines("followsEar", null));
    expect(comparison.description).toBe(
      comparisonDescription({
        roomId: "stairs",
        frequencyHz: 4000,
        runs: [
          {
            left: {
              state: "found",
              thresholdDb: -40,
              reasons: [],
              earpiece: "left",
            },
            right: {
              state: "found",
              thresholdDb: -20,
              reasons: [],
              earpiece: "right",
            },
            rightMinusLeftDb: 20,
          },
          {
            left: {
              state: "found",
              thresholdDb: -45,
              reasons: [],
              earpiece: "right",
            },
            right: {
              state: "found",
              thresholdDb: -25,
              reasons: [],
              earpiece: "left",
            },
            rightMinusLeftDb: 20,
          },
        ],
        outcome: "followsEar",
        unclearReason: null,
      }),
    );
    for (const [left, right, outcome, reason] of [
      [found(-25), found(-45), "followsEarpiece", null],
      [found(-30), found(-30), "unclear", "differenceShrank"],
      [found(-30), { ...counts, state: "worseThanCap" }, "unclear", "noLevel"],
    ] as const) {
      const other = swappedRepeatComparison(
        firstRun,
        recordOf(firstRun, left, right),
        floorDb,
      );
      expect(other.outcome).toBe(outcome);
      expect(other.unclearReason).toBe(reason);
      expect(other.outcomeLabel).toBe(swappedRepeatCopy.outcomeLabels[outcome]);
      expect(other.outcomeLines).toEqual(outcomeLines(outcome, reason));
      expect(
        other.description.endsWith(outcomeLines(outcome, reason).join(" ")),
      ).toBe(true);
    }
  });

  it("throws a RangeError when the record is not of the summary's floor", () => {
    expect(() =>
      swappedRepeatComparison(firstRunOf(2, 10), record, floorDb),
    ).toThrow(RangeError);
  });

  it("is deeply frozen, equal for equal inputs, and leaves its inputs unchanged", () => {
    expect(isDeeplyFrozen(comparison)).toBe(true);
    const copyOfRecord = structuredClone(record);
    const copyOfFirst = structuredClone(firstRun);
    expect(swappedRepeatComparison(copyOfFirst, copyOfRecord, floorDb)).toEqual(
      comparison,
    );
    expect(copyOfRecord).toEqual(record);
    expect(copyOfFirst).toEqual(firstRun);
    expect(Object.isFrozen(copyOfRecord)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { earpieceOnEar } from "./earpiece-on-ear";
import { swappedRepeatOutcome } from "./swapped-repeat-outcome";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import type { PlayedTrial } from "./visit-log-recorder";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type {
  LoggedRoomResult,
  LoggedSwapCheck,
  RoomSummary,
  SwappedRepeatRun,
  VisitEarResult,
  VisitLog,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// The record of one swapped repeat from a run's own recorder log (swapped-repeat design.md, "In
// the record, every answer and every sound"). The run's recorder is a fresh one made with the
// visit's type, seed, rooms and start time, as the Repeat_Controller makes it.

/** The visit began at this time on the timer's clock. */
const visitStartMs = 100_000;

/** The repeated floor: room 1 of the quick visit (4 kHz, the stairs). */
const roomIndex = 1;
const rooms = visitRooms("quick");

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

const found = (thresholdDb: number) =>
  ({ ...counts, state: "found", thresholdDb }) as const;

/** The first run: 20 dB quieter on the left, so the repeat is offered. */
const firstRun: RoomSummary = Object.freeze({
  room: rooms[roomIndex],
  left: Object.freeze(found(-40)) as VisitEarResult,
  right: Object.freeze(found(-20)) as VisitEarResult,
  searchCapDb: 15,
  noSoundTrialCount: 3,
  falseAlarmCount: 0,
  rightMinusLeftDb: 20,
  swappedRepeatOffered: true,
});

const swapChecks: readonly LoggedSwapCheck[] = Object.freeze([
  Object.freeze({
    answer: "left",
    judgement: "notSwapped",
    earpiece: "left",
    answeredAtMs: 300_000,
  } as const),
  Object.freeze({
    answer: "right",
    judgement: "confirmed",
    earpiece: "left",
    answeredAtMs: 310_000,
  } as const),
]);

function trialAt(
  trialNumber: number,
  atMs: number,
  part:
    | {
        kind: "sound";
        ear: "left" | "right";
        requestedLevelDb: number;
        playedLevelDb?: number;
      }
    | { kind: "noSound" },
): PlayedTrial {
  const common = {
    roomIndex,
    attempt: 1,
    trialNumber,
    gapBeforeMs: 2000,
    presentedAtMs: visitStartMs + atMs,
    windowStartMs: visitStartMs + atMs + 50,
  };
  return part.kind === "sound"
    ? {
        ...common,
        kind: "sound",
        ear: part.ear,
        requestedLevelDb: part.requestedLevelDb,
        playedLevelDb: part.playedLevelDb ?? part.requestedLevelDb,
        clampLimit: part.playedLevelDb === undefined ? null : "rise",
      }
    : { ...common, kind: "noSound" };
}

/**
 * The log of one finished run with a trial of every kind: a caught sound on each ear, a sound
 * named on the other side, a missed sound, a false alarm, a no-sound trial with no answer, a
 * discarded trial, two ignored answers, a pause and a refused play. With `levelDiffers`, the
 * caught sound on the left was played at another level than asked.
 */
function runLog(
  result: LoggedRoomResult,
  options: { levelDiffers?: boolean; discardedLevelDiffers?: boolean } = {},
): VisitLog {
  const recorder = createVisitLogRecorder({
    visitType: "quick",
    visitSeed: 4242,
    rooms,
    startedAtMs: visitStartMs,
  });
  const attempt = recorder.attemptStarted({
    roomIndex,
    engineSeed: 987654321,
    calibrationIndex: 0,
    searchCapDb: 15,
    startedAtMs: visitStartMs + 320_000,
  });
  expect(attempt).toBe(1);
  const scored = (
    trial: PlayedTrial,
    response: "left" | "right" | "none",
    outcome: "caught" | "wrongSide" | "missed" | "falseAlarm" | "noResponse",
  ) =>
    recorder.trialScored(trial, {
      response,
      outcome,
      answeredAtMs: response === "none" ? null : trial.windowStartMs + 600,
      scoredAtMs:
        response === "none"
          ? trial.windowStartMs + 2000
          : trial.windowStartMs + 600,
    });
  scored(
    trialAt(1, 323_000, {
      kind: "sound",
      ear: "left",
      requestedLevelDb: -25,
      ...(options.levelDiffers === true ? { playedLevelDb: -27 } : {}),
    }),
    "left",
    "caught",
  );
  scored(
    trialAt(2, 327_000, { kind: "sound", ear: "right", requestedLevelDb: -25 }),
    "right",
    "caught",
  );
  scored(
    trialAt(3, 331_000, { kind: "sound", ear: "left", requestedLevelDb: -35 }),
    "right",
    "wrongSide",
  );
  scored(
    trialAt(4, 335_000, { kind: "sound", ear: "right", requestedLevelDb: -35 }),
    "none",
    "missed",
  );
  scored(trialAt(5, 339_000, { kind: "noSound" }), "left", "falseAlarm");
  recorder.answerIgnored({
    atMs: visitStartMs + 340_000,
    side: "right",
    roomIndex,
    attempt: 1,
  });
  scored(trialAt(6, 343_000, { kind: "noSound" }), "none", "noResponse");
  recorder.trialDiscarded(
    trialAt(7, 347_000, {
      kind: "sound",
      ear: "left",
      requestedLevelDb: -30,
      ...(options.discardedLevelDiffers === true ? { playedLevelDb: -32 } : {}),
    }),
    visitStartMs + 347_500,
  );
  recorder.pauseStarted({
    reason: "visitor",
    stage: "swappedRepeat",
    roomIndex,
    startedAtMs: visitStartMs + 347_500,
  });
  recorder.pauseEnded(visitStartMs + 360_000);
  recorder.playRefused({
    atMs: visitStartMs + 362_000,
    roomIndex,
    attempt: 1,
    trialNumber: 7,
    reason: "busy",
  });
  recorder.answerIgnored({
    atMs: visitStartMs + 363_000,
    side: "left",
    roomIndex,
    attempt: 1,
  });
  scored(
    trialAt(7, 365_000, { kind: "sound", ear: "left", requestedLevelDb: -30 }),
    "left",
    "caught",
  );
  recorder.attemptEnded({
    roomIndex,
    attempt: 1,
    endedAtMs: visitStartMs + 400_000,
    ending: "finished",
    result,
  });
  return recorder.log();
}

const roomResult = (
  left: LoggedRoomResult["left"],
  right: LoggedRoomResult["right"],
): LoggedRoomResult => ({
  left,
  right,
  noSoundTrialCount: 2,
  falseAlarmCount: 1,
  falseAlarmRateFraction: 0.5,
  falseAlarmRateAboveLimit: false,
});

const followsEarResult = roomResult(found(-40), found(-20));

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("swappedRepeatRunOf", () => {
  const log = runLog(followsEarResult);
  const record = swappedRepeatRunOf({
    runNumber: 2,
    runLog: log,
    swapChecks,
    firstRun,
  });

  it("gives a record of format 1 for the floor, with its run number and calibration", () => {
    expect(record.formatVersion).toBe(1);
    expect(record.roomIndex).toBe(roomIndex);
    expect(record.runNumber).toBe(2);
    expect(record.calibrationIndex).toBe(0);
    expect(record.attempt).toEqual(log.roomAttempts[0]);
  });

  it("names the swapped arrangement", () => {
    expect(record.earpieceOnEar).toEqual(earpieceOnEar("swapped"));
    expect(record.earpieceOnEar).toEqual({ left: "right", right: "left" });
  });

  it("gives every sound trial the earpiece on its ear and every no-sound trial null", () => {
    expect(record.trials).toHaveLength(log.trials.length);
    record.trials.forEach((trial, index) => {
      const { earpiece, responseEarpiece, ...rest } = trial;
      expect(rest).toEqual(log.trials[index]);
      if (trial.kind === "sound") {
        expect(earpiece).toBe(trial.ear === "left" ? "right" : "left");
      } else {
        expect(earpiece).toBeNull();
      }
      void responseEarpiece;
    });
  });

  it("gives every scored trial answered with a side the earpiece on the ear named, and null otherwise", () => {
    const byOrder = record.trials.map((trial) => [
      trial.trialNumber,
      trial.status,
      trial.status === "scored" ? trial.response : null,
      trial.responseEarpiece,
    ]);
    expect(byOrder).toEqual([
      [1, "scored", "left", "right"],
      [2, "scored", "right", "left"],
      [3, "scored", "right", "left"],
      [4, "scored", "none", null],
      [5, "scored", "left", "right"],
      [6, "scored", "none", null],
      [7, "discarded", null, null],
      [7, "scored", "left", "right"],
    ]);
  });

  it("gives every ignored answer the earpiece on its side", () => {
    expect(record.ignoredAnswers).toEqual([
      { ...log.ignoredAnswers[0], earpiece: "left" },
      { ...log.ignoredAnswers[1], earpiece: "right" },
    ]);
  });

  it("keeps the swap checks, the pauses and the refused plays unchanged", () => {
    expect(record.swapChecks).toEqual(swapChecks);
    expect(record.swapChecks.every((check) => check.earpiece === "left")).toBe(
      true,
    );
    expect(record.pauses).toEqual(log.pauses);
    expect(record.pauses[0].stage).toBe("swappedRepeat");
    expect(record.refusedPlays).toEqual(log.refusedPlays);
  });

  it("gives the ears the search's results and the outcome swappedRepeatOutcome gives", () => {
    expect(record.left).toEqual(found(-40));
    expect(record.right).toEqual(found(-20));
    const judgement = swappedRepeatOutcome({
      first: { left: firstRun.left, right: firstRun.right },
      repeat: { left: record.left, right: record.right },
    });
    expect({
      outcome: record.outcome,
      unclearReason: record.unclearReason,
      firstRightMinusLeftDb: record.firstRightMinusLeftDb,
      rightMinusLeftDb: record.rightMinusLeftDb,
      differenceLimitDb: record.differenceLimitDb,
      unclearBelowDb: record.unclearBelowDb,
    }).toEqual(judgement);
    expect(record.outcome).toBe("followsEar");
    expect(record.firstRightMinusLeftDb).toBe(firstRun.rightMinusLeftDb);
    expect(record.differenceLimitDb).toBe(15);
    expect(record.unclearBelowDb).toBe(7.5);
  });

  it("gives followsEarpiece and unclear by the same rule", () => {
    const earpiece = swappedRepeatRunOf({
      runNumber: 1,
      runLog: runLog(roomResult(found(-20), found(-40))),
      swapChecks,
      firstRun,
    });
    expect(earpiece.outcome).toBe("followsEarpiece");
    expect(earpiece.rightMinusLeftDb).toBe(-20);
    const noLevel = swappedRepeatRunOf({
      runNumber: 1,
      runLog: runLog(
        roomResult(found(-40), { ...counts, state: "worseThanCap" }),
      ),
      swapChecks,
      firstRun,
    });
    expect(noLevel.outcome).toBe("unclear");
    expect(noLevel.unclearReason).toBe("noLevel");
    expect(noLevel.rightMinusLeftDb).toBeNull();
  });

  it("makes both ears unreliable with levelNotAsAsked after the search's own reasons when a scored sound was played at another level", () => {
    const record = swappedRepeatRunOf({
      runNumber: 1,
      runLog: runLog(
        roomResult(found(-40), {
          ...counts,
          state: "unreliable",
          reasons: ["trialLimit"],
        }),
        { levelDiffers: true },
      ),
      swapChecks,
      firstRun,
    });
    expect(record.left).toEqual({
      ...counts,
      state: "unreliable",
      reasons: ["levelNotAsAsked"],
    });
    expect(record.right).toEqual({
      ...counts,
      state: "unreliable",
      reasons: ["trialLimit", "levelNotAsAsked"],
    });
    expect(record.outcome).toBe("unclear");
    expect(record.unclearReason).toBe("noLevel");
  });

  it("does not add levelNotAsAsked for a discarded trial played at another level", () => {
    const record = swappedRepeatRunOf({
      runNumber: 1,
      runLog: runLog(followsEarResult, { discardedLevelDiffers: true }),
      swapChecks,
      firstRun,
    });
    expect(record.trials[6].playedLevelDb).toBe(-32);
    expect(record.left).toEqual(found(-40));
    expect(record.right).toEqual(found(-20));
  });

  it("is deeply frozen and deep-equal to its JSON round trip", () => {
    expect(isDeeplyFrozen(record)).toBe(true);
    expect(JSON.parse(JSON.stringify(record)) as SwappedRepeatRun).toEqual(
      record,
    );
  });

  it("leaves its input unchanged and unfrozen", () => {
    const given = structuredClone(log);
    const checks = structuredClone(swapChecks) as LoggedSwapCheck[];
    swappedRepeatRunOf({
      runNumber: 1,
      runLog: given,
      swapChecks: checks,
      firstRun,
    });
    expect(given).toEqual(log);
    expect(Object.isFrozen(given.roomAttempts[0])).toBe(false);
    expect(Object.isFrozen(given.pauses[0])).toBe(false);
    expect(Object.isFrozen(checks[0])).toBe(false);
  });

  it("throws a RangeError for a run number that is not a whole number of at least 1", () => {
    for (const runNumber of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        swappedRepeatRunOf({ runNumber, runLog: log, swapChecks, firstRun }),
      ).toThrow(RangeError);
    }
  });

  it("throws a RangeError for a run log without one finished attempt of the floor", () => {
    const noAttempt: VisitLog = { ...log, roomAttempts: [] };
    const abandoned: VisitLog = {
      ...log,
      roomAttempts: [
        { ...log.roomAttempts[0], ending: "abandoned", result: null },
      ],
    };
    const twice: VisitLog = {
      ...log,
      roomAttempts: [log.roomAttempts[0], log.roomAttempts[0]],
    };
    const otherRoom: VisitLog = {
      ...log,
      roomAttempts: [{ ...log.roomAttempts[0], roomIndex: 0 }],
    };
    for (const given of [noAttempt, abandoned, twice, otherRoom]) {
      expect(() =>
        swappedRepeatRunOf({
          runNumber: 1,
          runLog: given,
          swapChecks,
          firstRun,
        }),
      ).toThrow(RangeError);
    }
  });

  it("throws a RangeError when the last swap check is not confirmed", () => {
    for (const checks of [[], swapChecks.slice(0, 1)]) {
      expect(() =>
        swappedRepeatRunOf({
          runNumber: 1,
          runLog: log,
          swapChecks: checks,
          firstRun,
        }),
      ).toThrow(RangeError);
    }
  });

  it("throws a RangeError for a first run that does not offer the repeat", () => {
    expect(() =>
      swappedRepeatRunOf({
        runNumber: 1,
        runLog: log,
        swapChecks,
        firstRun: {
          ...firstRun,
          right: found(-35),
          rightMinusLeftDb: 5,
          swappedRepeatOffered: false,
        },
      }),
    ).toThrow(RangeError);
  });
});

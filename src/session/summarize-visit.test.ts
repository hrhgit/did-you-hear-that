import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import { summarizeVisit } from "./summarize-visit";
import type {
  LoggedEarResult,
  LoggedIgnoredAnswer,
  LoggedRoomAttempt,
  LoggedRoomResult,
  VisitLog,
  VisitTrial,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Hand-built visit logs. Only the fields summarizeVisit reads carry meaning; the rest are filled
// with plausible values.

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

function roomResult(
  left: LoggedEarResult,
  right: LoggedEarResult,
  noSoundTrialCount: number,
  falseAlarmCount: number,
): LoggedRoomResult {
  const falseAlarmRateFraction =
    noSoundTrialCount > 0 ? falseAlarmCount / noSoundTrialCount : 0;
  return {
    left,
    right,
    noSoundTrialCount,
    falseAlarmCount,
    falseAlarmRateFraction,
    falseAlarmRateAboveLimit:
      falseAlarmRateFraction >
      hearingMethodConfig.falseAlarmRateUnreliableAboveFraction,
  };
}

function finished(
  roomIndex: number,
  result: LoggedRoomResult,
  attempt = 1,
  searchCapDb = 15,
): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt,
    engineSeed: 1000 + roomIndex,
    calibrationIndex: attempt - 1,
    searchCapDb,
    startedAtMs: 1000 * roomIndex,
    endedAtMs: 1000 * roomIndex + 900,
    ending: "finished",
    result,
  };
}

function abandoned(roomIndex: number, searchCapDb = 15): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 2000 + roomIndex,
    calibrationIndex: 0,
    searchCapDb,
    startedAtMs: 0,
    endedAtMs: 500,
    ending: "abandoned",
    result: null,
  };
}

function soundTrial(
  roomIndex: number,
  attempt: number,
  requestedLevelDb: number,
  playedLevelDb: number,
  status: "scored" | "discarded" = "scored",
): VisitTrial {
  const common = {
    order: 1,
    roomIndex,
    attempt,
    trialNumber: 1,
    gapBeforeMs: 2000,
    presentedAtMs: 2000,
    windowStartMs: 2050,
    kind: "sound" as const,
    ear: "left" as const,
    requestedLevelDb,
    playedLevelDb,
    clampLimit: playedLevelDb === requestedLevelDb ? null : "anchorCap",
  } as const;
  if (status === "discarded") {
    return { ...common, status: "discarded", discardedAtMs: 2500 };
  }
  return {
    ...common,
    status: "scored",
    response: "left",
    outcome: "caught",
    answeredAtMs: 2700,
    responseTimeMs: 650,
    scoredAtMs: 2700,
  };
}

function makeLog(parts: {
  readonly visitType?: "quick" | "full";
  readonly roomAttempts: readonly LoggedRoomAttempt[];
  readonly trials?: readonly VisitTrial[];
  readonly ignoredAnswers?: readonly LoggedIgnoredAnswer[];
}): VisitLog {
  const visitType = parts.visitType ?? "quick";
  return {
    formatVersion: 1,
    visitType,
    visitSeed: 42,
    rooms: visitRooms(visitType),
    calibrations: [],
    headphoneChecks: [],
    roomAttempts: parts.roomAttempts,
    trials: parts.trials ?? [],
    ignoredAnswers: parts.ignoredAnswers ?? [],
    pauses: [],
    refusedPlays: [],
  };
}

/** Three rooms with 21 no-sound trials and 2 false alarms in all: below every candidate limit. */
const quietResults = [
  roomResult(found(-40), betterThanFloor, 7, 1),
  roomResult(worseThanCap, unreliable("trialLimit"), 7, 0),
  roomResult(found(-25), found(-10), 7, 1),
] as const;

/** Three rooms with 21 no-sound trials and 6 false alarms in all: above 0.2, each room at most 0.3. */
const guessedResults = [
  roomResult(found(-40), found(-20), 7, 2),
  roomResult(unreliable("trialLimit", "falseAlarmRate"), betterThanFloor, 7, 2),
  roomResult(worseThanCap, found(-30), 7, 2),
] as const;

function attemptsOf(results: readonly LoggedRoomResult[]) {
  return results.map((result, roomIndex) => finished(roomIndex, result));
}

describe("summarizeVisit", () => {
  it("keeps every ear as the search gave it in a visit below the limit (R17.4, R18.1)", () => {
    const summary = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(quietResults) }),
    );
    expect(summary.visitFalseAlarmRateAboveLimit).toBe(false);
    expect(summary.rooms.map((room) => [room.left, room.right])).toEqual(
      quietResults.map((result) => [result.left, result.right]),
    );
    expect(summary.rooms.map((room) => room.room)).toEqual(visitRooms("quick"));
  });

  it("gives the pooled counts, the rate and the limit it judged against (R18.4)", () => {
    const summary = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(guessedResults) }),
    );
    expect(summary.pooledNoSoundTrialCount).toBe(21);
    expect(summary.pooledFalseAlarmCount).toBe(6);
    expect(summary.pooledFalseAlarmRateFraction).toBe(6 / 21);
    expect(summary.visitFalseAlarmRateLimitFraction).toBe(
      visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction,
    );
    expect(summary.rooms.map((room) => room.noSoundTrialCount)).toEqual([
      7, 7, 7,
    ]);
    expect(summary.rooms.map((room) => room.falseAlarmCount)).toEqual([
      2, 2, 2,
    ]);
  });

  it("makes every ear of a marked visit unreliable, with visitFalseAlarmRate last, and offers no repeat (R17.2, R17.3)", () => {
    const summary = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(guessedResults) }),
    );
    expect(summary.visitFalseAlarmRateAboveLimit).toBe(true);
    for (const room of summary.rooms) {
      for (const ear of [room.left, room.right]) {
        expect(ear.state).toBe("unreliable");
        if (ear.state === "unreliable") {
          expect(ear.reasons.at(-1)).toBe("visitFalseAlarmRate");
        }
        expect({
          presentationCount: ear.presentationCount,
          catchCount: ear.catchCount,
          wrongSideCount: ear.wrongSideCount,
          missCount: ear.missCount,
        }).toEqual(counts);
      }
      expect(room.rightMinusLeftDb).toBeNull();
      expect(room.swappedRepeatOffered).toBe(false);
    }
  });

  it("keeps the reasons of an ear the search already marked, in their order (R17.4)", () => {
    const summary = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(guessedResults) }),
    );
    expect(summary.rooms[1]?.left).toEqual({
      ...counts,
      state: "unreliable",
      reasons: ["trialLimit", "falseAlarmRate", "visitFalseAlarmRate"],
    });

    const unmarked = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(quietResults) }),
    );
    expect(unmarked.rooms[1]?.right).toEqual({
      ...counts,
      state: "unreliable",
      reasons: ["trialLimit"],
    });
  });

  it("puts levelNotAsAsked on the floor whose sound was played at another level, and only there (R18.3, D23)", () => {
    const summary = summarizeVisit(
      makeLog({
        roomAttempts: attemptsOf(quietResults),
        trials: [
          soundTrial(0, 1, -25, -25),
          soundTrial(1, 1, 15, 10),
          soundTrial(2, 1, -25, -25),
        ],
      }),
    );
    const [first, second, third] = summary.rooms;
    expect(first?.left).toEqual(quietResults[0].left);
    expect(first?.right).toEqual(quietResults[0].right);
    expect(third?.left).toEqual(quietResults[2].left);
    expect(third?.right).toEqual(quietResults[2].right);
    expect(second?.left).toEqual({
      ...counts,
      state: "unreliable",
      reasons: ["levelNotAsAsked"],
    });
    expect(second?.right).toEqual({
      ...counts,
      state: "unreliable",
      reasons: ["trialLimit", "levelNotAsAsked"],
    });
  });

  it("puts levelNotAsAsked before visitFalseAlarmRate in a marked visit", () => {
    const summary = summarizeVisit(
      makeLog({
        roomAttempts: attemptsOf(guessedResults),
        trials: [soundTrial(1, 1, 15, 10)],
      }),
    );
    expect(summary.rooms[1]?.left).toEqual({
      ...counts,
      state: "unreliable",
      reasons: [
        "trialLimit",
        "falseAlarmRate",
        "levelNotAsAsked",
        "visitFalseAlarmRate",
      ],
    });
  });

  it("ignores a level that differs on a discarded trial or on a trial of an abandoned attempt", () => {
    const summary = summarizeVisit(
      makeLog({
        roomAttempts: [
          abandoned(0),
          finished(0, quietResults[0], 2),
          finished(1, quietResults[1]),
          finished(2, quietResults[2]),
        ],
        trials: [
          soundTrial(0, 1, 15, 10),
          soundTrial(1, 1, 15, 10, "discarded"),
        ],
      }),
    );
    expect(summary.rooms[0]?.left).toEqual(quietResults[0].left);
    expect(summary.rooms[1]?.left).toEqual(quietResults[1].left);
  });

  it("leaves an abandoned attempt out of the pooled counts and takes the room's finished attempt (R17.1, D12)", () => {
    const summary = summarizeVisit(
      makeLog({
        roomAttempts: [
          finished(0, quietResults[0], 1, 15),
          abandoned(1, 15),
          finished(1, quietResults[1], 2, 5),
          finished(2, quietResults[2], 1, 10),
        ],
      }),
    );
    expect(summary.pooledNoSoundTrialCount).toBe(21);
    expect(summary.pooledFalseAlarmCount).toBe(2);
    expect(summary.rooms.map((room) => room.searchCapDb)).toEqual([15, 5, 10]);
    expect(summary.rooms[1]?.right).toEqual(quietResults[1].right);
  });

  it.each([
    [-30, -16, 14, false],
    [-30, -15, 15, true],
    [-15, -30, -15, true],
  ] as const)(
    "with left %d dB and right %d dB gives a right-minus-left difference of %d dB and an offer of %s (R18.2, D24)",
    (leftDb, rightDb, differenceDb, offered) => {
      const summary = summarizeVisit(
        makeLog({
          roomAttempts: attemptsOf([
            roomResult(found(leftDb), found(rightDb), 7, 0),
            ...quietResults.slice(1),
          ]),
        }),
      );
      expect(summary.rooms[0]?.rightMinusLeftDb).toBe(differenceDb);
      expect(summary.rooms[0]?.swappedRepeatOffered).toBe(offered);
    },
  );

  it("gives no difference and no offer unless both ears are found", () => {
    const summary = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(quietResults) }),
    );
    expect(summary.rooms[0]?.rightMinusLeftDb).toBeNull();
    expect(summary.rooms[0]?.swappedRepeatOffered).toBe(false);
    expect(summary.rooms[2]?.rightMinusLeftDb).toBe(15);
    expect(summary.rooms[2]?.swappedRepeatOffered).toBe(true);
  });

  it("counts the ignored answers (R18.4)", () => {
    const ignored: LoggedIgnoredAnswer[] = [
      { atMs: 100, side: "left", roomIndex: 0, attempt: 1 },
      { atMs: 200, side: "right", roomIndex: 0, attempt: 1 },
      { atMs: 300, side: "right", roomIndex: 2, attempt: 1 },
    ];
    const summary = summarizeVisit(
      makeLog({
        roomAttempts: attemptsOf(quietResults),
        ignoredAnswers: ignored,
      }),
    );
    expect(summary.ignoredAnswerCount).toBe(3);
  });

  it("judges against the limit of its settings", () => {
    const log = makeLog({ roomAttempts: attemptsOf(guessedResults) });
    const summary = summarizeVisit(log, {
      swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
      visitFalseAlarmRateUnreliableAboveFraction:
        hearingMethodConfig.falseAlarmRateUnreliableAboveFraction,
    });
    expect(summary.visitFalseAlarmRateAboveLimit).toBe(false);
    expect(summary.rooms[0]?.left).toEqual(guessedResults[0].left);
    expect(summary.rooms[0]?.rightMinusLeftDb).toBe(20);
    expect(summary.rooms[0]?.swappedRepeatOffered).toBe(true);
  });

  it("returns a frozen summary", () => {
    const summary = summarizeVisit(
      makeLog({ roomAttempts: attemptsOf(guessedResults) }),
    );
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.rooms)).toBe(true);
    for (const room of summary.rooms) {
      expect(Object.isFrozen(room)).toBe(true);
      expect(Object.isFrozen(room.left)).toBe(true);
      expect(Object.isFrozen(room.right)).toBe(true);
      if (room.left.state === "unreliable") {
        expect(Object.isFrozen(room.left.reasons)).toBe(true);
      }
    }
  });

  it("throws a RangeError for a room without a finished attempt", () => {
    expect(() =>
      summarizeVisit(
        makeLog({
          roomAttempts: [
            finished(0, quietResults[0]),
            abandoned(1),
            finished(2, quietResults[2]),
          ],
        }),
      ),
    ).toThrow(RangeError);
  });
});

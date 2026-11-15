import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { VisitToSave } from "./result-page-types";
import {
  parseSavedVisitPayload,
  savedVisitPayloadJson,
} from "./saved-visit-payload";
import { summarizeVisit } from "./summarize-visit";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  VisitLog,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Visits made with summarizeVisit from hand-built visit logs, and payloads changed by hand to
// break one rule of "Checking a payload" at a time.

const counts = {
  presentationCount: 12,
  catchCount: 6,
  wrongSideCount: 1,
  missCount: 5,
};

function found(thresholdDb: number): LoggedEarResult {
  return { ...counts, state: "found", thresholdDb };
}

function attempt(
  roomIndex: number,
  left: LoggedEarResult,
  right: LoggedEarResult,
  falseAlarmCount: number,
): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 1000 + roomIndex,
    calibrationIndex: 0,
    searchCapDb: 15,
    startedAtMs: 100000 * roomIndex,
    endedAtMs: 100000 * roomIndex + 90000,
    ending: "finished",
    result: {
      left,
      right,
      noSoundTrialCount: 7,
      falseAlarmCount,
      falseAlarmRateFraction: falseAlarmCount / 7,
      falseAlarmRateAboveLimit: falseAlarmCount / 7 > 0.3,
    },
  };
}

function visitOf(falseAlarmsPerRoom: number, visitLimitFraction?: number) {
  const visitLog: VisitLog = {
    formatVersion: 1,
    visitType: "quick",
    visitSeed: 42,
    rooms: visitRooms("quick"),
    calibrations: [],
    headphoneChecks: [],
    roomAttempts: [
      attempt(0, found(-40), found(-20), falseAlarmsPerRoom),
      attempt(
        1,
        { ...counts, state: "betterThanFloor" },
        { ...counts, state: "worseThanCap" },
        falseAlarmsPerRoom,
      ),
      attempt(
        2,
        { ...counts, state: "unreliable", reasons: ["trialLimit"] },
        found(-30),
        falseAlarmsPerRoom,
      ),
    ],
    trials: [],
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
  const summary =
    visitLimitFraction === undefined
      ? summarizeVisit(visitLog)
      : summarizeVisit(visitLog, {
          swappedRepeatDifferenceDb:
            hearingMethodConfig.swappedRepeatDifferenceDb,
          visitFalseAlarmRateUnreliableAboveFraction: visitLimitFraction,
        });
  return { visitLog, summary } satisfies VisitToSave;
}

const visit = visitOf(1);
const markedVisit = visitOf(2);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payloads are changed by hand here
type Json = any;

function payloadOf(source: VisitToSave = visit): Json {
  return JSON.parse(savedVisitPayloadJson(source));
}

/** The payload of `source` with one change, read back for a quick visit. */
function parsedAfter(
  change: (payload: Json) => void,
  source: VisitToSave = visit,
) {
  const payload = payloadOf(source);
  change(payload);
  return parseSavedVisitPayload(JSON.stringify(payload), "quick");
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe("savedVisitPayloadJson", () => {
  it("writes the format version, the shipped settings, the summary and the log", () => {
    expect(payloadOf()).toEqual({
      formatVersion: 1,
      floorDb: hearingMethodConfig.floorDb,
      swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
      summary: JSON.parse(JSON.stringify(visit.summary)),
      visitLog: JSON.parse(JSON.stringify(visit.visitLog)),
    });
  });

  it("takes other settings when given", () => {
    const payload = JSON.parse(
      savedVisitPayloadJson(visit, {
        floorDb: -80,
        swappedRepeatDifferenceDb: 10,
      }),
    );
    expect(payload.floorDb).toBe(-80);
    expect(payload.swappedRepeatDifferenceDb).toBe(10);
  });
});

describe("parseSavedVisitPayload", () => {
  it("reads back a payload deep-equal to the JSON round trip of its visit", () => {
    const parsed = parseSavedVisitPayload(
      savedVisitPayloadJson(visit),
      "quick",
    );
    expect(parsed).toEqual({
      formatVersion: 1,
      floorDb: hearingMethodConfig.floorDb,
      swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
      summary: JSON.parse(JSON.stringify(visit.summary)),
      visitLog: JSON.parse(JSON.stringify(visit.visitLog)),
    });
    expect(isDeepFrozen(parsed)).toBe(true);
  });

  it("reads a visit marked as a whole, and one judged by another limit", () => {
    expect(markedVisit.summary.visitFalseAlarmRateAboveLimit).toBe(true);
    expect(
      parseSavedVisitPayload(savedVisitPayloadJson(markedVisit), "quick"),
    ).not.toBeNull();
    const strict = visitOf(1, 0.125);
    expect(strict.summary.visitFalseAlarmRateAboveLimit).toBe(true);
    expect(
      parseSavedVisitPayload(savedVisitPayloadJson(strict), "quick"),
    ).not.toBeNull();
  });

  it("reads a summary that offers the swapped repeat less often than its difference allows", () => {
    expect(visit.summary.rooms[0]?.swappedRepeatOffered).toBe(true);
    expect(
      parsedAfter((payload) => {
        payload.summary.rooms[0].swappedRepeatOffered = false;
      }),
    ).not.toBeNull();
  });

  it("keeps fields it does not know", () => {
    const parsed = parsedAfter((payload) => {
      payload.visitLog.laterField = { kept: true };
    });
    expect((parsed?.visitLog as unknown as Json).laterField).toEqual({
      kept: true,
    });
  });

  describe("rule 1: the payload's own fields", () => {
    it.each([
      ["text that is not JSON", "{not json"],
      ["JSON null", "null"],
      ["a JSON list", "[]"],
      ["a JSON string", '"payload"'],
      ["the empty string", ""],
    ])("gives null for %s", (_label, text) => {
      expect(parseSavedVisitPayload(text, "quick")).toBeNull();
    });

    it.each<[string, (payload: Json) => void]>([
      ["format version 2", (p) => (p.formatVersion = 2)],
      ["format version as text", (p) => (p.formatVersion = "1")],
      ["no floorDb", (p) => delete p.floorDb],
      ["floorDb as text", (p) => (p.floorDb = "-70")],
      ["floorDb null", (p) => (p.floorDb = null)],
      [
        "a swapped-repeat difference of 0",
        (p) => (p.swappedRepeatDifferenceDb = 0),
      ],
      [
        "a negative swapped-repeat difference",
        (p) => (p.swappedRepeatDifferenceDb = -15),
      ],
      [
        "no swapped-repeat difference",
        (p) => delete p.swappedRepeatDifferenceDb,
      ],
      ["a summary that is a list", (p) => (p.summary = [])],
      ["no summary", (p) => delete p.summary],
      ["a log that is null", (p) => (p.visitLog = null)],
      ["no log", (p) => delete p.visitLog],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });
  });

  describe("rule 2: the log", () => {
    it.each<[string, (payload: Json) => void]>([
      ["log format version 2", (p) => (p.visitLog.formatVersion = 2)],
      ["another visit type", (p) => (p.visitLog.visitType = "medium")],
      ["a negative seed", (p) => (p.visitLog.visitSeed = -1)],
      ["a seed of 2³²", (p) => (p.visitLog.visitSeed = 2 ** 32)],
      ["a seed that is not whole", (p) => (p.visitLog.visitSeed = 1.5)],
      ["rooms that are not a list", (p) => (p.visitLog.rooms = {})],
      ["no rooms", (p) => (p.visitLog.rooms = [])],
      ["a room index out of place", (p) => (p.visitLog.rooms[1].roomIndex = 2)],
      ["an unknown room", (p) => (p.visitLog.rooms[0].roomId = "garage")],
      [
        "a room used twice",
        (p) => (p.visitLog.rooms[1].roomId = p.visitLog.rooms[0].roomId),
      ],
      ["a pitch of 0", (p) => (p.visitLog.rooms[0].frequencyHz = 0)],
      ["a pitch as text", (p) => (p.visitLog.rooms[0].frequencyHz = "1000")],
      ["a room that is not an object", (p) => (p.visitLog.rooms[0] = 1)],
      ["calibrations not a list", (p) => (p.visitLog.calibrations = null)],
      ["headphoneChecks not a list", (p) => (p.visitLog.headphoneChecks = {})],
      ["roomAttempts not a list", (p) => delete p.visitLog.roomAttempts],
      ["trials not a list", (p) => (p.visitLog.trials = "[]")],
      ["ignoredAnswers not a list", (p) => (p.visitLog.ignoredAnswers = 0)],
      ["pauses not a list", (p) => delete p.visitLog.pauses],
      ["refusedPlays not a list", (p) => (p.visitLog.refusedPlays = {})],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });

    it("gives null when the log's visit type differs from the envelope's", () => {
      expect(
        parseSavedVisitPayload(savedVisitPayloadJson(visit), "full"),
      ).toBeNull();
    });
  });

  describe("rule 3: one room summary per room of the log", () => {
    it.each<[string, (payload: Json) => void]>([
      ["a room summary too few", (p) => p.summary.rooms.pop()],
      [
        "a room summary too many",
        (p) => p.summary.rooms.push(p.summary.rooms[0]),
      ],
      ["rooms that are not a list", (p) => (p.summary.rooms = {})],
      [
        "a room that differs from the log's",
        (p) => (p.summary.rooms[0].room.frequencyHz = 1001),
      ],
      [
        "a room with a field the log's room does not have",
        (p) => (p.summary.rooms[0].room.extra = 1),
      ],
      ["rooms in another order", (p) => p.summary.rooms.reverse()],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });

    it("reads a room whose fields are in another order", () => {
      expect(
        parsedAfter((p) => {
          const { roomIndex, roomId, frequencyHz } = p.summary.rooms[0].room;
          p.summary.rooms[0].room = { frequencyHz, roomId, roomIndex };
        }),
      ).not.toBeNull();
    });
  });

  describe("rule 4: each room summary and its ear results", () => {
    it.each<[string, (payload: Json) => void]>([
      [
        "a room summary that is not an object",
        (p) => (p.summary.rooms[0] = []),
      ],
      [
        "a cap that is not finite",
        (p) => (p.summary.rooms[0].searchCapDb = null),
      ],
      [
        "no-sound trials not whole",
        (p) => (p.summary.rooms[0].noSoundTrialCount = 6.5),
      ],
      [
        "negative no-sound trials",
        (p) => (p.summary.rooms[0].noSoundTrialCount = -1),
      ],
      [
        "more false alarms than no-sound trials",
        (p) => (p.summary.rooms[0].falseAlarmCount = 8),
      ],
      [
        "false alarms as text",
        (p) => (p.summary.rooms[0].falseAlarmCount = "1"),
      ],
      ["an ear that is not an object", (p) => (p.summary.rooms[1].left = null)],
      ["an unknown state", (p) => (p.summary.rooms[1].left.state = "lost")],
      ["a negative count", (p) => (p.summary.rooms[1].left.catchCount = -1)],
      [
        "a count that is not whole",
        (p) => (p.summary.rooms[1].right.missCount = 0.5),
      ],
      [
        "a missing count",
        (p) => delete p.summary.rooms[1].right.presentationCount,
      ],
      [
        "a found ear without a threshold",
        (p) => delete p.summary.rooms[2].right.thresholdDb,
      ],
      [
        "a found ear with a threshold as text",
        (p) => (p.summary.rooms[2].right.thresholdDb = "-30"),
      ],
      [
        "an unreliable ear without reasons",
        (p) => (p.summary.rooms[2].left.reasons = []),
      ],
      [
        "an unreliable ear with reasons that are not a list",
        (p) => (p.summary.rooms[2].left.reasons = "trialLimit"),
      ],
      [
        "an unknown reason",
        (p) => (p.summary.rooms[2].left.reasons = ["tired"]),
      ],
      [
        "a reason given twice",
        (p) => (p.summary.rooms[2].left.reasons = ["trialLimit", "trialLimit"]),
      ],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });

    it("reads every known reason", () => {
      expect(
        parsedAfter((p) => {
          p.summary.rooms[2].left.reasons = [
            "trialLimit",
            "inconsistentCatch",
            "falseAlarmRate",
            "levelNotAsAsked",
          ];
        }),
      ).not.toBeNull();
    });
  });

  describe("rule 5: the difference", () => {
    it.each<[string, (payload: Json) => void]>([
      ["a wrong difference", (p) => (p.summary.rooms[0].rightMinusLeftDb = 15)],
      [
        "a difference of the wrong sign",
        (p) => (p.summary.rooms[0].rightMinusLeftDb = -20),
      ],
      [
        "no difference where both are found",
        (p) => (p.summary.rooms[0].rightMinusLeftDb = null),
      ],
      [
        "a difference where one is not found",
        (p) => (p.summary.rooms[2].rightMinusLeftDb = 0),
      ],
      [
        "a missing difference",
        (p) => delete p.summary.rooms[1].rightMinusLeftDb,
      ],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });
  });

  describe("rule 6: the offer of the swapped repeat", () => {
    it.each<[string, (payload: Json) => void]>([
      [
        "an offer that is not a boolean",
        (p) => (p.summary.rooms[0].swappedRepeatOffered = "yes"),
      ],
      [
        "an offer where there is no difference",
        (p) => (p.summary.rooms[1].swappedRepeatOffered = true),
      ],
      [
        "an offer below the saved difference",
        (p) => (p.swappedRepeatDifferenceDb = 25),
      ],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });
  });

  describe("rule 7: the pooled counts and the visit-level rule", () => {
    it.each<[string, (payload: Json) => void]>([
      [
        "pooled no-sound trials that are not the sum",
        (p) => (p.summary.pooledNoSoundTrialCount = 20),
      ],
      [
        "pooled false alarms that are not the sum",
        (p) => (p.summary.pooledFalseAlarmCount = 2),
      ],
      [
        "a rate that is not the quotient",
        (p) => (p.summary.pooledFalseAlarmRateFraction = 0.15),
      ],
      ["a limit of 0", (p) => (p.summary.visitFalseAlarmRateLimitFraction = 0)],
      [
        "a limit above 1",
        (p) => (p.summary.visitFalseAlarmRateLimitFraction = 1.5),
      ],
      [
        "a limit as text",
        (p) => (p.summary.visitFalseAlarmRateLimitFraction = "0.2"),
      ],
      [
        "a marking the counts do not give",
        (p) => (p.summary.visitFalseAlarmRateAboveLimit = true),
      ],
      [
        "a marking that is not a boolean",
        (p) => (p.summary.visitFalseAlarmRateAboveLimit = 0),
      ],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });

    it.each<[string, (payload: Json) => void]>([
      [
        "a marked visit not marked",
        (p) => (p.summary.visitFalseAlarmRateAboveLimit = false),
      ],
      [
        "a marked visit with an ear that is not unreliable",
        (p) => {
          p.summary.rooms[1].left = { ...counts, state: "betterThanFloor" };
        },
      ],
      [
        "a marked visit whose last reason is another",
        (p) => p.summary.rooms[2].left.reasons.reverse(),
      ],
    ])("gives null for %s", (_label, change) => {
      expect(markedVisit.summary.rooms[0]?.left.state).toBe("unreliable");
      expect(parsedAfter(change, markedVisit)).toBeNull();
    });

    it("gives a rate of 0 without no-sound trials", () => {
      expect(
        parsedAfter((p) => {
          for (const room of p.summary.rooms) {
            room.noSoundTrialCount = 0;
            room.falseAlarmCount = 0;
          }
          p.summary.pooledNoSoundTrialCount = 0;
          p.summary.pooledFalseAlarmCount = 0;
          p.summary.pooledFalseAlarmRateFraction = 0;
        }),
      ).not.toBeNull();
    });
  });

  describe("rule 8: the ignored answers", () => {
    it.each<[string, (payload: Json) => void]>([
      ["a negative count", (p) => (p.summary.ignoredAnswerCount = -1)],
      [
        "a count that is not whole",
        (p) => (p.summary.ignoredAnswerCount = 0.5),
      ],
      ["no count", (p) => delete p.summary.ignoredAnswerCount],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(change)).toBeNull();
    });
  });

  it("never throws for any string", () => {
    const text = savedVisitPayloadJson(visit);
    const strings = [
      "",
      " ",
      "{}",
      "true",
      "0",
      "[".repeat(100000),
      `${"[".repeat(5000)}${"]".repeat(5000)}`,
      `{"formatVersion":1,"floorDb":-70,"swappedRepeatDifferenceDb":15,"summary":{},"visitLog":${"[".repeat(5000)}${"]".repeat(5000)}}`,
      text.replace(
        '"rooms":[',
        `"deep":${"[".repeat(5000)}${"]".repeat(5000)},"rooms":[`,
      ),
      '{"__proto__":{"formatVersion":1}}',
      text.replaceAll("{", '{"__proto__":null,'),
    ];
    for (let length = 0; length <= text.length; length += 37) {
      strings.push(text.slice(0, length));
    }
    for (let position = 0; position < text.length; position += 53) {
      strings.push(text.slice(0, position) + text.slice(position + 1));
      strings.push(`${text.slice(0, position)}"${text.slice(position)}`);
    }
    for (const candidate of strings) {
      expect(() => parseSavedVisitPayload(candidate, "quick")).not.toThrow();
    }
  });
});

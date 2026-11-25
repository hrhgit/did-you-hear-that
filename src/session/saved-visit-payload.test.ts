import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { VisitToSave } from "./result-page-types";
import {
  parseSavedVisitPayload,
  savedVisitPayloadJson,
} from "./saved-visit-payload";
import { summarizeVisit } from "./summarize-visit";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  SwappedRepeatRun,
  VisitLog,
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
    visitType: "full",
    visitSeed: 42,
    rooms: threeRooms,
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

/** A finished swapped repeat of floor 0 of `visit`, which offers it: one caught sound on each ear. */
function repeatOfFloor0(runNumber = 1): SwappedRepeatRun {
  const firstRun = visit.summary.rooms[0]!;
  const recorder = createVisitLogRecorder({
    visitType: "full",
    visitSeed: 42,
    rooms: threeRooms,
    startedAtMs: 0,
  });
  const attemptNumber = recorder.attemptStarted({
    roomIndex: 0,
    engineSeed: 77,
    calibrationIndex: 0,
    searchCapDb: firstRun.searchCapDb,
    startedAtMs: 400_000,
  });
  for (const [trialNumber, ear] of [
    [1, "left"],
    [2, "right"],
  ] as const) {
    const windowStartMs = 400_050 + 4000 * trialNumber;
    recorder.trialScored(
      {
        roomIndex: 0,
        attempt: attemptNumber,
        trialNumber,
        gapBeforeMs: 2000,
        presentedAtMs: windowStartMs - 50,
        windowStartMs,
        kind: "sound",
        ear,
        requestedLevelDb: -25,
        playedLevelDb: -25,
        clampLimit: null,
      },
      {
        response: ear,
        outcome: "caught",
        answeredAtMs: windowStartMs + 600,
        scoredAtMs: windowStartMs + 600,
      },
    );
  }
  recorder.attemptEnded({
    roomIndex: 0,
    attempt: attemptNumber,
    endedAtMs: 490_000,
    ending: "finished",
    result: {
      left: found(-40),
      right: found(-20),
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
        answeredAtMs: 395_000,
      },
    ],
    firstRun,
  });
}

const repeated: VisitToSave = { ...visit, swappedRepeats: [repeatOfFloor0()] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payloads are changed by hand here
type Json = any;

function payloadOf(source: VisitToSave = visit): Json {
  return JSON.parse(savedVisitPayloadJson(source));
}

/** The payload of `source` with one change, read back for a full visit. */
function parsedAfter(
  change: (payload: Json) => void,
  source: VisitToSave = visit,
) {
  const payload = payloadOf(source);
  change(payload);
  return parseSavedVisitPayload(JSON.stringify(payload), "full");
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

  it("writes a visit without swapped repeats byte for byte as before the swapped-repeat spec, with no key for them (swapped-repeat R13.1)", () => {
    const before = JSON.stringify({
      formatVersion: 1,
      floorDb: hearingMethodConfig.floorDb,
      swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
      summary: visit.summary,
      visitLog: visit.visitLog,
    });
    expect(savedVisitPayloadJson(visit)).toBe(before);
    expect(savedVisitPayloadJson({ ...visit, swappedRepeats: [] })).toBe(
      before,
    );
    expect(Object.keys(payloadOf())).not.toContain("swappedRepeats");
  });

  it("writes the swapped repeats unchanged under their own key after the log, with format version 1 (swapped-repeat R13.1, R13.2)", () => {
    const text = savedVisitPayloadJson(repeated);
    const payload = JSON.parse(text);
    expect(Object.keys(payload)).toEqual([
      "formatVersion",
      "floorDb",
      "swappedRepeatDifferenceDb",
      "summary",
      "visitLog",
      "swappedRepeats",
    ]);
    expect(payload.formatVersion).toBe(1);
    expect(payload.swappedRepeats).toEqual(
      JSON.parse(JSON.stringify(repeated.swappedRepeats)),
    );
    expect(text.startsWith(savedVisitPayloadJson(visit).slice(0, -1))).toBe(
      true,
    );
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
  it("keeps a found range in the log and summary and reads other ears without it", () => {
    const range = { lowDb: -45.2, highDb: -39.5 };
    const first = visit.visitLog.roomAttempts[0]!;
    const visitLog: VisitLog = {
      ...visit.visitLog,
      roomAttempts: [
        {
          ...first,
          result: { ...first.result!, left: { ...found(-40), ...range } },
        },
        ...visit.visitLog.roomAttempts.slice(1),
      ],
    };
    const summary = summarizeVisit(visitLog);
    const parsed = parseSavedVisitPayload(
      savedVisitPayloadJson({ ...visit, visitLog, summary }),
      "full",
    );
    expect(parsed?.visitLog.roomAttempts[0]?.result?.left).toMatchObject(range);
    expect(parsed?.summary.rooms[0]?.left).toMatchObject(range);
    expect(parsed?.summary.rooms[0]?.right).toEqual(found(-20));
  });

  it("rejects invalid range endpoints in a summary or log", () => {
    expect(
      parsedAfter((p) => {
        p.summary.rooms[0].left.lowDb = -38;
      }),
    ).toBeNull();
    expect(
      parsedAfter((p) => {
        p.visitLog.roomAttempts[0].result.left.highDb = "unknown";
      }),
    ).toBeNull();
  });

  it("reads back a payload deep-equal to the JSON round trip of its visit", () => {
    const parsed = parseSavedVisitPayload(savedVisitPayloadJson(visit), "full");
    expect(parsed).toEqual({
      formatVersion: 1,
      floorDb: hearingMethodConfig.floorDb,
      swappedRepeatDifferenceDb: hearingMethodConfig.swappedRepeatDifferenceDb,
      summary: JSON.parse(JSON.stringify(visit.summary)),
      visitLog: JSON.parse(JSON.stringify(visit.visitLog)),
      swappedRepeats: [],
    });
    expect(isDeepFrozen(parsed)).toBe(true);
  });

  it.each(["quick", "adaptive"])(
    "retains the %s search method in saved visits",
    (method) => {
      const parsed = parsedAfter((payload) => {
        payload.visitLog.searchMethod = method;
      });
      expect(parsed?.visitLog.searchMethod).toBe(method);
    },
  );

  it("reads a visit marked as a whole, and one judged by another limit", () => {
    expect(markedVisit.summary.visitFalseAlarmRateAboveLimit).toBe(true);
    expect(
      parseSavedVisitPayload(savedVisitPayloadJson(markedVisit), "full"),
    ).not.toBeNull();
    const strict = visitOf(1, 0.125);
    expect(strict.summary.visitFalseAlarmRateAboveLimit).toBe(true);
    expect(
      parseSavedVisitPayload(savedVisitPayloadJson(strict), "full"),
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

  describe("swapped repeats (swapped-repeat R13.3, R13.4, D17)", () => {
    it("reads a visit with records back deep-equal to their JSON round trip, deeply frozen", () => {
      const parsed = parseSavedVisitPayload(
        savedVisitPayloadJson(repeated),
        "full",
      );
      expect(parsed?.swappedRepeats).toEqual(
        JSON.parse(JSON.stringify(repeated.swappedRepeats)),
      );
      expect(parsed?.swappedRepeats).toEqual(repeated.swappedRepeats);
      expect(parsed?.summary).toEqual(
        JSON.parse(JSON.stringify(visit.summary)),
      );
      expect(isDeepFrozen(parsed)).toBe(true);
    });

    it("reads a payload without the key with an empty list, and every other field as before", () => {
      const parsed = parseSavedVisitPayload(
        savedVisitPayloadJson(visit),
        "full",
      );
      expect(parsed?.swappedRepeats).toEqual([]);
      expect(Object.isFrozen(parsed?.swappedRepeats)).toBe(true);
      expect(
        parsedAfter((payload) => {
          payload.swappedRepeats = [];
        })?.swappedRepeats,
      ).toEqual([]);
    });

    it.each<[string, (payload: Json) => void]>([
      [
        "a list that is not an array",
        (payload) => (payload.swappedRepeats = {}),
      ],
      ["a list that is null", (payload) => (payload.swappedRepeats = null)],
      [
        "a record of another format",
        (payload) => (payload.swappedRepeats[0].formatVersion = 2),
      ],
      [
        "a record of a floor that offers no repeat",
        (payload) => (payload.swappedRepeats[0].roomIndex = 1),
      ],
      [
        "two records of one floor",
        (payload) =>
          payload.swappedRepeats.push({
            ...payload.swappedRepeats[0],
            runNumber: 2,
          }),
      ],
      [
        "a sound trial on its own ear's earpiece",
        (payload) => (payload.swappedRepeats[0].trials[0].earpiece = "left"),
      ],
      [
        "an outcome that does not follow from the record",
        (payload) => (payload.swappedRepeats[0].outcome = "followsEarpiece"),
      ],
    ])("gives null for %s", (_label, change) => {
      expect(parsedAfter(() => undefined, repeated)).not.toBeNull();
      expect(parsedAfter(change, repeated)).toBeNull();
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
      expect(parseSavedVisitPayload(text, "full")).toBeNull();
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
    it("reads a log saved as the dropped quick visit as a full visit", () => {
      const parsed = parsedAfter((p) => (p.visitLog.visitType = "quick"));
      expect(parsed?.visitLog.visitType).toBe("full");
      expect(parsed?.summary).toEqual(payloadOf().summary);
    });

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
  });

  describe('the calibration\'s anchor (audible-start design.md, "Checking a payload"; R11.1, R11.5)', () => {
    const calibration = {
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
    };
    const withCalibration = (entry: Record<string, unknown>): VisitToSave => ({
      ...visit,
      visitLog: {
        ...visit.visitLog,
        calibrations: [entry as unknown as VisitLog["calibrations"][number]],
      },
    });

    it("reads a payload written before audible-start, whose calibration has no anchor, as it is", () => {
      const before = withCalibration(calibration);
      const parsed = parsedAfter(() => undefined, before);
      expect(parsed?.visitLog).toEqual(
        JSON.parse(JSON.stringify(before.visitLog)),
      );
      expect(
        Object.hasOwn(parsed?.visitLog.calibrations[0] ?? {}, "anchor"),
      ).toBe(false);
    });

    it.each(["music", "hiss", "preset"])(
      "reads a calibration with the %s anchor and keeps it",
      (anchor) => {
        const parsed = parsedAfter(
          () => undefined,
          withCalibration({ ...calibration, anchor }),
        );
        expect(parsed?.visitLog.calibrations[0]?.anchor).toBe(anchor);
      },
    );

    it.each<[string, unknown]>([
      ["hands, which no calibration is logged with", "hands"],
      ["loading", "loading"],
      ["Music in capitals", "Music"],
      ["an empty name", ""],
      ["null", null],
      ["a number", 1],
      ["an object", {}],
    ])("gives null for an anchor of %s, and never throws", (_label, anchor) => {
      expect(() =>
        parsedAfter(
          () => undefined,
          withCalibration({ ...calibration, anchor }),
        ),
      ).not.toThrow();
      expect(
        parsedAfter(
          () => undefined,
          withCalibration({ ...calibration, anchor }),
        ),
      ).toBeNull();
    });

    it("gives null when any one of several calibrations breaks the rule", () => {
      expect(
        parsedAfter((p) => {
          p.visitLog.calibrations = [
            { ...calibration, anchor: "music" },
            { ...calibration, calibrationIndex: 1, anchor: "hands" },
          ];
        }),
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
      expect(() => parseSavedVisitPayload(candidate, "full")).not.toThrow();
    }
  });
});

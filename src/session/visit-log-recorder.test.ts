import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { PlayedTrial } from "./visit-log-recorder";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type { LoggedRoomResult, VisitLog } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

/** The visit begins at this time on the timer's clock, so every logged time is this much less. */
const visitStartMs = 100_000;

function recorder() {
  return createVisitLogRecorder({
    visitType: "quick",
    visitSeed: 4242,
    rooms: visitRooms("quick"),
    startedAtMs: visitStartMs,
  });
}

const roomTops = {
  cellar: 15,
  corridor: 12.5,
  nursery: 15,
  stairs: 9.25,
  attic: 3,
};

function soundTrial(overrides: Partial<PlayedTrial> = {}): PlayedTrial {
  return {
    kind: "sound",
    roomIndex: 0,
    attempt: 1,
    trialNumber: 1,
    gapBeforeMs: 2100,
    presentedAtMs: visitStartMs + 5000,
    windowStartMs: visitStartMs + 5050,
    ear: "left",
    requestedLevelDb: -25,
    playedLevelDb: -25,
    clampLimit: null,
    ...overrides,
  } as PlayedTrial;
}

function noSoundTrial(overrides: Partial<PlayedTrial> = {}): PlayedTrial {
  return {
    kind: "noSound",
    roomIndex: 0,
    attempt: 1,
    trialNumber: 2,
    gapBeforeMs: 1700,
    presentedAtMs: visitStartMs + 9000,
    windowStartMs: visitStartMs + 9050,
    ...overrides,
  } as PlayedTrial;
}

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

const roomResult = {
  left: { ...counts, state: "found", thresholdDb: -40 },
  right: { ...counts, state: "unreliable", reasons: ["trialLimit"] },
  noSoundTrialCount: 6,
  falseAlarmCount: 1,
  falseAlarmRateFraction: 1 / 6,
  falseAlarmRateAboveLimit: false,
} satisfies LoggedRoomResult;

/** A recorder with one entry of every kind, and the log it gives. */
function fullLog(): VisitLog {
  const visit = recorder();
  const calibration = visit.calibrationKept({
    settingDb: -31,
    roomTopLevelDb: roomTops,
    keptAtMs: visitStartMs + 1000,
  });
  visit.headphoneCheckAnswered({
    calibrationIndex: calibration.calibrationIndex,
    answer: "left",
    judgement: "correct",
    answeredAtMs: visitStartMs + 2000,
  });
  const attempt = visit.attemptStarted({
    roomIndex: 0,
    engineSeed: 99,
    calibrationIndex: 0,
    searchCapDb: 10,
    startedAtMs: visitStartMs + 3000,
  });
  visit.trialScored(soundTrial(), {
    response: "left",
    outcome: "caught",
    answeredAtMs: visitStartMs + 5600,
    scoredAtMs: visitStartMs + 5600,
  });
  visit.answerIgnored({
    atMs: visitStartMs + 5700,
    side: "right",
    roomIndex: 0,
    attempt,
  });
  visit.trialScored(noSoundTrial(), {
    response: "none",
    outcome: "noResponse",
    answeredAtMs: null,
    scoredAtMs: visitStartMs + 9050 + hearingMethodConfig.responseWindowMs,
  });
  visit.pauseStarted({
    reason: "hidden",
    stage: "room",
    roomIndex: 0,
    startedAtMs: visitStartMs + 13_000,
  });
  visit.trialDiscarded(
    soundTrial({ trialNumber: 3, presentedAtMs: visitStartMs + 12_900 }),
    visitStartMs + 13_000,
  );
  visit.pauseEnded(visitStartMs + 20_000);
  visit.playRefused({
    atMs: visitStartMs + 22_000,
    roomIndex: 0,
    attempt,
    trialNumber: 3,
    reason: "busy",
  });
  visit.attemptEnded({
    roomIndex: 0,
    attempt,
    endedAtMs: visitStartMs + 60_000,
    ending: "finished",
    result: roomResult,
  });
  return visit.log();
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

describe("createVisitLogRecorder", () => {
  it("starts with the visit's type, seed and rooms and empty lists", () => {
    const log = recorder().log();
    expect(log).toEqual({
      formatVersion: 1,
      visitType: "quick",
      visitSeed: 4242,
      rooms: visitRooms("quick"),
      calibrations: [],
      headphoneChecks: [],
      roomAttempts: [],
      trials: [],
      ignoredAnswers: [],
      pauses: [],
      refusedPlays: [],
    });
  });

  it("gives every time relative to the visit's start (R10.5)", () => {
    const log = fullLog();
    expect(log.calibrations[0]?.keptAtMs).toBe(1000);
    expect(log.headphoneChecks[0]?.answeredAtMs).toBe(2000);
    expect(log.roomAttempts[0]).toMatchObject({
      startedAtMs: 3000,
      endedAtMs: 60_000,
    });
    expect(log.trials[0]).toMatchObject({
      presentedAtMs: 5000,
      windowStartMs: 5050,
      answeredAtMs: 5600,
      responseTimeMs: 550,
      scoredAtMs: 5600,
    });
    expect(log.trials[1]).toMatchObject({
      answeredAtMs: null,
      responseTimeMs: null,
      scoredAtMs: 9050 + hearingMethodConfig.responseWindowMs,
    });
    expect(log.trials[2]).toMatchObject({
      presentedAtMs: 12_900,
      discardedAtMs: 13_000,
    });
    expect(log.ignoredAnswers[0]?.atMs).toBe(5700);
    expect(log.pauses[0]).toMatchObject({
      startedAtMs: 13_000,
      endedAtMs: 20_000,
    });
    expect(log.refusedPlays[0]?.atMs).toBe(22_000);
  });

  it("counts decided and discarded trials together from 1 (R10.2)", () => {
    const log = fullLog();
    expect(log.trials.map((trial) => [trial.order, trial.status])).toEqual([
      [1, "scored"],
      [2, "scored"],
      [3, "discarded"],
    ]);
  });

  it("gives a no-sound trial no ear and no level, and a sound trial both levels and the limit", () => {
    const visit = recorder();
    visit.attemptStarted({
      roomIndex: 0,
      engineSeed: 1,
      calibrationIndex: 0,
      searchCapDb: 10,
      startedAtMs: visitStartMs,
    });
    const sound = visit.trialScored(
      soundTrial({
        requestedLevelDb: 15,
        playedLevelDb: 12,
        clampLimit: "ceiling",
      } as Partial<PlayedTrial>),
      {
        response: "none",
        outcome: "missed",
        answeredAtMs: null,
        scoredAtMs: visitStartMs + 7050,
      },
    );
    const noSound = visit.trialDiscarded(noSoundTrial(), visitStartMs + 9100);
    expect(sound).toMatchObject({
      kind: "sound",
      ear: "left",
      requestedLevelDb: 15,
      playedLevelDb: 12,
      clampLimit: "ceiling",
    });
    expect(noSound).toMatchObject({
      kind: "noSound",
      ear: null,
      requestedLevelDb: null,
      playedLevelDb: null,
      clampLimit: null,
    });
  });

  it("numbers the runs of each room from 1 and keeps them in start order", () => {
    const visit = recorder();
    const first = visit.attemptStarted({
      roomIndex: 1,
      engineSeed: 5,
      calibrationIndex: 0,
      searchCapDb: 10,
      startedAtMs: visitStartMs + 100,
    });
    visit.attemptEnded({
      roomIndex: 1,
      attempt: first,
      endedAtMs: visitStartMs + 200,
      ending: "abandoned",
      result: null,
    });
    const second = visit.attemptStarted({
      roomIndex: 1,
      engineSeed: 6,
      calibrationIndex: 1,
      searchCapDb: 5,
      startedAtMs: visitStartMs + 300,
    });
    visit.attemptEnded({
      roomIndex: 1,
      attempt: second,
      endedAtMs: visitStartMs + 400,
      ending: "finished",
      result: roomResult,
    });
    expect([first, second]).toEqual([1, 2]);
    expect(
      visit
        .log()
        .roomAttempts.map((entry) => [
          entry.attempt,
          entry.engineSeed,
          entry.ending,
          entry.result === null,
        ]),
    ).toEqual([
      [1, 5, "abandoned", true],
      [2, 6, "finished", false],
    ]);
  });

  it("keeps a room result without the search's trial records", () => {
    const visit = recorder();
    const attempt = visit.attemptStarted({
      roomIndex: 0,
      engineSeed: 1,
      calibrationIndex: 0,
      searchCapDb: 10,
      startedAtMs: visitStartMs,
    });
    visit.attemptEnded({
      roomIndex: 0,
      attempt,
      endedAtMs: visitStartMs + 1,
      ending: "finished",
      result: { ...roomResult, trials: [] } as LoggedRoomResult,
    });
    expect(visit.log().roomAttempts[0]?.result).toEqual(roomResult);
    expect(visit.log().roomAttempts[0]?.result).not.toHaveProperty("trials");
  });

  it("logs the reason a device change gave to a pause that held", () => {
    const visit = recorder();
    visit.pauseStarted({
      reason: "visitor",
      stage: "room",
      roomIndex: 2,
      startedAtMs: visitStartMs + 10,
    });
    visit.pauseReasonChanged("deviceChanged");
    visit.pauseEnded(visitStartMs + 50);
    expect(visit.log().pauses).toEqual([
      {
        reason: "deviceChanged",
        stage: "room",
        roomIndex: 2,
        startedAtMs: 10,
        endedAtMs: 50,
      },
    ]);
  });

  it("freezes every entry and the log", () => {
    const log = fullLog();
    expect(isDeeplyFrozen(log)).toBe(true);
  });

  it("returns copies, so later entries do not change a log already returned", () => {
    const visit = recorder();
    const before = visit.log();
    visit.calibrationKept({
      settingDb: -30,
      roomTopLevelDb: roomTops,
      keptAtMs: visitStartMs + 1,
    });
    visit.answerIgnored({
      atMs: visitStartMs + 2,
      side: "left",
      roomIndex: 0,
      attempt: 1,
    });
    const after = visit.log();
    expect(before.calibrations).toHaveLength(0);
    expect(before.ignoredAnswers).toHaveLength(0);
    expect(after.calibrations).toHaveLength(1);
    expect(after.ignoredAnswers).toHaveLength(1);
    expect(after.calibrations).not.toBe(before.calibrations);
  });

  it("survives JSON.stringify and JSON.parse unchanged (R10.7)", () => {
    const log = fullLog();
    expect(JSON.parse(JSON.stringify(log))).toStrictEqual(log);
  });

  it("writes a time equal to the visit's start as 0, not -0", () => {
    const visit = recorder();
    visit.answerIgnored({
      atMs: visitStartMs,
      side: "left",
      roomIndex: 0,
      attempt: 1,
    });
    expect(Object.is(visit.log().ignoredAnswers[0]?.atMs, 0)).toBe(true);
  });

  it("refuses a decided trial whose outcome does not fit its kind (TypeError)", () => {
    const visit = recorder();
    expect(() =>
      visit.trialScored(soundTrial(), {
        response: "left",
        outcome: "falseAlarm",
        answeredAtMs: visitStartMs + 5100,
        scoredAtMs: visitStartMs + 5100,
      }),
    ).toThrow(TypeError);
    expect(() =>
      visit.trialScored(noSoundTrial(), {
        response: "right",
        outcome: "caught",
        answeredAtMs: visitStartMs + 9100,
        scoredAtMs: visitStartMs + 9100,
      }),
    ).toThrow(TypeError);
    expect(visit.log().trials).toHaveLength(0);
  });

  it("refuses a time that is not finite", () => {
    const visit = recorder();
    expect(() =>
      visit.answerIgnored({
        atMs: Number.NaN,
        side: "left",
        roomIndex: 0,
        attempt: 1,
      }),
    ).toThrow(RangeError);
  });

  it("gives no log while a room run or a pause is open (D28)", () => {
    const visit = recorder();
    visit.attemptStarted({
      roomIndex: 0,
      engineSeed: 1,
      calibrationIndex: 0,
      searchCapDb: 10,
      startedAtMs: visitStartMs,
    });
    expect(() => visit.log()).toThrow(Error);
    visit.attemptEnded({
      roomIndex: 0,
      attempt: 1,
      endedAtMs: visitStartMs + 1,
      ending: "abandoned",
      result: null,
    });
    visit.pauseStarted({
      reason: "visitor",
      stage: "room",
      roomIndex: 0,
      startedAtMs: visitStartMs + 2,
    });
    expect(() => visit.log()).toThrow(Error);
    visit.pauseEnded(visitStartMs + 3);
    expect(visit.log().pauses).toHaveLength(1);
  });
});

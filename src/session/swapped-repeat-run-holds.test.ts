import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { summarizeVisit } from "./summarize-visit";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import { swappedRepeatRunsHold } from "./swapped-repeat-run-holds";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  RoomSummary,
  SwappedRepeatRun,
  VisitLog,
  VisitSummary,
} from "./visit-flow-types";
import type { PlayedTrial } from "./visit-log-recorder";
import { createVisitLogRecorder } from "./visit-log-recorder";
import { visitRooms } from "./visit-rooms";

// The rules of "Checking a payload" for a saved visit's swapped repeats (swapped-repeat
// design.md, "Saved visits", R13.4): records made as the Repeat_Controller makes them, from a
// run's own recorder log, and then changed by hand to break one rule at a time.

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

function found(thresholdDb: number): LoggedEarResult {
  return { ...counts, state: "found", thresholdDb };
}

const rooms = visitRooms("quick");

function attempt(
  roomIndex: number,
  left: LoggedEarResult,
  right: LoggedEarResult,
  calibrationIndex: number,
): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 1000 + roomIndex,
    calibrationIndex,
    searchCapDb: 15,
    startedAtMs: 100000 * (roomIndex + 1),
    endedAtMs: 100000 * (roomIndex + 1) + 90000,
    ending: "finished",
    result: {
      left,
      right,
      noSoundTrialCount: 6,
      falseAlarmCount: 0,
      falseAlarmRateFraction: 0,
      falseAlarmRateAboveLimit: false,
    },
  };
}

// Floors 0 and 2 offer the repeat; floor 1 does not. Floor 2 ran after a second calibration.
const visitLog: VisitLog = {
  formatVersion: 1,
  visitType: "quick",
  visitSeed: 42,
  rooms,
  calibrations: [],
  headphoneChecks: [],
  roomAttempts: [
    attempt(0, found(-40), found(-20), 0),
    attempt(1, found(-30), found(-30), 0),
    {
      ...attempt(2, found(-20), found(-45), 0),
      ending: "abandoned",
      result: null,
    },
    { ...attempt(2, found(-20), found(-45), 1), attempt: 2 },
  ],
  trials: [],
  ignoredAnswers: [],
  pauses: [],
  refusedPlays: [],
};
const summary: VisitSummary = summarizeVisit(visitLog);

/** A finished repeat of a floor: a caught sound on each ear, a no-sound trial and an ignored answer. */
function recordOf(
  roomIndex: number,
  left: LoggedEarResult,
  right: LoggedEarResult,
  runNumber = 1,
): SwappedRepeatRun {
  const firstRun: RoomSummary = summary.rooms[roomIndex]!;
  const recorder = createVisitLogRecorder({
    visitType: visitLog.visitType,
    visitSeed: visitLog.visitSeed,
    rooms,
    startedAtMs: 0,
  });
  const attemptNumber = recorder.attemptStarted({
    roomIndex,
    engineSeed: 77,
    calibrationIndex: roomIndex === 2 ? 1 : 0,
    searchCapDb: firstRun.searchCapDb,
    startedAtMs: 500_000,
  });
  const trial = (
    trialNumber: number,
    ear: "left" | "right" | null,
  ): PlayedTrial => {
    const common = {
      roomIndex,
      attempt: attemptNumber,
      trialNumber,
      gapBeforeMs: 2000,
      presentedAtMs: 500_000 + 4000 * trialNumber,
      windowStartMs: 500_050 + 4000 * trialNumber,
    };
    return ear === null
      ? { ...common, kind: "noSound" }
      : {
          ...common,
          kind: "sound",
          ear,
          requestedLevelDb: -25,
          playedLevelDb: -25,
          clampLimit: null,
        };
  };
  for (const [trialNumber, ear] of [
    [1, "left"],
    [2, "right"],
    [3, null],
  ] as const) {
    const played = trial(trialNumber, ear);
    recorder.trialScored(played, {
      response: ear ?? "none",
      outcome: ear === null ? "noResponse" : "caught",
      answeredAtMs: ear === null ? null : played.windowStartMs + 600,
      scoredAtMs: played.windowStartMs + (ear === null ? 2000 : 600),
    });
  }
  recorder.answerIgnored({
    atMs: 520_000,
    side: "right",
    roomIndex,
    attempt: attemptNumber,
  });
  recorder.attemptEnded({
    roomIndex,
    attempt: attemptNumber,
    endedAtMs: 590_000,
    ending: "finished",
    result: {
      left,
      right,
      noSoundTrialCount: 1,
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
        answer: "left",
        judgement: "notSwapped",
        earpiece: "left",
        answeredAtMs: 480_000,
      },
      {
        answer: "right",
        judgement: "confirmed",
        earpiece: "left",
        answeredAtMs: 495_000,
      },
    ],
    firstRun,
  });
}

/** Floor 0 again with the left ear 20 dB quieter: the difference stayed with the ears. */
const floor0 = recordOf(0, found(-40), found(-20));
/** Floor 2 again, as run 3: the difference moved with the headphones. */
const floor2 = recordOf(2, found(-45), found(-20), 3);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- records are changed by hand here
type Json = any;

const copyOf = (value: unknown): Json => JSON.parse(JSON.stringify(value));

/** The JSON copy of the records with one change, checked against the visit. */
function holdsAfter(
  change: (runs: Json[]) => void,
  records: readonly SwappedRepeatRun[] = [floor0],
): boolean {
  const runs: Json[] = copyOf(records);
  change(runs);
  return swappedRepeatRunsHold(runs, summary, visitLog);
}

describe("swappedRepeatRunsHold", () => {
  it("holds for no record, for a record of an offered floor, and for records of two floors with rising run numbers", () => {
    expect(floor0.outcome).toBe("followsEar");
    expect(floor2.outcome).toBe("followsEarpiece");
    expect(floor0.trials.map((trial) => trial.earpiece)).toEqual([
      "right",
      "left",
      null,
    ]);
    expect(swappedRepeatRunsHold([], summary, visitLog)).toBe(true);
    expect(swappedRepeatRunsHold(copyOf([floor0]), summary, visitLog)).toBe(
      true,
    );
    expect(
      swappedRepeatRunsHold(copyOf([floor0, floor2]), summary, visitLog),
    ).toBe(true);
    expect(swappedRepeatRunsHold([floor0, floor2], summary, visitLog)).toBe(
      true,
    );
    const unclear = recordOf(0, found(-30), found(-25));
    expect(unclear).toMatchObject({
      outcome: "unclear",
      unclearReason: "differenceShrank",
    });
    expect(swappedRepeatRunsHold(copyOf([unclear]), summary, visitLog)).toBe(
      true,
    );
    const noLevel = recordOf(0, found(-30), {
      ...counts,
      state: "unreliable",
      reasons: ["trialLimit", "inconsistentCatch"],
    });
    expect(noLevel).toMatchObject({
      outcome: "unclear",
      unclearReason: "noLevel",
      rightMinusLeftDb: null,
    });
    expect(swappedRepeatRunsHold(copyOf([noLevel]), summary, visitLog)).toBe(
      true,
    );
  });

  it.each([
    ["an object", {}],
    ["null", null],
    ["a string", "[]"],
    ["a number", 1],
  ])("rule 1: does not hold for a list that is %s", (_label, runs) => {
    expect(swappedRepeatRunsHold(runs, summary, visitLog)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["null", (runs) => (runs[0] = null)],
    ["an array", (runs) => (runs[0] = [])],
    ["a number", (runs) => (runs[0] = 1)],
    ["of format version 2", (runs) => (runs[0].formatVersion = 2)],
    ["without a format version", (runs) => delete runs[0].formatVersion],
  ])("rule 1: does not hold for a record that is %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["no room of the log", (runs) => (runs[0].roomIndex = 3)],
    [
      "a floor that does not offer the repeat",
      (runs) => (runs[0].roomIndex = 1),
    ],
    ["not a whole number", (runs) => (runs[0].roomIndex = 0.5)],
    ["negative", (runs) => (runs[0].roomIndex = -1)],
    ["a string", (runs) => (runs[0].roomIndex = "0")],
    ["missing", (runs) => delete runs[0].roomIndex],
  ])("rule 2: does not hold for a floor that is %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it("rule 2: does not hold for two records of one floor (Q4, decided by the owner on 2026-11-15)", () => {
    const again = recordOf(0, found(-40), found(-20), 2);
    expect(
      swappedRepeatRunsHold(copyOf([floor0, again]), summary, visitLog),
    ).toBe(false);
  });

  it("rule 2: does not hold for a floor whose summary has an ear without a level", () => {
    const changed: VisitSummary = {
      ...summary,
      rooms: summary.rooms.map((room, index) =>
        index === 0
          ? { ...room, right: { ...counts, state: "worseThanCap" } }
          : room,
      ),
    };
    expect(swappedRepeatRunsHold(copyOf([floor0]), changed, visitLog)).toBe(
      false,
    );
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["0", (runs) => (runs[0].runNumber = 0)],
    ["not a whole number", (runs) => (runs[0].runNumber = 1.5)],
    ["a string", (runs) => (runs[0].runNumber = "1")],
    ["missing", (runs) => delete runs[0].runNumber],
  ])("rule 3: does not hold for a run number that is %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["equal", (runs) => (runs[1].runNumber = runs[0].runNumber)],
    ["falling", (runs) => (runs[0].runNumber = 4)],
  ])(
    "rule 3: does not hold for run numbers that are %s along the list",
    (_label, change) => {
      expect(holdsAfter(change, [floor0, floor2])).toBe(false);
    },
  );

  it.each<[string, (runs: Json[]) => void, readonly SwappedRepeatRun[]]>([
    [
      "floor 0 with the second calibration",
      (runs) => (runs[0].calibrationIndex = 1),
      [floor0],
    ],
    [
      "floor 2 with the calibration of its abandoned run",
      (runs) => (runs[0].calibrationIndex = 0),
      [floor2],
    ],
    [
      "a missing calibration",
      (runs) => delete runs[0].calibrationIndex,
      [floor0],
    ],
  ])("rule 4: does not hold for %s", (_label, change, records) => {
    expect(holdsAfter(() => undefined, records)).toBe(true);
    expect(holdsAfter(change, records)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    [
      "as marked",
      (runs) => (runs[0].earpieceOnEar = { left: "left", right: "right" }),
    ],
    ["with a key more", (runs) => (runs[0].earpieceOnEar.middle = "left")],
    ["with a side missing", (runs) => delete runs[0].earpieceOnEar.right],
    ["missing", (runs) => delete runs[0].earpieceOnEar],
  ])("rule 5: does not hold for earpieces %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each(["swapChecks", "trials", "ignoredAnswers", "pauses", "refusedPlays"])(
    "rule 6: does not hold when %s is not an array",
    (field) => {
      expect(holdsAfter((runs) => (runs[0][field] = {}))).toBe(false);
      expect(holdsAfter((runs) => delete runs[0][field])).toBe(false);
    },
  );

  it.each<[string, (runs: Json[]) => void]>([
    ["no swap check", (runs) => (runs[0].swapChecks = [])],
    ["a last swap check heard on the left", (runs) => runs[0].swapChecks.pop()],
    [
      "a last swap check that is no object",
      (runs) => (runs[0].swapChecks[1] = "confirmed"),
    ],
    [
      "a sound trial on its own ear's earpiece",
      (runs) => (runs[0].trials[0].earpiece = "left"),
    ],
    [
      "a sound trial without an earpiece",
      (runs) => delete runs[0].trials[1].earpiece,
    ],
    ["a sound trial without an ear", (runs) => delete runs[0].trials[0].ear],
    [
      "a no-sound trial with an earpiece",
      (runs) => (runs[0].trials[2].earpiece = "left"),
    ],
    [
      "a trial of an unknown kind",
      (runs) => (runs[0].trials[2].kind = "silence"),
    ],
    ["a trial that is no object", (runs) => (runs[0].trials[0] = 1)],
    [
      "an ignored answer on its own side's earpiece",
      (runs) => (runs[0].ignoredAnswers[0].earpiece = "right"),
    ],
    [
      "an ignored answer without a side",
      (runs) => delete runs[0].ignoredAnswers[0].side,
    ],
  ])("rule 6: does not hold for %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["no object", (runs) => (runs[0].attempt = 1)],
    ["of another floor", (runs) => (runs[0].attempt.roomIndex = 2)],
    ["attempt 2", (runs) => (runs[0].attempt.attempt = 2)],
    ["abandoned", (runs) => (runs[0].attempt.ending = "abandoned")],
    ["without a result", (runs) => (runs[0].attempt.result = null)],
  ])("rule 7: does not hold for an attempt that is %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["an unknown state", (runs) => (runs[0].left.state = "loud")],
    ["a missing count", (runs) => delete runs[0].right.catchCount],
    ["a found ear without a level", (runs) => delete runs[0].left.thresholdDb],
    [
      "an unreliable ear without reasons",
      (runs) =>
        (runs[0].left = { ...runs[0].left, state: "unreliable", reasons: [] }),
    ],
    [
      "an unknown reason",
      (runs) =>
        (runs[0].left = {
          ...runs[0].left,
          state: "unreliable",
          reasons: ["tired"],
        }),
    ],
    ["a wrong difference", (runs) => (runs[0].rightMinusLeftDb = 15)],
    [
      "a difference beside an ear without a level",
      (runs) => (runs[0].right = { ...runs[0].right, state: "worseThanCap" }),
    ],
    ["a missing difference", (runs) => delete runs[0].rightMinusLeftDb],
  ])("rule 8: does not hold for %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    [
      "another first difference",
      (runs) => (runs[0].firstRightMinusLeftDb = -20),
    ],
    [
      "a missing first difference",
      (runs) => delete runs[0].firstRightMinusLeftDb,
    ],
  ])("rule 9: does not hold for %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    [
      "a limit that is not a number",
      (runs) => (runs[0].differenceLimitDb = "15"),
    ],
    ["a limit that is null", (runs) => (runs[0].differenceLimitDb = null)],
    ["half the limit 0", (runs) => (runs[0].unclearBelowDb = 0)],
    ["half the limit above the limit", (runs) => (runs[0].unclearBelowDb = 16)],
    ["half the limit missing", (runs) => delete runs[0].unclearBelowDb],
  ])("rule 10: does not hold for %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it.each<[string, (runs: Json[]) => void]>([
    ["another outcome", (runs) => (runs[0].outcome = "followsEarpiece")],
    ["an unknown outcome", (runs) => (runs[0].outcome = "followsBoth")],
    [
      "an unclear reason for an attribution",
      (runs) => (runs[0].unclearReason = "noLevel"),
    ],
    [
      "an outcome that does not follow from the record's own numbers: its ears changed, the outcome kept",
      (runs) => {
        runs[0].right = { ...runs[0].right, thresholdDb: -60 };
        runs[0].rightMinusLeftDb = -20;
      },
    ],
    [
      "a limit above the first run's difference, which offers no repeat",
      (runs) => {
        runs[0].differenceLimitDb = 30;
        runs[0].unclearBelowDb = 15;
      },
    ],
  ])("rule 11: does not hold for %s", (_label, change) => {
    expect(holdsAfter(change)).toBe(false);
  });

  it("rule 11: holds for an outcome worked out again with the record's own limits", () => {
    expect(
      holdsAfter((runs) => {
        runs[0].differenceLimitDb = 20;
        runs[0].unclearBelowDb = 10;
      }),
    ).toBe(true);
  });

  it("never throws on any JSON value, in place of the list or of a record or one of its fields", () => {
    const record: Json = copyOf(floor0);
    const fields = Object.keys(record);
    fc.assert(
      fc.property(
        fc.jsonValue(),
        fc.constantFrom(...fields),
        (value, field) => {
          expect(() =>
            swappedRepeatRunsHold(value, summary, visitLog),
          ).not.toThrow();
          expect(() =>
            swappedRepeatRunsHold([value], summary, visitLog),
          ).not.toThrow();
          const changed = { ...copyOf(floor0), [field]: value };
          expect(() =>
            swappedRepeatRunsHold([changed], summary, visitLog),
          ).not.toThrow();
        },
      ),
      { numRuns: 500 },
    );
    const deep: Json = [];
    let inner: Json = deep;
    for (let depth = 0; depth < 5000; depth += 1) {
      const next: Json = [];
      inner.push(next);
      inner = next;
    }
    expect(() =>
      swappedRepeatRunsHold(
        [{ ...copyOf(floor0), trials: deep }],
        summary,
        visitLog,
      ),
    ).not.toThrow();
    expect(() =>
      swappedRepeatRunsHold(
        JSON.parse('[{"__proto__":{"formatVersion":1}}]'),
        summary,
        visitLog,
      ),
    ).not.toThrow();
  });
});

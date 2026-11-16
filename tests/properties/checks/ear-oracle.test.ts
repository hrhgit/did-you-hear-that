import { describe, expect, it } from "vitest";
import { hearingMethodConfig as shippedHearingMethodConfig } from "../../../src/config/hearing-method-config";
import type {
  Direction,
  Ear,
  SoundOutcome,
  TrialRecord,
  VisitorResponse,
} from "../../../src/engine/search-types";
import { replayEar, replayRoom, type OracleEnding } from "./ear-oracle";

/**
 * The shipped settings with the starting level these examples were written for, 25 dB below the
 * anchor. The shipped start moved to 10 dB below on 2026-11-16 (audible-start, light plan); the
 * engine's rules do not depend on where it starts, and its examples keep their levels.
 */
const hearingMethodConfig = Object.freeze({
  ...shippedHearingMethodConfig,
  startingLevelDb: -25,
});

const settings = hearingMethodConfig;
const C: SoundOutcome = "caught";
const M: SoundOutcome = "missed";
const W: SoundOutcome = "wrongSide";
const first: Direction = "first";
const desc: Direction = "descending";
const asc: Direction = "ascending";

interface Trace {
  readonly name: string;
  readonly outcomes: readonly SoundOutcome[];
  readonly levelsDb: readonly number[];
  readonly directions: readonly Direction[];
  readonly ending: OracleEnding;
}

/** The worked examples A to H in design.md, written out by hand for the oracle. */
const traces: readonly Trace[] = [
  {
    name: "A. step listener, true threshold -52",
    outcomes: [C, C, C, M, C, M, M, C],
    levelsDb: [-25, -35, -45, -55, -50, -60, -55, -50],
    directions: [first, desc, desc, desc, asc, desc, asc, asc],
    ending: { kind: "found", thresholdDb: -50 },
  },
  {
    name: "B. never answers",
    outcomes: [M, M, M, M, M, M, M, M],
    levelsDb: [-25, -20, -15, -10, -5, 0, 5, 5],
    directions: [first, asc, asc, asc, asc, asc, asc, asc],
    ending: { kind: "worseThanCap" },
  },
  {
    name: "C. step listener, true threshold -80",
    outcomes: [C, C, C, C, C, C, C],
    levelsDb: [-25, -35, -45, -55, -65, -70, -70],
    directions: [first, desc, desc, desc, desc, desc, desc],
    ending: { kind: "betterThanFloor" },
  },
  {
    name: "D. step listener, true threshold 2",
    outcomes: [M, M, M, M, M, M, C, M, M, C],
    levelsDb: [-25, -20, -15, -10, -5, 0, 5, -5, 0, 5],
    directions: [first, asc, asc, asc, asc, asc, asc, desc, asc, asc],
    ending: { kind: "found", thresholdDb: 5 },
  },
  {
    name: "E. an inconsistent catch",
    outcomes: [C, C, C, M, C, C, M, M, M, M, C],
    levelsDb: [-25, -35, -45, -55, -50, -60, -70, -65, -60, -55, -50],
    directions: [first, desc, desc, desc, asc, desc, desc, asc, asc, asc, asc],
    ending: { kind: "found", thresholdDb: -50 },
  },
  {
    name: "F. two of four",
    outcomes: [C, C, M, C, M, M, M, C, M, M, M, C, M, M, M, C, C, M, C],
    levelsDb: [
      -25, -35, -45, -40, -50, -45, -40, -35, -45, -40, -35, -30, -40, -35, -30,
      -25, -35, -45, -40,
    ],
    directions: [
      first,
      desc,
      desc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      desc,
      asc,
    ],
    ending: { kind: "found", thresholdDb: -40 },
  },
  {
    name: "G. trial limit",
    outcomes: [M, C, M, M, M, C, M, M, M, C, M, M, M, C, M, M, M, C, M, M],
    levelsDb: [
      -25, -20, -30, -25, -20, -15, -25, -20, -15, -10, -20, -15, -10, -5, -15,
      -10, -5, 0, -10, -5,
    ],
    directions: [
      first,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
    ],
    ending: { kind: "trialLimit" },
  },
  {
    name: "H. a quieter level still open",
    outcomes: [C, C, C, M, C, M, C, M, M, M, C, M, C],
    levelsDb: [-25, -35, -45, -55, -50, -60, -55, -65, -60, -55, -50, -60, -55],
    directions: [
      first,
      desc,
      desc,
      desc,
      asc,
      desc,
      asc,
      desc,
      asc,
      asc,
      asc,
      desc,
      asc,
    ],
    ending: { kind: "found", thresholdDb: -55 },
  },
];

const otherEar: Record<Ear, Ear> = { left: "right", right: "left" };

const responseFor = (ear: Ear, outcome: SoundOutcome): VisitorResponse =>
  outcome === "caught" ? ear : outcome === "wrongSide" ? otherEar[ear] : "none";

/** Records for one ear's trace, numbered from `firstTrialNumber`. */
function traceRecords(
  ear: Ear,
  trace: Trace,
  firstTrialNumber = 1,
): TrialRecord[] {
  return trace.outcomes.map((outcome, index) => ({
    trial: {
      kind: "sound",
      trialNumber: firstTrialNumber + index,
      ear,
      levelDb: trace.levelsDb[index],
      direction: trace.directions[index],
      gapBeforeMs: 2000,
    },
    response: responseFor(ear, outcome),
    outcome,
  }));
}

const noSoundRecord = (
  trialNumber: number,
  phase: "search" | "closing",
  response: VisitorResponse,
): TrialRecord => ({
  trial: { kind: "noSound", trialNumber, phase, gapBeforeMs: 2000 },
  response,
  outcome: response === "none" ? "noResponse" : "falseAlarm",
});

/** Renumbers records 1, 2, 3, ... in their order. */
const renumber = (records: readonly TrialRecord[]): TrialRecord[] =>
  records.map(
    (record, index) =>
      ({
        ...record,
        trial: { ...record.trial, trialNumber: index + 1 },
      }) as TrialRecord,
  );

describe("replayEar on the worked examples", () => {
  for (const trace of traces) {
    it(`${trace.name}: agrees with every level and direction and ends as expected`, () => {
      const replay = replayEar("left", traceRecords("left", trace), settings);
      expect(replay.mismatches).toEqual([]);
      expect(replay.presentations.map((p) => p.levelDb)).toEqual(
        trace.levelsDb,
      );
      expect(replay.presentations.map((p) => p.direction)).toEqual(
        trace.directions,
      );
      expect(replay.ending).toEqual(trace.ending);
      expect(replay.endingTrialNumber).toBe(trace.outcomes.length);
    });
  }

  it("B with every miss a wrong side: the same levels and ending", () => {
    const trace = traces[1];
    const wrongSide = { ...trace, outcomes: trace.outcomes.map(() => W) };
    const replay = replayEar(
      "right",
      traceRecords("right", wrongSide),
      settings,
    );
    expect(replay.mismatches).toEqual([]);
    expect(replay.ending).toEqual({ kind: "worseThanCap" });
  });

  it("ignores the other ear's trials and no-sound trials", () => {
    const records = renumber([
      noSoundRecord(0, "search", "none"),
      ...traceRecords("right", traces[2]),
      ...traceRecords("left", traces[0]),
      noSoundRecord(0, "search", "left"),
    ]);
    const replay = replayEar("left", records, settings);
    expect(replay.mismatches).toEqual([]);
    expect(replay.ending).toEqual(traces[0].ending);
  });

  it("reports a level that does not follow the step rule", () => {
    const records = traceRecords("left", traces[0]);
    const changed = records.map((record, index) =>
      index === 2 && record.trial.kind === "sound"
        ? ({
            ...record,
            trial: { ...record.trial, levelDb: -40 },
          } as TrialRecord)
        : record,
    );
    const replay = replayEar("left", changed, settings);
    expect(replay.mismatches).toContain(
      "left trial 3: level -40, expected -45",
    );
  });

  it("reports a wrong direction, a wrong outcome and a presentation after the ending", () => {
    const records = traceRecords("left", traces[2]);
    const changed: TrialRecord[] = records.map((record, index) => {
      if (record.trial.kind !== "sound") {
        return record;
      }
      if (index === 1) {
        return {
          ...record,
          trial: { ...record.trial, direction: asc },
        } as TrialRecord;
      }
      if (index === 2) {
        return { ...record, outcome: "missed" } as TrialRecord;
      }
      return record;
    });
    changed.push(
      ...traceRecords("left", { ...traces[2], outcomes: [C] }, 8).map(
        (record) =>
          ({
            ...record,
            trial: { ...record.trial, levelDb: -70, direction: desc },
          }) as TrialRecord,
      ),
    );
    const replay = replayEar("left", changed, settings);
    expect(replay.mismatches).toEqual([
      "left trial 2: direction ascending, expected descending",
      "left trial 3: outcome missed for response left, expected caught",
      "left trial 8: presented after the ear ended at trial 7",
    ]);
  });

  it("ends without an ending when the records stop early", () => {
    const trace = traces[0];
    const replay = replayEar(
      "left",
      traceRecords("left", trace).slice(0, 5),
      settings,
    );
    expect(replay.mismatches).toEqual([]);
    expect(replay.ending).toBeUndefined();
  });
});

describe("replayRoom", () => {
  const counts = (
    presentationCount: number,
    catchCount: number,
    wrongSideCount: number,
    missCount: number,
  ) => ({ presentationCount, catchCount, wrongSideCount, missCount });

  it("gives found and better than floor for traces A and C with a quiet visitor", () => {
    // 8 + 7 sound trials and 3 no-sound trials: 3 of 18 is the first share at or above 0.15.
    // The right ear ends at trial 16, so the two no-sound trials after it are closing trials.
    const records = renumber([
      ...traceRecords("left", traces[0]),
      noSoundRecord(0, "search", "none"),
      ...traceRecords("right", traces[2]),
      noSoundRecord(0, "closing", "none"),
      noSoundRecord(0, "closing", "none"),
    ]);
    const room = replayRoom(records, settings);
    expect(room.mismatches).toEqual([]);
    expect(room.left).toEqual({
      ...counts(8, 5, 0, 3),
      state: "found",
      thresholdDb: -50,
    });
    expect(room.right).toEqual({
      ...counts(7, 7, 0, 0),
      state: "betterThanFloor",
    });
    expect(room.noSoundTrialCount).toBe(3);
    expect(room.falseAlarmCount).toBe(0);
    expect(room.falseAlarmRateFraction).toBe(0);
    expect(room.falseAlarmRateAboveLimit).toBe(false);
  });

  it("marks trace E unreliable for its inconsistent catch, and trace G for the trial limit", () => {
    // 11 + 20 sound trials and 6 no-sound trials: 6 of 37 is inside 15 to 25 percent. The last
    // three no-sound trials come after the right ear ended at trial 34, so they are closing trials.
    const records = renumber([
      ...traceRecords("left", traces[4]),
      ...Array.from({ length: 3 }, () => noSoundRecord(0, "search", "none")),
      ...traceRecords("right", traces[6]),
      ...Array.from({ length: 3 }, () => noSoundRecord(0, "closing", "none")),
    ]);
    const room = replayRoom(records, settings);
    expect(room.mismatches).toEqual([]);
    expect(room.left).toEqual({
      ...counts(11, 6, 0, 5),
      state: "unreliable",
      reasons: ["inconsistentCatch"],
    });
    expect(room.right).toEqual({
      ...counts(20, 5, 0, 15),
      state: "unreliable",
      reasons: ["trialLimit"],
    });
  });

  it("reports a closing trial with the wrong phase or after the share reached its minimum", () => {
    // Traces A and C end at trials 8 and 15. Four closing trials follow, but 3 of 18 already
    // reaches 0.15, so the fourth is one too many.
    const records = renumber([
      ...traceRecords("left", traces[0]),
      ...traceRecords("right", traces[2]),
      noSoundRecord(0, "search", "none"),
      ...Array.from({ length: 3 }, () => noSoundRecord(0, "closing", "none")),
    ]);
    expect(replayRoom(records, settings).mismatches).toEqual([
      "no-sound trial 16: phase search, expected closing",
      "no-sound trial 19: a closing trial after the share reached its minimum",
    ]);
  });

  it("adds falseAlarmRate to both ears above the limit, but not exactly at it", () => {
    // Ten search-phase no-sound trials first, then traces A and C.
    const build = (falseAlarms: number): TrialRecord[] =>
      renumber([
        ...Array.from({ length: 10 }, (_, index) =>
          noSoundRecord(0, "search", index < falseAlarms ? "left" : "none"),
        ),
        ...traceRecords("left", traces[0]),
        ...traceRecords("right", traces[2]),
      ]);
    const atLimit = replayRoom(build(3), settings);
    expect(atLimit.mismatches).toEqual([]);
    expect(atLimit.falseAlarmRateFraction).toBeCloseTo(0.3, 12);
    expect(atLimit.falseAlarmRateAboveLimit).toBe(false);
    expect(atLimit.left?.state).toBe("found");

    const above = replayRoom(build(4), settings);
    expect(above.falseAlarmCount).toBe(4);
    expect(above.falseAlarmRateAboveLimit).toBe(true);
    expect(above.left).toEqual({
      ...counts(8, 5, 0, 3),
      state: "unreliable",
      reasons: ["falseAlarmRate"],
    });
    expect(above.right).toEqual({
      ...counts(7, 7, 0, 0),
      state: "unreliable",
      reasons: ["falseAlarmRate"],
    });
  });

  it("reports a wrong trial number, a wrong no-sound outcome and an ear still searching", () => {
    const records: TrialRecord[] = [
      ...traceRecords("left", traces[0]),
      {
        trial: {
          kind: "noSound",
          trialNumber: 10,
          phase: "search",
          gapBeforeMs: 2000,
        },
        response: "right",
        outcome: "noResponse",
      },
    ];
    const room = replayRoom(records, settings);
    expect(room.mismatches).toEqual([
      "record 9: trial number 10",
      "no-sound trial 10: outcome noResponse for response right, expected falseAlarm",
      "right: the records end while the ear is searching",
    ]);
    expect(room.right).toBeUndefined();
  });
});

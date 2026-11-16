import { describe, expect, it } from "vitest";
import { hearingMethodConfig as shippedHearingMethodConfig } from "../config/hearing-method-config";
import { createEarSearch, type EarEnding } from "./ear-search";
import type { Direction, SoundOutcome } from "./search-types";

/**
 * The shipped settings with the starting level these examples were written for, 25 dB below the
 * anchor. The shipped start moved to 10 dB below on 2026-11-16 (audible-start, light plan); the
 * engine's rules do not depend on where it starts, and its examples keep their levels.
 */
const hearingMethodConfig = Object.freeze({
  ...shippedHearingMethodConfig,
  startingLevelDb: -25,
});

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
  readonly ending: EarEnding;
}

/** The worked examples A to H in design.md, with the shipped settings. */
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
    outcomes: [
      M,
      C,
      ...[M, M, M, C],
      ...[M, M, M, C],
      ...[M, M, M, C],
      ...[M, M, M, C],
      M,
      M,
    ],
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

interface TraceRun {
  readonly levelsDb: number[];
  readonly directions: Direction[];
  readonly lowerBounds: number[];
  readonly ending: EarEnding | undefined;
  readonly searchingAfterEach: boolean[];
}

/** Plays a scripted outcome list into a fresh left ear search with the shipped settings. */
function runTrace(outcomes: readonly SoundOutcome[]): TraceRun {
  const search = createEarSearch("left", hearingMethodConfig);
  const run: TraceRun = {
    levelsDb: [],
    directions: [],
    lowerBounds: [],
    ending: undefined,
    searchingAfterEach: [],
  };
  for (const outcome of outcomes) {
    expect(search.isSearching()).toBe(true);
    run.lowerBounds.push(search.remainingPresentationsLowerBound());
    const { levelDb, direction } = search.next();
    run.levelsDb.push(levelDb);
    run.directions.push(direction);
    search.record(outcome);
    run.searchingAfterEach.push(search.isSearching());
  }
  run.lowerBounds.push(search.remainingPresentationsLowerBound());
  return { ...run, ending: search.ending() };
}

describe("createEarSearch", () => {
  describe("worked examples", () => {
    for (const trace of traces) {
      describe(trace.name, () => {
        it("has one level and direction per scripted outcome", () => {
          expect(trace.levelsDb).toHaveLength(trace.outcomes.length);
          expect(trace.directions).toHaveLength(trace.outcomes.length);
        });

        it("requests every level and direction of the trace", () => {
          const run = runTrace(trace.outcomes);
          expect(run.levelsDb).toEqual(trace.levelsDb);
          expect(run.directions).toEqual(trace.directions);
        });

        it(`ends as ${trace.ending.kind} after ${String(trace.outcomes.length)} presentations and not before`, () => {
          const run = runTrace(trace.outcomes);
          expect(run.ending).toEqual(trace.ending);
          expect(run.searchingAfterEach.slice(0, -1).every(Boolean)).toBe(true);
          expect(run.searchingAfterEach.at(-1)).toBe(false);
        });

        it("keeps the lower bound from 1 to the presentations still needed, and 0 once ended", () => {
          const run = runTrace(trace.outcomes);
          const searchingBounds = run.lowerBounds.slice(0, -1);
          expect(searchingBounds[0]).toBe(2);
          searchingBounds.forEach((bound, index) => {
            const stillNeeded = trace.outcomes.length - index;
            expect(bound).toBeGreaterThanOrEqual(1);
            expect(bound).toBeLessThanOrEqual(stillNeeded);
          });
          expect(run.lowerBounds.at(-1)).toBe(0);
        });

        it("records each presentation with its level, direction and outcome", () => {
          const search = createEarSearch("right", hearingMethodConfig);
          for (const outcome of trace.outcomes) {
            search.record(outcome);
          }
          expect(search.presentations()).toEqual(
            trace.outcomes.map((outcome, index) => ({
              levelDb: trace.levelsDb[index],
              direction: trace.directions[index],
              outcome,
            })),
          );
        });
      });
    }
  });

  it("gives trace B the same levels and ending when every miss is a wrong side", () => {
    const traceB = traces[1];
    const run = runTrace(
      traceB.outcomes.map((outcome) => (outcome === M ? W : outcome)),
    );
    expect(run.levelsDb).toEqual(traceB.levelsDb);
    expect(run.directions).toEqual(traceB.directions);
    expect(run.ending).toEqual({ kind: "worseThanCap" });
  });

  it("throws an Error from next and record after the ear has ended", () => {
    const search = createEarSearch("left", hearingMethodConfig);
    for (const outcome of traces[0].outcomes) {
      search.record(outcome);
    }
    expect(search.isSearching()).toBe(false);
    expect(() => search.next()).toThrow(Error);
    expect(() => search.record("caught")).toThrow(Error);
    expect(search.presentations()).toHaveLength(traces[0].outcomes.length);
    expect(search.ending()).toEqual({ kind: "found", thresholdDb: -50 });
  });

  it("has no ending while searching", () => {
    const search = createEarSearch("left", hearingMethodConfig);
    expect(search.ending()).toBeUndefined();
    search.record("caught");
    expect(search.ending()).toBeUndefined();
  });

  it("returns frozen presentations and a frozen next step", () => {
    const search = createEarSearch("left", hearingMethodConfig);
    expect(Object.isFrozen(search.next())).toBe(true);
    search.record("missed");
    const presentations = search.presentations();
    expect(Object.isFrozen(presentations)).toBe(true);
    expect(Object.isFrozen(presentations[0])).toBe(true);
  });
});

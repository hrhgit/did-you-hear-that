import { describe, expect, it } from "vitest";
import { chaseScoreOf, countIntoChase, emptyChaseTally } from "./chase-score";
import type {
  ScoredVisitTrial,
  VisitLog,
  VisitRoom,
  VisitTrial,
} from "./visit-flow-types";

const rooms: readonly VisitRoom[] = [
  { roomIndex: 0, roomId: "corridor", frequencyHz: 1000 },
  { roomIndex: 1, roomId: "nursery", frequencyHz: 2000 },
];

let order = 0;

/** A scored trial of a room run. `c` caught, `m` missed, `w` other side, `f` answered silence, `s` silence left alone. */
function trial(
  roomIndex: number,
  attempt: number,
  what: "c" | "m" | "w" | "f" | "s",
  levelDb = -20,
): ScoredVisitTrial {
  order += 1;
  const common = {
    order,
    roomIndex,
    attempt,
    trialNumber: order,
    gapBeforeMs: 2000,
    presentedAtMs: order * 5000,
    windowStartMs: order * 5000 + 50,
    status: "scored" as const,
    scoredAtMs: order * 5000 + 900,
  };
  if (what === "f" || what === "s") {
    return {
      ...common,
      kind: "noSound",
      ear: null,
      requestedLevelDb: null,
      playedLevelDb: null,
      clampLimit: null,
      response: what === "f" ? "left" : "none",
      outcome: what === "f" ? "falseAlarm" : "noResponse",
      answeredAtMs: what === "f" ? common.presentedAtMs + 600 : null,
      responseTimeMs: what === "f" ? 550 : null,
    } as ScoredVisitTrial;
  }
  return {
    ...common,
    kind: "sound",
    ear: "left",
    requestedLevelDb: levelDb,
    playedLevelDb: levelDb,
    clampLimit: null,
    response: what === "c" ? "left" : what === "w" ? "right" : "none",
    outcome: what === "c" ? "caught" : what === "w" ? "wrongSide" : "missed",
    answeredAtMs: what === "m" ? null : common.presentedAtMs + 600,
    responseTimeMs: what === "m" ? null : 550,
  } as ScoredVisitTrial;
}

function logOf(trials: readonly VisitTrial[]): VisitLog {
  return { rooms, trials } as unknown as VisitLog;
}

describe("countIntoChase", () => {
  it("counts a catch, keeps the quietest, and ends the row on a miss, the other side or an answer to silence", () => {
    const tally = emptyChaseTally();
    for (const entry of [
      trial(0, 1, "c", -20),
      trial(0, 1, "c", -35),
      trial(0, 1, "s"),
      trial(0, 1, "c", -30),
    ]) {
      countIntoChase(tally, entry);
    }
    expect(tally).toEqual({
      caughtCount: 3,
      streak: 3,
      bestStreak: 3,
      deepestCaughtDb: { left: -35, right: null },
    });
    for (const ending of ["m", "w", "f"] as const) {
      const row = emptyChaseTally();
      countIntoChase(row, trial(0, 1, "c"));
      countIntoChase(row, trial(0, 1, ending));
      expect(row.streak).toBe(0);
      expect(row.bestStreak).toBe(1);
    }
  });
});

describe("chaseScoreOf", () => {
  it("counts the catches of the visit, by room, and the longest row of one room run", () => {
    const score = chaseScoreOf(
      logOf([
        trial(0, 1, "c"),
        trial(0, 1, "c"),
        trial(0, 1, "m"),
        trial(0, 1, "c"),
        trial(1, 1, "c"),
        trial(1, 1, "c"),
        trial(1, 1, "c"),
        trial(1, 1, "w"),
      ]),
    );
    expect(score).toEqual({
      caughtCount: 6,
      longestRow: 3,
      rooms: [
        { roomIndex: 0, roomId: "corridor", caughtCount: 3 },
        { roomIndex: 1, roomId: "nursery", caughtCount: 3 },
      ],
    });
  });

  it("never runs a row from one room run into the next, and skips discarded trials", () => {
    const discarded = {
      ...trial(0, 1, "c"),
      status: "discarded",
      discardedAtMs: 1,
    } as unknown as VisitTrial;
    const score = chaseScoreOf(
      logOf([
        trial(0, 1, "c"),
        trial(0, 1, "c"),
        discarded,
        trial(0, 2, "c"),
        trial(1, 1, "c"),
      ]),
    );
    expect(score.longestRow).toBe(2);
    expect(score.caughtCount).toBe(4);
  });

  describe("room runs under way at the same time (one-room, the chase)", () => {
    const span = (
      roomIndex: number,
      attempt: number,
      startedAtMs: number,
      endedAtMs: number,
    ) => ({ roomIndex, attempt, startedAtMs, endedAtMs });
    const logWith = (
      trials: readonly VisitTrial[],
      roomAttempts: readonly ReturnType<typeof span>[],
    ): VisitLog => ({ rooms, trials, roomAttempts }) as unknown as VisitLog;

    it("carries a row from one creature's sound to the next one's", () => {
      const score = chaseScoreOf(
        logWith(
          [
            trial(0, 1, "c"),
            trial(1, 1, "c"),
            trial(0, 1, "c"),
            trial(1, 1, "c"),
            trial(1, 1, "m"),
            trial(0, 1, "c"),
          ],
          [span(0, 1, 1000, 90_000), span(1, 1, 1000, 80_000)],
        ),
      );
      expect(score).toEqual({
        caughtCount: 5,
        longestRow: 4,
        rooms: [
          { roomIndex: 0, roomId: "corridor", caughtCount: 3 },
          { roomIndex: 1, roomId: "nursery", caughtCount: 2 },
        ],
      });
    });

    it("ends the row where one room run began only when the other had ended", () => {
      const trials = [
        trial(0, 1, "c"),
        trial(0, 1, "c"),
        trial(1, 1, "c"),
        trial(1, 1, "c"),
        trial(1, 1, "c"),
      ];
      const followed = chaseScoreOf(
        logWith(trials, [span(0, 1, 1000, 50_000), span(1, 1, 50_000, 90_000)]),
      );
      expect(followed.longestRow).toBe(3);
      const overlapped = chaseScoreOf(
        logWith(trials, [span(0, 1, 1000, 50_000), span(1, 1, 49_999, 90_000)]),
      );
      expect(overlapped.longestRow).toBe(5);
    });

    it("ends the row at a room run that began again after the others, and at one the log has no span for", () => {
      const trials = [
        trial(0, 1, "c"),
        trial(1, 1, "c"),
        trial(0, 2, "c"),
        trial(1, 1, "c"),
      ];
      // The corridor's second run began after its first run and the nursery's run had ended.
      const again = chaseScoreOf(
        logWith(trials, [
          span(0, 1, 1000, 40_000),
          span(1, 1, 1000, 40_000),
          span(0, 2, 60_000, 90_000),
        ]),
      );
      expect(again.longestRow).toBe(2);
      expect(again.caughtCount).toBe(4);
      const unknown = chaseScoreOf(
        logWith(trials, [span(0, 1, 1000, 40_000), span(1, 1, 1000, 40_000)]),
      );
      expect(unknown.longestRow).toBe(2);
    });
  });

  it("scores an empty visit as nothing caught in every room", () => {
    expect(chaseScoreOf(logOf([]))).toEqual({
      caughtCount: 0,
      longestRow: 0,
      rooms: [
        { roomIndex: 0, roomId: "corridor", caughtCount: 0 },
        { roomIndex: 1, roomId: "nursery", caughtCount: 0 },
      ],
    });
  });
});

import type { GhostSoundId } from "../config/sound-id";
import type { Ear, ScoredVisitTrial, VisitLog } from "./visit-flow-types";

/**
 * The chase of one room run as it is counted: the sounds caught, the sounds caught in a row, and
 * the quietest caught on each side (the game layer of 2026-11-16). The visit flow counts each
 * room into one of these as its trials are scored, and the result page counts the whole log the
 * same way, so the two can never disagree.
 */
export interface ChaseTally {
  caughtCount: number;
  streak: number;
  bestStreak: number;
  readonly deepestCaughtDb: Record<Ear, number | null>;
}

/** An empty tally, for a room run whose counting has just begun. */
export function emptyChaseTally(): ChaseTally {
  return {
    caughtCount: 0,
    streak: 0,
    bestStreak: 0,
    deepestCaughtDb: { left: null, right: null },
  };
}

/**
 * Counts one scored trial into a tally. A caught sound adds to the count and the row. A sound that
 * went by or was answered on the other side, and an answer to silence, end the row. Silence left
 * alone changes nothing.
 */
export function countIntoChase(
  tally: ChaseTally,
  entry: ScoredVisitTrial,
): void {
  if (entry.kind === "sound" && entry.outcome === "caught") {
    tally.caughtCount += 1;
    tally.streak += 1;
    tally.bestStreak = Math.max(tally.bestStreak, tally.streak);
    const deepest = tally.deepestCaughtDb[entry.ear];
    tally.deepestCaughtDb[entry.ear] =
      deepest === null
        ? entry.playedLevelDb
        : Math.min(deepest, entry.playedLevelDb);
    return;
  }
  if (entry.kind === "sound" || entry.outcome === "falseAlarm") {
    tally.streak = 0;
  }
}

/** The score of a whole visit, for the card on the result page. */
export interface ChaseScore {
  /** The sounds caught in all the rooms. */
  readonly caughtCount: number;
  /** The most sounds caught one after the other inside one room run. */
  readonly longestRow: number;
  /** The sounds caught in each room, in visit order. */
  readonly rooms: readonly {
    readonly roomIndex: number;
    readonly roomId: GhostSoundId;
    readonly caughtCount: number;
  }[];
}

/**
 * The score of a visit from its log. Every scored trial of every room run counts, in the order
 * played. A row never runs from one room run into the next: it goes on only between room runs
 * that were under way at the same time, as the rooms of one room are when their searches take
 * turns (one-room design.md, "The chase"). Practice sounds and the swapped repeat are not in
 * `trials`, so they count for nothing here, as in the rooms.
 */
export function chaseScoreOf(log: VisitLog): ChaseScore {
  const byRoom = new Map<number, number>();
  let caughtCount = 0;
  let longestRow = 0;
  let tally = emptyChaseTally();
  let run: string | null = null;
  const runKey = (roomIndex: number, attempt: number): string =>
    `${String(roomIndex)}:${String(attempt)}`;
  // A log made by hand may hold no room runs: then every change of room run ends the row.
  const spans = new Map(
    (log.roomAttempts ?? []).map(
      ({ roomIndex, attempt, startedAtMs, endedAtMs }) => [
        runKey(roomIndex, attempt),
        { startedAtMs, endedAtMs },
      ],
    ),
  );
  /** Whether the second room run began before the first ended. */
  const together = (first: string, second: string): boolean => {
    const before = spans.get(first);
    const after = spans.get(second);
    return (
      before !== undefined &&
      after !== undefined &&
      after.startedAtMs < before.endedAtMs
    );
  };
  for (const trial of log.trials) {
    if (trial.status !== "scored") {
      continue;
    }
    const thisRun = runKey(trial.roomIndex, trial.attempt);
    if (thisRun !== run) {
      if (run === null || !together(run, thisRun)) {
        tally = emptyChaseTally();
      }
      run = thisRun;
    }
    const before = tally.caughtCount;
    countIntoChase(tally, trial);
    if (tally.caughtCount > before) {
      caughtCount += 1;
      byRoom.set(trial.roomIndex, (byRoom.get(trial.roomIndex) ?? 0) + 1);
    }
    longestRow = Math.max(longestRow, tally.bestStreak);
  }
  return {
    caughtCount,
    longestRow,
    rooms: log.rooms.map((room) => ({
      roomIndex: room.roomIndex,
      roomId: room.roomId,
      caughtCount: byRoom.get(room.roomIndex) ?? 0,
    })),
  };
}

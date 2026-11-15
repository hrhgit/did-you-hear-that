import type { Ear, ReplaySideCounts, VisitLog } from "./visit-flow-types";

const runKey = (roomIndex: number, attempt: number): string =>
  `${String(roomIndex)}:${String(attempt)}`;

interface MutableSideCounts {
  madeCount: number;
  caughtCount: number;
  wrongSideCount: number;
  missedCount: number;
}

const emptySide = (): MutableSideCounts => ({
  madeCount: 0,
  caughtCount: 0,
  wrongSideCount: 0,
  missedCount: 0,
});

/**
 * The counts of each side for the replay's running count (missed-sound-replay design.md, "The
 * counts", R8, D11). Counted are the scored sound trials of finished room runs, the same trials
 * the replay plan draws from, whose `order` is at most `throughTrialOrder`, or all of them for
 * null. Each adds one to `madeCount` on its ear and one to the count of its outcome, so on each
 * side `madeCount = caughtCount + wrongSideCount + missedCount`. Returns frozen plain data. A pure
 * function.
 */
export function replayCounts(
  log: VisitLog,
  throughTrialOrder: number | null,
): Readonly<Record<Ear, ReplaySideCounts>> {
  const finishedRuns = new Set(
    log.roomAttempts
      .filter((attempt) => attempt.ending === "finished")
      .map((attempt) => runKey(attempt.roomIndex, attempt.attempt)),
  );
  const counts: Record<Ear, MutableSideCounts> = {
    left: emptySide(),
    right: emptySide(),
  };
  for (const trial of log.trials) {
    if (
      trial.status !== "scored" ||
      trial.kind !== "sound" ||
      !finishedRuns.has(runKey(trial.roomIndex, trial.attempt)) ||
      (throughTrialOrder !== null && trial.order > throughTrialOrder)
    ) {
      continue;
    }
    const side = counts[trial.ear];
    side.madeCount += 1;
    switch (trial.outcome) {
      case "caught":
        side.caughtCount += 1;
        break;
      case "wrongSide":
        side.wrongSideCount += 1;
        break;
      case "missed":
        side.missedCount += 1;
        break;
    }
  }
  return Object.freeze({
    left: Object.freeze({ ...counts.left }),
    right: Object.freeze({ ...counts.right }),
  });
}

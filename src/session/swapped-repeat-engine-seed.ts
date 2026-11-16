import { createSeededRandom } from "../config/seeded-random";
import type { VisitLog } from "./visit-flow-types";

/** Seeds are drawn as `floor(u × 2³²)`, the same draw as the visit flow's `drawSeed` (visit-flow D19). */
const seedRangeCount = 0x100000000;

/**
 * The engine seed of a swapped repeat's room run, from the log and the run number alone
 * (swapped-repeat design.md, "`swappedRepeatEngineSeed(log, runNumber)`", D9, R7.3). The visit's
 * source, made from `visitSeed`, draws the seed of the visit's sound renders, one engine seed per
 * room run of the log, the replay's render seed, and then one engine seed per repeat run begun,
 * ended or not. The seed of run `runNumber` is the draw after the `runNumber − 1` earlier repeat
 * runs. Returns a whole number from 0 to 2³² − 1. Throws a `RangeError` unless `runNumber` is a
 * whole number of at least 1. A pure function.
 */
export function swappedRepeatEngineSeed(
  log: VisitLog,
  runNumber: number,
): number {
  if (!Number.isInteger(runNumber) || runNumber < 1) {
    throw new RangeError(
      `A repeat's run number must be a whole number of at least 1, but got ${String(runNumber)}.`,
    );
  }
  const source = createSeededRandom(log.visitSeed);
  const draw = (): number => Math.floor(source.next() * seedRangeCount);
  // The seed of the visit's sound renders.
  draw();
  for (let run = 0; run < log.roomAttempts.length; run += 1) {
    // That room run's engine seed.
    draw();
  }
  // The replay's render seed.
  draw();
  for (let earlier = 1; earlier < runNumber; earlier += 1) {
    // An earlier repeat run's engine seed.
    draw();
  }
  return draw();
}

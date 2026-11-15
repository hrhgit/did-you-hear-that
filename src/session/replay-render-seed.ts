import { createSeededRandom } from "../config/seeded-random";
import type { VisitLog } from "./visit-flow-types";

/** Seeds are drawn as `floor(u × 2³²)`, the same draw as the visit flow's `drawSeed` (visit-flow D19). */
const seedRangeCount = 0x100000000;

/**
 * The seed of the replay's renders, from the log alone (missed-sound-replay design.md, "The
 * render seed", D2, R14.2). The visit's source, made from `visitSeed`, draws the seed of the
 * visit's sound renders first and then one engine seed per room run (visit-flow D19). The render
 * seed is the draw after those, which is the draw the visit flow makes from that source when it
 * enters the replay. Depends only on `visitSeed` and the number of room runs. Returns a whole
 * number from 0 to 2³² − 1. A pure function.
 */
export function replayRenderSeed(log: VisitLog): number {
  const source = createSeededRandom(log.visitSeed);
  const draw = (): number => Math.floor(source.next() * seedRangeCount);
  // The seed of the visit's sound renders.
  draw();
  for (let run = 0; run < log.roomAttempts.length; run += 1) {
    // That run's engine seed.
    draw();
  }
  return draw();
}

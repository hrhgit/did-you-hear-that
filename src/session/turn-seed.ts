/** The first value and the multiplier of the 32-bit FNV-1a fold. */
const offsetBasis = 0x811c9dc5;
const prime = 0x01000193;

/**
 * The seed of the source that draws whose turn it is in a room run where several searches take
 * turns (one-room design.md, D5): a fold of those searches' engine seeds, in room order, to a
 * whole number from 0 to 2³² − 1. Pure.
 *
 * It is made from the engine seeds and draws nothing from the visit's own source. So that source
 * gives exactly the draws it always gave, and the seeds that are found again by counting the room
 * runs of a log (the replay's render seed, a swapped repeat's engine seed) are where they were.
 *
 * Throws a `RangeError` for a seed that is not a whole number from 0 to 2³² − 1.
 */
export function turnSeedOf(engineSeeds: readonly number[]): number {
  let hash = offsetBasis;
  for (const seed of engineSeeds) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError(
        `An engine seed must be a whole number from 0 to 2³² − 1, but got ${String(seed)}.`,
      );
    }
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (seed >>> shift) & 0xff;
      hash = Math.imul(hash, prime) >>> 0;
    }
  }
  return hash >>> 0;
}

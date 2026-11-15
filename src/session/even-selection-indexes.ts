/**
 * The positions, from 0, of the items to keep out of `count` so that at most `maxCount` are kept,
 * evenly spread (missed-sound-replay design.md, "The selection", D7).
 *
 * When `count` is at most `maxCount`, every position. Otherwise the positions
 * `floor(k × (count − 1) / (maxCount − 1))` for k from 0 to `maxCount − 1`: exactly `maxCount` of
 * them, strictly increasing, the first 0 and the last `count − 1`, with gaps that differ by at
 * most one. Returns a frozen array. Throws a `RangeError` unless `count` is a whole number of 0 or
 * more and `maxCount` a whole number of at least 2. A pure function.
 */
export function evenSelectionIndexes(
  count: number,
  maxCount: number,
): readonly number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `The count must be a whole number of 0 or more, not ${String(count)}.`,
    );
  }
  if (!Number.isInteger(maxCount) || maxCount <= 1) {
    throw new RangeError(
      `The most count must be a whole number of at least 2, not ${String(maxCount)}.`,
    );
  }
  if (count <= maxCount) {
    return Object.freeze(Array.from({ length: count }, (_, index) => index));
  }
  // The products are whole numbers far below 2⁵³, so the division gives the same floor on every
  // machine.
  return Object.freeze(
    Array.from({ length: maxCount }, (_, k) =>
      Math.floor((k * (count - 1)) / (maxCount - 1)),
    ),
  );
}

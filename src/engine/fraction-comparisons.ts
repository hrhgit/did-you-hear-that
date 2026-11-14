/**
 * The tolerance for every share and fraction comparison in the engine (design.md, D29).
 * Configured limits such as 0.15 have no exact binary form, so a count exactly at a limit must
 * not land on either side by rounding. This is arithmetic, not a tunable number.
 */
const fractionToleranceFraction = 1e-9;

/** Is `part / whole` at least `fraction`, counting a share exactly at the limit as inside it? */
export function atLeastFraction(
  part: number,
  whole: number,
  fraction: number,
): boolean {
  return part >= fraction * whole - fractionToleranceFraction;
}

/** Is `part / whole` at most `fraction`, counting a share exactly at the limit as inside it? */
export function atMostFraction(
  part: number,
  whole: number,
  fraction: number,
): boolean {
  return part <= fraction * whole + fractionToleranceFraction;
}

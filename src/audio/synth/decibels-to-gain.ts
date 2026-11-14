/**
 * Converts a level in decibels to a linear amplitude gain: `10^(levelDb / 20)`. The one place in
 * the synthesis where a level becomes a gain (structure.md, Conventions; D34).
 */
export function decibelsToGain(levelDb: number): number {
  return 10 ** (levelDb / 20);
}

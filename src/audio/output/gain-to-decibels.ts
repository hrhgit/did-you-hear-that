/**
 * Converts a linear amplitude gain to a level in decibels: `20 × log10(gain)`. The inverse of the
 * synth's `decibelsToGain`, and the one place in the output stage where a gain becomes a level
 * (structure.md, Conventions).
 */
export function gainToDecibels(gain: number): number {
  return 20 * Math.log10(gain);
}

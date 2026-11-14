/**
 * The raised-cosine ramp used by every fade and envelope: 0 for u ≤ 0, `(1 − cos(πu)) / 2` for
 * 0 < u < 1, and 1 for u ≥ 1. Its slope is zero at both ends.
 */
export function raisedCosineRamp(position: number): number {
  if (position <= 0) {
    return 0;
  }
  if (position >= 1) {
    return 1;
  }
  return (1 - Math.cos(Math.PI * position)) / 2;
}

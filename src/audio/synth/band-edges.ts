export interface BandEdges {
  readonly lowHz: number;
  readonly highHz: number;
}

/**
 * The edges of a fractional-octave band centred geometrically on `centreHz`:
 * `centreHz × 2^(−w/2)` and `centreHz × 2^(w/2)`, where w is `widthOctaveFraction` (D2). Both edges
 * belong to the band. Shared by the synthesis and the measurement (D13).
 */
export function bandEdges(
  centreHz: number,
  widthOctaveFraction: number,
): BandEdges {
  return Object.freeze({
    lowHz: centreHz * 2 ** (-widthOctaveFraction / 2),
    highHz: centreHz * 2 ** (widthOctaveFraction / 2),
  });
}

/**
 * Code names of the six sounds of the house (ghost-sounds design.md, Config). The room names a
 * visitor reads live in `src/copy`.
 */
export type GhostSoundId =
  "cellar" | "corridor" | "nursery" | "stairs" | "attic";

export type SoundId = GhostSoundId | "calibration";

/** In floor order, from the cellar up. Matches hearingMethodConfig.roomFrequenciesHz.full. */
export const ghostSoundIds: readonly GhostSoundId[] = Object.freeze([
  "cellar",
  "corridor",
  "nursery",
  "stairs",
  "attic",
]);

/** The ghost sounds in floor order, then "calibration". */
export const soundIds: readonly SoundId[] = Object.freeze([
  ...ghostSoundIds,
  "calibration",
]);

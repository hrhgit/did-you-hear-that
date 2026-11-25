/**
 * Code names of the sounds of the house (ghost-sounds design.md, Config). The room names a
 * visitor reads live in `src/copy`.
 */
export type GhostSoundId =
  "cellar" | "corridor" | "nursery" | "stairs" | "attic";

/**
 * "chime" is the soft bell after a caught sound (the game layer, 2026-11-17), and "snuff" the
 * falling puff when a creature gets to Jack (2026-11-20). Neither is a ghost: they have no room,
 * no search and no floor.
 */
export type SoundId = ListedSoundId | "chime" | "snuff";

/** The sounds the listening page lists, the range report measures and the render tool renders. */
export type ListedSoundId = GhostSoundId | "calibration";

/** In floor order, from the cellar up. Matches hearingMethodConfig.roomFrequenciesHz.full. */
export const ghostSoundIds: readonly GhostSoundId[] = Object.freeze([
  "cellar",
  "corridor",
  "nursery",
  "stairs",
  "attic",
]);

/**
 * The ghost sounds in floor order, then "calibration". The chime is left out: it is never listed,
 * measured on the listening page or offered to play on its own.
 */
export const soundIds: readonly ListedSoundId[] = Object.freeze([
  ...ghostSoundIds,
  "calibration",
]);

/** Every sound the output can play: the listed ones, then "chime" and "snuff". */
export const everySoundId: readonly SoundId[] = Object.freeze([
  ...soundIds,
  "chime",
  "snuff",
]);

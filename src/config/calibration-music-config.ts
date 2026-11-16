/**
 * Where the calibration music lives (`.kiro/specs/audible-start/design.md`, Config). It has a file
 * of its own because every field of `audioOutputConfig` ends in a unit, and a path has none.
 */
export interface CalibrationMusicConfig {
  /**
   * The calibration music, relative to the site's own address, so that the output stage fetches it
   * from the site's own files only (tech.md). Decoded once by the output stage.
   */
  readonly filePath: string;
}

/** Freezes a value and everything reachable from it, so no field can change at run time. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export const calibrationMusicConfig: CalibrationMusicConfig = deepFreeze({
  // audible-start brief: the waltz under public/audio, recorded in docs/licences.md
  filePath: "audio/calibration-waltz.m4a",
});

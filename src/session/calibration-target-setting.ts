/** A setting this close above a grid setting, in steps, still counts as that setting, as in `next-calibration-setting.ts`. */
const gridToleranceSteps = 1e-9;

/** The calibration control a target is set on: its bottom, its top and the step of its grid. */
export interface CalibrationControlRange {
  readonly bottomDb: number;
  readonly topDb: number;
  readonly stepDb: number;
}

/**
 * The target of the calibration control for a requested setting (audible-start design.md, "The
 * calibration target"; R3.2 to R3.4, D1). A pure function.
 *
 * - A value that is not a number, or NaN, gives null: the caller keeps the target it has.
 * - Otherwise the setting is held from `bottomDb` to `topDb` (so −Infinity gives the bottom and
 *   +Infinity the top) and rounded down to the grid `bottomDb + k × stepDb`, so a sound is never
 *   set louder than asked.
 *
 * Throws a `RangeError` for a control whose ends are not finite, whose top is below its bottom or
 * whose step is not above 0.
 */
export function calibrationTargetSettingDb(
  settingDb: unknown,
  control: CalibrationControlRange,
): number | null {
  const { bottomDb, topDb, stepDb } = control;
  if (
    !Number.isFinite(bottomDb) ||
    !Number.isFinite(topDb) ||
    !(topDb >= bottomDb) ||
    !(stepDb > 0)
  ) {
    throw new RangeError(
      `A calibration control needs finite ends with the top at or above the bottom and a step above 0, but got bottom ${String(bottomDb)}, top ${String(topDb)}, step ${String(stepDb)}.`,
    );
  }
  if (typeof settingDb !== "number" || Number.isNaN(settingDb)) {
    return null;
  }
  const heldDb = Math.min(topDb, Math.max(bottomDb, settingDb));
  const stepCount = Math.floor(
    (heldDb - bottomDb) / stepDb + gridToleranceSteps,
  );
  return Math.max(bottomDb, bottomDb + stepCount * stepDb);
}

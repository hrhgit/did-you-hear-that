import { atLeastFraction, atMostFraction } from "./fraction-comparisons";
import { roomLimits } from "./room-limits";
import type { ThresholdSearchSettings } from "./search-types";

type SettingsField = keyof ThresholdSearchSettings;

function describeValue(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function reject(field: string, value: unknown, rule: string): never {
  throw new RangeError(`${field} ${rule}, but got ${describeValue(value)}.`);
}

/** R2.3: levels, steps and the margin are whole decibels. */
const integerFields = [
  "downwardStepDb",
  "upwardStepDb",
  "startingLevelDb",
  "floorDb",
  "capRelativeToAnchorDb",
  "inconsistentCatchMarginDb",
] as const satisfies readonly SettingsField[];

/** R2.7: every field ending in `Fraction`. */
const fractionFields = [
  "noSoundTrialShareMinFraction",
  "noSoundTrialShareMaxFraction",
  "noSoundTrialProbabilityFraction",
  "falseAlarmRateUnreliableAboveFraction",
  "thresholdCatchShareMinFraction",
] as const satisfies readonly SettingsField[];

/** R2.8: every field ending in `Count`. */
const countFields = [
  "trialLimitPerEarPerRoomCount",
  "thresholdCatchesMinCount",
  "floorCatchesForBetterThanFloorCount",
  "capMissesForWorseThanCapCount",
] as const satisfies readonly SettingsField[];

function checkIntegers(settings: ThresholdSearchSettings): void {
  for (const field of integerFields) {
    if (!Number.isInteger(settings[field])) {
      reject(field, settings[field], "must be an integer");
    }
  }
}

function checkSteps(settings: ThresholdSearchSettings): void {
  for (const field of ["downwardStepDb", "upwardStepDb"] as const) {
    if (!(settings[field] > 0)) {
      reject(field, settings[field], "must be positive");
    }
  }
  if (settings.downwardStepDb % settings.upwardStepDb !== 0) {
    reject(
      "downwardStepDb",
      settings.downwardStepDb,
      `must be a whole multiple of upwardStepDb (${String(settings.upwardStepDb)})`,
    );
  }
}

/** R2.5 and D14: floor, start and cap lie on one grid of upward steps. */
function checkLevelGrid(settings: ThresholdSearchSettings): void {
  const { floorDb, startingLevelDb, capRelativeToAnchorDb, upwardStepDb } =
    settings;
  if (!(floorDb < capRelativeToAnchorDb)) {
    reject(
      "floorDb",
      floorDb,
      `must be below capRelativeToAnchorDb (${String(capRelativeToAnchorDb)})`,
    );
  }
  if (!(
    startingLevelDb >= floorDb && startingLevelDb <= capRelativeToAnchorDb
  )) {
    reject(
      "startingLevelDb",
      startingLevelDb,
      `must lie from floorDb (${String(floorDb)}) to capRelativeToAnchorDb (${String(capRelativeToAnchorDb)})`,
    );
  }
  const gridRule = (bound: string): string =>
    `must sit on the level grid: its distance from startingLevelDb (${String(startingLevelDb)}) must be a whole multiple of upwardStepDb (${String(upwardStepDb)}). Move ${bound} to a grid level or move the starting level with it`;
  if ((startingLevelDb - floorDb) % upwardStepDb !== 0) {
    reject("floorDb", floorDb, gridRule("the floor"));
  }
  if ((capRelativeToAnchorDb - startingLevelDb) % upwardStepDb !== 0) {
    reject("capRelativeToAnchorDb", capRelativeToAnchorDb, gridRule("the cap"));
  }
}

function checkGaps(settings: ThresholdSearchSettings): void {
  const { gapBetweenTrialsMinMs, gapBetweenTrialsMaxMs } = settings;
  if (!(Number.isInteger(gapBetweenTrialsMinMs) && gapBetweenTrialsMinMs > 0)) {
    reject(
      "gapBetweenTrialsMinMs",
      gapBetweenTrialsMinMs,
      "must be a positive integer",
    );
  }
  if (!Number.isInteger(gapBetweenTrialsMaxMs)) {
    reject(
      "gapBetweenTrialsMaxMs",
      gapBetweenTrialsMaxMs,
      "must be an integer",
    );
  }
  if (gapBetweenTrialsMinMs > gapBetweenTrialsMaxMs) {
    reject(
      "gapBetweenTrialsMinMs",
      gapBetweenTrialsMinMs,
      `must not be above gapBetweenTrialsMaxMs (${String(gapBetweenTrialsMaxMs)})`,
    );
  }
}

function checkFractions(settings: ThresholdSearchSettings): void {
  for (const field of fractionFields) {
    const value = settings[field];
    if (!(value >= 0 && value <= 1)) {
      reject(field, value, "must lie from 0 to 1");
    }
  }
  const {
    noSoundTrialShareMinFraction,
    noSoundTrialShareMaxFraction,
    noSoundTrialProbabilityFraction,
  } = settings;
  if (noSoundTrialShareMinFraction > noSoundTrialShareMaxFraction) {
    reject(
      "noSoundTrialShareMinFraction",
      noSoundTrialShareMinFraction,
      `must not be above noSoundTrialShareMaxFraction (${String(noSoundTrialShareMaxFraction)})`,
    );
  }
  if (
    noSoundTrialProbabilityFraction < noSoundTrialShareMinFraction ||
    noSoundTrialProbabilityFraction > noSoundTrialShareMaxFraction
  ) {
    reject(
      "noSoundTrialProbabilityFraction",
      noSoundTrialProbabilityFraction,
      `must lie from noSoundTrialShareMinFraction (${String(noSoundTrialShareMinFraction)}) to noSoundTrialShareMaxFraction (${String(noSoundTrialShareMaxFraction)})`,
    );
  }
}

function checkCountsAndMargin(settings: ThresholdSearchSettings): void {
  for (const field of countFields) {
    const value = settings[field];
    if (!(Number.isInteger(value) && value > 0)) {
      reject(field, value, "must be a positive integer");
    }
  }
  if (!(settings.inconsistentCatchMarginDb > 0)) {
    reject(
      "inconsistentCatchMarginDb",
      settings.inconsistentCatchMarginDb,
      "must be positive",
    );
  }
}

/**
 * The smallest whole number `c` of no-sound trials with `c / (c + soundTrialCount)` at least
 * `shareMinFraction`, where `shareMinFraction` is below 1. The closed form is a starting point
 * that is moved to the exact boundary as `atLeastFraction` judges it.
 */
function smallestNoSoundTrialCount(
  soundTrialCount: number,
  shareMinFraction: number,
): number {
  const reachesShare = (noSoundTrialCount: number): boolean =>
    atLeastFraction(
      noSoundTrialCount,
      noSoundTrialCount + soundTrialCount,
      shareMinFraction,
    );
  let count = Math.max(
    0,
    Math.ceil((shareMinFraction * soundTrialCount) / (1 - shareMinFraction)),
  );
  while (count > 0 && reachesShare(count - 1)) {
    count -= 1;
  }
  while (!reachesShare(count)) {
    count += 1;
  }
  return count;
}

/** R2.9 and D6: every possible room length has a no-sound count that puts the share in range. */
function checkShareReachable(settings: ThresholdSearchSettings): void {
  const limits = roomLimits(settings);
  const { noSoundTrialShareMinFraction, noSoundTrialShareMaxFraction } =
    settings;
  for (
    let soundTrialCount = limits.minimumRoomSoundTrialCount;
    soundTrialCount <= limits.maximumRoomSoundTrialCount;
    soundTrialCount += 1
  ) {
    const noSoundTrialCount = smallestNoSoundTrialCount(
      soundTrialCount,
      noSoundTrialShareMinFraction,
    );
    if (
      !atMostFraction(
        noSoundTrialCount,
        noSoundTrialCount + soundTrialCount,
        noSoundTrialShareMaxFraction,
      )
    ) {
      throw new RangeError(
        `noSoundTrialShareMinFraction to noSoundTrialShareMaxFraction (${String(noSoundTrialShareMinFraction)} to ${String(noSoundTrialShareMaxFraction)}) admits no whole number of no-sound trials in a room with ${String(soundTrialCount)} sound trials.`,
      );
    }
  }
}

/**
 * Checks the settings a threshold search is created with and returns a frozen copy of exactly
 * the `ThresholdSearchSettings` fields. Throws a `RangeError` naming the field and the value for
 * the first rule broken, in the order R2.3 to R2.9.
 */
export function validateSearchSettings(
  settings: ThresholdSearchSettings,
): ThresholdSearchSettings {
  const copy: ThresholdSearchSettings = {
    downwardStepDb: settings.downwardStepDb,
    upwardStepDb: settings.upwardStepDb,
    startingLevelDb: settings.startingLevelDb,
    capRelativeToAnchorDb: settings.capRelativeToAnchorDb,
    floorDb: settings.floorDb,
    gapBetweenTrialsMinMs: settings.gapBetweenTrialsMinMs,
    gapBetweenTrialsMaxMs: settings.gapBetweenTrialsMaxMs,
    noSoundTrialShareMinFraction: settings.noSoundTrialShareMinFraction,
    noSoundTrialShareMaxFraction: settings.noSoundTrialShareMaxFraction,
    noSoundTrialProbabilityFraction: settings.noSoundTrialProbabilityFraction,
    falseAlarmRateUnreliableAboveFraction:
      settings.falseAlarmRateUnreliableAboveFraction,
    trialLimitPerEarPerRoomCount: settings.trialLimitPerEarPerRoomCount,
    thresholdCatchesMinCount: settings.thresholdCatchesMinCount,
    thresholdCatchShareMinFraction: settings.thresholdCatchShareMinFraction,
    floorCatchesForBetterThanFloorCount:
      settings.floorCatchesForBetterThanFloorCount,
    capMissesForWorseThanCapCount: settings.capMissesForWorseThanCapCount,
    inconsistentCatchMarginDb: settings.inconsistentCatchMarginDb,
  };
  checkIntegers(copy);
  checkSteps(copy);
  checkLevelGrid(copy);
  checkGaps(copy);
  checkFractions(copy);
  checkCountsAndMargin(copy);
  checkShareReachable(copy);
  return Object.freeze(copy);
}

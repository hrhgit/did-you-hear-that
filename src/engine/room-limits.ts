import { atMostFraction } from "./fraction-comparisons";
import type { Ear, ThresholdSearchSettings } from "./search-types";

/** The ears of a room. Their number doubles the per-ear limits into room limits. */
const roomEars = ["left", "right"] as const satisfies readonly Ear[];

export interface RoomLimits {
  /** The fewest presentations any ear search needs before it can end (D6). */
  readonly minimumEarPresentationCount: number;
  /** The fewest sound trials a room can have. */
  readonly minimumRoomSoundTrialCount: number;
  /** The most sound trials a room can have. */
  readonly maximumRoomSoundTrialCount: number;
  /** The most no-sound trials that keep the share at or below its maximum in the longest room. */
  readonly maximumRoomNoSoundTrialCount: number;
  /** The most trials a room can have: Room_Trial_Limit. */
  readonly roomTrialLimitCount: number;
}

/**
 * The largest whole number `c` of no-sound trials with `c / (c + soundTrialCount)` at most
 * `shareMaxFraction`. The share rises with `c`, so the closed form is only a starting point that
 * is then moved to the exact boundary as `atMostFraction` judges it.
 */
function largestNoSoundTrialCount(
  soundTrialCount: number,
  shareMaxFraction: number,
): number {
  const fitsShare = (noSoundTrialCount: number): boolean =>
    atMostFraction(
      noSoundTrialCount,
      noSoundTrialCount + soundTrialCount,
      shareMaxFraction,
    );
  let count = Math.max(
    0,
    Math.floor((shareMaxFraction * soundTrialCount) / (1 - shareMaxFraction)),
  );
  while (fitsShare(count + 1)) {
    count += 1;
  }
  while (count > 0 && !fitsShare(count)) {
    count -= 1;
  }
  return count;
}

/**
 * Derives the room's trial counts from the settings (design.md, D6). With the shipped settings:
 * 2, 4, 40, 13 and 53.
 *
 * Throws a `RangeError` when `noSoundTrialShareMaxFraction` is not below 1, because a room could
 * then hold any number of no-sound trials and would have no trial limit (D31).
 */
export function roomLimits(settings: ThresholdSearchSettings): RoomLimits {
  if (!(settings.noSoundTrialShareMaxFraction < 1)) {
    throw new RangeError(
      `noSoundTrialShareMaxFraction must be below 1, so that a room has a trial limit, but got ${String(settings.noSoundTrialShareMaxFraction)}.`,
    );
  }
  const minimumEarPresentationCount = Math.min(
    settings.thresholdCatchesMinCount,
    settings.floorCatchesForBetterThanFloorCount,
    settings.capMissesForWorseThanCapCount,
    settings.trialLimitPerEarPerRoomCount,
  );
  const minimumRoomSoundTrialCount =
    roomEars.length * minimumEarPresentationCount;
  const maximumRoomSoundTrialCount =
    roomEars.length * settings.trialLimitPerEarPerRoomCount;
  const maximumRoomNoSoundTrialCount = largestNoSoundTrialCount(
    maximumRoomSoundTrialCount,
    settings.noSoundTrialShareMaxFraction,
  );
  return Object.freeze({
    minimumEarPresentationCount,
    minimumRoomSoundTrialCount,
    maximumRoomSoundTrialCount,
    maximumRoomNoSoundTrialCount,
    roomTrialLimitCount:
      maximumRoomSoundTrialCount + maximumRoomNoSoundTrialCount,
  });
}

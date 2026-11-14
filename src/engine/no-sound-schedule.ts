import { atLeastFraction, atMostFraction } from "./fraction-comparisons";
import type { ThresholdSearchSettings } from "./search-types";

export interface NoSoundSchedule {
  /** May the next Search_Phase trial be a no-sound trial without risking the share maximum? */
  mayAddNoSoundTrial(counts: {
    noSound: number;
    sound: number;
    remainingSoundLowerBound: number;
  }): boolean;
  /** Does the room need another closing no-sound trial? */
  needsClosingTrial(counts: { noSound: number; sound: number }): boolean;
}

/**
 * The two count rules that bound the no-sound share of a room (R9.2, R9.3, D8). Neither draws a
 * random number: the room makes the draw.
 */
export function createNoSoundSchedule(
  settings: ThresholdSearchSettings,
): NoSoundSchedule {
  const { noSoundTrialShareMinFraction, noSoundTrialShareMaxFraction } =
    settings;
  return Object.freeze({
    // The final share is highest when the room ends with the fewest sound trials still
    // possible, so that is the case to check.
    mayAddNoSoundTrial: ({
      noSound,
      sound,
      remainingSoundLowerBound,
    }: {
      noSound: number;
      sound: number;
      remainingSoundLowerBound: number;
    }): boolean =>
      atMostFraction(
        noSound + 1,
        noSound + 1 + sound + remainingSoundLowerBound,
        noSoundTrialShareMaxFraction,
      ),
    needsClosingTrial: ({
      noSound,
      sound,
    }: {
      noSound: number;
      sound: number;
    }): boolean =>
      !atLeastFraction(noSound, noSound + sound, noSoundTrialShareMinFraction),
  });
}

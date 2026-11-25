import { audioOutputConfig } from "../../config/audio-output-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import type { SoundId } from "../../config/sound-id";
import { everySoundId } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { gainToDecibels } from "./gain-to-decibels";

/**
 * The Playable_Floor (audible-start design.md, "The playable floor"; R12.1): the quietest level the
 * sound can be played at with this calibration gain and still have the Playable_RMS
 * (`playableRmsMinFraction`), and never below `hearingMethodConfig.floorDb`. A pure function.
 *
 * Every sound is rendered at the reference RMS (ghost-sounds D7), so the level is the same for
 * every `soundId`: with the shipped numbers `−84 + 26.02 − S = −57.98 − S` at the calibration
 * setting S. The sound is named so that the floor is asked for as the room's top is, and a name
 * that is no sound throws a `RangeError`. Not rounded: rounding to the search's grid is the
 * caller's (`roomSearchFloorDb`), as for the top (D23).
 */
export function roomFloorLevelDb(
  soundId: SoundId,
  calibrationGain: number,
): number {
  if (!everySoundId.includes(soundId)) {
    throw new RangeError(`There is no sound ${String(soundId)}.`);
  }
  const playableLevelDb = gainToDecibels(
    audioOutputConfig.playableRmsMinFraction /
      (soundRulesConfig.referenceRmsFraction * calibrationGain),
  );
  return Math.max(hearingMethodConfig.floorDb, playableLevelDb);
}

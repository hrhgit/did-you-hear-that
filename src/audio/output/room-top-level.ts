import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import type { SoundId } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { gainToDecibels } from "./gain-to-decibels";

/**
 * The Room_Top_Level: the highest level a playable buffer of the sound can be played at with this
 * calibration gain without reaching the ceiling, and never above the anchor cap (R9.2).
 *
 * A playable buffer's peak is at most its Peak_Bound and the Output_Fade only lowers samples, so
 * at any level up to this one the ceiling never acts (CP6). Not rounded: rounding to the search's
 * grid is the caller's (D7).
 */
export function roomTopLevelDb(
  soundId: SoundId,
  calibrationGain: number,
): number {
  const peakAtAnchorFraction =
    soundRulesConfig.referenceRmsFraction *
    decibelsToGain(audioOutputConfig.peakBoundDb[soundId]) *
    calibrationGain;
  const ceilingLimitedDb = gainToDecibels(
    audioSafetyConfig.ceilingFraction / peakAtAnchorFraction,
  );
  return Math.min(hearingMethodConfig.capRelativeToAnchorDb, ceilingLimitedDb);
}

import { hearingMethodConfig } from "../../config/hearing-method-config";
import type { SoundId } from "../../config/sound-id";
import { soundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { gainToDecibels } from "./gain-to-decibels";
import { roomTopLevelDb } from "./room-top-level";

export interface RoomRange {
  readonly topLevelDb: number;
  readonly setBy: "anchorCap" | "ceiling";
  /** `capRelativeToAnchorDb − topLevelDb`, 0 or more. */
  readonly belowAnchorCapDb: number;
}

export interface RangeReport {
  readonly calibrationSettingDb: number;
  readonly calibrationGain: number;
  readonly rooms: Readonly<Record<SoundId, RoomRange>>;
  /** RMS of any sound at floorDb, as a fraction of full scale. */
  readonly floorRmsFraction: number;
}

/**
 * The Range_Report for one calibration gain (R9.2, R9.5, D7): the Room_Top_Level of every sound,
 * the limit that sets it, how far it lies below the anchor cap, and the RMS of a sound at the
 * floor. A pure function. When the anchor cap and the ceiling give the same top, the anchor cap
 * is named.
 */
export function rangeReport(calibrationGain: number): RangeReport {
  const { capRelativeToAnchorDb, floorDb } = hearingMethodConfig;
  const rooms = Object.fromEntries(
    soundIds.map((soundId) => {
      const topLevelDb = roomTopLevelDb(soundId, calibrationGain);
      const room: RoomRange = Object.freeze({
        topLevelDb,
        setBy: topLevelDb < capRelativeToAnchorDb ? "ceiling" : "anchorCap",
        belowAnchorCapDb: capRelativeToAnchorDb - topLevelDb,
      });
      return [soundId, room];
    }),
  ) as Record<SoundId, RoomRange>;
  return Object.freeze({
    calibrationSettingDb: gainToDecibels(calibrationGain),
    calibrationGain,
    rooms: Object.freeze(rooms),
    floorRmsFraction:
      soundRulesConfig.referenceRmsFraction *
      calibrationGain *
      decibelsToGain(floorDb),
  });
}

import { ghostSoundConfig } from "../config/ghost-sound-config";
import type {
  HearingMethodConfig,
  VisitType,
} from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import type { VisitRoom } from "./visit-flow-types";

/** What `visitRooms` reads: the visits' frequencies and each ghost sound's centre frequency. */
export interface VisitRoomsSettings {
  readonly roomFrequenciesHz: HearingMethodConfig["roomFrequenciesHz"];
  readonly ghostSounds: Readonly<
    Record<GhostSoundId, { readonly centreHz: number }>
  >;
}

const shippedSettings: VisitRoomsSettings = {
  roomFrequenciesHz: hearingMethodConfig.roomFrequenciesHz,
  ghostSounds: ghostSoundConfig,
};

/**
 * The rooms of a visit of this type, in the order of `roomFrequenciesHz[visitType]` (R2.7, D18).
 * Each room is the ghost sound whose centre frequency equals the room's frequency. Returns a
 * frozen list of frozen rooms. Throws a `RangeError` if a frequency matches no ghost sound or more
 * than one. A pure function.
 */
export function visitRooms(
  visitType: VisitType,
  settings: VisitRoomsSettings = shippedSettings,
): readonly VisitRoom[] {
  const rooms = settings.roomFrequenciesHz[visitType].map(
    (frequencyHz, roomIndex) => {
      const matches = ghostSoundIds.filter(
        (soundId) => settings.ghostSounds[soundId].centreHz === frequencyHz,
      );
      if (matches.length !== 1) {
        throw new RangeError(
          `The room frequency ${String(frequencyHz)} Hz of the ${visitType} visit must match the centre frequency of exactly one ghost sound, but matches ${String(matches.length)}.`,
        );
      }
      const [roomId] = matches as [GhostSoundId];
      const room: VisitRoom = { roomIndex, roomId, frequencyHz };
      return Object.freeze(room);
    },
  );
  return Object.freeze(rooms);
}

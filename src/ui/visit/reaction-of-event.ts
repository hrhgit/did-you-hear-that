import type { GhostSoundId } from "../../config/sound-id";
import {
  creatureCaughtLine,
  creatureGoneLine,
  creatureOtherSideLine,
  creatureSlippedLine,
} from "../../copy/creature-copy";
import { roomCopy } from "../../copy/room-copy";
import type { VisitEvent } from "../../session/visit-flow-types";

/** What the page does at once for an event of the visit. */
export type ScreenReaction =
  | {
      /**
       * A caught sound: its creature shows in the doorway of its side, with rings and what the
       * house says. `roomId` says whose sound it was.
       */
      readonly kind: "ripple";
      readonly side: "left" | "right";
      readonly roomId: GhostSoundId;
      readonly line: string;
    }
  | {
      /**
       * A sound that went by: the outline of its creature leaves by the doorway of its side, with
       * what the house says. Given only for a scored trial, whose time to answer is over.
       */
      readonly kind: "slipped";
      readonly side: "left" | "right";
      readonly roomId: GhostSoundId;
      readonly line: string;
    }
  | {
      /** The house says a line and nothing moves. */
      readonly kind: "say";
      readonly line: string;
    }
  | {
      /**
       * A creature's search is over and it has gone home. A second line under what the house said
       * about its last sound.
       */
      readonly kind: "gone";
      readonly roomId: GhostSoundId;
      readonly line: string;
    }
  | {
      /** Rings for a sound that is played again, from the doorway of its side, with its creature. */
      readonly kind: "replayRipple";
      readonly side: "left" | "right";
      readonly roomId: GhostSoundId;
    };

/**
 * The reaction to an event, or null when the page shows nothing for it. Inside a room only a
 * scored trial can give one, and the visit flow releases a scored trial in the moment it is
 * scored and not before. So the creature of a sound is shown only once its answer has been taken
 * or its time to answer is over (one-room design.md, "The creatures"). A caught sound shows its
 * creature on its side. A sound that went by, unanswered or answered on the other side, is shown
 * leaving by its side once its trial is scored (the game layer, 2026-11-16). An unanswered silence
 * gives null: the page stays as it was. A search that ends says where its creature went. After
 * the rooms, a sound that is played again gives rings as it starts. By then every answer has been
 * given, so they tell nothing that could be used. The room of a swapped repeat is a room like
 * every other: only its scored trials give a reaction. A practice sound gives a reaction only
 * when it is caught.
 */
export function reactionOfEvent(event: VisitEvent): ScreenReaction | null {
  if (event.kind === "replaySoundStarted") {
    return {
      kind: "replayRipple",
      side: event.sound.ear,
      roomId: event.sound.room.roomId,
    };
  }
  if (event.kind === "swappedTrialScored") {
    // A trial of a swapped repeat brings its own words, which name the ear and the earpiece.
    // The creature shows on the side of the ear, as the visitor heard it.
    const { room, trial, reaction, line } = event;
    if (line === null) {
      return null;
    }
    if (reaction === "ripple" && trial.kind === "sound") {
      return { kind: "ripple", side: trial.ear, roomId: room.roomId, line };
    }
    if (reaction === "noSoundLine") {
      return { kind: "say", line };
    }
    return null;
  }
  if (event.kind === "practiceSoundScored") {
    // A caught practice sound rings from its side, with its own line. Nothing of the practice
    // counts, and the side is the one the visitor just answered.
    const { room, trial, reaction, line } = event;
    return reaction === "ripple" && line !== null
      ? { kind: "ripple", side: trial.ear, roomId: room.roomId, line }
      : null;
  }
  if (event.kind === "reminderSoundScored") {
    // A caught reminder shows its creature on its side, like any catch. It counts for nothing.
    const { room, trial, reaction, line } = event;
    return reaction === "ripple" && line !== null
      ? { kind: "ripple", side: trial.ear, roomId: room.roomId, line }
      : null;
  }
  if (event.kind === "roomFinished") {
    const { roomId } = event.room;
    return { kind: "gone", roomId, line: creatureGoneLine(roomId) };
  }
  if (event.kind !== "trialScored") {
    return null;
  }
  const { trial, room, reaction } = event;
  const { roomId } = room;
  if (reaction === "ripple" && trial.kind === "sound") {
    return {
      kind: "ripple",
      side: trial.ear,
      roomId,
      line: creatureCaughtLine(
        roomId,
        trial.ear,
        room.frequencyHz,
        trial.playedLevelDb,
      ),
    };
  }
  if (reaction === "noSoundLine") {
    return { kind: "say", line: roomCopy.noSoundLine };
  }
  if (reaction === "nothingCame") {
    return { kind: "say", line: roomCopy.nothingCameLine };
  }
  if (trial.kind === "sound" && reaction === "slipped") {
    return {
      kind: "slipped",
      side: trial.ear,
      roomId,
      line: creatureSlippedLine(roomId, trial.ear),
    };
  }
  if (trial.kind === "sound" && reaction === "otherSide") {
    return {
      kind: "slipped",
      side: trial.ear,
      roomId,
      line: creatureOtherSideLine(roomId, trial.ear),
    };
  }
  return null;
}

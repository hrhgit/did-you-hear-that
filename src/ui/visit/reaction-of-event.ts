import type { GhostSoundId } from "../../config/sound-id";
import { caughtLine, roomCopy } from "../../copy/room-copy";
import type { VisitEvent } from "../../session/visit-flow-types";

/** What the page does at once for an event of the visit. */
export type ScreenReaction =
  | {
      /** A ripple from the wall on the side the sound was caught, with what the house says. */
      readonly kind: "ripple";
      readonly side: "left" | "right";
      readonly line: string;
    }
  | {
      /** The house says a line and nothing moves. */
      readonly kind: "say";
      readonly line: string;
    }
  | {
      /** A ripple for a sound that is played again, from the wall of its room on its side. */
      readonly kind: "replayRipple";
      readonly side: "left" | "right";
      readonly roomId: GhostSoundId;
    };

/**
 * The reaction to an event, or null when the page shows nothing for it. Inside a room only a
 * scored trial can give one, and the visit flow releases a scored trial in the moment it is
 * scored and not before. A missed sound, a wrong side and an unanswered silence give null: the
 * page stays as it was. After the rooms, a sound that is played again gives a ripple as it
 * starts. By then every answer has been given, so the ripple tells nothing that could be used.
 * The room of a swapped repeat is a room like every other: only its scored trials give a reaction.
 * A practice sound before a room counts gives a ripple only when it is caught.
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
    // The ripple comes from the side of the ear, as the visitor heard it.
    const { trial, reaction, line } = event;
    if (line === null) {
      return null;
    }
    if (reaction === "ripple" && trial.kind === "sound") {
      return { kind: "ripple", side: trial.ear, line };
    }
    if (reaction === "noSoundLine") {
      return { kind: "say", line };
    }
    return null;
  }
  if (event.kind === "practiceSoundScored") {
    // A caught practice sound ripples from its side, with its own line. Nothing of the practice
    // counts, and the side is the one the visitor just answered.
    const { trial, reaction, line } = event;
    return reaction === "ripple" && line !== null
      ? { kind: "ripple", side: trial.ear, line }
      : null;
  }
  if (event.kind !== "trialScored") {
    return null;
  }
  const { trial, room, reaction } = event;
  if (reaction === "ripple" && trial.kind === "sound") {
    return {
      kind: "ripple",
      side: trial.ear,
      line: caughtLine(trial.ear, room.frequencyHz, trial.playedLevelDb),
    };
  }
  if (reaction === "noSoundLine") {
    return { kind: "say", line: roomCopy.noSoundLine };
  }
  return null;
}

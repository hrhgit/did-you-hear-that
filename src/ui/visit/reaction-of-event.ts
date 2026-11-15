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
    };

/**
 * The reaction to an event, or null when the page shows nothing for it. Only a scored trial can
 * give one, and the visit flow releases a scored trial in the moment it is scored and not
 * before. A missed sound, a wrong side and an unanswered silence give null: the page stays as it
 * was.
 */
export function reactionOfEvent(event: VisitEvent): ScreenReaction | null {
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

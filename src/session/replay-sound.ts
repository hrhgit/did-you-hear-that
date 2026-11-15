import type { PlayOutcome } from "../audio/output/create-audio-output";
import { positionLabel, rippleLabel } from "../copy/replay-lines";
import { pitchLabel, roomNames } from "../copy/room-copy";
import type { PlannedReplaySound } from "./missed-sound-replay-plan";
import type { ReplaySound } from "./visit-flow-types";

/** What `replaySoundOf` reads of a scheduled play. */
export type ReplayPlayedLevel = Pick<
  Extract<PlayOutcome, { readonly kind: "scheduled" }>,
  "playedLevelDb" | "clampLimit"
>;

/**
 * A planned sound and the outcome of its play, as the view and the `replaySoundStarted` event give
 * it (missed-sound-replay design.md, "The Replay_Controller", R4.6, R7.4, R7.5). `position` is its
 * place in the replay, from 1 to `soundCount`. The cap changed its level when the plan held it
 * below its raised level, or when the output stage names a clamp limit, which audio-output R9.4
 * rules out at or below the room top; then the label says so and the sound gives the played level,
 * so the label is never wrong about what played. Returns frozen plain data. A pure function.
 */
export function replaySoundOf(
  planned: PlannedReplaySound,
  outcome: ReplayPlayedLevel,
  position: number,
  soundCount: number,
): ReplaySound {
  const capChangedLevel = planned.heldByCap || outcome.clampLimit !== null;
  return Object.freeze({
    position,
    positionLabel: positionLabel(position, soundCount),
    trialOrder: planned.trialOrder,
    room: Object.freeze({ ...planned.room }),
    roomName: roomNames[planned.room.roomId],
    pitchLabel: pitchLabel(planned.room.frequencyHz),
    ear: planned.ear,
    missedLevelDb: planned.missedLevelDb,
    raisedLevelDb: planned.raisedLevelDb,
    replayCapDb: planned.replayCapDb,
    askedLevelDb: planned.askedLevelDb,
    playedLevelDb: outcome.playedLevelDb,
    clampLimit: outcome.clampLimit,
    capChangedLevel,
    rippleLabel: rippleLabel(
      planned.ear,
      planned.room.frequencyHz,
      planned.missedLevelDb,
      capChangedLevel,
    ),
  });
}

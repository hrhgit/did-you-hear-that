import type { VisitType } from "../../src/config/hearing-method-config";
import { planMissedSoundReplay } from "../../src/session/missed-sound-replay-plan";
import {
  missedSoundReplayView,
  type ReplayViewInput,
} from "../../src/session/missed-sound-replay-view";
import { replaySoundOf } from "../../src/session/replay-sound";
import type {
  MissedSoundReplaySnapshot,
  ReplayPauseReason,
  ReplaySound,
  ReplaySoundStartedEvent,
} from "../../src/session/visit-flow-types";
import { simulatedResult, type SimulatedVisitor } from "./simulated-result";

/**
 * The replay of missed sounds of a visit that a simulated visitor walked in Node. The log is the
 * one the real visit flow wrote. The plan, every sound and every view come from the same pure
 * functions of `src/session` that the flow uses, so each snapshot here holds what a visitor's page
 * would be handed at that moment. No sound is played to make them.
 */
export interface SimulatedReplay {
  /** Before the first sound, or the one view of a visit in which nothing was missed. */
  readonly opening: MissedSoundReplaySnapshot;
  /** One moment for each sound, in the order of the replay: its snapshot and its event. */
  readonly sounds: readonly {
    readonly snapshot: MissedSoundReplaySnapshot;
    readonly event: ReplaySoundStartedEvent;
    readonly sound: ReplaySound;
  }[];
  /** After the visitor's press and before the first sound. Null when nothing was missed. */
  readonly started: MissedSoundReplaySnapshot | null;
  /** After the last sound. Null when nothing was missed. */
  readonly finished: MissedSoundReplaySnapshot | null;
  /** The snapshot of a pause that holds while the sound at this place in `sounds` is the current one. */
  paused(
    soundIndex: number,
    reason: ReplayPauseReason,
  ): MissedSoundReplaySnapshot;
}

/** Walks a visit and lays out every moment of the replay of its missed sounds. */
export async function simulatedReplay(
  visitType: VisitType,
  visitor: SimulatedVisitor,
  seed?: number,
): Promise<SimulatedReplay> {
  const { visitLog: log } = await simulatedResult(visitType, visitor, seed);
  const plan = planMissedSoundReplay(log);
  const snapshotOf = (
    input: Omit<ReplayViewInput, "log" | "plan">,
  ): MissedSoundReplaySnapshot => {
    const replay = missedSoundReplayView({ log, plan, ...input });
    const paused = input.pauseReason !== null;
    return {
      stage: "missedSoundReplay",
      visitType: log.visitType,
      rooms: log.rooms,
      finishedRoomCount: log.rooms.length,
      // The flow goes on when asked, except while a pause holds.
      canProceed: !paused,
      pause:
        paused && input.pauseReason !== null
          ? { reason: input.pauseReason }
          : null,
      activationRefused: false,
      visitLog: log,
      replay,
    };
  };

  if (plan.sounds.length === 0) {
    return {
      opening: snapshotOf({
        phase: "nothingMissed",
        current: null,
        ending: null,
        pauseReason: null,
      }),
      sounds: [],
      started: null,
      finished: null,
      paused: () => {
        throw new Error("A replay with no sounds cannot pause.");
      },
    };
  }

  // Each sound plays at the level the plan asks for: the plan already holds it under its cap.
  const played = plan.sounds.map((planned, index) =>
    replaySoundOf(
      planned,
      { playedLevelDb: planned.askedLevelDb, clampLimit: null },
      index + 1,
      plan.sounds.length,
    ),
  );
  const playing = (
    current: ReplaySound | null,
    pauseReason: ReplayPauseReason | null,
  ): MissedSoundReplaySnapshot =>
    snapshotOf({ phase: "playing", current, ending: null, pauseReason });

  return {
    opening: snapshotOf({
      phase: "announcing",
      current: null,
      ending: null,
      pauseReason: null,
    }),
    started: playing(null, null),
    sounds: played.map((sound) => ({
      snapshot: playing(sound, null),
      event: { kind: "replaySoundStarted", sound },
      sound,
    })),
    finished: snapshotOf({
      phase: "finished",
      current: played[played.length - 1] ?? null,
      ending: "allPlayed",
      pauseReason: null,
    }),
    paused: (soundIndex, reason) => {
      const sound = played[soundIndex];
      if (sound === undefined) {
        throw new RangeError(
          `The replay has no sound at place ${String(soundIndex)}.`,
        );
      }
      return playing(sound, reason);
    },
  };
}

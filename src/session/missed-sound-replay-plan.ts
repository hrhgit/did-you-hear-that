import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { MissedSoundReplayConfig } from "../config/missed-sound-replay-config";
import { missedSoundReplayConfig } from "../config/missed-sound-replay-config";
import { evenSelectionIndexes } from "./even-selection-indexes";
import type { Ear, VisitLog, VisitRoom } from "./visit-flow-types";

/** What `planMissedSoundReplay` reads besides the log. */
export type ReplayPlanSettings = Pick<
  HearingMethodConfig,
  "capRelativeToAnchorDb"
> &
  Pick<MissedSoundReplayConfig, "replayRaiseDb" | "replaySoundsMaxCount">;

/** One missed trial as the replay will play it. Plain data, frozen. */
export interface PlannedReplaySound {
  readonly trialOrder: number;
  readonly room: VisitRoom;
  readonly ear: Ear;
  readonly missedLevelDb: number;
  readonly raisedLevelDb: number;
  readonly replayCapDb: number;
  readonly askedLevelDb: number;
  /** askedLevelDb < raisedLevelDb. */
  readonly heldByCap: boolean;
}

export interface ReplayPlan {
  /** Every Missed_Trial, in order. */
  readonly missedSounds: readonly PlannedReplaySound[];
  /** The sounds the replay plays, in order: all of them, or the Even_Selection. */
  readonly sounds: readonly PlannedReplaySound[];
  /** sounds.length < missedSounds.length. */
  readonly selected: boolean;
}

const shippedSettings: ReplayPlanSettings = Object.freeze({
  capRelativeToAnchorDb: hearingMethodConfig.capRelativeToAnchorDb,
  replayRaiseDb: missedSoundReplayConfig.replayRaiseDb,
  replaySoundsMaxCount: missedSoundReplayConfig.replaySoundsMaxCount,
});

const runKey = (roomIndex: number, attempt: number): string =>
  `${String(roomIndex)}:${String(attempt)}`;

/**
 * The replay of a visit's missed sounds (missed-sound-replay design.md, "The replay plan", R3 to
 * R5, D3 to D7). A Missed_Trial is a scored sound trial with the outcome `missed` in a room run
 * that finished. Each is played again `replayRaiseDb` above the level it was played at, held at
 * its Replay_Cap: its room's top in the log's last calibration, never above the anchor cap. When
 * there are more than `replaySoundsMaxCount`, the replay plays their Even_Selection.
 *
 * Reads the log and the settings and nothing else; the result is deeply frozen plain data. Throws
 * a `RangeError` when a Missed_Trial names a room the log does not have, or when the log has a
 * Missed_Trial and no calibration. A pure function.
 */
export function planMissedSoundReplay(
  log: VisitLog,
  settings: ReplayPlanSettings = shippedSettings,
): ReplayPlan {
  const { capRelativeToAnchorDb, replayRaiseDb, replaySoundsMaxCount } =
    settings;
  const finishedRuns = new Set(
    log.roomAttempts
      .filter((attempt) => attempt.ending === "finished")
      .map((attempt) => runKey(attempt.roomIndex, attempt.attempt)),
  );
  // The log's trials are in the order of `order` (visit-flow R10.1), so filtering keeps it.
  const missed = log.trials.filter(
    (trial) =>
      trial.status === "scored" &&
      trial.kind === "sound" &&
      trial.outcome === "missed" &&
      finishedRuns.has(runKey(trial.roomIndex, trial.attempt)),
  );
  const calibration = log.calibrations.at(-1);
  if (missed.length > 0 && calibration === undefined) {
    throw new RangeError(
      "The visit log has a missed sound and no calibration to replay it with.",
    );
  }
  const missedSounds = missed.map((trial): PlannedReplaySound => {
    const room = log.rooms[trial.roomIndex];
    if (room === undefined) {
      throw new RangeError(
        `The trial of order ${String(trial.order)} names room ${String(trial.roomIndex)}, which the visit log does not have.`,
      );
    }
    if (calibration === undefined || trial.kind !== "sound") {
      // Ruled out above and by the filter; kept so the types follow.
      throw new RangeError("A missed trial must be a calibrated sound trial.");
    }
    const missedLevelDb = trial.playedLevelDb;
    const raisedLevelDb = missedLevelDb + replayRaiseDb;
    const replayCapDb = Math.min(
      calibration.roomTopLevelDb[room.roomId],
      capRelativeToAnchorDb,
    );
    const askedLevelDb = Math.min(raisedLevelDb, replayCapDb);
    return Object.freeze({
      trialOrder: trial.order,
      room: Object.freeze({
        roomIndex: room.roomIndex,
        roomId: room.roomId,
        frequencyHz: room.frequencyHz,
      }),
      ear: trial.ear,
      missedLevelDb,
      raisedLevelDb,
      replayCapDb,
      askedLevelDb,
      heldByCap: askedLevelDb < raisedLevelDb,
    });
  });
  const sounds = evenSelectionIndexes(
    missedSounds.length,
    replaySoundsMaxCount,
  ).map((position) => missedSounds[position]!);
  return Object.freeze({
    missedSounds: Object.freeze(missedSounds),
    sounds: Object.freeze(sounds),
    selected: sounds.length < missedSounds.length,
  });
}

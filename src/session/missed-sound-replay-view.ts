import type { MissedSoundReplayConfig } from "../config/missed-sound-replay-config";
import { missedSoundReplayConfig } from "../config/missed-sound-replay-config";
import { replayCopy } from "../copy/replay-copy";
import {
  announcementLines,
  endLine,
  selectionLine,
  sideCountLine,
} from "../copy/replay-lines";
import type { ReplayPlan } from "./missed-sound-replay-plan";
import { replayCounts } from "./replay-counts";
import type {
  MissedSoundReplay,
  ReplayCounts,
  ReplayEnding,
  ReplayPauseReason,
  ReplayPhase,
  ReplaySound,
  VisitLog,
} from "./visit-flow-types";

/** The state of a replay that its view is made from. */
export interface ReplayViewInput {
  readonly log: VisitLog;
  readonly plan: ReplayPlan;
  readonly phase: ReplayPhase;
  /** The sound that started last, or null when none has. */
  readonly current: ReplaySound | null;
  /** How the replay ended; set in `finished` and null in every other phase. */
  readonly ending: ReplayEnding | null;
  /** The reason of the pause that holds, or null. Read only in `playing`. */
  readonly pauseReason: ReplayPauseReason | null;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

/** A copy of a sound, so that freezing the view never freezes the caller's object. */
function soundCopy(sound: ReplaySound | null): ReplaySound | null {
  return sound === null ? null : { ...sound, room: { ...sound.room } };
}

/** The running count of both sides through a trial order, or over the whole log for null (D11). */
function countsOf(
  log: VisitLog,
  throughTrialOrder: number | null,
): ReplayCounts {
  const { left, right } = replayCounts(log, throughTrialOrder);
  return {
    throughTrialOrder,
    left,
    right,
    leftLine: sideCountLine(
      "left",
      left.madeCount,
      left.caughtCount,
      left.wrongSideCount,
    ),
    rightLine: sideCountLine(
      "right",
      right.madeCount,
      right.caughtCount,
      right.wrongSideCount,
    ),
  };
}

/**
 * The Replay_View of one moment: everything the screen shows and says in the stage
 * `missedSoundReplay` (missed-sound-replay design.md, "`missedSoundReplayView(input, settings)`",
 * R6 to R13, D21, D23). Every string comes from `src/copy`. Returns deeply frozen plain data, and
 * equal inputs give equal views. Throws a `RangeError` for a `finished` phase with no ending. A
 * pure function.
 */
export function missedSoundReplayView(
  input: ReplayViewInput,
  settings: Pick<
    MissedSoundReplayConfig,
    "replayRaiseDb"
  > = missedSoundReplayConfig,
): MissedSoundReplay {
  const { log, plan, phase, current, ending, pauseReason } = input;
  const missed = plan.missedSounds.length;
  const played = plan.sounds.length;
  const base = {
    heading: replayCopy.heading,
    missedSoundCount: missed,
    replaySoundCount: played,
    selectionLine: plan.selected ? selectionLine(missed, played) : null,
    stopLabel: replayCopy.stopButton,
  };
  switch (phase) {
    case "nothingMissed":
      return deepFreeze({
        ...base,
        phase,
        line: replayCopy.nothingMissedLine,
        counts: countsOf(log, null),
        canStart: false,
        canSkip: false,
        proceedLabel: replayCopy.goOnButton,
      });
    case "announcing":
      return deepFreeze({
        ...base,
        phase,
        announcementLines: announcementLines(settings.replayRaiseDb),
        startLabel: replayCopy.startButton,
        canStart: true,
        canSkip: true,
        proceedLabel: replayCopy.skipButton,
      });
    case "playing":
      return deepFreeze({
        ...base,
        phase,
        current: soundCopy(current),
        counts: current === null ? null : countsOf(log, current.trialOrder),
        pauseLine:
          pauseReason === null ? null : replayCopy.pauseLines[pauseReason],
        resumeLabel: replayCopy.resumeButton,
        canStart: false,
        canSkip: pauseReason === null,
        proceedLabel: replayCopy.skipRestButton,
      });
    case "finished":
      if (ending === null) {
        throw new RangeError("A finished replay needs its ending.");
      }
      return deepFreeze({
        ...base,
        phase,
        ending,
        endLine: endLine(ending, played, missed),
        counts: countsOf(log, null),
        last: soundCopy(current),
        canStart: false,
        canSkip: false,
        proceedLabel: replayCopy.goOnButton,
      });
    default:
      throw new RangeError(`Unknown replay phase ${String(phase)}.`);
  }
}

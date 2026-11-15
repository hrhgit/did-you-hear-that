import type { AudioOutputConfig } from "../config/audio-output-config";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { MissedSoundReplayConfig } from "../config/missed-sound-replay-config";
import { missedSoundReplayConfig } from "../config/missed-sound-replay-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import type { VisitFlowConfig } from "../config/visit-flow-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type { AudioOutput } from "../audio/output/create-audio-output";
import type { StopReason } from "../audio/output/output-types";
import type {
  ReplayPlan,
  ReplayPlanSettings,
} from "./missed-sound-replay-plan";
import { planMissedSoundReplay } from "./missed-sound-replay-plan";
import { missedSoundReplayView } from "./missed-sound-replay-view";
import { replaySoundOf } from "./replay-sound";
import type {
  MissedSoundReplay,
  ReplayEnding,
  ReplayPauseReason,
  ReplayPhase,
  ReplaySound,
  ReplaySoundStartedEvent,
  VisitLog,
} from "./visit-flow-types";
import { soundWindowStartMs } from "./window-start";

/** What the Replay_Controller reads from the config. */
export type MissedSoundReplaySettings = ReplayPlanSettings &
  Pick<MissedSoundReplayConfig, "replayGapMs"> &
  Pick<AudioOutputConfig, "scheduleLeadMs"> &
  Pick<VisitFlowConfig, "refusedPlaysInARowMaxCount">;

const shippedSettings: MissedSoundReplaySettings = Object.freeze({
  capRelativeToAnchorDb: hearingMethodConfig.capRelativeToAnchorDb,
  replayRaiseDb: missedSoundReplayConfig.replayRaiseDb,
  replaySoundsMaxCount: missedSoundReplayConfig.replaySoundsMaxCount,
  replayGapMs: missedSoundReplayConfig.replayGapMs,
  scheduleLeadMs: audioOutputConfig.scheduleLeadMs,
  refusedPlaysInARowMaxCount: visitFlowConfig.refusedPlaysInARowMaxCount,
});

export interface MissedSoundReplayOptions {
  readonly output: AudioOutput;
  /** The visit's timer: its callbacks run as steps of the flow and stop when the visit is dropped. */
  readonly timer: Timer;
  readonly log: VisitLog;
  /** The source of every render: createSeededRandom(the seed drawn on entering the stage). */
  readonly random: RandomSource;
  /** Hands an event to the flow, which releases it at the end of the step. */
  readonly emit: (event: ReplaySoundStartedEvent) => void;
  /** A play was refused `notRunning`: the flow acts as on a stop report with this reason. */
  readonly notRunning: (reason: StopReason) => void;
  /** The plan's settings, `replayGapMs`, `scheduleLeadMs` and `refusedPlaysInARowMaxCount`. */
  readonly settings?: MissedSoundReplaySettings;
}

export interface MissedSoundReplayController {
  readonly plan: ReplayPlan;
  phase(): ReplayPhase;
  /** The view for the snapshot, given the reason of the pause that holds, or null. */
  view(pauseReason: ReplayPauseReason | null): MissedSoundReplay;
  /** announcing → playing; asks for the first sound one gap later. The flow calls it once sound runs. */
  start(): void;
  /** Cancels every timer. Calls output.stopAll() when a sound may be under way. For skip. */
  skip(): void;
  /** A hidden page or an interruption in `playing`: cancels the timers; a sound under way is cut. Returns whether the replay is now paused. */
  cut(): boolean;
  /** After the pause ends: asks for the cut sound, or the next, one gap later. */
  resume(): void;
  /** Ends the replay with this ending: cancels the timers; `finished`. */
  end(ending: Exclude<ReplayEnding, "allPlayed">): void;
  /** Cancels every timer for good. For stop, a left page and the result. */
  cancel(): void;
}

/**
 * Creates the Replay_Controller of one replay (missed-sound-replay design.md, "The
 * Replay_Controller", R6, R7, R10 to R13, D8 to D10, D14 to D16, D20, D22). It plans the replay
 * from the log alone, waits for `start`, then plays the planned sounds one at a time through
 * `output.play` with the Purpose `replay`, each one `replayGapMs` after the end of the one before.
 * It holds at most one pending timer, reads time only through the timer it is given, and writes
 * nothing to the log.
 *
 * It has no part in gestures, the snapshot's pause field or the stage, which stay in the flow.
 */
export function createMissedSoundReplay(
  options: MissedSoundReplayOptions,
): MissedSoundReplayController {
  const { output, timer, log, random, emit } = options;
  const settings = options.settings ?? shippedSettings;
  const plan = planMissedSoundReplay(log, settings);
  const soundCount = plan.sounds.length;

  let phase: ReplayPhase = soundCount === 0 ? "nothingMissed" : "announcing";
  /** The index in `plan.sounds` of the sound to play next, or of the one under way. */
  let nextIndex = 0;
  let current: ReplaySound | null = null;
  let ending: ReplayEnding | null = null;
  let refusalsInARow = 0;
  let handle: TimerHandle | null = null;
  /** True from a scheduled play to the end of that sound. */
  let underWay = false;

  const clearTimer = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  const finish = (how: ReplayEnding): void => {
    clearTimer();
    underWay = false;
    phase = "finished";
    ending = how;
  };

  const askAfter = (delayMs: number): void => {
    clearTimer();
    handle = timer.setTimeout(() => {
      handle = null;
      play();
    }, delayMs);
  };

  /** The shell's stop reason, or `interrupted` when it gives none or `control`, as the room runner does. */
  const stopReasonOfShell = (): StopReason => {
    const state = output.state();
    return state.kind === "stopped" && state.reason !== "control"
      ? state.reason
      : "interrupted";
  };

  const play = (): void => {
    const planned = plan.sounds[nextIndex];
    if (phase !== "playing" || planned === undefined) {
      return;
    }
    const askedAtMs = timer.now();
    const outcome = output.play({
      soundId: planned.room.roomId,
      ear: planned.ear,
      levelDb: planned.askedLevelDb,
      purpose: "replay",
      random,
    });
    if (outcome.kind === "refused") {
      if (outcome.reason === "notRunning") {
        options.notRunning(stopReasonOfShell());
        return;
      }
      if (outcome.reason === "notCalibrated") {
        finish("deviceChanged");
        return;
      }
      refusalsInARow += 1;
      if (refusalsInARow >= settings.refusedPlaysInARowMaxCount) {
        finish("soundRefused");
        return;
      }
      askAfter(settings.replayGapMs);
      return;
    }
    refusalsInARow = 0;
    underWay = true;
    const startAtMs = soundWindowStartMs(
      {
        startMs: outcome.startMs,
        pair: output.timestampPair(),
        presentedAtMs: askedAtMs,
      },
      settings,
    );
    const endAtMs = startAtMs + (outcome.endMs - outcome.startMs);
    const position = nextIndex + 1;
    handle = timer.setTimeout(
      () => {
        handle = null;
        current = replaySoundOf(planned, outcome, position, soundCount);
        emit(Object.freeze({ kind: "replaySoundStarted", sound: current }));
        handle = timer.setTimeout(
          () => {
            handle = null;
            underWay = false;
            nextIndex += 1;
            if (nextIndex >= soundCount) {
              finish("allPlayed");
              return;
            }
            askAfter(settings.replayGapMs);
          },
          Math.max(0, endAtMs - timer.now()),
        );
      },
      Math.max(0, startAtMs - timer.now()),
    );
  };

  const controller: MissedSoundReplayController = {
    plan,
    phase: () => phase,
    view: (pauseReason) =>
      missedSoundReplayView(
        { log, plan, phase, current, ending, pauseReason },
        settings,
      ),
    start() {
      if (phase !== "announcing") {
        return;
      }
      phase = "playing";
      askAfter(settings.replayGapMs);
    },
    skip() {
      clearTimer();
      if (underWay) {
        output.stopAll();
      }
      underWay = false;
    },
    cut() {
      if (phase !== "playing") {
        return false;
      }
      clearTimer();
      // nextIndex stays: the cut sound comes again.
      underWay = false;
      return true;
    },
    resume() {
      if (phase !== "playing") {
        return;
      }
      askAfter(settings.replayGapMs);
    },
    end(how) {
      finish(how);
    },
    cancel() {
      clearTimer();
      underWay = false;
    },
  };
  return Object.freeze(controller);
}

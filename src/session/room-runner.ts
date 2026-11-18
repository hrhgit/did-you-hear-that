import type { AudioOutputConfig } from "../config/audio-output-config";
import { audioOutputConfig } from "../config/audio-output-config";
import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import type { VisitFlowConfig } from "../config/visit-flow-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type { AudioOutput } from "../audio/output/create-audio-output";
import { classifyResponse } from "../engine/classify-response";
import type {
  Ear,
  RoomResult,
  SoundOutcome,
  ThresholdSearch,
  Trial,
  VisitorResponse,
} from "../engine/search-types";
import { answerTimeMs } from "./answer-time";
import type {
  PlayedReminder,
  PlayedTrial,
  VisitLogRecorder,
} from "./visit-log-recorder";
import type {
  ScoredReminderSound,
  ScoredVisitTrial,
  VisitRoom,
} from "./visit-flow-types";
import { noSoundWindowStartMs, soundWindowStartMs } from "./window-start";

/**
 * What a test listener needs to answer a trial, handed to `onTrialPresented` when the trial's
 * window is set (D26). Times are on the timer's clock. Not part of the interface contract: the
 * interface never sees it.
 */
export interface PresentedTrial {
  readonly kind: "sound" | "noSound";
  /** The ear of a sound trial, or null. */
  readonly ear: Ear | null;
  /** The level the search asked for, or null for a no-sound trial. */
  readonly levelDb: number | null;
  /** The start of the response window. */
  readonly windowStartMs: number;
  /** Its end. An answer at this time is too late. */
  readonly windowEndMs: number;
  readonly roomIndex: number;
  readonly attempt: number;
  readonly trialNumber: number;
  /**
   * True for a practice sound, whose `trialNumber` is its number within its practice round. Absent
   * for a trial of the search.
   */
  readonly practice?: true;
  /**
   * True for a reminder sound, which counts for nothing and whose `trialNumber` is the number of
   * the trial that waits behind it (the game layer, 2026-11-17). Absent for a trial of the search.
   */
  readonly reminder?: true;
}

/** The latest offset of the visit (D4), shared by every room run of one visit. */
export interface LatestOffset {
  /** `soundWindowStart − (presentedAt + scheduleLeadMs)` of the last scheduled sound, 0 before the first. */
  latestOffsetMs: number;
}

/** What the room runner reads from the config. */
export type RoomRunnerSettings = Pick<HearingMethodConfig, "responseWindowMs"> &
  Pick<AudioOutputConfig, "scheduleLeadMs"> &
  Pick<VisitFlowConfig, "refusedPlaysInARowMaxCount">;

const shippedSettings: RoomRunnerSettings = Object.freeze({
  responseWindowMs: hearingMethodConfig.responseWindowMs,
  scheduleLeadMs: audioOutputConfig.scheduleLeadMs,
  refusedPlaysInARowMaxCount: visitFlowConfig.refusedPlaysInARowMaxCount,
});

/** One Room_Attempt as a runner plays it: a room, its search and the run's number. */
export interface RoomTrack {
  /** The threshold search of this room run. */
  readonly search: ThresholdSearch;
  readonly room: VisitRoom;
  /** The run's number: 1, or 2 and up after a device change. */
  readonly attempt: number;
  /**
   * The search's cap and floor, which hold a reminder sound too (the game layer, 2026-11-17).
   * Without them a reminder is held by the output stage's own limits only.
   */
  readonly searchCapDb?: number;
  readonly searchFloorDb?: number;
}

/** What every runner takes, whether it runs one room or several together. */
interface RunnerCommonOptions {
  readonly output: AudioOutput;
  readonly timer: Timer;
  /** The source the sound renders draw from. */
  readonly soundRandom: RandomSource;
  readonly recorder: VisitLogRecorder;
  readonly latestOffset: LatestOffset;
  /** Called when the output stage refused a trial sound because it is not running. */
  readonly pauseFromOutput: () => void;
  /** Called when one trial's sound was refused `refusedPlaysInARowMaxCount` times in a row. */
  readonly soundRefused: () => void;
  /** The test hook of D26. */
  readonly onTrialPresented?: (trial: PresentedTrial) => void;
  readonly settings?: RoomRunnerSettings;
}

export interface RoomRunnerOptions extends RunnerCommonOptions, RoomTrack {
  /** Called with a decided trial's log entry, in the same call that decides it. */
  readonly scored: (entry: ScoredVisitTrial) => void;
  /** Called when the search has finished, after the last `scored`. */
  readonly finished: (result: RoomResult) => void;
}

/**
 * The game layer of a mixed runner (the game layer, 2026-11-17): a reminder sound after a long time
 * with no catch, a soft chime after each catch, and a word for each answer that decided nothing.
 * None of them reaches a search.
 */
export interface RoomGameOptions {
  /** After this long with no catch, a reminder sound plays before the waiting trial. */
  readonly reminderAfterQuietMs: number;
  /** How far above the last catch of the waiting creature on that ear the reminder plays. */
  readonly reminderAboveCaughtDb: number;
  /** The reminder's level on an ear on which that creature has not been caught yet. */
  readonly reminderUncaughtLevelDb: number;
  /** How far above the caught sound the chime plays. */
  readonly chimeAboveCaughtDb: number;
  /** The loudest the chime plays. */
  readonly chimeMaxLevelDb: number;
  /** Called with a decided reminder's log entry and the track it was played for. */
  readonly reminderScored: (
    entry: ScoredReminderSound,
    track: RoomTrack,
  ) => void;
  /** Called after an answer that decided nothing has been logged. */
  readonly answerIgnored: () => void;
}

/** What the runner of several rooms together takes (one-room design.md, "The mixed runner"). */
export interface MixedRoomRunnerOptions extends RunnerCommonOptions {
  /** The room runs that take turns, in the order of the visit. At least one. */
  readonly tracks: readonly RoomTrack[];
  /**
   * Draws which unfinished track presents next. It is drawn from once after every decided trial
   * and once at the start, and never while only one track is unfinished.
   */
  readonly turnRandom: RandomSource;
  /** Called with a decided trial's log entry and its track, in the same call that decides it. */
  readonly scored: (entry: ScoredVisitTrial, track: RoomTrack) => void;
  /** Called when one track's search has finished, after that trial's `scored`. */
  readonly trackFinished: (track: RoomTrack, result: RoomResult) => void;
  /** Called once, when every track has finished, after the last `trackFinished`. */
  readonly finished: () => void;
  /** The game layer. Absent: no reminder, no chime. */
  readonly game?: RoomGameOptions;
}

export type RoomRunnerState =
  "idle" | "waitingGap" | "presented" | "paused" | "finished";

/** One room run on the timer (visit-flow design.md, "The room runner"). */
export interface RoomRunner {
  /** Waits the first trial's gap. Only acts once, before anything else. */
  start(): void;
  /** The visitor names a side. Decides the presented trial, or is logged as ignored. */
  answer(side: Ear, pressedAtMs?: number): void;
  /** Cancels the gap, or discards the presented trial. The waiting trial stays waiting. */
  pause(): void;
  /** After a pause: waits the waiting trial's own gap again and presents it (D9). */
  resume(): void;
  /** Ends the run without a result: cancels the gap, or discards the presented trial. */
  abandon(): void;
  state(): RoomRunnerState;
  /**
   * The room run whose trial waits or is presented, or null before the start and once every run
   * has finished. An answer that decides nothing is logged against it.
   */
  waitingTrack(): Pick<RoomTrack, "room" | "attempt"> | null;
}

interface TrialPresentation {
  readonly kind: "trial";
  readonly track: RoomTrack;
  readonly played: PlayedTrial;
  readonly trial: Trial;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}

/** A reminder sound under way. `trial` is the trial that waits behind it. */
interface ReminderPresentation {
  readonly kind: "reminder";
  readonly track: RoomTrack;
  readonly played: PlayedReminder;
  readonly trial: Trial;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}

type Presentation = TrialPresentation | ReminderPresentation;

/**
 * Creates the runner of one Room_Attempt (R7, R8, R12.3, R12.4, R12.7, R21, D3, D4, D9, D10, D25,
 * D34). It takes the trial the search is waiting on, waits its gap, plays it through the output
 * shell (or plays nothing for a no-sound trial), opens its response window, and decides it at the
 * first answer in the window or with `none` at the window's end. Every wait is on the injected
 * timer and every random number comes from the sources it is given.
 *
 * Between the start of a gap and the decision of its trial it calls nothing that reaches the
 * interface: the only callback that leads to an event is `scored`.
 */
export function createRoomRunner(options: RoomRunnerOptions): RoomRunner {
  const { search, room, attempt, scored, finished, ...common } = options;
  return createMixedRoomRunner({
    ...common,
    tracks: [{ search, room, attempt }],
    // One track never draws a turn.
    turnRandom: noTurns,
    scored: (entry) => {
      scored(entry);
    },
    trackFinished: (_track, result) => {
      finished(result);
    },
    finished: () => undefined,
  });
}

/** The turn source of a runner with one track, which never draws from it. */
const noTurns: RandomSource = Object.freeze({
  seed: 0,
  next(): number {
    throw new Error("A room run with one track draws no turn.");
  },
});

/**
 * Creates the runner of several Room_Attempts that take turns in one room (one-room design.md,
 * "The mixed runner"). Each track keeps its own search. After every decided trial, and at the
 * start, the runner draws which unfinished track presents next; with one track unfinished it draws
 * nothing, so a runner of one track behaves exactly as `createRoomRunner` always has. The track
 * drawn stays the one that waits through a pause and through a refused sound.
 *
 * A trial is presented and decided as in `createRoomRunner`, and logged with its own track's room
 * and attempt. Between the start of a gap and the decision of its trial the runner calls nothing
 * that reaches the interface: which track waits is not told to anyone but the log of an ignored
 * answer.
 *
 * Throws a `RangeError` for an empty list of tracks.
 */
export function createMixedRoomRunner(
  options: MixedRoomRunnerOptions,
): RoomRunner {
  const { output, timer, tracks, turnRandom, soundRandom, recorder } = options;
  const { latestOffset, game } = options;
  const settings = options.settings ?? shippedSettings;
  if (tracks.length === 0) {
    throw new RangeError("A room run needs at least one track.");
  }

  let state: RoomRunnerState = "idle";
  let handle: TimerHandle | null = null;
  let presentation: Presentation | null = null;
  let refusalsInARow = 0;
  /** The track whose trial waits or is presented. */
  let turn: RoomTrack | null = null;
  const finishedTracks = new Set<RoomTrack>();
  /** When the room last caught a sound, began, resumed or played a reminder (the game layer). */
  let quietSinceMs = 0;
  /** The level each track's creature was last caught at, by ear. */
  const lastCaughtDb = new Map<RoomTrack, Partial<Record<Ear, number>>>();
  /** The ear of the last reminder for a trial with no sound, so they take turns. */
  let lastSilentReminderEar: Ear = "right";

  const clearTimer = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  const waitingTrial = (track: RoomTrack): Trial | null => {
    const step = track.search.current();
    return step.kind === "trial" ? step.trial : null;
  };

  /** Draws the track that presents next, or null when every track has finished. */
  const drawTurn = (): RoomTrack | null => {
    const open = tracks.filter(
      (track) => !finishedTracks.has(track) && waitingTrial(track) !== null,
    );
    if (open.length <= 1) {
      return open[0] ?? null;
    }
    const index = Math.min(
      open.length - 1,
      Math.floor(turnRandom.next() * open.length),
    );
    return open[index] ?? null;
  };

  const waitGap = (track: RoomTrack, trial: Trial): void => {
    state = "waitingGap";
    handle = timer.setTimeout(() => {
      handle = null;
      present(track, trial);
    }, trial.gapBeforeMs);
  };

  /** Waits the trial's gap, with a reminder first when the room has been quiet too long. */
  const waitNext = (track: RoomTrack, trial: Trial): void => {
    if (
      game === undefined ||
      timer.now() - quietSinceMs < game.reminderAfterQuietMs
    ) {
      waitGap(track, trial);
      return;
    }
    state = "waitingGap";
    handle = timer.setTimeout(() => {
      handle = null;
      presentReminder(track, trial, game);
    }, trial.gapBeforeMs);
  };

  /** Plays the soft chime after a catch, on its ear, above the caught level and within the limit. */
  const chime = (ear: Ear, caughtLevelDb: number): void => {
    if (game === undefined) {
      return;
    }
    output.fadeOutSound();
    output.play({
      soundId: "chime",
      ear,
      levelDb: Math.min(
        caughtLevelDb + game.chimeAboveCaughtDb,
        game.chimeMaxLevelDb,
      ),
      purpose: "chime",
      random: soundRandom,
    });
  };

  const presentReminder = (
    track: RoomTrack,
    trial: Trial,
    gameOptions: RoomGameOptions,
  ): void => {
    const { room, attempt } = track;
    const presentedAtMs = timer.now();
    quietSinceMs = presentedAtMs;
    let ear: Ear;
    if (trial.kind === "sound") {
      ear = trial.ear;
    } else {
      ear = lastSilentReminderEar === "left" ? "right" : "left";
      lastSilentReminderEar = ear;
    }
    const caught = lastCaughtDb.get(track)?.[ear];
    const wantedDb =
      caught === undefined
        ? gameOptions.reminderUncaughtLevelDb
        : caught + gameOptions.reminderAboveCaughtDb;
    const levelDb = Math.max(
      track.searchFloorDb ?? Number.NEGATIVE_INFINITY,
      Math.min(track.searchCapDb ?? Number.POSITIVE_INFINITY, wantedDb),
    );
    const outcome = output.play({
      soundId: room.roomId,
      ear,
      levelDb,
      purpose: "reminder",
      random: soundRandom,
    });
    if (outcome.kind === "refused") {
      if (outcome.reason === "notRunning") {
        state = "waitingGap";
        options.pauseFromOutput();
        return;
      }
      // A reminder the output would not play is skipped: the trial waits its own gap.
      waitGap(track, trial);
      return;
    }
    const windowStartMs = soundWindowStartMs(
      { startMs: outcome.startMs, pair: output.timestampPair(), presentedAtMs },
      settings,
    );
    latestOffset.latestOffsetMs =
      windowStartMs - (presentedAtMs + settings.scheduleLeadMs);
    const windowEndMs = windowStartMs + settings.responseWindowMs;
    presentation = {
      kind: "reminder",
      track,
      trial,
      played: {
        roomIndex: room.roomIndex,
        attempt,
        ear,
        requestedLevelDb: levelDb,
        playedLevelDb: outcome.playedLevelDb,
        clampLimit: outcome.clampLimit,
        gapBeforeMs: trial.gapBeforeMs,
        presentedAtMs,
        windowStartMs,
      },
      windowStartMs,
      windowEndMs,
    };
    state = "presented";
    handle = timer.setTimeout(
      () => {
        handle = null;
        decide("none", null);
      },
      Math.max(0, windowEndMs - timer.now()),
    );
    options.onTrialPresented?.(
      Object.freeze({
        kind: "sound",
        ear,
        levelDb,
        windowStartMs,
        windowEndMs,
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
        reminder: true,
      }),
    );
  };

  const decideReminder = (
    current: ReminderPresentation,
    response: VisitorResponse,
    answeredAtMs: number | null,
  ): void => {
    const { track, trial, played } = current;
    const outcome: SoundOutcome =
      response === "none"
        ? "missed"
        : response === played.ear
          ? "caught"
          : "wrongSide";
    if (response !== "none") {
      output.fadeOutSound();
    }
    const entry = recorder.reminderScored(played, {
      response,
      outcome,
      answeredAtMs,
      scoredAtMs: timer.now(),
    });
    if (outcome === "caught") {
      quietSinceMs = timer.now();
      chime(played.ear, played.playedLevelDb);
    }
    // The trial behind it waits its own gap before anything is told: a callback may pause.
    waitGap(track, trial);
    game?.reminderScored(entry, track);
  };

  const present = (track: RoomTrack, trial: Trial): void => {
    const { room, attempt } = track;
    const presentedAtMs = timer.now();
    let played: PlayedTrial;
    let windowStartMs: number;
    if (trial.kind === "sound") {
      const outcome = output.play({
        soundId: room.roomId,
        ear: trial.ear,
        levelDb: trial.levelDb,
        purpose: "trial",
        random: soundRandom,
      });
      if (outcome.kind === "refused") {
        if (outcome.reason === "notRunning") {
          // The trial was not played. The flow pauses, and the runner pauses with it.
          state = "waitingGap";
          options.pauseFromOutput();
          return;
        }
        recorder.playRefused({
          atMs: presentedAtMs,
          roomIndex: room.roomIndex,
          attempt,
          trialNumber: trial.trialNumber,
          reason: outcome.reason,
        });
        refusalsInARow += 1;
        if (refusalsInARow >= settings.refusedPlaysInARowMaxCount) {
          state = "finished";
          options.soundRefused();
          return;
        }
        waitGap(track, trial);
        return;
      }
      refusalsInARow = 0;
      windowStartMs = soundWindowStartMs(
        {
          startMs: outcome.startMs,
          pair: output.timestampPair(),
          presentedAtMs,
        },
        settings,
      );
      latestOffset.latestOffsetMs =
        windowStartMs - (presentedAtMs + settings.scheduleLeadMs);
      played = {
        kind: "sound",
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
        gapBeforeMs: trial.gapBeforeMs,
        presentedAtMs,
        windowStartMs,
        ear: trial.ear,
        requestedLevelDb: trial.levelDb,
        playedLevelDb: outcome.playedLevelDb,
        clampLimit: outcome.clampLimit,
      };
    } else {
      windowStartMs = noSoundWindowStartMs(
        { presentedAtMs, latestOffsetMs: latestOffset.latestOffsetMs },
        settings,
      );
      played = {
        kind: "noSound",
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
        gapBeforeMs: trial.gapBeforeMs,
        presentedAtMs,
        windowStartMs,
      };
    }
    const windowEndMs = windowStartMs + settings.responseWindowMs;
    presentation = {
      kind: "trial",
      track,
      played,
      trial,
      windowStartMs,
      windowEndMs,
    };
    state = "presented";
    handle = timer.setTimeout(
      () => {
        handle = null;
        decide("none", null);
      },
      Math.max(0, windowEndMs - timer.now()),
    );
    options.onTrialPresented?.(
      Object.freeze({
        kind: trial.kind,
        ear: trial.kind === "sound" ? trial.ear : null,
        levelDb: trial.kind === "sound" ? trial.levelDb : null,
        windowStartMs,
        windowEndMs,
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: trial.trialNumber,
      }),
    );
  };

  const decide = (
    response: VisitorResponse,
    answeredAtMs: number | null,
  ): void => {
    const current = presentation;
    if (current === null) {
      return;
    }
    clearTimer();
    presentation = null;
    if (current.kind === "reminder") {
      decideReminder(current, response, answeredAtMs);
      return;
    }
    const { track, played } = current;
    const outcome = classifyResponse(current.trial, response);
    const step = track.search.respond(response);
    refusalsInARow = 0;
    if (played.kind === "sound" && response !== "none") {
      // An answer ends its sound at once, so the next sound never finds the output busy.
      output.fadeOutSound();
    }
    const entry = recorder.trialScored(played, {
      response,
      outcome,
      answeredAtMs,
      scoredAtMs: timer.now(),
    });
    if (played.kind === "sound" && outcome === "caught") {
      quietSinceMs = timer.now();
      lastCaughtDb.set(track, {
        ...lastCaughtDb.get(track),
        [played.ear]: played.playedLevelDb,
      });
      chime(played.ear, played.playedLevelDb);
    }
    if (step.kind === "finished") {
      finishedTracks.add(track);
    }
    // The next turn is drawn, and its gap begun, before anything is told: a callback may pause.
    turn = drawTurn();
    const next = turn === null ? null : waitingTrial(turn);
    if (turn === null || next === null) {
      turn = null;
      state = "finished";
    } else {
      waitNext(turn, next);
    }
    options.scored(entry, track);
    if (step.kind === "finished") {
      options.trackFinished(track, step.result);
    }
    if (finishedTracks.size === tracks.length) {
      options.finished();
    }
  };

  /** Stops the run's timer and logs the presented trial, if any, as discarded (R12.3, R12.4). */
  const interrupt = (): void => {
    clearTimer();
    if (presentation !== null) {
      if (presentation.kind === "reminder") {
        recorder.reminderDiscarded(presentation.played, timer.now());
      } else {
        recorder.trialDiscarded(presentation.played, timer.now());
      }
      presentation = null;
    }
  };

  const runner: RoomRunner = {
    start() {
      if (state !== "idle") {
        return;
      }
      if (tracks.some((track) => waitingTrial(track) === null)) {
        throw new Error(
          "A room run cannot start on a search that has finished.",
        );
      }
      turn = drawTurn();
      const trial = turn === null ? null : waitingTrial(turn);
      if (turn === null || trial === null) {
        throw new Error(
          "A room run cannot start on a search that has finished.",
        );
      }
      quietSinceMs = timer.now();
      waitGap(turn, trial);
    },

    answer(side, pressedAtMs) {
      if (
        (side !== "left" && side !== "right") ||
        state === "idle" ||
        state === "paused" ||
        state === "finished"
      ) {
        return;
      }
      const atMs = answerTimeMs(pressedAtMs, timer.now());
      if (
        state === "presented" &&
        presentation !== null &&
        presentation.windowStartMs <= atMs &&
        atMs < presentation.windowEndMs
      ) {
        decide(side, atMs);
        return;
      }
      if (turn === null) {
        return;
      }
      recorder.answerIgnored({
        atMs,
        side,
        roomIndex: turn.room.roomIndex,
        attempt: turn.attempt,
      });
      game?.answerIgnored();
    },

    pause() {
      if (state !== "waitingGap" && state !== "presented") {
        return;
      }
      interrupt();
      state = "paused";
    },

    resume() {
      if (state !== "paused") {
        return;
      }
      const trial = turn === null ? null : waitingTrial(turn);
      if (turn === null || trial === null) {
        state = "finished";
        return;
      }
      quietSinceMs = timer.now();
      waitGap(turn, trial);
    },

    abandon() {
      if (state === "finished") {
        return;
      }
      interrupt();
      state = "finished";
    },

    state: () => state,

    waitingTrack: () =>
      turn === null || state === "finished" || state === "idle" ? null : turn,
  };
  return Object.freeze(runner);
}

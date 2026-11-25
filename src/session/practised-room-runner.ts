import type { AudioOutputConfig } from "../config/audio-output-config";
import { audioOutputConfig } from "../config/audio-output-config";
import type { HearingMethodConfig } from "../config/hearing-method-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import type { VisitFlowConfig } from "../config/visit-flow-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type { AudioOutput } from "../audio/output/create-audio-output";
import type {
  Ear,
  SoundOutcome,
  VisitorResponse,
} from "../engine/search-types";
import { answerTimeMs } from "./answer-time";
import type {
  LatestOffset,
  PresentedTrial,
  RoomRunner,
  RoomRunnerState,
} from "./room-runner";
import type { PlayedPractice, VisitLogRecorder } from "./visit-log-recorder";
import type {
  PracticeMiss,
  RoomPracticePhase,
  ScoredPracticeTrial,
  VisitRoom,
} from "./visit-flow-types";
import type { BeatSlot, BeatTiming } from "./beat-clock";
import { soundWindowStartMs } from "./window-start";
import { rhythmConfig } from "../config/rhythm-config";

/** What the practice reads from the config. */
export type PracticeSettings = Pick<
  HearingMethodConfig,
  "responseWindowMs" | "upwardStepDb"
> &
  Pick<AudioOutputConfig, "scheduleLeadMs"> &
  Pick<
    VisitFlowConfig,
    | "refusedPlaysInARowMaxCount"
    | "practiceStartLevelDb"
    | "practiceGapMs"
    | "practiceSoundsPerEarMaxCount"
  >;

const shippedSettings: PracticeSettings = Object.freeze({
  responseWindowMs: hearingMethodConfig.responseWindowMs,
  upwardStepDb: hearingMethodConfig.upwardStepDb,
  scheduleLeadMs: audioOutputConfig.scheduleLeadMs,
  refusedPlaysInARowMaxCount: visitFlowConfig.refusedPlaysInARowMaxCount,
  practiceStartLevelDb: visitFlowConfig.practiceStartLevelDb,
  practiceGapMs: visitFlowConfig.practiceGapMs,
  practiceSoundsPerEarMaxCount: visitFlowConfig.practiceSoundsPerEarMaxCount,
});

/** The ears in the order each practice round plays them. */
const practiceEars: readonly Ear[] = Object.freeze(["left", "right"]);

/**
 * The levels one ear's practice sounds ask for in one round: the start, then one upward step
 * louder each time, none above the room's search cap. Two levels may be the same once the cap is
 * reached. Pure.
 */
export function practiceLevelsDb(
  searchCapDb: number,
  settings: Pick<
    PracticeSettings,
    "practiceStartLevelDb" | "upwardStepDb" | "practiceSoundsPerEarMaxCount"
  > = shippedSettings,
): readonly number[] {
  const start = Math.min(settings.practiceStartLevelDb, searchCapDb);
  return Object.freeze(
    Array.from({ length: settings.practiceSoundsPerEarMaxCount }, (_, index) =>
      Math.min(start + index * settings.upwardStepDb, searchCapDb),
    ),
  );
}

/** One room of a practice: the room, the number of its run and the top of its search. */
export interface PractisedRoom {
  readonly room: VisitRoom;
  readonly attempt: number;
  /** The loudest level this room's search may ask for. No practice sound of it asks for more. */
  readonly searchCapDb: number;
}

/** What every practising runner takes, whether it practises one room or several. */
interface PractiseCommonOptions {
  readonly output: AudioOutput;
  readonly timer: Timer;
  readonly soundRandom: RandomSource;
  readonly recorder: VisitLogRecorder;
  readonly latestOffset: LatestOffset;
  /** The runner of the search, started once the practice ends. */
  readonly counting: RoomRunner;
  /** Called with a decided practice sound's log entry, in the same call that decides it. */
  readonly practiceScored: (entry: ScoredPracticeTrial) => void;
  /** Called once, when the practice ends and the counting begins. */
  readonly countingStarted: () => void;
  /** Begin counting after the roll call even if some practice sounds went uncaught. */
  readonly continueAfterMisses?: boolean;
  /** As the room runner's: a practice sound was refused because the output is not running. */
  readonly pauseFromOutput: () => void;
  /** As the room runner's: one practice sound was refused too many times in a row. */
  readonly soundRefused: () => void;
  /** The test hook of visit-flow D26. Practice sounds carry `practice: true`. */
  readonly onTrialPresented?: (trial: PresentedTrial) => void;
  readonly settings?: PracticeSettings;
  /** Puts every practice sound on the room's beat (the rhythm game, 2026-11-18). */
  readonly beat?: BeatTiming;
}

export interface PractisedRoomRunnerOptions
  extends PractiseCommonOptions, PractisedRoom {
  /** Called when a round ends with a side that never caught its sound. */
  readonly notHeard: (ears: readonly Ear[]) => void;
}

/** What the runner that practises several rooms takes (one-room design.md, "The roll call"). */
export interface PractisedRoomsRunnerOptions extends PractiseCommonOptions {
  /** The rooms to practise, in the order they are practised. At least one. */
  readonly rooms: readonly PractisedRoom[];
  /** Called when a round ends with a room's side that never caught its sound. */
  readonly notHeard: (missed: readonly PracticeMiss[]) => void;
}

/**
 * What the room's screen needs to know of the practice. The side is given only while a practice
 * sound plays, as `soundEar`: the screen stands the creature in the doorway of that side then.
 */
export interface PracticeState {
  readonly phase: RoomPracticePhase;
  readonly soundPlaying: boolean;
  /** The ear whose practice sound plays now, or null when none does. */
  readonly soundEar: Ear | null;
  /** The sides a round left uncaught, each once, in the order they were first missed. */
  readonly notHeardEars: readonly Ear[];
  /** The room whose sound the practice plays or is about to play, or null outside `practice`. */
  readonly practising: VisitRoom | null;
  /** The rooms' sides a round left uncaught, in the order they were practised. */
  readonly notHeard: readonly PracticeMiss[];
}

/** A room runner that practises first. `goOn` ends a not-heard round and starts the counting. */
export interface PractisedRoomRunner extends RoomRunner {
  goOn(): void;
  practice(): PracticeState;
}

/** One room's side, to be practised. */
interface Turn {
  readonly member: PractisedRoom;
  readonly ear: Ear;
}

interface Pending {
  readonly turn: Turn;
  readonly levelDb: number;
  readonly practiceNumber: number;
}

interface Presented {
  readonly turn: Turn;
  readonly sound: PlayedPractice;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}

/**
 * Creates the runner of one room run that begins with practice (audible-start, light plan of
 * 2026-11-16). Each ear in turn hears the room's sound at `practiceLevelsDb`: the anchor, or the
 * room's cap if that is lower, and one upward step louder after a miss. A caught sound ends that
 * ear's practice and gives a ripple. A round that leaves a side uncaught calls `notHeard`: the flow
 * pauses, `resume` plays a new round for those sides, and `goOn` starts the counting without them.
 * Nothing of practice reaches the search or the trials of the log.
 */
export function createPractisedRoomRunner(
  options: PractisedRoomRunnerOptions,
): PractisedRoomRunner {
  const { room, attempt, searchCapDb, notHeard, ...common } = options;
  return createPractisedRoomsRunner({
    ...common,
    rooms: [{ room, attempt, searchCapDb }],
    notHeard: (missed) => {
      notHeard(Object.freeze(missed.map(({ ear }) => ear)));
    },
  });
}

/**
 * Creates the runner of several room runs that begin with one practice between them (one-room
 * design.md, "The roll call"). The rooms are practised one after another in the order given, each
 * as `createPractisedRoomRunner` practises one: the left ear and then the right, at that room's
 * `practiceLevelsDb`. A round that leaves a room's side uncaught calls `notHeard` once, after the
 * last room: `resume` plays a new round for those rooms' sides, and `goOn` starts the counting
 * without them. A practice sound is logged with its own room and attempt; the round is counted
 * across the rooms, and the number of a practice sound within its room and round.
 *
 * Throws a `RangeError` for an empty list of rooms.
 */
export function createPractisedRoomsRunner(
  options: PractisedRoomsRunnerOptions,
): PractisedRoomRunner {
  const { output, timer, rooms, recorder, latestOffset, counting } = options;
  const settings = options.settings ?? shippedSettings;
  const first = rooms[0];
  if (first === undefined) {
    throw new RangeError("A practice needs at least one room.");
  }
  const levelsOf = new Map<PractisedRoom, readonly number[]>(
    rooms.map((member) => [
      member,
      practiceLevelsDb(member.searchCapDb, settings),
    ]),
  );
  const everyTurn: readonly Turn[] = rooms.flatMap((member) =>
    practiceEars.map((ear) => ({ member, ear })),
  );

  type Phase =
    | "idle"
    | "waitingGap"
    | "presented"
    | "paused"
    | "notHeard"
    | "counting"
    | "finished";
  let phase: Phase = "idle";
  let handle: TimerHandle | null = null;
  let round = 1;
  /** The practice sounds each room has been given this round, by room index. */
  let numberOf = new Map<number, number>();
  /** The sides still to practise this round, the first one under way. */
  let queue: Turn[] = [];
  /** How many sounds the side under way has heard this round. */
  let soundIndex = 0;
  let missed: Turn[] = [];
  let pending: Pending | null = null;
  let presented: Presented | null = null;
  let refusalsInARow = 0;
  const beat = options.beat;
  /** The off-beat of the sound just put on the beat, told once the step that chose it is over. */
  let pendingCueMs: number | null = null;
  const flushCue = (): void => {
    if (pendingCueMs === null || beat === undefined) {
      return;
    }
    const atMs = pendingCueMs;
    pendingCueMs = null;
    beat.cued(atMs);
  };

  const clearTimer = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  const missesOf = (turns: readonly Turn[]): readonly PracticeMiss[] =>
    Object.freeze(
      turns.map(({ member, ear }) => Object.freeze({ room: member.room, ear })),
    );

  const waitGap = (sound: Pending): void => {
    phase = "waitingGap";
    const clock = beat?.clock() ?? null;
    if (beat === undefined || clock === null) {
      handle = timer.setTimeout(() => {
        handle = null;
        present(sound, null);
      }, settings.practiceGapMs);
      return;
    }
    const slot = clock.slotNotBefore(
      timer.now() + Math.max(settings.practiceGapMs, beat.cueLeadMs),
    );
    pendingCueMs = slot.pageMs;
    handle = timer.setTimeout(
      () => {
        handle = null;
        present(sound, slot);
      },
      Math.max(
        0,
        slot.pageMs -
          settings.scheduleLeadMs -
          rhythmConfig.presentAheadMs -
          timer.now(),
      ),
    );
  };

  const beginCounting = (): void => {
    phase = "counting";
    pending = null;
    options.countingStarted();
    counting.start();
  };

  /** Waits for the next practice sound, or ends the round. */
  const next = (): void => {
    const turn = queue[0];
    if (turn === undefined) {
      if (missed.length > 0 && !options.continueAfterMisses) {
        phase = "notHeard";
        pending = null;
        options.notHeard(missesOf(missed));
        return;
      }
      beginCounting();
      return;
    }
    const { roomIndex } = turn.member.room;
    const practiceNumber = (numberOf.get(roomIndex) ?? 0) + 1;
    numberOf.set(roomIndex, practiceNumber);
    const levels = levelsOf.get(turn.member) ?? [];
    const levelDb = levels[soundIndex] ?? levels[levels.length - 1] ?? 0;
    pending = { turn, levelDb, practiceNumber };
    waitGap(pending);
  };

  const beginRound = (turns: readonly Turn[]): void => {
    queue = [...turns];
    soundIndex = 0;
    missed = [];
    numberOf = new Map();
    next();
  };

  const present = (sound: Pending, slot: BeatSlot | null): void => {
    const { member, ear } = sound.turn;
    const { room, attempt } = member;
    const presentedAtMs = timer.now();
    const outcome = output.play({
      soundId: room.roomId,
      ear,
      levelDb: sound.levelDb,
      purpose: "practice",
      random: options.soundRandom,
      ...(slot === null ? {} : { startAtMs: slot.audioMs }),
    });
    if (outcome.kind === "refused") {
      if (outcome.reason === "notRunning") {
        phase = "waitingGap";
        options.pauseFromOutput();
        return;
      }
      recorder.practiceRefused({
        atMs: presentedAtMs,
        roomIndex: room.roomIndex,
        attempt,
        round,
        practiceNumber: sound.practiceNumber,
        reason: outcome.reason,
      });
      refusalsInARow += 1;
      if (refusalsInARow >= settings.refusedPlaysInARowMaxCount) {
        phase = "finished";
        options.soundRefused();
        return;
      }
      waitGap(sound);
      flushCue();
      return;
    }
    refusalsInARow = 0;
    const windowStartMs = soundWindowStartMs(
      { startMs: outcome.startMs, pair: output.timestampPair(), presentedAtMs },
      settings,
    );
    latestOffset.latestOffsetMs =
      windowStartMs - (presentedAtMs + settings.scheduleLeadMs);
    const windowEndMs = windowStartMs + settings.responseWindowMs;
    presented = {
      turn: sound.turn,
      sound: {
        roomIndex: room.roomIndex,
        attempt,
        round,
        practiceNumber: sound.practiceNumber,
        ear,
        requestedLevelDb: sound.levelDb,
        playedLevelDb: outcome.playedLevelDb,
        clampLimit: outcome.clampLimit,
        gapBeforeMs: settings.practiceGapMs,
        presentedAtMs,
        windowStartMs,
      },
      windowStartMs,
      windowEndMs,
    };
    phase = "presented";
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
        levelDb: sound.levelDb,
        windowStartMs,
        windowEndMs,
        roomIndex: room.roomIndex,
        attempt,
        trialNumber: sound.practiceNumber,
        practice: true,
      }),
    );
  };

  const decide = (
    response: VisitorResponse,
    answeredAtMs: number | null,
  ): void => {
    const current = presented;
    if (current === null) {
      return;
    }
    clearTimer();
    presented = null;
    const { turn } = current;
    const outcome: SoundOutcome =
      response === turn.ear
        ? "caught"
        : response === "none"
          ? "missed"
          : "wrongSide";
    const entry = recorder.practiceScored(current.sound, {
      response,
      outcome,
      answeredAtMs,
      scoredAtMs: timer.now(),
    });
    if (outcome === "caught") {
      queue.shift();
      soundIndex = 0;
    } else {
      soundIndex += 1;
      if (soundIndex >= settings.practiceSoundsPerEarMaxCount) {
        missed.push(turn);
        queue.shift();
        soundIndex = 0;
      }
    }
    // The ripple's event comes before a not-heard pause that the next step may begin.
    options.practiceScored(entry);
    next();
    flushCue();
  };

  /** Stops the practice's timer and logs the presented sound, if any, as discarded. */
  const interrupt = (): void => {
    clearTimer();
    pendingCueMs = null;
    if (presented !== null) {
      recorder.practiceDiscarded(presented.sound, timer.now());
      presented = null;
    }
  };

  /** The room an answer that decides nothing is logged against. */
  const practisedNow = (): PractisedRoom => pending?.turn.member ?? first;

  const runner: PractisedRoomRunner = {
    start() {
      if (phase !== "idle") {
        return;
      }
      beginRound(everyTurn);
      flushCue();
    },

    answer(side, pressedAtMs) {
      if (side !== "left" && side !== "right") {
        return;
      }
      if (phase === "counting") {
        counting.answer(side, pressedAtMs);
        return;
      }
      if (phase !== "waitingGap" && phase !== "presented") {
        return;
      }
      const atMs = answerTimeMs(pressedAtMs, timer.now());
      if (
        phase === "presented" &&
        presented !== null &&
        presented.windowStartMs <= atMs &&
        atMs < presented.windowEndMs
      ) {
        decide(side, atMs);
        return;
      }
      const { room, attempt } = practisedNow();
      recorder.practiceAnswerIgnored({
        atMs,
        side,
        roomIndex: room.roomIndex,
        attempt,
      });
    },

    pause() {
      if (phase === "counting") {
        counting.pause();
        return;
      }
      if (phase !== "waitingGap" && phase !== "presented") {
        return;
      }
      interrupt();
      phase = "paused";
    },

    resume() {
      switch (phase) {
        case "counting":
          counting.resume();
          return;
        case "paused":
          if (pending !== null) {
            waitGap(pending);
            flushCue();
          }
          return;
        case "notHeard":
          round += 1;
          beginRound(missed);
          flushCue();
          return;
        default:
          return;
      }
    },

    goOn() {
      if (phase === "notHeard") {
        beginCounting();
      }
    },

    abandon() {
      if (phase === "finished") {
        return;
      }
      if (phase === "counting") {
        counting.abandon();
      } else {
        interrupt();
      }
      phase = "finished";
    },

    state(): RoomRunnerState {
      switch (phase) {
        case "counting":
          return counting.state();
        case "notHeard":
          return "paused";
        default:
          return phase;
      }
    },

    waitingTrack() {
      if (phase === "counting") {
        return counting.waitingTrack();
      }
      if (phase === "idle" || phase === "finished" || pending === null) {
        return null;
      }
      const { room, attempt } = pending.turn.member;
      return { room, attempt };
    },

    practice(): PracticeState {
      const practicePhase: RoomPracticePhase =
        phase === "notHeard"
          ? "notHeard"
          : phase === "counting" ||
              (phase === "finished" && counting.state() === "finished")
            ? "counting"
            : "practice";
      const misses = phase === "notHeard" ? missed : [];
      const playing = presented;
      return Object.freeze({
        phase: practicePhase,
        soundPlaying: phase === "presented",
        soundEar:
          phase === "presented" && playing !== null ? playing.turn.ear : null,
        notHeardEars: Object.freeze([...new Set(misses.map(({ ear }) => ear))]),
        practising:
          practicePhase === "practice"
            ? (pending?.turn.member.room ?? first.room)
            : null,
        notHeard: missesOf(misses),
      });
    },
  };
  return Object.freeze(runner);
}

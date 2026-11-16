import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { VisitType } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import { createSeededRandom } from "../config/seeded-random";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import type { Timer, TimerHandle } from "../config/timer";
import { calibrationCopy, roomsShortLine } from "../copy/calibration-copy";
import { headphoneCheckCopy } from "../copy/headphone-check-copy";
import { notHeardLines, practiceCopy } from "../copy/practice-copy";
import { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import type { AudioBackend } from "../audio/output/audio-backend";
import type {
  AudioOutput,
  CalibrationMusicOutput,
  KeepRefusal,
  PlayRefusal,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import type {
  StopReason,
  UnsupportedReason,
} from "../audio/output/output-types";
import { createWebAudioBackend } from "../audio/output/web-audio-backend";
import type { RoomResult } from "../engine/search-types";
import { createThresholdSearch } from "../engine/threshold-search";
import { createCalibrationController } from "./calibration-controller";
import type { MissedSoundReplayController } from "./create-missed-sound-replay";
import { createMissedSoundReplay } from "./create-missed-sound-replay";
import type {
  FlowPresentedTrial,
  SwappedRepeatController,
} from "./create-swapped-repeat";
import { createSwappedRepeat } from "./create-swapped-repeat";
import type {
  HeadphoneCheckAnswer,
  HeadphoneCheckJudgement,
} from "./judge-headphone-check";
import { judgeHeadphoneCheck } from "./judge-headphone-check";
import type { PractisedRoomRunner } from "./practised-room-runner";
import { createPractisedRoomRunner } from "./practised-room-runner";
import type { LatestOffset, PresentedTrial } from "./room-runner";
import { createRoomRunner } from "./room-runner";
import { roomSearchCapDb } from "./room-search-cap";
import { roomSearchFloorDb } from "./room-search-floor";
import { summarizeVisit } from "./summarize-visit";
import type {
  EarpieceState,
  EntrySnapshot,
  ExitReason,
  LoggedCalibration,
  MissedSoundReplay,
  PauseReason,
  RoomPractice,
  ScoredVisitTrial,
  SnapshotBase,
  SwappedRepeatPauseReason,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
  TrialReaction,
  VisitEvent,
  VisitFlow,
  VisitFlowOptions,
  VisitLog,
  VisitPause,
  VisitRoom,
  VisitSnapshot,
  VisitStage,
  VisitSummary,
} from "./visit-flow-types";
import type { VisitLogRecorder } from "./visit-log-recorder";
import { createVisitLogRecorder } from "./visit-log-recorder";
import { visitRooms } from "./visit-rooms";

export type { PresentedTrial } from "./room-runner";

/**
 * For tests and, later, the robot spec. Never passed by src/ui (D26). In place of the window it
 * takes the backend to build the output shell on, or the output shell itself.
 */
export type VisitFlowTestOptions = {
  readonly timer: Timer;
  readonly seed: number;
  /**
   * Called when a trial's window is set, with what a listener needs to answer it: in the rooms of
   * the visit and in a swapped repeat, with the earpiece of the sound (swapped-repeat R8.7). A
   * listener typed for `PresentedTrial` still fits it.
   */
  readonly onTrialPresented?: (trial: FlowPresentedTrial) => void;
} & (
  | { readonly backend: AudioBackend }
  | {
      /** An output without the music's calls has the hiss as its only calibration sound. */
      readonly output: AudioOutput & Partial<CalibrationMusicOutput>;
    }
);

/** Seeds are drawn as `floor(u × 2³²)`, every whole number a seed may be (D19). */
const seedRangeCount = 0x100000000;

const drawSeed = (source: RandomSource): number =>
  Math.floor(source.next() * seedRangeCount);

const emptyRooms: readonly VisitRoom[] = Object.freeze([]);

const visitTypes: readonly VisitType[] = Object.freeze(["quick", "full"]);

const entryChoices: EntrySnapshot["choices"] = Object.freeze(
  visitTypes.map((visitType) =>
    Object.freeze({
      visitType,
      roomCount: hearingMethodConfig.roomFrequenciesHz[visitType].length,
    }),
  ),
);

const headphoneCheckAnswers: readonly unknown[] = Object.freeze([
  "left",
  "right",
  "bothSides",
  "nothingHeard",
]);

/** The stages in which a visit is under way and a stop report pauses it (R12.2, R13.1, R14.4). */
const pausableStages: readonly VisitStage[] = Object.freeze([
  "calibration",
  "headphoneCheck",
  "rules",
  "room",
  "betweenRooms",
]);

/** What the interface shows at once for a decided trial (R9.2, D6). */
function reactionTo(entry: ScoredVisitTrial): TrialReaction {
  if (entry.kind === "sound" && entry.outcome === "caught") {
    return "ripple";
  }
  if (entry.kind === "noSound" && entry.outcome === "falseAlarm") {
    return "noSoundLine";
  }
  return "none";
}

/** Whether two values of plain data are equal, field by field. */
function samePlainData(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) {
    return true;
  }
  if (
    typeof first !== "object" ||
    typeof second !== "object" ||
    first === null ||
    second === null ||
    Array.isArray(first) !== Array.isArray(second)
  ) {
    return false;
  }
  const firstRecord = first as Record<string, unknown>;
  const secondRecord = second as Record<string, unknown>;
  const keys = Object.keys(firstRecord);
  return (
    keys.length === Object.keys(secondRecord).length &&
    keys.every(
      (key) =>
        Object.hasOwn(secondRecord, key) &&
        samePlainData(firstRecord[key], secondRecord[key]),
    )
  );
}

/** One visit: everything that is dropped when the visitor leaves (D2, D35). */
interface Visit {
  readonly visitType: VisitType;
  readonly rooms: readonly VisitRoom[];
  /** Draws the engine seed of each room run (D19). */
  readonly source: RandomSource;
  /** Every sound render of the visit draws from it (D19). */
  readonly soundRandom: RandomSource;
  readonly recorder: VisitLogRecorder;
  readonly latestOffset: LatestOffset;
  /** The timer callbacks of the visit's room runs that have not run. */
  readonly timerHandles: Set<TimerHandle>;
  readonly timer: Timer;
  finishedRoomCount: number;
  rulesShown: boolean;
  /** True once a calibration of this visit follows a device change. */
  calibrationAgain: boolean;
  /** True from entering calibration until the visitor starts the calibration sound. */
  calibrationFresh: boolean;
  keepRefusal: KeepRefusal | null;
  lastCalibration: LoggedCalibration | null;
  awaitingAnswer: boolean;
  playRefusal: PlayRefusal | null;
  judgement: HeadphoneCheckJudgement | null;
  /** The run of the room under way: its practice, then its search. */
  runner: PractisedRoomRunner | null;
  /** The room of the last run started: the room of the `room` stage. */
  activeRoomIndex: number;
  attempt: number;
  log: VisitLog | null;
  /** The missed-sound replay, made when the rooms are over (missed-sound-replay design.md). */
  replay: MissedSoundReplayController | null;
  summary: VisitSummary | null;
  swappedRoom: VisitRoom | null;
  /** The timer's time when the visit began: the zero of the visit log's clock. */
  readonly startedAtMs: number;
  /** What the house knows of how the headphones sit (swapped-repeat D5). */
  earpieces: EarpieceState;
  /** Every swapped repeat of the visit that ran to its end, in the order they ended. */
  readonly swappedRepeats: SwappedRepeatRun[];
  /** The swapped repeat runs begun: counted when a run's engine seed is drawn (swapped-repeat R11.5). */
  repeatRunCount: number;
  /** The Repeat_Controller of the swapped repeat stage, or null outside it. */
  repeat: SwappedRepeatController | null;
}

/**
 * Creates the visit flow (visit-flow design.md, "The stage machine"; R1.4, R2 to R16, R19). It
 * holds one output shell and one calibration controller for the life of the page and runs one
 * visit at a time, through the stages of `visit-flow-types.ts`. It returns a frozen object that
 * implements the contract's `VisitFlow`.
 *
 * Every action, timer callback and output report runs as one step. At the end of a step the flow
 * hands out the events the step made, then notifies the snapshot listeners once if the snapshot
 * changed (R11.4, R11.5). Every listener is called even if one throws; the first error is thrown
 * afterwards, when the flow's state is already consistent (R11.7).
 *
 * Throws a `RangeError` for a seed that is not a whole number from 0 to 2³² − 1 (R2.2).
 */
export function createVisitFlow(
  options: VisitFlowOptions | VisitFlowTestOptions,
): VisitFlow {
  const flowRandom = createSeededRandom(options.seed);
  const { timer } = options;
  const onTrialPresented =
    "onTrialPresented" in options ? options.onTrialPresented : undefined;
  const output: AudioOutput & Partial<CalibrationMusicOutput> =
    "output" in options
      ? options.output
      : createAudioOutput({
          backend:
            "backend" in options
              ? options.backend
              : createWebAudioBackend(options.window),
          timer,
        });

  let visit: Visit | null = null;
  // The random source of the controller, which lives as long as the flow, forwards to the sound
  // source of the visit under way (D19).
  const forwardingRandom: RandomSource = Object.freeze({
    get seed(): number {
      return currentVisit().soundRandom.seed;
    },
    next: (): number => currentVisit().soundRandom.next(),
  });
  // Registered before the controller registers its own, so that a stop report reaches the flow
  // first and one report makes one notification.
  output.onStop((event) => step(() => onOutputStopped(event.reason)));
  output.onUnsupported((event) =>
    step(() => showUnsupported(event.reason, event.sampleRateHz)),
  );
  const calibration = createCalibrationController({
    output,
    timer,
    random: forwardingRandom,
  });
  const controlBottomDb = audioOutputConfig.calibrationSettingMinDb;

  let stage: VisitStage = "entry";
  /** Raised at every stage entry, so a late activation can tell that the stage moved on (D35). */
  let stageToken = 0;
  let pause: VisitPause | null = null;
  let activationRefused = false;
  let exitReason: ExitReason = "visitor";
  let unsupported: {
    readonly reason: UnsupportedReason;
    readonly sampleRateHz: number | null;
  } | null = null;

  const eventListeners = new Set<(event: VisitEvent) => void>();
  const snapshotListeners = new Set<(snapshot: VisitSnapshot) => void>();
  const pendingEvents: VisitEvent[] = [];
  let depth = 0;
  let flushing = false;

  function currentVisit(): Visit {
    if (visit === null) {
      throw new Error("No visit is under way.");
    }
    return visit;
  }

  // ─── Snapshots ─────────────────────────────────────────────────────────────────────────

  const canProceed = (): boolean => {
    if (pause !== null || visit === null) {
      return false;
    }
    switch (stage) {
      case "headphoneCheck":
        return visit.judgement === "correct";
      case "rules":
      case "betweenRooms":
      case "missedSoundReplay":
      case "swappedRepeat":
        return true;
      default:
        return false;
    }
  };

  const base = <Stage extends VisitStage>(
    snapshotStage: Stage,
  ): SnapshotBase<Stage> => ({
    stage: snapshotStage,
    visitType: visit?.visitType ?? null,
    rooms: visit?.rooms ?? emptyRooms,
    finishedRoomCount: visit?.finishedRoomCount ?? 0,
    canProceed: canProceed(),
    pause,
    activationRefused,
  });

  const roomAt = (current: Visit, roomIndex: number): VisitRoom => {
    const room = current.rooms[roomIndex];
    if (room === undefined) {
      throw new RangeError(`The visit has no room ${String(roomIndex)}.`);
    }
    return room;
  };

  const roomsLineOf = (current: Visit): string => {
    const tops = current.lastCalibration?.roomTopLevelDb;
    const shortCount =
      tops === undefined
        ? 0
        : current.rooms.filter(
            (room) =>
              roomSearchCapDb(tops[room.roomId], hearingMethodConfig) <
              hearingMethodConfig.capRelativeToAnchorDb,
          ).length;
    return roomsShortLine(shortCount, current.rooms.length);
  };

  const buildSnapshot = (): VisitSnapshot => {
    switch (stage) {
      case "entry":
        return Object.freeze({ ...base("entry"), choices: entryChoices });
      case "exit":
        return Object.freeze({ ...base("exit"), reason: exitReason });
      case "unsupported":
        return Object.freeze({
          ...base("unsupported"),
          reason: unsupported?.reason ?? "noWebAudio",
          sampleRateHz: unsupported?.sampleRateHz ?? null,
        });
      default:
        break;
    }
    const current = currentVisit();
    switch (stage) {
      case "calibration": {
        const controller = calibration.snapshot();
        const fresh = current.calibrationFresh;
        const calibrationSound = controller.calibrationSound;
        // The music's lines while it loads, the hiss's where it could not be loaded (audible-start
        // design.md, "The calibration copy").
        const lines =
          calibrationSound === "hiss" ? calibrationCopy.hiss : calibrationCopy;
        const freshLine =
          calibrationSound === "loading"
            ? calibrationCopy.loadingLine
            : lines.openLine;
        return Object.freeze({
          ...base("calibration"),
          again: current.calibrationAgain,
          playing: fresh ? false : controller.playing,
          playedSettingDb: fresh ? null : controller.playedSettingDb,
          controlBottomDb,
          // −5 dB with the music, −4 dB with the hiss and while the music loads (D7).
          controlTopDb: controller.controlTopDb,
          atTop: fresh ? false : controller.atTop,
          line: fresh ? freshLine : controller.line,
          keepRefusal: current.keepRefusal,
          // The bottom until the visitor first starts the sound: `open` puts the target there
          // (audible-start R3.5, R3.6, D3).
          targetSettingDb: fresh ? controlBottomDb : controller.targetSettingDb,
          calibrationSound,
          heading: current.calibrationAgain
            ? lines.againHeading
            : lines.heading,
          introLines: Object.freeze([
            lines.openLine,
            calibrationCopy.whyLine,
            lines.riseLine,
            calibrationCopy.keysLine,
          ]),
        });
      }
      case "headphoneCheck":
        return Object.freeze({
          ...base("headphoneCheck"),
          roomsLine: roomsLineOf(current),
          awaitingAnswer: current.awaitingAnswer,
          playRefusal: current.playRefusal,
          judgement: current.judgement,
          judgementLine:
            current.judgement === null
              ? null
              : headphoneCheckCopy.judgementLines[current.judgement],
        });
      case "rules":
        return Object.freeze(base("rules"));
      case "room":
        return Object.freeze({
          ...base("room"),
          room: roomAt(current, current.activeRoomIndex),
          practice: roomPracticeOf(current),
        });
      case "betweenRooms":
        return Object.freeze({
          ...base("betweenRooms"),
          finishedRoom: roomAt(current, current.finishedRoomCount - 1),
          nextRoom: roomAt(current, current.finishedRoomCount),
        });
      case "missedSoundReplay":
        return Object.freeze({
          ...base("missedSoundReplay"),
          visitLog: logOf(current),
          replay: replayViewOf(current),
        });
      case "result":
        return Object.freeze({
          ...base("result"),
          visitLog: logOf(current),
          summary: summaryOf(current),
          swappedRepeats: Object.freeze([...current.swappedRepeats]),
          // Once a repeat has begun, the house no longer knows how the headphones sit (R9.2, Q7).
          turnBackLine:
            current.earpieces === "asMarked"
              ? null
              : swappedRepeatCopy.turnBackLine,
        });
      case "swappedRepeat": {
        const room = current.swappedRoom ?? roomAt(current, 0);
        return Object.freeze({
          ...base("swappedRepeat"),
          room,
          visitLog: logOf(current),
          summary: summaryOf(current),
          repeat: repeatOf(current).view({
            earpieces: current.earpieces,
            pauseReason: repeatPauseReason(),
          }),
        });
      }
    }
  };

  /** What the room's screen says about its practice (audible-start, light plan). */
  function roomPracticeOf(current: Visit): RoomPractice {
    const state = current.runner?.practice() ?? null;
    const phase = state?.phase ?? "practice";
    const practising = phase !== "counting";
    const soundPlaying = state?.soundPlaying === true && pause === null;
    const notHeardEars = state?.notHeardEars ?? [];
    return Object.freeze({
      phase,
      soundPlaying,
      heading: practising ? practiceCopy.heading : null,
      lines: practising ? practiceCopy.lines : practiceCopy.countingLines,
      soundPlayingLine: soundPlaying ? practiceCopy.soundPlayingLine : null,
      notHeardEars: Object.freeze([...notHeardEars]),
      notHeardLines:
        phase === "notHeard" && notHeardEars.length > 0
          ? notHeardLines(notHeardEars)
          : Object.freeze([]),
      tryAgainLabel: practiceCopy.tryAgainLabel,
      goOnLabel: practiceCopy.goOnLabel,
    });
  }

  function repeatOf(current: Visit): SwappedRepeatController {
    if (current.repeat === null) {
      throw new Error("The swapped repeat is made when its stage is entered.");
    }
    return current.repeat;
  }

  /** The reason of the pause that holds in the swapped repeat, which only its room can pause. */
  function repeatPauseReason(): SwappedRepeatPauseReason | null {
    const reason = pause?.reason ?? null;
    return reason === "visitor" ||
      reason === "hidden" ||
      reason === "interrupted"
      ? reason
      : null;
  }

  function logOf(current: Visit): VisitLog {
    if (current.log === null) {
      throw new Error("The visit log is assembled when the rooms are over.");
    }
    return current.log;
  }

  function replayOf(current: Visit): MissedSoundReplayController {
    if (current.replay === null) {
      throw new Error("The replay is made when the rooms are over.");
    }
    return current.replay;
  }

  /** The replay's view, with the reason of the pause that holds (missed-sound-replay D21). */
  function replayViewOf(current: Visit): MissedSoundReplay {
    const reason = pause?.reason ?? null;
    return replayOf(current).view(
      reason === "hidden" || reason === "interrupted" ? reason : null,
    );
  }

  function summaryOf(current: Visit): VisitSummary {
    if (current.summary === null) {
      current.summary = summarizeVisit(logOf(current));
    }
    return current.summary;
  }

  let published: VisitSnapshot = buildSnapshot();

  // ─── Steps and notifications ───────────────────────────────────────────────────────────

  /** Hands out the events of the step, then the snapshot if it changed, until neither is left. */
  const flush = (): void => {
    if (flushing) {
      return;
    }
    flushing = true;
    let threw = false;
    let firstError: unknown = null;
    const call = <Value>(listener: (value: Value) => void, value: Value) => {
      try {
        listener(value);
      } catch (error) {
        if (!threw) {
          threw = true;
          firstError = error;
        }
      }
    };
    try {
      for (;;) {
        const events = pendingEvents.splice(0);
        for (const event of events) {
          for (const listener of [...eventListeners]) {
            call(listener, event);
          }
        }
        const next = buildSnapshot();
        const changed = !samePlainData(next, published);
        if (changed) {
          published = next;
          for (const listener of [...snapshotListeners]) {
            call(listener, next);
          }
        }
        if (events.length === 0 && !changed && pendingEvents.length === 0) {
          break;
        }
      }
    } finally {
      flushing = false;
    }
    if (threw) {
      throw firstError;
    }
  };

  /** Runs one action, timer callback or output report, then notifies (R11.4, R11.5). */
  const step = (body: () => void): void => {
    depth += 1;
    try {
      body();
    } finally {
      depth -= 1;
    }
    if (depth === 0) {
      flush();
    }
  };

  const emit = (event: VisitEvent): void => {
    pendingEvents.push(Object.freeze(event));
  };

  const enterStage = (next: VisitStage): void => {
    stage = next;
    stageToken += 1;
  };

  /** A timer for one visit: its callbacks run as steps, and only while that visit is under way. */
  const visitTimer = (handles: Set<TimerHandle>, owner: () => Visit | null) =>
    Object.freeze({
      now: (): number => timer.now(),
      setTimeout(callback: () => void, delayMs: number): TimerHandle {
        const handle = timer.setTimeout(() => {
          handles.delete(handle);
          if (visit === null || visit !== owner()) {
            return;
          }
          step(callback);
        }, delayMs);
        handles.add(handle);
        return handle;
      },
      clearTimeout(handle: TimerHandle): void {
        handles.delete(handle);
        timer.clearTimeout(handle);
      },
    });

  /** Drops the visit under way: its timers, its room run and its log (R14.1, R14.7, D35). */
  const dropVisit = (): void => {
    const current = visit;
    if (current === null) {
      return;
    }
    visit = null;
    for (const handle of current.timerHandles) {
      timer.clearTimeout(handle);
    }
    current.timerHandles.clear();
    current.runner?.abandon();
    current.runner = null;
    // A swapped repeat under way plays nothing more and gives no record (visit-flow D35).
    current.repeat?.leave();
    current.repeat = null;
    calibration.close();
    pause = null;
  };

  const leave = (reason: ExitReason): void => {
    dropVisit();
    activationRefused = false;
    exitReason = reason;
    enterStage("exit");
  };

  const showUnsupported = (
    reason: UnsupportedReason,
    sampleRateHz: number | null,
  ): void => {
    dropVisit();
    activationRefused = false;
    unsupported = Object.freeze({ reason, sampleRateHz });
    enterStage("unsupported");
  };

  /**
   * Runs `continuation` once the output shell runs (R2.5, R2.6, R12.6). `activate` is called within
   * the action, before anything is awaited, so the action keeps the visitor's gesture.
   */
  const withSound = (continuation: () => void): void => {
    const state = output.state();
    if (state.kind === "unsupported") {
      showUnsupported(state.reason, state.sampleRateHz);
      return;
    }
    if (state.kind === "running") {
      activationRefused = false;
      continuation();
      return;
    }
    const owner = visit;
    const token = stageToken;
    void output.activate().then((result) => {
      step(() => {
        if (
          visit !== owner ||
          stageToken !== token ||
          stage === "unsupported"
        ) {
          return;
        }
        switch (result.kind) {
          case "running":
            if (output.state().kind === "running") {
              activationRefused = false;
              continuation();
            }
            return;
          case "refused":
            activationRefused = true;
            return;
          case "unsupported":
            showUnsupported(result.reason, result.sampleRateHz);
            return;
          case "stopped":
            onOutputStopped(result.reason);
            return;
        }
      });
    });
  };

  // ─── Pauses ────────────────────────────────────────────────────────────────────────────

  const abandonAttempt = (current: Visit): void => {
    const runner = current.runner;
    if (runner === null) {
      return;
    }
    runner.abandon();
    current.runner = null;
    current.recorder.attemptEnded({
      roomIndex: current.activeRoomIndex,
      attempt: current.attempt,
      endedAtMs: timer.now(),
      ending: "abandoned",
      result: null,
    });
  };

  /** Begins a pause, or gives a pause that holds the reason `deviceChanged` (R12, R13.1). */
  const beginPause = (reason: PauseReason): void => {
    const current = currentVisit();
    if (pause !== null) {
      if (reason === "deviceChanged" && pause.reason !== "deviceChanged") {
        pause = Object.freeze({ reason });
        current.recorder.pauseReasonChanged(reason);
        abandonAttempt(current);
      }
      return;
    }
    pause = Object.freeze({ reason });
    current.recorder.pauseStarted({
      reason,
      stage,
      roomIndex:
        stage === "room"
          ? current.activeRoomIndex
          : stage === "betweenRooms"
            ? current.finishedRoomCount - 1
            : null,
      startedAtMs: timer.now(),
    });
    if (stage === "room") {
      if (reason === "deviceChanged") {
        abandonAttempt(current);
      } else {
        current.runner?.pause();
      }
    }
    calibration.close();
  };

  /** Moves to calibration after a device change, with the room that was due still due (R13.2). */
  const calibrateAgain = (current: Visit): void => {
    current.calibrationAgain = true;
    current.calibrationFresh = true;
    current.keepRefusal = null;
    enterStage("calibration");
  };

  const endPause = (): void => {
    const current = visit;
    const holding = pause;
    if (current === null || holding === null) {
      return;
    }
    if (stage === "swappedRepeat") {
      // A pause of the swapped repeat is written to its own run's record, never to the visit log
      // (swapped-repeat R14.10, D2).
      pause = null;
      repeatOf(current).resume();
      return;
    }
    if (stage === "missedSoundReplay") {
      // A pause of the replay is not written to the log, which was assembled when the rooms
      // ended (missed-sound-replay R11.3, D18).
      pause = null;
      replayOf(current).resume();
      return;
    }
    current.recorder.pauseEnded(timer.now());
    pause = null;
    const calibrated = output.rangeReport() !== null;
    switch (stage) {
      case "room":
        if (calibrated && current.runner !== null) {
          current.runner.resume();
        } else {
          calibrateAgain(current);
        }
        return;
      case "headphoneCheck":
      case "rules":
      case "betweenRooms":
        if (!calibrated) {
          calibrateAgain(current);
        }
        return;
      case "calibration":
        if (holding.reason === "deviceChanged") {
          calibrateAgain(current);
        }
        return;
      default:
        return;
    }
  };

  /**
   * What a stop report of the output shell does in the missed-sound replay (missed-sound-replay
   * design.md, "What the flow does", R11.2 to R11.6, R12.1). A pause here sets the snapshot's pause
   * field only and writes nothing to the log (D18).
   */
  function replayStopped(reason: StopReason): void {
    const current = visit;
    if (current === null || stage !== "missedSoundReplay") {
      return;
    }
    const replay = replayOf(current);
    switch (reason) {
      case "control":
        // The flow caused it (stop, skip).
        return;
      case "pageLeft":
        replay.cancel();
        pause = null;
        summaryOf(current);
        enterStage("result");
        return;
      case "deviceChanged": {
        const phase = replay.phase();
        if (phase === "announcing" || phase === "playing") {
          replay.end("deviceChanged");
          pause = null;
        }
        return;
      }
      case "hidden":
      case "interrupted":
        if (pause === null && replay.cut()) {
          pause = Object.freeze({ reason });
        }
        return;
    }
  }

  /**
   * Leaves the swapped repeat for the result (swapped-repeat R9.1, R11.3, R14.2, R14.7, D5, D15):
   * the controller cancels its timers and ends a run under way without a record, the pause ends,
   * and the earpieces are unknown again once the instruction was shown. The instruction was shown
   * exactly when the earpiece state is not what it was before the stage: entering `instruction`
   * makes it `unknown`, a check makes it `swapped` or `unknown`, and an `unavailable` stage leaves
   * it alone. So `swapped` becomes `unknown`, and every other state stays.
   */
  function leaveRepeat(current: Visit): void {
    current.repeat?.leave();
    current.repeat = null;
    pause = null;
    if (current.earpieces === "swapped") {
      current.earpieces = "unknown";
    }
    current.swappedRoom = null;
    summaryOf(current);
    enterStage("result");
  }

  /**
   * What a stop report of the output shell does in the swapped repeat (swapped-repeat design.md,
   * "What the flow does", R5.6, R14.3 to R14.8). A pause here sets the snapshot's pause field and
   * is written to the run's own record, never to the visit log (D2).
   */
  function repeatStopped(reason: StopReason): void {
    const current = visit;
    if (current === null || stage !== "swappedRepeat") {
      return;
    }
    const repeat = repeatOf(current);
    switch (reason) {
      case "control":
        // The flow caused it (stop, pause, back).
        return;
      case "pageLeft":
        leaveRepeat(current);
        return;
      case "deviceChanged":
        pause = null;
        repeat.calibrationGone();
        return;
      case "hidden":
      case "interrupted":
        if (repeat.phase() === "room") {
          if (pause === null && repeat.pause(reason)) {
            pause = Object.freeze({ reason });
          }
        } else if (repeat.phase() === "check") {
          repeat.checkCut();
        }
        return;
    }
  }

  /** What a stop report of the output shell does (design.md, "Pauses"). */
  function onOutputStopped(reason: StopReason): void {
    if (stage === "swappedRepeat") {
      repeatStopped(reason);
      return;
    }
    if (stage === "missedSoundReplay") {
      replayStopped(reason);
      return;
    }
    if (
      reason === "control" ||
      visit === null ||
      !pausableStages.includes(stage)
    ) {
      return;
    }
    if (reason === "pageLeft") {
      leave("pageLeft");
      return;
    }
    beginPause(reason);
  }

  calibration.onChange(() => step(() => undefined));

  // ─── Rooms ─────────────────────────────────────────────────────────────────────────────

  const finishRoom =
    (current: Visit, roomIndex: number) =>
    (result: RoomResult): void => {
      current.recorder.attemptEnded({
        roomIndex,
        attempt: current.attempt,
        endedAtMs: timer.now(),
        ending: "finished",
        result,
      });
      current.runner = null;
      emit({ kind: "roomFinished", room: roomAt(current, roomIndex) });
      current.finishedRoomCount += 1;
      if (current.finishedRoomCount < current.rooms.length) {
        enterStage("betweenRooms");
        return;
      }
      // The replay is a span of its own for the rise limit (R16.1).
      output.beginRoom();
      const log = current.recorder.log();
      current.log = log;
      // The draw after the render seed and the engine seeds, so it equals replayRenderSeed(log)
      // (missed-sound-replay R14.2, D2).
      const renderSeed = drawSeed(current.source);
      current.replay = createMissedSoundReplay({
        output,
        timer: current.timer,
        log,
        random: createSeededRandom(renderSeed),
        emit,
        notRunning: (reason) => replayStopped(reason),
      });
      enterStage("missedSoundReplay");
    };

  /** Starts a run of the room that is due (R6). */
  const startRoom = (): void => {
    const current = currentVisit();
    if (output.rangeReport() === null) {
      calibrateAgain(current);
      return;
    }
    withSound(() => {
      if (pause !== null || visit !== current) {
        return;
      }
      const report = output.rangeReport();
      const keptCalibration = current.lastCalibration;
      if (report === null || keptCalibration === null) {
        calibrateAgain(current);
        return;
      }
      const roomIndex = current.finishedRoomCount;
      const room = roomAt(current, roomIndex);
      output.beginRoom();
      const roomRange = report.rooms[room.roomId];
      const searchCapDb = roomSearchCapDb(
        roomRange.topLevelDb,
        hearingMethodConfig,
      );
      // The search asks for nothing below the room's playable floor (audible-start R12.5).
      const searchFloorDb = roomSearchFloorDb(
        roomRange.floorLevelDb,
        hearingMethodConfig,
      );
      const engineSeed = drawSeed(current.source);
      const search = createThresholdSearch({
        settings: {
          ...hearingMethodConfig,
          capRelativeToAnchorDb: searchCapDb,
          floorDb: searchFloorDb,
          // Held at or above the floor, as every start of the search must be. At a setting from
          // the audible-start Keep_Minimum (−27 dB, D25) up the floor lies below the fixed start
          // and this changes nothing; below it, it keeps the search valid. Each ear's own start
          // from practice replaces it (audible-start task 11).
          startingLevelDb: Math.max(
            hearingMethodConfig.startingLevelDb,
            searchFloorDb,
          ),
        },
        random: createSeededRandom(engineSeed),
      });
      const attempt = current.recorder.attemptStarted({
        roomIndex,
        engineSeed,
        calibrationIndex: keptCalibration.calibrationIndex,
        searchCapDb,
        searchFloorDb,
        startedAtMs: timer.now(),
      });
      current.activeRoomIndex = roomIndex;
      current.attempt = attempt;
      const presented =
        onTrialPresented === undefined
          ? {}
          : {
              // In the rooms of the visit each ear wears its own earpiece (swapped-repeat R8.7).
              onTrialPresented: (trial: PresentedTrial) =>
                onTrialPresented(
                  Object.freeze({
                    ...trial,
                    earpiece: trial.ear,
                    swappedRepeatRunNumber: null,
                  }),
                ),
            };
      const pauseFromOutput = (): void => {
        const state = output.state();
        const reason: StopReason =
          state.kind === "stopped" && state.reason !== "control"
            ? state.reason
            : "interrupted";
        onOutputStopped(reason);
      };
      const soundRefused = (): void => {
        output.stopAll();
        leave("soundRefused");
      };
      const counting = createRoomRunner({
        output,
        timer: current.timer,
        search,
        room,
        attempt,
        soundRandom: current.soundRandom,
        recorder: current.recorder,
        latestOffset: current.latestOffset,
        scored: (entry) =>
          emit({
            kind: "trialScored",
            room,
            trial: entry,
            reaction: reactionTo(entry),
          }),
        finished: finishRoom(current, roomIndex),
        pauseFromOutput,
        soundRefused,
        ...presented,
      });
      // Practice first: each ear hears the room's sound until it catches it, and nothing of it
      // counts. Then the search above runs as before (audible-start, light plan of 2026-11-16).
      const runner = createPractisedRoomRunner({
        output,
        timer: current.timer,
        room,
        attempt,
        soundRandom: current.soundRandom,
        recorder: current.recorder,
        latestOffset: current.latestOffset,
        searchCapDb,
        counting,
        practiceScored: (entry) => {
          const caught = entry.outcome === "caught";
          emit({
            kind: "practiceSoundScored",
            room,
            trial: entry,
            reaction: caught ? "ripple" : "none",
            line: caught ? practiceCopy.caughtLine : null,
          });
        },
        countingStarted: () => {
          emit({ kind: "countingStarted", room });
        },
        notHeard: () => {
          beginPause("practiceNotHeard");
        },
        pauseFromOutput,
        soundRefused,
        ...presented,
      });
      current.runner = runner;
      enterStage("room");
      emit({ kind: "roomStarted", room, attempt });
      runner.start();
    });
  };

  // ─── Actions ───────────────────────────────────────────────────────────────────────────

  const inVisit = (expected: VisitStage): Visit | null =>
    stage === expected && pause === null ? visit : null;

  const flow: VisitFlow = {
    snapshot(): VisitSnapshot {
      const next = buildSnapshot();
      return samePlainData(next, published) ? published : next;
    },

    subscribe(listener) {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },

    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },

    chooseVisit(visitType) {
      step(() => {
        if (stage !== "entry" || !visitTypes.includes(visitType)) {
          return;
        }
        const visitSeed = drawSeed(flowRandom);
        const source = createSeededRandom(visitSeed);
        const soundRandom = createSeededRandom(drawSeed(source));
        const rooms = visitRooms(visitType);
        const timerHandles = new Set<TimerHandle>();
        const current: Visit = {
          visitType,
          rooms,
          source,
          soundRandom,
          recorder: createVisitLogRecorder({
            visitType,
            visitSeed,
            rooms,
            startedAtMs: timer.now(),
          }),
          latestOffset: { latestOffsetMs: 0 },
          timerHandles,
          timer: visitTimer(timerHandles, () => current),
          finishedRoomCount: 0,
          rulesShown: false,
          calibrationAgain: false,
          calibrationFresh: true,
          keepRefusal: null,
          lastCalibration: null,
          awaitingAnswer: false,
          playRefusal: null,
          judgement: null,
          runner: null,
          activeRoomIndex: 0,
          attempt: 0,
          log: null,
          replay: null,
          summary: null,
          swappedRoom: null,
          startedAtMs: timer.now(),
          earpieces: "unknown",
          swappedRepeats: [],
          repeatRunCount: 0,
          repeat: null,
        };
        visit = current;
        activationRefused = false;
        enterStage("calibration");
        withSound(() => undefined);
      });
    },

    startCalibration() {
      step(() => {
        const current = inVisit("calibration");
        if (current === null) {
          return;
        }
        withSound(() => {
          if (pause !== null) {
            return;
          }
          current.calibrationFresh = false;
          current.keepRefusal = null;
          calibration.open();
        });
      });
    },

    louder() {
      step(() => {
        if (inVisit("calibration") !== null) {
          calibration.louder();
        }
      });
    },

    quieter() {
      step(() => {
        if (inVisit("calibration") !== null) {
          calibration.quieter();
        }
      });
    },

    setCalibrationTarget(settingDb) {
      step(() => {
        // Ignored outside calibration and while a pause holds (audible-start R3.9).
        if (inVisit("calibration") !== null) {
          calibration.setTarget(settingDb);
        }
      });
    },

    keepCalibration() {
      step(() => {
        const current = inVisit("calibration");
        if (current === null) {
          return;
        }
        const outcome = calibration.keep();
        if (outcome.kind === "refused") {
          current.keepRefusal = outcome.reason;
          return;
        }
        const roomTopLevelDb = Object.fromEntries(
          ghostSoundIds.map((soundId) => [
            soundId,
            outcome.rangeReport.rooms[soundId].topLevelDb,
          ]),
        ) as Record<GhostSoundId, number>;
        // Every ghost room's Playable_Floor with this calibration (audible-start R12.3).
        const roomFloorLevelDb = Object.fromEntries(
          ghostSoundIds.map((soundId) => [
            soundId,
            outcome.rangeReport.rooms[soundId].floorLevelDb,
          ]),
        ) as Record<GhostSoundId, number>;
        const kept = calibration.snapshot().kept;
        if (kept === null) {
          throw new Error(
            "A kept calibration has no record in the controller.",
          );
        }
        current.lastCalibration = current.recorder.calibrationKept({
          settingDb: outcome.settingDb,
          roomTopLevelDb,
          roomFloorLevelDb,
          keptAtMs: timer.now(),
          // How the anchor was set: with the music, or with the hiss (audible-start R8.4).
          anchor: kept.anchor,
        });
        current.keepRefusal = null;
        current.calibrationFresh = false;
        current.awaitingAnswer = false;
        current.playRefusal = null;
        current.judgement = null;
        enterStage("headphoneCheck");
      });
    },

    playHeadphoneCheck() {
      step(() => {
        const current = inVisit("headphoneCheck");
        if (current === null) {
          return;
        }
        withSound(() => {
          if (pause !== null) {
            return;
          }
          const outcome = output.playHeadphoneCheck(current.soundRandom);
          if (outcome.kind === "refused") {
            current.playRefusal = outcome.reason;
            return;
          }
          current.playRefusal = null;
          current.awaitingAnswer = true;
          current.judgement = null;
        });
      });
    },

    answerHeadphoneCheck(answer: HeadphoneCheckAnswer) {
      step(() => {
        const current = inVisit("headphoneCheck");
        if (
          current === null ||
          !current.awaitingAnswer ||
          !headphoneCheckAnswers.includes(answer) ||
          current.lastCalibration === null
        ) {
          return;
        }
        const judgement = judgeHeadphoneCheck(answer);
        current.recorder.headphoneCheckAnswered({
          calibrationIndex: current.lastCalibration.calibrationIndex,
          answer,
          judgement,
          answeredAtMs: timer.now(),
        });
        current.judgement = judgement;
        current.awaitingAnswer = false;
        // The rooms run only after a check answered correct (swapped-repeat D5).
        current.earpieces = judgement === "correct" ? "asMarked" : "unknown";
      });
    },

    proceed() {
      step(() => {
        const current = visit;
        if (current === null || !canProceed()) {
          return;
        }
        switch (stage) {
          case "headphoneCheck":
            if (!current.rulesShown) {
              current.rulesShown = true;
              enterStage("rules");
            } else {
              startRoom();
            }
            return;
          case "rules":
          case "betweenRooms":
            startRoom();
            return;
          case "missedSoundReplay":
            // Skips the replay, or goes on once it has finished (missed-sound-replay R10.2, R13.3).
            replayOf(current).skip();
            summaryOf(current);
            enterStage("result");
            return;
          case "swappedRepeat":
            // Back to the picture, silencing a sound that may be under way (swapped-repeat R11.3, D15).
            if (repeatOf(current).mayBeSounding()) {
              output.stopAll();
            }
            leaveRepeat(current);
            return;
          default:
            return;
        }
      });
    },

    answer(side, pressedAtMs) {
      step(() => {
        if (side !== "left" && side !== "right") {
          return;
        }
        const current = inVisit("room");
        if (current !== null) {
          current.runner?.answer(side, pressedAtMs);
          return;
        }
        // The room of the swapped repeat: the side is the visitor's own ear.
        const repeating = inVisit("swappedRepeat");
        if (repeating !== null && repeatOf(repeating).phase() === "room") {
          repeatOf(repeating).answer(side, pressedAtMs);
        }
      });
    },

    pause() {
      step(() => {
        if (inVisit("room") !== null) {
          beginPause("visitor");
          output.stopAll();
          return;
        }
        // The room of the swapped repeat: not through beginPause, which writes to the visit's
        // recorder (swapped-repeat R14.3, R14.10, D2).
        const repeating = inVisit("swappedRepeat");
        if (repeating === null) {
          return;
        }
        const repeat = repeatOf(repeating);
        if (repeat.phase() !== "room" || !repeat.pause("visitor")) {
          return;
        }
        pause = Object.freeze({ reason: "visitor" });
        output.stopAll();
      });
    },

    resume() {
      step(() => {
        if (visit === null || pause === null) {
          return;
        }
        withSound(endPause);
      });
    },

    goOnWithoutPractice() {
      step(() => {
        const current = visit;
        if (
          current === null ||
          stage !== "room" ||
          pause?.reason !== "practiceNotHeard"
        ) {
          return;
        }
        withSound(() => {
          if (visit !== current || pause?.reason !== "practiceNotHeard") {
            return;
          }
          current.recorder.pauseEnded(timer.now());
          pause = null;
          if (output.rangeReport() === null || current.runner === null) {
            calibrateAgain(current);
            return;
          }
          current.runner.goOn();
        });
      });
    },

    stop() {
      step(() => {
        output.stopAll();
        const current = visit;
        if (current !== null && pausableStages.includes(stage)) {
          leave("visitor");
          return;
        }
        if (current === null) {
          return;
        }
        switch (stage) {
          case "missedSoundReplay":
            // Silenced above; the replay plays nothing more (missed-sound-replay R11.1).
            replayOf(current).cancel();
            pause = null;
            summaryOf(current);
            enterStage("result");
            return;
          case "swappedRepeat":
            // Silenced above; a run under way ends without a record (swapped-repeat R14.2).
            leaveRepeat(current);
            return;
          default:
            return;
        }
      });
    },

    chooseSwappedRepeat(roomIndex) {
      step(() => {
        const current = inVisit("result");
        if (current === null || !Number.isInteger(roomIndex)) {
          return;
        }
        const summary = summaryOf(current);
        const roomSummary = summary.rooms[roomIndex];
        if (
          roomSummary === undefined ||
          !roomSummary.swappedRepeatOffered ||
          // A floor may be repeated until one run of it ends with a record (swapped-repeat Q4,
          // decided by the owner on 2026-11-15).
          current.swappedRepeats.some((run) => run.roomIndex === roomIndex)
        ) {
          return;
        }
        const log = logOf(current);
        const firstRun = log.roomAttempts
          .filter(
            (attempt) =>
              attempt.roomIndex === roomIndex && attempt.ending === "finished",
          )
          .at(-1);
        if (firstRun === undefined) {
          return;
        }
        // The repeat runs on the first run's calibration or not at all (swapped-repeat D8; Q6,
        // decided by the owner's coordinator on 2026-11-16, at the owner's request).
        const unavailable: SwappedRepeatUnavailableReason | null =
          output.rangeReport() === null
            ? "calibrationGone"
            : current.lastCalibration?.calibrationIndex !==
                firstRun.calibrationIndex
              ? "calibrationChanged"
              : null;
        const repeat = createSwappedRepeat({
          output,
          timer: current.timer,
          log,
          summary,
          roomIndex,
          runNumber: current.repeatRunCount + 1,
          visitStartedAtMs: current.startedAtMs,
          unavailable,
          soundRandom: current.soundRandom,
          // The run is counted when its engine seed is drawn, so a start that finds no calibration
          // counts nothing, and every seed equals swappedRepeatEngineSeed(log, runNumber) (R7.3).
          drawEngineSeed: () => {
            const engineSeed = drawSeed(current.source);
            current.repeatRunCount += 1;
            return engineSeed;
          },
          latestOffset: current.latestOffset,
          emit,
          notRunning: (reason) => repeatStopped(reason),
          recorded: (run) => {
            current.swappedRepeats.push(run);
          },
          ...(onTrialPresented === undefined ? {} : { onTrialPresented }),
        });
        current.repeat = repeat;
        current.swappedRoom = roomSummary.room;
        if (repeat.phase() === "instruction") {
          // The visitor is asked to swap; nothing has checked it (D5).
          current.earpieces = "unknown";
        }
        enterStage("swappedRepeat");
      });
    },

    startReplay() {
      step(() => {
        const current = inVisit("missedSoundReplay");
        if (current === null || replayOf(current).phase() !== "announcing") {
          return;
        }
        // A press: it may start sound, so activate is called within the call (R6.3, R6.4, D8).
        withSound(() => {
          const replay = replayOf(current);
          if (
            visit === current &&
            stage === "missedSoundReplay" &&
            pause === null &&
            replay.phase() === "announcing"
          ) {
            replay.start();
          }
        });
      });
    },

    confirmSwap() {
      step(() => {
        const current = inVisit("swappedRepeat");
        if (current !== null) {
          // Plays nothing (swapped-repeat R4.2).
          repeatOf(current).confirmSwap();
        }
      });
    },

    playSwapCheck() {
      step(() => {
        const current = inVisit("swappedRepeat");
        if (current === null) {
          return;
        }
        const repeat = repeatOf(current);
        if (repeat.phase() !== "check") {
          return;
        }
        // A press: it may start sound, so activate is called within the call (R5.1).
        withSound(() => {
          if (
            visit === current &&
            stage === "swappedRepeat" &&
            pause === null &&
            current.repeat === repeat &&
            repeat.phase() === "check"
          ) {
            repeat.playCheck();
          }
        });
      });
    },

    answerSwapCheck(answer: HeadphoneCheckAnswer) {
      step(() => {
        const current = inVisit("swappedRepeat");
        if (current === null) {
          return;
        }
        const judgement = repeatOf(current).answerCheck(answer);
        if (judgement !== null) {
          current.earpieces = judgement === "confirmed" ? "swapped" : "unknown";
        }
      });
    },

    startSwappedRoom() {
      step(() => {
        const current = inVisit("swappedRepeat");
        if (current === null) {
          return;
        }
        const repeat = repeatOf(current);
        // No run starts unless a confirmed check found the earpieces swapped (R6.2, R9.4).
        if (repeat.phase() !== "ready" || current.earpieces !== "swapped") {
          return;
        }
        // A press: it starts sound, so activate is called within the call (R6.2).
        withSound(() => {
          if (
            visit === current &&
            stage === "swappedRepeat" &&
            pause === null &&
            current.repeat === repeat &&
            repeat.phase() === "ready" &&
            current.earpieces === "swapped"
          ) {
            repeat.startRoom();
          }
        });
      });
    },

    backToFrontDoor() {
      step(() => {
        if (stage !== "exit" && stage !== "result") {
          return;
        }
        dropVisit();
        activationRefused = false;
        enterStage("entry");
      });
    },
  };
  return Object.freeze(flow);
}

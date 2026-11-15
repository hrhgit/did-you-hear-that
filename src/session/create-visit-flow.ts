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
import type { AudioBackend } from "../audio/output/audio-backend";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import type {
  AudioOutput,
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
import type {
  HeadphoneCheckAnswer,
  HeadphoneCheckJudgement,
} from "./judge-headphone-check";
import { judgeHeadphoneCheck } from "./judge-headphone-check";
import type { LatestOffset, PresentedTrial, RoomRunner } from "./room-runner";
import { createRoomRunner } from "./room-runner";
import { roomSearchCapDb } from "./room-search-cap";
import { summarizeVisit } from "./summarize-visit";
import type {
  EntrySnapshot,
  ExitReason,
  LoggedCalibration,
  PauseReason,
  ScoredVisitTrial,
  SnapshotBase,
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
  /** Called when a trial's window is set, with what a listener needs to answer it. */
  readonly onTrialPresented?: (trial: PresentedTrial) => void;
} & ({ readonly backend: AudioBackend } | { readonly output: AudioOutput });

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
  /** True from entering calibration until the visitor starts the hiss. */
  calibrationFresh: boolean;
  keepRefusal: KeepRefusal | null;
  lastCalibration: LoggedCalibration | null;
  awaitingAnswer: boolean;
  playRefusal: PlayRefusal | null;
  judgement: HeadphoneCheckJudgement | null;
  runner: RoomRunner | null;
  /** The room of the last run started: the room of the `room` stage. */
  activeRoomIndex: number;
  attempt: number;
  log: VisitLog | null;
  summary: VisitSummary | null;
  swappedRoom: VisitRoom | null;
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
  const output: AudioOutput =
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
  const controlTopDb = calibrationSettingTopDb();

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
        return Object.freeze({
          ...base("calibration"),
          again: current.calibrationAgain,
          playing: fresh ? false : controller.playing,
          playedSettingDb: fresh ? null : controller.playedSettingDb,
          controlBottomDb,
          controlTopDb,
          atTop: fresh ? false : controller.atTop,
          line: fresh ? calibrationCopy.openLine : controller.line,
          keepRefusal: current.keepRefusal,
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
        });
      case "result":
        return Object.freeze({
          ...base("result"),
          visitLog: logOf(current),
          summary: summaryOf(current),
        });
      case "swappedRepeat":
        return Object.freeze({
          ...base("swappedRepeat"),
          room: current.swappedRoom ?? roomAt(current, 0),
          visitLog: logOf(current),
          summary: summaryOf(current),
        });
    }
  };

  function logOf(current: Visit): VisitLog {
    if (current.log === null) {
      throw new Error("The visit log is assembled when the rooms are over.");
    }
    return current.log;
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

  /** What a stop report of the output shell does (design.md, "Pauses"). */
  function onOutputStopped(reason: StopReason): void {
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
      current.log = current.recorder.log();
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
      const searchCapDb = roomSearchCapDb(
        report.rooms[room.roomId].topLevelDb,
        hearingMethodConfig,
      );
      const engineSeed = drawSeed(current.source);
      const search = createThresholdSearch({
        settings: {
          ...hearingMethodConfig,
          capRelativeToAnchorDb: searchCapDb,
        },
        random: createSeededRandom(engineSeed),
      });
      const attempt = current.recorder.attemptStarted({
        roomIndex,
        engineSeed,
        calibrationIndex: keptCalibration.calibrationIndex,
        searchCapDb,
        startedAtMs: timer.now(),
      });
      current.activeRoomIndex = roomIndex;
      current.attempt = attempt;
      const runner = createRoomRunner({
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
        pauseFromOutput: () => {
          const state = output.state();
          const reason: StopReason =
            state.kind === "stopped" && state.reason !== "control"
              ? state.reason
              : "interrupted";
          onOutputStopped(reason);
        },
        soundRefused: () => {
          output.stopAll();
          leave("soundRefused");
        },
        ...(onTrialPresented === undefined ? {} : { onTrialPresented }),
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
          summary: null,
          swappedRoom: null,
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
        current.lastCalibration = current.recorder.calibrationKept({
          settingDb: outcome.settingDb,
          roomTopLevelDb,
          keptAtMs: timer.now(),
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
            summaryOf(current);
            enterStage("result");
            return;
          case "swappedRepeat":
            current.swappedRoom = null;
            enterStage("result");
            return;
          default:
            return;
        }
      });
    },

    answer(side, pressedAtMs) {
      step(() => {
        const current = inVisit("room");
        if (current === null || (side !== "left" && side !== "right")) {
          return;
        }
        current.runner?.answer(side, pressedAtMs);
      });
    },

    pause() {
      step(() => {
        if (inVisit("room") === null) {
          return;
        }
        beginPause("visitor");
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
          case "swappedRepeat":
            summaryOf(current);
            current.swappedRoom = null;
            enterStage("result");
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
        const roomSummary = summaryOf(current).rooms[roomIndex];
        if (roomSummary === undefined || !roomSummary.swappedRepeatOffered) {
          return;
        }
        current.swappedRoom = roomSummary.room;
        enterStage("swappedRepeat");
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

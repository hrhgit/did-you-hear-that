import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import type { ManualTimer } from "../config/manual-timer";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
import { soundRulesConfig } from "../config/sound-rules-config";
import { calibrationCopy, roomsShortLine } from "../copy/calibration-copy";
import { headphoneCheckCopy } from "../copy/headphone-check-copy";
import type { AudioBackend } from "../audio/output/audio-backend";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import type {
  AudioOutput,
  UnsupportedEvent,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import type {
  FakeAudioBackend,
  FakeAudioBackendOptions,
} from "../audio/output/fake-audio-backend";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import type { Ear } from "../engine/search-types";
import type { PresentedTrial } from "./create-visit-flow";
import { createVisitFlow } from "./create-visit-flow";
import { roomSearchCapDb } from "./room-search-cap";
import { summarizeVisit } from "./summarize-visit";
import type {
  ResultSnapshot,
  VisitEvent,
  VisitFlow,
  VisitLog,
  VisitSnapshot,
  VisitStage,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

const { calibrationSettingMinDb, calibrationSettingKeepMinDb } =
  audioOutputConfig;
const { capRelativeToAnchorDb, responseWindowMs } = hearingMethodConfig;

/** The lowest supported rate, where the real renderers are quickest. */
const sampleRateHz = soundRulesConfig.sampleRateMinHz;
const flowSeed = 20261201;
/** How long after a window opens the simulated visitor answers. */
const answerDelayMs = 300;

interface SpyCall {
  readonly name: string;
  readonly stage: VisitStage | "creation";
}

interface Harness {
  readonly backend: FakeAudioBackend;
  readonly timer: ManualTimer;
  readonly output: AudioOutput;
  readonly flow: VisitFlow;
  /** Every call the flow made to the output shell, with the stage it was made in. */
  readonly calls: SpyCall[];
  readonly snapshots: VisitSnapshot[];
  readonly events: VisitEvent[];
  readonly presented: PresentedTrial[];
  /** Delivers an unsupported report from the output shell to the flow. */
  fireUnsupported(event: UnsupportedEvent): void;
  /** Moves the audio clock and the timer together, 1 ms at a time. */
  advance(durationMs: number): void;
  advanceTo(atMs: number): void;
  /** Lets pending activations settle. */
  settle(): Promise<void>;
}

/**
 * A flow on a real output shell on the fake backend, with a spy around the shell. The page clock
 * of the timestamp pair is the timer's clock.
 */
function createHarness(
  options: {
    readonly seed?: number;
    readonly backend?: FakeAudioBackendOptions;
    readonly wrapBackend?: (backend: FakeAudioBackend) => AudioBackend;
  } = {},
): Harness {
  const backend = createFakeAudioBackend({
    sampleRateHz,
    performanceOffsetMs: 0,
    ...options.backend,
  });
  const timer = createManualTimer();
  const real = createAudioOutput({
    backend: options.wrapBackend?.(backend) ?? backend,
    timer,
  });
  const calls: SpyCall[] = [];
  const unsupportedListeners: ((event: UnsupportedEvent) => void)[] = [];
  let flowRef: VisitFlow | null = null;
  const record = (name: string): void => {
    calls.push({ name, stage: flowRef?.snapshot().stage ?? "creation" });
  };
  const output: AudioOutput = {
    ...real,
    activate() {
      record("activate");
      return real.activate();
    },
    beginRoom() {
      record("beginRoom");
      real.beginRoom();
    },
    play(request) {
      record("play");
      return real.play(request);
    },
    playHeadphoneCheck(random) {
      record("playHeadphoneCheck");
      return real.playHeadphoneCheck(random);
    },
    stopAll() {
      record("stopAll");
      real.stopAll();
    },
    onUnsupported(listener) {
      unsupportedListeners.push(listener);
      return real.onUnsupported(listener);
    },
  };
  const presented: PresentedTrial[] = [];
  const flow = createVisitFlow({
    output,
    timer,
    seed: options.seed ?? flowSeed,
    onTrialPresented: (trial) => presented.push(trial),
  });
  flowRef = flow;
  const snapshots: VisitSnapshot[] = [];
  const events: VisitEvent[] = [];
  flow.subscribe((snapshot) => snapshots.push(snapshot));
  flow.onEvent((event) => events.push(event));
  const advance = (durationMs: number): void => {
    for (let leftMs = durationMs; leftMs > 0; leftMs -= 1) {
      const stepMs = Math.min(1, leftMs);
      backend.advanceClockBy(stepMs);
      timer.advanceBy(stepMs);
    }
  };
  return {
    backend,
    timer,
    output,
    flow,
    calls,
    snapshots,
    events,
    presented,
    fireUnsupported(event) {
      for (const listener of unsupportedListeners) {
        listener(event);
      }
    },
    advance,
    advanceTo: (atMs) => advance(Math.max(0, atMs - timer.now())),
    async settle() {
      for (let turn = 0; turn < 10; turn += 1) {
        await Promise.resolve();
      }
    },
  };
}

function stageOf(harness: Harness): VisitStage {
  return harness.flow.snapshot().stage;
}

/** Chooses a visit and lets sound start. */
async function toCalibration(
  harness: Harness,
  visitType: "quick" | "full" = "quick",
): Promise<void> {
  harness.flow.chooseVisit(visitType);
  await harness.settle();
}

/** Starts the hiss, presses Louder up to `settingDb`, waits until it is played, and keeps it. */
async function calibrate(
  harness: Harness,
  settingDb = calibrationSettingKeepMinDb,
): Promise<void> {
  harness.flow.startCalibration();
  await harness.settle();
  for (let press = calibrationSettingMinDb; press < settingDb; press += 1) {
    harness.flow.louder();
  }
  for (let wait = 0; wait < 600; wait += 1) {
    const snapshot = harness.flow.snapshot();
    if (
      snapshot.stage === "calibration" &&
      snapshot.playedSettingDb === settingDb
    ) {
      break;
    }
    harness.advance(100);
  }
  harness.flow.keepCalibration();
}

/** Waits out the hiss still playing after the keep, plays the headphone check, waits it out, and answers. */
async function checkHeadphones(
  harness: Harness,
  answer: "left" | "right" | "bothSides" | "nothingHeard" = "left",
): Promise<void> {
  harness.advance(2000);
  harness.flow.playHeadphoneCheck();
  await harness.settle();
  harness.advance(2000);
  harness.flow.answerHeadphoneCheck(answer);
}

async function toHeadphoneCheck(harness: Harness): Promise<void> {
  await toCalibration(harness);
  await calibrate(harness);
}

async function toRules(harness: Harness): Promise<void> {
  await toHeadphoneCheck(harness);
  await checkHeadphones(harness);
  harness.flow.proceed();
}

async function toRoom(harness: Harness): Promise<void> {
  await toRules(harness);
  harness.flow.proceed();
  await harness.settle();
}

type Listener = (trial: PresentedTrial, index: number) => Ear | null;

/** Catches every sound at or above its ear's threshold, on the right side, and nothing else. */
function stepListener(
  thresholdsDb: Readonly<Record<Ear, number>> = { left: -40, right: -40 },
): Listener {
  return (trial) =>
    trial.kind === "sound" &&
    trial.ear !== null &&
    trial.levelDb !== null &&
    trial.levelDb >= thresholdsDb[trial.ear]
      ? trial.ear
      : null;
}

/**
 * Answers each presented trial as `listener` says, `answerDelayMs` after its window opens, until
 * the stage is no longer `room`, a pause holds, or `until` says to stop.
 */
function playRoom(
  harness: Harness,
  listener: Listener,
  until: () => boolean = () => false,
): void {
  let handled = harness.presented.length;
  for (let turn = 0; turn < 100_000; turn += 1) {
    const snapshot = harness.flow.snapshot();
    if (snapshot.stage !== "room" || snapshot.pause !== null || until()) {
      return;
    }
    if (harness.presented.length > handled) {
      handled = harness.presented.length;
      const trial = harness.presented[handled - 1]!;
      const side = listener(trial, handled - 1);
      if (side !== null) {
        harness.advanceTo(trial.windowStartMs + answerDelayMs);
        harness.flow.answer(side, harness.timer.now());
        continue;
      }
    }
    harness.advance(100);
  }
  throw new Error("The room did not end.");
}

/** Plays every room and the rests between them, up to the missed-sound replay. */
async function toMissedSoundReplay(
  harness: Harness,
  listener: Listener = stepListener(),
): Promise<void> {
  await toRoom(harness);
  for (let room = 0; room < 10; room += 1) {
    playRoom(harness, listener);
    if (stageOf(harness) !== "betweenRooms") {
      break;
    }
    harness.flow.proceed();
    await harness.settle();
  }
  expect(stageOf(harness)).toBe("missedSoundReplay");
}

async function toResult(
  harness: Harness,
  listener: Listener = stepListener(),
): Promise<ResultSnapshot> {
  await toMissedSoundReplay(harness, listener);
  harness.flow.proceed();
  const snapshot = harness.flow.snapshot();
  if (snapshot.stage !== "result") {
    throw new Error(`Expected the result, but the stage is ${snapshot.stage}.`);
  }
  return snapshot;
}

/** The listener whose floors differ by 20 dB, so that both ears are found and the repeat is offered. */
const unevenListener = stepListener({ left: -40, right: -20 });

async function toSwappedRepeat(harness: Harness): Promise<void> {
  const result = await toResult(harness, unevenListener);
  const offered = result.summary.rooms.findIndex(
    (room) => room.swappedRepeatOffered,
  );
  expect(offered).toBeGreaterThanOrEqual(0);
  harness.flow.chooseSwappedRepeat(offered);
}

async function toExit(harness: Harness): Promise<void> {
  await toCalibration(harness);
  harness.flow.stop();
}

async function toUnsupported(harness: Harness): Promise<void> {
  harness.fireUnsupported({ reason: "monoOutput", sampleRateHz });
  await harness.settle();
}

type ActionName =
  | "chooseVisit"
  | "startCalibration"
  | "louder"
  | "quieter"
  | "keepCalibration"
  | "playHeadphoneCheck"
  | "answerHeadphoneCheck"
  | "proceed"
  | "answer"
  | "pause"
  | "resume"
  | "stop"
  | "chooseSwappedRepeat"
  | "startReplay"
  | "backToFrontDoor";

const actions: Readonly<Record<ActionName, (flow: VisitFlow) => void>> = {
  chooseVisit: (flow) => flow.chooseVisit("quick"),
  startCalibration: (flow) => flow.startCalibration(),
  louder: (flow) => flow.louder(),
  quieter: (flow) => flow.quieter(),
  keepCalibration: (flow) => flow.keepCalibration(),
  playHeadphoneCheck: (flow) => flow.playHeadphoneCheck(),
  answerHeadphoneCheck: (flow) => flow.answerHeadphoneCheck("left"),
  proceed: (flow) => flow.proceed(),
  answer: (flow) => flow.answer("left"),
  pause: (flow) => flow.pause(),
  resume: (flow) => flow.resume(),
  stop: (flow) => flow.stop(),
  chooseSwappedRepeat: (flow) => flow.chooseSwappedRepeat(0),
  startReplay: (flow) => flow.startReplay(),
  backToFrontDoor: (flow) => flow.backToFrontDoor(),
};

/** "What each stage accepts", one row per stage. `stop` that keeps the stage is checked apart. */
const stageRows: readonly {
  readonly stage: VisitStage;
  readonly reach: (harness: Harness) => Promise<void>;
  readonly accepts: readonly ActionName[];
  readonly canProceed: boolean;
}[] = [
  {
    stage: "entry",
    reach: async () => undefined,
    accepts: ["chooseVisit", "stop"],
    canProceed: false,
  },
  {
    stage: "calibration",
    reach: toCalibration,
    accepts: [
      "startCalibration",
      "louder",
      "quieter",
      "keepCalibration",
      "stop",
      "resume",
    ],
    canProceed: false,
  },
  {
    stage: "headphoneCheck",
    reach: toHeadphoneCheck,
    accepts: [
      "playHeadphoneCheck",
      "answerHeadphoneCheck",
      "proceed",
      "stop",
      "resume",
    ],
    canProceed: false,
  },
  {
    stage: "rules",
    reach: toRules,
    accepts: ["proceed", "stop", "resume"],
    canProceed: true,
  },
  {
    stage: "room",
    reach: toRoom,
    accepts: ["answer", "pause", "resume", "stop"],
    canProceed: false,
  },
  {
    stage: "betweenRooms",
    reach: async (harness) => {
      await toRoom(harness);
      playRoom(harness, stepListener());
    },
    accepts: ["proceed", "stop", "resume"],
    canProceed: true,
  },
  {
    stage: "missedSoundReplay",
    reach: (harness) => toMissedSoundReplay(harness),
    accepts: ["proceed", "stop"],
    canProceed: true,
  },
  {
    stage: "result",
    reach: async (harness) => {
      await toResult(harness, unevenListener);
    },
    accepts: ["chooseSwappedRepeat", "backToFrontDoor", "stop"],
    canProceed: false,
  },
  {
    stage: "swappedRepeat",
    reach: toSwappedRepeat,
    accepts: ["proceed", "stop"],
    canProceed: true,
  },
  {
    stage: "exit",
    reach: toExit,
    accepts: ["backToFrontDoor", "stop"],
    canProceed: false,
  },
  {
    stage: "unsupported",
    reach: toUnsupported,
    accepts: ["stop"],
    canProceed: false,
  },
];

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

/** The visit log of a visit played to the result. */
function logOf(snapshot: VisitSnapshot): VisitLog {
  if (!("visitLog" in snapshot)) {
    throw new Error(`The ${snapshot.stage} snapshot holds no visit log.`);
  }
  return snapshot.visitLog;
}

describe("createVisitFlow: creation", () => {
  it("makes no audio context, plays nothing and shows the front door (R2.1, R2.3)", () => {
    const backend = createFakeAudioBackend({ sampleRateHz });
    const flow = createVisitFlow({
      backend,
      timer: createManualTimer(),
      seed: flowSeed,
    });
    expect(backend.contextCount()).toBe(0);
    expect(backend.calls).toEqual([]);
    expect(flow.snapshot()).toEqual({
      stage: "entry",
      visitType: null,
      rooms: [],
      finishedRoomCount: 0,
      canProceed: false,
      pause: null,
      activationRefused: false,
      choices: [
        { visitType: "quick", roomCount: 3 },
        { visitType: "full", roomCount: 5 },
      ],
    });
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN])(
    "throws a RangeError for the seed %s (R2.2)",
    (seed) => {
      expect(() =>
        createVisitFlow({
          backend: createFakeAudioBackend(),
          timer: createManualTimer(),
          seed,
        }),
      ).toThrow(RangeError);
    },
  );

  it("starts sound inside chooseVisit, before it returns, and shows calibration (R2.4, R2.5)", () => {
    const backend = createFakeAudioBackend({ sampleRateHz });
    const flow = createVisitFlow({
      backend,
      timer: createManualTimer(),
      seed: flowSeed,
    });
    flow.chooseVisit("full");
    expect(backend.calls[0]).toEqual({ kind: "createOrResume" });
    const snapshot = flow.snapshot();
    expect(snapshot.stage).toBe("calibration");
    expect(snapshot.visitType).toBe("full");
    expect(snapshot.rooms).toEqual(visitRooms("full"));
  });

  it("says so when activation saw no gesture, and the next action that needs sound tries again (R2.6)", async () => {
    const harness = createHarness({ backend: { userActivationActive: false } });
    await toCalibration(harness);
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      activationRefused: true,
    });
    expect(harness.backend.contextCount()).toBe(0);
    harness.backend.setUserActivationActive(true);
    harness.flow.startCalibration();
    expect(harness.backend.contextCount()).toBe(1);
    await harness.settle();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      activationRefused: false,
      playing: true,
    });
  });

  it("ignores a visit type it does not know", () => {
    const harness = createHarness();
    harness.flow.chooseVisit("long" as "quick");
    expect(stageOf(harness)).toBe("entry");
    expect(harness.calls).toEqual([]);
  });
});

describe("createVisitFlow: what each stage accepts", () => {
  it.each(stageRows.map((row) => [row.stage, row] as const))(
    "%s: is entered as stated and ignores every action it does not accept (R3.5, R3.6)",
    async (_name, row) => {
      const harness = createHarness();
      await row.reach(harness);
      const before = harness.flow.snapshot();
      expect(before.stage).toBe(row.stage);
      expect(before.canProceed).toBe(row.canProceed);
      const ignored = (Object.keys(actions) as ActionName[]).filter(
        (name) => !row.accepts.includes(name),
      );
      for (const name of ignored) {
        const callCount = harness.calls.length;
        const backendCallCount = harness.backend.calls.length;
        const snapshotCount = harness.snapshots.length;
        const eventCount = harness.events.length;
        actions[name](harness.flow);
        await harness.settle();
        expect(harness.flow.snapshot(), name).toEqual(before);
        expect(harness.calls.length, name).toBe(callCount);
        expect(harness.backend.calls.length, name).toBe(backendCallCount);
        expect(harness.snapshots.length, name).toBe(snapshotCount);
        expect(harness.events.length, name).toBe(eventCount);
      }
    },
    60_000,
  );

  it.each(["entry", "result", "exit", "unsupported"] as const)(
    "%s: stop keeps the stage",
    async (stage) => {
      const harness = createHarness();
      await stageRows.find((row) => row.stage === stage)!.reach(harness);
      const before = harness.flow.snapshot();
      harness.flow.stop();
      await harness.settle();
      expect(harness.flow.snapshot()).toEqual(before);
    },
    60_000,
  );

  it("does nothing while a pause holds except resume and stop (R12.5)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    harness.flow.pause();
    const before = harness.flow.snapshot();
    const callCount = harness.calls.length;
    for (const name of Object.keys(actions) as ActionName[]) {
      if (name === "resume" || name === "stop") {
        continue;
      }
      actions[name](harness.flow);
      await harness.settle();
      expect(harness.flow.snapshot(), name).toEqual(before);
      expect(harness.calls.length, name).toBe(callCount);
    }
    expect(before).toMatchObject({
      canProceed: false,
      pause: { reason: "visitor" },
    });
  });
});

describe("createVisitFlow: calibration", () => {
  it("follows the calibration controller and gives the control's bottom and top (R4.1, R4.2, R4.5)", async () => {
    const harness = createHarness();
    await toCalibration(harness);
    expect(harness.flow.snapshot()).toEqual({
      stage: "calibration",
      visitType: "quick",
      rooms: visitRooms("quick"),
      finishedRoomCount: 0,
      canProceed: false,
      pause: null,
      activationRefused: false,
      again: false,
      playing: false,
      playedSettingDb: null,
      controlBottomDb: calibrationSettingMinDb,
      controlTopDb: calibrationSettingTopDb(),
      atTop: false,
      line: calibrationCopy.openLine,
      keepRefusal: null,
    });
    harness.flow.startCalibration();
    expect(harness.flow.snapshot()).toMatchObject({
      playing: true,
      playedSettingDb: calibrationSettingMinDb,
    });
    harness.flow.louder();
    harness.flow.louder();
    harness.advance(3000);
    expect(harness.flow.snapshot()).toMatchObject({
      playing: true,
      playedSettingDb: calibrationSettingMinDb + 2,
    });
    harness.flow.quieter();
    harness.advance(3000);
    expect(harness.flow.snapshot()).toMatchObject({
      playedSettingDb: calibrationSettingMinDb + 1,
    });
  });

  it("gives the reason and the line when the shell refuses to keep the setting (R4.4)", async () => {
    const harness = createHarness();
    await toCalibration(harness);
    harness.flow.keepCalibration();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      keepRefusal: "notCalibrating",
    });
    harness.flow.startCalibration();
    harness.advance(100);
    harness.flow.keepCalibration();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      keepRefusal: "systemVolumeHigh",
      line: calibrationCopy.systemVolumeHighLine,
    });
  });

  it("logs a kept setting with every room top and moves to the headphone check (R4.3)", async () => {
    const harness = createHarness();
    await toHeadphoneCheck(harness);
    const report = harness.output.rangeReport()!;
    expect(stageOf(harness)).toBe("headphoneCheck");
    await checkHeadphones(harness);
    const result = await (async () => {
      harness.flow.proceed();
      harness.flow.proceed();
      await harness.settle();
      for (let room = 0; room < 3; room += 1) {
        playRoom(harness, stepListener());
        harness.flow.proceed();
        await harness.settle();
      }
      return harness.flow.snapshot();
    })();
    expect(logOf(result).calibrations).toEqual([
      {
        calibrationIndex: 0,
        settingDb: calibrationSettingKeepMinDb,
        roomTopLevelDb: {
          cellar: report.rooms.cellar.topLevelDb,
          corridor: report.rooms.corridor.topLevelDb,
          nursery: report.rooms.nursery.topLevelDb,
          stairs: report.rooms.stairs.topLevelDb,
          attic: report.rooms.attic.topLevelDb,
        },
        keptAtMs: expect.any(Number),
      },
    ]);
  }, 60_000);

  it("counts the rooms of this visit that cannot reach the cap in the rooms line (R5.5)", async () => {
    for (const settingDb of [
      calibrationSettingKeepMinDb,
      calibrationSettingTopDb(),
    ]) {
      const harness = createHarness();
      await toCalibration(harness, "quick");
      await calibrate(harness, settingDb);
      const report = harness.output.rangeReport()!;
      const rooms = visitRooms("quick");
      const shortCount = rooms.filter(
        (room) =>
          roomSearchCapDb(
            report.rooms[room.roomId].topLevelDb,
            hearingMethodConfig,
          ) < capRelativeToAnchorDb,
      ).length;
      expect(harness.flow.snapshot()).toMatchObject({
        stage: "headphoneCheck",
        roomsLine: roomsShortLine(shortCount, rooms.length),
      });
    }
  }, 60_000);
});

describe("createVisitFlow: the headphone check", () => {
  it("ignores an answer before the check was played (R5.3)", async () => {
    const harness = createHarness();
    await toHeadphoneCheck(harness);
    const before = harness.flow.snapshot();
    harness.flow.answerHeadphoneCheck("left");
    expect(harness.flow.snapshot()).toEqual(before);
    expect(before).toMatchObject({
      awaitingAnswer: false,
      judgement: null,
      judgementLine: null,
      playRefusal: null,
      canProceed: false,
    });
  });

  it.each([
    ["left", "correct", true],
    ["right", "swapped", false],
    ["bothSides", "bothSides", false],
    ["nothingHeard", "notHeard", false],
  ] as const)(
    "the answer %s is judged %s with its line, and only correct lets the visit go on (R5.2, R5.4)",
    async (answer, judgement, goesOn) => {
      const harness = createHarness();
      await toHeadphoneCheck(harness);
      harness.advance(2000);
      harness.flow.playHeadphoneCheck();
      expect(harness.flow.snapshot()).toMatchObject({ awaitingAnswer: true });
      expect(harness.calls.at(-1)).toEqual({
        name: "playHeadphoneCheck",
        stage: "headphoneCheck",
      });
      harness.flow.answerHeadphoneCheck(answer);
      expect(harness.flow.snapshot()).toMatchObject({
        stage: "headphoneCheck",
        awaitingAnswer: false,
        judgement,
        judgementLine: headphoneCheckCopy.judgementLines[judgement],
        canProceed: goesOn,
      });
      harness.flow.answerHeadphoneCheck("left");
      expect(harness.flow.snapshot()).toMatchObject({ judgement });
      harness.flow.proceed();
      expect(stageOf(harness)).toBe(goesOn ? "rules" : "headphoneCheck");
    },
  );

  it("gives the reason when the check was not played", async () => {
    const harness = createHarness();
    await toHeadphoneCheck(harness);
    harness.flow.playHeadphoneCheck();
    expect(harness.flow.snapshot()).toMatchObject({
      playRefusal: "busy",
      awaitingAnswer: false,
    });
    harness.advance(2000);
    harness.flow.playHeadphoneCheck();
    harness.flow.playHeadphoneCheck();
    expect(harness.flow.snapshot()).toMatchObject({
      playRefusal: "busy",
      awaitingAnswer: true,
    });
  });
});

describe("createVisitFlow: rooms", () => {
  it("calls beginRoom before the first trial and gives the search the rounded room top as its cap (R6.1, R6.2, R6.3)", async () => {
    const harness = createHarness();
    await toRules(harness);
    const report = harness.output.rangeReport()!;
    harness.flow.proceed();
    await harness.settle();
    const names = harness.calls.map((call) => call.name);
    expect(names.lastIndexOf("beginRoom")).toBeGreaterThan(
      names.lastIndexOf("playHeadphoneCheck"),
    );
    expect(names.indexOf("play")).toBe(-1);
    await toResultFromRoom(harness);
    const afterVisit = harness.calls.map((call) => call.name);
    expect(afterVisit.indexOf("beginRoom")).toBe(
      names.lastIndexOf("beginRoom"),
    );
    expect(afterVisit.indexOf("play")).toBeGreaterThan(
      afterVisit.indexOf("beginRoom"),
    );
    const log = logOf(harness.flow.snapshot());
    const firstRoom = visitRooms("quick")[0]!;
    expect(log.roomAttempts[0]).toMatchObject({
      roomIndex: 0,
      attempt: 1,
      calibrationIndex: 0,
      ending: "finished",
      searchCapDb: roomSearchCapDb(
        report.rooms[firstRoom.roomId].topLevelDb,
        hearingMethodConfig,
      ),
    });
    const engineSeeds = log.roomAttempts.map((attempt) => attempt.engineSeed);
    expect(new Set(engineSeeds).size).toBe(engineSeeds.length);
  }, 60_000);

  it("hands out roomStarted and roomFinished, and goes to the replay after beginRoom once the last room ends (R6.4, R7.10, R16.1)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    const rooms = visitRooms("quick");
    expect(harness.events[0]).toEqual({
      kind: "roomStarted",
      room: rooms[0],
      attempt: 1,
    });
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "room",
      room: rooms[0],
      finishedRoomCount: 0,
    });
    playRoom(harness, stepListener());
    expect(harness.events.at(-1)).toEqual({
      kind: "roomFinished",
      room: rooms[0],
    });
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "betweenRooms",
      finishedRoom: rooms[0],
      nextRoom: rooms[1],
      finishedRoomCount: 1,
      canProceed: true,
    });
    // The rest lasts as long as the visitor likes (R12.8).
    harness.advance(120_000);
    expect(stageOf(harness)).toBe("betweenRooms");
    for (let room = 1; room < rooms.length; room += 1) {
      harness.flow.proceed();
      await harness.settle();
      expect(
        harness.events.filter((event) => event.kind === "roomStarted").at(-1),
      ).toEqual({
        kind: "roomStarted",
        room: rooms[room],
        attempt: 1,
      });
      playRoom(harness, stepListener());
    }
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "missedSoundReplay",
      finishedRoomCount: rooms.length,
      canProceed: true,
    });
    expect(harness.calls.at(-1)).toEqual({ name: "beginRoom", stage: "room" });
    const log = logOf(harness.flow.snapshot());
    expect(isDeeplyFrozen(log)).toBe(true);
    expect(JSON.parse(JSON.stringify(log))).toStrictEqual(log);
  }, 60_000);

  it("gives each decided trial its reaction: ripple, noSoundLine or none (R9.1, R9.2)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    let soundCount = 0;
    let noSoundCount = 0;
    const variedListener: Listener = (trial) => {
      if (trial.kind === "noSound") {
        noSoundCount += 1;
        return noSoundCount % 2 === 1 ? "left" : null;
      }
      soundCount += 1;
      const ear = trial.ear!;
      switch (soundCount % 3) {
        case 0:
          return ear;
        case 1:
          return ear === "left" ? "right" : "left";
        default:
          return null;
      }
    };
    playRoom(
      harness,
      variedListener,
      () => noSoundCount >= 4 && soundCount >= 6,
    );
    const scored = harness.events.flatMap((event) =>
      event.kind === "trialScored" ? [event] : [],
    );
    const expected = {
      caught: "ripple",
      falseAlarm: "noSoundLine",
      missed: "none",
      wrongSide: "none",
      noResponse: "none",
    } as const;
    for (const event of scored) {
      expect(event.reaction).toBe(expected[event.trial.outcome]);
      expect(event.room).toEqual(visitRooms("quick")[0]);
    }
    expect(new Set(scored.map((event) => event.trial.outcome))).toEqual(
      new Set(Object.keys(expected)),
    );
  }, 60_000);

  it("hands out events and snapshots that are frozen (R11.6)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    playRoom(harness, stepListener());
    expect(harness.events.length).toBeGreaterThan(2);
    expect(harness.events.every(isDeeplyFrozen)).toBe(true);
    expect(harness.snapshots.every(isDeeplyFrozen)).toBe(true);
    expect(isDeeplyFrozen(harness.flow.snapshot())).toBe(true);
  }, 60_000);

  it("logs answers outside every window and releases nothing about them (R8.1, R8.3)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    const snapshotCount = harness.snapshots.length;
    const eventCount = harness.events.length;
    const before = harness.flow.snapshot();
    harness.advance(500);
    harness.flow.answer("left");
    harness.flow.answer("right", harness.timer.now() - 100);
    expect(harness.flow.snapshot()).toBe(before);
    expect(harness.snapshots).toHaveLength(snapshotCount);
    expect(harness.events).toHaveLength(eventCount);
    await toResultFromRoom(harness);
    const log = logOf(harness.flow.snapshot());
    expect(log.ignoredAnswers.slice(0, 2)).toMatchObject([
      { side: "left", roomIndex: 0, attempt: 1 },
      { side: "right", roomIndex: 0, attempt: 1 },
    ]);
  }, 60_000);

  it("ends the visit with soundRefused after three refused plays of one trial (R21.2)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    // A long calibration repeat started in the shell makes every trial sound busy.
    let refusals = 0;
    for (let turn = 0; turn < 600 && stageOf(harness) === "room"; turn += 1) {
      harness.output.playHeadphoneCheck(createSeededRandom(1));
      refusals += 1;
      harness.advance(50);
    }
    expect(refusals).toBeGreaterThan(0);
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "exit",
      reason: "soundRefused",
      visitType: null,
    });
    expect(harness.calls.at(-1)?.name).toBe("stopAll");
  }, 60_000);
});

/** Plays the rest of a visit from inside a room to the result. */
async function toResultFromRoom(harness: Harness): Promise<void> {
  for (let room = 0; room < 10; room += 1) {
    playRoom(harness, stepListener());
    if (stageOf(harness) !== "betweenRooms") {
      break;
    }
    harness.flow.proceed();
    await harness.settle();
  }
  harness.flow.proceed();
  expect(stageOf(harness)).toBe("result");
}

describe("createVisitFlow: pauses", () => {
  it("pause in a room discards the trial under way, silences, and presents it again after its gap on resume (R12.1, R12.3, R12.6, R12.7)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    playRoom(harness, stepListener(), () => harness.presented.length > 0);
    harness.advance(100);
    const presented = harness.presented.at(-1)!;
    const fadesBefore = harness.backend.calls.filter(
      (call) => call.kind === "fadeToSilence",
    ).length;
    harness.flow.pause();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "room",
      pause: { reason: "visitor" },
    });
    expect(harness.calls.at(-1)).toEqual({ name: "stopAll", stage: "room" });
    expect(
      harness.backend.calls.filter((call) => call.kind === "fadeToSilence")
        .length,
    ).toBe(fadesBefore + 1);
    const eventCount = harness.events.length;
    harness.advance(30_000);
    expect(harness.presented.at(-1)).toBe(presented);
    expect(harness.events).toHaveLength(eventCount);
    const activations = harness.calls.filter(
      (call) => call.name === "activate",
    ).length;
    harness.flow.resume();
    expect(
      harness.calls.filter((call) => call.name === "activate").length,
    ).toBe(activations + 1);
    await harness.settle();
    expect(harness.flow.snapshot().pause).toBeNull();
    playRoom(
      harness,
      stepListener(),
      () =>
        harness.presented.length > 1 && harness.presented.at(-1) !== presented,
    );
    const again = harness.presented.at(-1)!;
    expect(again).toMatchObject({
      trialNumber: presented.trialNumber,
      kind: presented.kind,
      ear: presented.ear,
      levelDb: presented.levelDb,
    });
    await toResultFromRoom(harness);
    const log = logOf(harness.flow.snapshot());
    expect(log.trials[0]).toMatchObject({
      status: "discarded",
      trialNumber: 1,
    });
    expect(log.trials[1]).toMatchObject({ status: "scored", trialNumber: 1 });
    expect(log.pauses).toMatchObject([
      { reason: "visitor", stage: "room", roomIndex: 0 },
    ]);
  }, 60_000);

  it("a pause during a gap logs nothing about the trial (R12.4)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    harness.advance(500);
    harness.flow.pause();
    harness.flow.resume();
    await harness.settle();
    await toResultFromRoom(harness);
    const log = logOf(harness.flow.snapshot());
    expect(log.trials[0]).toMatchObject({
      status: "scored",
      order: 1,
      trialNumber: 1,
    });
  }, 60_000);

  it.each([
    "calibration",
    "headphoneCheck",
    "rules",
    "room",
    "betweenRooms",
  ] as const)(
    "a hidden page in %s pauses with the reason hidden, and resume goes on (R12.2)",
    async (stage) => {
      const harness = createHarness();
      await stageRows.find((row) => row.stage === stage)!.reach(harness);
      const before = harness.flow.snapshot();
      harness.backend.fire("hidden");
      expect(harness.flow.snapshot()).toMatchObject({
        stage,
        pause: { reason: "hidden" },
        canProceed: false,
      });
      harness.backend.fire("interrupted");
      expect(harness.flow.snapshot().pause).toEqual({ reason: "hidden" });
      harness.flow.resume();
      await harness.settle();
      expect(harness.flow.snapshot()).toMatchObject({
        stage,
        pause: null,
        canProceed: before.canProceed,
      });
    },
    60_000,
  );

  it("an interruption in a room pauses with the reason interrupted (R12.2)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    harness.backend.fire("interrupted");
    expect(harness.flow.snapshot().pause).toEqual({ reason: "interrupted" });
  });

  it("in calibration, the hiss stays off after a pause until startCalibration (audio-output D47)", async () => {
    const harness = createHarness();
    await toCalibration(harness);
    harness.flow.startCalibration();
    harness.advance(2000);
    harness.backend.fire("hidden");
    expect(harness.flow.snapshot()).toMatchObject({ playing: false });
    harness.flow.resume();
    await harness.settle();
    expect(harness.flow.snapshot()).toMatchObject({
      playing: false,
      pause: null,
    });
    harness.flow.startCalibration();
    expect(harness.flow.snapshot()).toMatchObject({
      playing: true,
      playedSettingDb: calibrationSettingMinDb,
    });
  });

  it("a play refused because the shell is not running pauses with the shell's reason (R21.3)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    // A stop the flow did not ask for and does not hear as a pause: the shell's own control.
    harness.output.stopAll();
    expect(harness.flow.snapshot().pause).toBeNull();
    for (
      let turn = 0;
      turn < 600 && harness.flow.snapshot().pause === null;
      turn += 1
    ) {
      harness.advance(100);
    }
    expect(harness.flow.snapshot().pause).toEqual({ reason: "interrupted" });
    harness.flow.resume();
    await harness.settle();
    await toResultFromRoom(harness);
    const log = logOf(harness.flow.snapshot());
    expect(log.refusedPlays).toEqual([]);
    expect(log.pauses).toMatchObject([
      { reason: "interrupted", stage: "room" },
    ]);
  }, 60_000);

  it("a device change in a room abandons the run, calibrates again, checks the headphones, and starts the same room again without the rules (R13.1 to R13.5)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    playRoom(harness, stepListener(), () => harness.presented.length >= 3);
    harness.advance(100);
    harness.backend.fire("deviceChanged");
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "room",
      pause: { reason: "deviceChanged" },
    });
    expect(harness.output.rangeReport()).toBeNull();
    harness.flow.resume();
    await harness.settle();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      again: true,
      playing: false,
      playedSettingDb: null,
      pause: null,
    });
    const playsBefore = harness.calls.filter(
      (call) => call.name === "play",
    ).length;
    harness.flow.proceed();
    expect(stageOf(harness)).toBe("calibration");
    await calibrate(harness, calibrationSettingKeepMinDb + 3);
    expect(stageOf(harness)).toBe("headphoneCheck");
    harness.flow.proceed();
    expect(stageOf(harness)).toBe("headphoneCheck");
    await checkHeadphones(harness);
    expect(harness.calls.filter((call) => call.name === "play").length).toBe(
      playsBefore,
    );
    harness.flow.proceed();
    await harness.settle();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "room",
      room: visitRooms("quick")[0],
    });
    expect(
      harness.events.filter((event) => event.kind === "roomStarted").at(-1),
    ).toMatchObject({
      attempt: 2,
    });
    await toResultFromRoom(harness);
    const snapshot = harness.flow.snapshot() as ResultSnapshot;
    const log = snapshot.visitLog;
    expect(
      log.roomAttempts.map((attempt) => [
        attempt.roomIndex,
        attempt.attempt,
        attempt.ending,
        attempt.calibrationIndex,
      ]),
    ).toEqual([
      [0, 1, "abandoned", 0],
      [0, 2, "finished", 1],
      [1, 1, "finished", 1],
      [2, 1, "finished", 1],
    ]);
    expect(log.roomAttempts[0]!.engineSeed).not.toBe(
      log.roomAttempts[1]!.engineSeed,
    );
    expect(log.roomAttempts[0]!.result).toBeNull();
    expect(log.calibrations.map((entry) => entry.settingDb)).toEqual([
      calibrationSettingKeepMinDb,
      calibrationSettingKeepMinDb + 3,
    ]);
    expect(log.headphoneChecks.map((entry) => entry.calibrationIndex)).toEqual([
      0, 1,
    ]);
    expect(log.pauses).toMatchObject([
      { reason: "deviceChanged", stage: "room", roomIndex: 0 },
    ]);
    const stages = harness.snapshots.map((entry) => entry.stage);
    expect(
      stages.filter(
        (entry, index) => entry === "rules" && stages[index - 1] !== "rules",
      ),
    ).toHaveLength(1);
    expect(snapshot.summary).toEqual(summarizeVisit(log));
  }, 60_000);

  it("a device change during a pause gives the pause the reason deviceChanged (R13.1)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    harness.flow.pause();
    harness.backend.fire("deviceChanged");
    expect(harness.flow.snapshot().pause).toEqual({ reason: "deviceChanged" });
    harness.flow.resume();
    await harness.settle();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      again: true,
    });
  });

  it.each(["calibration", "headphoneCheck", "betweenRooms"] as const)(
    "a device change in %s leads to calibration again and then the headphone check (R13.2)",
    async (stage) => {
      const harness = createHarness();
      await stageRows.find((row) => row.stage === stage)!.reach(harness);
      const finishedRoomCount = harness.flow.snapshot().finishedRoomCount;
      harness.backend.fire("deviceChanged");
      harness.flow.resume();
      await harness.settle();
      expect(harness.flow.snapshot()).toMatchObject({
        stage: "calibration",
        again: true,
      });
      await calibrate(harness);
      await checkHeadphones(harness);
      harness.flow.proceed();
      await harness.settle();
      expect(harness.flow.snapshot()).toMatchObject({
        stage: stage === "betweenRooms" ? "room" : "rules",
        finishedRoomCount,
      });
    },
    60_000,
  );

  it.each(["missedSoundReplay", "result", "swappedRepeat", "exit"] as const)(
    "a stop report in %s begins no pause",
    async (stage) => {
      const harness = createHarness();
      await stageRows.find((row) => row.stage === stage)!.reach(harness);
      const before = harness.flow.snapshot();
      harness.backend.fire("hidden");
      harness.backend.fire("deviceChanged");
      harness.backend.fire("pageLeft");
      expect(harness.flow.snapshot()).toEqual(before);
    },
    60_000,
  );
});

describe("createVisitFlow: stop and leaving", () => {
  it.each([
    "calibration",
    "headphoneCheck",
    "rules",
    "room",
    "betweenRooms",
  ] as const)(
    "stop in %s silences, cancels every timer of the visit and leaves with nothing kept (R14.1, R14.5, R14.7)",
    async (stage) => {
      const harness = createHarness();
      await stageRows.find((row) => row.stage === stage)!.reach(harness);
      harness.flow.stop();
      expect(harness.calls.at(-1)?.name).toBe("stopAll");
      expect(harness.flow.snapshot()).toEqual({
        stage: "exit",
        visitType: null,
        rooms: [],
        finishedRoomCount: 0,
        canProceed: false,
        pause: null,
        activationRefused: false,
        reason: "visitor",
      });
      const callCount = harness.calls.length;
      const scheduledCount = harness.backend.scheduled().length;
      const eventCount = harness.events.length;
      const snapshotCount = harness.snapshots.length;
      harness.advance(600_000);
      await harness.settle();
      expect(harness.calls).toHaveLength(callCount);
      expect(harness.backend.scheduled()).toHaveLength(scheduledCount);
      expect(harness.events).toHaveLength(eventCount);
      expect(harness.snapshots).toHaveLength(snapshotCount);
      expect(harness.timer.pendingCount()).toBe(0);
    },
    60_000,
  );

  it("stop while paused leaves the house too", async () => {
    const harness = createHarness();
    await toRoom(harness);
    harness.flow.pause();
    harness.flow.stop();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "exit",
      reason: "visitor",
      pause: null,
    });
  });

  it.each(["calibration", "room", "betweenRooms"] as const)(
    "a left page in %s leaves with the reason pageLeft (R14.4)",
    async (stage) => {
      const harness = createHarness();
      await stageRows.find((row) => row.stage === stage)!.reach(harness);
      harness.backend.fire("pageLeft");
      expect(harness.flow.snapshot()).toMatchObject({
        stage: "exit",
        reason: "pageLeft",
        visitType: null,
      });
      expect(harness.flow.snapshot()).not.toHaveProperty("visitLog");
      const eventCount = harness.events.length;
      harness.advance(600_000);
      expect(harness.events).toHaveLength(eventCount);
      expect(harness.timer.pendingCount()).toBe(0);
    },
    60_000,
  );

  it("stop in the missed-sound replay silences and shows the result (R14.2)", async () => {
    const harness = createHarness();
    await toMissedSoundReplay(harness);
    harness.flow.stop();
    expect(harness.calls.at(-1)?.name).toBe("stopAll");
    expect(stageOf(harness)).toBe("result");
  }, 60_000);

  it("stop in the swapped repeat silences and shows the result; on the result it silences and stays (R14.3)", async () => {
    const harness = createHarness();
    await toSwappedRepeat(harness);
    expect(stageOf(harness)).toBe("swappedRepeat");
    harness.flow.stop();
    expect(harness.calls.at(-1)?.name).toBe("stopAll");
    expect(stageOf(harness)).toBe("result");
    harness.flow.stop();
    expect(harness.calls.at(-1)?.name).toBe("stopAll");
    expect(stageOf(harness)).toBe("result");
  }, 60_000);

  it("backToFrontDoor from the exit starts the next visit with a new visit seed and the same shell (R14.6, D2, D14)", async () => {
    const harness = createHarness();
    await toCalibration(harness);
    harness.flow.stop();
    harness.flow.backToFrontDoor();
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "entry",
      visitType: null,
    });
    const result = await toResult(harness);
    const seeds = createSeededRandom(flowSeed);
    const firstSeed = Math.floor(seeds.next() * 2 ** 32);
    const secondSeed = Math.floor(seeds.next() * 2 ** 32);
    expect(result.visitLog.visitSeed).toBe(secondSeed);
    expect(secondSeed).not.toBe(firstSeed);
    expect(harness.backend.contextCount()).toBe(1);
  }, 60_000);

  it("backToFrontDoor from the result shows the front door, from which a new visit starts on the same shell (R14.6)", async () => {
    const harness = createHarness();
    const first = await toResult(harness);
    harness.flow.backToFrontDoor();
    expect(stageOf(harness)).toBe("entry");
    await toCalibration(harness, "full");
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "calibration",
      visitType: "full",
      again: false,
      playedSettingDb: null,
      line: calibrationCopy.openLine,
    });
    harness.flow.keepCalibration();
    expect(stageOf(harness)).toBe("calibration");
    expect(harness.backend.contextCount()).toBe(1);
    expect(first.visitLog.visitType).toBe("quick");
  }, 60_000);
});

describe("createVisitFlow: the replay, the result and the swapped repeat", () => {
  it("shows the result with a summary equal to summarizeVisit of its log (R16.3, R18.5)", async () => {
    const harness = createHarness();
    const result = await toResult(harness, unevenListener);
    expect(result.summary).toEqual(summarizeVisit(result.visitLog));
    expect(result.visitLog.trials.length).toBeGreaterThan(0);
    expect(result.visitLog.roomAttempts).toHaveLength(3);
    expect(result.canProceed).toBe(false);
  }, 60_000);

  it("opens the swapped repeat only for a floor that offers it, and proceed returns to the result (R16.4, R16.5)", async () => {
    const harness = createHarness();
    const result = await toResult(harness, unevenListener);
    const notOffered = result.summary.rooms.findIndex(
      (room) => !room.swappedRepeatOffered,
    );
    if (notOffered >= 0) {
      harness.flow.chooseSwappedRepeat(notOffered);
      expect(stageOf(harness)).toBe("result");
    }
    harness.flow.chooseSwappedRepeat(99);
    harness.flow.chooseSwappedRepeat(0.5);
    expect(stageOf(harness)).toBe("result");
    const offered = result.summary.rooms.findIndex(
      (room) => room.swappedRepeatOffered,
    );
    harness.flow.chooseSwappedRepeat(offered);
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "swappedRepeat",
      room: result.summary.rooms[offered]!.room,
      visitLog: result.visitLog,
      summary: result.summary,
      canProceed: true,
    });
    harness.flow.proceed();
    expect(harness.flow.snapshot()).toEqual(result);
  }, 60_000);
});

describe("createVisitFlow: notifications", () => {
  it("hands out the events of a change before the snapshot listeners of the same change (R11.5)", async () => {
    const harness = createHarness();
    const order: string[] = [];
    harness.flow.onEvent((event) => order.push(`event ${event.kind}`));
    harness.flow.subscribe((snapshot) =>
      order.push(`snapshot ${snapshot.stage}`),
    );
    await toRoom(harness);
    expect(order.slice(-2)).toEqual(["event roomStarted", "snapshot room"]);
    playRoom(harness, stepListener());
    expect(order.slice(-3)).toEqual([
      "event trialScored",
      "event roomFinished",
      "snapshot betweenRooms",
    ]);
  }, 60_000);

  it("notifies nobody of a decision that changes nothing in the snapshot (R11.3, R11.4)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    const snapshotCount = harness.snapshots.length;
    const before = harness.flow.snapshot();
    playRoom(
      harness,
      stepListener(),
      () =>
        harness.events.filter((event) => event.kind === "trialScored").length >=
        8,
    );
    expect(harness.snapshots).toHaveLength(snapshotCount);
    expect(harness.flow.snapshot()).toBe(before);
  }, 60_000);

  it("calls every snapshot listener when one throws, throws its error afterwards, and keeps its state (R11.7)", async () => {
    const harness = createHarness();
    const heard: string[] = [];
    const endThrowing = harness.flow.subscribe(() => {
      throw new Error("snapshot listener");
    });
    harness.flow.subscribe((snapshot) => heard.push(snapshot.stage));
    expect(() => harness.flow.chooseVisit("quick")).toThrow(
      "snapshot listener",
    );
    expect(heard).toEqual(["calibration"]);
    expect(stageOf(harness)).toBe("calibration");
    endThrowing();
    await harness.settle();
    await calibrate(harness);
    expect(stageOf(harness)).toBe("headphoneCheck");
  });

  it("calls every event and snapshot listener when an event listener throws, then throws the first error (R11.7)", async () => {
    const harness = createHarness();
    await toRules(harness);
    const heard: string[] = [];
    harness.flow.onEvent(() => {
      throw new Error("first");
    });
    harness.flow.onEvent((event) => heard.push(event.kind));
    harness.flow.subscribe(() => {
      throw new Error("second");
    });
    harness.flow.subscribe((snapshot) => heard.push(snapshot.stage));
    expect(() => harness.flow.proceed()).toThrow("first");
    expect(heard).toEqual(["roomStarted", "room"]);
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "room",
      pause: null,
    });
    expect(() => harness.flow.pause()).toThrow("second");
    expect(heard.at(-1)).toBe("room");
    expect(harness.flow.snapshot().pause).toEqual({ reason: "visitor" });
  });

  it("stops calling a listener once its subscription ends", async () => {
    const harness = createHarness();
    const heard: VisitSnapshot[] = [];
    const end = harness.flow.subscribe((snapshot) => heard.push(snapshot));
    end();
    await toCalibration(harness);
    expect(heard).toEqual([]);
    expect(harness.snapshots.length).toBeGreaterThan(0);
  });
});

describe("createVisitFlow: devices that cannot carry the house", () => {
  it("shows unsupported when activate finds the sample rate too low, and accepts nothing more (R15.1, R15.2)", async () => {
    const harness = createHarness({ backend: { sampleRateHz: 8000 } });
    await toCalibration(harness);
    expect(harness.flow.snapshot()).toEqual({
      stage: "unsupported",
      visitType: null,
      rooms: [],
      finishedRoomCount: 0,
      canProceed: false,
      pause: null,
      activationRefused: false,
      reason: "sampleRateTooLow",
      sampleRateHz: 8000,
    });
    for (const action of Object.values(actions)) {
      action(harness.flow);
    }
    await harness.settle();
    expect(stageOf(harness)).toBe("unsupported");
  });

  it("shows unsupported without a sample rate when there is no Web Audio", async () => {
    const harness = createHarness({ backend: { hasWebAudio: false } });
    await toCalibration(harness);
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "unsupported",
      reason: "noWebAudio",
      sampleRateHz: null,
    });
  });

  it("shows unsupported when a later start finds a mono output", async () => {
    let channels = 2;
    const harness = createHarness({
      wrapBackend: (backend) => ({
        ...backend,
        outputChannelCountMax: () =>
          backend.contextState() === "none" ? 0 : channels,
      }),
    });
    await toCalibration(harness);
    harness.flow.stop();
    harness.flow.backToFrontDoor();
    channels = 1;
    await toCalibration(harness);
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "unsupported",
      reason: "monoOutput",
      sampleRateHz,
    });
  });

  it("shows unsupported when the shell reports it in a room, and plays nothing more", async () => {
    const harness = createHarness();
    await toRoom(harness);
    const playCount = harness.calls.filter(
      (call) => call.name === "play",
    ).length;
    harness.fireUnsupported({ reason: "monoOutput", sampleRateHz });
    expect(harness.flow.snapshot()).toMatchObject({
      stage: "unsupported",
      reason: "monoOutput",
      sampleRateHz,
    });
    harness.advance(60_000);
    expect(harness.calls.filter((call) => call.name === "play")).toHaveLength(
      playCount,
    );
    expect(harness.timer.pendingCount()).toBe(0);
  });
});

describe("createVisitFlow: the response window", () => {
  it("decides a trial at the first answer in its window and logs the time to answer (R7.6, R10.4)", async () => {
    const harness = createHarness();
    await toRoom(harness);
    playRoom(
      harness,
      () => null,
      () => harness.presented.length > 0,
    );
    const trial = harness.presented[0]!;
    harness.advanceTo(trial.windowStartMs + 250);
    harness.flow.answer("left", trial.windowStartMs + 200);
    const event = harness.events.at(-1)!;
    expect(event.kind).toBe("trialScored");
    if (event.kind === "trialScored") {
      expect(event.trial).toMatchObject({
        status: "scored",
        response: "left",
        responseTimeMs: 200,
      });
      expect(event.trial.answeredAtMs! - event.trial.windowStartMs).toBe(200);
      expect(event.trial.responseTimeMs!).toBeLessThan(responseWindowMs);
    }
  });
});

describe("createVisitFlow: the missed-sound replay before it plays (missed-sound-replay R1.5)", () => {
  it("gives a replay view that cannot start, and startReplay plays nothing", async () => {
    const harness = createHarness();
    await toMissedSoundReplay(harness);
    const before = harness.flow.snapshot();
    if (before.stage !== "missedSoundReplay") {
      throw new Error(`Expected the replay, but the stage is ${before.stage}.`);
    }
    expect(before.replay).toMatchObject({
      phase: "announcing",
      canStart: false,
    });
    const callCount = harness.calls.length;
    const scheduleCount = harness.backend.scheduled().length;
    harness.flow.startReplay();
    await harness.settle();
    harness.advance(10_000);
    expect(harness.calls.length).toBe(callCount);
    expect(harness.backend.scheduled().length).toBe(scheduleCount);
    expect(harness.flow.snapshot()).toEqual(before);
  }, 60_000);
});

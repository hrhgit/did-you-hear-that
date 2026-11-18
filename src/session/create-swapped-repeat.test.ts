import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { ghostSoundConfig } from "../config/ghost-sound-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createManualTimer } from "../config/manual-timer";
import type { RandomSource } from "../config/seeded-random";
import { createSeededRandom } from "../config/seeded-random";
import { ghostSoundIds } from "../config/sound-id";
import { soundRulesConfig } from "../config/sound-rules-config";
import type { Timer, TimerHandle } from "../config/timer";
import { visitFlowConfig } from "../config/visit-flow-config";
import { roomCopy } from "../copy/room-copy";
import { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import { swappedCaughtLine } from "../copy/swapped-repeat-lines";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRefusal,
  PlayRequest,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import type { StopReason } from "../audio/output/output-types";
import { createThresholdSearch } from "../engine/threshold-search";
import type {
  FlowPresentedTrial,
  SwappedRepeatController,
} from "./create-swapped-repeat";
import { createSwappedRepeat } from "./create-swapped-repeat";
import { earpieceOnEar } from "./earpiece-on-ear";
import { roomSearchCapDb } from "./room-search-cap";
import { roomSearchFloorDb } from "./room-search-floor";
import { summarizeVisit } from "./summarize-visit";
import type {
  Ear,
  SwappedRepeat,
  SwappedRepeatPhase,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
  SwappedTrialScoredEvent,
  VisitLog,
  VisitSummary,
} from "./visit-flow-types";
import { createVisitLogRecorder } from "./visit-log-recorder";
import { visitRooms } from "./visit-rooms";

// The Repeat_Controller on the fake audio backend, a calibrated output shell and the manual timer,
// as room-runner.test.ts builds them (swapped-repeat design.md, "The Repeat_Controller"). A
// scripted layer over the shell refuses chosen sounds and can hide the calibration. The visit log
// is built by hand at the result, with the shell's own calibration, so that the floor's first run
// has the cap the shell gives now.

const { calibrationSettingKeepMinDb } = audioOutputConfig;
const { refusedPlaysInARowMaxCount } = visitFlowConfig;
const hissDurationMs = ghostSoundConfig.calibration.durationMs;

/** The timer's clock is this far ahead of the audio clock. */
const pageAheadMs = 5000;
/** The output delay the fake backend's timestamp pair reports. */
const outputDelayMs = 30;
/** The visit begins when the timer starts. */
const visitStartMs = pageAheadMs;
const rooms = visitRooms("quick");
/** The floor that is repeated: the stairs, 4 kHz, 20 dB quieter on the left. */
const floorIndex = 1;
const floor = rooms[floorIndex]!;
const swapped = earpieceOnEar("swapped");

/**
 * A step listener's true thresholds, by ear: the first run's levels. Both lie above the Search_Floor
 * at the Keep_Minimum (audible-start R12.5).
 */
const thresholdsDb: Readonly<Record<Ear, number>> = { left: -25, right: -5 };

/** As room-runner.test.ts: a shell on the fake backend, running and calibrated. */
async function calibratedShell() {
  const backend = createFakeAudioBackend({
    sampleRateHz: soundRulesConfig.sampleRateMinHz,
    performanceOffsetMs: pageAheadMs + outputDelayMs,
  });
  const timer = createManualTimer({ startMs: pageAheadMs });
  const output = createAudioOutput({ backend, timer });
  const random = createSeededRandom(11);
  const advance = (durationMs: number): void => {
    for (let leftMs = durationMs; leftMs > 0; leftMs -= 1) {
      const stepMs = Math.min(1, leftMs);
      backend.advanceClockBy(stepMs);
      timer.advanceBy(stepMs);
    }
  };
  const activation = await output.activate();
  if (activation.kind !== "running") {
    throw new Error("The shell did not run.");
  }
  output.beginCalibration();
  for (;;) {
    const repeat = output.playCalibrationRepeat({
      requestedSettingDb: calibrationSettingKeepMinDb,
      random,
    });
    if (repeat.kind !== "scheduled") {
      throw new Error(`A repeat was refused: ${repeat.reason}.`);
    }
    advance(Math.ceil(repeat.endMs - backend.currentTimeMs()));
    if (repeat.settingDb === calibrationSettingKeepMinDb) {
      break;
    }
  }
  if (output.keepCalibration().kind !== "kept") {
    throw new Error("The calibration was not kept.");
  }
  output.beginRoom();
  advance(10_000);
  return { backend, timer, output, advance };
}

type Shell = Awaited<ReturnType<typeof calibratedShell>>;

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};
const found = (thresholdDb: number) =>
  ({ ...counts, state: "found", thresholdDb }) as const;

/** The cap the shell's calibration gives the floor's room. */
function shellCapDb(shell: Shell): number {
  const report = shell.output.rangeReport();
  if (report === null) {
    throw new Error("The shell holds no calibration.");
  }
  return roomSearchCapDb(
    report.rooms[floor.roomId].topLevelDb,
    hearingMethodConfig,
  );
}

/** A quick visit at the result, kept with the shell's calibration; the floor offers the repeat. */
function visitAtResult(
  shell: Shell,
  floorCapDb: number,
): { readonly log: VisitLog; readonly summary: VisitSummary } {
  const report = shell.output.rangeReport();
  if (report === null) {
    throw new Error("The shell holds no calibration.");
  }
  const recorder = createVisitLogRecorder({
    visitType: "quick",
    visitSeed: 7,
    rooms,
    startedAtMs: visitStartMs,
  });
  recorder.calibrationKept({
    settingDb: calibrationSettingKeepMinDb,
    roomTopLevelDb: Object.fromEntries(
      ghostSoundIds.map((id) => [id, report.rooms[id].topLevelDb]),
    ) as Record<(typeof ghostSoundIds)[number], number>,
    roomFloorLevelDb: Object.fromEntries(
      ghostSoundIds.map((id) => [id, report.rooms[id].floorLevelDb]),
    ) as Record<(typeof ghostSoundIds)[number], number>,
    keptAtMs: visitStartMs + 1000,
  });
  rooms.forEach((room, roomIndex) => {
    const searchCapDb =
      roomIndex === floorIndex
        ? floorCapDb
        : roomSearchCapDb(
            report.rooms[room.roomId].topLevelDb,
            hearingMethodConfig,
          );
    const attempt = recorder.attemptStarted({
      roomIndex,
      engineSeed: 100 + roomIndex,
      calibrationIndex: 0,
      searchCapDb,
      // The first run's Search_Floor, which the repeat must use (audible-start R12.7).
      searchFloorDb: roomSearchFloorDb(
        report.rooms[room.roomId].floorLevelDb,
        hearingMethodConfig,
      ),
      startedAtMs: visitStartMs + 2000 + roomIndex * 1000,
    });
    recorder.attemptEnded({
      roomIndex,
      attempt,
      endedAtMs: visitStartMs + 2500 + roomIndex * 1000,
      ending: "finished",
      result: {
        left: found(roomIndex === floorIndex ? thresholdsDb.left : -30),
        right: found(roomIndex === floorIndex ? thresholdsDb.right : -30),
        noSoundTrialCount: 2,
        falseAlarmCount: 0,
        falseAlarmRateFraction: 0,
        falseAlarmRateAboveLimit: false,
      },
    });
  });
  const log = recorder.log();
  return { log, summary: summarizeVisit(log) };
}

/** What the scripted layer over the shell does. */
interface OutputScript {
  /** Refusals for the next presses of the check, in order; then the shell plays. */
  readonly check: PlayRefusal[];
  /** Refusals for the next trial sounds, in order; then the shell plays. */
  readonly play: PlayRefusal[];
  /** While true, `rangeReport` gives null, as after a device change. */
  calibrationHidden: boolean;
}

const refused = (reason: PlayRefusal): PlayOutcome =>
  Object.freeze({ kind: "refused", reason });

async function rigOf(
  options: {
    readonly unavailable?: SwappedRepeatUnavailableReason | null;
    readonly runNumber?: number;
    readonly floorCapOffsetDb?: number;
  } = {},
) {
  const shell = await calibratedShell();
  const { log, summary } = visitAtResult(
    shell,
    shellCapDb(shell) + (options.floorCapOffsetDb ?? 0),
  );
  const logBefore: unknown = structuredClone(log);
  const script: OutputScript = {
    check: [],
    play: [],
    calibrationHidden: false,
  };
  const calls: string[] = [];
  const plays: PlayRequest[] = [];
  const checkRandoms: RandomSource[] = [];
  const output: AudioOutput = {
    ...shell.output,
    beginRoom() {
      calls.push("beginRoom");
      shell.output.beginRoom();
    },
    stopAll() {
      calls.push("stopAll");
      shell.output.stopAll();
    },
    rangeReport() {
      return script.calibrationHidden ? null : shell.output.rangeReport();
    },
    playHeadphoneCheck(random) {
      calls.push("playHeadphoneCheck");
      checkRandoms.push(random);
      const scripted = script.check.shift();
      return scripted === undefined
        ? shell.output.playHeadphoneCheck(random)
        : refused(scripted);
    },
    play(request) {
      calls.push("play");
      plays.push(request);
      const scripted = script.play.shift();
      return scripted === undefined
        ? shell.output.play(request)
        : refused(scripted);
    },
  };
  // A timer that keeps the controller's own handles, so a test can see what it left pending.
  const handles = new Set<TimerHandle>();
  const timer: Timer = {
    now: () => shell.timer.now(),
    setTimeout(callback, delayMs) {
      const handle = shell.timer.setTimeout(() => {
        handles.delete(handle);
        callback();
      }, delayMs);
      handles.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      handles.delete(handle);
      shell.timer.clearTimeout(handle);
    },
  };
  const soundRandom = createSeededRandom(5);
  const drawEngineSeed = vi.fn(() => 424_242);
  const events: SwappedTrialScoredEvent[] = [];
  const notRunning: StopReason[] = [];
  const records: SwappedRepeatRun[] = [];
  const presented: FlowPresentedTrial[] = [];
  const runNumber = options.runNumber ?? 1;
  const controller: SwappedRepeatController = createSwappedRepeat({
    output,
    timer,
    log,
    summary,
    roomIndex: floorIndex,
    runNumber,
    visitStartedAtMs: visitStartMs,
    unavailable: options.unavailable ?? null,
    soundRandom,
    drawEngineSeed,
    latestOffset: { latestOffsetMs: 0 },
    emit: (event) => events.push(event),
    notRunning: (reason) => notRunning.push(reason),
    recorded: (run) => records.push(run),
    onTrialPresented: (trial) => presented.push(trial),
  });

  const view = (
    pauseReason: "visitor" | "hidden" | "interrupted" | null = null,
  ): SwappedRepeat => controller.view({ earpieces: "unknown", pauseReason });
  const viewIn = <P extends SwappedRepeatPhase>(
    phase: P,
  ): Extract<SwappedRepeat, { phase: P }> => {
    const current = view();
    expect(current.phase).toBe(phase);
    return current as Extract<SwappedRepeat, { phase: P }>;
  };
  const advance = (durationMs: number): void => shell.advance(durationMs);
  const advanceTo = (atMs: number): void =>
    advance(Math.max(0, Math.ceil(atMs - shell.timer.now())));
  const scheduledCount = (): number => shell.backend.scheduled().length;

  /** Plays a check, lets the hiss end, and answers it. */
  const answeredCheck = (
    answer: "left" | "right" | "bothSides" | "nothingHeard",
  ) => {
    controller.playCheck();
    advance(hissDurationMs + 200);
    return controller.answerCheck(answer);
  };
  /** From `instruction` to `ready`. */
  const toReady = (): void => {
    controller.confirmSwap();
    answeredCheck("right");
    expect(controller.phase()).toBe("ready");
  };
  /** From `instruction` to `room`. */
  const toRoom = (): void => {
    toReady();
    controller.startRoom();
    expect(controller.phase()).toBe("room");
  };
  /** Advances until the next trial is presented, or the room is over. */
  const nextTrial = (): FlowPresentedTrial | null => {
    const before = presented.length;
    for (let waitedMs = 0; waitedMs < 20_000; waitedMs += 1) {
      if (presented.length > before) {
        return presented[presented.length - 1]!;
      }
      if (controller.phase() !== "room") {
        return null;
      }
      advance(1);
    }
    throw new Error("No trial was presented within 20 s.");
  };
  /** Answers one presented trial as a step listener: the ear, at the window's start, when it is loud enough. */
  const hear = (trial: FlowPresentedTrial): void => {
    if (
      trial.kind === "sound" &&
      trial.ear !== null &&
      trial.levelDb !== null &&
      trial.levelDb >= thresholdsDb[trial.ear]
    ) {
      advanceTo(trial.windowStartMs);
      controller.answer(trial.ear);
      return;
    }
    advanceTo(trial.windowEndMs);
  };
  /** Plays the room to its end with the step listener. */
  const playToEnd = (): void => {
    for (let count = 0; count < 200; count += 1) {
      const trial = nextTrial();
      if (trial === null) {
        return;
      }
      hear(trial);
    }
    throw new Error("The room did not end within 200 trials.");
  };

  return {
    shell,
    log,
    logBefore,
    summary,
    script,
    calls,
    plays,
    checkRandoms,
    handles,
    soundRandom,
    drawEngineSeed,
    events,
    notRunning,
    records,
    presented,
    runNumber,
    controller,
    view,
    viewIn,
    advance,
    advanceTo,
    scheduledCount,
    answeredCheck,
    toReady,
    toRoom,
    nextTrial,
    hear,
    playToEnd,
  };
}

type Rig = Awaited<ReturnType<typeof rigOf>>;

/** Whether a schedule call fills exactly this channel, with exact zeros on the other. */
function fillsOnly(
  call: { readonly left: Float32Array; readonly right: Float32Array },
  channel: Ear,
): boolean {
  const other = channel === "left" ? call.right : call.left;
  return (
    call[channel].some((sample) => sample !== 0) &&
    other.every((sample) => Object.is(sample, 0))
  );
}

/** Tries every action of the controller that is not the one being checked. */
function everyPress(rig: Rig): void {
  rig.controller.confirmSwap();
  rig.controller.playCheck();
  rig.controller.answerCheck("right");
  rig.controller.startRoom();
  rig.controller.answer("left");
}

describe("createSwappedRepeat: the first phase", () => {
  it("opens in instruction when the floor's calibration is there, and plays nothing", async () => {
    const rig = await rigOf();
    expect(rig.controller.phase()).toBe("instruction");
    expect(rig.viewIn("instruction").lines).toEqual(
      swappedRepeatCopy.instructionLines,
    );
    expect(rig.calls).toEqual([]);
    expect(rig.controller.mayBeSounding()).toBe(false);
  });

  it.each(["calibrationGone", "calibrationChanged"] as const)(
    "opens in unavailable with %s, and nothing there plays or moves on",
    async (reason) => {
      const rig = await rigOf({ unavailable: reason });
      const before = rig.scheduledCount();
      expect(rig.controller.phase()).toBe("unavailable");
      expect(rig.viewIn("unavailable").reason).toBe(reason);
      everyPress(rig);
      expect(rig.controller.pause("visitor")).toBe(false);
      rig.controller.resume();
      rig.controller.checkCut();
      rig.advance(5000);
      expect(rig.controller.phase()).toBe("unavailable");
      expect(rig.calls).toEqual([]);
      expect(rig.scheduledCount()).toBe(before);
      expect(rig.drawEngineSeed).not.toHaveBeenCalled();
    },
  );
});

describe("createSwappedRepeat: the instruction", () => {
  it("moves on with confirmSwap only from instruction, playing nothing", async () => {
    const rig = await rigOf();
    rig.controller.playCheck();
    rig.controller.answerCheck("right");
    rig.controller.startRoom();
    expect(rig.controller.phase()).toBe("instruction");
    expect(rig.calls).toEqual([]);
    rig.controller.confirmSwap();
    expect(rig.controller.phase()).toBe("check");
    expect(rig.calls).toEqual([]);
    const before = rig.scheduledCount();
    rig.controller.confirmSwap();
    rig.advance(1000);
    expect(rig.controller.phase()).toBe("check");
    expect(rig.scheduledCount()).toBe(before);
  });
});

describe("createSwappedRepeat: the swap check", () => {
  it("plays the check only in check, with playHeadphoneCheck, the given random source and the left earpiece", async () => {
    const rig = await rigOf();
    rig.controller.playCheck();
    expect(rig.calls).toEqual([]);
    rig.controller.confirmSwap();
    const before = rig.scheduledCount();
    rig.controller.playCheck();
    expect(rig.calls).toEqual(["playHeadphoneCheck"]);
    expect(rig.checkRandoms).toEqual([rig.soundRandom]);
    const scheduled = rig.shell.backend.scheduled();
    expect(scheduled).toHaveLength(before + 1);
    expect(fillsOnly(scheduled[scheduled.length - 1]!, "left")).toBe(true);
    expect(rig.viewIn("check").awaitingAnswer).toBe(true);
    rig.advance(hissDurationMs + 200);
    rig.controller.answerCheck("right");
    rig.controller.playCheck();
    expect(rig.calls).toEqual(["playHeadphoneCheck"]);
  });

  it("passes a check refused notRunning to the callback as interrupted while the shell runs", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.script.check.push("notRunning");
    rig.controller.playCheck();
    expect(rig.notRunning).toEqual(["interrupted"]);
    expect(rig.viewIn("check").awaitingAnswer).toBe(false);
  });

  it("passes a check refused notRunning to the callback with the shell's own reason", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.shell.backend.fire("hidden");
    rig.controller.playCheck();
    expect(rig.notRunning).toEqual(["hidden"]);
  });

  it("shows unavailable with calibrationGone for a check refused notCalibrated", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.script.check.push("notCalibrated");
    rig.controller.playCheck();
    expect(rig.viewIn("unavailable").reason).toBe("calibrationGone");
    expect(rig.notRunning).toEqual([]);
  });

  it.each(["busy", "peakBoundNotMet", "emptyBuffer", "unsupported"] as const)(
    "gives a check refused %s as playRefusal, counts nothing, and plays it on a later press",
    async (reason) => {
      const rig = await rigOf();
      rig.controller.confirmSwap();
      rig.script.check.push(reason);
      rig.controller.playCheck();
      const view = rig.viewIn("check");
      expect(view.playRefusal).toBe(reason);
      expect(view.playRefusalLine).toBe(swappedRepeatCopy.playRefusedLine);
      expect(view.awaitingAnswer).toBe(false);
      expect(rig.controller.answerCheck("right")).toBeNull();
      expect(rig.controller.phase()).toBe("check");
      rig.controller.playCheck();
      expect(rig.viewIn("check")).toMatchObject({
        awaitingAnswer: true,
        playRefusal: null,
        playRefusalLine: null,
      });
      rig.advance(hissDurationMs + 200);
      expect(rig.controller.answerCheck("right")).toBe("confirmed");
      rig.controller.startRoom();
      rig.playToEnd();
      expect(rig.records[0]?.swapChecks).toHaveLength(1);
    },
  );

  it("ignores an answer before a check has been played and after it was answered", async () => {
    const rig = await rigOf();
    expect(rig.controller.answerCheck("right")).toBeNull();
    rig.controller.confirmSwap();
    expect(rig.controller.answerCheck("right")).toBeNull();
    expect(rig.controller.phase()).toBe("check");
    expect(rig.answeredCheck("bothSides")).toBe("bothSides");
    expect(rig.controller.answerCheck("right")).toBeNull();
    expect(rig.controller.phase()).toBe("check");
  });

  it("ignores an answer that is not one of the four", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.controller.playCheck();
    expect(rig.controller.answerCheck("up" as unknown as "left")).toBeNull();
    expect(rig.viewIn("check").awaitingAnswer).toBe(true);
  });

  it("goes to ready on an answer on the right", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    expect(rig.answeredCheck("right")).toBe("confirmed");
    expect(rig.viewIn("ready").judgementLine).toBe(
      swappedRepeatCopy.judgementLines.confirmed,
    );
  });

  it("goes back to the instruction, with the line that asks again, on an answer on the left", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    expect(rig.answeredCheck("left")).toBe("notSwapped");
    expect(rig.viewIn("instruction").againLine).toBe(
      swappedRepeatCopy.againLine,
    );
    rig.controller.confirmSwap();
    expect(rig.viewIn("check").judgementLine).toBeNull();
  });

  it.each([
    ["bothSides", "bothSides"],
    ["nothingHeard", "notHeard"],
  ] as const)(
    "stays in check with the judgement's line on the answer %s",
    async (answer, judgement) => {
      const rig = await rigOf();
      rig.controller.confirmSwap();
      expect(rig.answeredCheck(answer)).toBe(judgement);
      const view = rig.viewIn("check");
      expect(view.judgement).toBe(judgement);
      expect(view.judgementLine).toBe(
        swappedRepeatCopy.judgementLines[judgement],
      );
      expect(view.awaitingAnswer).toBe(false);
      rig.controller.playCheck();
      expect(rig.viewIn("check").judgement).toBeNull();
    },
  );

  it("sets a waiting check back on a cut: the answer is ignored and the cut line given", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.controller.checkCut();
    expect(rig.viewIn("check").cutLine).toBeNull();
    rig.controller.playCheck();
    rig.shell.backend.fire("interrupted");
    rig.controller.checkCut();
    const view = rig.viewIn("check");
    expect(view.awaitingAnswer).toBe(false);
    expect(view.cutLine).toBe(swappedRepeatCopy.cutLine);
    expect(rig.controller.answerCheck("right")).toBeNull();
    expect(rig.controller.mayBeSounding()).toBe(false);
  });

  it("records every answered check, with its earpiece and its time on the visit log's clock", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.answeredCheck("nothingHeard");
    const firstAtMs = rig.shell.timer.now() - visitStartMs;
    rig.answeredCheck("left");
    const secondAtMs = rig.shell.timer.now() - visitStartMs;
    rig.controller.confirmSwap();
    rig.answeredCheck("right");
    const thirdAtMs = rig.shell.timer.now() - visitStartMs;
    rig.controller.startRoom();
    rig.playToEnd();
    expect(rig.records[0]?.swapChecks).toEqual([
      {
        answer: "nothingHeard",
        judgement: "notHeard",
        earpiece: "left",
        answeredAtMs: firstAtMs,
      },
      {
        answer: "left",
        judgement: "notSwapped",
        earpiece: "left",
        answeredAtMs: secondAtMs,
      },
      {
        answer: "right",
        judgement: "confirmed",
        earpiece: "left",
        answeredAtMs: thirdAtMs,
      },
    ]);
  });
});

describe("createSwappedRepeat: starting the room", () => {
  it("starts the room only in ready", async () => {
    const rig = await rigOf();
    rig.controller.startRoom();
    rig.controller.confirmSwap();
    rig.controller.startRoom();
    expect(rig.controller.phase()).toBe("check");
    expect(rig.calls).not.toContain("beginRoom");
    expect(rig.drawEngineSeed).not.toHaveBeenCalled();
    rig.answeredCheck("right");
    rig.controller.startRoom();
    expect(rig.controller.phase()).toBe("room");
    expect(rig.drawEngineSeed).toHaveBeenCalledTimes(1);
    rig.controller.startRoom();
    expect(rig.drawEngineSeed).toHaveBeenCalledTimes(1);
  });

  it("calls beginRoom after the last check and before the first trial", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.nextTrial();
    const lastCheck = rig.calls.lastIndexOf("playHeadphoneCheck");
    const begin = rig.calls.indexOf("beginRoom");
    expect(lastCheck).toBeGreaterThanOrEqual(0);
    expect(begin).toBeGreaterThan(lastCheck);
    const firstPlay = rig.calls.indexOf("play");
    if (firstPlay >= 0) {
      expect(firstPlay).toBeGreaterThan(begin);
    }
  });

  it("plays the first sound trial in the earpiece that sits on its ear after a swap", async () => {
    const rig = await rigOf();
    rig.toRoom();
    let trial = rig.nextTrial();
    while (trial !== null && trial.kind !== "sound") {
      rig.hear(trial);
      trial = rig.nextTrial();
    }
    expect(trial).not.toBeNull();
    const ear = trial!.ear!;
    expect(trial!.earpiece).toBe(swapped[ear]);
    // The request reaches the shell for the earpiece, not the ear.
    expect(rig.plays.at(-1)).toMatchObject({
      soundId: floor.roomId,
      ear: swapped[ear],
      levelDb: trial!.levelDb,
      purpose: "trial",
    });
    const scheduled = rig.shell.backend.scheduled();
    expect(fillsOnly(scheduled[scheduled.length - 1]!, swapped[ear])).toBe(
      true,
    );
  });

  it("gives the hook every presented trial with its earpiece and the run number", async () => {
    const rig = await rigOf({ runNumber: 3 });
    rig.toRoom();
    rig.playToEnd();
    expect(rig.presented.length).toBeGreaterThan(0);
    for (const trial of rig.presented) {
      expect(trial.swappedRepeatRunNumber).toBe(3);
      expect(trial.earpiece).toBe(
        trial.ear === null ? null : swapped[trial.ear],
      );
      expect(Object.isFrozen(trial)).toBe(true);
    }
  });

  it("shows unavailable with calibrationGone when the calibration is gone as the room would start", async () => {
    const rig = await rigOf();
    rig.toReady();
    rig.script.calibrationHidden = true;
    rig.controller.startRoom();
    expect(rig.viewIn("unavailable").reason).toBe("calibrationGone");
    expect(rig.drawEngineSeed).not.toHaveBeenCalled();
  });

  it("throws an Error naming both caps when the room's cap differs from the first run's", async () => {
    const rig = await rigOf({ floorCapOffsetDb: -5 });
    const shellCap = shellCapDb(rig.shell);
    rig.toReady();
    expect(() => rig.controller.startRoom()).toThrow(
      new Error(
        `The repeat's search cap ${String(shellCap)} dB differs from the first run's ${String(shellCap - 5)} dB.`,
      ),
    );
    expect(rig.drawEngineSeed).not.toHaveBeenCalled();
  });
});

describe("createSwappedRepeat: the room run", () => {
  it("ends the search with recorded and finished, the record holding the first run's cap and calibration and the drawn seed", async () => {
    const rig = await rigOf({ runNumber: 2 });
    rig.toRoom();
    rig.playToEnd();
    expect(rig.controller.phase()).toBe("finished");
    expect(rig.records).toHaveLength(1);
    const record = rig.records[0]!;
    expect(record.runNumber).toBe(2);
    expect(record.roomIndex).toBe(floorIndex);
    expect(record.calibrationIndex).toBe(0);
    expect(record.attempt).toMatchObject({
      roomIndex: floorIndex,
      attempt: 1,
      engineSeed: 424_242,
      calibrationIndex: 0,
      searchCapDb: rig.summary.rooms[floorIndex]!.searchCapDb,
      ending: "finished",
    });
    expect(record.earpieceOnEar).toEqual({ left: "right", right: "left" });
    expect(record.left).toMatchObject({
      state: "found",
      thresholdDb: thresholdsDb.left,
    });
    expect(record.right).toMatchObject({
      state: "found",
      thresholdDb: thresholdsDb.right,
    });
    expect(record.outcome).toBe("followsEar");
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
    const view = rig.viewIn("finished");
    expect(view.ending).toBe("finished");
    expect(view.endLine).toBe(swappedRepeatCopy.endLines.finished);
    expect(view.comparison?.runNumber).toBe(2);
    expect(view.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
  });

  it("runs the search as every room's: the record's answers replay it from its cap and seed", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.playToEnd();
    const record = rig.records[0]!;
    const search = createThresholdSearch({
      settings: {
        ...hearingMethodConfig,
        capRelativeToAnchorDb: record.attempt.searchCapDb,
        floorDb: record.attempt.searchFloorDb ?? hearingMethodConfig.floorDb,
      },
      random: createSeededRandom(record.attempt.engineSeed),
    });
    const scored = record.trials.filter((trial) => trial.status === "scored");
    let step = search.current();
    for (const trial of scored) {
      expect(step.kind).toBe("trial");
      if (step.kind !== "trial" || trial.status !== "scored") {
        return;
      }
      expect(step.trial.kind).toBe(trial.kind);
      expect(step.trial.trialNumber).toBe(trial.trialNumber);
      expect(step.trial.gapBeforeMs).toBe(trial.gapBeforeMs);
      if (step.trial.kind === "sound" && trial.kind === "sound") {
        expect(step.trial.ear).toBe(trial.ear);
        expect(step.trial.levelDb).toBe(trial.requestedLevelDb);
      }
      step = search.respond(trial.response);
    }
    expect(step.kind).toBe("finished");
  });

  it("names both earpieces of every trial and answer in the record", async () => {
    const rig = await rigOf();
    rig.toRoom();
    // An answer outside every window, before the first trial.
    rig.controller.answer("left");
    rig.playToEnd();
    const record = rig.records[0]!;
    for (const trial of record.trials) {
      expect(trial.earpiece).toBe(
        trial.kind === "sound" ? swapped[trial.ear] : null,
      );
      expect(trial.responseEarpiece).toBe(
        trial.status === "scored" && trial.response !== "none"
          ? swapped[trial.response]
          : null,
      );
    }
    expect(record.ignoredAnswers).toEqual([
      expect.objectContaining({ side: "left", earpiece: "right" }),
    ]);
  });

  it("hands out swappedTrialScored for every scored trial, with both earpieces, its reaction and its line", async () => {
    const rig = await rigOf({ runNumber: 2 });
    rig.toRoom();
    rig.playToEnd();
    const record = rig.records[0]!;
    const scored = record.trials.filter((trial) => trial.status === "scored");
    expect(rig.events).toHaveLength(scored.length);
    rig.events.forEach((event, index) => {
      expect(event.kind).toBe("swappedTrialScored");
      expect(event.room).toEqual(floor);
      expect(event.runNumber).toBe(2);
      expect(event.trial.trialNumber).toBe(scored[index]!.trialNumber);
      expect(event.trial.earpiece).toBe(scored[index]!.earpiece);
      expect(event.trial.responseEarpiece).toBe(
        scored[index]!.responseEarpiece,
      );
      const { trial } = event;
      if (trial.kind === "sound" && trial.outcome === "caught") {
        expect(event.reaction).toBe("ripple");
        expect(event.line).toBe(
          swappedCaughtLine(
            trial.ear,
            swapped[trial.ear],
            floor.frequencyHz,
            trial.playedLevelDb,
          ),
        );
      } else {
        expect(event.reaction).toBe("none");
        expect(event.line).toBeNull();
      }
      expect(Object.isFrozen(event)).toBe(true);
    });
    expect(rig.events.some((event) => event.reaction === "ripple")).toBe(true);
  });

  it("gives the no-sound line for an answer on a no-sound trial, and a wrong side the earpiece on the ear named", async () => {
    const rig = await rigOf();
    rig.toRoom();
    let sawNoSound = false;
    let sawWrongSide = false;
    for (
      let count = 0;
      count < 200 && !(sawNoSound && sawWrongSide);
      count += 1
    ) {
      const trial = rig.nextTrial();
      if (trial === null) {
        break;
      }
      rig.advanceTo(trial.windowStartMs);
      if (trial.kind === "noSound" && !sawNoSound) {
        rig.controller.answer("right");
        sawNoSound = true;
      } else if (trial.kind === "sound" && !sawWrongSide) {
        rig.controller.answer(trial.ear === "left" ? "right" : "left");
        sawWrongSide = true;
      } else {
        rig.hear(trial);
      }
    }
    const noSound = rig.events.find((event) => event.trial.kind === "noSound");
    expect(noSound?.reaction).toBe("noSoundLine");
    expect(noSound?.line).toBe(roomCopy.noSoundLine);
    expect(noSound?.trial.responseEarpiece).toBe("left");
    const wrong = rig.events.find(
      (event) =>
        event.trial.kind === "sound" && event.trial.outcome === "wrongSide",
    );
    expect(wrong?.reaction).toBe("none");
    expect(wrong?.line).toBeNull();
    if (wrong !== undefined && wrong.trial.kind === "sound") {
      const named = wrong.trial.ear === "left" ? "right" : "left";
      expect(wrong.trial.responseEarpiece).toBe(swapped[named]);
    }
  });

  it("writes nothing to the visit log, which deep-equals itself before and after", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.playToEnd();
    expect(rig.records).toHaveLength(1);
    expect(rig.log).toEqual(rig.logBefore);
    expect(Object.isFrozen(rig.log)).toBe(true);
  });

  it("keeps the view of the room the same from a trial's presentation to its scoring", async () => {
    const rig = await rigOf();
    rig.toRoom();
    const resting = rig.view();
    for (let count = 0; count < 5; count += 1) {
      const trial = rig.nextTrial();
      if (trial === null) {
        break;
      }
      expect(rig.view()).toEqual(resting);
      rig.advanceTo(trial.windowStartMs);
      expect(rig.view()).toEqual(resting);
      rig.hear(trial);
      expect(rig.view()).toEqual(resting);
    }
  });
});

describe("createSwappedRepeat: pauses", () => {
  it("pauses only in the room, discarding a presented trial and writing the pause to the run's record", async () => {
    const rig = await rigOf();
    expect(rig.controller.pause("visitor")).toBe(false);
    rig.toRoom();
    const trial = rig.nextTrial()!;
    expect(rig.controller.pause("visitor")).toBe(true);
    expect(rig.controller.pause("hidden")).toBe(false);
    expect(rig.handles.size).toBe(0);
    expect(rig.view("visitor")).toMatchObject({
      phase: "room",
      pauseLine: swappedRepeatCopy.pauseLines.visitor,
    });
    // Nothing plays and no answer counts while the pause holds.
    const plays = rig.plays.length;
    rig.controller.answer("left");
    rig.advance(10_000);
    expect(rig.plays).toHaveLength(plays);
    rig.controller.resume();
    const again = rig.nextTrial()!;
    expect(again.trialNumber).toBe(trial.trialNumber);
    rig.hear(again);
    rig.playToEnd();
    const record = rig.records[0]!;
    expect(record.pauses).toEqual([
      expect.objectContaining({
        reason: "visitor",
        stage: "swappedRepeat",
        roomIndex: floorIndex,
      }),
    ]);
    expect(
      record.trials.filter(
        (entry) =>
          entry.status === "discarded" &&
          entry.trialNumber === trial.trialNumber,
      ),
    ).toHaveLength(1);
    expect(record.ignoredAnswers).toEqual([]);
  });

  it("presents the waiting trial again after its own gap on resume", async () => {
    const rig = await rigOf();
    rig.toRoom();
    const trial = rig.nextTrial()!;
    rig.shell.backend.fire("hidden");
    expect(rig.controller.pause("hidden")).toBe(true);
    await rig.shell.output.activate();
    rig.controller.resume();
    const resumedAtMs = rig.shell.timer.now();
    const record = rig.records;
    const again = rig.nextTrial()!;
    expect(again.trialNumber).toBe(trial.trialNumber);
    expect(rig.shell.timer.now() - resumedAtMs).toBeGreaterThanOrEqual(
      hearingMethodConfig.gapBetweenTrialsMinMs,
    );
    expect(record).toEqual([]);
  });

  it("finishes with deviceChanged on resume without a calibration, and gives no record", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.nextTrial();
    rig.controller.pause("interrupted");
    rig.script.calibrationHidden = true;
    rig.controller.resume();
    expect(rig.viewIn("finished")).toMatchObject({
      ending: "deviceChanged",
      endLine: swappedRepeatCopy.endLines.deviceChanged,
      comparison: null,
      turnBackLine: swappedRepeatCopy.turnBackLine,
    });
    expect(rig.handles.size).toBe(0);
    rig.advance(30_000);
    expect(rig.records).toEqual([]);
    expect(rig.events.length).toBe(0);
  });
});

describe("createSwappedRepeat: the calibration gone", () => {
  it.each(["instruction", "check", "ready"] as const)(
    "shows unavailable with calibrationGone in %s",
    async (phase) => {
      const rig = await rigOf();
      if (phase !== "instruction") {
        rig.controller.confirmSwap();
      }
      if (phase === "ready") {
        rig.answeredCheck("right");
      }
      expect(rig.controller.phase()).toBe(phase);
      rig.controller.calibrationGone();
      expect(rig.viewIn("unavailable").reason).toBe("calibrationGone");
      everyPress(rig);
      expect(rig.controller.phase()).toBe("unavailable");
    },
  );

  it("abandons the run in the room, with no record and no timer left, and finishes with deviceChanged", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.nextTrial();
    rig.shell.backend.fire("deviceChanged");
    rig.controller.calibrationGone();
    expect(rig.viewIn("finished").ending).toBe("deviceChanged");
    expect(rig.handles.size).toBe(0);
    const plays = rig.plays.length;
    rig.advance(30_000);
    expect(rig.plays).toHaveLength(plays);
    expect(rig.records).toEqual([]);
    rig.controller.calibrationGone();
    expect(rig.viewIn("finished").ending).toBe("deviceChanged");
  });

  it("closes a pause that holds when the calibration goes in the room", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.nextTrial();
    rig.controller.pause("visitor");
    rig.controller.calibrationGone();
    expect(rig.viewIn("finished").ending).toBe("deviceChanged");
    rig.controller.resume();
    expect(rig.viewIn("finished").ending).toBe("deviceChanged");
  });
});

describe("createSwappedRepeat: refused trial sounds", () => {
  it("records a refusal and presents the same trial again after its own gap", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.script.play.push("busy");
    rig.playToEnd();
    const record = rig.records[0]!;
    expect(record.refusedPlays).toEqual([
      expect.objectContaining({ reason: "busy", roomIndex: floorIndex }),
    ]);
    const refusal = record.refusedPlays[0]!;
    const again = record.trials.find(
      (entry) =>
        entry.trialNumber === refusal.trialNumber && entry.kind === "sound",
    );
    expect(again).toBeDefined();
    expect(again!.presentedAtMs - refusal.atMs).toBe(again!.gapBeforeMs);
  });

  it(`ends with soundRefused after stopAll on ${String(refusedPlaysInARowMaxCount)} refusals in a row, with no record`, async () => {
    const rig = await rigOf();
    rig.toRoom();
    for (let count = 0; count < refusedPlaysInARowMaxCount; count += 1) {
      rig.script.play.push("busy");
    }
    for (let waitedMs = 0; waitedMs < 60_000; waitedMs += 1000) {
      if (rig.controller.phase() !== "room") {
        break;
      }
      const trial = rig.presented.at(-1);
      if (trial !== undefined) {
        rig.advanceTo(trial.windowEndMs);
      }
      rig.advance(1000);
    }
    expect(rig.plays).toHaveLength(refusedPlaysInARowMaxCount);
    expect(rig.calls.at(-1)).toBe("stopAll");
    expect(rig.viewIn("finished")).toMatchObject({
      ending: "soundRefused",
      endLine: swappedRepeatCopy.endLines.soundRefused,
      comparison: null,
    });
    expect(rig.records).toEqual([]);
    expect(rig.handles.size).toBe(0);
  });

  it("passes a trial refused notRunning to the callback with the shell's reason, or interrupted", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.script.play.push("notRunning");
    for (
      let waitedMs = 0;
      waitedMs < 60_000 && rig.notRunning.length === 0;
      waitedMs += 1
    ) {
      const trial = rig.presented.at(-1);
      if (trial !== undefined && rig.shell.timer.now() < trial.windowEndMs) {
        rig.advanceTo(trial.windowEndMs);
      }
      rig.advance(1);
    }
    expect(rig.notRunning).toEqual(["interrupted"]);
    expect(rig.handles.size).toBe(0);
    expect(rig.controller.pause("interrupted")).toBe(true);

    const second = await rigOf();
    second.toRoom();
    second.shell.backend.fire("hidden");
    for (
      let waitedMs = 0;
      waitedMs < 60_000 && second.notRunning.length === 0;
      waitedMs += 1
    ) {
      second.advance(1);
    }
    expect(second.notRunning).toEqual(["hidden"]);
  });

  it("finishes with deviceChanged for a trial refused notCalibrated, with no record", async () => {
    const rig = await rigOf();
    rig.toRoom();
    rig.script.play.push("notCalibrated");
    for (let waitedMs = 0; waitedMs < 60_000; waitedMs += 1) {
      if (rig.controller.phase() !== "room") {
        break;
      }
      const trial = rig.presented.at(-1);
      if (trial !== undefined && rig.shell.timer.now() < trial.windowEndMs) {
        rig.advanceTo(trial.windowEndMs);
      }
      rig.advance(1);
    }
    expect(rig.viewIn("finished").ending).toBe("deviceChanged");
    expect(rig.notRunning).toEqual([]);
    expect(rig.records).toEqual([]);
    expect(rig.handles.size).toBe(0);
  });
});

describe("createSwappedRepeat: leaving and sound under way", () => {
  it.each(["instruction", "check", "ready", "room", "finished"] as const)(
    "leaves from %s with every timer cancelled, no record, and nothing more played",
    async (phase) => {
      const rig = await rigOf();
      if (phase !== "instruction") {
        rig.controller.confirmSwap();
      }
      if (phase === "check") {
        rig.controller.playCheck();
      }
      if (phase === "ready" || phase === "room" || phase === "finished") {
        rig.answeredCheck("right");
      }
      if (phase === "room" || phase === "finished") {
        rig.controller.startRoom();
        rig.nextTrial();
      }
      if (phase === "finished") {
        rig.playToEnd();
      }
      expect(rig.controller.phase()).toBe(phase);
      const recordsBefore = rig.records.length;
      rig.controller.leave();
      expect(rig.handles.size).toBe(0);
      expect(rig.controller.mayBeSounding()).toBe(false);
      const calls = rig.calls.length;
      const events = rig.events.length;
      everyPress(rig);
      rig.controller.resume();
      rig.advance(60_000);
      expect(rig.calls).toHaveLength(calls);
      expect(rig.events).toHaveLength(events);
      expect(rig.records).toHaveLength(recordsBefore);
    },
  );

  it("may be sounding from a scheduled hiss to its end", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    expect(rig.controller.mayBeSounding()).toBe(false);
    rig.controller.playCheck();
    expect(rig.controller.mayBeSounding()).toBe(true);
    rig.advance(hissDurationMs - 100);
    expect(rig.controller.mayBeSounding()).toBe(true);
    rig.advance(400);
    expect(rig.controller.mayBeSounding()).toBe(false);
  });

  it("may be sounding while the room runs and until its last sound ends", async () => {
    const rig = await rigOf();
    rig.toReady();
    expect(rig.controller.mayBeSounding()).toBe(false);
    rig.controller.startRoom();
    expect(rig.controller.mayBeSounding()).toBe(true);
    rig.playToEnd();
    expect(rig.controller.phase()).toBe("finished");
    const last = rig.records[0]!.trials.at(-1)!;
    const lastSoundStillPlays =
      last.kind === "sound" &&
      last.status === "scored" &&
      last.answeredAtMs !== null;
    expect(rig.controller.mayBeSounding()).toBe(lastSoundStillPlays);
    rig.advance(2000);
    expect(rig.controller.mayBeSounding()).toBe(false);
  });

  it("is not sounding after a refused check", async () => {
    const rig = await rigOf();
    rig.controller.confirmSwap();
    rig.script.check.push("busy");
    rig.controller.playCheck();
    expect(rig.controller.mayBeSounding()).toBe(false);
  });
});

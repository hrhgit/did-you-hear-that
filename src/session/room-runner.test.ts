import { describe, expect, it, vi } from "vitest";
import { adaptiveHearingConfig } from "../config/adaptive-hearing-config";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
import type { RandomSource } from "../config/seeded-random";
import { soundRulesConfig } from "../config/sound-rules-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRequest,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import { createThresholdSearch } from "../engine/threshold-search";
import type {
  Ear,
  RoomResult,
  SoundTrial,
  NoSoundTrial,
  ThresholdSearch,
  Trial,
  VisitorResponse,
} from "../engine/search-types";
import type {
  MixedRoomRunnerOptions,
  PresentedTrial,
  RoomRunner,
  RoomRunnerOptions,
  RoomTrack,
} from "./room-runner";
import { createMixedRoomRunner, createRoomRunner } from "./room-runner";
import type { RoomGameOptions } from "./room-runner";
import { roomSearchCapDb } from "./room-search-cap";
import { turnSeedOf } from "./turn-seed";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type { ScoredVisitTrial } from "./visit-flow-types";
import type { VisitRoom } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

/** The three rooms most tests of this file use, as the three-room visit of the earlier spec had them. */
const threeRooms: readonly VisitRoom[] = ["corridor", "stairs", "attic"].map(
  (roomId, roomIndex) => ({
    ...visitRooms("full").find((room) => room.roomId === roomId)!,
    roomIndex,
  }),
);

const { responseWindowMs } = hearingMethodConfig;
const { scheduleLeadMs, calibrationSettingKeepMinDb } = audioOutputConfig;
const { refusedPlaysInARowMaxCount } = visitFlowConfig;

/** The timer's clock is this far ahead of the audio clock. */
const pageAheadMs = 5000;
/** The output delay the fake backend's timestamp pair reports. */
const outputDelayMs = 30;
/** The visit begins when the timer starts. */
const visitStartMs = pageAheadMs;
const room = threeRooms[0]!;

function soundTrial(
  trialNumber: number,
  ear: "left" | "right",
  levelDb: number,
  gapBeforeMs: number,
): SoundTrial {
  return Object.freeze({
    kind: "sound",
    trialNumber,
    ear,
    levelDb,
    direction: "first",
    gapBeforeMs,
  });
}

function noSoundTrial(trialNumber: number, gapBeforeMs: number): NoSoundTrial {
  return Object.freeze({
    kind: "noSound",
    trialNumber,
    phase: "search",
    gapBeforeMs,
  });
}

const counts = {
  presentationCount: 1,
  catchCount: 1,
  wrongSideCount: 0,
  missCount: 0,
};
const scriptedResult: RoomResult = Object.freeze({
  left: { ...counts, state: "found" as const, thresholdDb: -25 },
  right: { ...counts, state: "found" as const, thresholdDb: -25 },
  noSoundTrialCount: 0,
  falseAlarmCount: 0,
  falseAlarmRateFraction: 0,
  falseAlarmRateAboveLimit: false,
  trials: [],
});

/** A search that asks for the given trials in order, whatever the responses, then finishes. */
function scriptedSearch(
  trials: readonly Trial[],
): ThresholdSearch & { readonly responses: VisitorResponse[] } {
  const responses: VisitorResponse[] = [];
  const step = () =>
    responses.length < trials.length
      ? ({ kind: "trial", trial: trials[responses.length]! } as const)
      : ({ kind: "finished", result: scriptedResult } as const);
  return {
    responses,
    current: step,
    earEstimate: () => null,
    quietestCatchDb: () => null,
    // A script has no ears of its own, so no track of it leads the room.
    earSearching: () => false,
    steerStart: step,
    respond(response) {
      if (responses.length >= trials.length) {
        throw new Error("The scripted search has finished.");
      }
      responses.push(response);
      return step();
    },
    cutOff() {
      return { kind: "finished", result: scriptedResult } as const;
    },
  };
}

/**
 * A shell on the fake backend, running and calibrated, as `output-shell-harness.ts` calibrates
 * one: repeats towards the setting, each waited out, then kept. `advance` moves the audio clock
 * and the timer together, in whole milliseconds, so that every time in a case is exact.
 */
async function calibratedShell() {
  const backend = createFakeAudioBackend({
    sampleRateHz: soundRulesConfig.sampleRateMinHz,
    performanceOffsetMs: pageAheadMs + outputDelayMs,
  });
  const timer = createManualTimer({ startMs: pageAheadMs });
  const output = createAudioOutput({ backend, timer });
  const random = createSeededRandom(11);
  // In steps of 1 ms, so that the audio clock is where the timer is when a callback runs.
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

/** A runner on the shell with a fresh recorder, recording every callback. */
function runnerOn(
  shell: Shell,
  search: ThresholdSearch,
  overrides: Partial<RoomRunnerOptions> = {},
) {
  const recorder = createVisitLogRecorder({
    visitType: "full",
    visitSeed: 1,
    rooms: threeRooms,
    startedAtMs: visitStartMs,
  });
  recorder.attemptStarted({
    roomIndex: room.roomIndex,
    engineSeed: 1,
    calibrationIndex: 0,
    searchCapDb: hearingMethodConfig.capRelativeToAnchorDb,
    startedAtMs: shell.timer.now(),
  });
  const plays: PlayRequest[] = [];
  const presented: PresentedTrial[] = [];
  const scored: { entry: ScoredVisitTrial; atMs: number; phase: string }[] = [];
  const finished: RoomResult[] = [];
  const calls: string[] = [];
  const latestOffset = { latestOffsetMs: 0 };
  let phase = "outside";
  const output: AudioOutput = {
    ...shell.output,
    play(request) {
      plays.push(request);
      return shell.output.play(request);
    },
  };
  const runner = createRoomRunner({
    output,
    timer: shell.timer,
    search,
    room,
    attempt: 1,
    soundRandom: createSeededRandom(5),
    recorder,
    latestOffset,
    scored: (entry) => scored.push({ entry, atMs: shell.timer.now(), phase }),
    finished: (result) => finished.push(result),
    pauseFromOutput: () => calls.push("pauseFromOutput"),
    soundRefused: () => calls.push("soundRefused"),
    onTrialPresented: (trial) => presented.push(trial),
    ...overrides,
  });
  /** Runs `action` with `phase` set, so a callback can tell where it was called from. */
  const during = (name: string, action: () => void): void => {
    phase = name;
    try {
      action();
    } finally {
      phase = "outside";
    }
  };
  const advance = (durationMs: number): void =>
    during("advance", () => shell.advance(durationMs));
  const answer = (side: "left" | "right", pressedAtMs?: number): void =>
    during("answer", () => runner.answer(side, pressedAtMs));
  const advanceTo = (atMs: number): void =>
    advance(Math.max(0, atMs - shell.timer.now()));
  /** The visit log so far, with the open run closed as abandoned. */
  const log = () => {
    recorder.attemptEnded({
      roomIndex: room.roomIndex,
      attempt: 1,
      endedAtMs: shell.timer.now(),
      ending: "abandoned",
      result: null,
    });
    return recorder.log();
  };
  return {
    runner,
    plays,
    presented,
    scored,
    finished,
    calls,
    latestOffset,
    advance,
    advanceTo,
    answer,
    log,
  };
}

describe("createRoomRunner", () => {
  it("waits the first gap from the start, and each later gap from the previous answer (R7.1)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 1500),
      soundTrial(2, "right", -25, 3200),
    ]);
    const run = runnerOn(shell, search);
    const startMs = shell.timer.now();
    run.runner.start();
    run.advance(1499);
    expect(run.plays).toHaveLength(0);
    run.advance(1);
    expect(run.plays).toHaveLength(1);
    expect(run.presented[0]?.windowStartMs).toBeGreaterThan(startMs + 1500);
    run.advance(700);
    run.answer("left");
    const answeredMs = shell.timer.now();
    run.advance(3199);
    expect(run.plays).toHaveLength(1);
    run.advance(1);
    expect(run.plays).toHaveLength(2);
    expect(shell.timer.now()).toBe(answeredMs + 3200);
  });

  it("plays a sound trial with the Purpose trial, the room's sound, the trial's ear and level (R7.2)", async () => {
    const shell = await calibratedShell();
    const run = runnerOn(
      shell,
      scriptedSearch([soundTrial(1, "right", -35, 2000)]),
    );
    run.runner.start();
    run.advance(2000);
    expect(run.plays).toHaveLength(1);
    expect(run.plays[0]).toMatchObject({
      soundId: room.roomId,
      ear: "right",
      levelDb: -35,
      purpose: "trial",
    });
    const scheduled = shell.backend.scheduled();
    const last = scheduled[scheduled.length - 1]!;
    expect(last.left.every((sample) => Object.is(sample, 0))).toBe(true);
    expect(last.right.some((sample) => sample !== 0)).toBe(true);
  });

  it("opens the window at the start converted with the timestamp pair, output delay included (R7.3)", async () => {
    const shell = await calibratedShell();
    const run = runnerOn(
      shell,
      scriptedSearch([soundTrial(1, "left", -25, 2000)]),
    );
    run.runner.start();
    run.advance(2000);
    const presentedAtMs = shell.timer.now();
    expect(run.presented[0]).toMatchObject({
      kind: "sound",
      ear: "left",
      levelDb: -25,
      windowStartMs: presentedAtMs + scheduleLeadMs + outputDelayMs,
      windowEndMs:
        presentedAtMs + scheduleLeadMs + outputDelayMs + responseWindowMs,
      roomIndex: room.roomIndex,
      attempt: 1,
      trialNumber: 1,
    });
    expect(run.latestOffset.latestOffsetMs).toBe(outputDelayMs);
  });

  it("counts an answer at the window's start and not one at its end (R7.6, D3)", async () => {
    const shell = await calibratedShell();
    const run = runnerOn(
      shell,
      scriptedSearch([
        soundTrial(1, "left", -25, 2000),
        soundTrial(2, "right", -25, 2000),
        soundTrial(3, "right", -25, 2000),
      ]),
    );
    run.runner.start();
    run.advance(2000);
    const first = run.presented[0]!;
    run.advanceTo(first.windowStartMs);
    run.answer("left");
    expect(run.scored).toHaveLength(1);
    expect(run.scored[0]?.entry).toMatchObject({
      response: "left",
      outcome: "caught",
      answeredAtMs: first.windowStartMs - visitStartMs,
      responseTimeMs: 0,
    });

    run.advance(2000);
    const second = run.presented[1]!;
    run.advanceTo(second.windowEndMs);
    run.answer("right", second.windowEndMs);
    expect(run.scored).toHaveLength(2);
    expect(run.scored[1]?.entry).toMatchObject({
      response: "none",
      outcome: "missed",
      answeredAtMs: null,
      scoredAtMs: second.windowEndMs - visitStartMs,
    });
    expect(run.log().ignoredAnswers).toEqual([
      {
        atMs: second.windowEndMs - visitStartMs,
        side: "right",
        roomIndex: room.roomIndex,
        attempt: 1,
      },
    ]);
  });

  it("counts an answer by its own time stamp, just before the window's end", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(2000);
    const trial = run.presented[0]!;
    run.advanceTo(trial.windowEndMs - 1);
    run.answer("right", trial.windowEndMs - 1);
    expect(search.responses).toEqual(["right"]);
    expect(run.scored[0]?.entry).toMatchObject({
      outcome: "wrongSide",
      responseTimeMs: responseWindowMs - 1,
    });
  });

  it("ignores a second answer in the same window and gives the search one response", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 2000),
      soundTrial(2, "left", -25, 2000),
    ]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(2000);
    run.advance(400);
    run.answer("left");
    run.advance(100);
    run.answer("right");
    expect(search.responses).toEqual(["left"]);
    expect(run.scored).toHaveLength(1);
    expect(run.log().ignoredAnswers.map((answer) => answer.side)).toEqual([
      "right",
    ]);
  });

  it("decides a trial with no answer as none at its window's end (R7.7)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 2000),
      soundTrial(2, "left", -25, 2000),
    ]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(2000);
    const trial = run.presented[0]!;
    run.advanceTo(trial.windowEndMs - 1);
    expect(run.scored).toHaveLength(0);
    run.advance(1);
    expect(search.responses).toEqual(["none"]);
    expect(run.scored[0]?.atMs).toBe(trial.windowEndMs);
    expect(run.scored[0]?.entry.outcome).toBe("missed");
  });

  it("schedules nothing for a no-sound trial and opens its window with the latest offset (R7.4, R7.11)", async () => {
    const shell = await calibratedShell();
    const run = runnerOn(
      shell,
      scriptedSearch([soundTrial(1, "left", -25, 2000), noSoundTrial(2, 1800)]),
    );
    run.runner.start();
    run.advance(2000);
    run.advance(500);
    run.answer("left");
    const scheduledBefore = shell.backend.scheduled().length;
    run.advance(1800);
    const presentedAtMs = shell.timer.now();
    const trial = run.presented[1]!;
    expect(trial).toMatchObject({
      kind: "noSound",
      ear: null,
      levelDb: null,
      windowStartMs: presentedAtMs + scheduleLeadMs + outputDelayMs,
    });
    run.advanceTo(trial.windowEndMs);
    expect(shell.backend.scheduled()).toHaveLength(scheduledBefore);
    expect(run.plays).toHaveLength(1);
    expect(run.scored[1]?.entry).toMatchObject({
      kind: "noSound",
      response: "none",
      outcome: "noResponse",
    });
  });

  it("opens a no-sound window at the presentation plus the lead before any sound (D4)", async () => {
    const shell = await calibratedShell();
    const run = runnerOn(shell, scriptedSearch([noSoundTrial(1, 1600)]));
    run.runner.start();
    run.advance(1600);
    expect(run.presented[0]?.windowStartMs).toBe(
      shell.timer.now() + scheduleLeadMs,
    );
  });

  it("logs answers outside every window as ignored and gives the search nothing (R8.1, R8.2)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(1000);
    const duringGapMs = shell.timer.now();
    run.answer("right");
    run.advance(1000);
    const trial = run.presented[0]!;
    // Pressed before the window opened, handled late.
    run.advanceTo(trial.windowStartMs + 300);
    run.answer("left", trial.windowStartMs - 10);
    expect(search.responses).toEqual([]);
    expect(run.scored).toHaveLength(0);
    const ignored = run.log().ignoredAnswers;
    expect(ignored.map((answer) => [answer.side, answer.atMs])).toEqual([
      ["right", duringGapMs - visitStartMs],
      ["left", trial.windowStartMs - 10 - visitStartMs],
    ]);
  });

  it("logs nothing for a pause during a gap and presents the same trial after its gap on resume (R12.4, R12.7)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "right", -30, 2500)]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(1000);
    run.runner.pause();
    expect(run.runner.state()).toBe("paused");
    run.advance(60_000);
    expect(run.plays).toHaveLength(0);
    run.runner.resume();
    run.advance(2499);
    expect(run.plays).toHaveLength(0);
    run.advance(1);
    expect(run.plays).toHaveLength(1);
    expect(run.presented[0]).toMatchObject({
      trialNumber: 1,
      ear: "right",
      levelDb: -30,
    });
    expect(run.log().trials).toHaveLength(0);
    expect(search.responses).toEqual([]);
  });

  it("logs a trial paused after its presentation as discarded and presents it again on resume (R12.3, D9, D10)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 2000),
      noSoundTrial(2, 1700),
    ]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(2000);
    run.advance(600);
    run.runner.pause();
    const pausedAtMs = shell.timer.now();
    run.answer("left");
    run.advance(5000);
    expect(run.scored).toHaveLength(0);
    run.runner.resume();
    run.advance(2000);
    expect(run.presented.map((trial) => trial.trialNumber)).toEqual([1, 1]);
    run.advance(400);
    run.answer("left");
    expect(search.responses).toEqual(["left"]);
    const log = run.log();
    expect(log.ignoredAnswers).toEqual([]);
    expect(
      log.trials.map((trial) => [trial.order, trial.trialNumber, trial.status]),
    ).toEqual([
      [1, 1, "discarded"],
      [2, 1, "scored"],
    ]);
    expect(log.trials[0]).toMatchObject({
      discardedAtMs: pausedAtMs - visitStartMs,
    });
  });

  it("ends on abandon: the presented trial is discarded and nothing more happens", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 2000),
      soundTrial(2, "left", -25, 2000),
    ]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(2100);
    run.runner.abandon();
    expect(run.runner.state()).toBe("finished");
    run.runner.resume();
    run.answer("left");
    run.advance(60_000);
    expect(run.plays).toHaveLength(1);
    expect(run.scored).toHaveLength(0);
    expect(search.responses).toEqual([]);
    const log = run.log();
    expect(log.trials.map((trial) => trial.status)).toEqual(["discarded"]);
    expect(log.ignoredAnswers).toEqual([]);
  });

  it("logs a refused sound, tries the same trial again after its gap, and calls soundRefused on the third refusal in a row (R21.1, R21.2)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const outcomes: PlayOutcome[] = [];
    const run = runnerOn(shell, search, {
      output: {
        ...shell.output,
        play: () => {
          const outcome = Object.freeze({
            kind: "refused",
            reason: "busy",
          } as const);
          outcomes.push(outcome);
          return outcome;
        },
      },
    });
    expect(refusedPlaysInARowMaxCount).toBe(3);
    run.runner.start();
    run.advance(2000);
    expect(outcomes).toHaveLength(1);
    expect(run.calls).toEqual([]);
    run.advance(1999);
    expect(outcomes).toHaveLength(1);
    run.advance(1);
    expect(outcomes).toHaveLength(2);
    expect(run.calls).toEqual([]);
    run.advance(2000);
    expect(outcomes).toHaveLength(3);
    expect(run.calls).toEqual(["soundRefused"]);
    expect(run.runner.state()).toBe("finished");
    run.advance(10_000);
    expect(outcomes).toHaveLength(3);
    expect(search.responses).toEqual([]);
    const log = run.log();
    expect(log.trials).toEqual([]);
    expect(
      log.refusedPlays.map((play) => [play.trialNumber, play.reason]),
    ).toEqual([
      [1, "busy"],
      [1, "busy"],
      [1, "busy"],
    ]);
  });

  it("starts the refusal count again after a sound is played", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 2000),
      soundTrial(2, "left", -25, 2000),
    ]);
    let refuse = 2;
    const run = runnerOn(shell, search, {
      output: {
        ...shell.output,
        play: (request) => {
          if (refuse > 0) {
            refuse -= 1;
            return Object.freeze({ kind: "refused", reason: "busy" } as const);
          }
          return shell.output.play(request);
        },
      },
    });
    run.runner.start();
    run.advance(6000);
    expect(run.presented).toHaveLength(1);
    run.advance(500);
    run.answer("left");
    refuse = 2;
    run.advance(4000);
    expect(run.calls).toEqual([]);
    run.advance(2000);
    expect(run.presented).toHaveLength(2);
  });

  it("calls pauseFromOutput when the shell is not running, and logs nothing (R21.3)", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const run = runnerOn(shell, search);
    run.runner.start();
    run.advance(1000);
    shell.backend.fire("interrupted");
    run.advance(1000);
    expect(run.calls).toEqual(["pauseFromOutput"]);
    run.runner.pause();
    expect(run.runner.state()).toBe("paused");
    const log = run.log();
    expect(log.trials).toEqual([]);
    expect(log.refusedPlays).toEqual([]);
  });

  it("calls scored inside the answer call or the window-end callback (R9.1)", async () => {
    const shell = await calibratedShell();
    const run = runnerOn(
      shell,
      scriptedSearch([
        soundTrial(1, "left", -25, 2000),
        soundTrial(2, "left", -25, 2000),
      ]),
    );
    run.runner.start();
    run.advance(2500);
    run.answer("left");
    run.advance(2000);
    run.advanceTo(run.presented[1]!.windowEndMs);
    expect(run.scored.map((entry) => entry.phase)).toEqual([
      "answer",
      "advance",
    ]);
  });

  it("calls finished with the search's result after the last trial's scored", async () => {
    const shell = await calibratedShell();
    const order: string[] = [];
    const run = runnerOn(
      shell,
      scriptedSearch([soundTrial(1, "left", -25, 2000)]),
      {
        scored: () => order.push("scored"),
        finished: (result) => {
          order.push("finished");
          expect(result).toBe(scriptedResult);
        },
      },
    );
    run.runner.start();
    run.advance(2500);
    run.answer("left");
    expect(order).toEqual(["scored", "finished"]);
    expect(run.runner.state()).toBe("finished");
  });

  it("runs a room of the real search to its end, giving it one response per decided trial (R7.9, R7.10)", async () => {
    const shell = await calibratedShell();
    const capDb = roomSearchCapDb(
      shell.output.rangeReport()!.rooms[room.roomId].topLevelDb,
      hearingMethodConfig,
    );
    const search = createThresholdSearch({
      settings: { ...hearingMethodConfig, capRelativeToAnchorDb: capDb },
      random: createSeededRandom(2026),
    });
    const thresholdDb = -40;
    let pending: PresentedTrial | null = null;
    const run = runnerOn(shell, search, {
      onTrialPresented: (trial) => {
        if (
          trial.kind === "sound" &&
          trial.levelDb !== null &&
          trial.levelDb >= thresholdDb
        ) {
          pending = trial;
        }
      },
    });
    run.runner.start();
    for (let step = 0; step < 2000 && run.finished.length === 0; step += 1) {
      run.advance(100);
      const trial = pending as PresentedTrial | null;
      if (trial !== null && shell.timer.now() >= trial.windowStartMs + 300) {
        pending = null;
        run.answer(trial.ear!);
      }
    }
    expect(run.finished).toHaveLength(1);
    const result = run.finished[0]!;
    expect(run.scored).toHaveLength(result.trials.length);
    expect(
      run.scored.map(({ entry }) => [
        entry.kind,
        entry.response,
        entry.outcome,
      ]),
    ).toEqual(
      result.trials.map((record) => [
        record.trial.kind,
        record.response,
        record.outcome,
      ]),
    );
    expect(run.plays.every((play) => play.purpose === "trial")).toBe(true);
  });
});

/** A turn source that gives the listed draws in order, counts them, and has no more to give. */
function scriptedTurns(
  draws: readonly number[],
): RandomSource & { drawn(): number } {
  let index = 0;
  return {
    seed: 0,
    next() {
      const value = draws[index];
      if (value === undefined) {
        throw new Error("No turn is left to draw.");
      }
      index += 1;
      return value;
    },
    drawn: () => index,
  };
}

/**
 * A runner of several room runs on the shell, one for each search, in the rooms of the quick
 * visit in order, with a fresh recorder. It records every callback in the order it came.
 */
function mixedOn(
  shell: Shell,
  searches: readonly ThresholdSearch[],
  turnRandom: RandomSource,
  options: {
    /** How many of the next plays the output refuses as busy. A case may change it as it goes. */
    readonly refusals?: { count: number };
    /** Called at the end of every `scored`, with the runner. */
    readonly afterScored?: (runner: RoomRunner) => void;
    readonly overrides?: Partial<MixedRoomRunnerOptions>;
  } = {},
) {
  const rooms = threeRooms;
  const recorder = createVisitLogRecorder({
    visitType: "full",
    visitSeed: 1,
    rooms,
    startedAtMs: visitStartMs,
  });
  const tracks: RoomTrack[] = searches.map((search, index) => {
    const trackRoom = rooms[index]!;
    recorder.attemptStarted({
      roomIndex: trackRoom.roomIndex,
      engineSeed: index + 1,
      calibrationIndex: 0,
      searchCapDb: hearingMethodConfig.capRelativeToAnchorDb,
      startedAtMs: shell.timer.now(),
    });
    return Object.freeze({ search, room: trackRoom, attempt: 1 });
  });
  // As the visit flow begins a room in which several sounds take turns (one-room D4).
  shell.output.beginRoom({ riseLimitPer: "sound" });
  const plays: PlayRequest[] = [];
  const presented: PresentedTrial[] = [];
  const scored: { entry: ScoredVisitTrial; track: RoomTrack }[] = [];
  const results = new Map<RoomTrack, RoomResult>();
  const events: string[] = [];
  const calls: string[] = [];
  const output: AudioOutput = {
    ...shell.output,
    play(request) {
      plays.push(request);
      if (options.refusals !== undefined && options.refusals.count > 0) {
        options.refusals.count -= 1;
        return Object.freeze({ kind: "refused", reason: "busy" } as const);
      }
      return shell.output.play(request);
    },
  };
  const runner: RoomRunner = createMixedRoomRunner({
    output,
    timer: shell.timer,
    tracks,
    turnRandom,
    soundRandom: createSeededRandom(5),
    recorder,
    latestOffset: { latestOffsetMs: 0 },
    scored: (entry, track) => {
      scored.push({ entry, track });
      events.push(`scored:${track.room.roomId}:${String(entry.trialNumber)}`);
      options.afterScored?.(runner);
    },
    trackFinished: (track, result) => {
      results.set(track, result);
      events.push(`trackFinished:${track.room.roomId}`);
    },
    finished: () => events.push("finished"),
    pauseFromOutput: () => calls.push("pauseFromOutput"),
    soundRefused: () => calls.push("soundRefused"),
    onTrialPresented: (trial) => presented.push(trial),
    ...options.overrides,
  });
  const advance = (durationMs: number): void => {
    shell.advance(durationMs);
  };
  const advanceTo = (atMs: number): void => {
    advance(Math.max(0, atMs - shell.timer.now()));
  };
  /** The visit log so far, with every run closed as abandoned. */
  const log = () => {
    for (const track of tracks) {
      recorder.attemptEnded({
        roomIndex: track.room.roomIndex,
        attempt: track.attempt,
        endedAtMs: shell.timer.now(),
        ending: "abandoned",
        result: null,
      });
    }
    return recorder.log();
  };
  return {
    runner,
    tracks,
    plays,
    presented,
    scored,
    results,
    events,
    calls,
    advance,
    advanceTo,
    log,
  };
}

describe("createMixedRoomRunner (one-room, the mixed runner)", () => {
  it("passes the turn's net answer time and only estimates one octave away or on the other ear", async () => {
    const shell = await calibratedShell();
    const first = scriptedSearch([soundTrial(1, "left", -10, 1500)]);
    const second = scriptedSearch([soundTrial(1, "left", -10, 1500)]);
    const third = scriptedSearch([soundTrial(1, "left", -10, 1500)]);
    const respond = vi.fn(second.respond);
    const found = (thresholdDb: number) => ({
      ...counts,
      state: "found" as const,
      thresholdDb,
    });
    let timingOffsetMs = 90;
    const run = mixedOn(
      shell,
      [
        { ...first, earEstimate: () => -50 },
        {
          ...second,
          respond,
          earEstimate: (ear) => (ear === "right" ? -25 : null),
        },
        { ...third, earEstimate: (ear) => (ear === "left" ? -34 : -28) },
      ],
      scriptedTurns([0.5, 0]),
      {
        overrides: {
          timingOffsetMs: () => timingOffsetMs,
          baselineMs: () => 275,
          earlierRooms: [
            {
              frequencyHz: 2000,
              result: {
                left: found(-18),
                right: { ...counts, state: "betterThanFloor" },
              },
            },
          ],
        },
      },
    );
    run.runner.start();
    run.advance(1500);
    timingOffsetMs = 200;
    run.advanceTo(run.presented[0]!.windowStartMs + 690);
    run.runner.answer("left");
    expect(respond).toHaveBeenCalledExactlyOnceWith("left", "perfect", {
      netAnswerMs: 600,
      baselineMs: 275,
      steering: { centreDb: -26.5, spreadDb: 12 },
    });
  });

  it("takes the turns the source draws, and gives each trial to its own search, sound and room", async () => {
    const shell = await calibratedShell();
    const first = scriptedSearch([
      soundTrial(1, "left", -25, 1500),
      soundTrial(2, "right", -30, 1500),
    ]);
    const second = scriptedSearch([
      soundTrial(1, "right", -25, 3200),
      noSoundTrial(2, 1700),
    ]);
    // Two tracks are open: a draw below one half is the first of them, the rest the second.
    const turns = scriptedTurns([0, 0.9, 0]);
    const run = mixedOn(shell, [first, second], turns);
    expect(turns.drawn()).toBe(0);
    run.runner.start();
    expect(turns.drawn()).toBe(1);
    // The first room's first trial, after that trial's own gap.
    run.advance(1499);
    expect(run.plays).toHaveLength(0);
    run.advance(1);
    expect(run.plays).toHaveLength(1);
    run.advance(700);
    run.runner.answer("left");
    expect(turns.drawn()).toBe(2);
    // The second room's first trial: its gap runs from the answer.
    run.advance(3199);
    expect(run.plays).toHaveLength(1);
    run.advance(1);
    expect(run.plays).toHaveLength(2);
    run.advance(700);
    run.runner.answer("right");
    expect(turns.drawn()).toBe(3);
    run.advance(1500);
    expect(run.plays).toHaveLength(3);
    run.advance(700);
    run.runner.answer("right");
    // The first room's search has finished. One track is left: nothing more is drawn.
    expect(turns.drawn()).toBe(3);
    expect(run.runner.state()).toBe("waitingGap");
    run.advance(1700);
    expect(run.presented).toHaveLength(4);
    run.advanceTo(run.presented[3]!.windowEndMs);
    expect(run.runner.state()).toBe("finished");

    expect(
      run.plays.map(({ soundId, ear, levelDb, purpose }) => [
        soundId,
        ear,
        levelDb,
        purpose,
      ]),
    ).toEqual([
      ["corridor", "left", -25, "trial"],
      ["stairs", "right", -25, "trial"],
      ["corridor", "right", -30, "trial"],
    ]);
    expect(first.responses).toEqual(["left", "right"]);
    expect(second.responses).toEqual(["right", "none"]);
    expect(run.events).toEqual([
      "scored:corridor:1",
      "scored:stairs:1",
      "scored:corridor:2",
      "trackFinished:corridor",
      "scored:stairs:2",
      "trackFinished:stairs",
      "finished",
    ]);
    expect(run.scored.map(({ track }) => track)).toEqual([
      run.tracks[0],
      run.tracks[1],
      run.tracks[0],
      run.tracks[1],
    ]);
    expect(
      run
        .log()
        .trials.map((trial) => [
          trial.order,
          trial.roomIndex,
          trial.attempt,
          trial.trialNumber,
          trial.kind,
          trial.status,
        ]),
    ).toEqual([
      [1, 0, 1, 1, "sound", "scored"],
      [2, 1, 1, 1, "sound", "scored"],
      [3, 0, 1, 2, "sound", "scored"],
      [4, 1, 1, 2, "noSound", "scored"],
    ]);
  });

  it("plays the lead pitch alone, drawing nothing, until one of its ears ends", async () => {
    const shell = await calibratedShell();
    expect(threeRooms[0]!.frequencyHz).toBe(
      adaptiveHearingConfig.leadFrequencyHz,
    );
    const lead = scriptedSearch([
      soundTrial(1, "left", -25, 1500),
      soundTrial(2, "right", -25, 1500),
      soundTrial(3, "left", -30, 1500),
    ]);
    const other = scriptedSearch([soundTrial(1, "right", -25, 1500)]);
    const turns = scriptedTurns([0.9]);
    const run = mixedOn(
      shell,
      [{ ...lead, earSearching: () => lead.responses.length < 2 }, other],
      turns,
    );
    run.runner.start();
    for (let turn = 0; turn < 4; turn += 1) {
      run.advance(2200);
      run.runner.answer("left");
    }
    expect(run.plays.map(({ soundId }) => soundId)).toEqual([
      "corridor",
      "corridor",
      "stairs",
      "corridor",
    ]);
    // One draw, once the lead's first ear has ended and two tracks are open.
    expect(turns.drawn()).toBe(1);
  });

  it.each([
    {
      case: "the other ear's found level",
      earEstimate: (ear: Ear) => (ear === "right" ? -40 : null),
      quietestCatchDb: () => null,
      centreDb: -40,
    },
    {
      case: "the other ear's quietest catch, one upward step below, before anything is found",
      earEstimate: () => null,
      quietestCatchDb: (ear: Ear) => (ear === "right" ? -35 : null),
      centreDb: -35 - hearingMethodConfig.upwardStepDb,
    },
  ])(
    "starts an ear a little above $case and passes the steering with a miss",
    async ({ earEstimate, quietestCatchDb, centreDb }) => {
      const shell = await calibratedShell();
      const search = scriptedSearch([soundTrial(1, "left", -10, 1500)]);
      const steerStart = vi.fn(search.steerStart);
      const respond = vi.fn(search.respond);
      const run = mixedOn(
        shell,
        [{ ...search, earEstimate, quietestCatchDb, steerStart, respond }],
        scriptedTurns([]),
      );
      run.runner.start();
      expect(steerStart).toHaveBeenCalledExactlyOnceWith(
        "left",
        centreDb + adaptiveHearingConfig.steeringStartLeadDb,
      );
      run.advance(1500);
      run.advanceTo(run.presented[0]!.windowEndMs);
      expect(respond).toHaveBeenCalledExactlyOnceWith("none", undefined, {
        steering: {
          centreDb,
          spreadDb: adaptiveHearingConfig.steeringSpreadDb,
        },
      });
    },
  );

  it("draws nothing while only one track is unfinished", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 2000),
      soundTrial(2, "right", -25, 2000),
    ]);
    const turns = scriptedTurns([]);
    const run = mixedOn(shell, [search], turns);
    run.runner.start();
    run.advance(2500);
    run.runner.answer("left");
    run.advance(2500);
    run.runner.answer("right");
    expect(run.runner.state()).toBe("finished");
    expect(turns.drawn()).toBe(0);
    expect(run.events).toEqual([
      "scored:corridor:1",
      "scored:corridor:2",
      "trackFinished:corridor",
      "finished",
    ]);
  });

  it("gives every track the same chance when the source draws evenly", async () => {
    const shell = await calibratedShell();
    const trials = (): Trial[] => [soundTrial(1, "left", -25, 2000)];
    for (const [draw, roomId] of [
      [0, "corridor"],
      [0.34, "stairs"],
      [0.67, "attic"],
      // A draw is below 1, and the last track takes everything up to it.
      [0.999999, "attic"],
    ] as const) {
      const run = mixedOn(
        shell,
        [
          scriptedSearch(trials()),
          scriptedSearch(trials()),
          scriptedSearch(trials()),
        ],
        scriptedTurns([draw]),
      );
      run.runner.start();
      expect(run.runner.waitingTrack()?.room.roomId, String(draw)).toBe(roomId);
      run.runner.abandon();
    }
  });

  it("keeps the track it drew through a pause and through a refused sound", async () => {
    const shell = await calibratedShell();
    const first = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const second = scriptedSearch([soundTrial(1, "right", -25, 2500)]);
    const turns = scriptedTurns([0.9]);
    const refusals = { count: 0 };
    const run = mixedOn(shell, [first, second], turns, { refusals });
    run.runner.start();
    run.advance(1000);
    run.runner.pause();
    expect(run.runner.state()).toBe("paused");
    expect(run.runner.waitingTrack()?.room.roomId).toBe("stairs");
    run.advance(60_000);
    expect(run.plays).toHaveLength(0);
    refusals.count = 1;
    run.runner.resume();
    // The same room's trial after its whole gap. The output refuses it.
    run.advance(2499);
    expect(run.plays).toHaveLength(0);
    run.advance(1);
    expect(run.plays.map(({ soundId }) => soundId)).toEqual(["stairs"]);
    expect(run.presented).toHaveLength(0);
    // It is tried again after its gap, for the same room.
    run.advance(2500);
    expect(run.plays.map(({ soundId }) => soundId)).toEqual([
      "stairs",
      "stairs",
    ]);
    expect(run.presented).toHaveLength(1);
    expect(run.presented[0]).toMatchObject({ roomIndex: 1, trialNumber: 1 });
    expect(turns.drawn()).toBe(1);
    expect(run.calls).toEqual([]);
    const log = run.log();
    expect(
      log.refusedPlays.map((play) => [
        play.roomIndex,
        play.trialNumber,
        play.reason,
      ]),
    ).toEqual([[1, 1, "busy"]]);
  });

  it("logs a trial paused after its presentation as discarded in its own room, and presents it again", async () => {
    const shell = await calibratedShell();
    const first = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const second = scriptedSearch([soundTrial(1, "right", -25, 2000)]);
    const turns = scriptedTurns([0.9]);
    const run = mixedOn(shell, [first, second], turns);
    run.runner.start();
    run.advance(2600);
    run.runner.pause();
    run.advance(5000);
    run.runner.resume();
    run.advance(2000);
    expect(
      run.presented.map(({ roomIndex, trialNumber }) => [
        roomIndex,
        trialNumber,
      ]),
    ).toEqual([
      [1, 1],
      [1, 1],
    ]);
    run.advance(400);
    run.runner.answer("right");
    expect(second.responses).toEqual(["right"]);
    expect(first.responses).toEqual([]);
    expect(turns.drawn()).toBe(1);
    expect(
      run
        .log()
        .trials.map((trial) => [
          trial.roomIndex,
          trial.trialNumber,
          trial.status,
        ]),
    ).toEqual([
      [1, 1, "discarded"],
      [1, 1, "scored"],
    ]);
  });

  it("logs an answer that decides nothing against the room whose trial waits", async () => {
    const shell = await calibratedShell();
    const run = mixedOn(
      shell,
      [
        scriptedSearch([soundTrial(1, "left", -25, 2000)]),
        scriptedSearch([soundTrial(1, "right", -25, 2000)]),
      ],
      scriptedTurns([0.9, 0]),
    );
    // Before the start no trial waits, and nothing is logged.
    run.runner.answer("left");
    run.runner.start();
    run.advance(1000);
    run.runner.answer("left");
    run.advance(1500);
    run.runner.answer("right");
    // The first room's trial waits now.
    run.advance(500);
    run.runner.answer("right");
    expect(
      run
        .log()
        .ignoredAnswers.map(({ side, roomIndex, attempt }) => [
          side,
          roomIndex,
          attempt,
        ]),
    ).toEqual([
      ["left", 1, 1],
      ["right", 0, 1],
    ]);
  });

  it("begins the next gap before it tells of a decided trial, so a pause from the callback holds the next trial", async () => {
    const shell = await calibratedShell();
    const seen: string[] = [];
    const run = mixedOn(
      shell,
      [
        scriptedSearch([
          soundTrial(1, "left", -25, 1500),
          soundTrial(2, "left", -25, 1500),
        ]),
        scriptedSearch([soundTrial(1, "right", -25, 3200)]),
      ],
      scriptedTurns([0, 0.9]),
      {
        afterScored: (runner) => {
          seen.push(
            `${runner.state()}:${runner.waitingTrack()?.room.roomId ?? "nobody"}`,
          );
          if (seen.length === 1) {
            runner.pause();
          }
        },
      },
    );
    run.runner.start();
    run.advance(2200);
    run.runner.answer("left");
    expect(seen).toEqual(["waitingGap:stairs"]);
    expect(run.runner.state()).toBe("paused");
    run.advance(60_000);
    expect(run.plays).toHaveLength(1);
    run.runner.resume();
    run.advance(3199);
    expect(run.plays).toHaveLength(1);
    run.advance(1);
    expect(run.plays.map(({ soundId }) => soundId)).toEqual([
      "corridor",
      "stairs",
    ]);
  });

  it("names the room whose trial waits only from the start to the end", async () => {
    const shell = await calibratedShell();
    const run = mixedOn(
      shell,
      [
        scriptedSearch([soundTrial(1, "left", -25, 2000)]),
        scriptedSearch([soundTrial(1, "right", -25, 2000)]),
      ],
      scriptedTurns([0]),
    );
    expect(run.runner.waitingTrack()).toBeNull();
    run.runner.start();
    expect(run.runner.waitingTrack()).toBe(run.tracks[0]);
    run.advance(2500);
    expect(run.runner.waitingTrack()).toBe(run.tracks[0]);
    run.runner.answer("left");
    expect(run.runner.waitingTrack()).toBe(run.tracks[1]);
    run.advance(2500);
    run.runner.answer("right");
    expect(run.runner.state()).toBe("finished");
    expect(run.runner.waitingTrack()).toBeNull();
  });

  it("ends every track on abandon: the presented trial is discarded and nothing more happens", async () => {
    const shell = await calibratedShell();
    const first = scriptedSearch([soundTrial(1, "left", -25, 2000)]);
    const second = scriptedSearch([soundTrial(1, "right", -25, 2000)]);
    const run = mixedOn(shell, [first, second], scriptedTurns([0.9]));
    run.runner.start();
    run.advance(2100);
    run.runner.abandon();
    expect(run.runner.state()).toBe("finished");
    expect(run.runner.waitingTrack()).toBeNull();
    run.runner.resume();
    run.runner.answer("right");
    run.advance(60_000);
    expect(run.plays).toHaveLength(1);
    expect(run.events).toEqual([]);
    expect(first.responses).toEqual([]);
    expect(second.responses).toEqual([]);
    const log = run.log();
    expect(log.trials.map((trial) => [trial.roomIndex, trial.status])).toEqual([
      [1, "discarded"],
    ]);
    expect(log.ignoredAnswers).toEqual([]);
  });

  it("refuses an empty list of tracks, and a start on a search that has finished", async () => {
    const shell = await calibratedShell();
    expect(() => mixedOn(shell, [], scriptedTurns([]))).toThrow(RangeError);
    const run = mixedOn(
      shell,
      [scriptedSearch([soundTrial(1, "left", -25, 2000)]), scriptedSearch([])],
      scriptedTurns([0]),
    );
    expect(() => {
      run.runner.start();
    }).toThrow("A room run cannot start on a search that has finished.");
    expect(run.runner.state()).toBe("idle");
  });

  it("runs the real searches of three rooms to their ends in turns, each with one response per decided trial", async () => {
    const shell = await calibratedShell();
    const rooms = threeRooms;
    const engineSeeds = [2026, 2027, 2028];
    const searches = rooms.map((trackRoom, index) =>
      createThresholdSearch({
        settings: {
          ...hearingMethodConfig,
          capRelativeToAnchorDb: roomSearchCapDb(
            shell.output.rangeReport()!.rooms[trackRoom.roomId].topLevelDb,
            hearingMethodConfig,
          ),
        },
        random: createSeededRandom(engineSeeds[index]!),
      }),
    );
    // A visitor who hears each room's sound down to a level of its own.
    const thresholdsDb = [-40, -30, -45];
    let pending: PresentedTrial | null = null;
    const run = mixedOn(
      shell,
      searches,
      createSeededRandom(turnSeedOf(engineSeeds)),
      {
        overrides: {
          onTrialPresented: (trial) => {
            pending =
              trial.kind === "sound" &&
              trial.levelDb !== null &&
              trial.levelDb >= thresholdsDb[trial.roomIndex]!
                ? trial
                : null;
          },
        },
      },
    );
    run.runner.start();
    for (
      let step = 0;
      step < 8000 && run.runner.state() !== "finished";
      step += 1
    ) {
      run.advance(100);
      const trial = pending as PresentedTrial | null;
      if (trial !== null && shell.timer.now() >= trial.windowStartMs + 300) {
        pending = null;
        run.runner.answer(trial.ear!);
      }
    }
    expect(run.runner.state()).toBe("finished");
    expect(run.results.size).toBe(3);
    expect(run.events.filter((event) => event === "finished")).toHaveLength(1);
    expect(run.events[run.events.length - 1]).toBe("finished");
    for (const track of run.tracks) {
      const result = run.results.get(track)!;
      const own = run.scored.filter((one) => one.track === track);
      // Each search was given exactly its own trials, in its own order.
      expect(
        own.map(({ entry }) => [
          entry.trialNumber,
          entry.kind,
          entry.response,
          entry.outcome,
        ]),
      ).toEqual(
        result.trials.map((record) => [
          record.trial.trialNumber,
          record.trial.kind,
          record.response,
          record.outcome,
        ]),
      );
      expect(
        own.every(({ entry }) => entry.roomIndex === track.room.roomIndex),
      ).toBe(true);
    }
    // Every sound was the sound of its own room.
    const soundOf = new Map(rooms.map((one) => [one.roomIndex, one.roomId]));
    const soundTrials = run.scored.filter(
      ({ entry }) => entry.kind === "sound",
    );
    expect(run.plays.map(({ soundId }) => soundId)).toEqual(
      soundTrials.map(({ entry }) => soundOf.get(entry.roomIndex)),
    );
    // The rooms took turns: the room changed far more often than a run of rooms would.
    const changes = run.scored.filter(
      ({ track }, index) => index > 0 && run.scored[index - 1]!.track !== track,
    ).length;
    expect(changes).toBeGreaterThan(run.scored.length / 4);
  }, 60_000);
});

describe("createMixedRoomRunner, the game layer (2026-11-17)", () => {
  /** Game options with a short quiet, recording what the runner tells. */
  function gameOn() {
    const reminders: { outcome: string; ear: string; levelDb: number }[] = [];
    const ignored: number[] = [];
    const game: RoomGameOptions = {
      reminderAfterQuietMs: 3000,
      reminderAboveCaughtDb: 10,
      reminderUncaughtLevelDb: -10,
      chimeAboveCaughtDb: 10,
      chimeMaxLevelDb: -20,
      reminderScored: (entry) =>
        reminders.push({
          outcome: entry.outcome,
          ear: entry.ear,
          levelDb: entry.requestedLevelDb,
        }),
      answerIgnored: () => ignored.push(1),
    };
    return { game, reminders, ignored };
  }

  const playsOf = (plays: readonly PlayRequest[]) =>
    plays.map(({ soundId, ear, levelDb, purpose }) => [
      soundId,
      ear,
      levelDb,
      purpose,
    ]);

  it("plays a reminder of the waiting creature after a long quiet, and gives the search nothing for it", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -40, 1500),
      soundTrial(2, "right", -30, 1500),
    ]);
    const { game, reminders } = gameOn();
    const run = mixedOn(shell, [search], scriptedTurns([]), {
      overrides: { game },
    });
    run.runner.start();
    // The first trial is missed: its window ends more than 3 s after the start.
    run.advance(1500);
    run.advanceTo(run.presented[0]!.windowEndMs);
    expect(search.responses).toEqual(["none"]);
    // The waiting trial is on the right, and no catch was made there: the reminder plays at the
    // level for an uncaught ear, one gap later.
    run.advance(1500);
    expect(run.presented).toHaveLength(2);
    expect(run.presented[1]?.reminder).toBe(true);
    expect(run.presented[1]?.ear).toBe("right");
    run.advance(700);
    run.runner.answer("right");
    expect(reminders).toEqual([
      { outcome: "caught", ear: "right", levelDb: -10 },
    ]);
    expect(search.responses).toEqual(["none"]);
    // The trial it stood in for waits its own gap, then plays as the search asked.
    run.advance(1500);
    expect(run.presented).toHaveLength(3);
    expect(run.presented[2]?.reminder).toBeUndefined();
    expect(playsOf(run.plays)).toEqual([
      ["corridor", "left", -40, "trial"],
      ["corridor", "right", -10, "reminder"],
      ["chime", "right", -20, "chime"],
      ["corridor", "right", -30, "trial"],
    ]);
    // The log holds the reminder apart from the trials.
    run.advance(700);
    run.runner.answer("right");
    const log = run.log();
    expect(log.trials.map((trial) => trial.trialNumber)).toEqual([1, 2]);
    expect(log.reminders?.map((sound) => [sound.ear, sound.status])).toEqual([
      ["right", "scored"],
    ]);
  });

  it("chimes after each catch above its level and within the limit, and plays a later reminder above the catch", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -45, 1500),
      soundTrial(2, "left", -60, 1500),
      soundTrial(3, "left", -60, 1500),
    ]);
    const { game } = gameOn();
    const run = mixedOn(shell, [search], scriptedTurns([]), {
      overrides: { game },
    });
    run.runner.start();
    run.advance(1500);
    run.advance(700);
    run.runner.answer("left");
    // The second trial is missed, and the quiet since the catch passes 3 s by its window's end.
    run.advance(1500);
    run.advanceTo(run.presented[1]!.windowEndMs);
    run.advance(1500);
    expect(run.presented[2]?.reminder).toBe(true);
    expect(playsOf(run.plays)).toEqual([
      ["corridor", "left", -45, "trial"],
      ["chime", "left", -35, "chime"],
      ["corridor", "left", -60, "trial"],
      ["corridor", "left", -35, "reminder"],
    ]);
  });

  it("tells the game of an answer that decided nothing, after logging it as ignored", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "left", -25, 1500)]);
    const { game, ignored } = gameOn();
    const run = mixedOn(shell, [search], scriptedTurns([]), {
      overrides: { game },
    });
    run.runner.start();
    run.advance(500);
    run.runner.answer("left");
    expect(ignored).toEqual([1]);
    expect(run.log().ignoredAnswers).toHaveLength(1);
  });

  it("puffs on the side of a sound that went by or was answered on the other side, and not for a catch", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -45, 1500),
      soundTrial(2, "right", -45, 1500),
      soundTrial(3, "left", -45, 1500),
    ]);
    const run = mixedOn(shell, [search], scriptedTurns([]), {
      overrides: { game: { ...gameOn().game, missLevelDb: -10 } },
    });
    run.runner.start();
    // Answered on the wrong side.
    run.advance(1500);
    run.advance(300);
    run.runner.answer("right");
    // Let by.
    run.advance(1500);
    run.advanceTo(run.presented[1]!.windowEndMs);
    // Caught: a chime, no puff.
    run.advance(1500);
    run.advance(300);
    run.runner.answer("left");
    expect(playsOf(run.plays).map(([soundId, ear]) => [soundId, ear])).toEqual([
      ["corridor", "left"],
      ["snuff", "left"],
      ["corridor", "right"],
      ["snuff", "right"],
      ["corridor", "left"],
      ["chime", "left"],
    ]);
    expect(run.plays.filter(({ soundId }) => soundId === "snuff")).toEqual([
      expect.objectContaining({ levelDb: -10, purpose: "miss" }),
      expect.objectContaining({ levelDb: -10, purpose: "miss" }),
    ]);
  });

  it("puffs for no sound without a level for it", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([soundTrial(1, "left", -45, 1500)]);
    const run = mixedOn(shell, [search], scriptedTurns([]), {
      overrides: { game: gameOn().game },
    });
    run.runner.start();
    run.advance(1500);
    run.advanceTo(run.presented[0]!.windowEndMs);
    expect(run.plays.map(({ soundId }) => soundId)).toEqual(["corridor"]);
  });

  it("plays no reminder and no chime without the game layer", async () => {
    const shell = await calibratedShell();
    const search = scriptedSearch([
      soundTrial(1, "left", -25, 1500),
      soundTrial(2, "right", -30, 5000),
    ]);
    const run = mixedOn(shell, [search], scriptedTurns([]));
    run.runner.start();
    run.advance(1500);
    run.advance(700);
    run.runner.answer("left");
    run.advance(5000);
    expect(run.plays.map(({ purpose }) => purpose)).toEqual(["trial", "trial"]);
  });
});

describe("createMixedRoomRunner, the time limit of the counting (2026-11-20)", () => {
  /** A scripted search that counts how often it was cut off. */
  function cuttableSearch(trials: readonly Trial[]) {
    const search = scriptedSearch(trials);
    const cutOffs = { count: 0 };
    return {
      search: {
        ...search,
        cutOff() {
          cutOffs.count += 1;
          return { kind: "finished", result: scriptedResult } as const;
        },
      } satisfies ThresholdSearch,
      cutOffs,
    };
  }

  const manyTrials = (gapBeforeMs: number): Trial[] =>
    Array.from({ length: 20 }, (_, index) =>
      soundTrial(index + 1, "left", -25, gapBeforeMs),
    );

  it("ends the run at the limit when it falls in a gap, cuts off every open search and plays nothing more", async () => {
    const shell = await calibratedShell();
    const first = cuttableSearch(manyTrials(10_000));
    const second = cuttableSearch(manyTrials(10_000));
    const run = mixedOn(
      shell,
      [first.search, second.search],
      scriptedTurns([0, 0, 0]),
      { overrides: { timeLimitMs: 4000 } },
    );
    run.runner.start();
    run.advance(3999);
    expect(run.runner.state()).toBe("waitingGap");
    expect(run.events).toEqual([]);
    run.advance(1);
    expect(run.runner.state()).toBe("finished");
    expect(run.events).toEqual([
      "trackFinished:corridor",
      "trackFinished:stairs",
      "finished",
    ]);
    expect(first.cutOffs.count).toBe(1);
    expect(second.cutOffs.count).toBe(1);
    expect(run.plays).toHaveLength(0);
    expect(run.runner.waitingTrack()).toBeNull();
    run.advance(60_000);
    expect(run.plays).toHaveLength(0);
  });

  it("ends during a response window without counting the unfinished trial", async () => {
    const shell = await calibratedShell();
    const first = cuttableSearch([soundTrial(1, "left", -25, 1000)]);
    const second = cuttableSearch(manyTrials(1000));
    const run = mixedOn(
      shell,
      [first.search, second.search],
      scriptedTurns([0, 0, 0]),
      { overrides: { timeLimitMs: 2700 } },
    );
    run.runner.start();
    run.advance(1000);
    expect(run.runner.state()).toBe("presented");
    run.advance(500);
    run.runner.answer("left");
    run.advance(1199);
    expect(run.runner.state()).toBe("presented");
    expect(shell.timer.now()).toBeGreaterThan(run.presented[1]!.windowStartMs);
    expect(shell.timer.now()).toBeLessThan(run.presented[1]!.windowEndMs);
    run.advance(1);
    expect(run.runner.state()).toBe("finished");
    run.runner.answer("left");
    expect(run.events).toEqual([
      "scored:corridor:1",
      "trackFinished:corridor",
      "trackFinished:stairs",
      "finished",
    ]);
    expect(first.search.responses).toEqual(["left"]);
    expect(first.cutOffs.count).toBe(0);
    expect(second.search.responses).toEqual([]);
    expect(second.cutOffs.count).toBe(1);
    expect(run.log().trials.map(({ status }) => status)).toEqual([
      "scored",
      "discarded",
    ]);
    run.advance(60_000);
    expect(run.plays).toHaveLength(2);
  });

  it("ends before a scheduled sound starts when its response window would open too late", async () => {
    const shell = await calibratedShell();
    const only = cuttableSearch(manyTrials(1000));
    const run = mixedOn(shell, [only.search], scriptedTurns([0]), {
      overrides: { timeLimitMs: 1001 },
    });
    run.runner.start();
    run.advance(1000);
    expect(run.runner.state()).toBe("presented");
    expect(shell.timer.now() + 1).toBeLessThan(run.presented[0]!.windowStartMs);
    run.advance(1);
    expect(run.runner.state()).toBe("finished");
    expect(only.search.responses).toEqual([]);
    expect(run.log().trials[0]?.status).toBe("discarded");
    expect(only.cutOffs.count).toBe(1);
    expect(run.events.at(-1)).toBe("finished");
  });

  it("does not count a pause: the time left is what the pause found", async () => {
    const shell = await calibratedShell();
    const only = cuttableSearch(manyTrials(10_000));
    const run = mixedOn(shell, [only.search], scriptedTurns([0]), {
      overrides: { timeLimitMs: 3000 },
    });
    run.runner.start();
    run.advance(2000);
    run.runner.pause();
    run.advance(600_000);
    expect(run.runner.state()).toBe("paused");
    expect(run.events).toEqual([]);
    run.runner.resume();
    run.advance(999);
    expect(run.runner.state()).toBe("waitingGap");
    run.advance(1);
    expect(run.runner.state()).toBe("finished");
    expect(only.cutOffs.count).toBe(1);
    expect(run.events).toEqual(["trackFinished:corridor", "finished"]);
  });

  it("ends after the remaining time when a pause interrupted a response window", async () => {
    const shell = await calibratedShell();
    const only = cuttableSearch(manyTrials(1000));
    const run = mixedOn(shell, [only.search], scriptedTurns([0]), {
      overrides: { timeLimitMs: 1500 },
    });
    run.runner.start();
    run.advance(1000);
    expect(run.runner.state()).toBe("presented");
    run.advance(400);
    run.runner.pause();
    expect(run.runner.state()).toBe("paused");
    run.advance(1000);
    run.runner.resume();
    expect(run.runner.state()).toBe("waitingGap");
    // 1400 ms of the 1500 have run: the rest of the limit is what the resumed trial's gap meets.
    run.advance(100);
    expect(run.runner.state()).toBe("finished");
    expect(run.events.at(-1)).toBe("finished");
    expect(only.cutOffs.count).toBe(1);
  });

  it("stops its clock when the run ends by itself, and does nothing after an abandon", async () => {
    const shell = await calibratedShell();
    const only = cuttableSearch(manyTrials(10_000));
    const run = mixedOn(shell, [only.search], scriptedTurns([0]), {
      overrides: { timeLimitMs: 3000 },
    });
    run.runner.start();
    run.advance(1000);
    run.runner.abandon();
    run.advance(600_000);
    expect(run.events).toEqual([]);
    expect(only.cutOffs.count).toBe(0);
    expect(shell.timer.pendingCount()).toBe(0);
  });

  it("has no limit when none is given", async () => {
    const shell = await calibratedShell();
    const only = cuttableSearch(manyTrials(10_000));
    const run = mixedOn(shell, [only.search], scriptedTurns([0]));
    run.runner.start();
    // Twenty trials of 10 s gaps and a window each: the search runs to its own end.
    run.advance(300_000);
    expect(run.events).toHaveLength(22);
    expect(run.events.slice(-2)).toEqual([
      "trackFinished:corridor",
      "finished",
    ]);
    expect(only.cutOffs.count).toBe(0);
  });
});

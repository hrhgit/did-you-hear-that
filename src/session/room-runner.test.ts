import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
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
  RoomResult,
  SoundTrial,
  NoSoundTrial,
  ThresholdSearch,
  Trial,
  VisitorResponse,
} from "../engine/search-types";
import type { PresentedTrial, RoomRunnerOptions } from "./room-runner";
import { createRoomRunner } from "./room-runner";
import { roomSearchCapDb } from "./room-search-cap";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type { ScoredVisitTrial } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

const { responseWindowMs } = hearingMethodConfig;
const { scheduleLeadMs, calibrationSettingKeepMinDb } = audioOutputConfig;
const { refusedPlaysInARowMaxCount } = visitFlowConfig;

/** The timer's clock is this far ahead of the audio clock. */
const pageAheadMs = 5000;
/** The output delay the fake backend's timestamp pair reports. */
const outputDelayMs = 30;
/** The visit begins when the timer starts. */
const visitStartMs = pageAheadMs;
const room = visitRooms("quick")[0]!;

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
    respond(response) {
      if (responses.length >= trials.length) {
        throw new Error("The scripted search has finished.");
      }
      responses.push(response);
      return step();
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
    visitType: "quick",
    visitSeed: 1,
    rooms: visitRooms("quick"),
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

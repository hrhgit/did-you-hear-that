import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
import { soundRulesConfig } from "../config/sound-rules-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type {
  AudioOutput,
  PlayRequest,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import type { Ear } from "../engine/search-types";
import type {
  PractisedRoom,
  PractisedRoomsRunnerOptions,
} from "./practised-room-runner";
import {
  createPractisedRoomRunner,
  createPractisedRoomsRunner,
  practiceLevelsDb,
} from "./practised-room-runner";
import type {
  PresentedTrial,
  RoomRunner,
  RoomRunnerState,
} from "./room-runner";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type { PracticeMiss, VisitRoom } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

/** The three rooms most tests of this file use, as the three-room visit of the earlier spec had them. */
const threeRooms: readonly VisitRoom[] = ["corridor", "stairs", "attic"].map(
  (roomId, roomIndex) => ({
    ...visitRooms("full").find((room) => room.roomId === roomId)!,
    roomIndex,
  }),
);

const { upwardStepDb } = hearingMethodConfig;
const { calibrationSettingKeepMinDb } = audioOutputConfig;
const {
  practiceGapMs,
  practiceStartLevelDb,
  practiceSoundsPerEarMaxCount,
  refusedPlaysInARowMaxCount,
} = visitFlowConfig;

/** The timer's clock is this far ahead of the audio clock. */
const pageAheadMs = 5000;
/** The output delay the fake backend's timestamp pair reports. */
const outputDelayMs = 30;
const visitStartMs = pageAheadMs;
const rooms = threeRooms;
const [corridor, stairs, attic] = rooms as [VisitRoom, VisitRoom, VisitRoom];

/** One step louder than the practice starts. */
const louderDb = practiceStartLevelDb + upwardStepDb;

/**
 * A shell on the fake backend, running and calibrated, as the one of `room-runner.test.ts`.
 * `advance` moves the audio clock and the timer together, in whole milliseconds.
 */
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
  advance(10_000);
  return { backend, timer, output, advance };
}

type Shell = Awaited<ReturnType<typeof calibratedShell>>;

const member = (
  room: VisitRoom,
  searchCapDb: number = louderDb,
): PractisedRoom => Object.freeze({ room, attempt: 1, searchCapDb });

/** A counting runner that only records what it is asked. */
function fakeCounting() {
  const calls: string[] = [];
  let state: RoomRunnerState = "idle";
  const track = Object.freeze({ room: attic, attempt: 1 });
  const runner: RoomRunner = {
    start() {
      calls.push("start");
      state = "waitingGap";
    },
    answer(side, pressedAtMs) {
      calls.push(`answer:${side}:${String(pressedAtMs)}`);
    },
    pause() {
      calls.push("pause");
      state = "paused";
    },
    resume() {
      calls.push("resume");
      state = "waitingGap";
    },
    abandon() {
      calls.push("abandon");
      state = "finished";
    },
    state: () => state,
    waitingTrack: () =>
      state === "idle" || state === "finished" ? null : track,
  };
  return { runner, calls, track };
}

/** What the visitor does with one practice sound. */
type Answer = "catch" | "miss" | "otherSide";

const otherEar = (ear: Ear): Ear => (ear === "left" ? "right" : "left");

/**
 * A practice of the given rooms on the shell, in a room in which the sounds take turns, with a
 * fresh recorder. It records every callback in the order it came.
 */
function practiceOn(
  shell: Shell,
  members: readonly PractisedRoom[],
  options: {
    /** How many of the next plays the output refuses as busy. A case may change it as it goes. */
    readonly refusals?: { count: number };
    readonly overrides?: Partial<PractisedRoomsRunnerOptions>;
  } = {},
) {
  const recorder = createVisitLogRecorder({
    visitType: "full",
    visitSeed: 1,
    rooms,
    startedAtMs: visitStartMs,
  });
  for (const { room, searchCapDb } of members) {
    recorder.attemptStarted({
      roomIndex: room.roomIndex,
      engineSeed: room.roomIndex + 1,
      calibrationIndex: 0,
      searchCapDb,
      startedAtMs: shell.timer.now(),
    });
  }
  // As the visit flow begins a room in which several sounds take turns (one-room D4).
  shell.output.beginRoom({ riseLimitPer: "sound" });
  const plays: PlayRequest[] = [];
  const presented: PresentedTrial[] = [];
  const events: string[] = [];
  const notHeard: (readonly PracticeMiss[])[] = [];
  const counting = fakeCounting();
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
  const runner = createPractisedRoomsRunner({
    output,
    timer: shell.timer,
    rooms: members,
    soundRandom: createSeededRandom(5),
    recorder,
    latestOffset: { latestOffsetMs: 0 },
    counting: counting.runner,
    practiceScored: (entry) => {
      const room = rooms[entry.roomIndex]!;
      events.push(`${room.roomId}:${entry.ear}:${entry.outcome}`);
    },
    countingStarted: () => events.push("countingStarted"),
    notHeard: (missed) => {
      notHeard.push(missed);
      events.push("notHeard");
    },
    pauseFromOutput: () => events.push("pauseFromOutput"),
    soundRefused: () => events.push("soundRefused"),
    onTrialPresented: (trial) => presented.push(trial),
    ...options.overrides,
  });
  const advance = (durationMs: number): void => {
    shell.advance(durationMs);
  };
  const advanceTo = (atMs: number): void => {
    advance(Math.max(0, atMs - shell.timer.now()));
  };
  let handled = 0;
  /** Waits for the next practice sound that has not been dealt with, and returns it. */
  const awaitSound = (): PresentedTrial => {
    for (let waitedMs = 0; presented.length <= handled; waitedMs += 1) {
      if (waitedMs > 60_000) {
        throw new Error("No practice sound came.");
      }
      advance(1);
    }
    const trial = presented[handled]!;
    handled += 1;
    return trial;
  };
  /** Waits for the next practice sound and answers it, or lets it go by. */
  const hear = (answer: Answer): PresentedTrial => {
    const trial = awaitSound();
    if (answer === "miss") {
      advanceTo(trial.windowEndMs);
    } else {
      advanceTo(trial.windowStartMs + 300);
      runner.answer(answer === "catch" ? trial.ear! : otherEar(trial.ear!));
    }
    return trial;
  };
  const hearAll = (...answers: readonly Answer[]): void => {
    for (const answer of answers) {
      hear(answer);
    }
  };
  /** The visit log so far, with every run closed as abandoned. */
  const log = () => {
    for (const { room, attempt } of members) {
      recorder.attemptEnded({
        roomIndex: room.roomIndex,
        attempt,
        endedAtMs: shell.timer.now(),
        ending: "abandoned",
        result: null,
      });
    }
    return recorder.log();
  };
  /** What the output was asked to play: the sound, the ear and the level. */
  const asked = () =>
    plays.map(({ soundId, ear, levelDb, purpose }) => {
      if (purpose !== "practice") {
        throw new Error(`A practice asked for a sound for ${purpose}.`);
      }
      return [soundId, ear, levelDb];
    });
  return {
    runner,
    counting,
    plays,
    presented,
    events,
    notHeard,
    advance,
    advanceTo,
    awaitSound,
    hear,
    hearAll,
    asked,
    log,
  };
}

describe("practiceLevelsDb", () => {
  it("starts at the practice level and goes one upward step louder each time", () => {
    expect(practiceLevelsDb(louderDb)).toEqual([
      practiceStartLevelDb,
      louderDb,
    ]);
    expect(practiceLevelsDb(practiceStartLevelDb + 40)).toHaveLength(
      practiceSoundsPerEarMaxCount,
    );
  });

  it("asks for nothing above the room's search cap", () => {
    expect(practiceLevelsDb(practiceStartLevelDb)).toEqual([
      practiceStartLevelDb,
      practiceStartLevelDb,
    ]);
    expect(practiceLevelsDb(practiceStartLevelDb - 10)).toEqual([
      practiceStartLevelDb - 10,
      practiceStartLevelDb - 10,
    ]);
    expect(
      practiceLevelsDb(-12, {
        practiceStartLevelDb: -20,
        upwardStepDb: 5,
        practiceSoundsPerEarMaxCount: 4,
      }),
    ).toEqual([-20, -15, -12, -12]);
  });
});

describe("createPractisedRoomsRunner (one-room, the roll call)", () => {
  it("practises the rooms in the order given, each on the left and then the right, and then starts the counting", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [
      member(corridor),
      member(stairs),
      member(attic),
    ]);
    expect(run.runner.state()).toBe("idle");
    run.runner.start();
    expect(run.runner.state()).toBe("waitingGap");
    // Every practice sound waits the practice gap.
    run.advance(practiceGapMs - 1);
    expect(run.plays).toHaveLength(0);
    run.advance(1);
    expect(run.plays).toHaveLength(1);
    expect(run.runner.state()).toBe("presented");
    const first = run.hear("catch");
    expect(first).toMatchObject({
      kind: "sound",
      ear: "left",
      levelDb: practiceStartLevelDb,
      roomIndex: corridor.roomIndex,
      attempt: 1,
      trialNumber: 1,
      practice: true,
    });
    run.advance(practiceGapMs - 1);
    expect(run.plays).toHaveLength(1);
    run.advance(1);
    expect(run.plays).toHaveLength(2);
    run.hearAll("catch", "catch", "catch", "catch");
    expect(run.counting.calls).toEqual([]);
    expect(run.runner.practice().phase).toBe("practice");
    run.hear("catch");

    expect(run.asked()).toEqual([
      ["corridor", "left", practiceStartLevelDb],
      ["corridor", "right", practiceStartLevelDb],
      ["stairs", "left", practiceStartLevelDb],
      ["stairs", "right", practiceStartLevelDb],
      ["attic", "left", practiceStartLevelDb],
      ["attic", "right", practiceStartLevelDb],
    ]);
    expect(run.events).toEqual([
      "corridor:left:caught",
      "corridor:right:caught",
      "stairs:left:caught",
      "stairs:right:caught",
      "attic:left:caught",
      "attic:right:caught",
      "countingStarted",
    ]);
    expect(run.counting.calls).toEqual(["start"]);
    expect(run.notHeard).toEqual([]);
    expect(run.runner.practice()).toEqual({
      phase: "counting",
      soundPlaying: false,
      soundEar: null,
      notHeardEars: [],
      practising: null,
      notHeard: [],
    });
    const log = run.log();
    expect(
      log.practice?.trials.map((trial) => [
        trial.order,
        trial.roomIndex,
        trial.attempt,
        trial.round,
        trial.practiceNumber,
        trial.ear,
        trial.status,
      ]),
    ).toEqual([
      [1, 0, 1, 1, 1, "left", "scored"],
      [2, 0, 1, 1, 2, "right", "scored"],
      [3, 1, 1, 1, 1, "left", "scored"],
      [4, 1, 1, 1, 2, "right", "scored"],
      [5, 2, 1, 1, 1, "left", "scored"],
      [6, 2, 1, 1, 2, "right", "scored"],
    ]);
    // Nothing of practice reaches the trials of the log.
    expect(log.trials).toEqual([]);
  });

  it("plays a sound that was not caught once more one step louder, and never above its own room's cap", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [
      member(corridor, louderDb),
      member(stairs, practiceStartLevelDb),
      member(attic, practiceStartLevelDb - upwardStepDb),
    ]);
    run.runner.start();
    run.hearAll("miss", "catch", "catch");
    run.hearAll("otherSide", "catch", "catch");
    run.hearAll("catch", "miss", "catch");
    expect(run.asked()).toEqual([
      ["corridor", "left", practiceStartLevelDb],
      ["corridor", "left", louderDb],
      ["corridor", "right", practiceStartLevelDb],
      ["stairs", "left", practiceStartLevelDb],
      ["stairs", "left", practiceStartLevelDb],
      ["stairs", "right", practiceStartLevelDb],
      ["attic", "left", practiceStartLevelDb - upwardStepDb],
      ["attic", "right", practiceStartLevelDb - upwardStepDb],
      ["attic", "right", practiceStartLevelDb - upwardStepDb],
    ]);
    expect(run.events).toEqual([
      "corridor:left:missed",
      "corridor:left:caught",
      "corridor:right:caught",
      "stairs:left:wrongSide",
      "stairs:left:caught",
      "stairs:right:caught",
      "attic:left:caught",
      "attic:right:missed",
      "attic:right:caught",
      "countingStarted",
    ]);
    // A practice sound's number is counted within its own room.
    expect(
      run
        .log()
        .practice?.trials.map((trial) => [
          trial.roomIndex,
          trial.practiceNumber,
        ]),
    ).toEqual([
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it("says once, after the last room, whose sides were not caught, and plays only those again", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [
      member(corridor),
      member(stairs),
      member(attic),
    ]);
    run.runner.start();
    // Murmur: the right is never caught. Squeak: the left is never caught.
    run.hearAll("catch", "miss", "miss");
    expect(run.notHeard).toEqual([]);
    run.hearAll("catch", "catch");
    run.hearAll("miss", "otherSide");
    expect(run.notHeard).toEqual([]);
    run.hear("catch");
    const missed = [
      { room: corridor, ear: "right" },
      { room: attic, ear: "left" },
    ];
    expect(run.notHeard).toEqual([missed]);
    expect(run.events[run.events.length - 1]).toBe("notHeard");
    expect(run.runner.state()).toBe("paused");
    expect(run.runner.waitingTrack()).toBeNull();
    expect(run.runner.practice()).toEqual({
      phase: "notHeard",
      soundPlaying: false,
      soundEar: null,
      notHeardEars: ["right", "left"],
      practising: null,
      notHeard: missed,
    });
    const playedInRoundOne = run.plays.length;
    run.advance(60_000);
    expect(run.plays).toHaveLength(playedInRoundOne);
    expect(run.counting.calls).toEqual([]);

    run.runner.resume();
    expect(run.runner.state()).toBe("waitingGap");
    expect(run.runner.practice()).toMatchObject({
      phase: "practice",
      practising: corridor,
      notHeardEars: [],
      notHeard: [],
    });
    run.hear("catch");
    expect(run.runner.practice().practising).toEqual(attic);
    run.hear("catch");
    expect(run.asked().slice(playedInRoundOne)).toEqual([
      ["corridor", "right", practiceStartLevelDb],
      ["attic", "left", practiceStartLevelDb],
    ]);
    expect(run.notHeard).toHaveLength(1);
    expect(run.events.slice(-3)).toEqual([
      "corridor:right:caught",
      "attic:left:caught",
      "countingStarted",
    ]);
    expect(run.counting.calls).toEqual(["start"]);
    // The second round is counted, and each room's numbers begin again in it.
    expect(
      run
        .log()
        .practice?.trials.filter((trial) => trial.round === 2)
        .map((trial) => [trial.roomIndex, trial.practiceNumber, trial.ear]),
    ).toEqual([
      [0, 1, "right"],
      [2, 1, "left"],
    ]);
  });

  it("asks again after a round that still leaves a side uncaught, and goes on without it when told", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    run.runner.start();
    // Going on does nothing while a round is under way.
    run.runner.goOn();
    run.hearAll("miss", "miss", "catch");
    run.runner.goOn();
    run.hearAll("catch", "miss", "miss");
    expect(run.notHeard).toEqual([
      [
        { room: corridor, ear: "left" },
        { room: stairs, ear: "right" },
      ],
    ]);
    expect(run.counting.calls).toEqual([]);
    run.runner.resume();
    run.hearAll("catch", "miss", "miss");
    expect(run.notHeard).toHaveLength(2);
    expect(run.notHeard[1]).toEqual([{ room: stairs, ear: "right" }]);
    expect(run.runner.practice().notHeardEars).toEqual(["right"]);
    expect(run.events.filter((event) => event === "countingStarted")).toEqual(
      [],
    );
    const played = run.plays.length;
    run.runner.goOn();
    expect(run.events[run.events.length - 1]).toBe("countingStarted");
    expect(run.counting.calls).toEqual(["start"]);
    expect(run.runner.practice().phase).toBe("counting");
    // Once it counts, going on again does nothing and a resume is the counting's.
    run.runner.goOn();
    run.runner.resume();
    run.advance(60_000);
    expect(run.counting.calls).toEqual(["start", "resume"]);
    expect(run.plays).toHaveLength(played);
  });

  it("names both sides once when two rooms miss on the same side", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    run.runner.start();
    run.hearAll("miss", "miss", "catch");
    run.hearAll("miss", "miss", "miss", "miss");
    expect(run.runner.practice()).toMatchObject({
      phase: "notHeard",
      notHeardEars: ["left", "right"],
      notHeard: [
        { room: corridor, ear: "left" },
        { room: stairs, ear: "left" },
        { room: stairs, ear: "right" },
      ],
    });
  });

  it("says which room it practises, and which side only while its sound plays", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    expect(run.runner.waitingTrack()).toBeNull();
    expect(run.runner.practice()).toMatchObject({
      phase: "practice",
      soundPlaying: false,
      soundEar: null,
      practising: corridor,
    });
    run.runner.start();
    expect(run.runner.waitingTrack()).toEqual({ room: corridor, attempt: 1 });
    expect(run.runner.practice()).toMatchObject({
      soundPlaying: false,
      soundEar: null,
    });
    run.advance(practiceGapMs);
    // Its first sound plays from the left, and the creature stands in that doorway.
    expect(run.runner.practice()).toMatchObject({
      soundPlaying: true,
      soundEar: "left",
      practising: corridor,
    });
    run.hear("catch");
    // The corridor's other side is next, and no side is given while its sound waits.
    expect(run.runner.practice()).toMatchObject({
      soundPlaying: false,
      soundEar: null,
      practising: corridor,
    });
    run.hear("catch");
    // The next room is named as soon as the last one's sound is decided.
    expect(run.runner.practice().practising).toEqual(stairs);
    expect(run.runner.waitingTrack()).toEqual({ room: stairs, attempt: 1 });
    run.advance(practiceGapMs);
    const state = run.runner.practice();
    expect(Object.keys(state).sort()).toEqual([
      "notHeard",
      "notHeardEars",
      "phase",
      "practising",
      "soundEar",
      "soundPlaying",
    ]);
    expect(state).toMatchObject({ soundPlaying: true, soundEar: "left" });
    run.hear("catch");
    expect(run.runner.practice()).toMatchObject({
      soundPlaying: false,
      soundEar: null,
    });
  });

  it("logs an answer that decides nothing against the room being practised", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    // Before the start nothing is practised, and nothing is logged.
    run.runner.answer("left");
    run.runner.start();
    run.advance(500);
    run.runner.answer("left");
    run.hearAll("catch", "catch");
    run.advance(500);
    run.runner.answer("right");
    const log = run.log();
    expect(
      log.practice?.ignoredAnswers.map(({ side, roomIndex, attempt }) => [
        side,
        roomIndex,
        attempt,
      ]),
    ).toEqual([
      ["left", corridor.roomIndex, 1],
      ["right", stairs.roomIndex, 1],
    ]);
    expect(log.ignoredAnswers).toEqual([]);
  });

  it("keeps the sound it was on through a pause, with its room, its level and its number", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    run.runner.start();
    run.hearAll("catch", "catch", "miss");
    // The stairs' left sound, one step louder, is playing when the visit pauses.
    const interrupted = run.awaitSound();
    expect(interrupted).toMatchObject({
      roomIndex: stairs.roomIndex,
      ear: "left",
      levelDb: louderDb,
      trialNumber: 2,
    });
    run.runner.pause();
    expect(run.runner.state()).toBe("paused");
    expect(run.runner.practice().soundPlaying).toBe(false);
    expect(run.runner.waitingTrack()).toEqual({ room: stairs, attempt: 1 });
    const played = run.plays.length;
    run.advance(60_000);
    expect(run.plays).toHaveLength(played);
    run.runner.resume();
    run.advance(practiceGapMs - 1);
    expect(run.plays).toHaveLength(played);
    run.advance(1);
    expect(run.plays).toHaveLength(played + 1);
    const again = run.hear("catch");
    expect(again).toMatchObject({
      roomIndex: stairs.roomIndex,
      ear: "left",
      levelDb: louderDb,
      trialNumber: 2,
    });
    run.hear("catch");
    expect(run.events[run.events.length - 1]).toBe("countingStarted");
    expect(
      run
        .log()
        .practice?.trials.filter(
          (trial) => trial.roomIndex === stairs.roomIndex,
        )
        .map((trial) => [trial.practiceNumber, trial.ear, trial.status]),
    ).toEqual([
      [1, "left", "scored"],
      [2, "left", "discarded"],
      [2, "left", "scored"],
      [3, "right", "scored"],
    ]);
  });

  it("waits the whole gap again after a pause in the gap, for the same room", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    run.runner.start();
    run.hearAll("catch", "catch");
    run.advance(practiceGapMs - 100);
    run.runner.pause();
    run.advance(60_000);
    expect(run.plays).toHaveLength(2);
    run.runner.resume();
    run.advance(practiceGapMs - 1);
    expect(run.plays).toHaveLength(2);
    run.advance(1);
    expect(run.asked()[2]).toEqual(["stairs", "left", practiceStartLevelDb]);
    expect(run.log().practice?.trials.map((trial) => trial.status)).toEqual([
      "scored",
      "scored",
    ]);
  });

  it("logs a refused practice sound against its own room and tries it again after the gap", async () => {
    const shell = await calibratedShell();
    const refusals = { count: 0 };
    const run = practiceOn(shell, [member(corridor), member(stairs)], {
      refusals,
    });
    run.runner.start();
    run.hearAll("catch", "catch");
    refusals.count = 1;
    run.advance(practiceGapMs);
    expect(run.presented).toHaveLength(2);
    expect(run.runner.state()).toBe("waitingGap");
    run.advance(practiceGapMs);
    expect(run.presented).toHaveLength(3);
    expect(run.asked().slice(2)).toEqual([
      ["stairs", "left", practiceStartLevelDb],
      ["stairs", "left", practiceStartLevelDb],
    ]);
    expect(
      run
        .log()
        .practice?.refusedPlays.map((play) => [
          play.roomIndex,
          play.attempt,
          play.round,
          play.practiceNumber,
          play.reason,
        ]),
    ).toEqual([[stairs.roomIndex, 1, 1, 1, "busy"]]);
    expect(run.events).not.toContain("soundRefused");
  });

  it("gives up when one practice sound is refused too many times in a row", async () => {
    const shell = await calibratedShell();
    const refusals = { count: refusedPlaysInARowMaxCount };
    const run = practiceOn(shell, [member(corridor), member(stairs)], {
      refusals,
    });
    run.runner.start();
    run.advance(practiceGapMs * refusedPlaysInARowMaxCount);
    expect(run.events).toEqual(["soundRefused"]);
    expect(run.runner.state()).toBe("finished");
    expect(run.runner.waitingTrack()).toBeNull();
    run.advance(60_000);
    expect(run.plays).toHaveLength(refusedPlaysInARowMaxCount);
    expect(run.counting.calls).toEqual([]);
  });

  it("hands every call to the counting once it counts", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    run.runner.start();
    run.hearAll("catch", "catch", "catch", "catch");
    expect(run.counting.calls).toEqual(["start"]);
    expect(run.runner.state()).toBe("waitingGap");
    expect(run.runner.waitingTrack()).toBe(run.counting.track);
    run.runner.answer("left", 123);
    run.runner.pause();
    expect(run.runner.state()).toBe("paused");
    run.runner.resume();
    run.runner.abandon();
    expect(run.runner.state()).toBe("finished");
    expect(run.runner.waitingTrack()).toBeNull();
    // A second end does nothing.
    run.runner.abandon();
    expect(run.counting.calls).toEqual([
      "start",
      "answer:left:123",
      "pause",
      "resume",
      "abandon",
    ]);
    expect(run.runner.practice().phase).toBe("counting");
    expect(run.log().practice?.ignoredAnswers).toEqual([]);
  });

  it("ends the practice on abandon: the playing sound is discarded and the counting never starts", async () => {
    const shell = await calibratedShell();
    const run = practiceOn(shell, [member(corridor), member(stairs)]);
    run.runner.start();
    run.hear("catch");
    run.awaitSound();
    run.runner.abandon();
    expect(run.runner.state()).toBe("finished");
    expect(run.runner.waitingTrack()).toBeNull();
    run.runner.resume();
    run.runner.goOn();
    run.runner.answer("right");
    run.advance(60_000);
    expect(run.plays).toHaveLength(2);
    expect(run.counting.calls).toEqual([]);
    expect(run.events).toEqual(["corridor:left:caught"]);
    const log = run.log();
    expect(
      log.practice?.trials.map((trial) => [trial.roomIndex, trial.status]),
    ).toEqual([
      [corridor.roomIndex, "scored"],
      [corridor.roomIndex, "discarded"],
    ]);
    expect(log.practice?.ignoredAnswers).toEqual([]);
  });

  it("refuses an empty list of rooms", async () => {
    const shell = await calibratedShell();
    expect(() => practiceOn(shell, [])).toThrow(
      "A practice needs at least one room.",
    );
    expect(() => practiceOn(shell, [])).toThrow(RangeError);
  });
});

describe("createPractisedRoomRunner", () => {
  it("practises its one room as the roll call practises each, and says which ears were not caught", async () => {
    const shell = await calibratedShell();
    const recorder = createVisitLogRecorder({
      visitType: "full",
      visitSeed: 1,
      rooms,
      startedAtMs: visitStartMs,
    });
    recorder.attemptStarted({
      roomIndex: stairs.roomIndex,
      engineSeed: 1,
      calibrationIndex: 0,
      searchCapDb: louderDb,
      startedAtMs: shell.timer.now(),
    });
    shell.output.beginRoom();
    const counting = fakeCounting();
    const notHeard: (readonly Ear[])[] = [];
    const presented: PresentedTrial[] = [];
    const events: string[] = [];
    const runner = createPractisedRoomRunner({
      output: shell.output,
      timer: shell.timer,
      room: stairs,
      attempt: 1,
      searchCapDb: louderDb,
      soundRandom: createSeededRandom(5),
      recorder,
      latestOffset: { latestOffsetMs: 0 },
      counting: counting.runner,
      practiceScored: (entry) => events.push(`${entry.ear}:${entry.outcome}`),
      countingStarted: () => events.push("countingStarted"),
      notHeard: (ears) => notHeard.push(ears),
      pauseFromOutput: () => events.push("pauseFromOutput"),
      soundRefused: () => events.push("soundRefused"),
      onTrialPresented: (trial) => presented.push(trial),
    });
    /** Waits for the next practice sound and lets it go by, or answers its side. */
    let handled = 0;
    const hear = (caught: boolean): void => {
      while (presented.length <= handled) {
        shell.advance(1);
      }
      const trial = presented[handled]!;
      handled += 1;
      if (caught) {
        shell.advance(trial.windowStartMs + 300 - shell.timer.now());
        runner.answer(trial.ear!);
      } else {
        shell.advance(trial.windowEndMs - shell.timer.now());
      }
    };
    runner.start();
    hear(false);
    hear(false);
    hear(true);
    expect(notHeard).toEqual([["left"]]);
    expect(runner.practice()).toMatchObject({
      phase: "notHeard",
      notHeardEars: ["left"],
      notHeard: [{ room: stairs, ear: "left" }],
    });
    runner.resume();
    hear(true);
    expect(events).toEqual([
      "left:missed",
      "left:missed",
      "right:caught",
      "left:caught",
      "countingStarted",
    ]);
    expect(counting.calls).toEqual(["start"]);
  });
});

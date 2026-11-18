import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { createManualTimer } from "../config/manual-timer";
import type { ManualTimer } from "../config/manual-timer";
import { missedSoundReplayConfig } from "../config/missed-sound-replay-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import { createSeededRandom } from "../config/seeded-random";
import { soundRulesConfig } from "../config/sound-rules-config";
import { visitFlowConfig } from "../config/visit-flow-config";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRefusal,
  PlayRequest,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import type { OutputState, StopReason } from "../audio/output/output-types";
import type { SoundOutcome } from "../engine/search-types";
import type { MissedSoundReplayOptions } from "./create-missed-sound-replay";
import { createMissedSoundReplay } from "./create-missed-sound-replay";
import { replaySoundOf } from "./replay-sound";
import type {
  Ear,
  GhostSoundId,
  LoggedRoomAttempt,
  ReplaySoundStartedEvent,
  VisitLog,
  VisitTrial,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// The Replay_Controller on the fake audio backend, a calibrated output shell and the manual timer,
// as room-runner.test.ts builds them, and on a scripted output for refusals (missed-sound-replay
// design.md, "The Replay_Controller").

const { replayGapMs } = missedSoundReplayConfig;
const { scheduleLeadMs, calibrationSettingKeepMinDb } = audioOutputConfig;
const { refusedPlaysInARowMaxCount } = visitFlowConfig;

/** The timer's clock is this far ahead of the audio clock. */
const pageAheadMs = 5000;
/** The output delay the fake backend's timestamp pair reports. */
const outputDelayMs = 30;
const rooms = visitRooms("quick");

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function run(roomIndex: number): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 100 * roomIndex + 1,
    calibrationIndex: 0,
    searchCapDb: 10,
    startedAtMs: 10_000 * roomIndex,
    endedAtMs: 10_000 * roomIndex + 9000,
    ending: "finished",
    result: null,
  };
}

function sound(
  order: number,
  roomIndex: number,
  ear: Ear,
  outcome: SoundOutcome,
  playedLevelDb: number,
): VisitTrial {
  const response =
    outcome === "missed"
      ? ("none" as const)
      : outcome === "caught"
        ? ear
        : ear === "left"
          ? ("right" as const)
          : ("left" as const);
  return {
    order,
    roomIndex,
    attempt: 1,
    trialNumber: order,
    gapBeforeMs: 2000,
    presentedAtMs: 3000 * order,
    windowStartMs: 3000 * order + 50,
    kind: "sound",
    ear,
    requestedLevelDb: playedLevelDb,
    playedLevelDb,
    clampLimit: null,
    status: "scored",
    response,
    outcome,
    answeredAtMs: response === "none" ? null : 3000 * order + 600,
    responseTimeMs: response === "none" ? null : 550,
    scoredAtMs: 3000 * order + 600,
  };
}

/** A quick visit with three missed sounds (orders 1, 3 and 4) and one catch. */
function makeLog(
  roomTopLevelDb: Record<GhostSoundId, number>,
  trials: readonly VisitTrial[] = [
    sound(1, 0, "left", "missed", -40),
    sound(2, 0, "right", "caught", -40),
    sound(3, 1, "right", "missed", -35),
    sound(4, 2, "left", "missed", -30),
  ],
): VisitLog {
  return deepFreeze({
    formatVersion: 1,
    visitType: "quick",
    visitSeed: 42,
    rooms,
    calibrations: [
      {
        calibrationIndex: 0,
        settingDb: calibrationSettingKeepMinDb,
        roomTopLevelDb,
        keptAtMs: 0,
      },
    ],
    headphoneChecks: [],
    roomAttempts: [run(0), run(1), run(2)],
    trials,
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  });
}

const flatTops = (levelDb: number): Record<GhostSoundId, number> => ({
  cellar: levelDb,
  corridor: levelDb,
  nursery: levelDb,
  stairs: levelDb,
  attic: levelDb,
});

/**
 * A shell on the fake backend, running and calibrated, as room-runner.test.ts calibrates one.
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
  const kept = output.keepCalibration();
  if (kept.kind !== "kept") {
    throw new Error("The calibration was not kept.");
  }
  output.beginRoom();
  advance(10_000);
  const tops = Object.fromEntries(
    Object.entries(kept.rangeReport.rooms).map(([id, range]) => [
      id,
      range.topLevelDb,
    ]),
  ) as Record<GhostSoundId, number>;
  return { backend, timer, output, advance, tops };
}

type Shell = Awaited<ReturnType<typeof calibratedShell>>;

/**
 * The shell's timer as the controller sees it, counting only the controller's own pending
 * callbacks, because the shell sets timers of its own on the same clock after a stop.
 */
function trackedTimer(timer: Timer) {
  const pending = new Set<TimerHandle>();
  const tracked: Timer = {
    now: () => timer.now(),
    setTimeout(callback, delayMs) {
      const handle = timer.setTimeout(() => {
        pending.delete(handle);
        callback();
      }, delayMs);
      pending.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle);
      timer.clearTimeout(handle);
    },
  };
  return { timer: tracked, pendingCount: () => pending.size };
}

interface Recorded {
  readonly plays: {
    request: PlayRequest;
    atMs: number;
    outcome: PlayOutcome;
  }[];
  readonly events: { event: ReplaySoundStartedEvent; atMs: number }[];
  readonly stopAlls: number[];
  readonly notRunning: StopReason[];
}

/** A controller on the shell, recording every play, event, stopAll and notRunning call. */
function replayOn(
  shell: Shell,
  log: VisitLog = makeLog(shell.tops),
  overrides: Partial<MissedSoundReplayOptions> & {
    readonly outputOverrides?: Partial<AudioOutput>;
  } = {},
) {
  const recorded: Recorded = {
    plays: [],
    events: [],
    stopAlls: [],
    notRunning: [],
  };
  const output: AudioOutput = {
    ...shell.output,
    play(request) {
      const outcome = shell.output.play(request);
      recorded.plays.push({ request, atMs: shell.timer.now(), outcome });
      return outcome;
    },
    stopAll() {
      recorded.stopAlls.push(shell.timer.now());
      shell.output.stopAll();
    },
    ...overrides.outputOverrides,
  };
  const random = createSeededRandom(77);
  const tracked = trackedTimer(shell.timer);
  const controller = createMissedSoundReplay({
    output,
    timer: tracked.timer,
    log,
    random,
    emit: (event) => recorded.events.push({ event, atMs: shell.timer.now() }),
    notRunning: (reason) => recorded.notRunning.push(reason),
    ...overrides,
  });
  return {
    controller,
    recorded,
    random,
    log,
    pendingCount: tracked.pendingCount,
  };
}

/** The page clock time a scheduled outcome ends at, from the start the event gave. */
function endOnPageClock(
  startAtMs: number,
  outcome: PlayOutcome | undefined,
): number {
  if (outcome?.kind !== "scheduled") {
    throw new Error("The play was not scheduled.");
  }
  return startAtMs + (outcome.endMs - outcome.startMs);
}

describe("createMissedSoundReplay on a calibrated shell", () => {
  it("starts in announcing when the plan has a sound, and in nothingMissed when it has none", async () => {
    const shell = await calibratedShell();
    const { controller } = replayOn(shell);
    expect(controller.phase()).toBe("announcing");
    expect(controller.plan.sounds.map((planned) => planned.trialOrder)).toEqual(
      [1, 3, 4],
    );
    expect(controller.view(null).phase).toBe("announcing");

    const nothing = replayOn(
      shell,
      makeLog(shell.tops, [sound(1, 0, "left", "caught", -40)]),
    );
    expect(nothing.controller.phase()).toBe("nothingMissed");
    expect(nothing.controller.view(null).phase).toBe("nothingMissed");
  });

  it("plays nothing until start, and starts only from announcing", async () => {
    const shell = await calibratedShell();
    const nothing = replayOn(
      shell,
      makeLog(shell.tops, [sound(1, 0, "left", "caught", -40)]),
    );
    nothing.controller.start();
    expect(nothing.controller.phase()).toBe("nothingMissed");
    expect(nothing.pendingCount()).toBe(0);

    const { controller, recorded } = replayOn(shell);
    shell.advance(5000);
    expect(recorded.plays).toHaveLength(0);
    controller.start();
    expect(controller.phase()).toBe("playing");
    controller.start();
    shell.advance(replayGapMs);
    expect(recorded.plays).toHaveLength(1);
  });

  it("asks for the first sound one gap after start, with the room's sound, the ear, the asked level, the Purpose replay and the given source", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, random } = replayOn(shell);
    const startedAtMs = shell.timer.now();
    controller.start();
    expect(controller.view(null)).toMatchObject({
      phase: "playing",
      current: null,
      counts: null,
    });
    shell.advance(replayGapMs - 1);
    expect(recorded.plays).toHaveLength(0);
    shell.advance(1);
    expect(recorded.plays).toHaveLength(1);
    const first = recorded.plays[0]!;
    const planned = controller.plan.sounds[0]!;
    expect(first.atMs).toBe(startedAtMs + replayGapMs);
    expect(first.request).toEqual({
      soundId: rooms[0]!.roomId,
      ear: "left",
      levelDb: planned.askedLevelDb,
      purpose: "replay",
      random,
    });
    expect(first.request.random).toBe(random);
    expect(planned.askedLevelDb).toBe(-20);
    expect(first.outcome).toMatchObject({
      kind: "scheduled",
      playedLevelDb: -20,
      clampLimit: null,
    });
  });

  it("hands out replaySoundStarted at the sound's start, converted with the timestamp pair", async () => {
    const shell = await calibratedShell();
    const { controller, recorded } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs);
    const askedAtMs = recorded.plays[0]!.atMs;
    const startAtMs = askedAtMs + scheduleLeadMs + outputDelayMs;
    shell.advance(startAtMs - shell.timer.now() - 1);
    expect(recorded.events).toHaveLength(0);
    expect(controller.view(null)).toMatchObject({ current: null });
    shell.advance(1);
    expect(recorded.events).toHaveLength(1);
    const { event, atMs } = recorded.events[0]!;
    expect(atMs).toBe(startAtMs);
    const outcome = recorded.plays[0]!.outcome;
    if (outcome.kind !== "scheduled") throw new Error("not scheduled");
    expect(event).toEqual({
      kind: "replaySoundStarted",
      sound: replaySoundOf(controller.plan.sounds[0]!, outcome, 1, 3),
    });
    expect(Object.isFrozen(event)).toBe(true);
    const view = controller.view(null);
    expect(view.phase === "playing" && view.current).toEqual(event.sound);
    expect(view.phase === "playing" && view.counts?.throughTrialOrder).toBe(1);
  });

  it("hands out replaySoundStarted at the request plus the scheduling lead without a timestamp pair", async () => {
    const shell = await calibratedShell();
    const { controller, recorded } = replayOn(shell, undefined, {
      outputOverrides: { timestampPair: () => null },
    });
    controller.start();
    shell.advance(replayGapMs);
    const askedAtMs = recorded.plays[0]!.atMs;
    shell.advance(scheduleLeadMs - 1);
    expect(recorded.events).toHaveLength(0);
    shell.advance(1);
    expect(recorded.events[0]?.atMs).toBe(askedAtMs + scheduleLeadMs);
  });

  it("asks for each next sound one gap after the end of the one before, then finishes with allPlayed", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs);
    for (let index = 0; index < 3; index += 1) {
      const play = recorded.plays[index]!;
      const startAtMs = play.atMs + scheduleLeadMs + outputDelayMs;
      const endAtMs = endOnPageClock(startAtMs, play.outcome);
      expect(recorded.events[index - 1]?.event.sound.position ?? 0).toBe(index);
      shell.advance(endAtMs - shell.timer.now());
      expect(recorded.events[index]?.atMs).toBe(startAtMs);
      expect(recorded.events[index]?.event.sound.position).toBe(index + 1);
      if (index < 2) {
        expect(controller.phase()).toBe("playing");
        // The view keeps the sound during the gap after it.
        const view = controller.view(null);
        expect(view.phase === "playing" && view.current?.position).toBe(
          index + 1,
        );
        shell.advance(replayGapMs - 1);
        expect(recorded.plays).toHaveLength(index + 1);
        shell.advance(1);
        expect(recorded.plays).toHaveLength(index + 2);
        expect(recorded.plays[index + 1]?.atMs).toBe(endAtMs + replayGapMs);
      }
    }
    expect(controller.phase()).toBe("finished");
    const view = controller.view(null);
    expect(view).toMatchObject({
      phase: "finished",
      ending: "allPlayed",
      endLine: "That was every sound you did not catch.",
    });
    expect(view.phase === "finished" && view.last?.position).toBe(3);
    expect(recorded.plays.map((play) => play.request.ear)).toEqual([
      "left",
      "right",
      "left",
    ]);
    expect(recorded.plays.map((play) => play.request.soundId)).toEqual(
      rooms.map((room) => room.roomId),
    );
    expect(pendingCount()).toBe(0);
    shell.advance(60_000);
    expect(recorded.plays).toHaveLength(3);
    expect(recorded.events).toHaveLength(3);
  });

  it("calls stopAll on skip while a sound is under way, and not in announcing", async () => {
    const shell = await calibratedShell();
    const announcing = replayOn(shell);
    announcing.controller.skip();
    expect(announcing.recorded.stopAlls).toHaveLength(0);
    expect(announcing.pendingCount()).toBe(0);

    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs + 200);
    expect(recorded.events).toHaveLength(1);
    controller.skip();
    expect(recorded.stopAlls).toHaveLength(1);
    expect(pendingCount()).toBe(0);
    shell.advance(60_000);
    expect(recorded.plays).toHaveLength(1);
    expect(recorded.events).toHaveLength(1);
  });

  it("calls stopAll on skip between a scheduled play and its start", async () => {
    const shell = await calibratedShell();
    const { controller, recorded } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs);
    expect(recorded.events).toHaveLength(0);
    controller.skip();
    expect(recorded.stopAlls).toHaveLength(1);
    shell.advance(60_000);
    expect(recorded.events).toHaveLength(0);
  });

  it("does not call stopAll on skip in a gap", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs);
    const play = recorded.plays[0]!;
    const endAtMs = endOnPageClock(
      play.atMs + scheduleLeadMs + outputDelayMs,
      play.outcome,
    );
    shell.advance(endAtMs - shell.timer.now() + 100);
    controller.skip();
    expect(recorded.stopAlls).toHaveLength(0);
    expect(pendingCount()).toBe(0);
  });

  it("plays a sound cut while it played again from its start one gap after resume", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs + 300);
    expect(recorded.events).toHaveLength(1);
    shell.backend.fire("hidden");
    expect(controller.cut()).toBe(true);
    expect(pendingCount()).toBe(0);
    const paused = controller.view("hidden");
    expect(paused).toMatchObject({
      phase: "playing",
      canSkip: false,
      pauseLine: expect.stringContaining("out of sight") as unknown,
    });
    shell.advance(60_000);
    expect(recorded.plays).toHaveLength(1);
    await shell.output.activate();
    const resumedAtMs = shell.timer.now();
    controller.resume();
    shell.advance(replayGapMs);
    expect(recorded.plays).toHaveLength(2);
    expect(recorded.plays[1]?.atMs).toBe(resumedAtMs + replayGapMs);
    expect(recorded.plays[1]?.request).toEqual(recorded.plays[0]?.request);
    shell.advance(scheduleLeadMs + outputDelayMs);
    expect(recorded.events).toHaveLength(2);
    expect(recorded.events[1]?.event.sound.position).toBe(1);
  });

  it("asks for the next sound one gap after resume when the cut came in a gap", async () => {
    const shell = await calibratedShell();
    const { controller, recorded } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs);
    const play = recorded.plays[0]!;
    const endAtMs = endOnPageClock(
      play.atMs + scheduleLeadMs + outputDelayMs,
      play.outcome,
    );
    shell.advance(endAtMs - shell.timer.now() + 100);
    expect(controller.cut()).toBe(true);
    shell.advance(10_000);
    expect(recorded.plays).toHaveLength(1);
    const resumedAtMs = shell.timer.now();
    controller.resume();
    shell.advance(replayGapMs);
    expect(recorded.plays).toHaveLength(2);
    expect(recorded.plays[1]?.atMs).toBe(resumedAtMs + replayGapMs);
    expect(recorded.plays[1]?.request.levelDb).toBe(
      controller.plan.sounds[1]!.askedLevelDb,
    );
  });

  it("does not cut or resume outside playing", async () => {
    const shell = await calibratedShell();
    const { controller, pendingCount } = replayOn(shell);
    expect(controller.cut()).toBe(false);
    controller.resume();
    expect(pendingCount()).toBe(0);
    expect(controller.phase()).toBe("announcing");
  });

  it("ends with deviceChanged and plays nothing more", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs + 100);
    controller.end("deviceChanged");
    expect(controller.phase()).toBe("finished");
    expect(controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "deviceChanged",
    });
    expect(pendingCount()).toBe(0);
    shell.advance(60_000);
    expect(recorded.plays).toHaveLength(1);
  });

  it("ends with deviceChanged when a play is refused notCalibrated", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.backend.fire("deviceChanged");
    await shell.output.activate();
    shell.advance(replayGapMs);
    expect(recorded.plays[0]?.outcome).toEqual({
      kind: "refused",
      reason: "notCalibrated",
    });
    expect(controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "deviceChanged",
    });
    expect(pendingCount()).toBe(0);
  });

  it("hands the shell's stop reason to notRunning when a play is refused notRunning", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.backend.fire("hidden");
    shell.advance(replayGapMs);
    expect(recorded.plays[0]?.outcome).toEqual({
      kind: "refused",
      reason: "notRunning",
    });
    expect(recorded.notRunning).toEqual(["hidden"]);
    expect(controller.phase()).toBe("playing");
    expect(pendingCount()).toBe(0);
  });

  it("cancels every timer for good", async () => {
    const shell = await calibratedShell();
    const { controller, recorded, pendingCount } = replayOn(shell);
    controller.start();
    shell.advance(replayGapMs + 100);
    controller.cancel();
    expect(pendingCount()).toBe(0);
    shell.advance(60_000);
    expect(recorded.plays).toHaveLength(1);
    expect(recorded.events).toHaveLength(1);
  });

  it("asks again for a first sound refused busy while an earlier sound still plays, and does not count those refusals (R12.3, D9)", async () => {
    const shell = await calibratedShell();
    const { controller, recorded } = replayOn(shell);
    // The last room's sound may still play when the stage begins: the nursery's lasts 1400 ms,
    // longer than the refusals in a row that would end the replay take at one gap each.
    const earlier = shell.output.play({
      soundId: "nursery",
      ear: "right",
      levelDb: -40,
      purpose: "trial",
      random: createSeededRandom(5),
    });
    expect(earlier.kind).toBe("scheduled");
    controller.start();
    shell.advance(20_000);
    const firstScheduled = recorded.plays.findIndex(
      (play) => play.outcome.kind === "scheduled",
    );
    expect(firstScheduled).toBeGreaterThanOrEqual(refusedPlaysInARowMaxCount);
    for (const [index, play] of recorded.plays
      .slice(0, firstScheduled)
      .entries()) {
      expect(play.outcome).toEqual({ kind: "refused", reason: "busy" });
      expect(play.atMs - recorded.plays[0]!.atMs).toBe(index * replayGapMs);
      expect(play.request).toEqual(recorded.plays[0]!.request);
    }
    expect(recorded.plays[firstScheduled]?.request).toEqual(
      recorded.plays[0]!.request,
    );
    expect(recorded.events.map(({ event }) => event.sound.position)).toEqual([
      1, 2, 3,
    ]);
    expect(controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "allPlayed",
    });
  });

  it("leaves the log deep-equal to itself", async () => {
    const shell = await calibratedShell();
    const log = makeLog(shell.tops);
    const before = structuredClone(log);
    const { controller } = replayOn(shell, log);
    controller.start();
    shell.advance(20_000);
    expect(controller.phase()).toBe("finished");
    expect(log).toEqual(before);
  });
});

/** An output that answers `play` from a script, on the manual timer, with no timestamp pair. */
function scriptedOutput(script: readonly PlayOutcome[], state: OutputState) {
  const plays: { request: PlayRequest; atMs: number }[] = [];
  const stopAlls: number[] = [];
  let timer: ManualTimer | null = null;
  const unused = (): never => {
    throw new Error("Not part of the script.");
  };
  const output: AudioOutput = {
    state: () => state,
    activate: unused,
    stopAll: () => {
      stopAlls.push(timer?.now() ?? Number.NaN);
    },
    onStop: unused,
    onUnsupported: unused,
    sampleRateHz: () => soundRulesConfig.sampleRateMinHz,
    beginCalibration: unused,
    playCalibrationRepeat: unused,
    keepCalibration: unused,
    rangeReport: () => null,
    playHeadphoneCheck: unused,
    beginRoom: unused,
    fadeOutSound: () => undefined,
    play(request) {
      const outcome = script[plays.length];
      plays.push({ request, atMs: timer?.now() ?? Number.NaN });
      if (outcome === undefined) {
        throw new Error("The script has no more outcomes.");
      }
      return outcome;
    },
    clampLog: () => [],
    timestampPair: () => null,
  };
  return {
    output,
    plays,
    stopAlls,
    attach(attached: ManualTimer) {
      timer = attached;
    },
  };
}

const scheduled = (durationMs = 1000): PlayOutcome => ({
  kind: "scheduled",
  startMs: 0,
  endMs: durationMs,
  requestedLevelDb: -20,
  playedLevelDb: -20,
  clampLimit: null,
});
const refusedWith = (reason: PlayRefusal): PlayOutcome => ({
  kind: "refused",
  reason,
});

function scriptedReplay(
  script: readonly PlayOutcome[],
  state: OutputState = { kind: "running" },
) {
  const scripted = scriptedOutput(script, state);
  const timer = createManualTimer({ startMs: 1000 });
  scripted.attach(timer);
  const notRunning: StopReason[] = [];
  const events: ReplaySoundStartedEvent[] = [];
  const random: RandomSource = createSeededRandom(3);
  const controller = createMissedSoundReplay({
    output: scripted.output,
    timer,
    log: makeLog(flatTops(15)),
    random,
    emit: (event) => events.push(event),
    notRunning: (reason) => notRunning.push(reason),
  });
  return { controller, timer, notRunning, events, ...scripted };
}

describe("createMissedSoundReplay on a scripted output", () => {
  it.each<[OutputState, StopReason]>([
    [{ kind: "stopped", reason: "hidden" }, "hidden"],
    [{ kind: "stopped", reason: "interrupted" }, "interrupted"],
    [{ kind: "stopped", reason: "pageLeft" }, "pageLeft"],
    [{ kind: "stopped", reason: "deviceChanged" }, "deviceChanged"],
    [{ kind: "stopped", reason: "control" }, "interrupted"],
    [{ kind: "inactive" }, "interrupted"],
    [{ kind: "running" }, "interrupted"],
  ])("hands notRunning the reason %o as %s", (state, reason) => {
    const replay = scriptedReplay([refusedWith("notRunning")], state);
    replay.controller.start();
    replay.timer.advanceBy(replayGapMs);
    expect(replay.notRunning).toEqual([reason]);
    expect(replay.timer.pendingCount()).toBe(0);
    expect(replay.controller.phase()).toBe("playing");
  });

  it("ends with deviceChanged on notCalibrated", () => {
    const replay = scriptedReplay([refusedWith("notCalibrated")]);
    replay.controller.start();
    replay.timer.advanceBy(replayGapMs);
    expect(replay.controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "deviceChanged",
    });
    expect(replay.notRunning).toEqual([]);
  });

  it.each<PlayRefusal>(["busy", "emptyBuffer", "silentBuffer", "unsupported"])(
    "asks for the same sound one gap after a refusal %s",
    (reason) => {
      const replay = scriptedReplay([refusedWith(reason), scheduled()]);
      replay.controller.start();
      replay.timer.advanceBy(replayGapMs);
      expect(replay.plays).toHaveLength(1);
      replay.timer.advanceBy(replayGapMs - 1);
      expect(replay.plays).toHaveLength(1);
      replay.timer.advanceBy(1);
      expect(replay.plays).toHaveLength(2);
      expect(replay.plays[1]?.request).toEqual(replay.plays[0]?.request);
      expect(replay.plays[1]?.atMs).toBe(replay.plays[0]!.atMs + replayGapMs);
    },
  );

  it(`ends with soundRefused after ${String(refusedPlaysInARowMaxCount)} refusals in a row, and a scheduled play resets the count`, () => {
    // Before the first sound has started a busy refusal does not count, so the first sound is
    // refused for another reason; after it, busy refusals count.
    const almostBefore = Array.from(
      { length: refusedPlaysInARowMaxCount - 1 },
      () => refusedWith("peakBoundNotMet"),
    );
    const almost = Array.from({ length: refusedPlaysInARowMaxCount - 1 }, () =>
      refusedWith("busy"),
    );
    const replay = scriptedReplay([
      ...almostBefore,
      scheduled(),
      ...almost,
      scheduled(),
      ...almost,
      refusedWith("busy"),
    ]);
    replay.controller.start();
    replay.timer.advanceBy(60_000);
    expect(replay.plays).toHaveLength(3 * refusedPlaysInARowMaxCount);
    expect(replay.events.map((event) => event.sound.position)).toEqual([1, 2]);
    expect(replay.plays.map((play) => play.request.levelDb)).toEqual([
      ...Array.from(
        { length: refusedPlaysInARowMaxCount },
        () => replay.controller.plan.sounds[0]!.askedLevelDb,
      ),
      ...Array.from(
        { length: refusedPlaysInARowMaxCount },
        () => replay.controller.plan.sounds[1]!.askedLevelDb,
      ),
      ...Array.from(
        { length: refusedPlaysInARowMaxCount },
        () => replay.controller.plan.sounds[2]!.askedLevelDb,
      ),
    ]);
    expect(replay.controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "soundRefused",
      endLine:
        "The house could not play these sounds on this device, so it stopped them. Your picture is ready.",
    });
    expect(replay.timer.pendingCount()).toBe(0);
    expect(replay.stopAlls).toEqual([]);
  });

  it("does not count a busy refusal before the first sound has started, which neither adds to nor resets the refusals in a row (R12.3, D9)", () => {
    const busyBefore = Array.from(
      { length: refusedPlaysInARowMaxCount + 1 },
      () => refusedWith("busy"),
    );
    const counted = Array.from({ length: refusedPlaysInARowMaxCount }, () =>
      refusedWith("peakBoundNotMet"),
    );
    // Busy refusals before, between and after the first counted refusals.
    const script = [
      ...busyBefore,
      counted[0]!,
      refusedWith("busy"),
      ...counted.slice(1),
    ];
    const replay = scriptedReplay(script);
    replay.controller.start();
    replay.timer.advanceBy(60_000);
    expect(replay.plays).toHaveLength(script.length);
    expect(
      replay.plays.map((play) => play.atMs - replay.plays[0]!.atMs),
    ).toEqual(script.map((_, index) => index * replayGapMs));
    expect(new Set(replay.plays.map((play) => play.request.levelDb)).size).toBe(
      1,
    );
    expect(replay.events).toEqual([]);
    expect(replay.controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "soundRefused",
    });
    expect(replay.timer.pendingCount()).toBe(0);
  });

  it("asks again for a first sound refused busy any number of times, and plays it once the output stage takes it (R12.3, D9)", () => {
    const busyBefore = Array.from(
      { length: 2 * refusedPlaysInARowMaxCount },
      () => refusedWith("busy"),
    );
    const replay = scriptedReplay([
      ...busyBefore,
      scheduled(),
      scheduled(),
      scheduled(),
    ]);
    replay.controller.start();
    replay.timer.advanceBy(60_000);
    expect(replay.plays).toHaveLength(busyBefore.length + 3);
    expect(replay.events.map((event) => event.sound.position)).toEqual([
      1, 2, 3,
    ]);
    expect(replay.controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "allPlayed",
    });
  });

  it(`counts busy refusals once the first sound has started: ${String(refusedPlaysInARowMaxCount)} in a row end with soundRefused (R12.3)`, () => {
    const busyAfter = Array.from({ length: refusedPlaysInARowMaxCount }, () =>
      refusedWith("busy"),
    );
    const replay = scriptedReplay([scheduled(), ...busyAfter]);
    replay.controller.start();
    replay.timer.advanceBy(60_000);
    expect(replay.plays).toHaveLength(1 + refusedPlaysInARowMaxCount);
    expect(replay.events.map((event) => event.sound.position)).toEqual([1]);
    expect(replay.controller.view(null)).toMatchObject({
      phase: "finished",
      ending: "soundRefused",
    });
    expect(replay.timer.pendingCount()).toBe(0);
  });

  it("puts the next request one gap after the end of a sound on the timer's clock", () => {
    const replay = scriptedReplay([scheduled(1200), scheduled(800)]);
    replay.controller.start();
    replay.timer.advanceBy(replayGapMs);
    const askedAtMs = replay.plays[0]!.atMs;
    replay.timer.advanceBy(scheduleLeadMs + 1200 + replayGapMs - 1);
    expect(replay.plays).toHaveLength(1);
    replay.timer.advanceBy(1);
    expect(replay.plays[1]?.atMs).toBe(
      askedAtMs + scheduleLeadMs + 1200 + replayGapMs,
    );
  });
});

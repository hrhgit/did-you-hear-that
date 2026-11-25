import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
import type { ListedSoundId } from "../config/sound-id";
import { soundIds } from "../config/sound-id";
import { soundRulesConfig } from "../config/sound-rules-config";
import { calibrationCopy, roomsShortLine } from "../copy/calibration-copy";
import { headphoneCheckCopy } from "../copy/headphone-check-copy";
import { outputStateCopy } from "../copy/output-state-copy";
import type { FakeAudioBackendOptions } from "../audio/output/fake-audio-backend";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import type { ListeningPageSession } from "./listening-page-session";
import { createListeningPageSession } from "./listening-page-session";

const { calibrationRepeatGapMs } = audioOutputConfig;
const { floorDb, startingLevelDb, upwardStepDb, capRelativeToAnchorDb } =
  hearingMethodConfig;

/** The lowest supported rate, where the real renderers are quickest. */
const sampleRateHz = soundRulesConfig.sampleRateMinHz;

/** Where the hiss's calibration starts: the middle of −40…−4 dB, rounded down (audible-start, 2026-11-18). */
const hissStartDb = -22;
/** Where the music's calibration starts: the middle of −40…−5 dB, rounded down to the grid. */
const musicStartDb = -23;

function setup(options: FakeAudioBackendOptions = {}) {
  const backend = createFakeAudioBackend({
    sampleRateHz,
    performanceOffsetMs: 0,
    ...options,
  });
  const timer = createManualTimer();
  const session = createListeningPageSession({
    backend,
    timer,
    random: createSeededRandom(4242),
  });
  const advance = (durationMs: number): void => {
    backend.advanceClockBy(durationMs);
    timer.advanceBy(durationMs);
  };
  /** Waits out the sound now playing, so the next is not refused as busy. */
  const waitOutLastSound = (): void => {
    const scheduled = backend.scheduled();
    const last = scheduled[scheduled.length - 1];
    if (last !== undefined) {
      const endMs =
        last.startMs + (last.left.length / last.sampleRateHz) * 1000;
      advance(Math.max(0, endMs - backend.currentTimeMs()));
    }
  };
  return { backend, timer, session, advance, waitOutLastSound };
}

/**
 * Moves a started hiss calibration from where it starts to `settingDb`, with the Louder or
 * Quieter button, and waits until the sound plays there.
 */
function calibrateTo(
  session: ListeningPageSession,
  advance: (durationMs: number) => void,
  settingDb: number,
): void {
  // Quieter steps down from the setting last played, so each press waits until that setting plays.
  const stepDb = settingDb > hissStartDb ? 1 : -1;
  let expectedDb = hissStartDb;
  while (expectedDb !== settingDb) {
    if (stepDb > 0) {
      session.louder();
    } else {
      session.quieter();
    }
    expectedDb += stepDb;
    for (let repeat = 0; repeat < 30; repeat += 1) {
      if (session.snapshot().calibration.playedSettingDb === expectedDb) {
        break;
      }
      advance(2_000 + calibrationRepeatGapMs);
    }
    expect(session.snapshot().calibration.playedSettingDb).toBe(expectedDb);
  }
}

/** Starts sound, calibrates to `settingDb` with the Louder or Quieter button, and keeps it. */
async function calibrated(
  settingDb: number,
  options: FakeAudioBackendOptions = {},
) {
  const context = setup(options);
  const { session, advance } = context;
  await session.start();
  session.startCalibration();
  calibrateTo(session, advance, settingDb);
  session.keepCalibration();
  expect(session.snapshot().calibration.kept).toMatchObject({ settingDb });
  context.waitOutLastSound();
  return context;
}

function rowOf(session: ListeningPageSession, soundId: ListedSoundId) {
  const row = session.snapshot().rows.find((each) => each.soundId === soundId);
  if (row === undefined) {
    throw new Error(`No row for ${soundId}.`);
  }
  return row;
}

describe("createListeningPageSession", () => {
  it("creates nothing and plays nothing until Start (R19.3)", () => {
    const { backend, session } = setup();
    expect(backend.calls).toEqual([]);
    expect(session.snapshot()).toMatchObject({
      seed: 4242,
      outputState: { kind: "inactive" },
      sampleRateHz: null,
      stateLine: null,
      rows: [],
      rangeReport: null,
      roomsLine: null,
    });
  });

  it("makes the shell's backend calls inside start, before its promise is awaited (D23)", async () => {
    const { backend, session } = setup();
    const started = session.start();
    expect(backend.calls).toEqual([{ kind: "createOrResume" }]);
    await expect(started).resolves.toMatchObject({ kind: "running" });
    expect(session.snapshot()).toMatchObject({
      outputState: { kind: "running" },
      sampleRateHz,
    });
  });

  it("reports a press of Start without a gesture", async () => {
    const { session } = setup({ userActivationActive: false });
    await session.start();
    expect(session.snapshot().activationRefused).toBe(true);
  });

  it("shows the unsupported line for a device that cannot carry the house (R5.5)", async () => {
    const { session } = setup({ sampleRateHz: 16000 });
    await session.start();
    expect(session.snapshot()).toMatchObject({
      outputState: { kind: "unsupported", reason: "sampleRateTooLow" },
      stateLine: outputStateCopy.unsupportedLines.sampleRateTooLow,
    });
  });

  it("plays the first calibration repeat in the middle of the control (R19.5)", async () => {
    const { backend, session } = setup();
    await session.start();
    session.louder();
    session.startCalibration();
    expect(backend.scheduled()).toHaveLength(1);
    expect(session.snapshot().calibration).toMatchObject({
      playing: true,
      playedSettingDb: hissStartDb,
      // The fake has no music file: the calibration sound is the hiss.
      calibrationSound: "hiss",
      line: calibrationCopy.hiss.openLine,
    });
  });

  it("calibrates with the music as the visit does, where the music can be loaded (audible-start Q34)", async () => {
    const sampleCount = 4 * sampleRateHz;
    const peakFraction = 0.92182;
    const rmsFraction = peakFraction / 10 ** (18.4 / 20);
    const squareFraction = Math.sqrt(
      (rmsFraction ** 2 * sampleCount - peakFraction ** 2) / (sampleCount - 1),
    );
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = index % 2 === 0 ? squareFraction : -squareFraction;
    }
    samples[Math.floor(sampleCount / 2)] = peakFraction;
    const { backend, session, advance } = setup({
      calibrationMusic: { mode: "resolve", samples },
    });
    await session.start();
    for (let round = 0; round < 5; round += 1) {
      await Promise.resolve();
    }
    session.startCalibration();
    expect(backend.scheduled()).toEqual([]);
    expect(backend.loopTimeline()).toMatchObject([{ kind: "startLoop" }]);
    expect(session.snapshot().calibration).toMatchObject({
      playing: true,
      calibrationSound: "music",
      controlTopDb: -5,
      playedSettingDb: musicStartDb,
      line: calibrationCopy.openLine,
    });
    // Ten Louder presses take the music from its middle, −23 dB, to −13 dB.
    for (let press = 0; press < 10; press += 1) {
      session.louder();
    }
    for (let elapsedMs = 0; elapsedMs < 20_000; elapsedMs += 10) {
      advance(10);
    }
    session.keepCalibration();
    expect(session.snapshot().calibration.kept).toMatchObject({
      settingDb: musicStartDb + 10,
      anchor: "music",
    });
    expect(backend.loopTimeline().at(-1)).toMatchObject({ kind: "stopLoop" });
  });

  it("shows no rows and no headphone check before a calibration is kept (R19.4)", async () => {
    const { backend, session } = setup();
    await session.start();
    session.startCalibration();
    session.play("cellar", "left");
    session.levelUp("cellar");
    expect(session.snapshot().rows).toEqual([]);
    expect(backend.scheduled()).toHaveLength(1);
  });

  it("shows the six rows after a keep, each at the lower of the starting level and its rounded top (R19.4)", async () => {
    const { session } = await calibrated(-4);
    const { rows, rangeReport } = session.snapshot();
    expect(rows.map((row) => row.soundId)).toEqual(soundIds);
    // The bracketed values of the room-top table in design.md, at the top of the control, with
    // the cap of 5 dB above the anchor (audible-start design.md, "The cap").
    const expectedHighest: Record<ListedSoundId, number> = {
      cellar: 0,
      corridor: 5,
      nursery: 5,
      stairs: 0,
      attic: 5,
      calibration: 0,
    };
    for (const row of rows) {
      expect(row.highestLevelDb, row.soundId).toBe(
        expectedHighest[row.soundId],
      );
      expect(row.levelDb, row.soundId).toBe(
        Math.min(startingLevelDb, row.highestLevelDb),
      );
      expect(row.lowestLevelDb).toBe(floorDb);
      expect(row.roomTopLevelDb).toBe(
        rangeReport?.rooms[row.soundId].topLevelDb,
      );
      expect(row.lastPlay).toBeNull();
    }
  });

  it("gives each row its playable floor, and still lets its control go below it (audible-start D23, Q39)", async () => {
    const { session } = await calibrated(-4);
    const { rows, rangeReport } = session.snapshot();
    for (const row of rows) {
      expect(row.playableFloorLevelDb, row.soundId).toBe(
        rangeReport?.rooms[row.soundId].floorLevelDb,
      );
      // −57.98 − (−4), the table of "The playable floor" in audible-start design.md.
      expect(
        Math.abs(row.playableFloorLevelDb - -53.98),
        row.soundId,
      ).toBeLessThanOrEqual(0.01);
      expect(row.lowestLevelDb, row.soundId).toBeLessThan(
        row.playableFloorLevelDb,
      );
    }
    for (let press = 0; press < 30; press += 1) {
      session.levelDown("attic");
    }
    expect(rowOf(session, "attic").levelDb).toBe(floorDb);
  });

  it("moves a row's level one grid step at a time, between the floor and the rounded top", async () => {
    const { session } = await calibrated(-4);
    session.levelUp("nursery");
    expect(rowOf(session, "nursery").levelDb).toBe(
      startingLevelDb + upwardStepDb,
    );
    for (let press = 0; press < 20; press += 1) {
      session.levelUp("nursery");
    }
    expect(rowOf(session, "nursery").levelDb).toBe(5);
    session.levelDown("nursery");
    expect(rowOf(session, "nursery").levelDb).toBe(5 - upwardStepDb);
    for (let press = 0; press < 40; press += 1) {
      session.levelDown("nursery");
    }
    expect(rowOf(session, "nursery").levelDb).toBe(floorDb);
    expect(rowOf(session, "cellar").levelDb).toBe(startingLevelDb);
  });

  it("gives the rooms line for the five ghost rooms (R16.9)", async () => {
    // At −4 dB the cellar and the stairs cannot reach the cap of 5 dB.
    expect((await calibrated(-4)).session.snapshot().roomsLine).toBe(
      roomsShortLine(2, 5),
    );
    expect((await calibrated(-19)).session.snapshot().roomsLine).toBe(
      roomsShortLine(0, 5),
    );
  });

  it("shows each row's play outcome, with the clamp limit, and the clamp log (R19.6, R19.7)", async () => {
    const { session, backend, waitOutLastSound } = await calibrated(-19);
    session.play("cellar", "left");
    expect(rowOf(session, "cellar").lastPlay).toMatchObject({
      ear: "left",
      outcome: {
        kind: "scheduled",
        requestedLevelDb: startingLevelDb,
        playedLevelDb: startingLevelDb,
        clampLimit: null,
      },
    });
    const played = backend.scheduled()[backend.scheduled().length - 1];
    expect(played?.right.every((sample) => Object.is(sample, 0))).toBe(true);
    waitOutLastSound();

    // Three steps up, a rise of 15 dB on the left ear, is played as asked: the rise limit was
    // dropped by the owner on 2026-11-17, and the cap of 5 dB above the anchor is not passed.
    for (let press = 0; press < 3; press += 1) {
      session.levelUp("corridor");
    }
    session.play("corridor", "left");
    const outcome = rowOf(session, "corridor").lastPlay?.outcome;
    expect(outcome).toMatchObject({
      kind: "scheduled",
      requestedLevelDb: startingLevelDb + 3 * upwardStepDb,
      clampLimit: null,
    });
    expect(
      outcome?.kind === "scheduled" ? outcome.playedLevelDb : Number.NaN,
    ).toBeCloseTo(startingLevelDb + 3 * upwardStepDb, 6);
    expect(session.snapshot().clampLog).toEqual([]);
  });

  it("shows a refusal when a sound is asked for while another plays", async () => {
    const { session } = await calibrated(-19);
    session.play("attic", "right");
    session.play("attic", "left");
    expect(rowOf(session, "attic").lastPlay).toEqual({
      ear: "left",
      outcome: { kind: "refused", reason: "busy" },
    });
  });

  it("plays the headphone check in the left ear, and gives the line for each answer (R19.8)", async () => {
    const { session, backend } = await calibrated(-19);
    session.playHeadphoneCheck();
    expect(session.snapshot().headphoneCheck.lastPlay).toMatchObject({
      kind: "scheduled",
      playedLevelDb: audioOutputConfig.headphoneCheckLevelDb,
    });
    const check = backend.scheduled()[backend.scheduled().length - 1];
    expect(check?.right.every((sample) => Object.is(sample, 0))).toBe(true);
    expect(check?.left.some((sample) => sample !== 0)).toBe(true);

    const expectedLines = {
      left: headphoneCheckCopy.judgementLines.correct,
      right: headphoneCheckCopy.judgementLines.swapped,
      bothSides: headphoneCheckCopy.judgementLines.bothSides,
      nothingHeard: headphoneCheckCopy.judgementLines.notHeard,
    } as const;
    for (const [answer, line] of Object.entries(expectedLines)) {
      session.answerHeadphoneCheck(answer as keyof typeof expectedLines);
      expect(session.snapshot().headphoneCheck.answerLine, answer).toBe(line);
    }
  });

  it("stops all sound with the stop control, ends the calibration loop and shows the stopped line", async () => {
    const { session, backend, advance } = setup();
    await session.start();
    session.startCalibration();
    session.stopAll();
    expect(session.snapshot()).toMatchObject({
      outputState: { kind: "stopped", reason: "control" },
      stateLine: outputStateCopy.stoppedLines.control,
      calibration: { playing: false },
    });
    expect(backend.calls).toContainEqual({
      kind: "fadeToSilence",
      durationMs: audioOutputConfig.stopFadeMs,
    });
    const count = backend.scheduled().length;
    advance(60_000);
    expect(backend.scheduled()).toHaveLength(count);
    session.startCalibration();
    expect(backend.scheduled()).toHaveLength(count);

    await session.start();
    expect(session.snapshot().stateLine).toBeNull();
  });

  it("hides the rows when a device change forgets the calibration (D18)", async () => {
    const { session, backend } = await calibrated(-19);
    expect(session.snapshot().rows).toHaveLength(soundIds.length);
    backend.fire("deviceChanged");
    expect(session.snapshot()).toMatchObject({
      rows: [],
      rangeReport: null,
      roomsLine: null,
      stateLine: outputStateCopy.stoppedLines.deviceChanged,
      calibration: { kept: null },
    });
  });

  it("starts the rows afresh for a new calibration", async () => {
    const { session, advance } = await calibrated(-19);
    session.levelUp("stairs");
    session.play("stairs", "right");
    session.startCalibration();
    expect(session.snapshot().rows).toEqual([]);
    calibrateTo(session, advance, -19);
    session.keepCalibration();
    expect(rowOf(session, "stairs")).toMatchObject({
      levelDb: startingLevelDb,
      lastPlay: null,
    });
  });

  it("calls every subscriber with the new snapshot", async () => {
    const { session } = setup();
    const seen: string[] = [];
    const remove = session.subscribe((snapshot) =>
      seen.push(snapshot.outputState.kind),
    );
    await session.start();
    expect(seen).toContain("running");
    remove();
    const count = seen.length;
    session.stopAll();
    expect(seen).toHaveLength(count);
  });

  it("never asks for a level above the anchor cap", async () => {
    const { session } = await calibrated(-25);
    for (const soundId of soundIds) {
      for (let press = 0; press < 30; press += 1) {
        session.levelUp(soundId);
      }
      expect(rowOf(session, soundId).levelDb).toBe(capRelativeToAnchorDb);
    }
  });
});

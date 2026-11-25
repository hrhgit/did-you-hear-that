import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
import { soundRulesConfig } from "../config/sound-rules-config";
import { calibrationCopy } from "../copy/calibration-copy";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import { createAudioOutput } from "../audio/output/create-audio-output";
import type { FakeAudioBackendOptions } from "../audio/output/fake-audio-backend";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import { createCalibrationController } from "./calibration-controller";

const {
  calibrationSettingMinDb,
  calibrationSettingStepDb,
  calibrationSettingKeepMinDb,
  calibrationRiseMaxDb,
  calibrationRepeatGapMs,
  calibrationMusicGainStepMs,
  calibrationMusicLoadMaxMs,
  scheduleLeadMs,
  stopFadeMs,
} = audioOutputConfig;

/** The lowest supported rate, where the calibration noise renders quickest. */
const sampleRateHz = soundRulesConfig.sampleRateMinHz;

/** Where the hiss's calibration starts: the middle of −40…−4 dB, rounded down (audible-start, 2026-11-18). */
const hissStartDb = -22;
/** Where the music's calibration starts: the middle of −40…−5 dB, rounded down to the grid. */
const musicStartDb = -23;

/**
 * A running shell on the fake backend, whose page clock is the manual timer's clock, and a
 * controller on it. `advance` moves the audio clock and the timer together. The fake has no music
 * file, so the calibration sound is the hiss and the controller plays repeats.
 */
async function setup() {
  const backend = createFakeAudioBackend({
    sampleRateHz,
    performanceOffsetMs: 0,
  });
  const timer = createManualTimer();
  const output = createAudioOutput({ backend, timer });
  await output.activate();
  const controller = createCalibrationController({
    output,
    timer,
    random: createSeededRandom(7),
  });
  const advance = (durationMs: number): void => {
    backend.advanceClockBy(durationMs);
    timer.advanceBy(durationMs);
  };
  const lastRepeat = () => {
    const scheduled = backend.scheduled();
    const last = scheduled[scheduled.length - 1];
    if (last === undefined) {
      throw new Error("No repeat was scheduled.");
    }
    return {
      startMs: last.startMs,
      endMs: last.startMs + (last.left.length / last.sampleRateHz) * 1000,
    };
  };
  /** Moves both clocks to `calibrationRepeatGapMs` after the last repeat's end, minus the lead. */
  const advanceToNextRepeat = (): void => {
    const nextAskMs =
      lastRepeat().endMs + calibrationRepeatGapMs - scheduleLeadMs;
    advance(Math.max(0, nextAskMs - backend.currentTimeMs()));
  };
  return {
    backend,
    timer,
    output,
    controller,
    advance,
    lastRepeat,
    advanceToNextRepeat,
  };
}

describe("createCalibrationController", () => {
  it("plays nothing until opened, then the first repeat at once, at the middle of the control (R16.1)", async () => {
    const { backend, controller } = await setup();
    expect(backend.scheduled()).toHaveLength(0);
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      playedSettingDb: null,
      line: calibrationCopy.hiss.openLine,
      calibrationSound: "hiss",
    });

    controller.open();
    expect(backend.scheduled()).toHaveLength(1);
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      targetSettingDb: hissStartDb,
      playedSettingDb: hissStartDb,
      atTop: false,
    });
  });

  it("starts each repeat calibrationRepeatGapMs after the end of the one before (R16.11)", async () => {
    const { backend, controller, advance, lastRepeat } = await setup();
    controller.open();
    for (let repeat = 1; repeat < 4; repeat += 1) {
      const previous = lastRepeat();
      const askAtMs = previous.endMs + calibrationRepeatGapMs - scheduleLeadMs;
      advance(askAtMs - backend.currentTimeMs() - 1);
      expect(backend.scheduled()).toHaveLength(repeat);
      advance(1);
      expect(backend.scheduled()).toHaveLength(repeat + 1);
      expect(lastRepeat().startMs - previous.endMs).toBeCloseTo(
        calibrationRepeatGapMs,
        9,
      );
    }
  });

  // The owner dropped the 5 dB limit on 2026-11-16 after playing: the next repeat plays the target.
  it("shows the played setting, which reaches the target at the next repeat (R16.2)", async () => {
    const { controller, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 12; press += 1) {
      controller.louder();
    }
    expect(controller.snapshot()).toMatchObject({
      targetSettingDb: hissStartDb + 12,
      playedSettingDb: hissStartDb,
    });
    expect(calibrationRiseMaxDb).toBeGreaterThanOrEqual(12);

    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(hissStartDb + 12);
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(hissStartDb + 12);
  });

  it("moves the target down from the played setting, never above it", async () => {
    const { controller, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 10; press += 1) {
      controller.louder();
    }
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(hissStartDb + 10);
    controller.quieter();
    expect(controller.snapshot().targetSettingDb).toBe(hissStartDb + 9);
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(hissStartDb + 9);
  });

  it("keeps the target within the control", async () => {
    const { controller } = await setup();
    controller.open();
    controller.quieter();
    expect(controller.snapshot().targetSettingDb).toBe(
      hissStartDb - calibrationSettingStepDb,
    );
    controller.setTarget(Number.NEGATIVE_INFINITY);
    expect(controller.snapshot().targetSettingDb).toBe(calibrationSettingMinDb);
    for (let press = 0; press < 100; press += 1) {
      controller.louder();
    }
    expect(controller.snapshot().targetSettingDb).toBe(
      calibrationSettingTopDb(),
    );
  });

  it("shows the top line once a repeat plays at the top (R16.7)", async () => {
    const { controller, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 100; press += 1) {
      controller.louder();
    }
    for (let repeat = 0; repeat < 20; repeat += 1) {
      if (controller.snapshot().atTop) {
        break;
      }
      advanceToNextRepeat();
    }
    expect(controller.snapshot()).toMatchObject({
      playedSettingDb: calibrationSettingTopDb(),
      atTop: true,
      line: calibrationCopy.hiss.atTopLine,
    });
  });

  it("stops the loop on a stop, and a new open starts again from the middle", async () => {
    const { backend, output, controller, advance, advanceToNextRepeat } =
      await setup();
    controller.open();
    controller.louder();
    controller.louder();
    advanceToNextRepeat();
    output.stopAll();
    expect(controller.snapshot().playing).toBe(false);
    const count = backend.scheduled().length;
    advance(60_000);
    expect(backend.scheduled()).toHaveLength(count);

    await output.activate();
    advance(60_000);
    expect(backend.scheduled()).toHaveLength(count);
    controller.open();
    expect(backend.scheduled()).toHaveLength(count + 1);
    expect(controller.snapshot().playedSettingDb).toBe(hissStartDb);
  });

  it("stops the loop on close", async () => {
    const { backend, controller, advance } = await setup();
    controller.open();
    controller.close();
    expect(controller.snapshot().playing).toBe(false);
    advance(60_000);
    expect(backend.scheduled()).toHaveLength(1);
  });

  it("refuses a setting below the Keep_Minimum with the volume line and goes on playing (R16.6)", async () => {
    const { backend, controller, advance, advanceToNextRepeat } = await setup();
    controller.open();
    // Dragged below the Keep_Minimum and played, so the volume is high.
    controller.setTarget(calibrationSettingKeepMinDb - 3);
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(
      calibrationSettingKeepMinDb - 3,
    );
    const outcome = controller.keep();
    expect(outcome).toEqual({ kind: "refused", reason: "systemVolumeHigh" });
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      keepRefusal: "systemVolumeHigh",
      line: calibrationCopy.hiss.systemVolumeHighLine,
    });
    advance(5_000);
    expect(backend.scheduled().length).toBeGreaterThan(1);
  });

  it("keeps the setting last played, ends the loop and shows the kept line (R16.4, R16.8)", async () => {
    const { backend, controller, advance, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 10; press += 1) {
      controller.louder();
    }
    for (let repeat = 0; repeat < 8; repeat += 1) {
      advanceToNextRepeat();
    }
    const played = controller.snapshot().playedSettingDb;
    expect(played).toBe(hissStartDb + 10);
    expect(played).toBeGreaterThanOrEqual(calibrationSettingKeepMinDb);
    expect(controller.snapshot().line).toBe(calibrationCopy.hiss.openLine);

    const outcome = controller.keep();
    expect(outcome).toMatchObject({ kind: "kept", settingDb: played });
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      kept: { settingDb: played, anchor: "hiss" },
      line: calibrationCopy.keptLine,
    });
    const count = backend.scheduled().length;
    advance(60_000);
    expect(backend.scheduled()).toHaveLength(count);
  });

  it("forgets the kept calibration on a device change", async () => {
    const { backend, controller, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 20; press += 1) {
      controller.louder();
    }
    for (let repeat = 0; repeat < 4; repeat += 1) {
      advanceToNextRepeat();
    }
    controller.keep();
    backend.fire("deviceChanged");
    expect(controller.snapshot().kept).toBeNull();
  });

  it("ends the loop with the refusal when the shell is not running", async () => {
    const backend = createFakeAudioBackend({ sampleRateHz });
    const timer = createManualTimer();
    const output = createAudioOutput({ backend, timer });
    const controller = createCalibrationController({
      output,
      timer,
      random: createSeededRandom(1),
    });
    controller.open();
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      repeatRefusal: "notRunning",
    });
    expect(backend.calls).toEqual([]);
  });

  describe('setTarget (audible-start design.md, "The calibration target")', () => {
    // Every row of the table, through the controller.
    it.each([
      ["on the grid, in range", -20, -20],
      ["between grid settings", -20.5, -21],
      ["within the tolerance below a grid setting", -20 - 1e-12, -20],
      ["below the bottom", -75, calibrationSettingMinDb],
      ["−Infinity", Number.NEGATIVE_INFINITY, calibrationSettingMinDb],
      ["above the top", 3, calibrationSettingTopDb()],
      ["+Infinity", Number.POSITIVE_INFINITY, calibrationSettingTopDb()],
    ])(
      "%s: %s gives the target %s and notifies",
      async (_row, settingDb, expectedDb) => {
        const { controller } = await setup();
        controller.open();
        let changes = 0;
        controller.onChange(() => {
          changes += 1;
        });
        controller.setTarget(settingDb);
        expect(controller.snapshot().targetSettingDb).toBe(expectedDb);
        expect(changes).toBe(1);
      },
    );

    it.each([Number.NaN, "-20", undefined, null])(
      "changes nothing and notifies nothing for %s",
      async (settingDb) => {
        const { controller } = await setup();
        controller.open();
        controller.setTarget(-30);
        const before = controller.snapshot();
        let changes = 0;
        controller.onChange(() => {
          changes += 1;
        });
        controller.setTarget(settingDb as number);
        expect(controller.snapshot()).toEqual(before);
        expect(changes).toBe(0);
      },
    );

    it("takes a target set before open, and open puts the target at the middle of the control (D3)", async () => {
      const { backend, controller } = await setup();
      controller.setTarget(-10);
      expect(controller.snapshot().targetSettingDb).toBe(-10);
      expect(backend.scheduled()).toHaveLength(0);
      controller.open();
      expect(controller.snapshot()).toMatchObject({
        targetSettingDb: hissStartDb,
        playedSettingDb: hissStartDb,
      });
    });

    // The owner dropped the 5 dB limit on 2026-11-16 after playing: the next repeat is the top.
    it("plays the next repeat at a target dragged to the top (R3.8)", async () => {
      const { controller, advanceToNextRepeat } = await setup();
      controller.open();
      controller.setTarget(Number.POSITIVE_INFINITY);
      const played = [controller.snapshot().playedSettingDb];
      for (let repeat = 0; repeat < 20; repeat += 1) {
        advanceToNextRepeat();
        played.push(controller.snapshot().playedSettingDb);
      }
      expect(played).toEqual([hissStartDb, ...Array<number>(20).fill(-4)]);
      expect(controller.snapshot()).toMatchObject({
        targetSettingDb: calibrationSettingTopDb(),
        atTop: true,
      });
    });

    it("lets louder and quieter go on from a dragged target as before", async () => {
      const { controller, advanceToNextRepeat } = await setup();
      controller.open();
      // Dragged above the played setting, so louder goes on from the target.
      controller.setTarget(-10);
      controller.louder();
      expect(controller.snapshot().targetSettingDb).toBe(-9);
      advanceToNextRepeat();
      expect(controller.snapshot().playedSettingDb).toBe(-9);
      controller.setTarget(-20);
      controller.quieter();
      expect(controller.snapshot().targetSettingDb).toBe(-10);
    });
  });

  it("gives with louder and quieter the targets they gave before audible-start (D2)", async () => {
    const { controller, advanceToNextRepeat } = await setup();
    const topDb = calibrationSettingTopDb();
    /** The rule of louder and quieter before audible-start, written out. */
    const before = {
      louder: (targetDb: number, playedDb: number | null): number =>
        Math.min(
          topDb,
          Math.max(
            calibrationSettingMinDb,
            Math.max(targetDb, playedDb ?? targetDb) + calibrationSettingStepDb,
          ),
        ),
      quieter: (targetDb: number, playedDb: number | null): number =>
        Math.min(
          topDb,
          Math.max(
            calibrationSettingMinDb,
            (playedDb ?? targetDb) - calibrationSettingStepDb,
          ),
        ),
    };
    const presses: readonly ("louder" | "quieter" | "wait")[] = [
      ...Array<"louder">(9).fill("louder"),
      "wait",
      "quieter",
      "quieter",
      "wait",
      ...Array<"louder">(70).fill("louder"),
      "wait",
      "wait",
      "quieter",
      ...Array<"quieter">(70).fill("quieter"),
      "wait",
      "louder",
    ];
    controller.quieter();
    controller.open();
    for (const press of presses) {
      if (press === "wait") {
        advanceToNextRepeat();
        continue;
      }
      const { targetSettingDb, playedSettingDb } = controller.snapshot();
      controller[press]();
      expect(controller.snapshot().targetSettingDb, press).toBe(
        before[press](targetSettingDb, playedSettingDb),
      );
    }
  });

  it("calls every change listener", async () => {
    const { controller } = await setup();
    let changes = 0;
    const remove = controller.onChange(() => {
      changes += 1;
    });
    controller.open();
    controller.louder();
    expect(changes).toBe(2);
    remove();
    controller.louder();
    expect(changes).toBe(2);
  });
});

describe("createCalibrationController with the calibration music (audible-start R4 to R7)", () => {
  /** Music-like samples made in code, with the crest factor of the measured file (18.4 dB). */
  function musicSamples(): Float32Array {
    const sampleCount = 4 * sampleRateHz;
    const peakFraction = 0.92182;
    // The crest factor of 18.4 dB as a ratio of peak to RMS.
    const rmsFraction = peakFraction / 10 ** (18.4 / 20);
    const squareFraction = Math.sqrt(
      (rmsFraction ** 2 * sampleCount - peakFraction ** 2) / (sampleCount - 1),
    );
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = index % 2 === 0 ? squareFraction : -squareFraction;
    }
    samples[Math.floor(sampleCount / 2)] = peakFraction;
    return samples;
  }

  async function flush(): Promise<void> {
    for (let round = 0; round < 5; round += 1) {
      await Promise.resolve();
    }
  }

  async function musicSetup(options: FakeAudioBackendOptions = {}) {
    const backend = createFakeAudioBackend({
      sampleRateHz,
      performanceOffsetMs: 0,
      calibrationMusic: { mode: "resolve", samples: musicSamples() },
      ...options,
    });
    const timer = createManualTimer();
    const output = createAudioOutput({ backend, timer });
    const controller = createCalibrationController({
      output,
      timer,
      random: createSeededRandom(7),
    });
    await output.activate();
    await flush();
    /** Moves both clocks together, 10 ms at a time, as the browser's do. */
    const advance = (durationMs: number): void => {
      for (let doneMs = 0; doneMs < durationMs; doneMs += 10) {
        const chunkMs = Math.min(10, durationMs - doneMs);
        backend.advanceClockBy(chunkMs);
        timer.advanceBy(chunkMs);
      }
    };
    const loopCalls = () =>
      backend.loopTimeline().filter((call) => call.kind !== "fadeToSilence");
    return { backend, timer, output, controller, advance, loopCalls };
  }

  it("plays the music, not the repeats, from the middle of the control, with the music's lines", async () => {
    const { backend, controller, loopCalls } = await musicSetup();
    expect(controller.snapshot()).toMatchObject({
      calibrationSound: "music",
      controlTopDb: -5,
      line: calibrationCopy.openLine,
      playing: false,
    });
    controller.open();
    expect(backend.scheduled()).toEqual([]);
    expect(loopCalls()).toHaveLength(1);
    expect(loopCalls()[0]).toMatchObject({ kind: "startLoop" });
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      targetSettingDb: musicStartDb,
      playedSettingDb: musicStartDb,
      atTop: false,
      line: calibrationCopy.openLine,
    });
  });

  // The owner dropped the slow rise on 2026-11-16 after playing: one step reaches the target.
  it("hands the target to the shell, and the played setting follows the settings the shell's steps reach", async () => {
    const { controller, advance } = await musicSetup();
    controller.open();
    controller.setTarget(-30);
    const played: number[] = [];
    for (let step = 0; step < 50; step += 1) {
      advance(calibrationMusicGainStepMs);
      played.push(controller.snapshot().playedSettingDb ?? Number.NaN);
    }
    // A step is shown once its ramp has ended, at the next step.
    expect(played.slice(0, 3)).toEqual([musicStartDb, -30, -30]);
    for (let index = 1; index < played.length; index += 1) {
      expect(played[index] - played[index - 1]).toBeLessThanOrEqual(
        calibrationRiseMaxDb,
      );
    }
    advance(calibrationMusicGainStepMs);
    expect(controller.snapshot().playedSettingDb).toBe(-30);
    controller.quieter();
    expect(controller.snapshot().targetSettingDb).toBe(-31);
    advance(3 * calibrationMusicGainStepMs);
    expect(controller.snapshot().playedSettingDb).toBe(-31);
  });

  it("rises to the music's top of −5 dB, says it is at the top, and keeps the target within it", async () => {
    const { controller, advance } = await musicSetup();
    controller.open();
    controller.setTarget(Number.POSITIVE_INFINITY);
    expect(controller.snapshot().targetSettingDb).toBe(-5);
    advance(25_000);
    expect(controller.snapshot()).toMatchObject({
      playedSettingDb: -5,
      atTop: true,
      line: calibrationCopy.atTopLine,
    });
  });

  it("keeps the setting the music reached, stops it, and records the music as the anchor", async () => {
    const { controller, advance, loopCalls } = await musicSetup();
    controller.open();
    controller.setTarget(calibrationSettingKeepMinDb + 2);
    advance(30_000);
    const outcome = controller.keep();
    expect(outcome).toMatchObject({
      kind: "kept",
      settingDb: calibrationSettingKeepMinDb + 2,
    });
    expect(loopCalls().at(-1)).toMatchObject({
      kind: "stopLoop",
      fadeOutMs: stopFadeMs,
    });
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      kept: { settingDb: calibrationSettingKeepMinDb + 2, anchor: "music" },
      line: calibrationCopy.keptLine,
    });
  });

  it("refuses a setting below the Keep_Minimum with the music's volume line, and the music plays on", async () => {
    const { controller, advance, loopCalls } = await musicSetup();
    controller.open();
    // Dragged below the Keep_Minimum and reached by the music, so the volume is high.
    controller.setTarget(calibrationSettingKeepMinDb - 3);
    advance(30_000);
    expect(controller.keep()).toEqual({
      kind: "refused",
      reason: "systemVolumeHigh",
    });
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      line: calibrationCopy.systemVolumeHighLine,
    });
    expect(loopCalls().some((call) => call.kind === "stopLoop")).toBe(false);
  });

  it("stops the music on close and on a stop", async () => {
    const { output, controller, loopCalls, advance } = await musicSetup();
    controller.open();
    controller.close();
    expect(loopCalls().at(-1)).toMatchObject({ kind: "stopLoop" });
    expect(controller.snapshot().playing).toBe(false);
    advance(1_000);
    controller.open();
    expect(controller.snapshot().playing).toBe(true);
    output.stopAll();
    expect(controller.snapshot().playing).toBe(false);
    const callCount = loopCalls().length;
    advance(5_000);
    expect(loopCalls()).toHaveLength(callCount);
  });

  it("while the music loads, gives the loading line, remembers the start and plays the music once it is ready", async () => {
    const { backend, controller, loopCalls } = await musicSetup({
      calibrationMusic: { mode: "pending" },
    });
    expect(controller.snapshot()).toMatchObject({
      calibrationSound: "loading",
      line: calibrationCopy.loadingLine,
      controlTopDb: calibrationSettingTopDb(),
    });
    controller.open();
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      line: calibrationCopy.loadingLine,
    });
    expect(loopCalls()).toEqual([]);
    expect(backend.scheduled()).toEqual([]);
    backend.resolveCalibrationMusic(musicSamples());
    await flush();
    expect(loopCalls()).toHaveLength(1);
    expect(controller.snapshot()).toMatchObject({
      calibrationSound: "music",
      playing: true,
      controlTopDb: -5,
      targetSettingDb: musicStartDb,
      playedSettingDb: musicStartDb,
      line: calibrationCopy.openLine,
    });
  });

  it("while the music loads, plays the first hiss repeat once loading has failed", async () => {
    const { backend, timer, controller, loopCalls } = await musicSetup({
      calibrationMusic: { mode: "pending" },
    });
    controller.open();
    timer.advanceBy(calibrationMusicLoadMaxMs);
    expect(backend.scheduled()).toHaveLength(1);
    expect(loopCalls()).toEqual([]);
    expect(controller.snapshot()).toMatchObject({
      calibrationSound: "hiss",
      playing: true,
      playedSettingDb: hissStartDb,
      controlTopDb: calibrationSettingTopDb(),
      line: calibrationCopy.hiss.openLine,
    });
  });

  it("does not start the sound when loading ends after the calibration was closed", async () => {
    const { backend, controller, loopCalls } = await musicSetup({
      calibrationMusic: { mode: "pending" },
    });
    controller.open();
    controller.close();
    backend.resolveCalibrationMusic(musicSamples());
    await flush();
    expect(loopCalls()).toEqual([]);
    expect(controller.snapshot().playing).toBe(false);
  });

  it("does not start the sound when loading ends after a stop", async () => {
    const { backend, output, controller, loopCalls } = await musicSetup({
      calibrationMusic: { mode: "pending" },
    });
    controller.open();
    output.stopAll();
    backend.resolveCalibrationMusic(musicSamples());
    await flush();
    expect(loopCalls()).toEqual([]);
  });

  it("brings a target above the music's top down to it when the music becomes ready", async () => {
    const { backend, controller } = await musicSetup({
      calibrationMusic: { mode: "pending" },
    });
    controller.setTarget(Number.POSITIVE_INFINITY);
    expect(controller.snapshot().targetSettingDb).toBe(
      calibrationSettingTopDb(),
    );
    backend.resolveCalibrationMusic(musicSamples());
    await flush();
    expect(controller.snapshot().targetSettingDb).toBe(-5);
  });

  it("gives the hiss's lines when the music could not be loaded", async () => {
    const { controller, advance } = await musicSetup({
      calibrationMusic: { mode: "reject" },
    });
    expect(controller.snapshot()).toMatchObject({
      calibrationSound: "hiss",
      line: calibrationCopy.hiss.openLine,
    });
    controller.open();
    // Dragged below the Keep_Minimum and played, so the volume is high.
    controller.setTarget(calibrationSettingKeepMinDb - 3);
    advance(10_000);
    expect(controller.keep()).toMatchObject({ reason: "systemVolumeHigh" });
    expect(controller.snapshot().line).toBe(
      calibrationCopy.hiss.systemVolumeHighLine,
    );
  });

  it("tries the start again after calibrationRepeatGapMs when the shell is busy", async () => {
    const { backend, output, controller, advance, loopCalls } =
      await musicSetup();
    output.beginCalibration();
    const repeat = output.playCalibrationRepeat({
      requestedSettingDb: calibrationSettingMinDb,
      random: createSeededRandom(3),
    });
    expect(repeat.kind).toBe("scheduled");
    controller.open();
    expect(controller.snapshot().repeatRefusal).toBe("busy");
    expect(loopCalls()).toEqual([]);
    if (repeat.kind === "scheduled") {
      advance(repeat.endMs - backend.currentTimeMs() + calibrationRepeatGapMs);
    }
    expect(loopCalls()).toHaveLength(1);
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      repeatRefusal: null,
    });
  });
});

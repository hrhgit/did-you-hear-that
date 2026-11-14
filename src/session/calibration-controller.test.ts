import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { createManualTimer } from "../config/manual-timer";
import { createSeededRandom } from "../config/seeded-random";
import { soundRulesConfig } from "../config/sound-rules-config";
import { calibrationCopy } from "../copy/calibration-copy";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import { createAudioOutput } from "../audio/output/create-audio-output";
import { createFakeAudioBackend } from "../audio/output/fake-audio-backend";
import { createCalibrationController } from "./calibration-controller";

const {
  calibrationSettingMinDb,
  calibrationSettingKeepMinDb,
  calibrationRiseMaxDb,
  calibrationRepeatGapMs,
  scheduleLeadMs,
} = audioOutputConfig;

/** The lowest supported rate, where the calibration noise renders quickest. */
const sampleRateHz = soundRulesConfig.sampleRateMinHz;

/**
 * A running shell on the fake backend, whose page clock is the manual timer's clock, and a
 * controller on it. `advance` moves the audio clock and the timer together.
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
  it("plays nothing until opened, then the first repeat at once, at the bottom of the control (R16.1)", async () => {
    const { backend, controller } = await setup();
    expect(backend.scheduled()).toHaveLength(0);
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      playedSettingDb: null,
      line: calibrationCopy.openLine,
    });

    controller.open();
    expect(backend.scheduled()).toHaveLength(1);
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      targetSettingDb: calibrationSettingMinDb,
      playedSettingDb: calibrationSettingMinDb,
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

  it("shows the played setting, which rises by at most calibrationRiseMaxDb per repeat (R16.2)", async () => {
    const { controller, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 12; press += 1) {
      controller.louder();
    }
    expect(controller.snapshot()).toMatchObject({
      targetSettingDb: calibrationSettingMinDb + 12,
      playedSettingDb: calibrationSettingMinDb,
    });

    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(
      calibrationSettingMinDb + calibrationRiseMaxDb,
    );
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(
      calibrationSettingMinDb + 2 * calibrationRiseMaxDb,
    );
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(
      calibrationSettingMinDb + 12,
    );
  });

  it("moves the target down from the played setting, never above it", async () => {
    const { controller, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 10; press += 1) {
      controller.louder();
    }
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(-55);
    controller.quieter();
    expect(controller.snapshot().targetSettingDb).toBe(-56);
    advanceToNextRepeat();
    expect(controller.snapshot().playedSettingDb).toBe(-56);
  });

  it("keeps the target within the control", async () => {
    const { controller } = await setup();
    controller.open();
    controller.quieter();
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
      line: calibrationCopy.atTopLine,
    });
  });

  it("stops the loop on a stop, and a new open starts again from the bottom", async () => {
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
    expect(controller.snapshot().playedSettingDb).toBe(calibrationSettingMinDb);
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
    const { backend, controller, advance } = await setup();
    controller.open();
    const outcome = controller.keep();
    expect(outcome).toEqual({ kind: "refused", reason: "systemVolumeHigh" });
    expect(controller.snapshot()).toMatchObject({
      playing: true,
      keepRefusal: "systemVolumeHigh",
      line: calibrationCopy.systemVolumeHighLine,
    });
    advance(5_000);
    expect(backend.scheduled().length).toBeGreaterThan(1);
  });

  it("keeps the setting last played, ends the loop and shows the kept line (R16.4, R16.8)", async () => {
    const { backend, controller, advance, advanceToNextRepeat } = await setup();
    controller.open();
    for (let press = 0; press < 20; press += 1) {
      controller.louder();
    }
    for (let repeat = 0; repeat < 4; repeat += 1) {
      advanceToNextRepeat();
    }
    const played = controller.snapshot().playedSettingDb;
    expect(played).toBe(calibrationSettingMinDb + 20);
    expect(played).toBeGreaterThanOrEqual(calibrationSettingKeepMinDb);
    expect(controller.snapshot().line).toBe(calibrationCopy.openLine);

    const outcome = controller.keep();
    expect(outcome).toMatchObject({ kind: "kept", settingDb: played });
    expect(controller.snapshot()).toMatchObject({
      playing: false,
      kept: { settingDb: played },
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

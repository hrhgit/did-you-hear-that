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
  calibrationSettingStepDb,
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

    it("takes a target set before open, and open puts the target at the bottom (D3)", async () => {
      const { backend, controller } = await setup();
      controller.setTarget(-10);
      expect(controller.snapshot().targetSettingDb).toBe(-10);
      expect(backend.scheduled()).toHaveLength(0);
      controller.open();
      expect(controller.snapshot()).toMatchObject({
        targetSettingDb: calibrationSettingMinDb,
        playedSettingDb: calibrationSettingMinDb,
      });
    });

    it("plays the repeats towards a target dragged to the top at most calibrationRiseMaxDb apart (R3.8)", async () => {
      const { controller, advanceToNextRepeat } = await setup();
      controller.open();
      controller.setTarget(Number.POSITIVE_INFINITY);
      const played = [controller.snapshot().playedSettingDb];
      for (let repeat = 0; repeat < 20; repeat += 1) {
        advanceToNextRepeat();
        played.push(controller.snapshot().playedSettingDb);
      }
      expect(played.slice(0, 13)).toEqual([
        -60, -55, -50, -45, -40, -35, -30, -25, -20, -15, -10, -5, -4,
      ]);
      expect(played.slice(13)).toEqual(Array<number>(8).fill(-4));
      expect(controller.snapshot()).toMatchObject({
        targetSettingDb: calibrationSettingTopDb(),
        atTop: true,
      });
    });

    it("lets louder and quieter go on from a dragged target as before", async () => {
      const { controller, advanceToNextRepeat } = await setup();
      controller.open();
      controller.setTarget(-58);
      controller.louder();
      expect(controller.snapshot().targetSettingDb).toBe(-57);
      advanceToNextRepeat();
      expect(controller.snapshot().playedSettingDb).toBe(-57);
      controller.setTarget(-30);
      controller.quieter();
      expect(controller.snapshot().targetSettingDb).toBe(-58);
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

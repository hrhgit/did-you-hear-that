import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import { createManualTimer } from "../../config/manual-timer";
import { createSeededRandom } from "../../config/seeded-random";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import type { BackendEvent } from "./audio-backend";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import type { AudioOutput, StopEvent } from "./create-audio-output";
import { createAudioOutput } from "./create-audio-output";
import type {
  FakeAudioBackend,
  FakeAudioBackendOptions,
} from "./fake-audio-backend";
import { createFakeAudioBackend } from "./fake-audio-backend";
import { gainToDecibels } from "./gain-to-decibels";
import type { StopReason } from "./output-types";
import { rangeReport } from "./range-report";

const {
  scheduleLeadMs,
  stopFadeMs,
  calibrationSettingMinDb,
  calibrationSettingKeepMinDb,
  calibrationRiseMaxDb,
  headphoneCheckLevelDb,
} = audioOutputConfig;
const { capRelativeToAnchorDb, upwardStepDb, startingLevelDb } =
  hearingMethodConfig;

/** The lowest supported rate, where the real renderers are quickest. */
const sampleRateHz = soundRulesConfig.sampleRateMinHz;
const random = createSeededRandom(1);

function setup(options: FakeAudioBackendOptions = {}) {
  const backend = createFakeAudioBackend({ sampleRateHz, ...options });
  const timer = createManualTimer();
  const output = createAudioOutput({ backend, timer });
  const stops: StopEvent[] = [];
  output.onStop((event) => stops.push(event));
  return { backend, timer, output, stops };
}

/** Moves the audio clock to `endMs`, so that the next sound is not refused as busy. */
function waitUntil(backend: FakeAudioBackend, endMs: number): void {
  backend.advanceClockBy(Math.max(0, endMs - backend.currentTimeMs()));
}

/** Plays repeats towards `targetDb`, waiting out each one, until one plays at the target. */
function playRepeatsTo(
  output: AudioOutput,
  backend: FakeAudioBackend,
  targetDb: number,
): number[] {
  const played: number[] = [];
  for (let repeat = 0; repeat < 30; repeat += 1) {
    const outcome = output.playCalibrationRepeat({
      requestedSettingDb: targetDb,
      random,
    });
    if (outcome.kind !== "scheduled") {
      throw new Error(`A repeat was refused: ${outcome.reason}.`);
    }
    played.push(outcome.settingDb);
    waitUntil(backend, outcome.endMs);
    if (outcome.settingDb === targetDb) {
      return played;
    }
  }
  throw new Error(`No repeat reached ${targetDb} dB.`);
}

async function runningAndCalibrated(
  settingDb: number,
  options: FakeAudioBackendOptions = {},
) {
  const context = setup(options);
  await context.output.activate();
  context.output.beginCalibration();
  playRepeatsTo(context.output, context.backend, settingDb);
  const kept = context.output.keepCalibration();
  expect(kept.kind).toBe("kept");
  return context;
}

function lastScheduled(backend: FakeAudioBackend) {
  const scheduled = backend.scheduled();
  const last = scheduled[scheduled.length - 1];
  if (last === undefined) {
    throw new Error("Nothing was scheduled.");
  }
  return last;
}

function rmsOf(samples: Float32Array): number {
  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

const isAllPositiveZero = (samples: Float32Array): boolean =>
  samples.every((sample) => Object.is(sample, 0));

describe("createAudioOutput", () => {
  describe("activate (R4, R5, D23)", () => {
    it("creates nothing until activate is called", () => {
      const { backend, output } = setup();
      expect(backend.calls).toEqual([]);
      expect(backend.contextCount()).toBe(0);
      expect(output.state()).toEqual({ kind: "inactive" });
      expect(output.sampleRateHz()).toBeNull();
      expect(output.timestampPair()).toBeNull();
    });

    it("calls createOrResume before it returns, so before its promise is first awaited", async () => {
      const { backend, output } = setup();
      const activation = output.activate();
      expect(backend.calls).toEqual([{ kind: "createOrResume" }]);
      expect(output.state()).toEqual({ kind: "starting" });
      await expect(activation).resolves.toEqual({
        kind: "running",
        sampleRateHz,
      });
      expect(output.state()).toEqual({ kind: "running" });
      expect(output.sampleRateHz()).toBe(sampleRateHz);
    });

    it("refuses noGesture and touches nothing when the browser says no activation is active", async () => {
      const { backend, output } = setup({ userActivationActive: false });
      await expect(output.activate()).resolves.toEqual({
        kind: "refused",
        reason: "noGesture",
      });
      expect(backend.calls).toEqual([]);
      expect(output.state()).toEqual({ kind: "inactive" });
    });

    it("goes ahead where the browser cannot tell whether an activation is active", async () => {
      const { backend, output } = setup({ userActivationActive: null });
      await expect(output.activate()).resolves.toMatchObject({
        kind: "running",
      });
      expect(backend.contextCount()).toBe(1);
    });

    it("stays starting until the context runs, and an activation while starting creates nothing more", async () => {
      const { backend, output } = setup({ runningMode: "manual" });
      const first = output.activate();
      const second = output.activate();
      expect(second).toBe(first);
      expect(backend.calls).toEqual([{ kind: "createOrResume" }]);
      expect(output.state()).toEqual({ kind: "starting" });
      backend.settleRunning();
      await expect(first).resolves.toMatchObject({ kind: "running" });
    });

    it("stops with the reason interrupted when the context cannot be resumed", async () => {
      const { backend, output, stops } = setup({ runningMode: "reject" });
      await expect(output.activate()).resolves.toEqual({
        kind: "stopped",
        reason: "interrupted",
      });
      expect(backend.calls).toContainEqual({
        kind: "fadeToSilence",
        durationMs: stopFadeMs,
      });
      expect(stops).toEqual([{ reason: "interrupted" }]);
    });

    it("does not become running when a stop came while it was starting", async () => {
      const { backend, output } = setup({ runningMode: "manual" });
      const activation = output.activate();
      output.stopAll();
      backend.settleRunning();
      await expect(activation).resolves.toEqual({
        kind: "stopped",
        reason: "control",
      });
      expect(output.state()).toEqual({ kind: "stopped", reason: "control" });
    });
  });

  describe("devices that cannot carry the house (R5)", () => {
    it("becomes unsupported with noWebAudio, creating nothing", async () => {
      const { backend, output } = setup({ hasWebAudio: false });
      const reported: unknown[] = [];
      output.onUnsupported((event) => reported.push(event));
      const expected = {
        kind: "unsupported",
        reason: "noWebAudio",
        sampleRateHz: null,
      };
      await expect(output.activate()).resolves.toEqual(expected);
      expect(output.state()).toEqual(expected);
      expect(reported).toEqual([{ reason: "noWebAudio", sampleRateHz: null }]);
      expect(backend.calls).toEqual([]);
    });

    it.each([16000, 22049, Number.NaN])(
      "becomes unsupported with sampleRateTooLow at %s Hz and closes the context",
      async (rate) => {
        const { backend, output } = setup({ sampleRateHz: rate });
        await expect(output.activate()).resolves.toEqual({
          kind: "unsupported",
          reason: "sampleRateTooLow",
          sampleRateHz: rate,
        });
        expect(backend.calls).toEqual([
          { kind: "createOrResume" },
          { kind: "close" },
        ]);
        expect(backend.contextState()).toBe("closed");
      },
    );

    it("becomes unsupported with monoOutput for one output channel and closes the context", async () => {
      const { backend, output } = setup({ outputChannelCountMax: 1 });
      await expect(output.activate()).resolves.toEqual({
        kind: "unsupported",
        reason: "monoOutput",
        sampleRateHz,
      });
      expect(backend.contextState()).toBe("closed");
    });

    it("refuses everything afterwards, a calibration repeat and a new activate included", async () => {
      const { backend, output } = setup({ sampleRateHz: 16000 });
      await output.activate();
      const callCount = backend.calls.length;
      await expect(output.activate()).resolves.toMatchObject({
        kind: "unsupported",
      });
      output.beginCalibration();
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toEqual({ kind: "refused", reason: "unsupported" });
      expect(
        output.play({
          soundId: "cellar",
          ear: "left",
          levelDb: -25,
          purpose: "trial",
          random,
        }),
      ).toEqual({ kind: "refused", reason: "unsupported" });
      expect(output.playHeadphoneCheck(random)).toEqual({
        kind: "refused",
        reason: "unsupported",
      });
      backend.fire("hidden");
      output.stopAll();
      expect(backend.calls.length).toBe(callCount);
      expect(output.state()).toMatchObject({ kind: "unsupported" });
    });
  });

  describe("refusals in each state (R4.4, R14.2, R15.1)", () => {
    const trial = {
      soundId: "corridor",
      ear: "left",
      levelDb: startingLevelDb,
      purpose: "trial",
      random,
    } as const;

    it("refuses every sound while inactive", () => {
      const { backend, output } = setup();
      output.beginCalibration();
      expect(output.play(trial)).toEqual({
        kind: "refused",
        reason: "notRunning",
      });
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toEqual({ kind: "refused", reason: "notRunning" });
      expect(output.playHeadphoneCheck(random)).toEqual({
        kind: "refused",
        reason: "notRunning",
      });
      expect(backend.scheduled()).toEqual([]);
    });

    it("refuses every sound while starting", () => {
      const { backend, output } = setup({ runningMode: "manual" });
      void output.activate();
      output.beginCalibration();
      expect(output.play(trial)).toMatchObject({ reason: "notRunning" });
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toMatchObject({ reason: "notRunning" });
      expect(backend.scheduled()).toEqual([]);
    });

    it("while running and not calibrated, plays only calibration repeats (R15.1)", async () => {
      const { backend, output } = setup();
      await output.activate();
      expect(output.play(trial)).toMatchObject({ reason: "notCalibrated" });
      expect(
        output.play({ ...trial, soundId: "calibration", levelDb: 0 }),
      ).toMatchObject({ reason: "notCalibrated" });
      expect(output.playHeadphoneCheck(random)).toMatchObject({
        reason: "notCalibrated",
      });
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toMatchObject({ reason: "notCalibrating" });
      expect(output.rangeReport()).toBeNull();
      expect(backend.scheduled()).toEqual([]);

      output.beginCalibration();
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toMatchObject({ kind: "scheduled" });
      expect(output.play(trial)).toMatchObject({ reason: "notCalibrated" });
    });

    it("refuses every sound while stopped, until activate", async () => {
      const { backend, output } = await runningAndCalibrated(-30);
      output.stopAll();
      output.beginCalibration();
      expect(output.play(trial)).toMatchObject({ reason: "notRunning" });
      expect(output.playHeadphoneCheck(random)).toMatchObject({
        reason: "notRunning",
      });
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toMatchObject({ reason: "notRunning" });
      expect(backend.scheduled().length).toBe(7);
    });
  });

  describe("calibration (R15, R16, D8, D10)", () => {
    it("plays the first repeat at the bottom of the control whatever is asked, in both ears at Level 0", async () => {
      const { backend, output } = setup();
      await output.activate();
      output.beginCalibration();
      const outcome = output.playCalibrationRepeat({
        requestedSettingDb: 0,
        random,
      });
      expect(outcome).toMatchObject({
        kind: "scheduled",
        settingDb: calibrationSettingMinDb,
        atTop: false,
        clampLimit: null,
      });
      const { left, right } = lastScheduled(backend);
      expect(right).toEqual(left);
      expect(rmsOf(left)).toBeGreaterThan(0);
      const levelDb = gainToDecibels(
        rmsOf(left) /
          (soundRulesConfig.referenceRmsFraction *
            decibelsToGain(calibrationSettingMinDb)),
      );
      expect(Math.abs(levelDb)).toBeLessThanOrEqual(
        soundRulesConfig.levelToleranceDb,
      );
    });

    it("rises by at most the largest rise per repeat, rounds down to the grid and stops at the top", async () => {
      const { backend, output } = setup();
      await output.activate();
      output.beginCalibration();
      const topDb = calibrationSettingTopDb();
      const played = playRepeatsTo(output, backend, topDb);
      expect(played[0]).toBe(calibrationSettingMinDb);
      for (let index = 1; index < played.length; index += 1) {
        expect(played[index] - played[index - 1]).toBeLessThanOrEqual(
          calibrationRiseMaxDb,
        );
      }
      expect(played[played.length - 1]).toBe(topDb);
      const beyondTop = output.playCalibrationRepeat({
        requestedSettingDb: 30,
        random,
      });
      expect(beyondTop).toMatchObject({ settingDb: topDb, atTop: true });
      if (beyondTop.kind === "scheduled") {
        waitUntil(backend, beyondTop.endMs);
      }
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -12.7, random }),
      ).toMatchObject({ settingDb: -13, atTop: false });
    });

    it("refuses to keep before any repeat, and below the Keep_Minimum, then keeps the last setting played", async () => {
      const { backend, output } = setup();
      await output.activate();
      expect(output.keepCalibration()).toEqual({
        kind: "refused",
        reason: "notCalibrating",
      });
      output.beginCalibration();
      expect(output.keepCalibration()).toEqual({
        kind: "refused",
        reason: "noRepeatPlayed",
      });
      playRepeatsTo(output, backend, calibrationSettingKeepMinDb - 1);
      expect(output.keepCalibration()).toEqual({
        kind: "refused",
        reason: "systemVolumeHigh",
      });
      playRepeatsTo(output, backend, calibrationSettingKeepMinDb + 7);
      const kept = output.keepCalibration();
      expect(kept).toEqual({
        kind: "kept",
        settingDb: calibrationSettingKeepMinDb + 7,
        rangeReport: rangeReport(
          decibelsToGain(calibrationSettingKeepMinDb + 7),
        ),
      });
      expect(output.rangeReport()).toEqual(
        kept.kind === "kept" ? kept.rangeReport : null,
      );
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -30, random }),
      ).toMatchObject({ reason: "notCalibrating" });
    });

    it("forgets the kept calibration when a new one begins (R15.2)", async () => {
      const { output } = await runningAndCalibrated(-30);
      output.beginCalibration();
      expect(output.rangeReport()).toBeNull();
      expect(
        output.play({
          soundId: "attic",
          ear: "left",
          levelDb: -25,
          purpose: "listening",
          random,
        }),
      ).toMatchObject({ reason: "notCalibrated" });
      const first = output.playCalibrationRepeat({
        requestedSettingDb: -30,
        random,
      });
      expect(first).toMatchObject({ settingDb: calibrationSettingMinDb });
    });
  });

  describe("the headphone check (R17.1, R17.2, D20)", () => {
    it("plays the calibration noise in the left ear only, at the headphone check level", async () => {
      const settingDb = -20;
      const { backend, output } = await runningAndCalibrated(settingDb);
      const outcome = output.playHeadphoneCheck(random);
      expect(outcome).toMatchObject({
        kind: "scheduled",
        requestedLevelDb: headphoneCheckLevelDb,
        playedLevelDb: headphoneCheckLevelDb,
        clampLimit: null,
      });
      const { left, right } = lastScheduled(backend);
      expect(isAllPositiveZero(right)).toBe(true);
      const levelDb = gainToDecibels(
        rmsOf(left) /
          (soundRulesConfig.referenceRmsFraction * decibelsToGain(settingDb)),
      );
      expect(Math.abs(levelDb - headphoneCheckLevelDb)).toBeLessThanOrEqual(
        soundRulesConfig.levelToleranceDb,
      );
    });
  });

  describe("playing a sound (R8.4, R12, R13)", () => {
    it("starts a sound one scheduling lead ahead on the audio clock and returns its start and end", async () => {
      const { backend, output } = await runningAndCalibrated(-30);
      output.beginRoom();
      backend.advanceClockBy(10_000);
      const nowMs = backend.currentTimeMs();
      const outcome = output.play({
        soundId: "nursery",
        ear: "right",
        levelDb: startingLevelDb,
        purpose: "trial",
        random,
      });
      const call = lastScheduled(backend);
      expect(outcome).toEqual({
        kind: "scheduled",
        startMs: nowMs + scheduleLeadMs,
        endMs:
          nowMs + scheduleLeadMs + (call.left.length / sampleRateHz) * 1000,
        requestedLevelDb: startingLevelDb,
        playedLevelDb: startingLevelDb,
        clampLimit: null,
      });
      expect(call.startMs).toBe(nowMs + scheduleLeadMs);
      expect(call.sampleRateHz).toBe(sampleRateHz);
      expect(isAllPositiveZero(call.left)).toBe(true);
      expect(rmsOf(call.right)).toBeGreaterThan(0);
    });

    it("refuses a sound that would start before the current one ends (D16)", async () => {
      const { backend, output } = await runningAndCalibrated(-30);
      const request = {
        soundId: "attic",
        ear: "left",
        levelDb: startingLevelDb,
        purpose: "listening",
        random,
      } as const;
      const first = output.play(request);
      if (first.kind !== "scheduled") {
        throw new Error("The first sound was refused.");
      }
      const scheduledCount = backend.scheduled().length;
      expect(output.play(request)).toEqual({ kind: "refused", reason: "busy" });
      expect(output.playHeadphoneCheck(random)).toMatchObject({
        reason: "busy",
      });
      waitUntil(backend, first.endMs - scheduleLeadMs - 1);
      expect(output.play(request)).toMatchObject({ reason: "busy" });
      expect(backend.scheduled().length).toBe(scheduledCount);
      waitUntil(backend, first.endMs - scheduleLeadMs);
      const second = output.play(request);
      expect(second).toMatchObject({
        kind: "scheduled",
        startMs: first.endMs,
      });
    });

    it("logs a clamp with its start, sound, ear, purpose and levels, and returns the same values (R7.8, D22)", async () => {
      const { backend, output } = await runningAndCalibrated(-30);
      expect(output.clampLog()).toEqual([]);
      output.beginRoom();
      const outcome = output.play({
        soundId: "corridor",
        ear: "right",
        levelDb: capRelativeToAnchorDb + 5,
        purpose: "trial",
        random,
      });
      expect(outcome).toMatchObject({
        kind: "scheduled",
        requestedLevelDb: capRelativeToAnchorDb + 5,
        playedLevelDb: capRelativeToAnchorDb,
        clampLimit: "anchorCap",
      });
      if (outcome.kind !== "scheduled") {
        return;
      }
      expect(output.clampLog()).toEqual([
        {
          startMs: outcome.startMs,
          soundId: "corridor",
          earChoice: "right",
          purpose: "trial",
          requestedLevelDb: capRelativeToAnchorDb + 5,
          playedLevelDb: capRelativeToAnchorDb,
          clampLimit: "anchorCap",
        },
      ]);
      waitUntil(backend, outcome.endMs);
      output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: startingLevelDb,
        purpose: "trial",
        random,
      });
      expect(output.clampLog().length).toBe(1);
    });
  });

  describe("the rise limit within a Room_Span (R11, D15)", () => {
    it("limits a rise on one ear across purposes, and beginRoom forgets the previous sounds", async () => {
      const { backend, output } = await runningAndCalibrated(-30);
      // The last calibration repeat, at Level 0 in both ears, is the previous sound on each ear.
      const afterCalibration = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: 12,
        purpose: "listening",
        random,
      });
      expect(afterCalibration).toMatchObject({ clampLimit: "rise" });
      expect(
        afterCalibration.kind === "scheduled" &&
          Math.abs(afterCalibration.playedLevelDb - upwardStepDb),
      ).toBeLessThan(1e-9);
      if (afterCalibration.kind === "scheduled") {
        waitUntil(backend, afterCalibration.endMs);
      }

      output.beginRoom();
      const quiet = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: startingLevelDb,
        purpose: "trial",
        random,
      });
      expect(quiet).toMatchObject({ clampLimit: null });
      if (quiet.kind === "scheduled") {
        waitUntil(backend, quiet.endMs);
      }
      const otherEar = output.play({
        soundId: "corridor",
        ear: "right",
        levelDb: 10,
        purpose: "trial",
        random,
      });
      expect(otherEar).toMatchObject({ playedLevelDb: 10, clampLimit: null });
      if (otherEar.kind === "scheduled") {
        waitUntil(backend, otherEar.endMs);
      }
      const leap = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: 10,
        purpose: "trial",
        random,
      });
      expect(leap).toMatchObject({ clampLimit: "rise" });
      expect(
        leap.kind === "scheduled" &&
          Math.abs(leap.playedLevelDb - (startingLevelDb + upwardStepDb)),
      ).toBeLessThan(1e-9);
    });

    it("exempts a replay from the rise limit but not from the cap, and counts it as the previous sound", async () => {
      const { backend, output } = await runningAndCalibrated(-30);
      output.beginRoom();
      const steps = [
        { levelDb: startingLevelDb, purpose: "trial" },
        { levelDb: 5, purpose: "replay" },
        { levelDb: capRelativeToAnchorDb + 5, purpose: "replay" },
        { levelDb: startingLevelDb, purpose: "trial" },
        { levelDb: 0, purpose: "trial" },
      ] as const;
      const outcomes = steps.map(({ levelDb, purpose }) => {
        const outcome = output.play({
          soundId: "corridor",
          ear: "left",
          levelDb,
          purpose,
          random,
        });
        if (outcome.kind !== "scheduled") {
          throw new Error(`Refused: ${outcome.reason}.`);
        }
        waitUntil(backend, outcome.endMs);
        return outcome;
      });
      expect(outcomes.map((outcome) => outcome.clampLimit)).toEqual([
        null,
        null,
        "anchorCap",
        null,
        "rise",
      ]);
      expect(outcomes[2].playedLevelDb).toBe(capRelativeToAnchorDb);
      expect(
        Math.abs(outcomes[4].playedLevelDb - (startingLevelDb + upwardStepDb)),
      ).toBeLessThan(1e-9);
    });
  });

  describe("stopping (R12.3, R14, D14, D18)", () => {
    const backendReasons: readonly BackendEvent[] = [
      "hidden",
      "pageLeft",
      "deviceChanged",
      "interrupted",
    ];
    const reasons: readonly StopReason[] = ["control", ...backendReasons];

    it.each(reasons)(
      "stops with the reason %s: fades, reports, refuses, then suspends or closes after the timer",
      async (reason) => {
        const { backend, timer, output, stops } =
          await runningAndCalibrated(-30);
        output.play({
          soundId: "cellar",
          ear: "left",
          levelDb: startingLevelDb,
          purpose: "listening",
          random,
        });
        const callCount = backend.calls.length;
        if (reason === "control") {
          output.stopAll();
        } else {
          backend.fire(reason);
        }
        expect(backend.calls.slice(callCount)).toEqual([
          { kind: "fadeToSilence", durationMs: stopFadeMs },
        ]);
        expect(output.state()).toEqual({ kind: "stopped", reason });
        expect(stops).toEqual([{ reason }]);
        expect(
          output.play({
            soundId: "cellar",
            ear: "left",
            levelDb: startingLevelDb,
            purpose: "listening",
            random,
          }),
        ).toMatchObject({ reason: "notRunning" });

        timer.advanceBy(stopFadeMs + scheduleLeadMs - 1);
        expect(backend.calls.length).toBe(callCount + 1);
        timer.advanceBy(1);
        expect(backend.calls.slice(callCount + 1)).toEqual([
          { kind: reason === "pageLeft" ? "close" : "suspend" },
        ]);
        // Seven calibration repeats and the one sound before the stop, nothing after it.
        timer.advanceBy(60_000);
        expect(backend.scheduled().length).toBe(8);

        // The busy interval ended with the stop, so a sound may start at once after activate.
        await output.activate();
        expect(output.state()).toEqual({ kind: "running" });
        const after = output.play({
          soundId: "cellar",
          ear: "left",
          levelDb: startingLevelDb,
          purpose: "listening",
          random,
        });
        if (reason === "deviceChanged") {
          expect(after).toEqual({ kind: "refused", reason: "notCalibrated" });
          expect(output.rangeReport()).toBeNull();
        } else {
          expect(after).toMatchObject({ kind: "scheduled", clampLimit: null });
        }
      },
    );

    it("keeps the first reason on a second stop, reports both, and fades again", async () => {
      const { backend, output, stops } = await runningAndCalibrated(-30);
      backend.fire("hidden");
      backend.fire("deviceChanged");
      expect(output.state()).toEqual({ kind: "stopped", reason: "hidden" });
      expect(stops).toEqual([
        { reason: "hidden" },
        { reason: "deviceChanged" },
      ]);
      expect(
        backend.calls.filter((call) => call.kind === "fadeToSilence").length,
      ).toBe(2);
      // The device change still forgets the calibration.
      expect(output.rangeReport()).toBeNull();
    });

    it("closes rather than suspends when the page was left during a stop", async () => {
      const { backend, timer, output } = await runningAndCalibrated(-30);
      output.stopAll();
      backend.fire("pageLeft");
      timer.advanceBy(stopFadeMs + scheduleLeadMs);
      expect(backend.calls.filter((call) => call.kind === "close")).toEqual([
        { kind: "close" },
      ]);
      expect(backend.calls.some((call) => call.kind === "suspend")).toBe(false);
    });

    it("does not suspend after a stop when activate came first", async () => {
      const { backend, timer, output } = await runningAndCalibrated(-30);
      output.stopAll();
      await output.activate();
      timer.advanceBy(60_000);
      expect(backend.calls.some((call) => call.kind === "suspend")).toBe(false);
      expect(output.state()).toEqual({ kind: "running" });
    });

    it("forgets the calibration in progress on a device change, so the next repeat starts at the bottom", async () => {
      const { backend, output } = setup();
      await output.activate();
      output.beginCalibration();
      playRepeatsTo(output, backend, -45);
      backend.fire("deviceChanged");
      await output.activate();
      expect(output.keepCalibration()).toEqual({
        kind: "refused",
        reason: "noRepeatPlayed",
      });
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -45, random }),
      ).toMatchObject({ settingDb: calibrationSettingMinDb });
    });

    it("does nothing on a stop before the first activate", () => {
      const { backend, output, stops } = setup();
      backend.fire("hidden");
      output.stopAll();
      expect(backend.calls).toEqual([]);
      expect(output.state()).toEqual({ kind: "inactive" });
      expect(stops).toEqual([]);
    });

    it("reports every stop to every listener, even when one throws, and a removed listener hears nothing", async () => {
      const { backend, output, stops } = setup();
      await output.activate();
      const removed: StopEvent[] = [];
      const remove = output.onStop((event) => removed.push(event));
      remove();
      output.onStop(() => {
        throw new Error("A listener broke.");
      });
      const late: StopEvent[] = [];
      output.onStop((event) => late.push(event));
      expect(() => backend.fire("interrupted")).toThrow("A listener broke.");
      expect(stops).toEqual([{ reason: "interrupted" }]);
      expect(late).toEqual([{ reason: "interrupted" }]);
      expect(removed).toEqual([]);
    });
  });

  describe("clocks (R13.2, D17)", () => {
    it("gives the audio clock and the page clock read together once there is a context", async () => {
      const { backend, output } = setup({
        startMs: 500,
        performanceOffsetMs: 2500,
      });
      await output.activate();
      backend.advanceClockBy(100);
      expect(output.timestampPair()).toEqual({
        audioClockMs: 600,
        performanceMs: 3100,
      });
    });
  });
});

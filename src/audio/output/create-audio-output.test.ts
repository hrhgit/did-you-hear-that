import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import { createManualTimer } from "../../config/manual-timer";
import { createSeededRandom } from "../../config/seeded-random";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import type { BackendEvent } from "./audio-backend";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { calibrationMusicConfig } from "../../config/calibration-music-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
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
  outputFadeMs,
  calibrationSettingStepDb,
  calibrationSettingSpanMinDb,
  calibrationMusicGainStepMs,
  calibrationMusicLoadMaxMs,
  calibrationMusicRisePeriodMs,
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
      const { backend, output } = await runningAndCalibrated(-25);
      output.stopAll();
      output.beginCalibration();
      expect(output.play(trial)).toMatchObject({ reason: "notRunning" });
      expect(output.playHeadphoneCheck(random)).toMatchObject({
        reason: "notRunning",
      });
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toMatchObject({ reason: "notRunning" });
      // The eight calibration repeats from -60 to -25 dB, and nothing after the stop.
      expect(backend.scheduled().length).toBe(8);
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
      const { output } = await runningAndCalibrated(-25);
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
      const { backend, output } = await runningAndCalibrated(-25);
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
      const { backend, output } = await runningAndCalibrated(-25);
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
      const { backend, output } = await runningAndCalibrated(-25);
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
        clampLimit: "anchorCap",
      });
      if (outcome.kind !== "scheduled") {
        return;
      }
      // At the cap, within the rounding of the gain it is played at.
      expect(outcome.playedLevelDb).toBeLessThanOrEqual(capRelativeToAnchorDb);
      expect(outcome.playedLevelDb).toBeCloseTo(capRelativeToAnchorDb, 12);
      expect(output.clampLog()).toEqual([
        {
          startMs: outcome.startMs,
          soundId: "corridor",
          earChoice: "right",
          purpose: "trial",
          requestedLevelDb: capRelativeToAnchorDb + 5,
          playedLevelDb: outcome.playedLevelDb,
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
      const { backend, output } = await runningAndCalibrated(-25);
      // The last calibration repeat, at Level 0 in both ears, is the previous sound on each ear:
      // one upward step above it is the cap of 5 dB, and is played as asked.
      const afterCalibration = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: upwardStepDb,
        purpose: "listening",
        random,
      });
      expect(afterCalibration).toMatchObject({
        playedLevelDb: upwardStepDb,
        clampLimit: null,
      });
      if (afterCalibration.kind === "scheduled") {
        waitUntil(backend, afterCalibration.endMs);
      }
      // A listening sound, then a trial more than one step above it on the same ear.
      const listening = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: -20,
        purpose: "listening",
        random,
      });
      if (listening.kind === "scheduled") {
        waitUntil(backend, listening.endMs);
      }
      const acrossPurposes = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: 0,
        purpose: "trial",
        random,
      });
      expect(acrossPurposes).toMatchObject({ clampLimit: "rise" });
      expect(
        acrossPurposes.kind === "scheduled" &&
          Math.abs(acrossPurposes.playedLevelDb - (-20 + upwardStepDb)),
      ).toBeLessThan(1e-9);
      if (acrossPurposes.kind === "scheduled") {
        waitUntil(backend, acrossPurposes.endMs);
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
        levelDb: 0,
        purpose: "trial",
        random,
      });
      expect(otherEar).toMatchObject({ playedLevelDb: 0, clampLimit: null });
      if (otherEar.kind === "scheduled") {
        waitUntil(backend, otherEar.endMs);
      }
      const leap = output.play({
        soundId: "corridor",
        ear: "left",
        levelDb: 0,
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
      const { backend, output } = await runningAndCalibrated(-25);
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
      expect(outcomes[2].playedLevelDb).toBeLessThanOrEqual(
        capRelativeToAnchorDb,
      );
      expect(outcomes[2].playedLevelDb).toBeCloseTo(capRelativeToAnchorDb, 12);
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
          await runningAndCalibrated(-25);
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
        // Eight calibration repeats and the one sound before the stop, nothing after it.
        timer.advanceBy(60_000);
        expect(backend.scheduled().length).toBe(9);

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
      const { backend, output, stops } = await runningAndCalibrated(-25);
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
      const { backend, timer, output } = await runningAndCalibrated(-25);
      output.stopAll();
      backend.fire("pageLeft");
      timer.advanceBy(stopFadeMs + scheduleLeadMs);
      expect(backend.calls.filter((call) => call.kind === "close")).toEqual([
        { kind: "close" },
      ]);
      expect(backend.calls.some((call) => call.kind === "suspend")).toBe(false);
    });

    it("does not suspend after a stop when activate came first", async () => {
      const { backend, timer, output } = await runningAndCalibrated(-25);
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

  describe("the calibration music (audible-start R4, R5)", () => {
    /**
     * Music-like samples made in code: a steady square wave with one peak of `peakFraction`,
     * scaled so that the crest factor is `crestDb`, at `rateHz`. With 18.4 dB, as the measured
     * file's, the Music_Top is −5 dB.
     */
    function musicSamples(
      crestDb = 18.4,
      rateHz: number = sampleRateHz,
      peakFraction = 0.92182,
    ): Float32Array {
      const sampleCount = 4 * rateHz;
      const rmsFraction = peakFraction / decibelsToGain(crestDb);
      const squareFraction = Math.sqrt(
        (rmsFraction ** 2 * sampleCount - peakFraction ** 2) /
          (sampleCount - 1),
      );
      const samples = new Float32Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        samples[index] = index % 2 === 0 ? squareFraction : -squareFraction;
      }
      samples[Math.floor(sampleCount / 2)] = peakFraction;
      return samples;
    }

    /** Lets the shell hear a load that has already settled. */
    async function flush(): Promise<void> {
      for (let round = 0; round < 5; round += 1) {
        await Promise.resolve();
      }
    }

    function musicSetup(options: FakeAudioBackendOptions = {}) {
      const context = setup({
        calibrationMusic: { mode: "resolve", samples: musicSamples() },
        ...options,
      });
      const sounds: string[] = [];
      context.output.onCalibrationSoundChange((sound) => sounds.push(sound));
      /** Moves the audio clock and the timer forward together, 10 ms at a time. */
      const advance = (durationMs: number): void => {
        for (let doneMs = 0; doneMs < durationMs; doneMs += 10) {
          const stepMs = Math.min(10, durationMs - doneMs);
          context.backend.advanceClockBy(stepMs);
          context.timer.advanceBy(stepMs);
        }
      };
      return { ...context, sounds, advance };
    }

    async function playingMusic(options: FakeAudioBackendOptions = {}) {
      const context = musicSetup(options);
      await context.output.activate();
      await flush();
      expect(context.output.calibrationSound()).toBe("music");
      context.output.beginCalibration();
      const started = context.output.startCalibrationMusic();
      expect(started.kind).toBe("started");
      return context;
    }

    const loopCalls = (backend: FakeAudioBackend) =>
      backend.loopTimeline().filter((call) => call.kind !== "fadeToSilence");

    const musicGainAt = (samples: Float32Array, settingDb: number): number => {
      let sumOfSquares = 0;
      for (const sample of samples) {
        sumOfSquares += sample * sample;
      }
      return (
        (decibelsToGain(settingDb) * soundRulesConfig.referenceRmsFraction) /
        Math.sqrt(sumOfSquares / samples.length)
      );
    };

    it("is loading before the first activate, and loads once from the config's path in the first activate that creates the context", async () => {
      const { backend, timer, output, sounds } = musicSetup();
      expect(output.calibrationSound()).toBe("loading");
      expect(backend.musicLoads()).toEqual([]);
      await output.activate();
      expect(backend.musicLoads()).toEqual([
        { filePath: calibrationMusicConfig.filePath, atMs: 0 },
      ]);
      await flush();
      expect(output.calibrationSound()).toBe("music");
      expect(sounds).toEqual(["music"]);
      output.stopAll();
      await output.activate();
      backend.fire("pageLeft");
      timer.advanceBy(stopFadeMs + scheduleLeadMs);
      expect(backend.contextState()).toBe("closed");
      await output.activate();
      expect(backend.contextCount()).toBe(2);
      expect(backend.musicLoads()).toHaveLength(1);
      expect(output.calibrationSound()).toBe("music");
    });

    it("loads nothing when the device cannot carry the house", async () => {
      const { backend, output } = musicSetup({ outputChannelCountMax: 1 });
      await output.activate();
      expect(backend.musicLoads()).toEqual([]);
      expect(output.calibrationSound()).toBe("loading");
    });

    it("gives the music's Control_Top once it is ready, and the hiss's before", async () => {
      const { backend, output } = musicSetup({
        calibrationMusic: { mode: "pending" },
      });
      expect(output.calibrationControlTopDb()).toBe(calibrationSettingTopDb());
      await output.activate();
      expect(output.calibrationControlTopDb()).toBe(calibrationSettingTopDb());
      backend.resolveCalibrationMusic(musicSamples());
      await flush();
      expect(output.calibrationControlTopDb()).toBe(-5);
    });

    describe("falls back to the hiss for the life of the shell (R4.4)", () => {
      it("when the fetch or the decoding fails", async () => {
        const { output, sounds } = musicSetup({
          calibrationMusic: { mode: "reject" },
        });
        await output.activate();
        await flush();
        expect(output.calibrationSound()).toBe("hiss");
        expect(sounds).toEqual(["hiss"]);
        expect(output.calibrationControlTopDb()).toBe(
          calibrationSettingTopDb(),
        );
      });

      it.each([
        ["empty", new Float32Array(0)],
        ["silent", new Float32Array(4000)],
        ["not finite", Float32Array.from([0.1, Number.NaN, -0.1])],
      ])("when the samples are %s", async (_name, samples) => {
        const { output } = musicSetup({
          calibrationMusic: { mode: "resolve", samples },
        });
        await output.activate();
        await flush();
        expect(output.calibrationSound()).toBe("hiss");
      });

      it("when the Music_Top would leave fewer than calibrationSettingSpanMinDb above the Keep_Minimum", async () => {
        // A crest factor that puts the Music_Top one step below the Keep_Minimum plus the span.
        const topDb =
          calibrationSettingKeepMinDb + calibrationSettingSpanMinDb - 1;
        const crestDb = 13.98 - topDb - 0.5;
        const { output } = musicSetup({
          calibrationMusic: {
            mode: "resolve",
            samples: musicSamples(crestDb),
          },
        });
        await output.activate();
        await flush();
        expect(output.calibrationSound()).toBe("hiss");
      });

      it("when nothing has arrived calibrationMusicLoadMaxMs after the load began, and drops a later result", async () => {
        const { backend, timer, output, sounds } = musicSetup({
          calibrationMusic: { mode: "pending" },
        });
        await output.activate();
        timer.advanceBy(calibrationMusicLoadMaxMs - 1);
        await flush();
        expect(output.calibrationSound()).toBe("loading");
        timer.advanceBy(1);
        expect(output.calibrationSound()).toBe("hiss");
        backend.resolveCalibrationMusic(musicSamples());
        await flush();
        expect(output.calibrationSound()).toBe("hiss");
        expect(sounds).toEqual(["hiss"]);
        expect(timer.pendingCount()).toBe(0);
      });

      it("and clears its time-out when the music arrives in time", async () => {
        const { backend, timer, output } = musicSetup({
          calibrationMusic: { mode: "pending" },
        });
        await output.activate();
        timer.advanceBy(calibrationMusicLoadMaxMs / 2);
        backend.resolveCalibrationMusic(musicSamples());
        await flush();
        expect(output.calibrationSound()).toBe("music");
        expect(timer.pendingCount()).toBe(0);
        timer.advanceBy(calibrationMusicLoadMaxMs);
        expect(output.calibrationSound()).toBe("music");
      });

      it("when the music was decoded at another rate than the context's", async () => {
        const { output } = musicSetup({
          calibrationMusic: {
            mode: "resolve",
            samples: musicSamples(18.4, sampleRateHz * 2),
            sampleRateHz: sampleRateHz * 2,
          },
        });
        await output.activate();
        await flush();
        output.beginCalibration();
        expect(output.startCalibrationMusic()).toEqual({
          kind: "refused",
          reason: "notReady",
        });
        expect(output.calibrationSound()).toBe("hiss");
      });
    });

    it("keeps a result that arrives after the context closed, and plays it in the next context", async () => {
      const { backend, output } = musicSetup({
        calibrationMusic: { mode: "pending" },
      });
      await output.activate();
      backend.fire("pageLeft");
      backend.resolveCalibrationMusic(musicSamples());
      await flush();
      expect(output.calibrationSound()).toBe("music");
      await output.activate();
      output.beginCalibration();
      expect(output.startCalibrationMusic().kind).toBe("started");
    });

    it("refuses to start before the shell runs, outside calibration, before the music is ready and while another sound plays", async () => {
      const { backend, output } = musicSetup({
        calibrationMusic: { mode: "pending" },
      });
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "notRunning",
      });
      await output.activate();
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "notCalibrating",
      });
      output.beginCalibration();
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "notReady",
      });
      const repeat = output.playCalibrationRepeat({
        requestedSettingDb: -60,
        random,
      });
      expect(repeat.kind).toBe("scheduled");
      backend.resolveCalibrationMusic(musicSamples());
      await flush();
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "busy",
      });
      if (repeat.kind === "scheduled") {
        waitUntil(backend, repeat.endMs);
      }
      expect(output.startCalibrationMusic().kind).toBe("started");
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "busy",
      });
    });

    it("refuses unsupported on a shell that cannot carry the house", async () => {
      const { output } = musicSetup({ hasWebAudio: false });
      await output.activate();
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "unsupported",
      });
    });

    it("starts a loop of two equal channels at the bottom of the control, fading in from exact zero over the output fade", async () => {
      const { backend, output } = await playingMusic();
      const [start] = loopCalls(backend);
      expect(start).toMatchObject({
        kind: "startLoop",
        startMs: scheduleLeadMs,
        fadeInMs: outputFadeMs,
        sampleRateHz,
      });
      if (start?.kind !== "startLoop") {
        throw new Error("No loop started.");
      }
      expect(start.right).toEqual(start.left);
      expect(start.levelGain).toBeCloseTo(
        musicGainAt(start.left, calibrationSettingMinDb),
        12,
      );
      expect(output.calibrationMusicSettingDb()).toBe(calibrationSettingMinDb);
      expect(backend.scheduled()).toEqual([]);
    });

    it("rises towards the target by at most 0.25 dB a step, one exponential ramp per step that never overlaps the one before", async () => {
      const { backend, output, advance } = await playingMusic();
      const steps: number[] = [];
      output.onCalibrationMusicStep((settingDb) => steps.push(settingDb));
      output.setCalibrationMusicTarget(-58);
      advance(10 * calibrationMusicGainStepMs);
      const riseStepDb =
        (calibrationRiseMaxDb * calibrationMusicGainStepMs) /
        calibrationMusicRisePeriodMs;
      expect(steps).toEqual([
        -59.75, -59.5, -59.25, -59, -58.75, -58.5, -58.25, -58,
      ]);
      const ramps = loopCalls(backend).filter(
        (call) => call.kind === "rampLoopLevel",
      );
      expect(ramps).toHaveLength(8);
      let previousEndMs = 0;
      let previousGain = musicGainAt(musicSamples(), calibrationSettingMinDb);
      for (const ramp of ramps) {
        if (ramp.kind !== "rampLoopLevel") {
          continue;
        }
        expect(ramp.startMs).toBeGreaterThanOrEqual(previousEndMs);
        expect(ramp.endMs - ramp.startMs).toBe(calibrationMusicGainStepMs);
        expect(
          gainToDecibels(ramp.levelGain / previousGain),
        ).toBeLessThanOrEqual(riseStepDb + 1e-9);
        previousEndMs = ramp.endMs;
        previousGain = ramp.levelGain;
      }
      expect(output.calibrationMusicSettingDb()).toBe(-58);
    });

    it("waits for the remainder when a step comes before the last ramp has ended on the audio clock", async () => {
      const { backend, timer, output } = await playingMusic();
      output.setCalibrationMusicTarget(-50);
      backend.advanceClockBy(calibrationMusicGainStepMs);
      timer.advanceBy(calibrationMusicGainStepMs);
      const rampsAfterFirst = loopCalls(backend).length;
      // The timer runs ahead of the audio clock: the next step finds the ramp still running.
      backend.advanceClockBy(calibrationMusicGainStepMs / 2);
      timer.advanceBy(calibrationMusicGainStepMs);
      expect(loopCalls(backend).length).toBe(rampsAfterFirst);
      backend.advanceClockBy(calibrationMusicGainStepMs / 2);
      timer.advanceBy(calibrationMusicGainStepMs / 2);
      const ramps = loopCalls(backend).filter(
        (call) => call.kind === "rampLoopLevel",
      );
      expect(ramps).toHaveLength(2);
      const [first, second] = ramps;
      if (first?.kind === "rampLoopLevel" && second?.kind === "rampLoopLevel") {
        expect(second.startMs).toBeGreaterThanOrEqual(first.endMs);
      }
    });

    it("falls to a lower target within one step", async () => {
      const { backend, output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(-50);
      advance(45 * calibrationMusicGainStepMs);
      expect(output.calibrationMusicSettingDb()).toBe(-50);
      output.setCalibrationMusicTarget(-58);
      advance(calibrationMusicGainStepMs);
      const last = loopCalls(backend).at(-1);
      expect(last).toMatchObject({ kind: "rampLoopLevel" });
      if (last?.kind === "rampLoopLevel") {
        expect(last.levelGain).toBeCloseTo(
          musicGainAt(musicSamples(), -58),
          12,
        );
      }
      advance(calibrationMusicGainStepMs);
      expect(output.calibrationMusicSettingDb()).toBe(-58);
    });

    it("never rises above the Control_Top, and keeps the level gain within the ceiling on the measured peak", async () => {
      const { backend, output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(Number.POSITIVE_INFINITY);
      advance(300 * calibrationMusicGainStepMs);
      expect(output.calibrationMusicSettingDb()).toBe(-5);
      const samples = musicSamples();
      const peak = Math.max(...samples.map(Math.abs));
      for (const call of loopCalls(backend)) {
        if (call.kind === "startLoop" || call.kind === "rampLoopLevel") {
          expect(call.levelGain * peak).toBeLessThanOrEqual(
            audioSafetyConfig.ceilingFraction,
          );
        }
      }
      expect(output.clampLog()).toEqual([]);
    });

    it("ignores a target that is NaN or not a number", async () => {
      const { backend, output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(Number.NaN);
      output.setCalibrationMusicTarget("loud" as unknown as number);
      advance(10 * calibrationMusicGainStepMs);
      expect(loopCalls(backend)).toHaveLength(1);
      expect(output.calibrationMusicSettingDb()).toBe(calibrationSettingMinDb);
    });

    it("refuses every other sound as busy while it plays, and lets the next one start after its stop fade", async () => {
      const { backend, output } = await playingMusic();
      expect(
        output.playCalibrationRepeat({ requestedSettingDb: -60, random }),
      ).toEqual({ kind: "refused", reason: "busy" });
      output.stopCalibrationMusic();
      const stoppedAtMs = backend.currentTimeMs();
      expect(loopCalls(backend).at(-1)).toMatchObject({
        kind: "stopLoop",
        fadeOutMs: stopFadeMs,
        atMs: stoppedAtMs,
      });
      // The next sound may be asked for at once, because it starts after the stop fade ends.
      const next = output.playCalibrationRepeat({
        requestedSettingDb: -60,
        random,
      });
      expect(next.kind).toBe("scheduled");
      if (next.kind === "scheduled") {
        expect(next.startMs).toBeGreaterThanOrEqual(stoppedAtMs + stopFadeMs);
      }
    });

    it("plays the headphone check after a keep only once the music's stop fade has ended", async () => {
      const { backend, output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(calibrationSettingKeepMinDb);
      advance(400 * calibrationMusicGainStepMs);
      expect(output.keepCalibration().kind).toBe("kept");
      const keptAtMs = backend.currentTimeMs();
      const check = output.playHeadphoneCheck(random);
      expect(check.kind).toBe("scheduled");
      if (check.kind === "scheduled") {
        expect(check.startMs).toBeGreaterThanOrEqual(keptAtMs + stopFadeMs);
      }
    });

    it.each<StopReason>([
      "control",
      "hidden",
      "pageLeft",
      "deviceChanged",
      "interrupted",
    ])(
      "stops on the stop %s through the stop fade, and steps no more",
      async (reason) => {
        const { backend, timer, output, advance } = await playingMusic();
        output.setCalibrationMusicTarget(-40);
        if (reason === "control") {
          output.stopAll();
        } else {
          backend.fire(reason);
        }
        expect(backend.loopTimeline().at(-1)).toMatchObject({
          kind: "fadeToSilence",
          durationMs: stopFadeMs,
        });
        expect(output.calibrationMusicSettingDb()).toBeNull();
        const callCount = backend.loopTimeline().length;
        advance(20 * calibrationMusicGainStepMs);
        expect(backend.loopTimeline().length).toBe(callCount);
        expect(timer.pendingCount()).toBe(0);
      },
    );

    it("keeps the Played_Setting reached, rounded down to the grid, and stops the music", async () => {
      const { backend, output, advance } = await playingMusic();
      const targetDb = calibrationSettingKeepMinDb + 3;
      output.setCalibrationMusicTarget(targetDb);
      // Stop half way through a ramp that rises past a grid setting.
      const stepsToTarget =
        ((targetDb - calibrationSettingMinDb) * calibrationMusicRisePeriodMs) /
        (calibrationRiseMaxDb * calibrationMusicGainStepMs);
      advance((stepsToTarget - 2) * calibrationMusicGainStepMs);
      backend.advanceClockBy(calibrationMusicGainStepMs / 2);
      // The last ramp runs from targetDb - 0.5 to targetDb - 0.25 dB: reached is targetDb - 0.5.
      const kept = output.keepCalibration();
      expect(kept).toMatchObject({
        kind: "kept",
        settingDb: targetDb - calibrationSettingStepDb,
      });
      expect(loopCalls(backend).at(-1)).toMatchObject({
        kind: "stopLoop",
        fadeOutMs: stopFadeMs,
      });
      expect(output.calibrationMusicSettingDb()).toBeNull();
    });

    it("keeps a setting on the grid reached exactly", async () => {
      const { output, advance } = await playingMusic();
      const targetDb = calibrationSettingKeepMinDb + 3;
      output.setCalibrationMusicTarget(targetDb);
      advance(400 * calibrationMusicGainStepMs);
      expect(output.keepCalibration()).toMatchObject({
        kind: "kept",
        settingDb: targetDb,
      });
    });

    it("refuses to keep below the Keep_Minimum while the music plays on", async () => {
      const { backend, output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(calibrationSettingKeepMinDb - 2);
      advance(400 * calibrationMusicGainStepMs);
      expect(output.keepCalibration()).toEqual({
        kind: "refused",
        reason: "systemVolumeHigh",
      });
      expect(loopCalls(backend).some((call) => call.kind === "stopLoop")).toBe(
        false,
      );
      expect(output.calibrationMusicSettingDb()).toBe(
        calibrationSettingKeepMinDb - 2,
      );
    });

    it("keeps after the music stopped, from the setting it had reached", async () => {
      const { output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(calibrationSettingKeepMinDb);
      advance(400 * calibrationMusicGainStepMs);
      output.stopCalibrationMusic();
      expect(output.keepCalibration()).toMatchObject({
        kind: "kept",
        settingDb: calibrationSettingKeepMinDb,
      });
    });

    it("starts again from the bottom after a stop", async () => {
      const { backend, output, advance } = await playingMusic();
      output.setCalibrationMusicTarget(-50);
      advance(100 * calibrationMusicGainStepMs);
      output.stopAll();
      await output.activate();
      advance(stopFadeMs + scheduleLeadMs);
      expect(output.startCalibrationMusic()).toMatchObject({
        kind: "started",
        settingDb: calibrationSettingMinDb,
      });
      const starts = loopCalls(backend).filter(
        (call) => call.kind === "startLoop",
      );
      expect(starts).toHaveLength(2);
    });

    it("leaves the hiss repeats as they were while the sound is the hiss", async () => {
      const { backend, output } = musicSetup({
        calibrationMusic: { mode: "reject" },
      });
      await output.activate();
      await flush();
      output.beginCalibration();
      expect(output.startCalibrationMusic()).toEqual({
        kind: "refused",
        reason: "notReady",
      });
      const played = playRepeatsTo(output, backend, -50);
      expect(played[0]).toBe(calibrationSettingMinDb);
      expect(
        backend.loopTimeline().filter((call) => call.kind !== "fadeToSilence"),
      ).toEqual([]);
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

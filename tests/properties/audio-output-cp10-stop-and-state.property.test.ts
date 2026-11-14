import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import type {
  ActivateResult,
  StopEvent,
} from "../../src/audio/output/create-audio-output";
import type { FakeRunningMode } from "../../src/audio/output/fake-audio-backend";
import type { StopReason } from "../../src/audio/output/output-types";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { ShellOperation } from "./output-arbitraries";
import {
  keepableSettingArbitrary,
  playOperationArbitrary,
  shellOperationsArbitrary,
} from "./output-arbitraries";
import {
  advance,
  advanceTo,
  calibrate,
  createShellUnderTest,
} from "./output-shell-harness";
import {
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

// The shell renders through the synth; these properties give it the worst-case renderers (D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 300;
/** Runs of the second case, which makes sure a device change is followed by plays (D43). */
const deviceChangeRuns = 100;

const runningModeArbitrary = fc.constantFrom<FakeRunningMode>(
  "immediate",
  "manual",
  "reject",
);

/**
 * For a shell that starts running and calibrated: a few plays and waits, a device change, a new
 * activate, then plays and checks mixed with waits and activates, then any operations.
 */
const afterDeviceChangeArbitrary: fc.Arbitrary<readonly ShellOperation[]> = fc
  .tuple(
    fc.array(
      fc.oneof(
        playOperationArbitrary,
        fc.constant<ShellOperation>({ kind: "waitForEnd" }),
      ),
      { maxLength: 4 },
    ),
    fc.array(
      fc.oneof(
        { weight: 4, arbitrary: playOperationArbitrary },
        {
          weight: 1,
          arbitrary: fc.constant<ShellOperation>({ kind: "headphoneCheck" }),
        },
        {
          weight: 3,
          arbitrary: fc.constant<ShellOperation>({ kind: "waitForEnd" }),
        },
        {
          weight: 1,
          arbitrary: fc.constant<ShellOperation>({ kind: "activate" }),
        },
      ),
      { minLength: 1, maxLength: 10 },
    ),
    shellOperationsArbitrary,
  )
  .map(([prefix, plays, rest]) => [
    ...prefix,
    { kind: "event", event: "deviceChanged" },
    { kind: "activate" },
    ...plays,
    ...rest,
  ]);

function peakOf(samples: Float32Array): number {
  return samples.reduce(
    (largest, sample) => Math.max(largest, Math.abs(sample)),
    0,
  );
}

/**
 * Applies the operations to a shell on the fake backend, which starts calibrated at
 * `keptSettingDb` when that is not null, and checks CP10 after every operation.
 */
async function checkSequence(
  seed: number,
  sampleRateHz: number,
  initialMode: FakeRunningMode,
  keptSettingDb: number | null,
  operations: readonly ShellOperation[],
): Promise<void> {
  const { stopFadeMs } = audioOutputConfig;
  const shell = createShellUnderTest({ seed, sampleRateHz });
  const { backend, output } = shell;
  const secondListener: StopEvent[] = [];
  output.onStop((event) => secondListener.push(event));
  if (keptSettingDb !== null) {
    await calibrate(shell, keptSettingDb);
  }
  backend.setRunningMode(initialMode);

  let mode = initialMode;
  let pendingActivation: Promise<ActivateResult> | null = null;
  /** True from a kept calibration until a device change or a new calibration. */
  let calibrationValid = keptSettingDb !== null;
  /** End of the last scheduled sound, cut short by a stop. */
  let lastEndMs = Number.NEGATIVE_INFINITY;
  const scheduledBefore = backend.scheduled();
  if (scheduledBefore.length > 0) {
    const last = scheduledBefore[scheduledBefore.length - 1];
    lastEndMs = last.startMs + (last.left.length / sampleRateHz) * 1000;
  }

  const stopReasonsSoFar = (): StopReason[] =>
    shell.stops.map((event) => event.reason);
  const fadeCount = (): number =>
    backend.calls.filter((call) => call.kind === "fadeToSilence").length;

  for (const operation of operations) {
    const stateBefore = output.state().kind;
    const callCountBefore = backend.calls.length;
    const stopCountBefore = shell.stops.length;

    const checkScheduled = (outcome: {
      kind: "refused" | "scheduled";
      startMs?: number;
      endMs?: number;
    }): void => {
      const newCalls = backend.calls.slice(callCountBefore);
      if (outcome.kind !== "scheduled") {
        expect(newCalls).toEqual([]);
        return;
      }
      expect(stateBefore).toBe("running");
      expect(newCalls.length).toBe(1);
      const [call] = newCalls;
      expect(call.kind).toBe("schedule");
      if (call.kind !== "schedule") {
        return;
      }
      expect(call.startMs).toBe(outcome.startMs);
      expect(call.startMs).toBeGreaterThanOrEqual(lastEndMs);
      expect(
        Math.max(peakOf(call.left), peakOf(call.right)),
      ).toBeLessThanOrEqual(audioSafetyConfig.ceilingFraction);
      lastEndMs = outcome.endMs ?? Number.NaN;
    };

    const stopNow = (reason: StopReason, fire: () => void): void => {
      const nowMs = backend.currentTimeMs();
      fire();
      const expected =
        stateBefore !== "inactive" && stateBefore !== "unsupported";
      if (!expected) {
        expect(backend.calls.length).toBe(callCountBefore);
        expect(shell.stops.length).toBe(stopCountBefore);
        return;
      }
      expect(backend.calls.slice(callCountBefore)).toEqual([
        { kind: "fadeToSilence", durationMs: stopFadeMs },
      ]);
      expect(shell.stops.slice(stopCountBefore)).toEqual([{ reason }]);
      expect(output.state().kind).toBe("stopped");
      lastEndMs = Math.min(lastEndMs, nowMs + stopFadeMs);
      if (reason === "deviceChanged") {
        calibrationValid = false;
      }
    };

    switch (operation.kind) {
      case "play":
        checkScheduled(output.play({ ...operation, random: shell.random }));
        break;
      case "headphoneCheck":
        checkScheduled(output.playHeadphoneCheck(shell.random));
        break;
      case "repeat":
        checkScheduled(
          output.playCalibrationRepeat({
            requestedSettingDb: operation.requestedSettingDb,
            random: shell.random,
          }),
        );
        break;
      case "keep":
        if (output.keepCalibration().kind === "kept") {
          calibrationValid = true;
        }
        break;
      case "beginCalibration":
        output.beginCalibration();
        calibrationValid = false;
        break;
      case "beginRoom":
        output.beginRoom();
        break;
      case "activate": {
        const activation = output.activate();
        // While starting, activate returns the activation in progress, which settles only
        // when the test settles it.
        if (mode === "manual" || stateBefore === "starting") {
          pendingActivation = activation;
        } else {
          await activation;
        }
        break;
      }
      case "settleRunning":
        backend.settleRunning();
        if (pendingActivation !== null) {
          await pendingActivation;
          pendingActivation = null;
        }
        break;
      case "runningMode":
        mode = operation.mode;
        backend.setRunningMode(operation.mode);
        break;
      case "stopAll":
        stopNow("control", () => output.stopAll());
        break;
      case "event":
        stopNow(operation.event, () => backend.fire(operation.event));
        break;
      case "advance":
      case "waitForEnd": {
        if (operation.kind === "advance") {
          advance(shell, operation.durationMs);
        } else if (Number.isFinite(lastEndMs)) {
          advanceTo(shell, lastEndMs);
        }
        const newCalls = backend.calls.slice(callCountBefore);
        for (const call of newCalls) {
          expect(["suspend", "close"]).toContain(call.kind);
        }
        if (newCalls.length > 0) {
          expect(output.state().kind).toBe("stopped");
        }
        break;
      }
    }

    // A scheduled ghost sound, or headphone check, needs a calibration kept since the
    // last device change (R14.6, D18).
    if (
      (operation.kind === "play" || operation.kind === "headphoneCheck") &&
      backend.calls.length > callCountBefore
    ) {
      expect(calibrationValid).toBe(true);
    }
    // Every stop faded, and every listener heard it (R14.1, R14.7).
    expect(fadeCount()).toBe(shell.stops.length);
    expect(secondListener.map((event) => event.reason)).toEqual(
      stopReasonsSoFar(),
    );
  }
}

describe("audio output CP10. Stop holds, and one sound plays at a time (Universal; R4.4, R12, R14.1 to R14.7)", () => {
  it("fades on every stop, schedules only while running, never overlaps sounds and forgets the calibration on a device change", async () => {
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        supportedSampleRateArbitrary,
        runningModeArbitrary,
        // Half the runs start running with a kept calibration, so that ghost sounds play.
        fc.option(keepableSettingArbitrary(calibrationSettingTopDb()), {
          freq: 2,
        }),
        shellOperationsArbitrary,
        checkSequence,
      ),
      { numRuns: runs },
    );
  }, 120_000);

  it("refuses every ghost sound after a device change until a new calibration is kept", async () => {
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        supportedSampleRateArbitrary,
        keepableSettingArbitrary(calibrationSettingTopDb()),
        afterDeviceChangeArbitrary,
        (seed, sampleRateHz, keptSettingDb, operations) =>
          checkSequence(
            seed,
            sampleRateHz,
            "immediate",
            keptSettingDb,
            operations,
          ),
      ),
      { numRuns: deviceChangeRuns },
    );
  }, 120_000);
});

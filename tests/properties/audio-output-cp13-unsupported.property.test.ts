import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import type { UnsupportedEvent } from "../../src/audio/output/create-audio-output";
import type { UnsupportedReason } from "../../src/audio/output/output-types";
import { shellOperationsArbitrary } from "./output-arbitraries";
import { advance, createShellUnderTest } from "./output-shell-harness";
import {
  rejectedSampleRateArbitrary,
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

// The shell renders through the synth; these properties give it the worst-case renderers (D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, Correctness properties). */
const runs = 100;

interface Device {
  readonly hasWebAudio: boolean;
  readonly sampleRateHz: number;
  readonly outputChannelCountMax: number;
}

const isSupportedRate = (sampleRateHz: number): boolean =>
  Number.isFinite(sampleRateHz) &&
  sampleRateHz >= soundRulesConfig.sampleRateMinHz;

/** The reason the shell must give, checked in the order of `activate` (design.md). */
function expectedReason(device: Device): UnsupportedReason {
  if (!device.hasWebAudio) {
    return "noWebAudio";
  }
  if (!isSupportedRate(device.sampleRateHz)) {
    return "sampleRateTooLow";
  }
  return "monoOutput";
}

/** A device with no Web Audio, a rejected rate, or fewer than two channels, or several of these. */
const unsupportedDeviceArbitrary: fc.Arbitrary<Device> = fc
  .record({
    hasWebAudio: fc.boolean(),
    sampleRateHz: fc.oneof(
      rejectedSampleRateArbitrary,
      supportedSampleRateArbitrary,
    ),
    outputChannelCountMax: fc.integer({ min: 0, max: 8 }),
  })
  .filter(
    (device) =>
      !device.hasWebAudio ||
      !isSupportedRate(device.sampleRateHz) ||
      device.outputChannelCountMax < 2,
  );

describe("audio output CP13. Devices that cannot carry the house (Universal; R5.2 to R5.4)", () => {
  it("becomes unsupported with the right reason, closes any context it created, and plays nothing afterwards", async () => {
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        unsupportedDeviceArbitrary,
        shellOperationsArbitrary,
        async (seed, device, operations) => {
          const shell = createShellUnderTest({ seed, ...device });
          const { backend, output } = shell;
          const reported: UnsupportedEvent[] = [];
          output.onUnsupported((event) => reported.push(event));

          const reason = expectedReason(device);
          const sampleRateHz =
            reason === "noWebAudio" ? null : device.sampleRateHz;
          const expected = { kind: "unsupported", reason, sampleRateHz };
          await expect(output.activate()).resolves.toEqual(expected);
          expect(output.state()).toEqual(expected);
          expect(reported).toEqual([{ reason, sampleRateHz }]);
          if (reason === "noWebAudio") {
            expect(backend.calls).toEqual([]);
            expect(backend.contextState()).toBe("none");
          } else {
            expect(backend.calls).toEqual([
              { kind: "createOrResume" },
              { kind: "close" },
            ]);
            expect(backend.contextState()).toBe("closed");
          }

          const callCount = backend.calls.length;
          for (const operation of operations) {
            switch (operation.kind) {
              case "play":
                expect(
                  output.play({ ...operation, random: shell.random }),
                ).toEqual({ kind: "refused", reason: "unsupported" });
                break;
              case "headphoneCheck":
                expect(output.playHeadphoneCheck(shell.random)).toEqual({
                  kind: "refused",
                  reason: "unsupported",
                });
                break;
              case "repeat":
                expect(
                  output.playCalibrationRepeat({
                    requestedSettingDb: operation.requestedSettingDb,
                    random: shell.random,
                  }),
                ).toEqual({ kind: "refused", reason: "unsupported" });
                break;
              case "keep":
                expect(output.keepCalibration().kind).toBe("refused");
                break;
              case "beginCalibration":
                output.beginCalibration();
                break;
              case "beginRoom":
                output.beginRoom();
                break;
              case "activate":
                await expect(output.activate()).resolves.toEqual(expected);
                break;
              case "settleRunning":
                backend.settleRunning();
                break;
              case "runningMode":
                backend.setRunningMode(operation.mode);
                break;
              case "stopAll":
                output.stopAll();
                break;
              case "event":
                backend.fire(operation.event);
                break;
              case "advance":
                advance(shell, operation.durationMs);
                break;
              case "waitForEnd":
                break;
            }
            expect(output.state()).toEqual(expected);
          }
          expect(backend.calls.length).toBe(callCount);
          expect(shell.stops).toEqual([]);
          expect(reported.length).toBe(1);
          expect(output.rangeReport()).toBeNull();
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});

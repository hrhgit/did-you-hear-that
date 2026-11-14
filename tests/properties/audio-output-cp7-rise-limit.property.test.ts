import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { Ear } from "../../src/audio/output/output-types";
import {
  keepableSettingArbitrary,
  riseOperationsArbitrary,
} from "./output-arbitraries";
import {
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
const runs = 200;

/** The shell's own tolerance for a rise of one step (D15). */
const riseToleranceDb = 1e-9;
/**
 * Played levels stand for applied gains to within 10⁻⁹ relative (R8.2), about 10⁻⁸ dB, so a rise
 * measured between played levels gets this much more room.
 */
const levelSlackDb = 1e-7;

describe("audio output CP7. No jump upward (Universal; R11.1 to R11.5)", () => {
  it("rises by at most one step per ear within a Room_Span, except for a replay, which stays within the cap", async () => {
    const { capRelativeToAnchorDb, upwardStepDb } = hearingMethodConfig;
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        supportedSampleRateArbitrary,
        keepableSettingArbitrary(calibrationSettingTopDb()),
        riseOperationsArbitrary,
        async (seed, sampleRateHz, settingDb, operations) => {
          const shell = createShellUnderTest({ seed, sampleRateHz });
          await calibrate(shell, settingDb);
          // The last calibration repeat played at Level 0, in both ears, at the kept setting.
          let previousDb: Record<Ear, number | null> = { left: 0, right: 0 };
          for (const operation of operations) {
            if (operation.kind === "beginRoom") {
              shell.output.beginRoom();
              previousDb = { left: null, right: null };
              continue;
            }
            if (operation.kind !== "play") {
              continue;
            }
            const outcome = shell.output.play({
              ...operation,
              random: shell.random,
            });
            expect(outcome.kind).toBe("scheduled");
            if (outcome.kind !== "scheduled") {
              return;
            }
            const playedDb = outcome.playedLevelDb;
            const previous = previousDb[operation.ear];
            const cappedDb = Math.min(operation.levelDb, capRelativeToAnchorDb);
            if (operation.purpose !== "replay" && previous !== null) {
              expect(playedDb - previous).toBeLessThanOrEqual(
                upwardStepDb + riseToleranceDb + levelSlackDb,
              );
              // A ceiling clamp may follow a rise clamp and then names the limit.
              if (outcome.clampLimit !== "ceiling") {
                expect(outcome.clampLimit === "rise").toBe(
                  cappedDb - previous > upwardStepDb + riseToleranceDb,
                );
              }
            } else {
              expect(outcome.clampLimit).not.toBe("rise");
            }

            // CP1 holds for every sound, a replay included.
            expect(playedDb).toBeLessThanOrEqual(capRelativeToAnchorDb);
            expect(playedDb).toBeLessThanOrEqual(operation.levelDb);
            const scheduled = shell.backend.scheduled();
            const call = scheduled[scheduled.length - 1];
            const [played, other] =
              operation.ear === "left"
                ? [call.left, call.right]
                : [call.right, call.left];
            const peak = played.reduce(
              (largest, sample) => Math.max(largest, Math.abs(sample)),
              0,
            );
            expect(peak).toBeLessThanOrEqual(audioSafetyConfig.ceilingFraction);
            expect(other.every((sample) => Object.is(sample, 0))).toBe(true);

            previousDb[operation.ear] = playedDb;
            advanceTo(shell, outcome.endMs);
          }
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});

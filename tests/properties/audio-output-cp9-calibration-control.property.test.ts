import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import { calibrationOperationsArbitrary } from "./output-arbitraries";
import { advanceTo, createShellUnderTest } from "./output-shell-harness";
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

describe("audio output CP9. The calibration control (Universal; R16.1 to R16.6, R15.1)", () => {
  it("starts every calibration at the bottom, stays on the grid and in range, rises by at most one step and keeps only what it played", async () => {
    const {
      calibrationSettingMinDb,
      calibrationSettingStepDb,
      calibrationRiseMaxDb,
      calibrationSettingKeepMinDb,
    } = audioOutputConfig;
    const topDb = calibrationSettingTopDb();
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        supportedSampleRateArbitrary,
        calibrationOperationsArbitrary,
        async (seed, sampleRateHz, operations) => {
          const shell = createShellUnderTest({ seed, sampleRateHz });
          const { output } = shell;
          await output.activate();
          output.beginCalibration();
          let calibrating = true;
          let lastDb: number | null = null;
          let keptDb: number | null = null;

          for (const operation of operations) {
            switch (operation.kind) {
              case "repeat": {
                const outcome = output.playCalibrationRepeat({
                  requestedSettingDb: operation.requestedSettingDb,
                  random: shell.random,
                });
                if (!calibrating) {
                  expect(outcome).toEqual({
                    kind: "refused",
                    reason: "notCalibrating",
                  });
                  break;
                }
                expect(outcome.kind).toBe("scheduled");
                if (outcome.kind !== "scheduled") {
                  return;
                }
                const { settingDb } = outcome;
                if (lastDb === null) {
                  expect(settingDb).toBe(calibrationSettingMinDb);
                } else {
                  expect(settingDb - lastDb).toBeLessThanOrEqual(
                    calibrationRiseMaxDb,
                  );
                  if (Number.isNaN(operation.requestedSettingDb)) {
                    expect(settingDb).toBe(lastDb);
                  } else {
                    expect(settingDb).toBeLessThanOrEqual(
                      Math.max(
                        calibrationSettingMinDb,
                        operation.requestedSettingDb,
                      ),
                    );
                  }
                }
                const steps =
                  (settingDb - calibrationSettingMinDb) /
                  calibrationSettingStepDb;
                expect(Number.isInteger(steps)).toBe(true);
                expect(settingDb).toBeGreaterThanOrEqual(
                  calibrationSettingMinDb,
                );
                expect(settingDb).toBeLessThanOrEqual(topDb);
                expect(outcome.atTop).toBe(settingDb === topDb);
                // Not the ceiling, and no other limit either.
                expect(outcome.clampLimit).toBeNull();
                lastDb = settingDb;
                advanceTo(shell, outcome.endMs);
                break;
              }
              case "keep": {
                const outcome = output.keepCalibration();
                if (!calibrating) {
                  expect(outcome).toEqual({
                    kind: "refused",
                    reason: "notCalibrating",
                  });
                } else if (lastDb === null) {
                  expect(outcome).toEqual({
                    kind: "refused",
                    reason: "noRepeatPlayed",
                  });
                } else if (lastDb < calibrationSettingKeepMinDb) {
                  expect(outcome).toEqual({
                    kind: "refused",
                    reason: "systemVolumeHigh",
                  });
                } else {
                  expect(outcome).toMatchObject({
                    kind: "kept",
                    settingDb: lastDb,
                  });
                  keptDb = lastDb;
                  calibrating = false;
                  lastDb = null;
                }
                break;
              }
              case "beginCalibration":
                output.beginCalibration();
                calibrating = true;
                lastDb = null;
                keptDb = null;
                break;
              case "play":
              case "headphoneCheck": {
                const outcome =
                  operation.kind === "play"
                    ? output.play({ ...operation, random: shell.random })
                    : output.playHeadphoneCheck(shell.random);
                if (keptDb === null) {
                  expect(outcome).toEqual({
                    kind: "refused",
                    reason: "notCalibrated",
                  });
                } else if (outcome.kind === "scheduled") {
                  advanceTo(shell, outcome.endMs);
                }
                break;
              }
              default:
                break;
            }
          }
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});

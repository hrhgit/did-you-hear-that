import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { AudioOutput } from "../../src/audio/output/create-audio-output";
import { createCalibrationController } from "../../src/session/calibration-controller";
import type { VisitSnapshot } from "../../src/session/visit-flow-types";
import {
  calibrationControlPathArbitrary,
  type CalibrationControlStep,
} from "./audible-start-arbitraries";
import { advance, createShellUnderTest } from "./output-shell-harness";
import { seedArbitrary } from "./sound-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";
import { performanceOffsetMaxMs } from "./visit-flow-arbitraries";

// audible-start CP7 (design.md, "Correctness properties"; R3). For any sequence of targets,
// presses of louder and quieter, starts and stops at drawn times, with the hiss repeats: every
// played setting is on the control's grid, the first of each calibration is the bottom and each is
// at most `calibrationRiseMaxDb` above the one before; the target is always on the grid within the
// control; NaN and values that are not numbers change nothing; ±Infinity give the ends; a target
// set before the start leaves the target at the bottom after it; louder and quieter give what they
// gave before audible-start. The first part runs the calibration controller on an output shell, the
// second the visit flow on the Visit_Harness.

// The shell renders through the synth; these properties give it the worst-case renderers (audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Correctness properties", CP7). */
const runs = 300;
/** How long the clocks run on after the last step, so that the repeats it asked for are played. */
const afterPathMs = 15_000;

const {
  calibrationSettingMinDb: bottomDb,
  calibrationSettingStepDb: stepDb,
  calibrationRiseMaxDb,
} = audioOutputConfig;
const topDb = calibrationSettingTopDb();

/** Every setting of the control's grid, from the bottom to the top. */
const gridDb: readonly number[] = Array.from(
  { length: Math.floor((topDb - bottomDb) / stepDb) + 1 },
  (_, k) => bottomDb + k * stepDb,
);

const isOnGrid = (settingDb: number): boolean => gridDb.includes(settingDb);

/**
 * The target a request gives, as the table of "The calibration target" states it, or null for a
 * request that changes nothing: held from the bottom to the top (so ±Infinity give the ends), then
 * rounded down to the grid with the tolerance of `next-calibration-setting.ts`, whose arithmetic
 * the table names: a request within 10⁻⁹ of a step below a grid setting counts as that setting.
 * `expectBracketed` checks the result apart from that arithmetic.
 */
function expectedTargetDb(settingDb: unknown): number | null {
  if (typeof settingDb !== "number" || Number.isNaN(settingDb)) {
    return null;
  }
  const heldDb = Math.min(topDb, Math.max(bottomDb, settingDb));
  const stepCount = Math.floor((heldDb - bottomDb) / stepDb + 1e-9);
  const targetDb = bottomDb + stepCount * stepDb;
  expectBracketed(heldDb, targetDb);
  return targetDb;
}

/**
 * A target for a request held within the control is a grid setting, never louder than the request
 * by more than the tolerance, and the highest such: less than one step below the request.
 */
function expectBracketed(heldDb: number, targetDb: number): void {
  expect(isOnGrid(targetDb)).toBe(true);
  expect(targetDb).toBeLessThanOrEqual(heldDb + 1e-9 * stepDb);
  expect(targetDb).toBeGreaterThan(heldDb - stepDb);
}

/** The target of `louder` before audible-start: one step up from the higher of target and played, held within the control. */
const louderBefore = (targetDb: number, playedDb: number | null): number =>
  Math.min(
    topDb,
    Math.max(bottomDb, Math.max(targetDb, playedDb ?? targetDb) + stepDb),
  );

/** The target of `quieter` before audible-start: one step down from the played setting, held within the control. */
const quieterBefore = (targetDb: number, playedDb: number | null): number =>
  Math.min(topDb, Math.max(bottomDb, (playedDb ?? targetDb) - stepDb));

/** Checks the played settings of one calibration after another, as the shell reports them. */
function createPlayedChecker() {
  const faults: string[] = [];
  let previousDb: number | null = null;
  return {
    faults,
    /** A new calibration: its first played setting must be the bottom. */
    begin(): void {
      previousDb = null;
    },
    played(settingDb: number, requestedDb: number): void {
      if (!isOnGrid(settingDb)) {
        faults.push(`${String(settingDb)} dB is not on the control's grid`);
      }
      if (previousDb === null) {
        if (settingDb !== bottomDb) {
          faults.push(
            `the first repeat of a calibration played at ${String(settingDb)} dB`,
          );
        }
      } else if (settingDb > previousDb + calibrationRiseMaxDb) {
        faults.push(
          `a repeat rose from ${String(previousDb)} to ${String(settingDb)} dB`,
        );
      }
      if (settingDb > Math.max(bottomDb, requestedDb)) {
        faults.push(
          `a repeat played ${String(settingDb)} dB for a target of ${String(requestedDb)} dB`,
        );
      }
      previousDb = settingDb;
    },
  };
}

describe("audible-start CP7. The calibration target (Universal; R3)", () => {
  it("on the calibration controller: the target follows the table, louder and quieter as before, and the repeats rise by at most one step from the bottom", async () => {
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        calibrationControlPathArbitrary([
          "louder",
          "quieter",
          "start",
          "keep",
          "close",
          "stopAll",
          "hidden",
          "interrupted",
          "deviceChanged",
          "pageLeft",
        ]),
        async (seed, path) => {
          const shell = createShellUnderTest({
            seed,
            sampleRateHz: soundRulesConfig.sampleRateMinHz,
            performanceOffsetMs: 0,
          });
          const checker = createPlayedChecker();
          const output: AudioOutput = Object.freeze({
            ...shell.output,
            beginCalibration() {
              checker.begin();
              shell.output.beginCalibration();
            },
            playCalibrationRepeat(
              request: Parameters<AudioOutput["playCalibrationRepeat"]>[0],
            ) {
              const outcome = shell.output.playCalibrationRepeat(request);
              if (outcome.kind === "scheduled") {
                checker.played(outcome.settingDb, request.requestedSettingDb);
              }
              return outcome;
            },
          });
          const controller = createCalibrationController({
            output,
            timer: shell.timer,
            random: shell.random,
          });
          await shell.output.activate();

          let modelTargetDb = bottomDb;
          let elapsedMs = 0;
          for (const step of path) {
            advance(shell, step.atMs - elapsedMs);
            elapsedMs = step.atMs;
            const before = controller.snapshot();
            expect(before.targetSettingDb).toBe(modelTargetDb);
            switch (step.kind) {
              case "target": {
                controller.setTarget(step.settingDb);
                const expectedDb = expectedTargetDb(step.settingDb);
                if (expectedDb === null) {
                  expect(controller.snapshot()).toEqual(before);
                } else {
                  modelTargetDb = expectedDb;
                }
                if (step.settingDb === Number.POSITIVE_INFINITY) {
                  expect(controller.snapshot().targetSettingDb).toBe(topDb);
                }
                if (step.settingDb === Number.NEGATIVE_INFINITY) {
                  expect(controller.snapshot().targetSettingDb).toBe(bottomDb);
                }
                break;
              }
              case "louder":
                controller.louder();
                modelTargetDb = louderBefore(
                  before.targetSettingDb,
                  before.playedSettingDb,
                );
                break;
              case "quieter":
                controller.quieter();
                modelTargetDb = quieterBefore(
                  before.targetSettingDb,
                  before.playedSettingDb,
                );
                break;
              case "start":
                if (shell.output.state().kind !== "running") {
                  await shell.output.activate();
                }
                controller.open();
                // Whatever the target was before, a calibration starts at the bottom (D3).
                modelTargetDb = bottomDb;
                break;
              case "keep":
                controller.keep();
                break;
              case "close":
                controller.close();
                break;
              case "stopAll":
                shell.output.stopAll();
                break;
              case "hidden":
              case "interrupted":
              case "deviceChanged":
              case "pageLeft":
                shell.backend.fire(step.kind);
                break;
              default:
                break;
            }
            const after = controller.snapshot();
            expect(after.targetSettingDb, step.kind).toBe(modelTargetDb);
            expect(isOnGrid(after.targetSettingDb)).toBe(true);
          }
          advance(shell, afterPathMs);
          expect(controller.snapshot().targetSettingDb).toBe(modelTargetDb);
          expect(checker.faults).toEqual([]);
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);

  it("on the visit flow: the snapshot's target is the bottom until the sound starts, then follows the table; it is ignored while a pause holds; the played setting rises by at most one step", async () => {
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        fc.integer({ min: 0, max: performanceOffsetMaxMs }),
        calibrationControlPathArbitrary([
          "louder",
          "quieter",
          "start",
          "resume",
          "hidden",
          "interrupted",
          "deviceChanged",
        ]),
        async (seed, performanceOffsetMs, path) => {
          // With the hiss repeats, as the property states: the music cannot be loaded.
          const harness = createVisitHarness({
            seed,
            performanceOffsetMs,
            music: "reject",
          });
          const { flow } = harness;
          flow.chooseVisit("quick");
          await harness.settle();
          const startMs = harness.now();

          type Calibration = Extract<VisitSnapshot, { stage: "calibration" }>;
          const calibrationOf = (snapshot: VisitSnapshot): Calibration => {
            if (snapshot.stage !== "calibration") {
              throw new Error(`The visit left calibration: ${snapshot.stage}.`);
            }
            return snapshot;
          };

          /** True from the visit's start, or a device change, until the visitor starts the sound. */
          let fresh = true;
          /** The controller's target, which the snapshot shows once the calibration is not fresh. */
          let modelTargetDb = bottomDb;
          /** The setting the controller last played, which louder and quieter read. */
          let controllerPlayedDb: number | null = null;

          const expectShown = (snapshot: Calibration, label: string): void => {
            expect(snapshot.targetSettingDb, label).toBe(
              fresh ? bottomDb : modelTargetDb,
            );
            expect(snapshot.controlBottomDb).toBe(bottomDb);
            expect(snapshot.controlTopDb).toBe(topDb);
            expect(isOnGrid(snapshot.targetSettingDb!), label).toBe(true);
          };

          const give = async (step: CalibrationControlStep): Promise<void> => {
            const before = calibrationOf(flow.snapshot());
            const accepted = before.pause === null;
            if (!fresh) {
              controllerPlayedDb = before.playedSettingDb;
            }
            switch (step.kind) {
              case "target": {
                flow.setCalibrationTarget(step.settingDb);
                await harness.settle();
                const expectedDb = expectedTargetDb(step.settingDb);
                if (!accepted || expectedDb === null) {
                  // Ignored while a pause holds (R3.9); NaN and non-numbers change nothing (R3.3).
                  expect(flow.snapshot()).toEqual(before);
                } else {
                  modelTargetDb = expectedDb;
                }
                return;
              }
              case "louder":
              case "quieter":
                flow[step.kind]();
                await harness.settle();
                if (accepted) {
                  modelTargetDb = (
                    step.kind === "louder" ? louderBefore : quieterBefore
                  )(modelTargetDb, controllerPlayedDb);
                }
                return;
              case "start": {
                flow.startCalibration();
                await harness.settle();
                if (!accepted) {
                  return;
                }
                fresh = false;
                modelTargetDb = bottomDb;
                const after = calibrationOf(flow.snapshot());
                // A target set before the start leaves the target at the bottom (R3.5, D3).
                expect(after.playing).toBe(true);
                expect(after.targetSettingDb).toBe(bottomDb);
                expect([null, bottomDb]).toContain(after.playedSettingDb);
                return;
              }
              case "resume": {
                const reason = before.pause?.reason ?? null;
                flow.resume();
                await harness.settle();
                if (
                  reason === "deviceChanged" &&
                  calibrationOf(flow.snapshot()).pause === null
                ) {
                  // A device change calibrates again from a fresh screen (visit-flow R13.2); the
                  // controller keeps the setting it last played, which louder and quieter read.
                  fresh = true;
                }
                return;
              }
              case "hidden":
              case "interrupted":
              case "deviceChanged":
                await harness.fireOutputEvent(step.kind);
                return;
              default:
                return;
            }
          };

          for (const step of path) {
            await harness.advanceTo(startMs + step.atMs);
            expectShown(calibrationOf(flow.snapshot()), `before ${step.kind}`);
            await give(step);
            expectShown(calibrationOf(flow.snapshot()), `after ${step.kind}`);
          }
          await harness.advance(afterPathMs);
          expectShown(calibrationOf(flow.snapshot()), "at the end");

          // Every played setting the flow showed, in order: on the grid, the first after a fresh
          // screen the bottom, and none more than one step of the hiss above the one before.
          let previousDb: number | null = null;
          for (const { snapshot } of harness.snapshots) {
            if (snapshot.stage !== "calibration") {
              continue;
            }
            const playedDb = snapshot.playedSettingDb;
            if (playedDb !== null) {
              expect(isOnGrid(playedDb)).toBe(true);
              if (previousDb === null) {
                expect(playedDb).toBe(bottomDb);
              } else {
                expect(playedDb - previousDb).toBeLessThanOrEqual(
                  calibrationRiseMaxDb,
                );
              }
            }
            previousDb = playedDb;
          }
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import { swappedRepeatEngineSeed } from "../../src/session/swapped-repeat-engine-seed";
import type { SwappedRepeatRun } from "../../src/session/visit-flow-types";
import {
  finishingRepeatScriptArbitrary,
  runnableRepeatLogCaseArbitrary,
} from "./swapped-repeat-arbitraries";
import type { RepeatHarness, RepeatStageVisit } from "./swapped-repeat-harness";
import { createRepeatHarness } from "./swapped-repeat-harness";

// CP4. The room runs exactly as before (Universal; swapped-repeat design.md, CP4; R7, R19.3). For
// a drawn visit log at the result whose floor used the last calibration, and a repeat script that
// reaches the end of the room, played on the repeat harness:
// - the record's `attempt.searchCapDb` is the first run's `searchCapDb`, and its
//   `calibrationIndex` the first run's;
// - `createThresholdSearch` with `hearingMethodConfig`, that cap and `attempt.engineSeed`, given
//   the record's scored responses in order, asks for exactly the record's scored trials (kind,
//   ear, level, gap, trial number) and gives the record's room result;
// - every trial was played with the Purpose `trial`, the room's Sound_Id and the visit's render
//   source, and every check with the visit's render source;
// - each trial, and each refused play, comes its own gap after the moment its wait began: the
//   start of the room, the scoring or the refusal before it, or the end of a pause after those, on
//   the page clock, as visit-flow CP4 states for rooms;
// - the engine seed equals `swappedRepeatEngineSeed(log, runNumber)` and the draw the flow's part
//   made from the visit's source. CP10 checks it against the flow's own draw.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 300;
const timeoutMs = 120_000;
/** Times are sums of whole and fractional milliseconds on the timer's clock; equal up to rounding. */
const sameTimeMs = 1e-6;

function checkSearch(record: SwappedRepeatRun): void {
  const search = createThresholdSearch({
    settings: {
      ...hearingMethodConfig,
      capRelativeToAnchorDb: record.attempt.searchCapDb,
    },
    random: createSeededRandom(record.attempt.engineSeed),
  });
  let step = search.current();
  for (const trial of record.trials) {
    if (trial.status !== "scored") {
      continue;
    }
    expect(step.kind).toBe("trial");
    if (step.kind !== "trial") {
      return;
    }
    expect(step.trial.kind).toBe(trial.kind);
    expect(step.trial.trialNumber).toBe(trial.trialNumber);
    expect(step.trial.gapBeforeMs).toBe(trial.gapBeforeMs);
    if (step.trial.kind === "sound" && trial.kind === "sound") {
      expect(step.trial.ear).toBe(trial.ear);
      expect(step.trial.levelDb).toBe(trial.requestedLevelDb);
    }
    step = search.respond(trial.response);
  }
  expect(step.kind).toBe("finished");
  if (step.kind !== "finished") {
    return;
  }
  expect(record.attempt.result).toEqual({
    left: step.result.left,
    right: step.result.right,
    noSoundTrialCount: step.result.noSoundTrialCount,
    falseAlarmCount: step.result.falseAlarmCount,
    falseAlarmRateFraction: step.result.falseAlarmRateFraction,
    falseAlarmRateAboveLimit: step.result.falseAlarmRateAboveLimit,
  });
}

/** One moment a trial was presented or refused, and when its wait ended it. */
interface Presentation {
  readonly atMs: number;
  readonly trialNumber: number;
  /** When the next wait may begin: the trial's scoring or discarding, or the refusal itself. */
  readonly decidedAtMs: number;
}

function checkGaps(record: SwappedRepeatRun): void {
  const gapOf = new Map(
    record.trials.map((trial) => [trial.trialNumber, trial.gapBeforeMs]),
  );
  const presentations: Presentation[] = [
    ...record.trials.map((trial) => ({
      atMs: trial.presentedAtMs,
      trialNumber: trial.trialNumber,
      decidedAtMs:
        trial.status === "scored" ? trial.scoredAtMs : trial.discardedAtMs,
    })),
    ...record.refusedPlays.map((refusal) => ({
      atMs: refusal.atMs,
      trialNumber: refusal.trialNumber,
      decidedAtMs: refusal.atMs,
    })),
  ].sort((a, b) => a.atMs - b.atMs);
  let waitFromMs = record.attempt.startedAtMs;
  for (const presentation of presentations) {
    const resumedAtMs = record.pauses
      .map((pause) => pause.endedAtMs)
      .filter(
        (endedAtMs) =>
          endedAtMs >= waitFromMs - sameTimeMs &&
          endedAtMs <= presentation.atMs + sameTimeMs,
      );
    const beganAtMs = Math.max(waitFromMs, ...resumedAtMs);
    const gapMs = gapOf.get(presentation.trialNumber);
    expect(gapMs).toBeDefined();
    expect(
      Math.abs(presentation.atMs - beganAtMs - (gapMs ?? Number.NaN)),
    ).toBeLessThan(sameTimeMs);
    waitFromMs = presentation.decidedAtMs;
  }
}

function checkSounds(harness: RepeatHarness, visit: RepeatStageVisit): void {
  const roomId = harness.log.rooms[visit.floorIndex]!.roomId;
  for (const sound of harness.sounds) {
    if (sound.visitIndex !== visit.index) {
      continue;
    }
    expect(sound.withSoundRandom).toBe(true);
    if (sound.kind === "trial") {
      expect(sound.request?.purpose).toBe("trial");
      expect(sound.request?.soundId).toBe(roomId);
    }
  }
}

describe("swapped repeat CP4: the room runs exactly as before", () => {
  it(
    "runs the floor's search with the first run's cap and calibration, its own seed, the room's sound and the search's gaps",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          runnableRepeatLogCaseArbitrary,
          finishingRepeatScriptArbitrary,
          async (logCase, script) => {
            const harness = await createRepeatHarness({
              logCase,
              outputDelayMs: script.outputDelayMs,
            });
            await harness.run(script);
            const visit = harness.visits[0];
            expect(visit).toBeDefined();
            expect(visit?.record).not.toBeNull();
            if (visit === undefined || visit.record === null) {
              return;
            }
            const record = visit.record;
            const firstRun = harness.log.roomAttempts
              .filter(
                (attempt) =>
                  attempt.roomIndex === visit.floorIndex &&
                  attempt.ending === "finished",
              )
              .at(-1)!;
            expect(record.attempt.searchCapDb).toBe(
              harness.summary.rooms[visit.floorIndex]!.searchCapDb,
            );
            expect(record.attempt.searchCapDb).toBe(firstRun.searchCapDb);
            expect(record.calibrationIndex).toBe(firstRun.calibrationIndex);
            expect(record.attempt.calibrationIndex).toBe(
              firstRun.calibrationIndex,
            );
            checkSearch(record);
            checkGaps(record);
            checkSounds(harness, visit);
            expect(record.attempt.engineSeed).toBe(visit.drawnEngineSeed);
            expect(record.attempt.engineSeed).toBe(
              swappedRepeatEngineSeed(harness.log, record.runNumber),
            );
            for (const each of harness.visits) {
              if (each.drawnEngineSeed !== null) {
                expect(each.drawnEngineSeed).toBe(
                  swappedRepeatEngineSeed(harness.log, each.runNumber),
                );
              }
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

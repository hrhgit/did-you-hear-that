import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import type { UnreliableReason } from "../../src/engine/search-types";
import { atMostFraction } from "../../src/engine/fraction-comparisons";
import { summarizeVisit } from "../../src/session/summarize-visit";
import type {
  LoggedEarResult,
  LoggedRoomAttempt,
  LoggedRoomResult,
  VisitLog,
} from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";
import { playVisit } from "../listeners/simulated-visitor";
import { visitRunArbitrary } from "./visit-flow-arbitraries";
import { createVisitHarness } from "./visit-flow-harness";

// The visits of the visit part render with the worst-case renderers (D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs of the pure part (visit-flow design.md, CP9). */
const pureRuns = 300;
/** Runs of the visit part (visit-flow design.md, CP9). */
const visitRuns = 50;

const { swappedRepeatDifferenceDb, startingLevelDb, upwardStepDb, floorDb } =
  hearingMethodConfig;

const reasonOrder: readonly UnreliableReason[] = [
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
];

const countsArbitrary = fc.record({
  presentationCount: fc.nat({ max: 40 }),
  catchCount: fc.nat({ max: 40 }),
  wrongSideCount: fc.nat({ max: 40 }),
  missCount: fc.nat({ max: 40 }),
});

/** Levels on the search's grid from the floor to the anchor cap. */
const gridLevelArbitrary = fc
  .integer({
    min: Math.ceil((floorDb - startingLevelDb) / upwardStepDb),
    max: Math.floor(
      (hearingMethodConfig.capRelativeToAnchorDb - startingLevelDb) /
        upwardStepDb,
    ),
  })
  .map((stepCount) => startingLevelDb + stepCount * upwardStepDb);

/** Any of the search's four end states, with reasons in the search's order. */
const earResultArbitrary: fc.Arbitrary<LoggedEarResult> = fc.oneof(
  fc
    .tuple(countsArbitrary, gridLevelArbitrary)
    .map(([counts, thresholdDb]) => ({
      ...counts,
      state: "found" as const,
      thresholdDb,
    })),
  countsArbitrary.map((counts) => ({
    ...counts,
    state: "betterThanFloor" as const,
  })),
  countsArbitrary.map((counts) => ({
    ...counts,
    state: "worseThanCap" as const,
  })),
  fc
    .tuple(
      countsArbitrary,
      fc
        .subarray([...reasonOrder], { minLength: 1 })
        .map((reasons) =>
          reasonOrder.filter((reason) => reasons.includes(reason)),
        ),
    )
    .map(([counts, reasons]) => ({
      ...counts,
      state: "unreliable" as const,
      reasons,
    })),
);

const roomResultArbitrary: fc.Arbitrary<LoggedRoomResult> = fc
  .tuple(
    earResultArbitrary,
    earResultArbitrary,
    fc.integer({ min: 1, max: 13 }),
    fc.double({ min: 0, max: 1, noNaN: true }),
  )
  .map(([left, right, noSoundTrialCount, falseAlarmShare]) => {
    const falseAlarmCount = Math.round(falseAlarmShare * noSoundTrialCount);
    return {
      left,
      right,
      noSoundTrialCount,
      falseAlarmCount,
      falseAlarmRateFraction: falseAlarmCount / noSoundTrialCount,
      falseAlarmRateAboveLimit: !atMostFraction(
        falseAlarmCount,
        noSoundTrialCount,
        hearingMethodConfig.falseAlarmRateUnreliableAboveFraction,
      ),
    };
  });

/** Any limit from 0.05 to 0.30, with the round candidates drawn often so that exact ties occur. */
const limitArbitrary = fc.oneof(
  fc.constantFrom(0.05, 0.1, 0.15, 0.2, 0.25, 0.3),
  fc.double({ min: 0.05, max: 0.3, noNaN: true }),
);

function logOf(results: readonly LoggedRoomResult[]): VisitLog {
  const rooms = visitRooms("full").slice(0, results.length);
  const roomAttempts = results.map((result, roomIndex): LoggedRoomAttempt => ({
    roomIndex,
    attempt: 1,
    engineSeed: roomIndex,
    calibrationIndex: 0,
    searchCapDb: hearingMethodConfig.capRelativeToAnchorDb,
    startedAtMs: roomIndex,
    endedAtMs: roomIndex + 1,
    ending: "finished",
    result,
  }));
  return {
    formatVersion: 1,
    visitType: "full",
    visitSeed: 0,
    rooms,
    calibrations: [],
    headphoneChecks: [],
    roomAttempts,
    trials: [],
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
}

function searchReasons(result: LoggedEarResult): readonly UnreliableReason[] {
  return result.state === "unreliable" ? result.reasons : [];
}

describe("visit flow CP9. The summary follows the log, and the visit rule only adds (Universal; R17, R18)", () => {
  it("applies the visit rule to any room results and any limit as the design states", () => {
    fc.assert(
      fc.property(
        fc.array(roomResultArbitrary, { minLength: 1, maxLength: 5 }),
        limitArbitrary,
        (results, limitFraction) => {
          const summary = summarizeVisit(logOf(results), {
            swappedRepeatDifferenceDb,
            visitFalseAlarmRateUnreliableAboveFraction: limitFraction,
          });

          const pooledNoSound = results.reduce(
            (sum, result) => sum + result.noSoundTrialCount,
            0,
          );
          const pooledFalseAlarms = results.reduce(
            (sum, result) => sum + result.falseAlarmCount,
            0,
          );
          const aboveLimit = !atMostFraction(
            pooledFalseAlarms,
            pooledNoSound,
            limitFraction,
          );
          expect(summary.pooledNoSoundTrialCount).toBe(pooledNoSound);
          expect(summary.pooledFalseAlarmCount).toBe(pooledFalseAlarms);
          expect(summary.visitFalseAlarmRateAboveLimit).toBe(aboveLimit);
          expect(summary.rooms).toHaveLength(results.length);

          results.forEach((result, roomIndex) => {
            const room = summary.rooms[roomIndex];
            expect(room).toBeDefined();
            if (room === undefined) {
              return;
            }
            for (const ear of ["left", "right"] as const) {
              const given = result[ear];
              const shown = room[ear];
              if (aboveLimit) {
                expect(shown).toEqual({
                  presentationCount: given.presentationCount,
                  catchCount: given.catchCount,
                  wrongSideCount: given.wrongSideCount,
                  missCount: given.missCount,
                  state: "unreliable",
                  reasons: [...searchReasons(given), "visitFalseAlarmRate"],
                });
              } else {
                expect(shown).toEqual(given);
              }
              if (given.state === "unreliable") {
                expect(shown.state).toBe("unreliable");
                if (shown.state === "unreliable") {
                  expect(shown.reasons.slice(0, given.reasons.length)).toEqual(
                    given.reasons,
                  );
                }
              }
            }

            const { left, right } = room;
            const bothFound = left.state === "found" && right.state === "found";
            const differenceDb =
              left.state === "found" && right.state === "found"
                ? right.thresholdDb - left.thresholdDb
                : null;
            expect(room.rightMinusLeftDb).toBe(differenceDb);
            expect(room.swappedRepeatOffered).toBe(
              bothFound &&
                differenceDb !== null &&
                Math.abs(differenceDb) >= swappedRepeatDifferenceDb,
            );
            if (aboveLimit) {
              expect(room.swappedRepeatOffered).toBe(false);
            }
          });
        },
      ),
      { numRuns: pureRuns },
    );
  }, 120_000);

  it("gives every visit that reaches the result the summary of its log", async () => {
    await fc.assert(
      fc.asyncProperty(
        visitRunArbitrary({ withEnding: false }),
        async (visitRun) => {
          const harness = createVisitHarness({
            seed: visitRun.seed,
            performanceOffsetMs: visitRun.performanceOffsetMs,
          });
          const run = await playVisit(harness, visitRun.script);
          const snapshot = harness.flow.snapshot();
          expect(run.ending).toBe("done");
          expect(snapshot.stage).toBe("result");
          if (snapshot.stage !== "result") {
            return;
          }
          expect(snapshot.summary).toEqual(summarizeVisit(snapshot.visitLog));
        },
      ),
      { numRuns: visitRuns },
    );
  }, 120_000);
});

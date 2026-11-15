import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { missedSoundReplayConfig } from "../../src/config/missed-sound-replay-config";
import { planMissedSoundReplay } from "../../src/session/missed-sound-replay-plan";
import type {
  ScoredVisitTrial,
  VisitLog,
} from "../../src/session/visit-flow-types";
import {
  mostCountArbitrary,
  planSettingsOf,
  visitLogArbitrary,
} from "./missed-sound-replay-arbitraries";

// CP1. The replay holds exactly the missed sounds, in order, on their ears, within the cap
// (Universal; missed-sound-replay design.md, CP1; R3, R4.1 to R4.3, R5.1, R5.2; brief property
// 1). For a drawn visit log and a most count, an oracle written from R3 and R4, not from the
// plan's code, lists the missed trials of finished runs and what the replay must do with each.
// CP7 checks the same of what was played.

/** Runs (design.md, "Run counts and time"). */
const runs = 1000;
const timeoutMs = 120_000;

const { capRelativeToAnchorDb } = hearingMethodConfig;
const { replayRaiseDb } = missedSoundReplayConfig;

type MissedTrial = Extract<ScoredVisitTrial, { readonly kind: "sound" }>;

/**
 * R3.2, R3.3: a trial of kind `sound`, scored `missed`, in a room run whose ending is
 * `finished`, in the order of `order`.
 */
function oracleMissedTrials(log: VisitLog): MissedTrial[] {
  const missed: MissedTrial[] = [];
  for (const trial of log.trials) {
    if (
      trial.kind !== "sound" ||
      trial.status !== "scored" ||
      trial.outcome !== "missed"
    ) {
      continue;
    }
    const run = log.roomAttempts.find(
      (attempt) =>
        attempt.roomIndex === trial.roomIndex &&
        attempt.attempt === trial.attempt,
    );
    if (run?.ending === "finished") {
      missed.push(trial);
    }
  }
  return missed.sort((a, b) => a.order - b.order);
}

/** R5.2, D7: `floor(k × (n − 1) / (m − 1))` for k from 0 to m − 1, in integers. */
function oraclePositions(n: number, m: number): number[] {
  if (n <= m) {
    return Array.from({ length: n }, (_, index) => index);
  }
  return Array.from({ length: m }, (_, k) => {
    const numerator = k * (n - 1);
    return (numerator - (numerator % (m - 1))) / (m - 1);
  });
}

describe("missed-sound replay CP1: the replay holds exactly the missed sounds, in order, within the cap", () => {
  it(
    "plans every missed trial of a finished run once, in order, on its ear and room, raised and held at the cap",
    () => {
      fc.assert(
        fc.property(visitLogArbitrary, mostCountArbitrary, ({ log }, most) => {
          const plan = planMissedSoundReplay(log, planSettingsOf(most));
          const missed = oracleMissedTrials(log);
          const mostCount =
            most ?? missedSoundReplayConfig.replaySoundsMaxCount;
          const calibration = log.calibrations.at(-1)!;

          const expected = missed.map((trial) => {
            const room = log.rooms[trial.roomIndex]!;
            const raisedLevelDb = trial.playedLevelDb + replayRaiseDb;
            const replayCapDb = Math.min(
              calibration.roomTopLevelDb[room.roomId],
              capRelativeToAnchorDb,
            );
            const askedLevelDb = Math.min(raisedLevelDb, replayCapDb);
            return {
              trialOrder: trial.order,
              room,
              ear: trial.ear,
              missedLevelDb: trial.playedLevelDb,
              raisedLevelDb,
              replayCapDb,
              askedLevelDb,
              heldByCap: askedLevelDb < raisedLevelDb,
            };
          });
          expect(plan.missedSounds).toEqual(expected);

          const positions = oraclePositions(missed.length, mostCount);
          expect(plan.sounds).toEqual(
            positions.map((position) => expected[position]),
          );
          expect(plan.selected).toBe(missed.length > mostCount);
          if (missed.length > 0) {
            expect(plan.sounds[0]).toEqual(expected[0]);
            expect(plan.sounds.at(-1)).toEqual(expected.at(-1));
          }

          const trialOf = new Map(
            log.trials.map((trial) => [trial.order, trial]),
          );
          for (const sound of plan.missedSounds) {
            expect(sound.askedLevelDb).toBeLessThanOrEqual(sound.replayCapDb);
            expect(sound.replayCapDb).toBeLessThanOrEqual(
              capRelativeToAnchorDb,
            );
            expect(sound.raisedLevelDb).toBe(
              sound.missedLevelDb + replayRaiseDb,
            );
            // No caught, wrong-side, discarded or no-sound trial, and none of an abandoned run.
            const trial = trialOf.get(sound.trialOrder)!;
            expect(trial).toMatchObject({
              kind: "sound",
              status: "scored",
              outcome: "missed",
            });
            expect(
              log.roomAttempts.find(
                (attempt) =>
                  attempt.roomIndex === trial.roomIndex &&
                  attempt.attempt === trial.attempt,
              )?.ending,
            ).toBe("finished");
          }
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

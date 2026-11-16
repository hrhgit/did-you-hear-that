import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { RoomResult } from "../../src/engine/search-types";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import { earpieceOnEar } from "../../src/session/earpiece-on-ear";
import {
  summarizeVisit,
  visitEarResult,
} from "../../src/session/summarize-visit";
import { swappedRepeatOutcome } from "../../src/session/swapped-repeat-outcome";
import type {
  EarpieceArrangement,
  LoggedRoomResult,
  RoomSummary,
  VisitLog,
} from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";
import { createPsychometricListener } from "../listeners/psychometric-listener";
import { generousTrialBudgetCount } from "../listeners/search-under-test";
import { wornHeadphones } from "../listeners/worn-headphones";
import {
  attributionCaseArbitrary,
  type AttributionCase,
} from "./swapped-repeat-arbitraries";
import {
  acceptedAnswers,
  type AttributionAnswer,
} from "./swapped-repeat-oracle";

// CP1. Correct attribution (Universal; swapped-repeat design.md, CP1; R10, R20.1; brief
// property). A Step_Listener in Worn_Headphones of a drawn ear difference E and imbalance H plays
// the floor once with the earpieces as marked and once swapped, through createThresholdSearch with
// hearingMethodConfig and the drawn cap, as the Repeat_Controller creates it: the search asks for
// an ear and the output is asked for the earpiece on that ear. The first run's ears are judged by
// summarizeVisit, the offer as the summary gives it, the repeat's ears as a room's, and the
// outcome by swappedRepeatOutcome. The answer is in the oracle's accepted set for D1 = E + H and
// D2 = E − H, and where one of E and H is zero it is the brief's own sentence (Q1, decided by the
// owner on 2026-11-15). The listeners are Step_Listeners (Q2, decided by the owner's coordinator
// on 2026-11-16, at the owner's request).

/**
 * Runs (design.md, "Run counts and time"; Q9, decided by the owner's coordinator on 2026-11-16,
 * at the owner's request).
 */
const runs = 1000;
const timeoutMs = 120_000;

const stepDb = hearingMethodConfig.upwardStepDb;
const limitDb = hearingMethodConfig.swappedRepeatDifferenceDb;

/** The floor of every case: the first room of a quick visit. */
const room = visitRooms("quick")[0]!;

/** Plays one run of the floor with the earpieces in this arrangement, until the search finishes. */
function playRun(
  attributionCase: AttributionCase,
  arrangement: EarpieceArrangement,
  engineSeed: number,
): RoomResult {
  const { earDifferenceDb, imbalanceDb, baseDb, searchCapDb } = attributionCase;
  const listener = createPsychometricListener(
    {
      trueThresholdDb: {
        left: baseDb - earDifferenceDb / 2,
        right: baseDb + earDifferenceDb / 2,
      },
      widthDb: 0,
      lapseFraction: 0,
      falseAlarmFraction: 0,
      wrongSideFraction: 0,
    },
    // A Step_Listener's answers do not depend on its draws.
    createSeededRandom(0),
  );
  const earpieces = earpieceOnEar(arrangement);
  // The visitor wears the headphones the way the run asks for.
  const hear = wornHeadphones(listener, {
    imbalanceDb,
    earpieceOnEar: earpieces,
  });
  const search = createThresholdSearch({
    settings: { ...hearingMethodConfig, capRelativeToAnchorDb: searchCapDb },
    random: createSeededRandom(engineSeed),
  });
  let step = search.current();
  for (let count = 0; step.kind === "trial"; count += 1) {
    if (count >= generousTrialBudgetCount) {
      throw new Error("The room did not finish within the trial budget.");
    }
    const { trial } = step;
    step = search.respond(
      trial.kind === "sound"
        ? hear({
            kind: "sound",
            earpiece: earpieces[trial.ear],
            levelDb: trial.levelDb,
          })
        : hear({ kind: "noSound" }),
    );
  }
  return step.result;
}

const loggedResult = (result: RoomResult): LoggedRoomResult => ({
  left: result.left,
  right: result.right,
  noSoundTrialCount: result.noSoundTrialCount,
  falseAlarmCount: result.falseAlarmCount,
  falseAlarmRateFraction: result.falseAlarmRateFraction,
  falseAlarmRateAboveLimit: result.falseAlarmRateAboveLimit,
});

/** The first run's floor as summarizeVisit gives it, from a log of that one run. */
function firstRunSummary(result: RoomResult, searchCapDb: number): RoomSummary {
  const log: VisitLog = {
    formatVersion: 1,
    visitType: "quick",
    visitSeed: 0,
    rooms: [room],
    calibrations: [],
    headphoneChecks: [],
    roomAttempts: [
      {
        roomIndex: room.roomIndex,
        attempt: 1,
        engineSeed: 0,
        calibrationIndex: 0,
        searchCapDb,
        startedAtMs: 0,
        endedAtMs: 0,
        ending: "finished",
        result: loggedResult(result),
      },
    ],
    trials: [],
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  };
  return summarizeVisit(log).rooms[0]!;
}

/** Plays both runs and gives the runs' ears and the floor's answer. */
function attribution(attributionCase: AttributionCase) {
  const firstResult = playRun(
    attributionCase,
    "asMarked",
    attributionCase.firstEngineSeed,
  );
  const repeatResult = playRun(
    attributionCase,
    "swapped",
    attributionCase.repeatEngineSeed,
  );
  const first = firstRunSummary(firstResult, attributionCase.searchCapDb);
  const repeat = {
    left: visitEarResult(repeatResult.left, []),
    right: visitEarResult(repeatResult.right, []),
  };
  const answer: AttributionAnswer = first.swappedRepeatOffered
    ? swappedRepeatOutcome({
        first: { left: first.left, right: first.right },
        repeat,
      }).outcome
    : "notOffered";
  return { first, repeat, answer };
}

/** The brief's own answer where one of E and H is zero and every ear has a level, or null. */
function briefAnswer(
  attributionCase: AttributionCase,
): AttributionAnswer | null {
  const { earDifferenceDb: e, imbalanceDb: h, inside } = attributionCase;
  if (!inside || (e !== 0 && h !== 0)) {
    return null;
  }
  const other = Math.abs(e === 0 ? h : e);
  if (other < limitDb - stepDb) {
    return "notOffered";
  }
  if (other >= limitDb + stepDb) {
    return h === 0 ? "followsEar" : "followsEarpiece";
  }
  return null;
}

describe("CP1. Correct attribution (Universal; R10, R20.1; brief property)", () => {
  it(
    "gives the rule's answer for D1 = E + H and D2 = E − H, and the brief's where one of E and H is zero",
    () => {
      fc.assert(
        fc.property(attributionCaseArbitrary, (attributionCase) => {
          const { first, repeat, answer } = attribution(attributionCase);
          const accepted = acceptedAnswers({
            earDifferenceDb: attributionCase.earDifferenceDb,
            imbalanceDb: attributionCase.imbalanceDb,
            first,
            repeat,
          });
          expect(
            [...accepted],
            `the answer ${answer} for E = ${String(attributionCase.earDifferenceDb)}, H = ${String(attributionCase.imbalanceDb)}, first run ${JSON.stringify([first.left, first.right])}, repeat ${JSON.stringify([repeat.left, repeat.right])}`,
          ).toContain(answer);
          const brief = briefAnswer(attributionCase);
          if (brief !== null) {
            expect(answer).toBe(brief);
          }
        }),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );

  it(
    "gives every ear a level when every threshold through an earpiece lies one step inside the range",
    () => {
      fc.assert(
        fc.property(
          attributionCaseArbitrary.filter((drawn) => drawn.inside),
          (attributionCase) => {
            const { first, repeat } = attribution(attributionCase);
            for (const ear of [
              first.left,
              first.right,
              repeat.left,
              repeat.right,
            ]) {
              expect(ear.state).toBe("found");
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});

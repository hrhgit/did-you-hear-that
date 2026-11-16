// Regression cases for counterexamples the threshold search properties found (D20, R14.4, R14.5).
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found. It uses hard-coded listener parameters
// and seeds, so it replays the counterexample without fast-check, and it asserts the property's
// condition for that case alone. For a CP2 or CP3 case the seed is the parameter set's seed,
// from which every room's engine and listener seed is drawn (D39).
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// engine currently breaks it while keeping `npm test` green. The commit that changes the engine
// turns it into an ordinary `it` and records the change as a decision in design.md. A case whose
// only remedy would move a value the spec may not move silently stays `it.fails`, with a decision
// that gives the measured numbers (task 10, step 3; R14.6).

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import {
  atLeastFraction,
  atMostFraction,
} from "../../src/engine/fraction-comparisons";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp2AccurateOrFlaggedCheck } from "./checks/cp2-accurate-or-flagged-check";
import { cp3UsefulForAttentiveCheck } from "./checks/cp3-useful-for-attentive-check";
import { measureListenerSet } from "./checks/measure-listener-set";

/**
 * The settings every case was found with, written out (audible-start design.md, D35, "The cap"):
 * the cap was 15 dB above the anchor then, and the search started at −25 dB with the floor at −70
 * dB. The cases keep testing what they record, whatever the shipped settings become.
 */
const foundWithSettings = Object.freeze({
  ...hearingMethodConfig,
  startingLevelDb: -25,
  capRelativeToAnchorDb: 15,
  floorDb: -70,
});

/** CP2's condition for one parameter set: at least 93 percent of 800 ears Accurate or Flagged. */
function expectAccurateOrFlagged(
  parameters: PsychometricListenerParameters,
  setSeed: number,
): void {
  const { roomsPerSet, accurateOrFlaggedMinFraction } =
    cp2AccurateOrFlaggedCheck.parameters;
  const measurement = measureListenerSet(
    specSearchUnderTest,
    foundWithSettings,
    parameters,
    roomsPerSet,
  );
  expect(measurement.setSeed).toBe(setSeed);
  expect(
    atLeastFraction(
      measurement.accurateCount + measurement.flaggedCount,
      measurement.earCount,
      accurateOrFlaggedMinFraction,
    ),
    `Accurate or Flagged ${String(measurement.accurateFraction + measurement.flaggedFraction)}`,
  ).toBe(true);
}

/** CP3's condition for one parameter set: at least 88 percent Accurate and at most 10 percent Flagged. */
function expectUsefulForAttentive(
  parameters: PsychometricListenerParameters,
  setSeed: number,
): void {
  const { roomsPerSet, accurateMinFraction, flaggedMaxFraction } =
    cp3UsefulForAttentiveCheck.parameters;
  const measurement = measureListenerSet(
    specSearchUnderTest,
    foundWithSettings,
    parameters,
    roomsPerSet,
  );
  expect(measurement.setSeed).toBe(setSeed);
  expect(
    atLeastFraction(
      measurement.accurateCount,
      measurement.earCount,
      accurateMinFraction,
    ),
    `Accurate ${String(measurement.accurateFraction)}`,
  ).toBe(true);
  expect(
    atMostFraction(
      measurement.flaggedCount,
      measurement.earCount,
      flaggedMaxFraction,
    ),
    `Flagged ${String(measurement.flaggedFraction)}`,
  ).toBe(true);
}

describe("threshold search regressions", () => {
  // A narrow listener 0.1 dB below a level of the grid catches that level about 61 percent of
  // the time. The search stopped at the level above as soon as it had 2 ascending catches,
  // although the quieter level had 1 catch in 2 and could still reach 2 of 3. D40 made it wait,
  // and the grid band of the amended property 1 (D42) counts the remaining ears found at the
  // level above as Accurate: 800 of 800, of which 686 are within the original 5 dB.
  it("regression 1: found one step too loud while the quieter level could still reach 2 of 3 (CP2, seed 4263754660)", () => {
    expectAccurateOrFlagged(
      {
        trueThresholdDb: { left: -55.1, right: 0 },
        widthDb: 1,
        lapseFraction: 0,
        falseAlarmFraction: 0,
        wrongSideFraction: 0,
      },
      4263754660,
    );
  });

  // The same mechanism for an attentive listener 0.1 dB below the level 0.
  it("regression 2: attentive listener found one step too loud while the quieter level could still reach 2 of 3 (CP3, seed 3252736698)", () => {
    expectUsefulForAttentive(
      {
        trueThresholdDb: { left: -0.1, right: 0 },
        widthDb: 1,
        lapseFraction: 0,
        falseAlarmFraction: 0,
        wrongSideFraction: 0,
      },
      3252736698,
    );
  });

  // After D40: an attentive listener 0.1 dB below the level −45 is still found at −40, 5.1 dB
  // above its true threshold, in 13.75 percent of its ears. The grid band of the amended
  // property 1 (D42) counts −40 as Accurate: 800 of 800, of which 690 are within the original
  // 5 dB.
  it("regression 3: attentive listener just below a level of the grid found one step too loud (CP3, seed 2093169249)", () => {
    expectUsefulForAttentive(
      {
        trueThresholdDb: { left: -45.1, right: 0 },
        widthDb: 1,
        lapseFraction: 0,
        falseAlarmFraction: 0,
        wrongSideFraction: 0,
      },
      2093169249,
    );
  });

  // After D42: a listener who presses at nothing on almost 30 percent of trials, with both true
  // thresholds near the cap. Two guessed catches at one ascending level far below the threshold
  // end the ear as found, no catch lies 10 dB below that level, and with few no-sound trials the
  // room's false alarm rate stays at or below the limit. 734 of 800 ears are Accurate or Flagged.
  it.fails(
    "regression 4: guesser just under the false alarm limit found far below its threshold (CP2, seed 4040559320)",
    () => {
      expectAccurateOrFlagged(
        {
          trueThresholdDb: { left: 4.2, right: 14.7 },
          widthDb: 4.3,
          lapseFraction: 0.062,
          falseAlarmFraction: 0.299,
          wrongSideFraction: 0.006,
        },
        4040559320,
      );
    },
  );
});

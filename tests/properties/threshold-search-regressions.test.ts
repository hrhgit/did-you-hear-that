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
import { atLeastFraction } from "../../src/engine/fraction-comparisons";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp2AccurateOrFlaggedCheck } from "./checks/cp2-accurate-or-flagged-check";
import { measureListenerSet } from "./checks/measure-listener-set";

/** CP2's condition for one parameter set: at least 93 percent of 800 ears Accurate or Flagged. */
function expectAccurateOrFlagged(
  parameters: PsychometricListenerParameters,
  setSeed: number,
): void {
  const { roomsPerSet, accurateOrFlaggedMinFraction } =
    cp2AccurateOrFlaggedCheck.parameters;
  const measurement = measureListenerSet(
    specSearchUnderTest,
    hearingMethodConfig,
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

describe("threshold search regressions", () => {
  // A narrow listener 0.1 dB below a level of the grid catches that level about 61 percent of
  // the time. The search stopped at the level above as soon as it had 2 ascending catches,
  // although the quieter level had 1 catch in 2 and could still reach 2 of 3.
  it.fails(
    "regression 1: found one step too loud while the quieter level could still reach 2 of 3 (CP2, seed 4263754660)",
    () => {
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
    },
  );
});

// Regression cases for counterexamples the swapped repeat's properties find (R20.5, design.md,
// "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the input fast-check printed (the ear difference and the
// imbalance with the base level, the cap and the seeds, the ear results and settings, the visit
// log, the repeat script or the refusal script), runs that one case without fast-check, and
// asserts the property's condition for it alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// code currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case that could only be removed by changing a steering value, or a
// choice that is the owner's (Q1 to Q10), stays `it.fails` and is reported with the question it
// belongs to. A counterexample of CP1 is not evidence against Q1, which the owner decided on
// 2026-11-15; it is a fault of the code or of the oracle, and is reported with the case.
//
// A case where the property was wrong and the code was right is an ordinary `it` from the start,
// because the code passes it: it asserts the corrected condition for the input that showed the
// fault, so that the property cannot slip back to the wrong check.

import { describe, it } from "vitest";

describe("swapped repeat regressions", () => {
  it.todo("no counterexample has been found by a swapped repeat property yet");
});

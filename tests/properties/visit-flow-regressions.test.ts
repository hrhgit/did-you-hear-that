// Regression cases for counterexamples the visit flow properties find (R22.7, design.md,
// "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the visitor script, the flow's seed and the clock offset P
// that fast-check printed, plays that one visit on the Visit_Harness with
// `playVisit`, without fast-check, and asserts the property's condition for that visit alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// flow currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case whose only remedy would change a value from a steering file,
// or the visit limit that awaits the project owner's choice (Q1), stays `it.fails`, with a
// decision in design.md that gives the numbers.

import { describe, it } from "vitest";

describe("visit flow regressions", () => {
  it.todo("no counterexample has been found by a visit flow property yet");
});

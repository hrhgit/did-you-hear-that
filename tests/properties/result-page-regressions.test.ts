// Regression cases for counterexamples the result page properties find (R21.5, design.md,
// "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the input fast-check printed (the visit plan, the picture
// input, the stored value or the storage behaviour, and the calls made), runs that one case
// without fast-check, and asserts the property's condition for it alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// code currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case whose only remedy would change a value from a steering file,
// or a value decided on 2026-11-15 on the owner's behalf (Q1, Q4, Q5), stays `it.fails`, with a
// decision in design.md that gives the case.

import { describe, it } from "vitest";

describe("result page regressions", () => {
  it.todo("no counterexample has been found by a result page property yet");
});

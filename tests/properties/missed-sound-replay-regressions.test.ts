// Regression cases for counterexamples the missed-sound replay's properties find (R17.5,
// design.md, "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the input fast-check printed (the visit log plan, the most
// count, the replay script or the refusal script), runs that one case without fast-check, and
// asserts the property's condition for it alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// code currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case that could only be removed by changing a proposed value of Q1
// or Q2, or a steering value, stays `it.fails`, with a decision in design.md that gives the case.

import { describe, it } from "vitest";

describe("missed-sound replay regressions", () => {
  it.todo(
    "no counterexample has been found by a missed-sound replay property yet",
  );
});

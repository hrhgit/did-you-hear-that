// Regression cases for counterexamples the threshold search properties found (D20, R14.4, R14.5).
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found. It uses hard-coded listener parameters
// and seeds, so it replays the counterexample without fast-check, and it asserts the property's
// condition for that case alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// engine currently breaks it while keeping `npm test` green. The commit that changes the engine
// turns it into an ordinary `it` and records the change as a decision in design.md. A case whose
// only remedy would move a value the spec may not move silently stays `it.fails`, with a decision
// that gives the measured numbers (task 10, step 3; R14.6).

import { describe, it } from "vitest";

describe("threshold search regressions", () => {
  it.todo("cases are added here as task 10 handles each counterexample");
});

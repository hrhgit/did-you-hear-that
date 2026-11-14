// Regression cases for counterexamples the ghost sounds properties find (R16.6, design.md,
// Testing strategy).
//
// Naming: each case is called
// `regression <n>: <what went wrong> (<property>, <sound>, seed <s>, <rate> Hz)`, with <n> counting
// from 1 in the order the cases were found. It renders the sound with the hard-coded seed and
// sample rate, so it replays the counterexample without fast-check, and asserts the property's
// condition for that case alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// sound currently breaks it while keeping `npm test` green. The commit that changes the sound
// turns it into an ordinary `it`. A case whose only remedy would loosen a value from a steering
// file stays `it.fails`, with a decision in design.md that gives the measured numbers.
//
// No property has found a counterexample yet. Cases found by seed sweeps while the sounds were
// written, before these properties existed, sit next to their sounds: in
// `src/audio/synth/calibration-hiss.test.ts` (D36) and `src/audio/synth/stairs-scrape.test.ts`
// (D37).

import { describe, it } from "vitest";

describe("ghost sounds regressions", () => {
  it.todo("no counterexample has been found by a ghost sounds property yet");
});

// Regression cases for counterexamples the audio-output properties find (R20.6, design.md,
// Testing strategy).
//
// Naming: each case is called
// `regression <n>: <what went wrong> (<property>, <what was drawn>)`, with <n> counting from 1 in
// the order the cases were found. <what was drawn> gives the fast-check seed and path, and the
// spec fast-check printed: the buffer spec and request spec for CP1 to CP5 and CP12, or the sound,
// seed, sample rate, calibration setting and level for CP3 and CP6. The case rebuilds the request
// from those hard-coded values with `materializeRequest`, or renders the sound with the hard-coded
// seed, so it replays the counterexample without fast-check, and it asserts the property's
// condition for that case alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// output stage currently breaks it while keeping `npm test` green. The commit that changes the
// code turns it into an ordinary `it`. A case whose only remedy would loosen a value from a
// steering file or a guarded value of D32 stays `it.fails`, with a question for the project owner
// in design.md that gives the measured numbers.

import { describe, it } from "vitest";

describe("audio output regressions", () => {
  it.todo("no counterexample has been found by an audio-output property yet");
});

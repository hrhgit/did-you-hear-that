# src/session

The visit as a state machine: entry, calibration, rooms, last door, replay, result and swapped repeat. It is the only part that knows the order of things. It reads time only through an injected timer and gets randomness from a seeded generator, so a whole visit can run instantly in a unit test.

May import from: `engine`, `audio/output`, `storage`, `copy`, `config`.

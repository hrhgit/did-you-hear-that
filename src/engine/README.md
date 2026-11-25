# src/engine

The threshold search for one room. Pure logic: no audio, no DOM and no clock. Randomness comes in as a seeded generator, so every run can be replayed.

The entry point is `createThresholdSearch` in `threshold-search.ts`. It takes the settings (the hearing method config can be given unchanged) and a `RandomSource`. `current()` returns the trial to play next, `respond()` takes the visitor's answer, and when both ears have ended the room returns a result with one of four states per ear (found, better than floor, worse than cap, unreliable) and the record of every trial. The other files are its parts: settings validation, room limits, response classification, the per-ear search, the no-sound schedule and the final ear result. `cutOff()` ends the room at once from outside, because time is over: every ear still open ends as unreliable with the trial limit's reason, and the result is built as at any other end. `search-types.ts` holds the shared types.

May import from: `config`.

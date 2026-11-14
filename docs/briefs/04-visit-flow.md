# Brief 04: visit flow

## Goal

The visit from the front door to the result, as a state machine that connects the engine, the output stage and storage. No drawing.

## Stages

entry → headphone check → calibration → rules → rooms in order → last door (full visit only, if built) → missed-sound replay → result → optional swapped repeat

The quick visit has three rooms and the full visit has five, as listed in `src/config`.

## Behaviour to specify

- For each trial: ask the engine what to play, wait the gap it asked for, play through the output stage, open the response window when the sound starts, and score the first answer inside the window. No answer inside the window is a miss. For a no-sound trial the window opens at the moment a sound would have started.
- An answer outside any response window is ignored and counted, so that constant pressing can be detected.
- A response on a no-sound trial produces the event that makes the house say "I made no sound that time."
- Every trial is written to the visit log: order, room, ear or none, level, start time, answer, time to answer, outcome.
- The visitor can pause between rooms and can stop the visit at any time. Stopping silences everything and leads to a short exit screen, not to a partial result.
- If the tab is hidden during a trial, that trial is discarded and repeated later, and the visit pauses.
- Time is read only through the injected timer.
- The flow exposes snapshots of its state and a stream of events for the interface to draw from. Events that concern a trial are released only after that trial has been scored.

## Properties

- For any sequence of answers and any timing, a visit ends, and the visit log holds exactly the trials that were played, in order.
- No event that identifies a trial's ear or level is released before that trial is scored.

## Out of scope

- Drawing and input handling.
- The replay, the result page and the swapped repeat have their own specs. This spec only reaches those stages and hands them the visit log.

## Done when

Simulated quick and full visits run to the result with a fake timer in the test suite, for well-behaved and badly behaved listeners.

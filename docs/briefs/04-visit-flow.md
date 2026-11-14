# Brief 04: visit flow

## Goal

The visit from the front door to the result, as a state machine that connects the engine, the output stage and storage. No drawing.

## Stages

entry → calibration → headphone check → rules → rooms in order → last door (full visit only, if built) → missed-sound replay → result → optional swapped repeat

Calibration comes before the headphone check, as in `product.md`. Before calibration the output stage plays only the calibration noise, so the check uses that noise at the level the visitor has just matched (audio-output decision D20).

The quick visit has three rooms and the full visit has five, as listed in `src/config`.

## What the output stage asks of this spec

The section "What the visit-flow spec must do" in `.kiro/specs/audio-output/design.md` lists the calls this spec has to make: start sound only from a gesture, begin each room, give each room's search the highest level the house can play there as its cap, record the level that was played and not the level that was asked for, mark replays as replays, and calibrate again after the audio device changes. Treat that list as requirements here.

## Behaviour to specify

- For each trial: ask the engine what to play, wait the gap it asked for, play through the output stage, open the response window when the sound starts, and score the first answer inside the window. No answer inside the window is a miss. For a no-sound trial the window opens at the moment a sound would have started.
- An answer outside any response window is ignored and counted, so that constant pressing can be detected.
- A response on a no-sound trial produces the event that makes the house say "I made no sound that time."
- Every trial is written to the visit log: order, room, ear or none, level, start time, answer, time to answer, outcome.
- The visitor can pause between rooms and can stop the visit at any time. Stopping silences everything and leads to a short exit screen, not to a partial result.
- If the tab is hidden during a trial, that trial is discarded and repeated later, and the visit pauses.
- Time is read only through the injected timer.
- The flow exposes snapshots of its state and a stream of events for the interface to draw from. Events that concern a trial are released only after that trial has been scored.
- False alarms are also counted over the whole visit. One room has only about six no-sound trials, which is too few to catch a visitor who presses on a little under 30 percent of silent trials. The threshold-search spec measured this (its decision D43, regression 4): such a listener, with thresholds near the cap, gets an unflagged result far below the true threshold in about 6 percent of ears. A visit has three or five rooms, so its pooled count is three to five times larger. Specify a visit-level rule that uses the pooled count, say what it marks, and measure with the simulated listeners how much of that case it removes. The per-room limit in `hearing-method.md` stays as it is. Any new number is a config value and needs the project owner's approval before it changes a steering file.

## Properties

- For any sequence of answers and any timing, a visit ends, and the visit log holds exactly the trials that were played, in order.
- No event that identifies a trial's ear or level is released before that trial is scored.

## Out of scope

- Drawing and input handling.
- The replay, the result page and the swapped repeat have their own specs. This spec only reaches those stages and hands them the visit log.

## Done when

Simulated quick and full visits run to the result with a fake timer in the test suite, for well-behaved and badly behaved listeners.

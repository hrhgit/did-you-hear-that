# Requirements: headphone traits

## Introduction

On 2026-11-25 the project owner asked, translated from Chinese, for the game to estimate more about the visitor's headphones from the data a visit already collects, and to do it within one play of the game: no extra rounds, no swapping, no second pair of headphones. Rough estimates are fine as long as there is a method behind them. The owner chose three traits from a longer list: the delay of the headphones, a cut-off of very quiet sounds, and the balance between left and right. The owner also asked:

- that the delay be adjusted during the game, and not held at one value, so that a visitor on a slow pair of headphones can still keep up and catch the creatures;
- that the room stop asking again and again for sounds at the edge of hearing, where the visitor hears nothing and the game stops being fun.

This spec adds the three estimates, the delay that follows the visitor during the room, and easy turns that keep the room winnable. The threshold search itself does not change: every counted trial is the one the search asks for.

Also read: every file in `.kiro/steering/`; `.kiro/specs/one-room/`; `src/session/room-runner.ts`, `rhythm-score.ts`, `create-visit-flow.ts`; `src/engine/adaptive-ear-search.ts`.

Out of scope: an extra round or extra screen; the swapped repeat, which stays as it is and is still how a difference between the ears is settled; the frequency response of the headphones, which one visit cannot separate from the ear; the fit of an earbud, which needs a low pitch the visit does not have.

Acceptance criteria use EARS notation.

## Glossary

- **Extra_Delay**: the time from when the browser says a sound leaves the page to when it reaches the ear, beyond what the browser already reports. On wired headphones close to 0; on Bluetooth often 100 to 300 ms.
- **Timing_Offset**: the Extra_Delay as the room estimates it so far. It is taken off each answer time before the answer is graded.
- **Loud_Catch**: a caught sound that is plainly audible: a counted catch at or above `loudLevelMinDb`, or a caught easy turn.
- **Seen_Catch**: a caught practice sound of the roll call. While it plays the screen shows its creature on its side, so the visitor can answer from what they see.
- **Easy_Turn**: a turn that plays a creature's sound clearly above where it was last caught, and counts for nothing in the search. It is the reminder sound of the game layer, put on the beat.
- **Quiet_Cut**: a level under which the headphones or the system play nothing, the same for every pitch.
- **Balance_Offset**: how much quieter one side is than the other at every pitch alike.

## R1 The Timing_Offset follows the visitor

1. THE visit SHALL start with a Timing_Offset of 0 and keep one Timing_Offset for all its counting.
2. WHEN a Loud_Catch or a Seen_Catch is scored, THE room SHALL update the Timing_Offset from every Loud_Catch and Seen_Catch of the visit so far, by the method of design.md "The delay".
3. THE Timing_Offset SHALL change by at most `offsetSlewMs` at one update and stay between 0 and `offsetMaxMs`.
4. WHEN a counted turn is graded Perfect, Great or Good, THE room SHALL grade the answer time minus the Timing_Offset that was in force when the turn was presented. The search and the rhythm score SHALL see the same grade.
5. THE response window of a turn SHALL last `responseWindowMs` plus the Timing_Offset in force when the turn was presented.
6. THE cue of a turn SHALL land the Timing_Offset after its off-beat, so that what the visitor sees meets what they hear.
7. THE visit log SHALL keep the Timing_Offset of every scored trial and reminder.

## R2 Easy turns keep the room winnable

1. WHEN two of the last three counted sound turns of the room run were not caught, THE room SHALL make the next turn an Easy_Turn, unless an Easy_Turn came within the last `easyTurnSpacingCount` turns, or Easy_Turns already make up `easyTurnShareMax` of the turns so far.
2. THE Easy_Turn SHALL use a creature other than the one whose trial waits, where the run has another, so that it does not warn of the next counted sound. Its ear is drawn from a source of its own, not from the turn source of one-room D5.
3. THE Easy_Turn SHALL play `easyAboveCaughtDb` above where that creature was last caught on that ear, or at the starting level where it has not been caught, within the room's cap and floor.
4. THE Easy_Turn SHALL be cued and scored on the beat like any turn. A catch counts in the combo and the points. No search hears of it.

## R3 The delay estimate

1. WHEN the visit has at least `delayLoudCatchesMinCount` Loud_Catches, THE result SHALL estimate the Extra_Delay by design.md "The delay".
2. THE result SHALL say the delay in three bands, quick, noticeable and long, with a rounded number of milliseconds, and the delay the browser reported, when it reported one.

## R4 The quiet cut

1. THE result SHALL look for a Quiet_Cut in the edges the searches found, by design.md "The quiet cut".
2. WHERE a Quiet_Cut is found, THE result SHALL say at which level and that the pitches whose edge lies there may have been held up by the headphones, not the ear. It SHALL NOT change any threshold.

## R5 The balance

1. THE result SHALL estimate the Balance_Offset from the pitches where both ears found a level, by design.md "The balance".
2. WHERE the offset is plain and the same at every pitch, THE result SHALL say which side is quieter and by about how much, and that a pattern like this usually comes from the headphones or the balance setting. Otherwise it SHALL say nothing about the balance.

## R6 What may be said

1. THE three traits SHALL be about the headphones and the device at this volume, never about the visitor's hearing, and SHALL use none of the banned words of `wording.md`.
2. THE result SHALL show the traits as one compact row each, under the picture.

# Requirements: fine level estimate

## Introduction

On 2026-11-25 the project owner noticed, translated from Chinese, that the levels the game estimates are nearly always multiples of 5 dB, and asked for the game to adapt its search during play and give a finer estimate at the end, without adding rounds. The owner also asked earlier (headphone-traits spec) that the room stop dwelling on sounds the visitor cannot hear.

Why the levels land on multiples of 5 today (`src/engine/adaptive-ear-search.ts`):

1. Every probe is on the 5 dB grid `floorDb + k × upwardStepDb`, so each ear ends with a catch and a miss on two neighbouring grid levels.
2. The response model shifts the curve of "heard at all" by exactly `stepDb`. A miss at L − 5 then says the threshold is above L, and a clear catch at L says it is below L, so the posterior median sits on L.
3. The answer time reaches the search only as three grades (Perfect, Great, Good). The slowing of answers near the threshold is lost.

This spec makes the adaptive search probe on whole decibels, read the answer time as a continuous number, and report its estimate with a range. It also lets the other ear and the neighbouring pitches steer where the search probes, but never what it reports.

Also read: every file in `.kiro/steering/`; `.kiro/specs/headphone-traits/` (the Timing_Offset); `src/engine/adaptive-ear-search.ts` and its test; `src/engine/threshold-search.ts`; `src/session/room-runner.ts`.

Out of scope: the staircase and quick searches, which stay as they are; extra trials or an extra round; any change to `floorDb`, `capRelativeToAnchorDb`, `startingLevelDb` or the room's search floor and cap, which stay on the 5 dB grid; any comparison of pitches in what the result says.

Acceptance criteria use EARS notation.

## Glossary

- **Clear_Threshold**: the level at which a catch is clear half the time. This is what the adaptive search reports today, and keeps reporting, so that a new visit can still be set beside a saved one.
- **Detection_Lead**: how far below the Clear_Threshold a sound is caught at all half the time. Today it equals `stepDb` by accident; here it is its own number.
- **Net_Answer_Ms**: a catch's answer time from the sound's start, minus the Timing_Offset it was graded with.
- **Quick_Baseline_Ms**: the visitor's own quick answer to a plainly audible sound in this visit: the 25th percentile of the Net_Answer_Ms of the visit's Loud_Catches so far (headphone-traits glossary).
- **Steering_Prior**: a weak belief about an ear's Clear_Threshold made from the other ear at the same pitch and from the neighbouring pitches, used only to choose probes.
- **Report_Posterior**: the posterior from a flat prior and the ear's own answers only. Everything reported comes from it.

## R1 Probes on whole decibels

1. WHEN the adaptive search descends, THE search SHALL choose the next level among the whole-decibel levels from the current level minus the largest drop to the current level minus `minDropDb`, and not below `floorDb`, by the expected information about the Clear_Threshold.
2. THE largest drop SHALL be `downwardStepDb` while every catch so far was Perfect, and `upwardStepDb` after any other catch, as today.
3. WHEN the search ascends after a miss with no catch yet, THE search SHALL go up `upwardStepDb`, held at `capRelativeToAnchorDb`, as today.
4. Every level the search asks for SHALL be a whole number of decibels within `floorDb` to `capRelativeToAnchorDb`.
5. THE search SHALL stay deterministic: the same answers give the same levels.

## R2 The answer time as evidence

1. THE search SHALL accept, with each catch, the Net_Answer_Ms and the Quick_Baseline_Ms in force, both optional.
2. WHEN both are given, THE search SHALL weigh the catch by the answer-time model of design.md "The response model". WHEN either is missing, THE search SHALL weigh it by its grade, as today.
3. THE room runner SHALL pass the Net_Answer_Ms of each counted catch and the visit's Quick_Baseline_Ms, or none while fewer than `baselineCatchesMinCount` Loud_Catches are in.
4. The grades of the rhythm score SHALL NOT change.

## R3 The estimate and its range

1. THE search SHALL report a found ear's Clear_Threshold as the median of the Report_Posterior, to 0.1 dB, held at or above the loudest miss below the quietest catch and at most `estimateAboveClearMaxDb` above the quietest clear catch.
2. THE found ending SHALL also give `lowDb` and `highDb`: the 10th and 90th percentiles of the Report_Posterior, to 0.1 dB.
3. THE visit log and the summary SHALL keep the range of every found ear as optional fields. A saved visit without them SHALL read and draw as before.
4. THE result page SHALL show a found ear's range in small text beside its level, as a whole-decibel span ("30–35"), only when the range is there.

## R4 Steering without reporting

1. WHILE choosing a probe, THE search MAY multiply the Report_Posterior by a Steering_Prior given to it by the room runner.
2. THE Steering_Prior SHALL be a wide normal on the Clear_Threshold, centred on the median of the estimates the room runner has at that moment: the other ear at the same pitch if it is found, and the found ears of the neighbouring pitches. Its width is `steeringSpreadDb`. With none of these found, the quietest catches of the same searches still running, each one upward step lower, stand in (added 2026-11-25, "Neighbour start"). With none of either, there is no Steering_Prior.
3. THE reported estimate and range SHALL NOT depend on the Steering_Prior. THE ending MAY: a first miss within one upward step of the quietest catch ends the ear when the Steering_Prior's centre lies within `steeringAgreesWithinDb` of the middle of that gap (changed 2026-11-25 at the owner's request, "one missed sound" below).
4. No visitor-facing text SHALL compare one pitch with another.
5. Until the ear has missed below its catches, a descent SHALL go straight to `steeringLeadDb` above the Steering_Prior's centre when that is lower than the probe it would choose, and MAY go further than the largest drop to get there (added 2026-11-25; straight since "Neighbour start").
6. An ear that has not played yet SHALL start at `steeringStartLeadDb` above the Steering_Prior's centre when that is below the starting level, drawing nothing (added 2026-11-25, "Neighbour start").
7. In a room run of several pitches, the pitch at `leadFrequencyHz` SHALL play alone, drawing no turn, until one of its ears ends, so the others have a level to start near (added 2026-11-25, "Neighbour start").

## R5 No more trials, no dwelling at the edge

1. Over the simulated listeners of design.md "Checks", without steering, the mean number of counted sound trials per ear SHALL be at most the mean of the reference search plus 2.1 (was 0.3, then 2; changed 2026-11-25, see 2 and the nearby-miss rule in design.md "Measured").
2. A miss below every catch SHALL NOT end the ear on its own unless the Steering_Prior agrees with it (R4.3). The search plays the gap between that miss and the quietest catch, or the missed level again once the gap is one upward step or less, and ends with a level after `confirmingMissesCount` such misses within one upward step of the quietest catch (changed 2026-11-25: ending at the first miss let one lapse set the result, measured below in design.md).
3. No descent step SHALL be smaller than `minDropDb`.

## R6 Accuracy

1. FOR listeners whose Clear_Threshold is drawn uniformly, in tenths of a decibel, from inside the playable range, and who answer by the response model, THE median absolute error of the found estimates SHALL be at most that of the current search. (A ceiling of 2.5 dB was first written here and removed on 2026-11-25: with about five trials an ear neither search reaches it; see design.md "Measured".)
2. FOR the same listeners, fewer than 30% of the found estimates SHALL be within 0.25 dB of a multiple of 5.
3. FOR the same listeners, the true Clear_Threshold SHALL lie within `lowDb` to `highDb` in at least 70% of found ears.

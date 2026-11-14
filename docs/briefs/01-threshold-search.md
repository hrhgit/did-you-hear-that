# Brief 01: threshold search

## Goal

The engine that finds, for one room, the quietest level each ear caught. It is the measurement at the centre of the product and the part most worth specifying carefully.

Read `.kiro/steering/hearing-method.md` first. It holds the method and the initial numbers.

## Behaviour to specify

- The engine is pure. It takes a seeded random generator and the room settings, is told the outcome of each trial it asked for, and answers with the next trial or the final results. It never reads the clock and never touches audio.
- It runs two searches at once, one per ear, and mixes their trials in random order together with no-sound trials.
- After a catch the next level for that ear is one downward step lower. After a miss it is one upward step higher. A response on the wrong side is a miss for the tested ear and is counted separately.
- The threshold is the quietest level caught on at least 2 of 3 presentations reached while rising.
- The level never goes above the cap or below the floor.
- Each ear ends in exactly one of four states: found, better than floor, worse than cap, unreliable.
- No-sound trials make up a share within the configured range, and their positions cannot be predicted from earlier trials.
- The false alarm rate is reported. Above the configured limit, both ears' results for the room are marked unreliable.
- A room always ends within the trial limit for every possible sequence of outcomes.

## Simulated listeners

Property tests need listeners that are not perfect. A simulated listener has:

- a true threshold for each ear
- a psychometric slope, so that near the threshold catching is a matter of probability
- a false alarm rate
- a lapse rate, the chance of missing a clearly audible sound
- a wrong-side rate

Also include the extreme listeners: always answers, never answers, answers at random, always answers on the wrong side.

## Properties

1. Accurate or flagged: for a listener whose true threshold is inside the playable range, the estimate is within 5 dB or the result is unreliable.
2. Always ends within the trial limit.
3. Levels requested never leave the range between floor and cap, and never rise by more than one upward step between consecutive trials for an ear.
4. No-sound trials: share within range, positions not predictable.
5. Same seed and same outcomes give the same trials.

Property 1 is expected to fail at first. Keep each counterexample as a named regression test and fix it in its own commit.

## The comparison experiment

Before starting this spec, on a branch named `experiment/no-spec`, ask Kiro in plain chat with no spec to "write a hearing threshold staircase for left and right ears with catch trials". Keep whatever it produces. After this spec is finished, run the same simulated listeners and the same properties against both versions and record the numbers in `docs/experiments/spec-vs-no-spec.md`: how many properties each version passes and the share of listeners inside 5 dB.

## Out of scope

- Playing sound, drawing, timing of real trials.
- The swapped repeat. It has its own spec.

## Done when

All properties pass, the regression tests are in place, the scatter plot data (true threshold against estimate for a few thousand listeners) is written by a script, and the comparison document exists.

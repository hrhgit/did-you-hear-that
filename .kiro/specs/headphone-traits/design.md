# Design: headphone traits

## Overview

Everything here is read from data the visit already has: when each sound started, when it was answered, at what level, on which side, and what the search found. Nothing is played for the estimates alone, except the easy turns, which are there for the visitor and give the delay estimate its best data as a side effect.

```
 src/config/headphone-traits-config.ts   every number below
 src/session/output-delay.ts             pure: the delay from heard and seen catches; the live tracker
 src/session/easy-turn-pacer.ts          pure: whether the next turn is an easy one
 src/session/quiet-cut.ts                pure: a level every pitch stopped at
 src/session/left-right-balance.ts       pure: one side quieter at every pitch
 src/session/headphone-traits.ts         pure: the three traits from a visit log
 src/session/room-runner.ts              the offset on the window, the grade and the cue; easy turns on the beat
 src/session/rhythm-score.ts             judgementOf takes the offset off the answer time
 src/session/create-visit-flow.ts        one tracker for the visit; feeds it the catches
 src/copy/headphone-traits-copy.ts       the three rows
 src/ui/result/                          the rows under the picture
```

## The delay

### What an answer time is made of

The answer time the log keeps is measured from when the browser says the sound left the page. For a sound the visitor can plainly hear it is

  answer time = Extra_Delay + the visitor's own time to hear, choose a side and press.

The visitor's own time varies between people by more than the delay of a Bluetooth pair, so the answer times alone cannot tell a slow visitor from slow headphones. The roll call gives the second measurement that separates them. While a practice sound plays, the screen already shows its creature on its side, from the moment the runner presents it, about 130 ms before the sound starts (`scheduleLeadMs` + `presentAheadMs`). Visitors answer those from what they see. Measured from the presentation, a seen answer is

  seen time = the screen's own delay + the visitor's own time to see, choose a side and press.

To see is a little slower than to hear, and a screen shows a change a little after the page makes it. Both are a few tens of milliseconds and they come from the same person, so

  Extra_Delay ≈ heard time − seen time + `seenToHeardMs`

where `seenToHeardMs` (70 ms: a screen delay of about 30 ms and seeing about 40 ms slower than hearing) is a starting value for listening tests to settle.

### The estimate

- The heard set is every Loud_Catch: a counted catch played at or above `loudLevelMinDb` (−20 dB, ten below the starting level), and every caught easy turn. Near the edge of hearing answers grow slow, so only plainly audible sounds count.
- The seen set is every caught practice sound but the visit's first, which is the visitor learning the keys.
- Each set is summed up by its lower quartile, `quickFraction` = 0.25, which keeps the quick answers that show the visitor's pace and ignores the distracted ones.
- With at least `seenCatchesMinCount` (3) seen catches: delay = q(heard) − q(seen) + `seenToHeardMs`.
- With fewer: delay = q(heard) − `quickHeardAnswerMs` (300 ms), a starting value for how quickly a visitor answers a plain sound on a known beat. This is coarser and only used when the roll call gave too little.
- The result is clipped to 0 and up.

### During the room (R1)

One tracker serves the visit. It is told every seen catch and every heard catch as it is scored, and after each it computes the estimate above from everything so far. With fewer than `liveHeardMinCount` (3) heard catches it stays where it is. It moves towards the new estimate by at most `offsetSlewMs` (40 ms) at a time, and stays within 0 and `offsetMaxMs` (300 ms), so a single odd answer never throws it.

The Timing_Offset in force when a turn is presented goes with that turn:

- its response window is longer by the offset, so a late sound is not cut off by a window that started too early;
- its grade is that of the answer time minus the offset, in `judgementOf`, which the search and the rhythm score both use, so a Bluetooth pair no longer turns every Perfect into a Great and the search into a slower one;
- its cue lands the offset after its off-beat, so the creature reaches the doorway when the visitor hears it. On slow headphones the screen catches up with the ear, which is the "turn it faster until the visitor keeps up" the owner asked for;
- the log keeps it with the trial (`timingOffsetMs`, absent when 0), so a replay and the result grade every answer as the room did.

A visitor who is simply slow does not move the offset much: their seen answers are slow too, and the difference stays small.

### In the result (R3)

The result runs the same estimate over the whole visit, without the slew, when there are at least `delayLoudCatchesMinCount` (6) heard catches. It is rounded to 10 ms and put in a band: quick under `quickBelowMs` (60 ms), noticeable under `longFromMs` (150 ms), long from there. A long delay is what Bluetooth headphones usually have; the row does not name a connection, which the page cannot know.

## Easy turns (R2)

The adaptive search is built to end each ear at its first miss after a descent, so near the end of the counting most turns are sounds close to the edge, and with five creatures taking turns the visitor can meet a run of sounds they cannot hear. The easy turn breaks such a run.

- The pacer watches the counted sound turns of the room run. When two of the last three were not caught, the next turn is an easy turn, unless one came within the last `easyTurnSpacingCount` (3) turns or easy turns already make `easyTurnShareMax` (0.25) of the turns so far.
- It plays before the trial that waits, like the reminder of the game layer, and is logged as a reminder sound, so it counts for nothing and no search hears of it. It is put on the next off-beat and cued like every turn, so its cue says nothing that the cue of a counted turn does not.
- Its creature is drawn among the other creatures of the run, so it does not warn that the waiting creature comes next. Its ear and its creature come from a source seeded from the turn seed, so the turn draw of one-room D5 is untouched.
- It plays `easyAboveCaughtDb` (15 dB) above where that creature was last caught on that ear, or at the starting level, within that room's cap and floor.
- A catch counts in the combo and the points like any catch.

The reminder after a long quiet stays as it was without the beat. On the beat it never fired; the easy turn takes its place there.

## The quiet cut (R4)

Every sound of the visit is rendered at the same RMS (ghost-sounds D7), so a level on the visit's scale is the same signal size for every pitch. The ear's edge differs from pitch to pitch, since the ear and the headphones are more sensitive at some pitches than at others. A cut in the headphones or the system does not: it silences everything below one signal size. So a cut shows as edges at several pitches piling up at one level, each one sharp.

For each ear of each room whose search found a level:

- its edge is half way between its quietest counted catch and the loudest counted miss below that catch;
- it is sharp when that quietest catch was graded Perfect or Great, after the offset: still plainly heard one step above silence. At the ear's own edge the last catch is usually late.

A cut is reported when a window `cutWindowDb` (6 dB) wide holds at least `cutEdgesMinCount` (4) edges from at least `cutPitchesMinCount` (3) pitches, at least `cutSharpShareMin` (0.75) of them sharp, the window lies above the room's search floor, and no counted sound of the visit was caught below the window. The last check matters most: if anything was heard below the level, the headphones played it. The cut is the median of those edges.

The thresholds stay as found. The row says that the pitches whose edge lies at the cut may have stopped there because of the headphones.

## The balance (R5)

Left and right at one pitch is a comparison the product already makes. Here every pitch where both ears found a level gives d = left level − right level (positive: the left needed a louder sound). One visit cannot say whether a difference at one pitch is the ear or the earpiece; the swapped repeat settles that. But the two ears rarely differ by the same amount at every pitch, while a balance setting or a weaker earpiece shifts every pitch alike. So:

- with at least `balancePitchesMinCount` (3) pitches, b = median of d, spread = median of |d − b|;
- the offset is plain when |b| ≥ `balanceOffsetMinDb` (4 dB), spread ≤ `balanceSpreadMaxDb` (4 dB), and every pitch but at most one has d on the same side as b;
- even when |b| < `balanceEvenBelowDb` (2.5 dB) with the same spread limit;
- otherwise nothing is said.

## Decisions

- **D1** One tracker for the visit, not one per room run: the headphones do not change between rooms, and a device change abandons the room anyway.
- **D2** The offset is kept in the log only when it is above 0, so every log written before this spec, and every test that writes one, reads as an offset of 0.
- **D3** Easy turns are reminder sounds in the log. The log keeps the shape it had, and everything that already skips reminders (the search, the summary, the picture, the missed-sound replay) skips easy turns too.
- **D4** The estimates are computed from the log when the result is shown, not saved separately, so a saved visit shows them too.

## Open questions for listening tests

- `seenToHeardMs`, `quickHeardAnswerMs`: the two starting values of the delay. Wired headphones should come out under 60 ms; if not, `seenToHeardMs` is too large.
- Whether the beat keeps a Bluetooth pair's cut open. If it does, the quiet cut will rarely be found on the beat.
- Whether the practice creature appears on screen when the runner presents it, or a frame later; a frame adds to the screen's delay.

# Brief 07: missed-sound replay

## Goal

The moment before the visitor leaves. The house plays back every sound they did not catch, louder, from where it came, in the order it happened. This is the emotional peak of the visit: the visitor learns how much went by unheard.

## Behaviour to specify

- The replay is built from the visit log. It contains every trial scored as missed, in original order, on the original ear, with the original sound.
- Each sound is played 20 dB above the level at which it was missed, clamped to the cap. If the clamp changes a level, the ripple label says so.
- Each replayed sound draws a ripple on its side, labelled with pitch and the original level.
- Gaps between sounds are shortened to a fixed short interval so the replay stays brief. If there are more missed sounds than the configured maximum, the replay plays an evenly spread selection and says how many there were in all.
- Before it starts, the house says what is about to happen, so that the louder sounds are expected. Each sound still fades in over at least 20 ms.
- A running count is shown in words, for example "On your right I made seven sounds. You caught three."
- If nothing was missed, the stage is skipped with one line saying so.
- The visitor can skip the replay.

## Properties

- For any visit log, the replay contains exactly the missed trials (or the stated selection), in order, on the right ears, and no replayed level exceeds the cap.
- The counts in the text equal the counts in the visit log.

## Out of scope

- The no-headphone replay mode, which replays a whole recorded visit silently.

## Done when

Both properties pass and the replay runs at the end of a simulated visit and of a real one.

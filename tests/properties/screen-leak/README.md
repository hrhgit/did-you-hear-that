# tests/properties/screen-leak

The property that the picture gives nothing away: before a visitor answers, nothing on the page depends on whether a sound is coming, on which side it is, or on when it comes.

The page draws from two things only. `screenOfSnapshot` turns a snapshot of the visit flow into a screen, and `reactionOfEvent` turns an event of the flow into the ripple or the line the house says. Both are plain functions in `src/ui/visit`, so the tests here run them without a browser.

- `screen-record.ts` keeps a record of a visit: every time the screen derived from a snapshot changed, every reaction, and every trial with the time it was presented and the time it was decided. The times of the trials come from the flow's test hook, which the page never gets.
- `record-visit.ts` plays whole quick visits with a simulated visitor on the visit flow's harness and records them. The visitors are drawn from a seed: thresholds anywhere a room can reach, answers that sometimes come too late, and visitors who answer silence often. Disturbed visits are also paused, hidden, interrupted and moved to another device.
- `guess-from-screen.ts` is a predictor. It gets only small counts of what the screen did before an answer, learns from one set of visits and is judged on another. `balanceLabels` gives it the same number of trials with and without a sound, so that a screen that merely confirmed a sound now and then would still show.
- `screen-leak.property.test.ts` holds the properties.

## What is checked

1. In a visit that is left alone, the page changes at decisions and at nothing else: no change falls between one decision and the next (50 visits with fresh seeds on every run).
2. In a disturbed visit, no change falls in a trial's window, from its presentation to its decision (50 visits).
3. Over 120 visits, half of them disturbed, the predictor is trained on what the page did before each answer: the changes during the window, the changes during the wait before it, and the lamp nudges and door shadows in the first 1500 ms after the decision before. Judged on 120 other visits, it must not beat always guessing the most common answer by more than 3.3 standard deviations, for "was there a sound" and for "which side". The seeds are fixed, so the verdict changes only when the code does.
4. The same predictor must catch a page that changes at the moment of presentation for one sound in ten, and one that does so for one left sound in ten. Without these two the third check could be blind and nobody would know.

## What is not checked here

- The lamp and the door shadow are built in the test from the ambient schedule with a random source of their own, as the page's entry does. That the entry really gives the motion layer a source separate from the visit's is read from `src/ui/visit/start-visit.ts`, not tested.
- The predictor looks at counts, not at pixels. A leak through something `screenOfSnapshot` and `reactionOfEvent` do not produce, such as a style that depended on the time, would not be seen.
- What the page showed after earlier answers (a ripple, or the line about no sound) is not among the predictor's features. It was measured once over 300 visits and predicted neither whether the next trial has a sound nor its side.

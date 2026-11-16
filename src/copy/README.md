# src/copy

Every string the visitor can read. Strings that depend on results are built by functions here, so they can be tested. The wording rules in `.kiro/steering/wording.md` apply to everything in this directory, and `npm run check:copy` checks the exported strings against the banned word list in `src/config`.

May import from: `config`.

## The output stage's copy

- `calibration-copy.ts`: the calibration lines and buttons, and `roomsShortLine(count, total)`, the line shown when some rooms cannot get as loud as the house would like at the kept setting. No line advises raising the system volume.
- `headphone-check-copy.ts`: the question, the four answers and the line for each judgement.
- `output-state-copy.ts`: the stop control, the "Start sound again" button, a line for each reason sound stopped and a line for each reason a device cannot carry the house.
- `listening-page-copy.ts`: the labels of the development listening page, and functions for every number it shows. `levelLabel` always labels a level as relative to the visitor's own calibration.

`output-copy.test.ts` checks every string and the output of every function above against the banned terms, and checks that only the two lines that say not to turn the volume up mention it.

## The house interface's copy

- `front-door-copy.ts`: the line about headphones, the three ways in and the line about privacy.
- `visit-copy.ts`: the headings of the screens before the first room and of the screen shown when the house cannot play, and the lines shown when the browser did not let a sound start.
- `rules-copy.ts`: the three sentences of the rules and how to answer on a keyboard and on a touch screen.
- `room-copy.ts`: the room names, the two answers, the stop and pause controls, the line said after an answer on a trial with no sound, and functions for a pitch, a level, the visitor's place in the visit, the line for a caught sound and the line between two rooms. `relativeLevelLabel` always labels a level as relative to the visitor's own calibration.
- `leaving-copy.ts`: what the page says when a visit is paused, for each reason it can pause, when it is left, for each way it can be left, and after the last room.

`house-copy.test.ts` checks every string and the output of every function above against the banned terms.

## The result page's copy

Every string the result page shows comes from these files, so the page adds none of its own. The design, with the full wording of each string, is in `.kiro/specs/result-page/design.md`, "The copy".

- `result-page-copy.ts`: `resultPageCopy`, the fixed strings of the page: the headings, the labels of the save picture, headphone name, save, show, delete and delete all controls, the question and buttons that confirm "delete all", the lines for a visit saved, renamed, not saved and deleted, the line that a browser can clear what is saved in it, and the lines for a browser that keeps no visits, for saved visits that cannot be read and for robot mode.
- `result-lines.ts`: the sentences about a floor, a wing and the false alarms. `falseAlarmLine` says how often the visitor answered when the house made no sound, over the whole visit. `visitNoticeLine` names the visit limit the summary was judged by, so it follows whatever value the owner chooses. `wingLine` and `unreliableReasonLine` give a wing's line for each of its four states and each reason. `differenceLabel` and `differenceLine` give the left and right difference by side ("15 dB quieter on the left"), never by ear or earpiece, because only the swapped repeat can tell those apart. `swappedRepeatLine` offers the swapped repeat, and `floorDescription` puts a whole floor in words. Levels are in whole decibels, labelled relative to the visitor's own calibration.
- `saved-visit-lines.ts`: dates in English month names, read from their "YYYY-MM-DD" text without `Date` or the browser's language; visit types named by their number of rooms ("Short visit, 3 rooms"), not by minutes; the caption and file name of the saved image; the accessible name of each delete control; the line for each reason a save or a delete did not happen; and the line for saved visits that could not be read.
- `limits-statement.ts`: `limitsStatement`, the heading and the four sentences that `wording.md` requires next to the picture, written once as constants: floors cannot be compared; what can be compared; what this is not and what it has not been checked against; when to see a hearing professional. Every picture holds this object itself.
- `comparison-lines.ts`: the copy of the comparison with an earlier visit. `comparisonCopy` holds the hint under the headphone name field, that the same name on a later visit draws this one there as faint outlines, and the line for a name no saved visit has. `earlierVisitLine` names the earlier visit's date and says that each visit is relative to its own calibration; `earlierVisitUnreliableLine` says that an earlier visit unreliable as a whole has no outlines. No line says that anything got better or worse between the two visits. Every line about outlines is in this one file, so leaving out the comparison leaves no such line behind.

## The missed-sound replay's copy

Every string the replay shows comes from these files. The design, with the full wording of each string, is in `.kiro/specs/missed-sound-replay/design.md`, "The copy". They import only `src/config` and `room-copy.ts`.

- `replay-copy.ts`: `replayCopy`, the fixed strings: the heading, the labels of the start, skip, skip the rest, go on, resume and stop controls, the one line for a visit with nothing to play again, and the line for each reason the sounds paused.
- `replay-lines.ts`: `countWords` writes a whole number in English words up to 999 and in digits from 1000. `announcementLines` says what is about to happen before any sound plays: where the sounds come from, in what order, that each is louder by the raise ("20 dB louder than when it went by") and never louder than the house may play, to leave the volume as it is, and that the sounds can be stopped. `selectionLine` says how many sounds were missed and how many will be played, in words. `positionLabel` gives "Sound 3 of 20" in digits. `rippleLabel` names the side, the pitch and the level the sound was missed at, and says whether it is now louder or as loud as the house may play. `sideCountLine` gives the counts of one side in words ("On your right I made seven sounds. You caught three."), with how often the visitor named the other side when they did. `endLine` says how the replay ended.

Every level is written by `relativeLevelLabel`, so always relative to the visitor's own calibration. The only other number of decibels is the raise, written as a difference. Every function throws a `RangeError` for a value that does not fit. `replay-copy.test.ts` checks every constant, the outputs of the design's table, the representative inputs against the banned terms with every number of decibels labelled, and the `RangeError` cases.

### The limits statement's exemption

The limits statement is the one place where two of the banned terms may appear, and only in the negative (`wording.md`, "One exception"). The two terms are listed in `limitsStatementAllowedTerms` in `src/config/banned-terms.ts`, beside the banned terms, so the check and the copy share one source. `npm run check:copy` is given one exemption: the file `limits-statement.ts`, the export `limitsStatement`, and those two terms. Every other banned term is still reported there, and the two terms are still reported in any other export, of this file or another. `limits-statement.test.ts` checks the four sentences word for word, and that each of the two terms comes after the word "not" in its sentence.

### The visitor's headphone name

The name the visitor types for the headphones never enters a sentence of the house. No copy function takes it or gives it back. The page shows it as written, in an element of its own after `resultPageCopy.headphonesLabel`, or shows `unnamedHeadphonesLabel` for a visit saved without one. So a name made of banned words cannot put one into the house's voice, and every sentence the house says can be checked without the visitor's text.

`result-copy.test.ts` checks every exported string and the output of every function above, for representative inputs, against the banned terms, checks the outputs of the design's tables, that every level is labelled relative to the calibration, and that values that do not fit throw a `RangeError`. The property CP1 checks the same over every picture, list and outcome the result page can give (`tests/properties/README.md`).

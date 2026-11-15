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

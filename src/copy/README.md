# src/copy

Every string the visitor can read. Strings that depend on results are built by functions here, so they can be tested. The wording rules in `.kiro/steering/wording.md` apply to everything in this directory, and `npm run check:copy` checks the exported strings against the banned word list in `src/config`.

May import from: `config`.

## The output stage's copy

- `calibration-copy.ts`: the calibration lines and buttons, and `roomsShortLine(count, total)`, the line shown when some rooms cannot get as loud as the house would like at the kept setting. No line advises raising the system volume.
- `headphone-check-copy.ts`: the question, the four answers and the line for each judgement.
- `output-state-copy.ts`: the stop control, the "Start sound again" button, a line for each reason sound stopped and a line for each reason a device cannot carry the house.
- `listening-page-copy.ts`: the labels of the development listening page, and functions for every number it shows. `levelLabel` always labels a level as relative to the visitor's own calibration.

`output-copy.test.ts` checks every string and the output of every function above against the banned terms, and checks that only the two lines that say not to turn the volume up mention it.

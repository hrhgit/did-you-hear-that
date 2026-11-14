# src/session

The visit as a state machine: entry, calibration, rooms, last door, replay, result and swapped repeat. It is the only part that knows the order of things. It reads time only through an injected timer and gets randomness from a seeded generator, so a whole visit can run instantly in a unit test.

May import from: `engine`, `audio/output`, `storage`, `copy`, `config`.

## Calibration and the listening page

- `calibration-controller.ts` plays calibration repeats one after another while the calibration screen is open, with the gap from `src/config` between the end of one and the start of the next. Its snapshot gives the setting last played, which the visible control shows, and the line to show. Any stop ends the loop, and the next calibration starts again at the bottom of the control.
- `listening-page-session.ts` holds the state and actions of the development listening page. It builds the Web Audio backend from the window it is given, the output shell and the calibration controller, and gives the page a snapshot: the output state, the calibration, the headphone check, one row per sound with its level and its last outcome, the range report and the clamp log. Its tests give it a fake backend in place of the window.

## Helpers for the visit flow

- `room-search-cap.ts`: `roomSearchCapDb` rounds a room's highest playable level down to the threshold search's level grid, to give the search as its cap.
- `judge-headphone-check.ts`: `judgeHeadphoneCheck` turns the answer to the headphone check into `correct`, `swapped`, `bothSides` or `notHeard`.
- `ear-types-match.test.ts` checks that the output stage's `Ear` and the engine's `Ear` are the same type.

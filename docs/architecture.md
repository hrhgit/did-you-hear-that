# Architecture

This document fixes the shape of the project before any application code exists. The steering files in `.kiro/steering/` state the rules. This file explains how the parts fit together and why.

## One picture

```
          visitor input                         screen
               │                                   ▲
               ▼                                   │
        ┌─────────────┐   state snapshots   ┌─────────────┐
        │   session   │ ──────────────────▶ │     ui      │
        │ (the visit) │ ◀────────────────── │  (drawing)  │
        └─────────────┘   visitor answers   └─────────────┘
          │    │    │
          │    │    └──────────────▶ storage (local results)
          │    ▼
          │  engine  (threshold search, pure logic)
          ▼
        audio/output (the only Web Audio code)
          ▲
          │ sample buffers
        audio/synth (pure functions)
```

`config` and `copy` sit underneath everything and are imported by most modules.

## The parts

### engine

A pure state machine for the threshold search in one room. It knows nothing about sound, pixels or time.

- Input: a seeded random generator, the room's settings from `config`, and a stream of outcomes for trials it asked for (caught on the correct side, answered on the wrong side, missed, or answered when no sound was played).
- Output: the next trial to run (which ear or no sound, at what level, after what gap) or a final result for each ear.
- A final result is one of four states: found, better than floor, worse than cap, unreliable. Only the first carries a threshold.

Keeping it pure is what makes the property tests possible. A simulated listener is a function from "a sound at this level on this side" to an outcome, and thousands of them can play a room in milliseconds.

### audio/synth

Pure functions from parameters to sample buffers. One function per ghost sound, plus the calibration noise and the digits and noise for the last door.

- Every function takes the sample rate and a seeded random generator and returns mono samples at a fixed reference loudness.
- Because they are pure, the same functions run in Node. A tool renders every sound offline and reports its spectrum, and a hook runs that tool whenever a synthesis file changes.

### audio/output

The single door to the speakers. It owns the `AudioContext`.

- Takes a sample buffer, an ear, and a level in decibels relative to the anchor.
- Applies the calibration gain, the level cap and the fade in and out, and routes the sound to one channel with exact silence on the other.
- Offers a "stop everything now" call that the session uses when the visitor presses stop, hides the tab or leaves.
- Reports back the exact start time of each sound so the session can score answers against it.

### session

The visit as a state machine: entry, headphone check, calibration, rules, rooms, last door, missed-sound replay, result, swapped repeat. It is the only part that knows the order of things.

- Asks the engine for the next trial, asks the output to play it, waits for an answer or for the response window to close, and tells the engine the outcome.
- Records every trial in a visit log: time, room, ear, level, outcome. The replay, the result page, the stored result and the no-headphone replay mode are all drawn from this log.
- Reads the clock only through an injected timer, so tests can run a whole visit instantly.

### ui

Draws snapshots of the session state and forwards the visitor's input. It holds no state of its own beyond animation.

- The house cross-section stays on screen for the whole visit. The current room is lit.
- Ambient motion in a room (dust, a swinging lamp, a gap under a door) runs on its own random schedule, seeded separately from the trial schedule. It is not given the trial schedule at all, so it cannot leak it.
- A ripple is drawn only after an answer has been scored, at the place the sound came from, labelled with pitch and level.
- Input is the left and right arrow keys on a keyboard and the left and right halves of the screen on touch.

### storage

Saves the visit log and the result under a versioned key in local storage and reads past results back for the "this visit against last visit" view. Nothing leaves the browser.

### copy

Every string, and the functions that build result sentences from result data. This is where the wording rules are enforced and tested.

### robot

Loaded only when the page is opened with a robot flag in the address. It exposes when a sound was played and on which side, so an automated listener with a chosen threshold can play the house through the browser. It is how Kiro, through a browser automation MCP server, walks the deployed site end to end. Production visits never load it, and the "nothing on screen reveals the sound" property is tested with it switched off.

## The level scale

Levels are decibels relative to the calibration anchor. Calibration gives one number, the calibration gain: the linear gain at which the calibration noise matched the visitor's hand rubbing. A sound at level `x` dB is the reference-loudness buffer multiplied by the calibration gain and by `10^(x/20)`.

The cap is the lower of two limits: a level relative to the anchor, and an absolute digital ceiling that leaves headroom below full scale. If the visitor calibrates very loud, the absolute ceiling is what protects them.

## Things decided here, with reasons

| Decision | Reason |
|---|---|
| No UI framework | Five or six screens, mostly custom drawing. A framework would add dependencies and little else |
| Synthesis as pure functions rather than Web Audio node graphs | Lets the same code be rendered and measured in Node, which is what the spectrum hook needs |
| The engine never sees time or audio | Makes property tests fast and makes "it always ends" provable by test |
| One visit log as the source for replay, result, storage and replay mode | Four features read the same record, so they cannot disagree |
| Ambient motion gets a separate seed and no access to the trial schedule | The simplest way to make "the picture does not leak the sound" true by construction, then confirmed by a property test |
| Robot hooks live in a module that production never loads | Keeps a test backdoor from becoming a way to cheat or a leak |
| English only | Submission materials must be in English |

## Test strategy

| Layer | Kind of test | What it shows |
|---|---|---|
| engine | Property tests with simulated listeners | Estimates are within 5 dB of the truth or marked unreliable; every search ends; no-sound trials cannot be predicted |
| audio/synth | Offline render and spectrum check | Each ghost sound stays inside its band; fades are long enough; reference loudness is as specified |
| audio/output | Property tests on rendered output | Never above the cap; the untested channel is exact zero |
| session | Simulated whole visits with a fake timer | The visit log is complete and the flow reaches the result for any sequence of answers |
| copy | Property test over all result combinations | No banned word ever appears; the limits statement is always present |
| swapped repeat | Property test over ear and headphone imbalances | The attribution is right for every combination |
| ui | Property test on the event stream before each answer | Screen events are independent of sound timing and side |
| whole site | Playwright with the robot listener | A visit works end to end in a real browser on desktop and phone sizes |

## Open questions that code cannot settle

These need a person with headphones.

1. Do Bluetooth headphones play the quietest levels, or gate them? Decides the floor.
2. Do the narrow-band ghost sounds give stable thresholds from one visit to the next?
3. Is the hand-rubbing anchor repeatable enough for "this visit against last visit" to mean anything?
4. Is the house frightening without being unpleasant?

# Brief 03: audio output

## Goal

The single place where sound leaves the product, and the place where the safety rules in `.kiro/steering/audio-safety.md` are enforced.

## Behaviour to specify

- Creates or resumes the `AudioContext` only inside a user gesture.
- Plays a mono buffer to one ear at a level in decibels relative to the anchor. The other channel carries exact digital zero for the whole trial.
- Applies the calibration gain. Before calibration, only the calibration noise may be played.
- Clamps any requested level to the cap. The cap is the lower of the level relative to the anchor and the absolute digital ceiling, both from `src/config`. A clamp is reported to the caller.
- Returns the exact start time of each sound on the audio clock.
- Stops all sound at once on request, when the tab is hidden and when the page is left.
- Calibration: plays the calibration noise in both ears while the visitor moves a control, starting quiet, and stores the chosen gain. The control cannot go above the absolute ceiling.
- Headphone check: plays a sound in the left ear only and asks which side it was on. A wrong answer tells the visitor to turn the headphones around.

## Design note

The level arithmetic (calibration gain, level, cap, fades, channel routing) should be a pure function from a request to the two channel buffers that will be played. Web Audio then only plays those buffers. That keeps the safety properties testable without a browser.

## Properties

1. For any buffer, any requested level and any calibration gain, no output sample exceeds the absolute ceiling, and the level never exceeds the cap relative to the anchor.
2. For any single-ear request, every sample of the other channel is exactly zero.
3. Every rendered sound starts and ends at zero with fades of at least 20 ms.

## Out of scope

- Deciding what to play and when. That is the visit flow.
- The look of the calibration screen.

## Done when

The three properties pass under Node, and a manual check in two browsers confirms that left plays left, right plays right, and the stop control silences everything.

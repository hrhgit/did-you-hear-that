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
- A listening page for development, kept out of the visitor's path and plainly labelled as a development page: calibration first, then a list of the six sounds with a play button for each ear and a level control that cannot pass the cap, and a stop button. Everything on it goes through the output stage. It is how a person first hears the ghost sounds, so it must be safe to open with the system volume at any setting: it starts silent, and the first sound it can play is the calibration noise at its quietest.
- The absolute digital ceiling is in the Initial values table of `.kiro/steering/audio-safety.md`. This spec adds it to `src/config`.

## Design note

The level arithmetic (calibration gain, level, cap, fades, channel routing) should be a pure function from a request to the two channel buffers that will be played. Web Audio then only plays those buffers. That keeps the safety properties testable without a browser.

## Findings from the ghost-sounds spec to handle here

- **Peaks sit far above the average level.** The ghost sounds share one average (RMS) level, and the search's levels are average levels. The digital ceiling limits single samples. Measured crest factors run from about 4 dB (attic) to about 17 dB (stairs). So the highest level a sound can be played at without touching the ceiling differs by sound, and depends on the calibration gain. Specify what happens when a requested level would push a sample past the ceiling. The sound must never be clipped, because clipping spreads energy outside the room's band. The level actually played must be the level reported back, so the search never records a level that was not played. Say how the caller learns, before a room starts, what the highest playable level is for that room's sound with the current calibration, so the search can use it as its cap.
- **Calibration decides how much range is left.** A high calibration gain leaves little room under the ceiling. A low one pushes the quietest levels towards what the device cannot play. Specify what the calibration control allows, what it tells the visitor when the chosen setting leaves too little range upward, and what the output stage reports about the range that is left. Do not raise the ceiling to make room.
- **Sample rate.** The ghost-sounds spec supports sample rates from 22050 Hz up, because a lower rate cannot carry the attic room. Specify what the output stage does when the `AudioContext` runs below that, as some Bluetooth headsets in call mode do.

## Properties

1. For any buffer, any requested level and any calibration gain, no output sample exceeds the absolute ceiling, and the level never exceeds the cap relative to the anchor.
2. For any single-ear request, every sample of the other channel is exactly zero.
3. Every rendered sound starts and ends at zero with fades of at least 20 ms.

## Out of scope

- Deciding what to play and when. That is the visit flow.
- The look of the calibration screen.

## Done when

The three properties pass under Node, and a manual check in two browsers confirms that left plays left, right plays right, and the stop control silences everything.

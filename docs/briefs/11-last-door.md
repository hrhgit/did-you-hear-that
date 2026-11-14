# Brief 11: last door

## Status

Optional. This is the first feature to cut if time runs short. Do not start it before specs 0 to 9 are done.

## Goal

A final door in the full visit. A voice behind it says a three-digit code through noise, and the visitor types what they heard. It borrows the idea of digits-in-noise listening checks, as a game element only.

## Behaviour to specify

- Digits are synthesised in code. No recorded speech and no speech service. If intelligible synthetic digits cannot be made this way, the feature is dropped.
- The noise is steady and shaped to the long-term spectrum of the digits.
- Both ears hear the same signal.
- The level of the digits relative to the noise changes from one try to the next: harder after a correct code, easier after a wrong one. Overall level stays fixed and well under the cap.
- A fixed, small number of tries, then the door opens whatever happened.
- The result page reports this only as how many codes were heard correctly. It gives no decibel figure and draws no conclusion. The line states that this part is a game and has no reference data behind it.

## Properties

- Overall level never exceeds the cap for any sequence of answers.
- The stage always ends within the fixed number of tries.
- No text generated from this stage contains a banned word or a number presented as a measurement.

## Out of scope

- Any claim about speech understanding in noise.

## Done when

The door works in the full visit and its three properties pass, or the feature is recorded as dropped in `docs/roadmap.md` with the reason.

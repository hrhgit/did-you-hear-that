---
inclusion: fileMatch
fileMatchPattern: ["src/engine/**", "src/session/**", "src/config/**", "tests/**", ".kiro/specs/**"]
---

# Hearing method

Background for anyone changing the threshold search. It records what the method is, where each rule comes from and which numbers are design choices that still need tuning on real headphones.

## The search

The search follows the modified Hughson-Westlake procedure used in manual pure-tone audiometry.

- After a sound the visitor catches, the next sound for that ear is 10 dB quieter.
- After a sound the visitor misses, the next sound for that ear is 5 dB louder.
- The threshold for an ear at a pitch is the quietest level at which the visitor caught the sound on at least 2 of 3 presentations reached while the level was rising.

Source: American Speech-Language-Hearing Association, Guidelines for Manual Pure-Tone Threshold Audiometry (2005), https://www.asha.org/policy/gl2005-00014/, read on 2026-11-14. It defines threshold as the lowest level at which responses occur in at least one half of a series of ascending trials, with a minimum of two responses out of three presentations at a single level. It gives the same steps: 10 dB down after a response, 5 dB up after no response. The ANSI standard that the guideline cites has not been read.

The guideline describes a trained examiner working in a quiet room with calibrated equipment. This product has neither, so the method is borrowed and the guideline's accuracy does not carry over.

Left ear and right ear searches for one pitch run at the same time and their trials are mixed in random order. The visitor answers by naming the side. A response on the wrong side counts as a miss for the ear that was tested and is recorded separately.

## Level scale

All levels are in decibels relative to the calibration anchor. The anchor is the volume at which the visitor would listen to music in a quiet room: clear and comfortable, not loud. The visitor sets a piece of calibration music to it with the page's control and leaves the system volume at its usual level. Zero means "as loud as the calibration music at the setting the visitor chose", matched by RMS. Where the music cannot be loaded the calibration sound is the hiss, set in the same way. Negative numbers are quieter.

The anchor is a rough reference and nothing more. It is what this visitor finds comfortable on these headphones at this volume, so it differs between people and says nothing about how well anyone hears. Visits whose anchors were set in different ways (rubbed hands before 2026-11-16, the music, the hiss) are never compared. Never convert a level on this scale to dB SPL or dB HL in visitor-facing output.

## No-sound trials

A share of trials play nothing. A response on such a trial is a false alarm.

- The share and the spacing are random within limits set in `src/config`, so the visitor cannot learn the pattern.
- The false alarm rate is reported with the result.
- Above the limit set in `src/config`, the result for that visit is marked unreliable and the visitor is invited to repeat it.

## When a search cannot finish honestly

A search must always end within the trial limit. It ends in one of these states:

- **found**: a threshold that meets the 2 of 3 rule
- **better than floor**: the visitor still caught the quietest sound the product will play. Report "quieter than this house can whisper" and no number
- **worse than cap**: the visitor did not catch the loudest sound the product is allowed to play. Report that plainly and no number
- **unreliable**: the trial limit was reached, or responses were inconsistent, or the false alarm rate was too high

An estimate is only presented as a threshold in the first state.

## Left and right difference and the swapped repeat

When the thresholds for the two ears on one floor differ by at least the limit in `src/config` (initially 15 dB), the visitor is asked to swap the headphones and repeat that room.

- If the quieter side follows the ear, the difference is attributed to the ears.
- If the quieter side follows the earpiece, the difference is attributed to the headphones.
- Anything else is reported as unclear.

The 15 dB figure is a starting value. Its clinical source has not been checked.

## Known limits to keep in mind

- Ghost sounds are narrow bands of noise or tone clusters, not pure tones. Whether they give the same thresholds as pure tones is not established.
- Bluetooth headphones may gate or reshape very quiet sounds. The lowest playable level may have to be raised after testing on real headphones.
- Fear may affect thresholds. The research is thin and mixed. The product avoids startle and uses no-sound trials to detect guessing.
- The digits-in-noise door uses home-made speech material with no reference data. Its outcome is part of the game and is never reported as a measurement.

## Initial values

Every number below lives in `src/config` and is expected to change after listening tests.

| Quantity | Initial value |
|---|---|
| Downward step after a catch | 10 dB |
| Upward step after a miss | 5 dB |
| Starting level | 10 dB below the anchor |
| Loudest allowed level | 5 dB above the anchor. Lowered from 15 dB on 2026-11-16: the anchor is now a comfortable music volume, likely louder than rubbed hands, and the lower cap keeps the loudest sound no louder at the ear than before |
| Quietest playable level | 70 dB below the anchor |
| Response window after a sound starts | 2.0 s |
| Gap between trials | random, 1.5 to 4.0 s |
| Share of no-sound trials | 15 to 25 percent |
| False alarm rate that marks a visit unreliable, applied to each room | above 30 percent |
| False alarm rate over a whole visit that marks the visit unreliable | above 20 percent |
| Trial limit per ear per room | 20 |
| Left and right difference that triggers the swapped repeat | 15 dB |
| Rooms, full visit | 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz |
| Rooms, quick visit | 1 kHz, 4 kHz, 8 kHz |

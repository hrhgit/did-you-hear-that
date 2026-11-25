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

Left ear and right ear searches for one pitch run at the same time and their trials are mixed in random order. In the one room (`.kiro/specs/one-room/design.md`) the searches of every pitch of the visit, up to `visitFlowConfig.roomsTogetherMaxCount`, also take turns: after every scored trial a seeded draw picks evenly among the pitches whose search is still going, and that search's next trial comes. Each pitch keeps its own search, its own starting level, cap and floor, and is logged as a room of its own. With the count at 1 the pitches run one after another, as before. The visitor answers by naming the side. A response on the wrong side counts as a miss for the ear that was tested and is recorded separately.

## Practice

Each room run begins with practice, the familiarization step of the procedure the search follows. In the one room this is the roll call: every pitch of the run in turn plays its own sound to one ear at a time, the left and then the right, and the visitor names the side, as in the search. When sides were left unheard, the visitor is told once for the whole round. Practice has no no-sound trials and counts for nothing. Written in on 2026-11-16 in a lighter form than `.kiro/specs/audible-start/design.md` drew; the differences are listed at the top of that spec's `tasks.md`.

- Each ear's practice begins at the anchor, or at the room's top where that is lower. After a practice sound the visitor does not catch on its side, the next one for that ear is one upward step louder, up to the room's top.
- An ear's practice ends at its first catch, or unheard after 2 practice sounds. When an ear ended unheard, the visitor is told what to check and may hear that ear's practice again or go on.
- Going on starts the counting as usual. A side that cannot hear the room will show as louder than the room can play.
- The search does not start from the practice. Every ear's search starts at the starting level of the table below.
- Practice sounds are logged as practice. They are not part of the threshold, the catch counts, the false alarm rate, the missed-sound replay or the picture.
- The swapped repeat has no practice.

Source: the ASHA guideline (2005) cited above, read again on 2026-11-16. It says that the participant should be familiarized with the task before threshold determination by presenting a signal of sufficient intensity to evoke a clear response, and that one of its methods presents a tone at a set level and raises it until a response occurs. It also says that the first presentation of the threshold measurement shall be well below the expected threshold. The product does not follow that sentence: its search starts at a level that is usually heard and comes down, as it did before practice was added.

## Level scale

All levels are in decibels relative to the calibration anchor. The anchor is the volume at which the visitor would listen to music in a quiet room: clear and comfortable, not loud. The visitor sets a piece of calibration music to it with the page's control and leaves the system volume at its usual level. Zero means "as loud as the calibration music at the setting the visitor chose", matched by RMS. Where the music cannot be loaded the calibration sound is the hiss, set in the same way. Negative numbers are quieter.

The anchor is a rough reference and nothing more. It is what this visitor finds comfortable on these headphones at this volume, so it differs between people and says nothing about how well anyone hears. Visits whose anchors were set in different ways (rubbed hands before 2026-11-16, the music, the hiss) are never compared. Never convert a level on this scale to dB SPL or dB HL in visitor-facing output.

## No-sound trials

A share of trials play nothing. A response on such a trial is a false alarm.

- The share and the spacing are random within limits set in `src/config`, so the visitor cannot learn the pattern.
- The false alarm rate is reported with the result.
- Above the limit set in `src/config`, the result for that visit is marked unreliable and the visitor is invited to repeat it.

## The rhythm game

The rooms are played as a rhythm game (decided by the owner on 2026-11-18, replacing the lantern of 2026-11-16). It changes when a trial is presented, never how it is scored or what the search sees.

- A soft beat with a small plucked tune (`rhythmConfig`, 100 BPM, every note below 500 Hz) plays in both ears while a room runs, and stops on every pause and stop. Every trial, sound or silence, is presented on an off-beat, half way between two beats, after its usual gap. The search's trials, levels, windows and decisions are the same as without the beat.
- Each turn is cued alike on both sides before its off-beat, whether it has a sound or not, and never says its side.
- A scored turn is judged: a catch Perfect, Great or Good by its time to answer, a miss, the wrong side, a kick at a turn with no sound (trick) or a silent turn left alone (steady). Catches and steady turns build a combo; anything else breaks it, as does an answer between turns. Points and Jack's flame follow the judgements; a flame that goes out is lit again and the room goes on. Nothing of the game ever reaches a search.
- The practice and the swapped repeat keep no score.

## When a search cannot finish honestly

A search must always end within the trial limit and within the room's time limit. It ends in one of these states:

- **found**: a threshold that meets the 2 of 3 rule
- **better than floor**: the visitor still caught the quietest sound the product will play in that room with that calibration, its playable floor. Report "quieter than this house can whisper" and no number, and say that this is as quiet as the house can play through these headphones at this volume
- **worse than cap**: the visitor did not catch the loudest sound the product is allowed to play. Report that plainly and no number
- **unreliable**: the trial limit or the room's time limit was reached, or responses were inconsistent, or the false alarm rate was too high

An estimate is only presented as a threshold in the first state.

## Left and right difference and the swapped repeat

When the thresholds for the two ears on one floor differ by at least the limit in `src/config` (initially 15 dB), the visitor is asked to swap the headphones and repeat that room.

- If the quieter side follows the ear, the difference is attributed to the ears.
- If the quieter side follows the earpiece, the difference is attributed to the headphones.
- Anything else is reported as unclear.

The 15 dB figure is a starting value. Its clinical source has not been checked.

## Known limits to keep in mind

- Ghost sounds are narrow bands of noise or tone clusters, not pure tones. Whether they give the same thresholds as pure tones is not established.
- Bluetooth headphones carry about 16 bits and may gate, cut or reshape very quiet sounds. So the house does not play or count on a sound below a room's playable floor: the higher of the quietest playable level and the level at which a sound's RMS is 84 dB below full scale with the visitor's calibration, about one bit above one step of a 16-bit path. That value comes from arithmetic; a listening session with the listening page settles it. A result at that floor, or within one step of it, says that this is as quiet as the house can play through these headphones at this volume.
- Bluetooth headphones also play later than wired ones. The response window is not lengthened by the output latency the browser reports, so a slow answer on such headphones may be scored as a miss.
- In the one room the pitches take turns, so a quiet sound of one pitch may follow a louder sound of another on the same ear. Whether that changes how readily a quiet sound is caught, and so the thresholds, has not been checked against the pitches one after another.
- The chase shows a missed sound after it is scored, and costs a light for every answer. Both may change how readily a visitor answers, and so the thresholds and the false alarm rate. Neither has been checked against a plain run of the same search.
- Fear may affect thresholds. The research is thin and mixed. The product avoids startle and uses no-sound trials to detect guessing.
- The digits-in-noise door uses home-made speech material with no reference data. Its outcome is part of the game and is never reported as a measurement.

## Initial values

Every number below lives in `src/config` and is expected to change after listening tests.

| Quantity | Initial value |
|---|---|
| Downward step after a catch | 10 dB |
| Upward step after a miss | 5 dB |
| Practice: first level | the anchor |
| Practice: after a practice sound not caught | one upward step louder, up to the room's top |
| Practice sounds for one ear before the visitor is told | 2 |
| Starting level | 10 dB below the anchor |
| Loudest allowed level | 5 dB above the anchor. Lowered from 15 dB on 2026-11-16: the anchor is now a comfortable music volume, likely louder than rubbed hands, and the lower cap keeps the loudest sound no louder at the ear than before |
| Quietest playable level | 70 dB below the anchor, or higher: the level at which a sound's RMS is 84 dB below full scale with the visitor's calibration (the playable floor) |
| Response window after a sound starts | 1.8 s. Shortened from 2.0 s on 2026-11-16 by the owner after playing: a room took too long |
| Gap between trials | random, 0.8 to 1.6 s. Shortened from 1.5 to 4.0 s on 2026-11-16 and from 1.0 to 2.5 s on 2026-11-17, both times after the project owner played and found the visit too long and too quiet |
| Share of no-sound trials | 15 to 25 percent |
| False alarm rate that marks a visit unreliable, applied to each room | above 30 percent |
| False alarm rate over a whole visit that marks the visit unreliable | above 20 percent |
| Trial limit per ear per room | 20 |
| Time limit of the counting in the room | 5 minutes, from the first counted trial. Practice, rests and pauses are not counted. When it is over the room closes: the trial in flight is scored, and every search still open ends as unreliable with the trial limit's reason. Added on 2026-11-20 by the owner: a long game gets boring, so the length of the visit no longer depends on how much is left to find |
| Left and right difference that triggers the swapped repeat | 15 dB |
| Rooms | 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz (one visit only; the shorter visit of three rooms was dropped on 2026-11-20) |

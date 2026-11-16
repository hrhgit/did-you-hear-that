# Brief 08b: an audible start

## Where this comes from

On 2026-11-16 the project owner made a first visit of their own, wearing Bluetooth earbuds. Three things went wrong.

- The calibration control moves 1 dB per press over a range of 56 dB. Matching the hiss took dozens of presses.
- Matching a hiss to rubbed hands did not work: with earbuds in, and noise cancelling above all, the hands are hard to hear, and the owner did not know whether the match should be quiet or loud.
- In the first room the owner heard nothing at first and did not know whether the house was working, whether the headphones were, or what to do. Later sounds were heard, very quietly.
- Nothing in the visit takes account of Bluetooth headphones, which are what most visitors will wear.

The owner asked for a control that can be dragged and has keyboard shortcuts, for a room that cannot begin with nothing to hear, for Bluetooth headphones to be treated as a main case and not an exception without asking the visitor what they wear, and for calibration by a piece of free music set to a normal listening volume, with no hand rubbing.

The decisions below were made by the owner's coordinator on 2026-11-16, at the owner's request. The owner may reverse any of them.

## Goal

A visitor who has just calibrated always hears the first sounds of a room clearly, knows what to do with them, and is told plainly when the house plays a sound that they do not hear. This holds on Bluetooth headphones.

## Behaviour to specify

### Practice at the start of each room

- Each room begins with practice, which is the familiarization step of the procedure the search already follows (ASHA 2005). Read that part of the guideline again and cite what it says.
- Practice plays the room's own sound, one ear at a time, in mixed order, and the visitor answers by naming the side, as in the search. Practice has no no-sound trials.
- Practice begins at the anchor for each ear: the first sound of every room is as loud as the music the visitor has just set, a normal listening volume, so it is heard at once. Every room's top is at or above the anchor, so this is always allowed. After a practice sound the visitor does not catch, the next practice sound for that ear is one upward step louder, up to the room's top level.
- An ear's practice ends at its first catch. That ear's search then begins 10 dB below the level of that catch, kept within the room's playable floor and the room's top. The search goes from heard to not heard, as it does now. The fixed starting level of 25 dB below the anchor is no longer used.
- While a practice sound plays, the screen shows that a sound is playing now. It never shows which side. During the search the screen shows nothing about the trial, as now. This needs one exception in the experience rule of `.kiro/steering/product.md` that nothing on screen may reveal when a sound plays: write it, for practice only, with the reason.
- The screen says that this is practice and that nothing counts yet, and says when the counting begins.
- Practice is where each room's ghost is met. The owner's first visit did not feel like a haunted house, because no ghost was ever heard clearly. So each room's practice lines introduce that room's sound as something in the house, in the house's voice (for example, in the cellar, that something is knocking under the floor and to say which side it is on), and the line that starts the counting says that it has noticed the visitor and will be quieter from now on. The search that follows is then the ghost backing away. Write these lines in src/copy for every room, following `.kiro/steering/wording.md`, with no threat, no scream and nothing sudden.
- Practice sounds are logged as practice. They are not part of the threshold, the catch counts, the false alarm rate, the missed-sound replay or the picture.
- When an ear does not catch the practice sound at the room's top, the visitor is told so in plain words, with what to check (headphones on, the right output chosen, the system volume not muted) and a way to try the practice again or to go on. Going on records that ear on that floor in the existing state "worse than cap". A visitor is never left in a room with nothing to hear and nothing on the screen that says why.
- The swapped repeat of a room begins with practice too, since it runs the room again exactly as before.

### Calibration by music at a normal listening volume

- The hand rubbing goes. The calibration sound becomes a recorded piece of music: `public/audio/calibration-waltz.m4a`, a music box waltz under CC0, listed in `docs/licences.md`. The owner chose it on 2026-11-16. It is mono, 44.1 kHz, 106.7 s long, made to loop without a seam, with an RMS of about 19 dB and a peak of about 0.7 dB below full scale (so a crest factor of about 18 dB, against 15.5 dB for the hiss's Peak_Bound). The output stage fetches and decodes it once, measures its RMS and peak from the decoded samples, and plays it in both ears through the single output path (rule 1), looping, at a gain set from the control, with the ceiling acting on its peak as on every sound. Work out the top of the control again with its peak.
- **An exception to rule 6 and to the repeats of the calibration sound, approved by the owner on 2026-11-16.** The owner was asked in chat whether the calibration music may play without a break while calibration is open, with every other protection kept, and answered yes, for calibration only. So: the calibration music plays continuously while the calibration screen is open and the visitor has started it, and stops when the visitor keeps a setting, leaves the screen, presses stop, hides the page or the device changes. It fades in over at least the shortest fade when it starts and fades out when it stops. Its level changes smoothly, never faster than the largest calibration rise (5 dB) per 2 seconds upward, about what the repeats allow now, and may fall at any speed. It starts at the bottom of the control as now. Every ghost sound, check sound and replay sound keeps the longest-sound limit. Write the exception into `.kiro/steering/audio-safety.md` as a short sentence under rule 6, saying who approved it and when; change no other rule and no value of its table. If the music cannot be fetched or decoded, the calibration falls back to the hiss repeats as they are now, and the visitor is told nothing more than that the calibration sound is a hiss.
- The visitor is asked to set the music to the volume at which they would listen to music in a quiet room: clear and comfortable, not loud. They move the page's control and leave the system volume at their usual level.
- The anchor becomes that comfortable listening level. Rewrite "Level scale" in `.kiro/steering/hearing-method.md` and step 2 of `.kiro/steering/product.md` to say so, with no figure in dB SPL. Say in the design why this keeps what the result may claim: product.md claims only left against right on one floor and the same person with the same headphones over time, and neither needs a reference outside the headphones. Say plainly what it gives up: a visitor with poor hearing will choose a louder setting, so the numbers are relative to what that visitor finds comfortable, and they never say how good anyone's hearing is. The product already makes no such claim.
- **The cap comes down.** A comfortable music volume is likely louder than rubbed hands, so with the same cap the loudest sound would be louder at the ear than before. To keep the worst case no louder than it was, the loudest allowed level falls from 15 dB above the anchor to 5 dB above it. This is stricter, which the audio-safety steering allows; write the reason beside the value. Every other audio-safety value stays. Say what this does to "worse than cap", the replay's louder sounds and the room tops, and keep every room able to reach the anchor.
- The headphone check and the swap check keep the hiss at the anchor level. Its level against the music is set by RMS as now; say in the design whether the hiss at the anchor is then clearly audible, and if a listening test is needed to know, mark it FOR THE OWNER.
- A saved visit from before this change used a different anchor. Say how it loads, and make sure the result never compares a visit with an earlier one whose anchor was the hands.
- The visit flow gains one command that sets the target of the calibration control to any setting, `setCalibrationTarget(settingDb)`, and its calibration snapshot gains `targetSettingDb`. `louder()` and `quieter()` stay. Nothing about how the control plays changes: the sound still starts at the bottom of the control and still rises by at most the configured rise per repeat, and the played setting follows the target.
- The calibration copy is rewritten for the music: the heading, the opening line, the line at the top, and one short line on why this is asked (it tells the house how loud is safe on these headphones at this volume, and gives the result a level to be measured from). It gains a line that says the music rises to the control a little at a time, and a line that names the keys. No line mentions hands.
- The slider itself, its keys and its look are the owner's interface work and are outside the spec.

### Bluetooth headphones, without asking

The visitor is not asked what they wear. Every visitor is treated as someone who may be on Bluetooth headphones, and the house does the work itself.

- **A playable floor.** The audio-output design (its Q1 and "The digital floor") already found that the search's quietest levels lie under one step of a 16-bit output path, which is what Bluetooth carries, and that at a low calibration setting even the old starting level is close to that step. The owner's visit is the first listening session that design waited for, and it went as the design feared. So the house no longer plays, or counts on, a sound that the path cannot carry: a new config value gives the quietest RMS, relative to full scale, that counts as playable (starting value 84 dB below full scale, about one bit above a 16-bit step), and each room's floor with a calibration is the higher of the fixed floor and the level that reaches that RMS. The search, "better than floor", the result picture, the replay and the swapped repeat all use that floor. This raises the floor, which the audio-output design names a method change and not a safety one.
- **Enough room to whisper.** A calibration can only be kept when it leaves every room at least 30 dB of playable range below the anchor. Work out the Keep_Minimum this needs and raise it to that. A visitor below it is told, by the line that exists, to turn the system volume down and match again. Turning down is always safe, and this makes the value stricter, which the audio-safety steering allows.
- **Latency.** The response window is counted from when the sound reaches the ears as well as the browser can tell: where the browser reports an output latency, the window ends that much later, up to a limit. The reported latency is logged with the calibration.
- **Said only when it matters.** When an ear's result is "better than floor", or its threshold lies within one upward step of the room's playable floor, the result says in plain words that this is as quiet as the house can play through these headphones at this volume, and that wireless headphones in particular stop there. No other screen mentions wireless headphones.
- Say in the design what else Bluetooth can do to the visit (the first part of a sound cut after silence, a codec that drops very quiet sound, the volume changing by itself, the device switching to another machine) and, for each, what the product does now, what this spec adds, and what only a listening test can settle. Audio-safety rule 5 stays: no keep-alive signal is added.

## Properties

- **Never louder than allowed, never a jump.** Across practice and search together, no sound is above the room's top, and the level for one ear never rises by more than one upward step between consecutive sounds on that ear.
- **The search starts from what was heard.** For every simulated listener, each ear's first search level is 10 dB below its practice catch, within the limits.
- **Nothing below the playable floor.** With every calibration setting that can be kept, no trial is played below the room's playable floor, and no result reports a threshold below it.
- **Practice does not count.** The threshold, the catch counts and the false alarm rate of a room are the same whether or not the practice sounds are removed from the log.
- **A silent listener is told.** A listener who never answers reaches the plain message within a bounded number of sounds in every room, and can go on.
- **The music is safe.** Across every setting of the control, every path of the control over time and every stop, no output sample of the music passes the ceiling, its gain never rises faster than 5 dB per 2 seconds, it starts from the bottom of the control, and every start and stop is faded.
- **Accuracy is kept.** Every existing accuracy property of the threshold search and the visit flow passes with its tolerances unchanged.

## Out of scope

- Any loosening of an audio-safety rule or value. The bottom of the calibration control, its rise per repeat, the ceiling, the fades and exact silence stay as they are. The only safety value that changes is the cap, and it becomes stricter.
- Asking the visitor what headphones they wear, or asking for the microphone to find out.
- The exact value of the playable floor on real Bluetooth headphones. The starting value is from arithmetic; a listening test with the listening page settles it.
- The interface: `src/ui`, `tests/e2e`, `tests/properties/screen-leak`, CSS and HTML are built by the owner.

## Done when

The properties pass, the visit lengths are measured again and the names of the two visits still say what they take, and a simulated visit and a real one both begin every room with sounds the visitor catches.

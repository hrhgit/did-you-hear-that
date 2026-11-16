# Requirements: audible start

## Introduction

On 2026-11-16 the project owner made a first visit on Bluetooth earbuds. Matching a hiss to rubbed hands did not work, the calibration control needed dozens of presses, and the first room began with nothing to hear and nothing on screen that said why. This spec gives every room a practice that starts where the visitor can hear, replaces the hand rubbing with a piece of music set to a comfortable listening volume, adds a command that sets the calibration control to any setting, lowers the cap to 5 dB above the new anchor, stops the house from playing or counting on sounds below what a 16-bit output path can carry, extends the response window by the output latency the browser reports, and adds one line to the result where a floor's result reaches the quietest the house can play.

The input is `docs/briefs/08b-audible-start.md`. The brief's decisions were made by the owner's coordinator on 2026-11-16, at the owner's request. The owner may reverse any of them. One audio-safety exception in the brief was approved by the owner on 2026-11-16: the calibration music may play without a break while calibration is open. Every point the brief leaves open is settled in `design.md` as a decision (D1, D2 and so on) and listed in "Questions for the project owner" with its options and the reason; each is marked "Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it". A question that only a listening session can settle, or whose every option would loosen an audio-safety rule or value, is marked FOR THE OWNER and left open.

Also read: every file in `.kiro/steering/`; `docs/architecture.md`; the specs under `.kiro/specs/threshold-search/`, `audio-output/`, `visit-flow/`, `missed-sound-replay/`, `swapped-repeat/` and `result-page/`; and the code of `src/engine`, `src/session`, `src/audio/output`, `src/config`, `src/copy`, `tests/listeners` and `tests/properties`. The guideline the search follows was fetched again on 2026-11-16 (`design.md`, "Sources").

The screen is built by hand by the project owner, outside this spec's tasks: everything under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, every CSS and HTML file and `src/main.ts`. The owner builds against the additions this spec makes to `src/session/visit-flow-types.ts` and `src/session/result-page-types.ts`, which `design.md` gives in full. "What the owner builds" in `design.md` lists what the owner's screen has to do, what the visitor sees until it does, and which of the owner's files stop passing.

Out of scope (brief): any loosening of an audio-safety rule or value; asking the visitor what headphones they wear or using the microphone to find out; the exact value of the playable floor on real Bluetooth headphones; the slider, its keys and its look; the interface.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Visit_Flow**, **Visit_Log**, **Visit_Summary**, **Room_Summary**, **Room_Attempt**, **Snapshot**, **Visit_Event**, **Pause**, **Timer**, **Room_Runner**, **Window_Start**: as in the visit-flow spec.
- **Output_Shell**, **Backend**, **Fake_Backend**, **Range_Report**, **Room_Top**, **Calibration_Setting**, **Calibration_Repeat**, **Rise_Limit**, **Ceiling**: as in the audio-output spec. Room_Top is `roomTopLevelDb(soundId, calibrationGain)`.
- **Repeat_Stage**, **Repeat_Run**, **Repeat_Record**: as in the swapped-repeat spec.
- **Result_Picture**, **Picture_Floor**, **Saved_Visit**, **Payload**: as in the result-page spec.
- **Contract_File**: `src/session/visit-flow-types.ts`. **Result_Contract_File**: `src/session/result-page-types.ts`. This spec only adds to them.
- **Screen**: what the project owner builds by hand in `src/ui`.
- **Owner_Literal**: an object literal of a contract type written in one of the owner's files. Found in `src/ui/visit/screen-of-snapshot.test.ts` (`CalibrationSnapshot`, `RoomSummary`), `src/ui/result/picture-sheet.test.ts` (`PictureWing`, `PictureFloor`, `ResultPicture`) and `tests/properties/screen-leak/screen-record.test.ts` (a `room` Snapshot, `RoomSummary`).
- **Anchor**: 0 dB on the level scale. With this spec, the Calibration_Setting the visitor kept for the Calibration_Music, matched by RMS.
- **Anchor_Kind**: how a calibration's Anchor was set: `music`, `hiss` (the music could not be loaded) or `hands` (every calibration recorded before this spec).
- **Calibration_Music**: `public/audio/calibration-waltz.m4a`, decoded once by the Output_Shell.
- **Calibration_Hiss**: the existing calibration noise of `renderCalibrationHiss`. It stays the sound of the headphone check and the swap check, and is the calibration sound when the music cannot be loaded.
- **Calibration_Sound**: `loading`, `music` or `hiss`: what the Output_Shell will play for a calibration.
- **Music_Level_Gain**: the linear gain applied to the decoded music at Calibration_Setting S: `decibelsToGain(S) × referenceRmsFraction / musicRmsFraction`, so that the music at the Anchor has the reference RMS, as every sound at 0 dB has.
- **Music_Rise_Limit**: `calibrationRiseMaxDb` (5 dB) per `calibrationMusicRisePeriodMs` (2000 ms).
- **Control_Top**: the top of the calibration control for the Calibration_Sound in use: `calibrationSettingTopDb()` for the hiss, and the lower of that and the Music_Top for the music.
- **Music_Top**: the highest setting on the control's grid at which the decoded music's peak, at Music_Level_Gain, is at most the Ceiling.
- **Target_Setting**: the setting the control is moving to. **Played_Setting**: the setting the sound has reached.
- **Playable_RMS**: `audioOutputConfig.playableRmsMinFraction`, the quietest RMS, as a fraction of full scale, that counts as playable: 84 dB below full scale.
- **Playable_Floor**: for a room and a calibration, the higher of `hearingMethodConfig.floorDb` and the level at which the room's sound has the Playable_RMS (`roomFloorLevelDb`). Not rounded.
- **Search_Floor**: the Playable_Floor rounded up to the level grid (`roomSearchFloorDb`). The search's `floorDb` for that room.
- **Search_Cap**: the Room_Top rounded down to the level grid (`roomSearchCapDb`), as today.
- **Level_Grid**: `practiceStartLevelDb + k × upwardStepDb`. It is the grid of today, whose origin was `startingLevelDb` (−25), moved to 0, which lies on it.
- **Keep_Minimum**: `calibrationSettingKeepMinDb`, the lowest setting that can be kept.
- **Practice**: the step of every room run before its search, in which the room's sound is played to one ear at a time until each ear has caught it once.
- **Practice_Sound**: one sound of Practice. **Practice_Round**: the Practice_Sounds from the start of Practice, or from a try again, to its end.
- **Practice_Catch**: an answer naming the side of the Practice_Sound within its window.
- **Practice_Top_Misses**: `capMissesForWorseThanCapCount` (2): Practice_Sounds at the Search_Cap not caught by one ear before that ear's Practice ends unheard.
- **Not_Heard**: the moment at which every ear's Practice has ended and at least one ear ended unheard. The room holds a Pause with the reason `practiceNotHeard`.
- **Counting**: the room's search, from the moment Practice ends to the end of the room run.
- **Search_Start**: an ear's first search level: its Practice_Catch level minus `downwardStepDb`, within the Search_Floor and the Search_Cap; null for an ear that went on unheard.
- **Latency_Allowance**: the lower of the output latency the browser reported when the calibration was kept and `responseWindowLatencyMaxMs`, or 0 when none was reported.
- **Floor_Line**: the result line that says a floor's result is as quiet as the house can play through these headphones at this volume.
- **Simulated_Visitor**, **Psychometric_Listener**, **Step_Listener**, **Extreme_Listener**: as in `tests/listeners`.
- **Property_Suite**: this spec's property tests, `tests/properties/audible-start-cp<n>-*.property.test.ts`.

## Requirements

### Requirement 1: The contracts only grow

**User story:** As the project owner building the screen by hand, I want the new fields added to the contracts I already build against, with nothing renamed, and my files still compiling, so that I can draw the new moments when I am ready.

#### Acceptance criteria

1. THE Contract_File and THE Result_Contract_File SHALL gain exactly the additions of "Interface contract" in `design.md`, with the names given there, among them `setCalibrationTarget(settingDb)` on `VisitFlow` and `targetSettingDb` on `CalibrationSnapshot`.
2. THE additions SHALL remove and rename nothing. Union types SHALL only gain members. The comments that name the hiss as the calibration sound or describe `resume` and the Pause SHALL gain or change only the sentences "Interface contract" gives.
3. EVERY field this spec adds to a type that an Owner_Literal builds SHALL be optional, and THE design SHALL say for each that the Visit_Flow always fills it, so that every Owner_Literal still compiles (D29).
4. AFTER every task, `npm run typecheck` SHALL pass with every file under `src/ui/`, `tests/e2e/` and `tests/properties/screen-leak/` unchanged.
5. THE design SHALL list what the Screen has to do, what the visitor sees until the Screen does it, and which of the owner's files stop passing when the contracts grow.
6. THE type-level tests SHALL check that the copy's names for pause reasons, practice phases and Calibration_Sounds equal the session's.

### Requirement 2: Numbers live in config

**User story:** As the project owner, I want every new number in `src/config` with its unit in its name and its source beside it, so that nothing is decided out of sight.

#### Acceptance criteria

1. THE config SHALL hold the values of "Config" in `design.md`, each with a name that ends in its unit and a comment naming its source.
2. `hearingMethodConfig.startingLevelDb` SHALL be removed, and `hearingMethodConfig.practiceStartLevelDb` SHALL be added with the value 0 (the Anchor).
3. `hearingMethodConfig.capRelativeToAnchorDb` SHALL be 5, and its config test SHALL refuse any value above 5 with a message that names the change of 2026-11-16 and the owner's approval needed to raise it.
4. `audioOutputConfig.calibrationSettingKeepMinDb` SHALL be −27, and its loosening guard SHALL refuse any value below −27.
5. THE config test SHALL check that −27 is the lowest setting on the control's grid at which every room's Search_Floor lies at least `playableRangeBelowAnchorMinDb` (30 dB) below the Anchor.
6. `audioOutputConfig.calibrationMusicRisePeriodMs` SHALL be guarded against being made shorter than 2000 ms.
7. THE spec SHALL change no other value of `audioSafetyConfig`, `audioOutputConfig`, `hearingMethodConfig`, `visitFlowConfig`, `missedSoundReplayConfig`, `swappedRepeatConfig`, `resultPageConfig` or `soundRulesConfig`.
8. THE code of this spec SHALL hold no number that sets a level, a wait, a count or a limit outside `src/config`, apart from 0, 1 and rounding tolerances that set no level.

### Requirement 3: The calibration target

**User story:** As the visitor, I want to drag the control or jump it with a key, so that matching takes seconds and not dozens of presses.

#### Acceptance criteria

1. THE Visit_Flow SHALL gain `setCalibrationTarget(settingDb)`, and THE calibration controller SHALL gain `setTarget(settingDb)`, which it calls.
2. WHEN `setCalibrationTarget(settingDb)` is called in the `calibration` Stage while no Pause holds, THE Target_Setting SHALL become `settingDb` rounded down to the control's grid and held from the bottom of the control to the Control_Top.
3. IF `settingDb` is NaN or not a number, THEN THE Target_Setting SHALL not change.
4. WHEN `settingDb` is +Infinity or above the Control_Top, THE Target_Setting SHALL be the Control_Top; WHEN it is −Infinity or below the bottom, THE Target_Setting SHALL be the bottom.
5. WHEN `setCalibrationTarget` is called before the calibration sound has started, THE Target_Setting SHALL change, and WHEN the sound then starts, THE Target_Setting SHALL be the bottom of the control, as `open()` makes it today (D3).
6. THE `calibration` Snapshot SHALL give `targetSettingDb`, which is the bottom of the control before the sound has started.
7. `louder()` and `quieter()` SHALL keep their behaviour.
8. THE way the Output_Shell plays the Calibration_Repeats SHALL not change: the first repeat at the bottom of the control, every later one at most `calibrationRiseMaxDb` above the one before, and the Played_Setting following the Target_Setting.
9. THE Visit_Flow SHALL ignore `setCalibrationTarget` in every other Stage and while a Pause holds.

### Requirement 4: The calibration music is loaded once

**User story:** As the visitor, I want the music ready when I reach calibration, and the house to carry on without it if it cannot be loaded.

#### Acceptance criteria

1. WHEN `activate` first creates the audio context, THE Output_Shell SHALL begin loading the Calibration_Music through the Backend from `calibrationMusicConfig.filePath`, and SHALL load it at most once for the life of the Output_Shell.
2. THE Backend SHALL fetch the file from the site's own files only, decode it with the audio context, and give the Output_Shell the samples of its first channel at the context's sample rate.
3. WHEN the samples arrive, THE Output_Shell SHALL measure their RMS and peak with `measureCalibrationMusic`, and SHALL compute the Music_Top with `calibrationMusicTopDb`.
4. IF the fetch or the decoding fails, the samples are empty, silent or not finite, the Music_Top is below the Keep_Minimum plus `calibrationSettingSpanMinDb` (10 dB), or no samples have arrived `calibrationMusicLoadMaxMs` after the load began, THEN THE Calibration_Sound SHALL become `hiss` for the life of the Output_Shell.
5. WHILE the Calibration_Music is loading, THE Calibration_Sound SHALL be `loading`, and THE `calibration` Snapshot SHALL give `calibrationSound` `loading` and the line `calibrationCopy.loadingLine`.
6. WHEN `startCalibration` is called while the Calibration_Sound is `loading`, THE Visit_Flow SHALL start the calibration sound once the Calibration_Sound is `music` or `hiss`, if the `calibration` Stage is still shown, no Pause holds and the Output_Shell runs.
7. THE Output_Shell SHALL report every change of the Calibration_Sound to its listeners.

### Requirement 5: The calibration music plays safely

**User story:** As the visitor, I want the music to start very quietly and follow the control smoothly, never faster than the repeats did, and to stop the moment I am done.

#### Acceptance criteria

1. THE Calibration_Music SHALL play only through the Output_Shell, in both channels with equal samples, looping, at Music_Level_Gain of its Played_Setting (audio-safety rule 1).
2. WHEN the music starts, THE Played_Setting SHALL be the bottom of the control, and THE music SHALL fade in from exact zero over `outputFadeMs` (rule 3).
3. WHILE the Target_Setting is above the Played_Setting, THE Played_Setting SHALL rise towards it in steps of `calibrationMusicGainStepMs`, each at most `calibrationRiseMaxDb × calibrationMusicGainStepMs / calibrationMusicRisePeriodMs` above the one before, with an exponential ramp over the step, and no step SHALL begin on the audio clock before the previous one has ended.
4. WHILE the Target_Setting is below the Played_Setting, THE Played_Setting SHALL fall to it within one step.
5. THE Music_Level_Gain SHALL never exceed `ceilingFraction / musicPeakFraction`, and THE Played_Setting SHALL never exceed the Control_Top (rule 2).
6. WHEN the visitor keeps a setting, leaves the `calibration` Stage, presses stop, hides the page, leaves the page, or the device changes, THE music SHALL stop, fading to exact zero over at least `stopFadeMs` (rules 3 and 7).
7. WHILE the music plays, THE Output_Shell SHALL refuse every other sound as `busy`.
8. WHEN a calibration with the music is kept, THE Output_Shell SHALL keep the Played_Setting rounded down to the control's grid, and SHALL refuse it as today below the Keep_Minimum.
9. THE Output_Shell SHALL loop no sound but the Calibration_Music, and every ghost sound, check sound and replay sound SHALL keep the longest-sound limit (rule 6 and its exception).
10. THE music path SHALL be testable under Node with the Fake_Backend, which records every loop start, ramp and stop, and is given the decoded samples by the test.

### Requirement 6: The hiss when the music cannot be loaded

**User story:** As the visitor, I want calibration to work even if the music does not.

#### Acceptance criteria

1. WHILE the Calibration_Sound is `hiss`, THE calibration SHALL play Calibration_Repeats exactly as before this spec, with the Control_Top of today.
2. WHILE the Calibration_Sound is `hiss`, THE `calibration` Snapshot SHALL give the hiss lines of `calibrationCopy`, which say that the calibration sound is a hiss and say nothing about why.
3. THE Anchor_Kind of a calibration kept with the hiss SHALL be `hiss`.

### Requirement 7: The calibration copy

**User story:** As the visitor, I want to be told what volume to choose, why, how the sound follows the control and which keys move it, with nothing about my hands.

#### Acceptance criteria

1. `src/copy` SHALL hold every line of "The calibration copy" in `design.md`, with that wording: the heading, the opening line, the line at the top, the line on why this is asked, the line that the sound rises a little at a time, the line that names the keys, the loading line and the system volume line, each for the music and for the hiss.
2. NO line of `src/copy` SHALL mention hands.
3. THE `calibration` Snapshot SHALL give `heading`, `introLines` and `line` for the Calibration_Sound in use.
4. THE kept line of audio-safety rule 8 SHALL stay as it is.
5. EVERY place in the code, its comments and the READMEs that names the hiss as the calibration sound SHALL be changed as "Every place that names the hiss" in `design.md` lists, and the places that belong to the owner SHALL be listed for the owner.

### Requirement 8: The anchor

**User story:** As the project owner, I want the steering to say what the anchor now is and what the result can still claim.

#### Acceptance criteria

1. THE "Level scale" section of `.kiro/steering/hearing-method.md` SHALL be replaced by the text of "The anchor" in `design.md`, which gives no figure in dB SPL.
2. Step 2 of "What the visitor does" in `.kiro/steering/product.md` SHALL be replaced by the text of "The anchor" in `design.md`.
3. THE design SHALL say why the music anchor keeps what `product.md` lets the result claim, and what it gives up.
4. EVERY kept calibration SHALL be logged with its Anchor_Kind.

### Requirement 9: The exception to rule 6

**User story:** As the project owner, I want the exception I approved written into the safety steering in one place, and nothing else changed there.

#### Acceptance criteria

1. `.kiro/steering/audio-safety.md` SHALL gain, under rule 6, exactly the sentence of "The exception to rule 6" in `design.md`, which says that the owner approved it on 2026-11-16.
2. NO other rule, sentence or value of `.kiro/steering/audio-safety.md` SHALL change.

### Requirement 10: The cap comes down

**User story:** As the project owner, I want the loudest sound to be no louder at the ear than before, now that the anchor is a comfortable music volume.

#### Acceptance criteria

1. THE cap relative to the Anchor SHALL be 5 dB, with the reason beside the value in the config and in the Initial values table of `hearing-method.md`.
2. THE design SHALL give what the cap changes, for "worse than cap", the replay, the Room_Tops, `roomTopMinDb` and the properties that use the cap.
3. EVERY room SHALL still reach the Anchor at every setting from the Keep_Minimum to the Control_Top (`roomTopMinDb` stays 0).
4. THE missed-sound replay SHALL hold every replayed sound at most at its room's top under the new cap.

### Requirement 11: Saved visits from before and the earlier visit

**User story:** As the visitor, I want my older saved visits to read as before, and never to be compared with a visit whose anchor was set another way.

#### Acceptance criteria

1. WHEN a Payload written before this spec is read, THE Saved_Visit SHALL be what it is today, with every new optional field absent.
2. THE Anchor_Kind of a calibration without the field `anchor` SHALL be `hands`.
3. `resultPicture` SHALL give a floor's wings an earlier mark only when the shown floor's calibration and the earlier floor's calibration have the same Anchor_Kind, and SHALL give `comparison` null when no floor has one.
4. `findEarlierVisit` SHALL skip a saved visit whose Anchor_Kind is `hands` when the shown visit is not a listed saved visit, or is a listed saved visit whose Anchor_Kind is not `hands`.
5. THE Payload's `formatVersion` SHALL stay 1, and a Payload with the new fields SHALL be readable only when they meet the rules of "Checking a payload" in `design.md`.

### Requirement 12: The playable floor

**User story:** As the visitor on Bluetooth headphones, I want the house never to play, or count on, a sound my headphones cannot carry.

#### Acceptance criteria

1. `roomFloorLevelDb(soundId, calibrationGain)` in `src/audio/output/room-floor-level.ts` SHALL be a pure function that gives the Playable_Floor.
2. THE Range_Report SHALL give, for every sound, `floorLevelDb` and `floorSetBy`, and the Playable_RMS.
3. EVERY kept calibration SHALL be logged with `roomFloorLevelDb` for every ghost room.
4. `roomSearchFloorDb(floorLevelDb, settings)` in `src/session/room-search-floor.ts` SHALL give the lowest level of the Level_Grid at or above the Playable_Floor.
5. THE search of every room run, in the visit and in the Repeat_Stage, SHALL be created with `floorDb` equal to the Search_Floor of that room under the calibration in use, which every Room_Attempt SHALL log as `searchFloorDb`.
6. THE Room_Summary SHALL give `searchFloorDb`, and THE Result_Picture SHALL place each floor's light between its Search_Cap and its Search_Floor.
7. THE Repeat_Run SHALL use the first run's Search_Floor and SHALL stop with an error if the calibration gives another.
8. THE missed-sound replay SHALL need no change for the floor, because every sound it plays again was played at or above the Search_Floor.

### Requirement 13: Enough room to whisper

**User story:** As the project owner, I want a kept calibration always to leave every room enough quiet range.

#### Acceptance criteria

1. WHEN `keepCalibration` is called with a Played_Setting below the Keep_Minimum (−27), THE Output_Shell SHALL refuse it with `systemVolumeHigh`, and THE Visit_Flow SHALL give the existing line that asks the visitor to turn the system volume down and set the sound again.
2. AT every setting from the Keep_Minimum to the Control_Top, every room's Search_Floor SHALL lie at least 30 dB below the Anchor and below its Search_Cap.
3. THE design SHALL give the arithmetic of the Playable_Floor, the Search_Floor and the Search_Cap of every room at the Keep_Minimum, the middle and the Control_Top.

### Requirement 14: Practice in each room

**User story:** As the visitor, I want each room to begin with sounds I hear at once, so that I know the house and my headphones work and what to do.

#### Acceptance criteria

1. EVERY room run, in the visit and in the Repeat_Stage, SHALL begin with Practice, a step of the Room_Runner before the search (D11).
2. EACH ear's first Practice_Sound SHALL be at the lower of `practiceStartLevelDb` (the Anchor) and the Search_Cap.
3. AFTER a Practice_Sound not caught, THE next Practice_Sound for that ear SHALL be `upwardStepDb` louder, at most the Search_Cap.
4. AN ear's Practice SHALL end at its first Practice_Catch, or unheard after Practice_Top_Misses Practice_Sounds at the Search_Cap not caught.
5. PRACTICE SHALL have no no-sound trials.
6. A wrong-side answer to a Practice_Sound SHALL count as not caught. An answer outside every Practice_Sound's window SHALL be logged as a practice ignored answer and SHALL change nothing.
7. EACH Practice_Sound SHALL be for an ear drawn at random among the ears whose Practice has not ended, after a gap drawn from `gapBetweenTrialsMinMs` to `gapBetweenTrialsMaxMs`, both from the Visit's sound random source, and SHALL have the response window of a trial.
8. WHEN every ear's Practice has ended and every ear caught, THE Counting SHALL begin: THE search SHALL be created with each ear's Search_Start, and the `countingStarted` Visit_Event SHALL be handed out.
9. THE Search_Start of an ear SHALL be its Practice_Catch level minus `downwardStepDb`, at least the Search_Floor and at most the Search_Cap.
10. THE fixed starting level of 25 dB below the Anchor SHALL no longer be used anywhere.

### Requirement 15: When an ear does not catch the practice sound

**User story:** As the visitor, I want to be told plainly when the house plays a sound I do not hear, with what to check, and a way to try again or go on.

#### Acceptance criteria

1. WHEN Not_Heard is reached, THE Visit_Flow SHALL begin a Pause with the reason `practiceNotHeard`, play nothing, and give in the `room` Snapshot the Not_Heard view: the ears not heard, what to check (headphones on and connected, this device playing through them, its sound not muted), and the labels of the two choices.
2. WHEN `resume` is called while the Pause `practiceNotHeard` holds, THE Visit_Flow SHALL call `activate` within the call and, once the Output_Shell runs, begin a new Practice_Round from the Anchor for every ear that did not catch, keeping the catches already made.
3. WHEN `goOnWithoutPractice` is called while the Pause `practiceNotHeard` holds, THE Visit_Flow SHALL end the Pause and begin the Counting with Search_Start null for every ear that did not catch.
4. AN ear with Search_Start null SHALL get the result `worseThanCap` with every count 0, and SHALL get no search trial.
5. WHEN both ears have Search_Start null, THE room run SHALL finish at once with both ears `worseThanCap` and no trial.
6. THE Visit_Flow SHALL ignore `goOnWithoutPractice` in every other state.
7. THE Visit_Flow SHALL play at most 2 × ((Search_Cap − `practiceStartLevelDb`) / `upwardStepDb` + Practice_Top_Misses) Practice_Sounds in one Practice_Round before Not_Heard, when no ear catches.

### Requirement 16: Practice is logged and does not count

**User story:** As the author of the tests, I want practice in the log, apart from the trials that make the result.

#### Acceptance criteria

1. THE Visit_Log SHALL hold every Practice_Sound, every practice ignored answer and every refused Practice_Sound in its field `practice`, and nothing of Practice in `trials`, `ignoredAnswers` or `refusedPlays`.
2. EVERY Room_Attempt whose Counting began SHALL log `searchStartLevelDb` and `countingStartedAtMs`.
3. THE threshold, the catch counts and the false alarm rate of every room, the Visit_Summary, the missed-sound replay's plan and the Result_Picture SHALL be the same whether or not `practice` is removed from the Visit_Log.
4. A Pause during Practice SHALL discard the presented Practice_Sound, and after `resume` the same Practice_Sound (ear and level) SHALL be presented again after its own gap.
5. A Practice_Sound refused by the Output_Shell SHALL follow the Room_Runner's refusal rule, counted with the trials of the same run.

### Requirement 17: What the screen is told

**User story:** As the visitor, I want to know that I am in practice and that a sound is playing now, and nothing about the sounds that count.

#### Acceptance criteria

1. THE `room` Snapshot SHALL give `practice`: the phase (`practice`, `notHeard` or `counting`), whether a Practice_Sound is playing now, and every line and label to show, all from `src/copy`.
2. `practice.soundPlaying` SHALL be true from a Practice_Sound's presentation to its scoring or discarding, and false at every other moment.
3. THE `room` Snapshot SHALL name no side of any sound that is not yet scored.
4. WHILE the phase is `counting`, THE `room` Snapshot SHALL not change between a trial's presentation and its scoring, and THE only events SHALL be `trialScored` at scoring (visit-flow R11.2, R11.3).
5. EVERY Practice_Sound of a room run SHALL be presented before the first trial of its Counting.
6. THE Visit_Flow SHALL hand out `practiceSoundScored` in the step that scores a Practice_Sound, with the reaction `ripple` and a ripple line for a Practice_Catch and `none` otherwise.
7. THE design SHALL say why showing that a Practice_Sound plays leaks nothing about a counted trial.

### Requirement 18: The practice copy

**User story:** As the visitor, I want to meet each room's ghost in practice, in the house's voice, with nothing threatening.

#### Acceptance criteria

1. `src/copy` SHALL hold, for every room, the practice lines and the line that starts the Counting of "The practice copy" in `design.md`, with that wording.
2. THE practice lines SHALL say that this is practice, that nothing counts yet, and when the Counting begins.
3. THE line that starts the Counting SHALL say that the room's sound has noticed the visitor and will be quieter from now on.
4. THE practice copy SHALL hold no threat, no scream and nothing sudden, SHALL not mock the visitor, and SHALL follow `wording.md`.
5. THE word "wireless" and the word "Bluetooth" SHALL appear in no line of `src/copy` but the Floor_Line.

### Requirement 19: Practice in the swapped repeat

**User story:** As the visitor, I want the swapped repeat to run the room exactly as before, practice included.

#### Acceptance criteria

1. THE Repeat_Run SHALL begin with Practice through the same Room_Runner, with every Practice_Sound on the earpiece of its ear.
2. THE Repeat_Record SHALL hold the Practice of its run in `practice`, each Practice_Sound with its ear and earpiece, and SHALL write nothing to the Visit_Log.
3. THE Pause `practiceNotHeard` SHALL act in the Repeat_Stage's room as in a room of the visit, written to the Repeat_Run's record.
4. THE `room` phase of the repeat's view SHALL give `practice` as the `room` Snapshot does.

### Requirement 20: Audio safety during practice

**User story:** As the project owner, I want every audio-safety rule to act during practice.

#### Acceptance criteria

1. EVERY Practice_Sound SHALL be played through `output.play` with the Purpose `trial`, at most at the Search_Cap.
2. THE design SHALL give, for every rule of `audio-safety.md`, how it acts during Practice, and for rule 4 the cases of "Rule 4 in practice" in `design.md`.
3. ON each ear within a room run, no sound SHALL be more than `upwardStepDb` above the one before on that ear, across Practice, a new Practice_Round and the Counting.
4. THE Output_Shell's Rise_Limit SHALL act on Practice_Sounds as on trials, and `beginRoom` SHALL be called before the first Practice_Sound of every room run.

### Requirement 21: Output latency

**User story:** As the visitor on Bluetooth headphones, I want my answer counted when the sound reached me late.

#### Acceptance criteria

1. THE Output_Shell SHALL give `outputLatencyMs()`: the audio context's `outputLatency` in milliseconds when it is a finite number from 0 up, and null otherwise.
2. EVERY kept calibration SHALL be logged with `outputLatencyMs`.
3. THE response window of every trial and Practice_Sound SHALL run from its Window_Start to Window_Start + `responseWindowMs` + the Latency_Allowance of the calibration in use, and every Room_Attempt SHALL log that length as `responseWindowMs`.
4. THE Window_Start SHALL be computed as today.
5. THE design SHALL say what the allowance does to the gap between trials and to the visit lengths.

### Requirement 22: The result line

**User story:** As the visitor, I want to be told when my result is as quiet as the house can play through my headphones at this volume, and only then.

#### Acceptance criteria

1. THE Picture_Floor SHALL give `playableFloorLine`: the Floor_Line naming each ear of the floor whose result is `betterThanFloor`, or `found` with a threshold at most one `upwardStepDb` above the floor's Search_Floor; null when no ear is.
2. FOR a floor without `searchFloorDb`, the Search_Floor SHALL be the Saved_Visit's `floorDb`.
3. THE Floor_Line SHALL come from `src/copy`, say that this is as quiet as the house can play through these headphones at this volume, and say that wireless headphones in particular stop there.
4. THE visitor SHALL never be asked what headphones they wear.

### Requirement 23: Bluetooth

**User story:** As the project owner, I want to know what Bluetooth can do to a visit and what is settled.

#### Acceptance criteria

1. THE design SHALL give, for a sound's start cut after silence, a codec that drops very quiet sound, a volume that changes by itself, a device that switches away, and output latency: what the product does now, what this spec adds, and what only a listening session can settle.
2. NO signal SHALL be played to keep a link awake (audio-safety rule 5).

### Requirement 24: Properties

**User story:** As the project owner, I want the brief's properties checked over every kind of simulated visitor, and the accuracy of the search kept.

#### Acceptance criteria

1. THE Property_Suite SHALL check CP1 to CP12 of "Correctness properties" in `design.md`, with the listeners and run counts stated there, each with a new random fast-check seed on every run unless stated as fixed.
2. EVERY existing accuracy property of the threshold search (CP1, CP2, CP3) and of the visit flow (CP11) SHALL run with its tolerance unchanged. IF one fails, THEN the task SHALL stop and report which property and by how much, and SHALL loosen nothing.
3. EVERY existing property whose statement this spec changes SHALL be changed only as "Existing properties" in `design.md` says.
4. EVERY task that adds a property file SHALL run `npm test` three times and record the times under "Run counts and time" in `design.md`; THE final task SHALL compute the budget by the rule there.
5. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression in `tests/properties/audible-start-regressions.test.ts`, first with `it.fails`, and the task SHALL stop and report it.

### Requirement 25: Visit lengths

**User story:** As the visitor, I want the names of the two visits to say how long they take.

#### Acceptance criteria

1. A task SHALL measure the visit lengths again with Practice included, by the method of visit-flow "How long the rooms take" and visit-flow Q3, with the measurement kept in `tests/listeners`.
2. IF a rounded length differs from 7 or 12 minutes, THEN THE task SHALL change the names in `src/copy/front-door-copy.ts`, `.kiro/steering/product.md` and the comment of `VisitType` in `src/config/hearing-method-config.ts`, and SHALL list for the owner the places under `src/ui/` and `tests/e2e/` that name them.

### Requirement 26: Steering

**User story:** As the project owner, I want the steering to say what the house now does.

#### Acceptance criteria

1. `.kiro/steering/hearing-method.md` SHALL gain the Practice section, the new "Level scale", the new text of "When a search cannot finish honestly" and "Known limits to keep in mind", and the new rows of the Initial values table, exactly as "Steering" in `design.md` gives them.
2. `.kiro/steering/product.md` SHALL gain the new step 2 and the exception for Practice in the experience rule about revealing when a sound plays, exactly as "Steering" gives them.
3. `.kiro/steering/audio-safety.md` SHALL change only as R9 says.

### Requirement 27: What the simulated listeners gain

**User story:** As the author of the properties, I want simulated visitors that practise, set the music, and go on when they hear nothing.

#### Acceptance criteria

1. THE Simulated_Visitor SHALL answer Practice_Sounds as it answers trials, from the test hook, and SHALL handle the Pause `practiceNotHeard` by a drawn number of tries and then `goOnWithoutPractice`, going on at once by default.
2. THE Simulated_Visitor SHALL be able to set the calibration by `setCalibrationTarget`, by presses, or both.
3. `tests/listeners` SHALL gain `practiseForSearch`, which plays Practice with a listener through `createRoomPractice` and gives the search's starting levels, for the engine-level properties.
4. `tests/listeners` SHALL gain the visit length measurement as a function and a print script that write no file.

### Requirement 28: Boundaries

**User story:** As the project owner, I want the tasks to stay out of the screen I am building.

#### Acceptance criteria

1. THE tasks SHALL create or change no file under `src/ui/`, `tests/e2e/` or `tests/properties/screen-leak/`, no CSS or HTML file, `src/main.ts`, the root `README.md`, `docs/licences.md`, or any file under `public/`.
2. THE tasks SHALL add, convert or download no audio file, and SHALL write no decoded audio to disk.
3. THE tasks SHALL change only the files listed in `design.md`, and SHALL not commit.

# Requirements: missed-sound replay

## Introduction

This spec fills the stage `missedSoundReplay`, which the visit flow already reaches after the last room and leaves empty (visit-flow D21). The house plays again every sound the visitor did not catch, louder, from the room and the side it came from, in the order it came, and then leads on to the result. It adds a pure plan of the replay made from the visit log alone (`src/session`), the part of the visit flow that plays that plan through the output stage with the Purpose `replay`, the view of the replay that the stage's snapshot holds at every moment, the config of the replay (`src/config`), every string the replay shows (`src/copy`), and the two properties of brief 07 with those the design needs.

The screen itself is built by hand by the project owner, outside this spec's tasks: everything under `src/ui/`, the CSS, `index.html`, `src/main.ts`, the lit room and the ripple of each replayed sound, the visible stop control in this stage, and the browser tests in `tests/e2e/`. The owner builds the screen against the additions this spec makes to `src/session/visit-flow-types.ts`, which `design.md` gives in full in its section "Interface contract". The snapshot holds every string and every number the screen shows, so the screen computes and words nothing. The line of the brief's "Done when" about a real visit is the owner's to meet, and no task here claims it.

The input is `docs/briefs/07-missed-sound-replay.md`; the steering files in `.kiro/steering/`; `docs/architecture.md` and `docs/roadmap.md`; the specs under `.kiro/specs/visit-flow/`, `.kiro/specs/audio-output/`, `.kiro/specs/ghost-sounds/`, `.kiro/specs/threshold-search/` and `.kiro/specs/result-page/`; and the code, above all `src/session/create-visit-flow.ts`, `src/session/visit-flow-types.ts`, `src/session/visit-log-recorder.ts`, `src/session/room-runner.ts`, `src/audio/output/create-audio-output.ts` and `src/audio/output/prepare-playback.ts`. Open points are settled in the Decisions section of `design.md` (D1, D2 and so on) where they are this spec's to settle. Every new number, and every choice that belongs to the owner, is a question for the project owner (Q1 to Q7) in the same document. None of those questions is decided here. The values the design uses for them are proposals and are marked PROPOSED, NOT APPROVED wherever they appear.

Out of scope: drawing, layout, input handling and the browser tests (the owner's); the swapped repeat (brief 08); the no-headphone replay (brief 09), which replays a whole recorded visit; the last door (brief 11); the robot module (brief 10). "What this spec leaves to other specs" in `design.md` says what each of them inherits.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Visit_Flow**, **Visit_Log**, **Visit_Summary**, **Room_Attempt**, **Snapshot**, **Visit_Event**, **Pause**, **Timer**, **Output_Shell**: as in the visit-flow spec.
- **Contract_File**: `src/session/visit-flow-types.ts`, the interface contract of the visit flow. This spec only adds to it (visit-flow D1).
- **Replay_Stage**: the Stage `missedSoundReplay` of the Visit_Flow.
- **Screen**: what the project owner builds by hand in `src/ui` for the Replay_Stage. It imports only `src/session`, `src/copy` and `src/config`.
- **Missed_Trial**: a trial of the Visit_Log of kind `sound`, with status `scored` and outcome `missed`, in a Room_Attempt whose ending is `finished`.
- **Missed_Level**: the `playedLevelDb` of a Missed_Trial: the level the output stage played it at.
- **Replay_Raise**: `missedSoundReplayConfig.replayRaiseDb`, 20 dB, from the brief.
- **Raised_Level**: the Missed_Level plus the Replay_Raise.
- **Replay_Cap**: for a Missed_Trial, the lower of the `roomTopLevelDb` of its room in the last calibration of the Visit_Log and `hearingMethodConfig.capRelativeToAnchorDb`. It is the cap of audio-safety rule 2 for that sound with the calibration the output stage holds during the replay (D5, Q5).
- **Asked_Level**: the lower of the Raised_Level and the Replay_Cap: the level the Visit_Flow asks the output stage for.
- **Cap_Changed**: true for a replayed sound whose Asked_Level is below its Raised_Level, or whose play outcome names a clamp limit.
- **Replay_Plan**: what `planMissedSoundReplay` returns for a Visit_Log: every Missed_Trial as a planned sound, and the Replay_Sounds.
- **Replay_Max**: `missedSoundReplayConfig.replaySoundsMaxCount`, the most sounds one replay plays. PROPOSED, NOT APPROVED (Q1).
- **Even_Selection**: for n Missed_Trials and a Replay_Max m below n, the m Missed_Trials at the positions `floor(k × (n − 1) / (m − 1))` for k from 0 to m − 1 (D7).
- **Replay_Sound**: one sound the replay plays: a Missed_Trial of the Even_Selection, or every Missed_Trial when there are at most Replay_Max of them.
- **Replay_Gap**: `missedSoundReplayConfig.replayGapMs`, the wait from the end of one Replay_Sound to the request for the next. PROPOSED, NOT APPROVED (Q2).
- **Replay_Phase**: `nothingMissed`, `announcing`, `playing` or `finished`.
- **Replay_Ending**: why a replay finished: `allPlayed`, `deviceChanged` or `soundRefused`.
- **Replay_View**: the field `replay` of the Replay_Stage's Snapshot: everything the Screen shows and says in the Replay_Stage at that moment.
- **Announcement**: the lines the house says in the `announcing` phase, before any Replay_Sound plays.
- **Ripple_Label**: the label of a replayed sound's ripple: its side, its pitch, its Missed_Level relative to the visitor's calibration, and whether Cap_Changed.
- **Running_Count**: the counts of one side, and their line in words, over the scored sound trials of finished Room_Attempts up to and including a given trial order (D11, Q4).
- **Render_Source**: the random source the Replay_Sounds are rendered from, made from a seed that follows from the Visit_Log alone (D2).
- **Skip**: `proceed()` in the `announcing` or `playing` phase.
- **Replay_Controller**: the session object that runs one replay: its phase, its timers, its plays and its view (`create-missed-sound-replay.ts`).
- **Property_Suite**: the property tests of this spec under `tests/properties/`, named `missed-sound-replay-cp<n>-*.property.test.ts`.

## Requirements

### Requirement 1: The contract only grows

**User story:** As the project owner building the screen by hand, I want the replay's fields added to the contract I already build against, with nothing in it renamed or changed, so that the screens I have keep working.

#### Acceptance criteria

1. THE Contract_File SHALL gain exactly the additions of "Interface contract" in `design.md`: the method `startReplay` of `VisitFlow`, the field `replay` of `MissedSoundReplaySnapshot`, the member `ReplaySoundStartedEvent` of `VisitEvent`, and the new types of the replay.
2. THE additions SHALL remove, rename or change the meaning of nothing in the Contract_File. `VisitLog`, `VisitSummary`, `ResultSnapshot`, `SnapshotBase`, `VisitStage`, `PauseReason` and `TrialReaction` SHALL stay as they are.
3. THE spec SHALL change nothing in `src/session/result-page-types.ts`, in `src/audio/output/` or in `src/engine/`.
4. THE design SHALL say, for each existing type, what is added and which code outside `src/session` builds or implements that type, so that the owner knows what a new required field asks of a test fixture (Q6).
5. WHILE the tasks that play sound in the Replay_Stage are not yet built, `startReplay` SHALL do nothing, so that the Replay_Stage plays no sound before its checks exist.
6. THE type-level tests SHALL check that the copy's names for sides, endings and pause reasons equal the session's.

### Requirement 2: New numbers are in config and are not approved

**User story:** As the project owner, I want every number of the replay in one config file, with the ones I have not chosen marked as proposals, so that nothing is decided for me.

#### Acceptance criteria

1. THE file `src/config/missed-sound-replay-config.ts` SHALL hold `missedSoundReplayConfig` with `replayRaiseDb`, `replaySoundsMaxCount` and `replayGapMs`, deeply frozen, every field name ending in its unit, with the values of "Config" in `design.md`.
2. THE comment of `replayRaiseDb` SHALL name brief 07 as its source. THE comments of `replaySoundsMaxCount` and `replayGapMs` SHALL say PROPOSED, NOT APPROVED and name their question (Q1, Q2), and `design.md` SHALL describe them so wherever it mentions them.
3. THE config test SHALL check the values, the unit endings, deep freezing, that `replayRaiseDb` is above 0, that `replaySoundsMaxCount` is a whole number of at least 2, and that `replayGapMs` is a whole number above 0.
4. THE spec SHALL change no value of `hearingMethodConfig`, `audioSafetyConfig`, `audioOutputConfig`, `visitFlowConfig`, `resultPageConfig` or `rippleConfig`, and no steering file.
5. THE Replay_Controller SHALL take the most refusals in a row of one sound from the existing `visitFlowConfig.refusedPlaysInARowMaxCount` and SHALL add no number of its own for it (D16).
6. THE code of this spec in `src/session` and `src/copy` SHALL contain no number that sets a level, a wait, a count or a limit other than values read from `src/config`, apart from 0 and 1 and the bound of the number words (D12).

### Requirement 3: What the replay holds

**User story:** As the visitor, I want to hear again exactly the sounds that went by unheard, in the order they came, so that I learn how much I missed.

#### Acceptance criteria

1. THE function `planMissedSoundReplay(log, settings)` SHALL compute the Replay_Plan from the Visit_Log and the settings alone, as a pure function whose result is frozen plain data.
2. THE Replay_Plan SHALL hold every Missed_Trial of the Visit_Log once, in the order of their `order`, each with its trial order, its room from `log.rooms`, its ear and its Missed_Level.
3. THE Replay_Plan SHALL hold no no-sound trial, no discarded trial, no trial scored `caught`, no trial scored `wrongSide` (Q3) and no trial of a Room_Attempt that ended `abandoned` (D3).
4. THE sound of a Replay_Sound SHALL be the ghost sound of its room, played again from a new render, and not the samples heard on the trial (D2).
5. THE Missed_Level SHALL be the trial's `playedLevelDb`, also when the trial's `clampLimit` is not null (D4).
6. `planMissedSoundReplay` SHALL not throw for any Visit_Log the Visit_Flow produces, and SHALL throw a `RangeError` for a Visit_Log whose trials name a room it does not have, or that has a Missed_Trial and no calibration.

### Requirement 4: Louder, within the cap

**User story:** As the visitor, I want each sound played louder than when I missed it, and never louder than the house may play, and told when the cap held one back.

#### Acceptance criteria

1. THE Raised_Level of a Replay_Sound SHALL be its Missed_Level plus `replayRaiseDb`.
2. THE Replay_Cap of a Replay_Sound SHALL be the lower of `roomTopLevelDb[roomId]` of the last entry of `log.calibrations` and `hearingMethodConfig.capRelativeToAnchorDb` (D5, Q5).
3. THE Asked_Level SHALL be the lower of the Raised_Level and the Replay_Cap, and THE Visit_Flow SHALL ask the output stage for no Replay_Sound at a level above its Replay_Cap.
4. THE played level of every Replay_Sound SHALL be at most its Replay_Cap and at most `capRelativeToAnchorDb`, and every output sample SHALL stay within `audioSafetyConfig.ceilingFraction`.
5. WHEN Cap_Changed holds for a Replay_Sound, THE Ripple_Label SHALL say that it is as loud as the house may play; otherwise it SHALL say that it is louder now.
6. THE Replay_View SHALL give, for every Replay_Sound that has started, its Missed_Level, Raised_Level, Replay_Cap, Asked_Level, the level the output stage played, the clamp limit the output stage named or none, and Cap_Changed.

### Requirement 5: A selection when there are many

**User story:** As the visitor, I want the replay to stay short even when I missed many sounds, and to be told how many there were in all.

#### Acceptance criteria

1. WHEN a Visit_Log has at most Replay_Max Missed_Trials, THE Replay_Sounds SHALL be every Missed_Trial.
2. WHEN a Visit_Log has more than Replay_Max Missed_Trials, THE Replay_Sounds SHALL be the Even_Selection of Replay_Max of them, in their order, the first and the last Missed_Trial included.
3. THE Even_Selection SHALL be a pure function of the number of Missed_Trials and Replay_Max: the same numbers SHALL always give the same positions.
4. WHEN the Replay_Sounds are a selection, THE Replay_View SHALL give, in every phase but `nothingMissed`, a line that says how many sounds were missed in all and how many will be or were played.
5. THE Replay_View SHALL give the number of Missed_Trials and the number of Replay_Sounds as numbers.

### Requirement 6: The announcement

**User story:** As the visitor, I want to be told what is about to happen before any louder sound plays, so that it does not take me by surprise.

#### Acceptance criteria

1. WHEN the Replay_Stage is entered and the Replay_Plan has at least one Replay_Sound, THE Replay_View SHALL be in the phase `announcing`, with the lines of the Announcement: that the sounds not caught will be played again, from the room and side they came from, in their order; that each is louder by the Replay_Raise and never louder than the house may play; that the volume should stay as it is; and that the sounds can be stopped at any moment.
2. THE Visit_Flow SHALL play no Replay_Sound while the Replay_View is `announcing`.
3. WHEN `startReplay` is called in the phase `announcing` while no Pause holds, THE Visit_Flow SHALL call `activate` within the call when the Output_Shell does not run, and, once it runs, SHALL show the phase `playing` and ask for the first Replay_Sound one Replay_Gap later (D8).
4. IF the Output_Shell refuses to start because it saw no press, THEN THE Visit_Flow SHALL stay in `announcing` and set `activationRefused`, as in every other stage.
5. THE Visit_Flow SHALL ignore `startReplay` in every other phase and every other Stage.

### Requirement 7: Playing the sounds

**User story:** As the visitor, I want each sound to come from where it came, with a ripple on its side that says what it was.

#### Acceptance criteria

1. WHILE the phase is `playing` and no Pause holds, THE Visit_Flow SHALL play the Replay_Sounds in the order of the Replay_Plan, one at a time, each with `output.play` with the Purpose `replay`, the Sound_Id of its room, its ear, its Asked_Level and the Render_Source.
2. THE Visit_Flow SHALL ask for each Replay_Sound after the first one Replay_Gap after the end of the one before, both times on the Timer's clock (D9).
3. WHEN a Replay_Sound starts, at its start converted to the Timer's clock as the room runner converts a trial's start, THE Visit_Flow SHALL make it the Replay_View's current sound and hand out a `replaySoundStarted` Visit_Event that holds it.
4. THE current sound of the Replay_View SHALL give its room, room name, pitch label, ear, position, position label and Ripple_Label, so that the Screen can light its room and draw its ripple on its side without computing anything.
5. THE Ripple_Label SHALL name the side, the pitch, and the Missed_Level relative to the visitor's calibration, and SHALL say whether Cap_Changed (R4.5).
6. WHILE a Replay_Sound plays or the Replay_Gap after it runs, THE Replay_View SHALL keep that sound as its current sound.

### Requirement 8: The running count

**User story:** As the visitor, I want to read, in words, how many sounds the house made on each side and how many I caught, and I want those numbers to be true.

#### Acceptance criteria

1. WHILE the phase is `playing` and a Replay_Sound has started, THE Replay_View SHALL give, for each side, the Running_Count through the current sound's trial order: the sound trials made, caught, answered on the wrong side and missed (D11, Q4).
2. WHEN the phase is `finished` or `nothingMissed`, THE Replay_View SHALL give the Running_Count of the whole Visit_Log.
3. THE line of each side SHALL give the counts in words, in the form "On your right I made seven sounds. You caught three.", and, when the visitor named the other side at least once, a sentence that says how often (Q3).
4. THE counts and the numbers in the lines SHALL equal the counts over the Visit_Log, and for every side made SHALL equal caught plus wrong side plus missed.
5. THE Running_Count SHALL count the scored sound trials of finished Room_Attempts only, the same trials the Replay_Plan draws from.

### Requirement 9: Nothing missed

**User story:** As the visitor who caught every sound, I want to be told so in one line and go on.

#### Acceptance criteria

1. WHEN the Replay_Stage is entered and the Replay_Plan has no Replay_Sound, THE Replay_View SHALL be in the phase `nothingMissed` with one line that says there is nothing to play again, and SHALL give no Announcement.
2. WHILE the phase is `nothingMissed`, THE Visit_Flow SHALL play nothing, SHALL ignore `startReplay`, and SHALL show the `result` Stage on `proceed` (D13).

### Requirement 10: Skipping

**User story:** As the visitor, I want to skip the replay at once, before or while it plays.

#### Acceptance criteria

1. THE Replay_View SHALL say whether the replay can be skipped now: in `announcing`, and in `playing` while no Pause holds.
2. WHEN `proceed` is called in `announcing` or in `playing` while no Pause holds, THE Visit_Flow SHALL call `stopAll` when a Replay_Sound may be under way, cancel every pending timer of the replay, and show the `result` Stage (D14).
3. WHEN a replay has been skipped, THE Visit_Flow SHALL play no further Replay_Sound and hand out no further `replaySoundStarted` Visit_Event.
4. THE Replay_View SHALL give the label of the control that calls `proceed` in each phase.

### Requirement 11: Stop, hiding, device changes and leaving

**User story:** As the visitor, I want the replay to stop at once when I ask, when I hide the page or when I leave it, as every other sound does.

#### Acceptance criteria

1. WHEN `stop` is called in the Replay_Stage, THE Visit_Flow SHALL call `stopAll`, cancel every pending timer of the replay and show the `result` Stage, as visit-flow R14.2 requires.
2. WHEN the Output_Shell reports a stop with the reason `hidden` or `interrupted` in the phase `playing` while no Pause holds, THE Visit_Flow SHALL begin a Pause with that reason, cancel every pending timer of the replay, and play nothing until `resume`.
3. WHEN `resume` is called while such a Pause holds, THE Visit_Flow SHALL call `activate` within the call and, once the Output_Shell runs, end the Pause and ask, one Replay_Gap later, for the Replay_Sound that was cut off, or for the next one when none was under way (D15).
4. WHEN the Output_Shell reports `hidden` or `interrupted` in `nothingMissed`, `announcing` or `finished`, THE Visit_Flow SHALL begin no Pause, because nothing plays there.
5. WHEN the Output_Shell reports `deviceChanged` in `announcing` or `playing`, THE Visit_Flow SHALL end any Pause, cancel every pending timer of the replay, and show the phase `finished` with the Replay_Ending `deviceChanged`.
6. WHEN the Output_Shell reports `pageLeft` in the Replay_Stage, THE Visit_Flow SHALL cancel every pending timer of the replay, end any Pause, and show the `result` Stage.
7. WHILE a Pause holds in the Replay_Stage, THE Visit_Flow SHALL accept only `resume` and `stop`, and THE Replay_View SHALL give the line for the Pause's reason and the label of the control that resumes.
8. THE Visit_Flow SHALL ignore `pause()` in the Replay_Stage.
9. THE Visit_Flow SHALL write nothing to the Visit_Log for a Pause of the Replay_Stage (D18).

### Requirement 12: When the output stage refuses a sound

**User story:** As the visitor, I want a sound the house cannot play to be tried again and, if it still cannot, the replay to end plainly without losing my result.

#### Acceptance criteria

1. IF `play` refuses a Replay_Sound with `notRunning`, THEN THE Visit_Flow SHALL act as on a stop report with the Output_Shell's stop reason, or with `interrupted` when the shell gives none or gives `control`, as the room runner does.
2. IF `play` refuses a Replay_Sound with `notCalibrated`, THEN THE Visit_Flow SHALL show the phase `finished` with the Replay_Ending `deviceChanged`.
3. IF `play` refuses a Replay_Sound for any other reason, THEN THE Visit_Flow SHALL ask for the same Replay_Sound again one Replay_Gap later, and, after `refusedPlaysInARowMaxCount` refusals in a row, SHALL show the phase `finished` with the Replay_Ending `soundRefused` (D16).
4. THE Visit_Flow SHALL never leave the house, drop the Visit_Log or show the `exit` Stage because of a refusal in the Replay_Stage.

### Requirement 13: The end and the result

**User story:** As the visitor, I want to be told when the replay is over and then see my picture, the same picture whatever I did in the replay.

#### Acceptance criteria

1. WHEN the last Replay_Sound has ended, THE Visit_Flow SHALL show the phase `finished` with the Replay_Ending `allPlayed`.
2. THE Replay_View in `finished` SHALL give a line for its Replay_Ending which, for `allPlayed` with a selection, says how many of how many sounds were played, and SHALL wait for `proceed` (D17).
3. WHEN `proceed` is called in `finished` or `nothingMissed`, THE Visit_Flow SHALL show the `result` Stage.
4. THE `result` Stage SHALL hold the same Visit_Log object as the Replay_Stage, and the Visit_Summary SHALL be `summarizeVisit` of it, whether the replay was watched, skipped, stopped, ended early or had nothing to play.
5. THE replay SHALL change nothing in the Visit_Log: the Visit_Log SHALL deep-equal before and after the Replay_Stage (D18).

### Requirement 14: Time, randomness and reproducing a replay

**User story:** As the author of the tests, I want the replay to follow from the visit log alone, so that a failing replay can be played again.

#### Acceptance criteria

1. THE Replay_Controller SHALL read time and wait only through the Timer of the Visit, and SHALL not read a clock itself, as the lint rules for `src/session` require.
2. WHEN the Replay_Stage is entered, THE Visit_Flow SHALL draw one seed from the Visit's random source, and that seed SHALL equal `replayRenderSeed(log)`, which is computed from the Visit_Log alone (D2).
3. THE Render_Source SHALL be made from that seed, and every render of a Replay_Sound SHALL draw from it.
4. WHEN two Replay_Controllers are made from equal Visit_Logs on equal Output_Shells and Timers and are given the same actions and stop reports at the same times, THEY SHALL give equal Replay_Views, equal Visit_Events and equal sample buffers to the backend.
5. THE Replay_Plan, the Running_Counts and the Replay_View SHALL be pure functions that run under Node in Vitest, and the Replay_Controller SHALL run there with the fake audio backend and the manual timer.

### Requirement 15: Audio safety in the replay

**User story:** As the project owner, I want the replay, the loudest moment of the visit, to keep every rule of `audio-safety.md`.

#### Acceptance criteria

1. THE Visit_Flow SHALL play every Replay_Sound through `output.play` with the Purpose `replay` and through nothing else (rule 1).
2. THE design SHALL list which limits of the output stage act on a Replay_Sound and which do not, with the reason for each from the audio-output spec and the code, and this spec SHALL lift no limit other than the one rule 4 names.
3. EVERY Replay_Sound SHALL be faded in and out over at least `audioSafetyConfig.fadeMinMs`, SHALL carry exact digital zero on the other channel, SHALL last no longer than `audioSafetyConfig.ghostSoundMaxDurationMs`, and SHALL stay within the ceiling, as the output stage ensures for every sound (rules 2, 3, 5, 6).
4. THE Replay_Stage SHALL announce the replay before any Replay_Sound plays (R6).
5. THE Replay_View SHALL give the label of the visible stop control in every phase, and THE design SHALL require the Screen to show that control in this stage (rule 7). Showing it is the owner's.
6. THE replay SHALL play only the five room sounds, at the levels of R4, and nothing else (rule 9).
7. THE spec SHALL change no steering value and SHALL loosen no limit.

### Requirement 16: Every string is in src/copy

**User story:** As the project owner, I want every string of the replay ready in `src/copy`, so that I add none of my own.

#### Acceptance criteria

1. THE copy of this spec SHALL hold every constant and function of "The copy" in `design.md`, with that wording.
2. THE copy functions SHALL take plain values and names defined in `src/copy`, import only from `src/config` and other copy files, and throw a `RangeError` for values that do not fit.
3. THE copy SHALL contain no banned term, SHALL say nothing about accuracy, SHALL label every level it shows as relative to the visitor's own calibration, SHALL name a number of decibels that is not a level only as a difference ("20 dB louder than when it went by"), and SHALL not mock the visitor for a missed sound (`wording.md`, Tone).
4. THE copy SHALL write the counts of the Running_Count and of the selection in words (D12).
5. THE copy tests SHALL check every constant and the output of every function for representative inputs against the banned terms, and `npm run check:copy` SHALL pass.

### Requirement 17: Properties

**User story:** As the project owner, I want the brief's two properties and those the design needs checked over every visit log and every way of moving through the replay.

#### Acceptance criteria

1. THE Property_Suite SHALL check that for any Visit_Log the Replay_Plan holds exactly the Missed_Trials, or their Even_Selection, in order, on the right ears and rooms, and that no Asked_Level or played level exceeds the Replay_Cap (brief property 1, CP1).
2. THE Property_Suite SHALL check that the counts in the text equal the counts in the Visit_Log (brief property 2, CP2).
3. THE Property_Suite SHALL check the further properties of "Correctness properties" in `design.md` (CP3 to CP10) with the run counts stated there, each with a new random fast-check seed on every run.
4. IF the property files of this spec take more than the time budget of `design.md` together, THEN the task SHALL stop and report the times to the owner, and SHALL change no run count. The run counts and the budget are proposals (Q7).
5. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression test in `tests/properties/missed-sound-replay-regressions.test.ts`, first with `it.fails`, and the task SHALL stop and report it so that the fix is committed separately.
6. THE replay SHALL run to its end in a simulated quick visit and a simulated full visit in the test suite (brief, "Done when").

### Requirement 18: What other specs inherit

**User story:** As the authors of the swapped repeat, the no-headphone replay and the last door, I want to know what this spec leaves us and that it took nothing of ours.

#### Acceptance criteria

1. THE spec SHALL add nothing to the `result`, `swappedRepeat` or `entry` Stages and nothing for the no-headphone replay, the last door or the robot module.
2. THE design SHALL say what each of those specs inherits from the replay: the Output_Shell's previous gains after the replay, the Visit's random source after the replay's draw, the Visit_Log unchanged, and the pure functions it may reuse.

### Requirement 19: Boundaries and documentation

**User story:** As the project owner, I want the tasks to stay out of the screen I am building.

#### Acceptance criteria

1. THE tasks of this spec SHALL create or change no file under `src/ui/`, `tests/e2e/` or `tests/properties/screen-leak/`, nor `index.html`, `listen.html`, `result-sheet.html`, `src/main.ts`, the root `README.md` or anything under `.kiro/steering/`.
2. THE tasks SHALL change only the files listed in "Files" in `design.md`, and in `src/session/visit-flow-types.ts` SHALL only add.
3. THE tasks SHALL not commit; each task's work is committed afterwards by a separate run with a one-line message, so anything a task records goes in `design.md` or a README.
4. THE READMEs of `src/session/`, `src/copy/`, `src/config/`, `tests/properties/` and `tests/listeners/` SHALL describe what this spec adds, and SHALL follow `wording.md`.

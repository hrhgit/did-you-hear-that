# Requirements: visit flow

## Introduction

This spec builds the visit as a state machine in `src/session`: from the front door through calibration, the headphone check, the rules and the rooms, to the missed-sound replay, the result and the swapped repeat. It connects the threshold search (`src/engine`) to the output stage (`src/audio/output`), runs every trial on the injected timer, scores the visitor's answers, writes the visit log, and applies a new rule that pools false alarms over the whole visit.

The flow draws nothing. The interface is built by hand, outside this spec's tasks, directly against the types of one file, `src/session/visit-flow-types.ts`, which the first task writes with no behaviour. `design.md` gives that file in full in its section "Interface contract".

The input is `docs/briefs/04-visit-flow.md`; the steering files in `.kiro/steering/`; `docs/architecture.md`; the specs `threshold-search`, `ghost-sounds` and `audio-output` under `.kiro/specs/`, above all the section "What the visit-flow spec must do" of the audio-output design and decision D43 of the threshold-search design; and the code in `src/config`, `src/engine`, `src/audio/output`, `src/session`, `src/storage` and `src/copy`. Open points are settled in the Decisions section of `design.md`, referred to here as D1, D2 and so on. New numbers that decide what counts as a reliable result are proposed, not approved. They are listed as questions for the project owner (Q1, Q2 and so on) in the same document.

Out of scope: drawing and input handling (`src/ui`, `index.html`, `listen.html`, `src/main.ts`); the missed-sound replay, the result page and the swapped repeat themselves, which have their own specs and are only reached here; the last door; storing anything in local storage (D15); the robot module.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Visit_Flow**: the object `createVisitFlow` in `src/session/create-visit-flow.ts` returns. It holds one Output_Shell for the life of the page and runs one Visit at a time.
- **Contract_File**: `src/session/visit-flow-types.ts`, the types `src/ui` uses to create, drive and read the Visit_Flow.
- **Visit**: one walk from the front door to the result or the exit, of the Visit_Type the visitor chose.
- **Visit_Type**: `quick` or `full`, as in `hearingMethodConfig.roomFrequenciesHz`.
- **Room**: one pitch of the Visit, identified by the Ghost_Sound whose centre frequency is that pitch (D18).
- **Stage**: one of `entry`, `calibration`, `headphoneCheck`, `rules`, `room`, `betweenRooms`, `missedSoundReplay`, `result`, `swappedRepeat`, `exit` and `unsupported`.
- **Snapshot**: the frozen object `snapshot()` returns, describing the current Stage for the interface.
- **Visit_Event**: an object the Visit_Flow hands to its event listeners: `roomStarted`, `trialScored` or `roomFinished`.
- **Reaction**: the field of a `trialScored` Visit_Event that says what the interface shows at once: `ripple`, `noSoundLine` or `none`.
- **Output_Shell**, **Purpose**, **Range_Report**, **Room_Top_Level**, **Timestamp_Pair**, **Audio_Clock**, **User_Gesture**, **Headphone_Check**, **Calibration_Controller**: as in the audio-output spec.
- **Threshold_Search**, **Sound_Trial**, **No_Sound_Trial**, **Response**, **Catch**, **Wrong_Side**, **Miss**, **False_Alarm**, **No_Response**, **Room_Result**, **Ear_Result**, **Room_Trial_Limit**: as in the threshold-search spec.
- **Page_Clock**: the clock of the injected Timer. On the page it is `performance.now()`, the clock of DOM event time stamps.
- **Room_Attempt**: one run of a Threshold_Search for a Room. A Room normally has one. A device change during a Room starts a second (D12).
- **Search_Cap**: `roomSearchCapDb(Room_Top_Level, hearingMethodConfig)` for the Room's sound at the kept calibration.
- **Presentation_Time**: for a Sound_Trial, the moment the Visit_Flow asks the Output_Shell to play it; for a No_Sound_Trial, the moment it would have asked. Both come when the trial's gap has passed.
- **Played**: a trial is Played once its Presentation_Time has passed and, for a Sound_Trial, the Output_Shell has scheduled it.
- **Window_Start**: for a Sound_Trial, the Output_Shell's start time converted to the Page_Clock with the Timestamp_Pair; for a No_Sound_Trial, the moment a sound asked for at its Presentation_Time would have started (D4).
- **Response_Window**: the half-open interval from Window_Start to Window_Start plus `responseWindowMs`.
- **Answer**: a call of `answer(side, pressedAtMs)` with `side` `left` or `right`. Its **Answer_Time** is `pressedAtMs`, or the Page_Clock's time when that is missing or unusable.
- **Scoring**: giving the Threshold_Search the Response of a trial. A trial is **Scored** at the first Answer whose Answer_Time lies in its Response_Window, or with `none` when the Response_Window ends without one.
- **Ignored_Answer**: an Answer in the `room` Stage, while not paused, that scores no trial.
- **Pause**: the state in which the Visit_Flow waits for `resume`. Its reasons are `visitor`, `hidden`, `interrupted` and `deviceChanged`.
- **Discarded_Trial**: a Played trial that was not Scored because a Pause began or its Room_Attempt was abandoned.
- **Visit_Log**: the record of one Visit defined in the Contract_File: rooms, calibrations, Room_Attempts, every Played trial in order, Ignored_Answers, Pauses and refused plays.
- **Visit_Summary**: the per-room and per-visit results computed from the Visit_Log for the result Stage.
- **Pooled_Counts**: the numbers of No_Sound_Trials and False_Alarms summed over the Room_Results of every finished Room_Attempt of a Visit.
- **Visit_False_Alarm_Rule**: the rule of R17 that marks a whole Visit unreliable from its Pooled_Counts.
- **Visit_Limit**: `visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction`, the limit of the Visit_False_Alarm_Rule. Proposed by this spec and decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it (Q1).
- **Room_Limit**: `hearingMethodConfig.falseAlarmRateUnreliableAboveFraction`, the existing per-room limit (0.3).
- **Simulated_Visitor**: a test-only driver in `tests/listeners/` that plays a Visit through the Visit_Flow, answering trials with a Simulated_Listener and pressing through the other Stages.
- **Visit_Harness**: the test-only code in `tests/properties/` that builds a Visit_Flow on the Fake_Audio_Backend and the manual timer and moves both clocks together.
- **Property_Suite**: the property tests of this spec under `tests/properties/`.

## Requirements

### Requirement 1: The interface contract comes first

**User story:** As the person building the interface by hand, I want every type I may call and read in one small file before any behaviour exists, so that I can build the screens while the flow is being written.

#### Acceptance criteria

1. THE Contract_File SHALL hold, as TypeScript types: the options for creating a Visit_Flow, the Visit_Flow's methods, the Snapshot of every Stage, every Visit_Event, the Visit_Log and the Visit_Summary, exactly as the section "Interface contract" of `design.md` gives them.
2. THE Contract_File SHALL contain types only and no statement that runs, and SHALL be the first file this spec's tasks write.
3. THE Contract_File SHALL import only types, and only from `src/config/`, `src/engine/`, `src/audio/output/` and `src/session/`, so that `src/ui` can read every type it needs through `src/session` alone.
4. THE Visit_Flow SHALL offer `src/ui` nothing beyond the Contract_File and the function `createVisitFlow`.
5. WHEN a later spec needs more from the contract, THE change SHALL add fields, Stages, Visit_Event kinds or methods, and SHALL neither remove nor rename nor change the meaning of anything already in the Contract_File (D1).
6. THE Contract_File SHALL re-export, not copy, the types it shares with the engine, the output stage and `judge-headphone-check.ts`, and its type-level tests SHALL check that `LoggedEarResult` is the engine's `EarResult` and `LoggedRoomResult` is the engine's `RoomResult` without `trials`.

### Requirement 2: Creating and entering a visit

**User story:** As the visitor, I want to choose the quick or the full visit at the front door and have sound start only because I pressed something.

#### Acceptance criteria

1. WHEN `createVisitFlow` is called with a window, a Timer and a seed, THE Visit_Flow SHALL build one Web Audio backend from the window and one Output_Shell, create no `AudioContext`, play nothing, and show the `entry` Stage.
2. IF the seed is not an integer from 0 to 2³² − 1, THEN `createVisitFlow` SHALL throw a `RangeError`.
3. WHILE the Stage is `entry`, THE Snapshot SHALL list the two Visit_Types with their numbers of Rooms.
4. WHEN `chooseVisit` is called in the `entry` Stage, THE Visit_Flow SHALL start a Visit of that Visit_Type, call the Output_Shell's `activate` before it returns, and show the `calibration` Stage.
5. THE Visit_Flow SHALL call `activate` only inside an action of the Visit_Flow, synchronously, before anything is awaited, so that an action called from a User_Gesture keeps the gesture (audio-output D23).
6. IF `activate` is refused because no gesture was active, THEN THE Snapshot SHALL say so, and the next action that needs sound SHALL call `activate` again.
7. THE Visit_Flow SHALL give the rooms of a Visit in the order of `hearingMethodConfig.roomFrequenciesHz` for its Visit_Type, each named by the Ghost_Sound whose centre frequency in `ghostSoundConfig` equals the room's pitch.

### Requirement 3: The order of the stages

**User story:** As the visitor, I want the house to know how loud my headphones are and which side is left before the first ghost sound, so that what the house finds means something.

#### Acceptance criteria

1. THE Visit_Flow SHALL pass through the Stages in the order `entry`, `calibration`, `headphoneCheck`, `rules`, then for each Room `room`, with `betweenRooms` between two Rooms, then `missedSoundReplay`, then `result`.
2. THE Visit_Flow SHALL play no Ghost_Sound before a calibration is kept and the Headphone_Check has been answered `left` in the same Visit.
3. THE Visit_Flow SHALL show the `rules` Stage once per Visit, before the first Room.
4. WHERE a last door is added to the full Visit by a later spec, THE Visit_Flow SHALL place it between the last Room and `missedSoundReplay` (D22).
5. WHEN `proceed` is called in a Stage whose Snapshot says it may go on, THE Visit_Flow SHALL show the next Stage. In every other case `proceed` SHALL do nothing.
6. IF an action is called in a Stage that does not accept it, THEN THE Visit_Flow SHALL ignore it and leave its state and the Visit_Log unchanged.

### Requirement 4: Calibration

**User story:** As the visitor, I want to match the hiss to my hands as the output stage designed it, so that every level in the house is relative to that match.

#### Acceptance criteria

1. WHEN `startCalibration` is called in the `calibration` Stage, THE Visit_Flow SHALL make sure the Output_Shell is running and open the Calibration_Controller, which begins a new calibration at the bottom of the control.
2. WHEN `louder` or `quieter` is called in the `calibration` Stage, THE Visit_Flow SHALL pass it to the Calibration_Controller.
3. WHEN `keepCalibration` is called and the Output_Shell keeps the setting, THE Visit_Flow SHALL record the kept setting and every Ghost_Sound's Room_Top_Level in the Visit_Log and show the `headphoneCheck` Stage.
4. IF the Output_Shell refuses to keep the setting, THEN THE Snapshot SHALL give the reason and the Calibration_Controller's line, and the Stage SHALL stay `calibration`.
5. THE `calibration` Snapshot SHALL give the setting last played, the bottom and the top of the control, whether the setting is at the top, the line to show, and whether this is a calibration after a device change.

### Requirement 5: The headphone check

**User story:** As the visitor, I want to make sure left is left before the rooms start.

#### Acceptance criteria

1. WHEN `playHeadphoneCheck` is called in the `headphoneCheck` Stage, THE Visit_Flow SHALL make sure the Output_Shell is running and call `playHeadphoneCheck` on it.
2. WHEN `answerHeadphoneCheck` is called after a check was played and not yet answered, THE Visit_Flow SHALL judge the answer with `judgeHeadphoneCheck`, give the judgement and its line from `headphoneCheckCopy` in the Snapshot, and record the judgement in the Visit_Log.
3. IF `answerHeadphoneCheck` is called when no check has been played since the last answer, THEN THE Visit_Flow SHALL ignore it.
4. THE Visit_Flow SHALL let the visitor go on from the `headphoneCheck` Stage only after the judgement `correct`.
5. THE `headphoneCheck` Snapshot SHALL give the line of R16.9 of the audio-output spec, built by `roomsShortLine` over the Rooms of the Visit.

### Requirement 6: Starting a room

**User story:** As the author of the output stage, I want each room to start the way the output stage requires, so that no trial is ever clamped and every room starts afresh.

#### Acceptance criteria

1. WHEN a Room_Attempt starts, THE Visit_Flow SHALL call the Output_Shell's `beginRoom` before the Room_Attempt's first trial.
2. WHEN a Room_Attempt starts, THE Visit_Flow SHALL create a Threshold_Search with `hearingMethodConfig`, whose `capRelativeToAnchorDb` is replaced by the Search_Cap of the Room, and with a `RandomSource` made from a seed drawn for this Room_Attempt (D19).
3. THE Visit_Flow SHALL record each Room_Attempt in the Visit_Log with its Room, its number, its engine seed, its Search_Cap, the calibration it used and its start and end times.
4. WHEN a Room_Attempt starts, THE Visit_Flow SHALL show the `room` Stage and hand a `roomStarted` Visit_Event to its listeners.
5. IF no calibration is kept when a Room_Attempt is due, THEN THE Visit_Flow SHALL show the `calibration` Stage first, and start the Room_Attempt only after a new calibration is kept and the Headphone_Check is answered `left` (D12).

### Requirement 7: Running a trial

**User story:** As the visitor, I want each sound to come after the pause the house chose, and my answer to count against the moment the sound really started.

#### Acceptance criteria

1. WHILE a Room_Attempt runs and no Pause holds, THE Visit_Flow SHALL take the current trial from the Threshold_Search and wait its `gapBeforeMs` on the Timer, from the moment the previous trial was Scored, or from the start or resumption of the Room_Attempt.
2. WHEN the gap of a Sound_Trial has passed, THE Visit_Flow SHALL call the Output_Shell's `play` with the Room's Ghost_Sound, the trial's Ear, the trial's level and the Purpose `trial`.
3. WHEN the Output_Shell schedules a Sound_Trial, THE Visit_Flow SHALL set its Window_Start to the scheduled start converted from the Audio_Clock to the Page_Clock with the Timestamp_Pair, or, where no Timestamp_Pair exists, to the Presentation_Time plus `scheduleLeadMs`.
4. WHEN the gap of a No_Sound_Trial has passed, THE Visit_Flow SHALL play nothing and set its Window_Start to the Presentation_Time plus `scheduleLeadMs` plus the latest difference measured in this Visit between a Sound_Trial's Window_Start and its Presentation_Time plus `scheduleLeadMs` (D4).
5. THE Visit_Flow SHALL never set a Window_Start earlier than the Presentation_Time.
6. WHEN an Answer's Answer_Time lies in the Response_Window of the trial waiting to be Scored, and it is the first such Answer, THE Visit_Flow SHALL Score the trial with the Answer's side at once.
7. WHEN a Response_Window ends without such an Answer, THE Visit_Flow SHALL Score the trial with `none`.
8. IF `pressedAtMs` is missing, not finite, or later than the Timer's time, THEN THE Visit_Flow SHALL use the Timer's time as the Answer_Time.
9. THE Visit_Flow SHALL give the Threshold_Search exactly one Response for each Scored trial, and nothing for a Discarded_Trial.
10. WHEN the Threshold_Search finishes, THE Visit_Flow SHALL end the Room_Attempt, record its end time, and hand a `roomFinished` Visit_Event to its listeners.
11. THE Visit_Flow SHALL schedule nothing on the Output_Shell between the Presentation_Time of a No_Sound_Trial and its Scoring, so that both channels carry exact digital zero for the whole trial (audio-safety rule 5).

### Requirement 8: Answers outside any window

**User story:** As the project owner, I want presses outside any response window counted, so that constant pressing can be seen.

#### Acceptance criteria

1. WHEN an Answer in the `room` Stage, while no Pause holds, Scores no trial, THE Visit_Flow SHALL count it as an Ignored_Answer and record its time, its side and its Room in the Visit_Log.
2. THE Visit_Flow SHALL give the Threshold_Search nothing for an Ignored_Answer.
3. THE Visit_Flow SHALL release nothing about an Ignored_Answer before the Visit_Summary: no Visit_Event, no change of the Snapshot and no notification of subscribers.
4. THE `answer` method SHALL return nothing.
5. WHEN an Answer comes in any Stage other than `room`, or while a Pause holds, THE Visit_Flow SHALL ignore it without counting it.

### Requirement 9: The scored-trial event

**User story:** As the visitor, I want a ripple when I catch a sound and the house's line when I answered a silence, and nothing else until the replay.

#### Acceptance criteria

1. WHEN a trial is Scored, THE Visit_Flow SHALL hand a `trialScored` Visit_Event to its listeners in the same Timer callback or action, holding the trial's Visit_Log entry and its Reaction.
2. THE Reaction SHALL be `ripple` for a Catch, `noSoundLine` for a False_Alarm, and `none` for a Miss, a Wrong_Side and a No_Response.
3. THE Contract_File SHALL state, where the Reaction is defined, that `noSoundLine` means the house says "I made no sound that time.", as `wording.md` fixes the line.
4. THE Visit_Flow SHALL hand no Visit_Event that names a trial's Ear, level, kind or time before that trial is Scored.
5. THE Visit_Flow SHALL hand no Visit_Event for a Discarded_Trial.

### Requirement 10: The visit log

**User story:** As the author of the replay, the result page and the no-headphone replay, I want one record of every trial that was played, so that every later screen is drawn from the same record.

#### Acceptance criteria

1. THE Visit_Log SHALL hold every Played trial of the Visit exactly once, in the order of their Presentation_Times, and no other trial.
2. THE Visit_Log SHALL give each trial: its order in the Visit from 1, its Room, its Room_Attempt, its trial number in the Room_Attempt, its kind, its Ear or none, the level the Threshold_Search asked for, the level the Output_Shell played and its clamp limit, its gap, its Window_Start, and either its Response, its time to answer and its Outcome, or that it was discarded and when.
3. THE Visit_Log SHALL record the level the Output_Shell reported as played, not the level the Threshold_Search asked for, as `playedLevelDb` (audio-output, "What the visit-flow spec must do").
4. THE time to answer SHALL be the Answer_Time minus the Window_Start for an answered trial, and none for an unanswered one.
5. THE Visit_Log SHALL give every time in milliseconds on the Page_Clock since the Visit began.
6. THE Visit_Log SHALL also hold the Visit_Type, the visit seed, the Rooms, every kept calibration with its Room_Top_Levels, every Room_Attempt, every Headphone_Check judgement, every Ignored_Answer, every Pause with its reason and times, and every play the Output_Shell refused.
7. THE Visit_Log SHALL be a frozen object made of plain data that survives `JSON.stringify` and `JSON.parse` unchanged.

### Requirement 11: Snapshots and the event stream

**User story:** As the visitor, I want nothing on the screen to give away when a sound plays or on which side, before I answer.

#### Acceptance criteria

1. THE Visit_Flow SHALL offer `snapshot()`, `subscribe(listener)` for Snapshots and `onEvent(listener)` for Visit_Events, each subscription returning the function that ends it.
2. THE `room` Snapshot SHALL hold no field that depends on the current trial: not its kind, Ear, level, Presentation_Time, Window_Start, nor the number of trials played or Scored.
3. WHILE a trial waits to be Scored, THE Visit_Flow SHALL neither change the Snapshot nor notify subscribers nor hand out a Visit_Event, except in an action of the visitor or after the Output_Shell reports a stop.
4. THE Visit_Flow SHALL notify subscribers only when the Snapshot has changed.
5. WHEN one change produces Visit_Events and a new Snapshot, THE Visit_Flow SHALL hand out the Visit_Events first and then notify subscribers.
6. THE Snapshot, every Visit_Event and the Visit_Log SHALL be frozen.
7. IF a listener throws, THEN THE Visit_Flow SHALL still call every other listener and SHALL keep its own state unchanged by the error.

### Requirement 12: Pause and resume

**User story:** As the visitor, I want to be able to stop and take a breath, and I want a hidden tab to pause the house rather than spoil a trial.

#### Acceptance criteria

1. WHEN `pause` is called in the `room` Stage while no Pause holds, THE Visit_Flow SHALL begin a Pause with the reason `visitor` and stop all sound through the Output_Shell.
2. WHEN the Output_Shell reports a stop with the reason `hidden` or `interrupted` in any Stage from `calibration` to `betweenRooms`, THE Visit_Flow SHALL begin a Pause with that reason.
3. WHEN a Pause begins while a trial is Played and not Scored, THE Visit_Flow SHALL make it a Discarded_Trial: record it in the Visit_Log as discarded, give the Threshold_Search nothing, and cancel its Response_Window.
4. WHEN a Pause begins before a trial's Presentation_Time, THE Visit_Flow SHALL cancel the gap and record nothing about that trial.
5. WHILE a Pause holds, THE Visit_Flow SHALL play nothing and accept only `resume` and `stop`.
6. WHEN `resume` is called while a Pause holds, THE Visit_Flow SHALL call `activate` within the call, and, once the Output_Shell runs, end the Pause.
7. WHEN a Pause ends in the `room` Stage with a calibration still kept, THE Visit_Flow SHALL present the same waiting trial of the Threshold_Search again, after its own gap, so that a Discarded_Trial is repeated later (D9).
8. WHILE the Stage is `betweenRooms`, THE Visit_Flow SHALL wait for `proceed` before the next Room, so that the visitor can rest between rooms for as long as they like.

### Requirement 13: A change of audio device

**User story:** As the visitor, I want the house to match the hiss again if my headphones change, so that its limits still mean what they say.

#### Acceptance criteria

1. WHEN the Output_Shell reports a stop with the reason `deviceChanged` in any Stage from `calibration` to `betweenRooms`, THE Visit_Flow SHALL begin a Pause with the reason `deviceChanged`, or change the reason of a Pause that holds to `deviceChanged`.
2. WHEN that Pause ends, THE Visit_Flow SHALL show the `calibration` Stage, marked as a calibration after a device change, and then the `headphoneCheck` Stage, before any further Ghost_Sound (audio-output, "What the visit-flow spec must do").
3. WHEN a device change comes during a Room_Attempt, THE Visit_Flow SHALL mark that Room_Attempt abandoned in the Visit_Log and, after the new calibration and Headphone_Check, start a new Room_Attempt of the same Room with a new engine seed and the Search_Cap of the new calibration (D12).
4. THE Visit_Flow SHALL keep the Room_Results of Room_Attempts that finished before the device change.
5. THE Visit_Flow SHALL not show the `rules` Stage again after a device change.

### Requirement 14: Stopping and leaving

**User story:** As the visitor, I want one control that silences the house at once and lets me leave, with nothing left behind.

#### Acceptance criteria

1. WHEN `stop` is called in any Stage from `calibration` to `betweenRooms`, THE Visit_Flow SHALL call the Output_Shell's `stopAll`, cancel every pending Timer callback of the Visit, show the `exit` Stage with the reason `visitor`, and drop the Visit_Log.
2. WHEN `stop` is called in the `missedSoundReplay` Stage, THE Visit_Flow SHALL call `stopAll` and show the `result` Stage.
3. WHEN `stop` is called in the `result` or `swappedRepeat` Stage, THE Visit_Flow SHALL call `stopAll`; from `swappedRepeat` it SHALL show the `result` Stage.
4. WHEN the Output_Shell reports a stop with the reason `pageLeft` in any Stage from `calibration` to `betweenRooms`, THE Visit_Flow SHALL show the `exit` Stage with the reason `pageLeft` and drop the Visit_Log.
5. THE `exit` Snapshot SHALL hold no Visit_Log, no Visit_Summary and no part of a result.
6. WHEN `backToFrontDoor` is called in the `exit` or `result` Stage, THE Visit_Flow SHALL drop the Visit and show the `entry` Stage, keeping its one Output_Shell (D14).
7. WHEN `stop` or a left page has ended a Visit before the `result` Stage, THE Visit_Flow SHALL schedule nothing on the Output_Shell and hand out nothing until a new Visit starts.

### Requirement 15: Devices that cannot carry the house

**User story:** As the visitor, I want to be told plainly when my device cannot play the house.

#### Acceptance criteria

1. WHEN `activate` reports that the device is unsupported, or the Output_Shell reports an unsupported device, THE Visit_Flow SHALL show the `unsupported` Stage with the reason and the sample rate, and accept no further action.
2. THE `unsupported` Snapshot SHALL give the reason as the Output_Shell names it, so that the interface can show the matching line of `outputStateCopy.unsupportedLines`.
3. WHERE a Snapshot reports a Pause or an exit caused by the Output_Shell, THE Snapshot SHALL give its reason as a code, so that the interface can show the matching line from `src/copy`.

### Requirement 16: Reaching the replay, the result and the swapped repeat

**User story:** As the authors of the replay, result page and swapped repeat specs, I want the flow to reach our stages and hand us the visit log, so that we only add our own behaviour.

#### Acceptance criteria

1. WHEN the last Room_Attempt of a Visit finishes, THE Visit_Flow SHALL call the Output_Shell's `beginRoom` and show the `missedSoundReplay` Stage with the Visit_Log.
2. THE Visit_Flow SHALL play every sound of the `missedSoundReplay` Stage with the Purpose `replay`. This spec plays none there, and the missed-sound replay spec adds them (D21).
3. WHEN `proceed` is called in the `missedSoundReplay` Stage, THE Visit_Flow SHALL show the `result` Stage with the Visit_Log and the Visit_Summary.
4. WHEN `chooseSwappedRepeat(roomIndex)` is called in the `result` Stage for a Room whose Visit_Summary offers the swapped repeat, THE Visit_Flow SHALL show the `swappedRepeat` Stage for that Room with the Visit_Log and the Visit_Summary.
5. WHEN `proceed` is called in the `swappedRepeat` Stage, THE Visit_Flow SHALL show the `result` Stage again.

### Requirement 17: The visit-level false alarm rule

**User story:** As the project owner, I want false alarms counted over the whole visit, so that a visitor who presses on a little under 30 percent of silent trials is not given numbers far below what they heard.

#### Acceptance criteria

1. THE Visit_Flow SHALL compute the Pooled_Counts over the Room_Results of the finished Room_Attempts of a Visit, and the pooled false alarm rate as the pooled False_Alarms divided by the pooled No_Sound_Trials, or 0 when there is none.
2. IF the pooled false alarm rate is above the Visit_Limit, judged with `atMostFraction` so that a rate exactly at the limit is not above it, THEN THE Visit_Summary SHALL mark the whole Visit unreliable.
3. WHEN the whole Visit is marked unreliable, THE Visit_Summary SHALL give every Ear of every Room the state `unreliable`, with the reason `visitFalseAlarmRate` after any reasons the Threshold_Search gave, and SHALL offer no swapped repeat.
4. THE Visit_False_Alarm_Rule SHALL never remove a state `unreliable` or a reason that the Threshold_Search gave.
5. THE Visit_False_Alarm_Rule SHALL leave the per-room rule of the Threshold_Search and the Room_Limit unchanged.
6. THE Visit_False_Alarm_Rule SHALL be one pure function in `src/session/` that the Visit_Flow and the measurement of R23 both call.
7. THE Visit_Limit SHALL be a field of `visitFlowConfig` with the value 0.2, whose comment says that it was decided by the owner's coordinator on 2026-11-16, at the owner's request (Q1), and SHALL be described so wherever this spec mentions it.

### Requirement 18: The visit summary

**User story:** As the author of the result page, I want each floor's result in one place, with the visit-level rule already applied, so that the picture cannot disagree with the record.

#### Acceptance criteria

1. THE Visit_Summary SHALL give, for each Room of the Visit in order, the Ear_Result of each Ear after the Visit_False_Alarm_Rule, the Room's counts of No_Sound_Trials and False_Alarms, its Search_Cap, the right-minus-left difference when both Ears are `found`, and whether the swapped repeat is offered.
2. THE Visit_Summary SHALL offer the swapped repeat for a Room exactly when both Ears are `found` and the absolute difference is at least `hearingMethodConfig.swappedRepeatDifferenceDb`.
3. IF a Scored trial of a Room has a played level different from the level the Threshold_Search asked for, THEN THE Visit_Summary SHALL give both Ears of that Room the state `unreliable` with the reason `levelNotAsAsked` (D23).
4. THE Visit_Summary SHALL give the Pooled_Counts, the pooled false alarm rate, whether it is above the Visit_Limit, and the number of Ignored_Answers.
5. THE Visit_Summary SHALL be a pure function of the Visit_Log, and SHALL compare no Room with another.

### Requirement 19: Time and randomness

**User story:** As the author of the tests, I want a whole visit to run instantly and the same way every time, so that a failing visit can be replayed.

#### Acceptance criteria

1. THE Visit_Flow SHALL read time and wait only through the injected Timer, and SHALL not read the clock or call timer functions itself, as the lint rules for `src/session` require.
2. THE Visit_Flow SHALL take every random number from sources made from the seed it was created with (D19).
3. WHEN two Visit_Flows are created with the same seed on equal Fake_Audio_Backends and manual timers, and are given the same actions at the same times, THE Visit_Flows SHALL produce equal Visit_Logs, equal Snapshots and equal Visit_Events.
4. THE Visit_Flow SHALL run under Node in Vitest with the Fake_Audio_Backend in place of the window.

### Requirement 20: Config

**User story:** As the person who tunes the numbers, I want every new number of the flow in config, so that no rule hides a constant in the session.

#### Acceptance criteria

1. THE file `src/config/visit-flow-config.ts` SHALL hold `visitFlowConfig` with `visitFalseAlarmRateUnreliableAboveFraction` (0.2, Q1) and `refusedPlaysInARowMaxCount` (3), each with a comment naming its decision, deeply frozen, every field name ending in its unit.
2. THE config unit test SHALL check the values, the unit endings, that the Visit_Limit lies above 0 and at most the Room_Limit, and that `refusedPlaysInARowMaxCount` is a positive integer.
3. THE `hearingMethodConfig`, `audioOutputConfig` and `audioSafetyConfig` SHALL stay unchanged.
4. THE `src/session` code of this spec SHALL contain no number that affects a level, a time or a result other than values read from `src/config`, apart from 0 and 1.

### Requirement 21: Refused plays

**User story:** As the visitor, I want a sound the output stage would not play to be tried again or the visit to end plainly, never a trial scored against a sound that was not played.

#### Acceptance criteria

1. IF the Output_Shell refuses a Sound_Trial for a reason other than `notRunning`, THEN THE Visit_Flow SHALL record the refusal in the Visit_Log, Score nothing, and present the same trial again after its own gap.
2. IF the Output_Shell refuses the same trial `refusedPlaysInARowMaxCount` times in a row, THEN THE Visit_Flow SHALL stop all sound and show the `exit` Stage with the reason `soundRefused`.
3. IF the Output_Shell refuses a Sound_Trial with `notRunning`, THEN THE Visit_Flow SHALL begin a Pause with the reason of the Output_Shell's state, or `interrupted` if it gives none.

### Requirement 22: Simulated visits and properties

**User story:** As the project owner, I want quick and full visits run end to end in the test suite with a fake timer, for listeners who behave well and listeners who do not, so that the flow is known to finish and to keep its record straight.

#### Acceptance criteria

1. THE Visit_Harness SHALL build a Visit_Flow on the Fake_Audio_Backend and the manual timer, move the Audio_Clock and the Page_Clock together, and replace the synth's render functions with the worst-case renderers of the audio-output spec (D26).
2. THE Simulated_Visitor SHALL play a Visit with any Simulated_Listener of `tests/listeners/`, answer each trial after a delay drawn from a seeded source, and press through calibration, the Headphone_Check and every other Stage.
3. THE test suite SHALL run a quick Visit and a full Visit to the `result` Stage with Psychometric_Listeners from the Attentive_Range and the Plausible_Range and with each of the Extreme_Listeners.
4. THE Property_Suite SHALL check that for any sequence of answers, any timing, any pauses and any stops from the Output_Shell, a Visit ends, and the Visit_Log holds exactly the trials that were Played, in order (brief property 1).
5. THE Property_Suite SHALL check that no Visit_Event that identifies a trial's Ear or level is released before that trial is Scored (brief property 2).
6. THE Property_Suite SHALL check the further properties of the Correctness properties section of `design.md`, with a new random fast-check seed on every run for the universal ones and fixed seeds for the statistical one.
7. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression test in `tests/properties/visit-flow-regressions.test.ts`, and the fix SHALL go in a separate commit.

### Requirement 23: Measuring the visit-level rule

**User story:** As the project owner, I want to see what the visit-level rule removes and what it costs at each candidate limit, so that I can choose its limit.

#### Acceptance criteria

1. THE measurement SHALL play whole quick and full Visits, Room by Room, with the Threshold_Search and the Psychometric_Listeners of `tests/listeners/`, with fixed seeds, and judge each Ear with `classifyAccuracy`.
2. THE measurement SHALL report, for the limits 0.30, 0.25, 0.20 and 0.15 and for no visit rule: for the listener of regression 4 of the threshold-search spec and for the listener set of its D43, the shares of Ears that are Accurate, Flagged and Wrong and the share of Visits marked; and for the Attentive_Range and the Plausible_Range, the share of Visits marked, by the listener's false alarm rate in steps of 0.05.
3. THE measurement SHALL be a script under `tests/listeners/` that prints its table and writes no file.
4. THE Property_Suite SHALL hold one statistical property, with fixed seeds, that checks at the shipped Visit_Limit the removal and the cost stated in `design.md` (CP11).
5. WHEN the measurement runs, THE numbers SHALL be recorded in the Decisions section of `design.md`, and Q1 SHALL point to them.

### Requirement 24: Boundaries and documentation

**User story:** As someone reading the repository, I want to find where the visit flow lives and trust that it did not reach into the interface.

#### Acceptance criteria

1. THE tasks of this spec SHALL create or change no file under `src/ui/`, nor `index.html`, `listen.html` or `src/main.ts`.
2. THE tasks of this spec SHALL change no file under `src/copy/`, `src/engine/`, `src/audio/`, `src/storage/`, `.kiro/steering/` or `docs/briefs/`, nor `package.json` or anything under `tools/`.
3. THE Visit_Flow SHALL write nothing to local storage (D15).
4. THE READMEs of `src/session/`, `tests/listeners/` and `tests/properties/` SHALL describe the Visit_Flow, the Contract_File, the Simulated_Visitor, the Visit_Harness and the measurement script.
5. THE documentation and commit messages of this spec SHALL follow `.kiro/steering/wording.md`.

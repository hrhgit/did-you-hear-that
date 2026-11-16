# Requirements: swapped repeat

## Introduction

This spec fills the stage `swappedRepeat`, which the visit flow already reaches from the result with `chooseSwappedRepeat(roomIndex)` and leaves empty (visit-flow D24). On a floor whose left and right were far apart, the house asks the visitor to put the left earpiece on the right ear and the right earpiece on the left, checks the swap with a hiss in one earpiece, runs the room again with the engine exactly as before and the same calibration, and says whether the difference stayed with the ear or moved with the earpiece. It adds the course of the repeat as phases of the stage, a record of each repeat beside the visit log that names the earpiece of every sound and every answer, a pure function that gives the outcome, the repeat on the result picture next to the first run of that floor, the repeat in a saved visit, the config of the repeat (`src/config`), every string of the repeat (`src/copy`), the brief's property "Correct attribution" and the properties the design needs, and what `tests/listeners` needs for them.

The screen is built by hand by the project owner, outside this spec's tasks: everything under `src/ui/`, every CSS and HTML file, `src/main.ts`, `tests/e2e/` and `tests/properties/screen-leak/`. The owner builds it against the additions this spec makes to `src/session/visit-flow-types.ts` and `src/session/result-page-types.ts`, which `design.md` gives in full in "Interface contract". Every moment of the repeat carries every string and number the screen shows, so the screen computes and words nothing. "What the owner builds" in `design.md` lists what the owner's screen has to do and which of the owner's files stop compiling when the contract grows. The line of the brief's "Done when" about a real visit is the owner's to meet, and no task here claims it.

The input is `docs/briefs/08-swapped-repeat.md`; the steering files in `.kiro/steering/`; `docs/architecture.md` and `docs/roadmap.md`; the specs under `.kiro/specs/visit-flow/`, `.kiro/specs/result-page/`, `.kiro/specs/missed-sound-replay/`, `.kiro/specs/audio-output/` and `.kiro/specs/threshold-search/`; and the code, above all `src/session/create-visit-flow.ts`, `visit-flow-types.ts`, `summarize-visit.ts`, `result-picture.ts`, `result-page-types.ts`, `saved-visit-payload.ts`, `create-visit-archive.ts`, `judge-headphone-check.ts`, `room-runner.ts`, `visit-log-recorder.ts`, `create-missed-sound-replay.ts` and `src/audio/output/create-audio-output.ts`. Open points that are this spec's to settle are settled in the Decisions section of `design.md` (D1, D2 and so on). Every new number, and every choice that belongs to the owner, is a question for the project owner (Q1 to Q11) in the same document. Q1, Q4 and Q5 were decided by the owner on 2026-11-15, each with option (a), and are marked "Decided by the owner on 2026-11-15" where they appear. Q8 and the sub-question of Q5 (whether the page compares the saved copy with the live result) were chosen by the owner's coordinator on 2026-11-15, and the owner may reverse them. Q2, Q3, Q6, Q7, Q9 and Q10 are not decided: the values the design uses for them are proposals and are marked PROPOSED, NOT APPROVED wherever they appear. Q11 was added before task 11 and is not decided either: the swap check's hiss is capped by the output stage's rise limit, so it may play lower than asked; the alternative is to begin the room before the hiss, at a cost to audio safety. Its proposal, to leave the hiss as it is, is PROPOSED, NOT APPROVED.

Out of scope: drawing, layout, input handling and the browser tests (the owner's); any correction of a result for headphone imbalance (brief, "Out of scope"); the no-headphone replay (brief 09); the last door (brief 11); the robot module (brief 10). "What this spec leaves to other specs" in `design.md` says what each of them inherits.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Visit_Flow**, **Visit_Log**, **Visit_Summary**, **Room_Summary**, **Room_Attempt**, **Snapshot**, **Visit_Event**, **Pause**, **Timer**, **Output_Shell**, **Room_Runner**: as in the visit-flow spec.
- **Result_Picture**, **Picture_Floor**, **Saved_Visit**, **Payload**, **Visit_Archive**, **Visit_Store**, **Limits_Statement**: as in the result-page spec.
- **Contract_File**: `src/session/visit-flow-types.ts`. This spec only adds to it (visit-flow D1).
- **Result_Contract_File**: `src/session/result-page-types.ts`. This spec only adds to it (result-page D1).
- **Repeat_Stage**: the Stage `swappedRepeat` of the Visit_Flow.
- **Screen**: what the project owner builds by hand in `src/ui`. It imports only `src/session`, `src/copy` and `src/config`.
- **Floor**: the room of the visit that the repeat runs again, given by `roomIndex`.
- **First_Run**: the Floor's Room_Summary in the Visit_Summary, made from the Floor's last finished Room_Attempt of the Visit_Log.
- **Ear**: the visitor's own left or right ear. The side the visitor names in an answer is an Ear.
- **Earpiece**: the left or right channel of the headphones, as the Output_Shell names it in `play`. The output stage's `ear` field names an Earpiece.
- **Earpiece_On_Ear**: for each Ear, the Earpiece on it. As marked: each Earpiece on its own Ear. Swapped: the left Earpiece on the right Ear and the right Earpiece on the left Ear.
- **Earpiece_State**: what the Visit_Flow knows of the Earpiece_On_Ear now: `asMarked` (the visit's headphone check was answered `correct` and no repeat has begun since), `swapped` (a Swap_Check was confirmed in the Repeat_Run under way) or `unknown` (anything else).
- **Swap_Instruction**: the lines that tell the visitor to swap the earpieces, in the phase `instruction`.
- **Swap_Check**: the hiss the output stage's `playHeadphoneCheck` plays in the left Earpiece, and the visitor's answer to "Which side was the hiss on?".
- **Swap_Check_Judgement**: `confirmed` (the answer `right`), `notSwapped` (`left`), `bothSides` or `notHeard`.
- **Sound_Press**: one of the visitor's presses that may start sound in the Repeat_Stage: `playSwapCheck`, `startSwappedRoom` and `resume`.
- **Repeat_Run**: one run of the Floor's search in the Repeat_Stage, from `startSwappedRoom` to its end.
- **Run_Number**: the position of a Repeat_Run among the Repeat_Runs begun in the visit, from 1.
- **Repeat_Record**: a `SwappedRepeatRun` of the Contract_File: the frozen record of one Repeat_Run that ran to its end.
- **Repeat_Controller**: the session object that runs one visit to the Repeat_Stage: its phase, its Swap_Checks, its Repeat_Run and its view (`create-swapped-repeat.ts`).
- **Difference_Limit**: `hearingMethodConfig.swappedRepeatDifferenceDb`, 15 dB, from `hearing-method.md`.
- **Unclear_Below**: the Difference_Limit times `swappedRepeatConfig.unclearBelowLimitFraction`, which is 0.5, from the brief ("half the limit").
- **First_Difference**: the First_Run's right threshold minus its left threshold, by Ear.
- **Repeat_Difference**: the Repeat_Record's right threshold minus its left threshold, by Ear, when both Ears are `found`.
- **Outcome**: `followsEar`, `followsEarpiece` or `unclear`, as `swappedRepeatOutcome` gives it.
- **Comparison**: a `SwappedRepeatComparison` of the Contract_File: the First_Run and the Repeat_Record side by side, in words and numbers, with the Outcome.
- **Turn_Back_Line**: the line that asks the visitor to turn the headphones back.
- **Ear_Difference** (E): in a simulated listener, its true right threshold minus its true left threshold.
- **Headphone_Imbalance** (H): in simulated headphones, how much quieter the right Earpiece plays than the left, in dB.
- **Step_Listener**: a psychometric listener of `tests/listeners` with width 0 and no lapses, false alarms or wrong sides.
- **Worn_Headphones**: the model of `tests/listeners` that turns a sound on an Earpiece into a sound on an Ear, by the listener's own Earpiece_On_Ear and the Headphone_Imbalance.
- **Property_Suite**: the property tests of this spec under `tests/properties/`, named `swapped-repeat-cp<n>-*.property.test.ts`.

## Requirements

### Requirement 1: The contracts only grow

**User story:** As the project owner building the screen by hand, I want the repeat's fields added to the contracts I already build against, with nothing in them renamed or changed, so that the screens I have keep working.

#### Acceptance criteria

1. THE Contract_File SHALL gain exactly the additions of "Interface contract" in `design.md`: the methods `confirmSwap`, `playSwapCheck`, `answerSwapCheck` and `startSwappedRoom` of `VisitFlow`; one added sentence in the comments of `answer` and `pause`; the field `repeat` of `SwappedRepeatSnapshot`; the fields `swappedRepeats` and `turnBackLine` of `ResultSnapshot`; the member `SwappedTrialScoredEvent` of `VisitEvent`; and the new types of the repeat.
2. THE Result_Contract_File SHALL gain exactly the additions of "Interface contract" in `design.md`: the optional field `swappedRepeats` of `VisitToSave`, the field `swappedRepeats` of `SavedVisit`, the field `repeat` of `PictureFloor`, the method `savedCopyLacksRepeats` of `VisitArchive` (chosen by the owner's coordinator on 2026-11-15; the owner may reverse it) and one added sentence in the comment of `VisitArchive.save` (Q5, decided by the owner on 2026-11-15).
3. THE additions SHALL remove, rename or change the meaning of nothing in either file, apart from what `VisitArchive.save` does for a visit whose saved copy lacks Repeat_Records, a case that did not exist before this spec and that Q5 decides. `VisitLog`, `VisitSummary`, `RoomSummary`, `SnapshotBase`, `VisitStage`, `PauseReason`, `TrialReaction`, `ScoredVisitTrial`, every replay type, `ResultPicture`, `PictureWing` and `SwappedRepeatOffer` SHALL stay as they are.
4. THE spec SHALL change nothing in `src/audio/output/` or in `src/engine/`.
5. THE design SHALL say, for each existing type, what is added and which code outside `src/session` builds or implements that type, and SHALL list the owner's files that stop compiling or stop passing when the contracts grow (Q8).
6. WHILE the tasks that play sound in the Repeat_Stage are not yet built, the four new methods SHALL do nothing, so that the Repeat_Stage plays no sound before its checks exist; and WHILE the task that saves Repeat_Records is not yet built, `savedCopyLacksRepeats` SHALL answer false.
7. THE type-level tests SHALL check that the copy's names for Ears, Earpieces, Swap_Check_Judgements, Outcomes, unclear reasons, endings, unavailable reasons and pause reasons equal the session's.

### Requirement 2: Numbers are in config, with their source

**User story:** As the project owner, I want every number of the repeat in one config file with its source, so that nothing is decided for me.

#### Acceptance criteria

1. THE file `src/config/swapped-repeat-config.ts` SHALL hold `swappedRepeatConfig` with `unclearBelowLimitFraction`, deeply frozen, with the value 0.5 and a comment naming brief 08 ("a difference that shrank below half the limit") as its source.
2. THE config test SHALL check the value, the unit ending `Fraction`, deep freezing, and that the value lies above 0 and below 1.
3. THE Repeat_Controller SHALL take the Difference_Limit from `hearingMethodConfig.swappedRepeatDifferenceDb`, the search's settings from `hearingMethodConfig`, the level of the Swap_Check from the output stage's `playHeadphoneCheck`, and the most refusals in a row of one sound from `visitFlowConfig.refusedPlaysInARowMaxCount`, and SHALL add no number of its own for any of them.
4. THE spec SHALL change no value of `hearingMethodConfig`, `audioSafetyConfig`, `audioOutputConfig`, `visitFlowConfig`, `resultPageConfig`, `missedSoundReplayConfig` or `rippleConfig`, and no steering file.
5. THE code of this spec in `src/session`, `src/storage` and `src/copy` SHALL contain no number that sets a level, a wait, a count or a limit other than values read from `src/config`, apart from 0 and 1.
6. WHERE the design uses a value the brief and the steering do not give, THE design SHALL mark it PROPOSED, NOT APPROVED and SHALL name the question that puts it to the owner.

### Requirement 3: Entering the repeat

**User story:** As the visitor, I want to be offered the repeat only where it can tell me something, and to be told plainly when it cannot run.

#### Acceptance criteria

1. WHEN `chooseSwappedRepeat(roomIndex)` is called in the `result` Stage for a Floor whose Room_Summary offers the swapped repeat and which has no Repeat_Record yet, THE Visit_Flow SHALL show the Repeat_Stage for that Floor (Q4, decided by the owner on 2026-11-15).
2. THE Visit_Flow SHALL ignore `chooseSwappedRepeat` for a Floor that already has a Repeat_Record (Q4, decided by the owner on 2026-11-15: a Floor may be repeated until one run of it ends with a Repeat_Record; other Floors that offer the repeat still offer it).
3. WHEN the Repeat_Stage is entered while the Output_Shell holds no calibration, THE Repeat_Stage SHALL be in the phase `unavailable` with the reason `calibrationGone` (D8, Q6).
4. WHEN the Repeat_Stage is entered while the Output_Shell's calibration is not the calibration of the First_Run's Room_Attempt, THE Repeat_Stage SHALL be in the phase `unavailable` with the reason `calibrationChanged` (D8, Q6).
5. WHEN the Repeat_Stage is entered and neither R3.3 nor R3.4 applies, THE Repeat_Stage SHALL be in the phase `instruction`, and the Earpiece_State SHALL become `unknown`.
6. WHILE the phase is `unavailable`, THE Visit_Flow SHALL play nothing and SHALL accept only `proceed` and `stop`, which show the `result` Stage.
7. THE Visit_Flow SHALL play nothing on entering the Repeat_Stage.

### Requirement 4: The instruction and the visitor's confirmation

**User story:** As the visitor, I want to be told exactly how to turn the headphones round, and to say when I have done it.

#### Acceptance criteria

1. WHILE the phase is `instruction`, THE view SHALL give the Swap_Instruction: the left earpiece on the right ear and the right earpiece on the left ear; the line that asks the visitor not to turn the volume up (audio-safety rule 8); and that a hiss in one earpiece will check the swap.
2. WHEN `confirmSwap` is called in the phase `instruction` while no Pause holds, THE Visit_Flow SHALL show the phase `check` and SHALL play nothing.
3. WHEN the phase `instruction` is shown again after a Swap_Check judged `notSwapped`, THE view SHALL also give the line that says the headphones are still the way they were and asks the visitor to swap them.
4. THE Visit_Flow SHALL ignore `confirmSwap` in every other phase and Stage.

### Requirement 5: The swap check

**User story:** As the visitor, I want the house to make sure the swap happened before it runs the room again.

#### Acceptance criteria

1. WHEN `playSwapCheck` is called in the phase `check` while no Pause holds, THE Visit_Flow SHALL call `activate` within the call when the Output_Shell does not run and, once it runs, SHALL play the Swap_Check with `output.playHeadphoneCheck`, which plays in the left Earpiece (D6, Q3).
2. IF `playHeadphoneCheck` refuses, THEN THE view SHALL give the refusal and its line, nothing SHALL be counted, and a later press SHALL play the check again; a refusal `notCalibrated` SHALL show the phase `unavailable` with the reason `calibrationGone`.
3. WHEN `answerSwapCheck(answer)` is called in the phase `check` after a Swap_Check was played and before it was answered, THE Visit_Flow SHALL judge the answer with `judgeSwapCheck`, add a Swap_Check entry with the answer, the judgement, the Earpiece `left` and the time to the Repeat_Controller's list, and:
   - for `confirmed`, set the Earpiece_State to `swapped` and show the phase `ready`;
   - for `notSwapped`, show the phase `instruction` again with the line of R4.3;
   - for `bothSides` or `notHeard`, stay in the phase `check` with the judgement's line, so that the visitor can play the check again.
4. `judgeSwapCheck` SHALL be a pure function from the four answers of `HeadphoneCheckAnswer` to the four Swap_Check_Judgements, and SHALL throw a `RangeError` for any other value.
5. THE Visit_Flow SHALL ignore `answerSwapCheck` before a Swap_Check has been played, after it has been answered, and in every other phase and Stage, and SHALL set no limit on the number of Swap_Checks.
6. WHEN the Output_Shell reports a stop with the reason `hidden` or `interrupted` in the phase `check` while a Swap_Check waits for its answer, THE Visit_Flow SHALL take that Swap_Check as not played and give the line that asks for it again (D13).

### Requirement 6: Starting the room again

**User story:** As the visitor, I want the room to start only when I ask, once the swap is confirmed.

#### Acceptance criteria

1. WHILE the phase is `ready`, THE view SHALL give the confirmed judgement's line, what happens next, and the label of the control that calls `startSwappedRoom`.
2. WHEN `startSwappedRoom` is called in the phase `ready` while no Pause holds and the Earpiece_State is `swapped`, THE Visit_Flow SHALL call `activate` within the call when the Output_Shell does not run and, once it runs, SHALL call `output.beginRoom()`, start the Repeat_Run and show the phase `room`.
3. THE Visit_Flow SHALL play no sound of the Repeat_Stage that does not follow a Sound_Press, and none in the phases `unavailable`, `instruction`, `ready` and `finished`.

### Requirement 7: The room run again, exactly as before

**User story:** As the visitor, I want the room to work as it did the first time, so that the two runs can be set side by side.

#### Acceptance criteria

1. THE Repeat_Run SHALL use `createThresholdSearch` with `hearingMethodConfig` and the search cap `roomSearchCapDb` of the Floor's room top under the calibration in use, which SHALL equal the First_Run's `searchCapDb` (D9).
2. THE Repeat_Run SHALL be played by `createRoomRunner` as a room of the visit is, with the room's sound, the Purpose `trial`, the response window, the gaps and the no-sound trials the search gives, and the same refusal rule.
3. THE engine seed of the Repeat_Run SHALL be drawn from the Visit's random source, and SHALL equal `swappedRepeatEngineSeed(log, runNumber)`, computed from the Visit_Log and the Run_Number alone (D9).
4. THE Repeat_Run SHALL use the calibration of the First_Run and SHALL not calibrate again (brief, "Calibration is not repeated").
5. THE spec SHALL change nothing in `src/engine/` and nothing in `src/session/room-runner.ts`.

### Requirement 8: Which earpiece is on which ear

**User story:** As the author of the tests, I want every sound and every answer of the repeat to say which ear and which earpiece it concerned, so that the attribution can be checked from the record.

#### Acceptance criteria

1. WHILE the phase is `room`, THE Visit_Flow SHALL ask the Output_Shell for each sound trial of the search's Ear on the Earpiece that the Earpiece_On_Ear of a swap puts on that Ear: the right Earpiece for the left Ear and the left Earpiece for the right Ear (D3).
2. EVERY trial of a Repeat_Record SHALL hold its Ear and its Earpiece, and every scored trial whose answer named a side SHALL also hold the Earpiece on the named Ear (D4).
3. EVERY answer of the Repeat_Run that scored no trial SHALL be recorded with its side and the Earpiece on that side's Ear.
4. EVERY Swap_Check entry SHALL hold the Earpiece it played in.
5. THE Repeat_Record SHALL hold its Earpiece_On_Ear.
6. THE `swappedTrialScored` Visit_Event SHALL hold the trial with its Ear and Earpiece, and its line SHALL name the Ear the sound was caught on and the Earpiece it came from.
7. THE test hook `onTrialPresented` SHALL give the Earpiece of every presented trial and whether it belongs to a Repeat_Run, in the rooms of the visit as in the Repeat_Run.
8. THE Visit_Flow SHALL write nothing to the Visit_Log in the Repeat_Stage: the Visit_Log SHALL deep-equal before and after, and the `result` Stage SHALL hold the same Visit_Log object and the same Visit_Summary object as before the repeat (D2).

### Requirement 9: After the repeat the headphones are still swapped

**User story:** As the visitor, I want to be told to turn the headphones back, and I want nothing later to assume they are still swapped.

#### Acceptance criteria

1. WHEN the Repeat_Stage is left in any way after the phase `instruction` was shown, THE Earpiece_State SHALL become `unknown`.
2. WHILE the Earpiece_State is not `asMarked` and a visit's rooms are over, THE `result` Snapshot SHALL give the Turn_Back_Line; otherwise its `turnBackLine` SHALL be null.
3. THE phase `finished` SHALL give the Turn_Back_Line.
4. THE Visit_Flow SHALL start no Repeat_Run unless the Earpiece_State is `swapped`, and SHALL play no trial sound in any later Stage while the Earpiece_State is `unknown`: a later repeat starts from its own instruction and Swap_Check, and a new visit starts from its own headphone check.
5. `backToFrontDoor` SHALL drop the Earpiece_State with the visit, and the next visit's headphone check SHALL decide it again.

### Requirement 10: The outcome

**User story:** As the visitor, I want to be told whether the difference seems to belong to my ears or to the headphones, or that it is not clear, and nothing more.

#### Acceptance criteria

1. `swappedRepeatOutcome(input, settings)` SHALL be a pure function of the First_Run's two Ear results, the Repeat_Record's two Ear results, the Difference_Limit and `unclearBelowLimitFraction`, and its result SHALL be frozen plain data.
2. IT SHALL throw a `RangeError` when the First_Run's Ears are not both `found` or the size of the First_Difference is below the Difference_Limit.
3. WHEN either Ear of the Repeat_Record is not `found`, THE Outcome SHALL be `unclear` with the reason `noLevel`.
4. WHEN the size of the Repeat_Difference is below Unclear_Below, THE Outcome SHALL be `unclear` with the reason `differenceShrank`.
5. WHEN both Ears of the Repeat_Record are `found`, the size of the Repeat_Difference is at least Unclear_Below and the Repeat_Difference has the sign of the First_Difference, THE Outcome SHALL be `followsEar`: the same Ear needed the louder sound both times.
6. WHEN both Ears of the Repeat_Record are `found`, the size of the Repeat_Difference is at least Unclear_Below and the Repeat_Difference has the other sign, THE Outcome SHALL be `followsEarpiece`: the same Earpiece needed the louder sound both times.
7. THE Ear results of the Repeat_Record SHALL be the search's results, made `unreliable` with the reason `levelNotAsAsked` when a scored sound trial of the Repeat_Run was played at another level than asked, as `summarizeVisit` does for a room (D10).
8. THE repeat SHALL change no number of the First_Run, the Visit_Summary or the Result_Picture's floors (brief, "Out of scope").

### Requirement 11: The end of the repeat and the way back

**User story:** As the visitor, I want to see what the repeat found next to the first run, and to go back to my picture.

#### Acceptance criteria

1. WHEN the search of the Repeat_Run finishes, THE Visit_Flow SHALL build the Repeat_Record, add it to the visit's list of Repeat_Records, and show the phase `finished` with the ending `finished`, the Comparison and the Turn_Back_Line.
2. THE Comparison SHALL give, for the First_Run and the Repeat_Record, each Ear's state, number, Earpiece, Earpiece label, line and depth of light on the Floor's own scale, and each run's difference label; and the Outcome with its label and lines.
3. WHEN `proceed` is called in any phase while no Pause holds, THE Visit_Flow SHALL call `stopAll` when a sound of the Repeat_Stage may be under way, end the Repeat_Run without a Repeat_Record if one is under way, and show the `result` Stage.
4. THE `result` Snapshot SHALL give every Repeat_Record of the visit, in the order they ended, and the Turn_Back_Line of R9.2.
5. A Repeat_Run that does not finish SHALL give no Repeat_Record and no Outcome, and SHALL be shown nowhere, but SHALL count for the Run_Number (D11).

### Requirement 12: The result page shows the repeat next to the first run

**User story:** As the visitor, I want to see the repeat beside the floor it repeated, on my picture and on a saved picture.

#### Acceptance criteria

1. THE Picture_Floor SHALL give, in its field `repeat`, the Comparison of the Floor's Repeat_Record, or null when the visit has none for it.
2. `resultPicture` SHALL read the Repeat_Records of a live result from `visit.swappedRepeats` and of a saved visit from `savedVisit.swappedRepeats`, and SHALL treat a missing list as empty.
3. THE Picture_Floor's other fields, and every field of the Result_Picture outside the floors, SHALL be what they are today for the same summary (R10.8).
4. WHEN a Floor has a Repeat_Record, THE Picture_Floor's `swappedRepeat` offer SHALL be null, and the offers of the other Floors SHALL be what they are without it (Q4, decided by the owner on 2026-11-15).
5. THE comparison with an earlier visit SHALL read the summaries alone and SHALL give the same `comparison` and `earlier` fields whether or not either visit has Repeat_Records.

### Requirement 13: Saved visits

**User story:** As the visitor, I want a saved visit to keep its repeat, and my older saved visits to read as before.

#### Acceptance criteria

1. THE Payload of a visit with at least one Repeat_Record SHALL hold them under the key `swappedRepeats`, each unchanged, and the Payload of a visit without one SHALL be written exactly as before this spec, with no such key (D17).
2. THE Payload's `formatVersion` SHALL stay 1.
3. WHEN a Payload without the key `swappedRepeats` is read, THE Saved_Visit SHALL give an empty list of Repeat_Records, and every other field SHALL be what it is today.
4. WHEN a Payload with the key is read, THE Payload SHALL be readable only if every Repeat_Record meets the rules of "Checking a payload" in `design.md`, among them that its Outcome is what `swappedRepeatOutcome` gives for its own numbers and the summary's First_Run.
5. THE Visit_Archive SHALL keep a Saved_Visit's summary and Visit_Log as they were saved, whatever its Repeat_Records.
6. WHEN `save` is called again on this page for a visit whose saved copy is still listed and lacks Repeat_Records that the visit now holds, THE Visit_Archive SHALL replace the stored Payload by one with the Repeat_Records, through the Visit_Store's `changePayload`, under the same saved visit id, date and name, and SHALL give `saved: true`, `renamed: false` and the line `swappedRepeatCopy.savedAgainLine` (Q5, decided by the owner on 2026-11-15).
7. `findEarlierVisit` and the comparison with an earlier visit SHALL work for every pair of saved visits, with or without Repeat_Records, and with either saved before this spec.
8. THE Visit_Store SHALL gain `changePayload(savedVisitId, payloadJson)`, which gives one entry a new payload and a new checksum and keeps its id, its dates, its visit type, its headphone name, its place in the list and every other entry as they were, refuses as `changeName` does, and never throws (Q5, decided by the owner on 2026-11-15). It SHALL be the only change of this spec to the code under `src/storage/`; the one other change there is the line of `src/storage/README.md` that describes it (R23.4).
9. THE Visit_Archive SHALL give `savedCopyLacksRepeats(visit)`: true exactly when this page saved the same Visit_Log object before, that saved copy is still listed, and the visit holds a Repeat_Record whose Run_Number no Repeat_Record of the saved copy has; false for a visit this page has not saved, for a saved copy no longer listed, in robot mode and whenever local storage cannot be read; it SHALL never throw, and SHALL be false after every `save` of that visit that gives `saved: true`. The Screen shows its save control again while it is true and compares nothing itself (the sub-question of Q5, chosen by the owner's coordinator on 2026-11-15; the owner may reverse it).

### Requirement 14: Stop, pauses, hiding, device changes and leaving

**User story:** As the visitor, I want the repeat to stop at once when I ask, when I hide the page or when I leave it, as every other sound does.

#### Acceptance criteria

1. THE view SHALL give the label of the visible stop control in every phase, and THE design SHALL require the Screen to show that control in every phase of the Repeat_Stage (audio-safety rule 7).
2. WHEN `stop` is called in the Repeat_Stage, THE Visit_Flow SHALL call `stopAll`, end the Repeat_Run without a Repeat_Record if one is under way, cancel every pending timer of the repeat, and show the `result` Stage (visit-flow R14.3).
3. WHEN `pause` is called in the phase `room` while no Pause holds, THE Visit_Flow SHALL begin a Pause `visitor`, pause the Repeat_Run, which discards a presented trial, and call `stopAll`.
4. WHEN the Output_Shell reports a stop with the reason `hidden` or `interrupted` in the phase `room` while no Pause holds, THE Visit_Flow SHALL begin a Pause with that reason and pause the Repeat_Run.
5. WHEN `resume` is called while a Pause of the Repeat_Stage holds, THE Visit_Flow SHALL call `activate` within the call and, once the Output_Shell runs, end the Pause and resume the Repeat_Run, which presents the waiting trial after its own gap; IF the Output_Shell then holds no calibration, THEN THE Visit_Flow SHALL show the phase `finished` with the ending `deviceChanged`.
6. WHEN the Output_Shell reports `deviceChanged` in the phase `room`, THE Visit_Flow SHALL end any Pause, end the Repeat_Run without a Repeat_Record and show the phase `finished` with the ending `deviceChanged`; in the phases `instruction`, `check` and `ready` it SHALL show the phase `unavailable` with the reason `calibrationGone`.
7. WHEN the Output_Shell reports `pageLeft` in the Repeat_Stage, THE Visit_Flow SHALL end the Repeat_Run without a Repeat_Record if one is under way, end any Pause and show the `result` Stage.
8. WHEN the Output_Shell reports `hidden` or `interrupted` in a phase other than `room`, THE Visit_Flow SHALL begin no Pause, apart from R5.6.
9. WHILE a Pause holds in the Repeat_Stage, THE Visit_Flow SHALL accept only `resume` and `stop`, and THE view SHALL give the line of the Pause's reason and the label of the control that resumes.
10. THE Visit_Flow SHALL write a Pause of the Repeat_Stage to the Repeat_Run's record and never to the Visit_Log.

### Requirement 15: When the output stage refuses a sound

**User story:** As the visitor, I want a sound the house cannot play to be tried again and, if it still cannot, the repeat to end plainly without losing my result.

#### Acceptance criteria

1. THE design SHALL say, for every sound of the Repeat_Stage, whether the output stage can refuse it as `busy` and what then happens, from the code and the config.
2. IF `play` refuses a trial sound of the Repeat_Run, THEN THE Room_Runner's rule SHALL apply: `notRunning` acts as a stop report with the shell's reason, or `interrupted` when it gives none or `control`; every other refusal is recorded in the Repeat_Run's refused plays and the same trial is presented again after its own gap.
3. IF a trial sound is refused `notCalibrated`, THEN THE Visit_Flow SHALL show the phase `finished` with the ending `deviceChanged`.
4. IF one trial sound is refused `refusedPlaysInARowMaxCount` times in a row, THEN THE Visit_Flow SHALL call `stopAll` and show the phase `finished` with the ending `soundRefused`, and SHALL NOT leave the house, drop the Visit_Log or show the `exit` Stage.
5. A refusal of the Swap_Check SHALL count towards nothing (R5.2).

### Requirement 16: Nothing gives a sound away before the answer

**User story:** As the visitor, I want the repeat's room to keep the rule of every room: nothing tells me when a sound plays or on which side before I answer.

#### Acceptance criteria

1. WHILE the phase is `room`, THE Snapshot SHALL not change between the presentation of a trial and its scoring, and SHALL hold nothing about a trial (visit-flow R11.2, R11.3).
2. THE only Visit_Event of a Repeat_Run SHALL be `swappedTrialScored`, handed out in the same step that scores its trial and never for a discarded trial.
3. THE `swappedTrialScored` event SHALL give the reaction `ripple` for a caught sound, `noSoundLine` for an answer on a no-sound trial and `none` otherwise, as the rooms of the visit do.

### Requirement 17: Audio safety in the repeat

**User story:** As the project owner, I want the repeat to keep every rule of `audio-safety.md`.

#### Acceptance criteria

1. THE Visit_Flow SHALL play every sound of the Repeat_Stage through `output.playHeadphoneCheck` (the Swap_Check) or `output.play` with the Purpose `trial` (the Repeat_Run), and through nothing else (rule 1).
2. THE design SHALL list which limits of the output stage act on each sound of the Repeat_Stage and why, from the audio-output spec and the code, and this spec SHALL lift no limit.
3. EVERY sound of the Repeat_Stage SHALL be faded in and out over at least `audioSafetyConfig.fadeMinMs`, SHALL carry exact digital zero on the other channel, SHALL last no longer than `audioSafetyConfig.ghostSoundMaxDurationMs`, SHALL stay within the ceiling and SHALL be at most the search's cap, as the output stage ensures for every sound (rules 2, 3, 5, 6).
4. THE Visit_Flow SHALL call `output.beginRoom()` after the last Swap_Check and before the first sound of the Repeat_Run, so that the rise limit of one upward step per Earpiece acts within the Repeat_Run as within a room (rule 4).
5. THE Swap_Instruction SHALL tell the visitor not to turn the volume up and that the limit holds only if they do not (rule 8).
6. THE Repeat_Stage SHALL play only the Swap_Check and the Floor's room sound, at the levels of R5 and R7, and nothing else (rule 9).

### Requirement 18: Every string is in src/copy

**User story:** As the project owner, I want every string of the repeat ready in `src/copy`, so that I add none of my own.

#### Acceptance criteria

1. THE copy of this spec SHALL hold every constant and function of "The copy" in `design.md`, with that wording.
2. THE copy functions SHALL take plain values and names defined in `src/copy`, import only from `src/config` and other copy files, and throw a `RangeError` for values that do not fit.
3. THE copy SHALL contain no banned term, SHALL say nothing about accuracy, SHALL compare the visitor with nobody, SHALL label every level it shows as relative to the visitor's own calibration, and SHALL not mock the visitor (`wording.md`).
4. THE lines of the Outcome `followsEar` SHALL say that the difference seems to belong to the ears and SHALL repeat when to see a hearing professional in the words of the Limits_Statement's fourth sentence, taken from that constant.
5. THE lines of the Outcome `followsEarpiece` SHALL say that the difference seems to belong to the headphones. THE lines of `unclear` SHALL say that the swap did not make clear where the difference belongs, and why. No Outcome line SHALL say more than where the difference seems to belong.
6. THE copy tests SHALL check every constant and the output of every function for representative inputs against the banned terms, and `npm run check:copy` SHALL pass.

### Requirement 19: Time, randomness and reproducing a repeat

**User story:** As the author of the tests, I want a repeat to follow from the visit log, its run number and the visitor's answers, so that a failing case can be played again.

#### Acceptance criteria

1. THE Repeat_Controller SHALL read time and wait only through the Timer of the Visit, and SHALL not read a clock or a random source of its own, as the lint rules for `src/session` require.
2. THE times of a Repeat_Record SHALL be on the clock of the Visit_Log: milliseconds since the visit began.
3. WHEN the logged answers of a Repeat_Record are given in order to `createThresholdSearch` with `hearingMethodConfig`, the record's search cap and its engine seed, THE search SHALL ask for the record's scored trials, in order, and give the record's room result.
4. A Repeat_Record SHALL be plain data that `JSON.parse(JSON.stringify(record))` gives back deep-equal.
5. THE outcome, the Comparison, the views, `judgeSwapCheck` and `swappedRepeatEngineSeed` SHALL be pure functions that run under Node in Vitest, and the Repeat_Controller SHALL run there with the fake audio backend and the manual timer.

### Requirement 20: Properties

**User story:** As the project owner, I want the brief's property and those the design needs checked over every mix of ears, headphones and ways of moving through the repeat.

#### Acceptance criteria

1. THE Property_Suite SHALL check "Correct attribution" (brief, CP1) in the form of "Correctness properties" in `design.md`, as the owner decided in Q1 on 2026-11-15 (option (a)): for Step_Listeners (Q2, PROPOSED, NOT APPROVED) with every Ear_Difference and Headphone_Imbalance of the drawn range, the Outcome is the one the rule gives for the true differences D1 = E + H and D2 = E − H, and `unclear` or no offer is also accepted within one upward step of a boundary of the rule; the brief's sentences are asserted where one of E and H is zero; and every attribution says "seems" (CP9). The rule of the brief itself is kept as it is (R10).
2. THE Property_Suite SHALL check the further properties of "Correctness properties" (CP2 to CP11) with the run counts stated there, each with a new random fast-check seed on every run.
3. THE run counts and the time budget of the property files SHALL be the owner's choice (Q9). Until the owner decides, they are PROPOSED, NOT APPROVED.
4. EVERY task that adds a property file SHALL run `npm test` three times and write the time of each of this spec's property files in `design.md`, and SHALL NOT stop because of a time budget that has not been measured. THE final task SHALL compute the budget by the rule proposed in Q9 from its three runs with every property file present, write it as PROPOSED, NOT APPROVED, and report it to the owner. No task SHALL lower a run count.
5. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression test in `tests/properties/swapped-repeat-regressions.test.ts`, first with `it.fails`, and the task SHALL stop and report it so that the fix is committed separately.
6. THE repeat SHALL run to its end from the result in a simulated quick visit and a simulated full visit in the test suite (brief, "Done when").

### Requirement 21: What the simulated listeners gain

**User story:** As the author of the properties, I want listeners that wear headphones the way a person does, so that a wrong record of the earpieces shows up as a wrong answer.

#### Acceptance criteria

1. `tests/listeners` SHALL gain Worn_Headphones: a function that takes a listener, a Headphone_Imbalance and the listener's own Earpiece_On_Ear, and answers a sound on an Earpiece at a level as the listener answers that sound on the Ear the Earpiece sits on, made quieter by that Earpiece's share of the imbalance.
2. THE simulated visitor SHALL hear every trial through Worn_Headphones, taking the Earpiece from the test hook (R8.7), and SHALL answer the Swap_Check from its own Earpiece_On_Ear, so that its answers follow what it wears and not what the flow believes.
3. THE simulated visitor SHALL gain an optional swapped-repeat behaviour: which offered Floor to repeat, whether it swaps on the first instruction, its first Swap_Check answer, its disturbances and ending in the Repeat_Stage, and whether it turns the headphones back on reading the Turn_Back_Line. Without the behaviour it SHALL stop at the result as it does now, so that every existing property runs as before.
4. `tests/listeners` SHALL gain the measurement of "Measurements" in `design.md` as a function and a print script with the same seeds, which choose nothing and change no config value.

### Requirement 22: What other specs inherit and what the owner builds

**User story:** As the authors of later specs and as the project owner, I want to know what this spec leaves us.

#### Acceptance criteria

1. THE spec SHALL add nothing to the `entry`, `missedSoundReplay` or `exit` Stages and nothing for the no-headphone replay, the last door or the robot module.
2. THE design SHALL say what each of those specs inherits from the repeat.
3. THE design SHALL list what the owner's Screen has to do in the Repeat_Stage and on the result page, and which of the owner's files stop compiling or stop passing when the contracts grow, so that the owner can change them before the first task (Q8).

### Requirement 23: Boundaries and documentation

**User story:** As the project owner, I want the tasks to stay out of the screen I am building.

#### Acceptance criteria

1. THE tasks of this spec SHALL create or change no file under `src/ui/`, `tests/e2e/` or `tests/properties/screen-leak/`, no CSS or HTML file, nor `src/main.ts`, the root `README.md` or anything under `.kiro/steering/`.
2. THE tasks SHALL change only the files listed in "Files" in `design.md`, and in the Contract_File and the Result_Contract_File SHALL only add.
3. THE tasks SHALL not commit; each task's work is committed afterwards by a separate run with a one-line message, so anything a task records goes in `design.md` or a README.
4. THE READMEs of `src/session/`, `src/copy/`, `src/config/`, `tests/properties/` and `tests/listeners/` SHALL describe what this spec adds, and SHALL follow `wording.md`. `src/storage/README.md` SHALL gain only the one line that describes `changePayload`, written by task 18, because under `src/storage/` the tasks change only `changePayload` and its test (Q5, R13.8).

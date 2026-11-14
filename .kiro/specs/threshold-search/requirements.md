# Requirements: threshold search

## Introduction

This spec builds the engine that finds, for one room, the quietest level each ear caught. The engine runs the modified Hughson-Westlake search from `.kiro/steering/hearing-method.md` for the left and the right ear at the same time, mixes their trials in random order with no-sound trials, and ends each ear in one of four states: found, better than floor, worse than cap, or unreliable.

The engine is pure logic in `src/engine`. It is given a seeded random source and its settings, asks for one trial at a time, is told the visitor's response, and finally returns a result. It never reads the clock, never plays sound and never touches the page.

The spec also delivers the simulated listeners and property tests that check the engine, a script that writes scatter plot data of true threshold against estimate, and the comparison with the version on the `experiment/no-spec` branch that was written without a spec.

The input is `docs/briefs/01-threshold-search.md`, the steering files in `.kiro/steering/` (above all `hearing-method.md`), `docs/architecture.md`, and the code left by the project-scaffold spec: `src/config` and the lint rules in `tools/lint/`. Open points are settled in the Decisions section of `design.md`, which these requirements refer to as D1, D2 and so on.

Out of scope: playing sound, drawing, timing of real trials, the visit-level false alarm rule across rooms, and the swapped repeat.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Threshold_Search**: the engine for one room, created by `createThresholdSearch` in `src/engine/threshold-search.ts`.
- **Room**: one run of a Threshold_Search, covering both ears at one pitch. The engine does not know the pitch.
- **Ear**: `left` or `right`.
- **Hearing_Method_Config**: the frozen object `hearingMethodConfig` in `src/config/hearing-method-config.ts`.
- **Settings**: the object a Threshold_Search is created with. Its fields have the names and meanings of the matching Hearing_Method_Config fields, so the Hearing_Method_Config can be passed as it is.
- **Level**: a number of decibels relative to the calibration anchor. 0 is the anchor and negative is quieter. Variables holding a Level end in `Db`.
- **Floor**: the Settings field `floorDb`, the quietest Level the engine may request.
- **Cap**: the Settings field `capRelativeToAnchorDb`, the loudest Level the engine may request.
- **Upward_Step** and **Downward_Step**: the Settings fields `upwardStepDb` and `downwardStepDb`.
- **Sound_Trial**: a trial that plays a sound to one Ear at one Level.
- **No_Sound_Trial**: a trial that plays nothing.
- **Response**: what the visitor did on a trial: `"left"`, `"right"` or `"none"`.
- **Catch**: a Response on a Sound_Trial that names the Ear the sound was played to.
- **Wrong_Side**: a Response on a Sound_Trial that names the other Ear.
- **Miss**: the Response `"none"` on a Sound_Trial.
- **False_Alarm**: a Response on a No_Sound_Trial that names either Ear.
- **No_Response**: the Response `"none"` on a No_Sound_Trial.
- **Outcome**: the classification of a Response: Catch, Wrong_Side, Miss, False_Alarm or No_Response.
- **Presentation**: one Sound_Trial for one Ear together with its Outcome.
- **Direction**: a label on each Presentation. `first` for the Ear's first Presentation in the Room, `ascending` when the Ear's previous Presentation was a Miss or a Wrong_Side, and `descending` when it was a Catch (D2).
- **Ear_Search**: the search for one Ear inside a Room. It is either searching or ended.
- **Search_Phase**: the part of a Room in which at least one Ear_Search is searching.
- **Closing_Phase**: the part of a Room after both Ear_Searches have ended, in which only No_Sound_Trials may be added to bring the No_Sound_Share up to its minimum (D8).
- **No_Sound_Share**: the number of No_Sound_Trials in a Room divided by the number of all trials in that Room.
- **False_Alarm_Rate**: the number of False_Alarms in a Room divided by the number of No_Sound_Trials in that Room, or 0 when the Room has no No_Sound_Trial.
- **Ear_Result**: the final state of one Ear: `found`, `betterThanFloor`, `worseThanCap` or `unreliable`.
- **Room_Result**: the Ear_Result for each Ear plus the Room's counts and trial records.
- **Minimum_Room_Sound_Trials**: twice the smallest number of Presentations an Ear_Search needs before it can end. With the shipped Settings this is 4 (D6).
- **Room_Trial_Limit**: the largest number of trials a Room can have. It is twice `trialLimitPerEarPerRoomCount` plus the largest number of No_Sound_Trials that keeps the No_Sound_Share at or below `noSoundTrialShareMaxFraction` with that many Sound_Trials. With the shipped Settings this is 40 + 13 = 53 (D6).
- **Level_Grid**: the Levels `startingLevelDb + k × upwardStepDb` for whole numbers `k`, from Floor to Cap.
- **Simulated_Listener**: a test-only function in `tests/listeners/` that is given a trial and returns a Response.
- **Psychometric_Listener**: a Simulated_Listener defined by a true threshold for each Ear, a psychometric width, a lapse rate, a false alarm rate and a wrong-side rate (D17).
- **Step_Listener**: a Psychometric_Listener with zero width, zero lapse rate, zero false alarm rate and zero wrong-side rate. It catches a sound exactly when its Level is at or above the Ear's true threshold.
- **Extreme_Listeners**: the Simulated_Listeners that always answer, never answer, answer at random, always answer on the wrong side, or always press one side (D17).
- **True_Threshold**: the Level at which a Psychometric_Listener's psychometric function, before lapses, gives a detection probability of one half.
- **Accurate**: an Ear_Result that agrees with the True_Threshold within 5 dB, as defined in D18.
- **Flagged**: an Ear_Result in the state `unreliable`.
- **Wrong**: an Ear_Result that is neither Accurate nor Flagged.
- **Plausible_Range** and **Attentive_Range**: the two ranges of Psychometric_Listener parameters that the property tests draw from (D17).
- **Universal_Property**: a property that must hold for every generated input. Its fast-check seed is random on every run.
- **Statistical_Property**: a property about rates over many simulated Rooms. It runs with a fixed seed and fixed limits (D19).
- **Property_Suite**: the property tests for the Threshold_Search under `tests/properties/`.
- **Search_Under_Test**: the interface in `tests/listeners/` that lets the same property checks run against any version of the search (D21).
- **Spec_Version**: the Threshold_Search built by this spec.
- **No_Spec_Version**: the search on the `experiment/no-spec` branch.
- **Scatter_Script**: the script that writes true threshold against Ear_Result for a population of simulated listeners.
- **Comparison_Document**: `docs/experiments/spec-vs-no-spec.md`.

## Requirements

### Requirement 1: Engine boundary

**User story:** As the author of the visit flow, I want the search as pure logic with injected randomness, so that it can be tested in milliseconds and every failing run can be replayed.

#### Acceptance criteria

1. THE Threshold_Search SHALL live in `src/engine/` and import only from `src/config/`.
2. THE Threshold_Search SHALL not read the clock, schedule callbacks, call `Math.random`, or use any audio or DOM API.
3. THE Threshold_Search SHALL take every random number from the `RandomSource` passed to `createThresholdSearch`.
4. THE Threshold_Search SHALL run under Node.js in Vitest without a browser.
5. WHEN two Threshold_Search instances are created with equal Settings and with random sources made from the same seed, and are given the same sequence of Responses, THE Threshold_Search SHALL request equal trials in the same order and return equal Room_Results.

### Requirement 2: Settings

**User story:** As the person who tunes the numbers after listening tests, I want the engine to read every number from config and refuse settings it cannot honour, so that a bad tuning fails loudly instead of producing a quietly wrong search.

#### Acceptance criteria

1. THE Threshold_Search SHALL take as Settings an object whose fields have the names of the Hearing_Method_Config fields it uses, so that `hearingMethodConfig` can be passed unchanged.
2. THE Threshold_Search SHALL accept the shipped Hearing_Method_Config.
3. IF `downwardStepDb`, `upwardStepDb`, `startingLevelDb`, `floorDb`, `capRelativeToAnchorDb` or `inconsistentCatchMarginDb` is not an integer, THEN THE Threshold_Search SHALL throw a `RangeError` that names the field.
4. IF either step is not positive, or `downwardStepDb` is not a whole multiple of `upwardStepDb`, THEN THE Threshold_Search SHALL throw a `RangeError`.
5. IF `floorDb` is not below `capRelativeToAnchorDb`, or `startingLevelDb` lies outside the range from Floor to Cap, or the distance from `startingLevelDb` to Floor or to Cap is not a whole multiple of `upwardStepDb`, THEN THE Threshold_Search SHALL throw a `RangeError` (D14).
6. IF `gapBetweenTrialsMinMs` is not a positive integer or is above `gapBetweenTrialsMaxMs`, or `gapBetweenTrialsMaxMs` is not an integer, THEN THE Threshold_Search SHALL throw a `RangeError`.
7. IF a field ending in `Fraction` lies outside 0 to 1, or `noSoundTrialShareMinFraction` is above `noSoundTrialShareMaxFraction`, or `noSoundTrialProbabilityFraction` lies outside the range from `noSoundTrialShareMinFraction` to `noSoundTrialShareMaxFraction`, THEN THE Threshold_Search SHALL throw a `RangeError`.
8. IF a field ending in `Count` is not a positive integer, or `inconsistentCatchMarginDb` is not positive, THEN THE Threshold_Search SHALL throw a `RangeError`.
9. IF there is a number of Sound_Trials from Minimum_Room_Sound_Trials to twice `trialLimitPerEarPerRoomCount` for which no whole number of No_Sound_Trials gives a No_Sound_Share inside the configured range, THEN THE Threshold_Search SHALL throw a `RangeError` (D6).
10. THE Threshold_Search SHALL not keep a reference to the Settings object that a caller could change after creation.

### Requirement 3: Asking for trials

**User story:** As the author of the visit flow, I want the engine to say exactly what to play next and after what gap, so that the session only has to play it and report back.

#### Acceptance criteria

1. WHEN a Threshold_Search is created, THE Threshold_Search SHALL make its first trial available from `current()` without needing a Response.
2. WHILE a trial is waiting for its Response, THE Threshold_Search SHALL return that same trial from every call to `current()`.
3. THE Threshold_Search SHALL describe each Sound_Trial by its trial number, its Ear, its Level, its Direction and the gap before it in milliseconds.
4. THE Threshold_Search SHALL describe each No_Sound_Trial by its trial number, its phase (`search` or `closing`) and the gap before it, with no Ear and no Level.
5. THE Threshold_Search SHALL number the trials of a Room from 1 in the order it requests them.
6. THE Threshold_Search SHALL draw each gap uniformly from the whole milliseconds from `gapBetweenTrialsMinMs` to `gapBetweenTrialsMaxMs` inclusive, in the same way for every trial whatever its kind and Ear (D11).
7. WHILE both Ear_Searches are searching, THE Threshold_Search SHALL send each Sound_Trial to the left or the right Ear with equal probability, independently of earlier trials (D10).
8. WHILE only one Ear_Search is searching, THE Threshold_Search SHALL send every Sound_Trial to that Ear.
9. THE Threshold_Search SHALL return every trial, trial record and Room_Result as a frozen object.

### Requirement 4: Responses and outcomes

**User story:** As the visitor, I want my answer to count the same way every time, so that naming the wrong side or pressing at nothing is treated fairly and visibly.

#### Acceptance criteria

1. WHEN `respond(response)` is called with `"left"`, `"right"` or `"none"` while a trial is waiting, THE Threshold_Search SHALL record the Response and its Outcome against that trial and make the next step available.
2. WHEN the Response to a Sound_Trial names the Ear of the trial, THE Threshold_Search SHALL classify it as a Catch.
3. WHEN the Response to a Sound_Trial names the other Ear, THE Threshold_Search SHALL classify it as a Wrong_Side, treat it as a Miss for that Ear's level rule and threshold rules, and count it separately from Misses.
4. WHEN the Response to a Sound_Trial is `"none"`, THE Threshold_Search SHALL classify it as a Miss.
5. WHEN the Response to a No_Sound_Trial names either Ear, THE Threshold_Search SHALL classify it as a False_Alarm.
6. WHEN the Response to a No_Sound_Trial is `"none"`, THE Threshold_Search SHALL classify it as a No_Response.
7. IF `respond` is called with any value other than `"left"`, `"right"` or `"none"`, THEN THE Threshold_Search SHALL throw a `TypeError` and leave its state unchanged.
8. IF `respond` is called after the Room has finished, THEN THE Threshold_Search SHALL throw an `Error` and leave its state unchanged.

### Requirement 5: Level rule

**User story:** As the visitor, I want the next sound on an ear to be quieter after I catch one and only a little louder after I miss one, so that the monster keeps getting quieter and nothing jumps at me.

#### Acceptance criteria

1. THE Threshold_Search SHALL present each Ear's first Sound_Trial at `startingLevelDb`.
2. WHEN a Presentation for an Ear is a Catch, THE Threshold_Search SHALL set that Ear's next Level to the Presentation's Level minus the Downward_Step, but not below the Floor.
3. WHEN a Presentation for an Ear is a Miss or a Wrong_Side, THE Threshold_Search SHALL set that Ear's next Level to the Presentation's Level plus the Upward_Step, but not above the Cap.
4. THE Threshold_Search SHALL never request a Level below the Floor or above the Cap.
5. THE Threshold_Search SHALL never request, for an Ear, a Level more than one Upward_Step above that Ear's previous Presentation in the Room (audio-safety rule 4).
6. THE Threshold_Search SHALL change an Ear's next Level only after a Presentation for that Ear. No_Sound_Trials and the other Ear's trials SHALL leave it unchanged.
7. THE Threshold_Search SHALL request only Levels on the Level_Grid.

### Requirement 6: Found

**User story:** As the visitor, I want a number only when the house has really caught my quietest sound on the way up, so that the light in the wing means something.

#### Acceptance criteria

1. THE Threshold_Search SHALL give each Presentation a Direction as defined in the glossary. A Presentation held at the Cap after a Miss or Wrong_Side SHALL be `ascending`, and a Presentation held at the Floor after a Catch SHALL be `descending` (D2).
2. WHEN the Threshold_Search records an ascending Presentation at a Level, and the ascending Presentations for that Ear at that Level include at least `thresholdCatchesMinCount` Catches that make up at least `thresholdCatchShareMinFraction` of them, THE Threshold_Search SHALL end that Ear_Search as found, with that Level as its threshold, except as criterion 5 requires (D1).
3. THE Threshold_Search SHALL count only ascending Presentations toward the rule in criterion 2.
4. THE Threshold_Search SHALL keep counting ascending Presentations at a Level after that Level has missed the rule once, so that a later majority at that Level can still meet it (D1).
5. IF the Level of criterion 2 is below the Cap, and the Level one Upward_Step below it is above the Floor and would meet the rule of criterion 2 with one more ascending Catch, THEN THE Threshold_Search SHALL keep that Ear_Search searching instead of ending it as found (D40).

### Requirement 7: Better than floor and worse than cap

**User story:** As the visitor, I want to be told plainly when I caught even the quietest sound or missed even the loudest one, without a made-up number.

#### Acceptance criteria

1. WHEN the Threshold_Search records a Presentation at the Floor, and the Presentations for that Ear at the Floor include at least `floorCatchesForBetterThanFloorCount` Catches that make up at least `thresholdCatchShareMinFraction` of them, THE Threshold_Search SHALL end that Ear_Search as better than floor (D3).
2. WHEN the Threshold_Search records an ascending Presentation at the Cap that does not end the Ear_Search as found, and the ascending Presentations for that Ear at the Cap include at least `capMissesForWorseThanCapCount` Misses and Wrong_Sides together, THE Threshold_Search SHALL end that Ear_Search as worse than cap (D4).
3. THE Threshold_Search SHALL apply the found rule before the worse-than-cap rule to the same Presentation.
4. THE Threshold_Search SHALL report no Level number for an Ear_Result of better than floor or worse than cap.

### Requirement 8: Unreliable

**User story:** As the visitor, I want the house to say when it could not get a fair answer, instead of showing me a number that guessing or bad luck produced.

#### Acceptance criteria

1. IF an Ear_Search has had `trialLimitPerEarPerRoomCount` Presentations and has not ended, THEN THE Threshold_Search SHALL end it with the reason `trialLimit`.
2. IF an Ear_Search ended as found at a Level and that Ear had a Catch at a Level at least `inconsistentCatchMarginDb` below it, THEN THE Threshold_Search SHALL give that Ear the Ear_Result `unreliable` with the reason `inconsistentCatch` (D5).
3. IF an Ear_Search ended as worse than cap and that Ear had a Catch at a Level at least `inconsistentCatchMarginDb` below the Cap, THEN THE Threshold_Search SHALL give that Ear the Ear_Result `unreliable` with the reason `inconsistentCatch` (D5).
4. IF the Room's False_Alarm_Rate is above `falseAlarmRateUnreliableAboveFraction`, THEN THE Threshold_Search SHALL give both Ears the Ear_Result `unreliable` with the reason `falseAlarmRate`, whatever state their Ear_Searches ended in (D7).
5. THE Threshold_Search SHALL list every reason that applies to an unreliable Ear, in the order `trialLimit`, `inconsistentCatch`, `falseAlarmRate`.
6. THE Threshold_Search SHALL report no Level number for an unreliable Ear.
7. THE Threshold_Search SHALL not mark an Ear unreliable for Wrong_Side Responses alone (D16).

### Requirement 9: No-sound trials

**User story:** As the visitor, I want the silent trials to come without a pattern, so that I cannot learn when to stay still and the house can tell when I am guessing.

#### Acceptance criteria

1. WHILE the Room is in the Search_Phase, THE Threshold_Search SHALL make each trial a No_Sound_Trial with probability `noSoundTrialProbabilityFraction`, decided by its own random draw, except as criterion 2 requires (D8).
2. IF one more No_Sound_Trial could make the Room's final No_Sound_Share exceed `noSoundTrialShareMaxFraction` when the Room ends with the fewest Sound_Trials still possible, THEN THE Threshold_Search SHALL make the next trial a Sound_Trial (D8).
3. WHEN both Ear_Searches have ended and the No_Sound_Share is below `noSoundTrialShareMinFraction`, THE Threshold_Search SHALL add No_Sound_Trials in the Closing_Phase, one at a time, until the No_Sound_Share is at or above it.
4. THE Threshold_Search SHALL end every Room with a No_Sound_Share from `noSoundTrialShareMinFraction` to `noSoundTrialShareMaxFraction` inclusive, for every sequence of Responses.
5. THE Threshold_Search SHALL decide whether a trial is a No_Sound_Trial using only its random draw and the counts that criteria 2 and 3 need. It SHALL not use the Ear, Level or Outcome of earlier trials in any other way.
6. THE Threshold_Search SHALL compare shares and fractions with a tolerance of 10⁻⁹, so that a share exactly at a configured limit counts as inside it (D29).

### Requirement 10: The room always ends

**User story:** As the visitor, I want every room to finish in a bounded time, whatever I do.

#### Acceptance criteria

1. THE Threshold_Search SHALL request at most `trialLimitPerEarPerRoomCount` Sound_Trials for each Ear in a Room.
2. THE Threshold_Search SHALL request at most Room_Trial_Limit trials in a Room, for every sequence of Responses.
3. WHEN both Ear_Searches have ended and the No_Sound_Share is within range, THE Threshold_Search SHALL finish the Room and return the Room_Result from `current()` and from the `respond` call that finished it.

### Requirement 11: Room result

**User story:** As the author of the result page and the replay, I want one result that carries the state of each ear, the counts and every trial, so that every later screen is drawn from the same record.

#### Acceptance criteria

1. THE Threshold_Search SHALL give each Ear exactly one Ear_Result state.
2. THE Room_Result SHALL include, for each Ear, the state, the threshold Level only when the state is `found`, the list of reasons only when the state is `unreliable`, and the numbers of Presentations, Catches, Wrong_Sides and Misses.
3. THE Room_Result SHALL include the number of No_Sound_Trials, the number of False_Alarms, the False_Alarm_Rate, and whether the False_Alarm_Rate is above `falseAlarmRateUnreliableAboveFraction`.
4. THE Room_Result SHALL include the record of every trial in order: the trial as requested, the Response and the Outcome.
5. WHERE an Ear_Result is `found`, THE Threshold_Search SHALL give a threshold on the Level_Grid from Floor plus one Upward_Step to the Cap.

### Requirement 12: Config additions

**User story:** As the person who tunes the numbers, I want every number that decides the search in config, so that no rule hides a constant in the engine.

#### Acceptance criteria

1. THE Hearing_Method_Config SHALL gain these fields, with these values:

   | Field | Value | Meaning |
   |---|---|---|
   | `noSoundTrialProbabilityFraction` | 0.2 | Chance that a Search_Phase trial is a No_Sound_Trial (D8) |
   | `thresholdCatchesMinCount` | 2 | Fewest ascending Catches at one Level for found (D1) |
   | `thresholdCatchShareMinFraction` | 0.5 | Smallest share of Catches among ascending Presentations at one Level for found (D1) |
   | `floorCatchesForBetterThanFloorCount` | 2 | Catches at the Floor for better than floor (D3) |
   | `capMissesForWorseThanCapCount` | 2 | Ascending Misses and Wrong_Sides at the Cap for worse than cap (D4) |
   | `inconsistentCatchMarginDb` | 10 | How far below the result a Catch makes the Ear unreliable (D5) |

2. THE Hearing_Method_Config SHALL keep every existing field and value unchanged.
3. THE Hearing_Method_Config test SHALL check the new values, that each new field name ends in its unit, and that `noSoundTrialProbabilityFraction` lies within the no-sound share range.
4. THE Threshold_Search SHALL contain no number that affects a Level, a gap or an Ear_Result other than values read from the Settings, apart from 0, 1 and the comparison tolerance in Requirement 9.6.

### Requirement 13: Simulated listeners

**User story:** As the author of the property tests, I want listeners that behave like imperfect people and listeners that behave badly on purpose, so that the properties are tested against more than an ideal visitor.

#### Acceptance criteria

1. THE Psychometric_Listener SHALL take a True_Threshold for each Ear, a psychometric width in dB from the 10 percent to the 90 percent point of a logistic function, a lapse rate, a false alarm rate and a wrong-side rate.
2. WHEN a Psychometric_Listener is given a Sound_Trial, THE Psychometric_Listener SHALL detect it with probability (1 − lapse rate) × F(Level), where F is its logistic function for that Ear. WHEN it detects the sound, it SHALL name the trial's Ear, except with probability equal to its wrong-side rate, when it SHALL name the other Ear.
3. WHEN a Psychometric_Listener does not detect a sound, or is given a No_Sound_Trial, THE Psychometric_Listener SHALL respond with probability equal to its false alarm rate, naming the left or the right Ear with equal probability, and otherwise respond `"none"`.
4. WHERE the width is 0, THE Psychometric_Listener SHALL use a step function: F is 1 at or above the True_Threshold and 0 below it.
5. THE Extreme_Listeners SHALL include: always answers (a random side on every trial), never answers, answers at random (`"left"`, `"right"` and `"none"` with equal probability on every trial), always answers on the wrong side (the other Ear on every Sound_Trial and a random side on every No_Sound_Trial), and always presses left.
6. THE Simulated_Listeners SHALL take every random number from a seeded `RandomSource` of their own, separate from the engine's.
7. THE Simulated_Listeners SHALL be given only the trial kind, and for a Sound_Trial its Ear and Level, so that the same listeners can drive any Search_Under_Test.
8. THE test helpers SHALL generate Psychometric_Listener parameters from the Plausible_Range and the Attentive_Range defined in D17.

### Requirement 14: Properties

**User story:** As the author, I want the brief's properties checked by fast-check against those listeners, so that the engine's claims are checked rather than assumed.

#### Acceptance criteria

1. THE Property_Suite SHALL check each correctness property in the Correctness properties section of `design.md`, and SHALL name the property and the requirements it covers in each test.
2. THE Property_Suite SHALL write each check of the brief's five properties against the Search_Under_Test interface, so that the same check can run against the No_Spec_Version.
3. THE Property_Suite SHALL run every Universal_Property with a random fast-check seed, and every Statistical_Property with the fixed seed and limits given in `design.md`.
4. WHEN a property finds a counterexample, THE Property_Suite SHALL gain a named regression test that reproduces it with fixed values, committed before the fix and marked as expected to break until the fix (D20).
5. THE fix for a counterexample SHALL go in its own commit, which also turns the regression test into an ordinary test and records the change in the Decisions section of `design.md`.
6. IF a counterexample can only be removed by changing a value from the initial values table of `hearing-method.md`, the parameter ranges in D17 or the limits of a Statistical_Property, THEN the change SHALL be recorded as a decision with the measured numbers before it is made, and SHALL not be made silently.
7. THE Property_Suite SHALL finish within 3 minutes on the author's machine.

### Requirement 15: Scatter plot data

**User story:** As the author of the write-up, I want true threshold against estimate for a few thousand simulated listeners, so that the scatter plot with the 5 dB band can be drawn from real output.

#### Acceptance criteria

1. WHEN `npm run experiment:scatter` runs, THE Scatter_Script SHALL run one Room for each of 3000 Psychometric_Listeners drawn from the Plausible_Range with a fixed seed, using the shipped Settings.
2. THE Scatter_Script SHALL write `docs/experiments/threshold-search-scatter-<search name>.csv` with one row per Ear and the columns listed in `design.md`.
3. WHEN the Scatter_Script runs twice on the same code, THE Scatter_Script SHALL write byte-identical files.
4. THE Scatter_Script SHALL print the number of Ears that are Accurate, Flagged and Wrong.
5. THE Scatter_Script SHALL live under `tests/listeners/`, because code in `tools/` may not import from `tests/` (D22).

### Requirement 16: Comparison with the no-spec version

**User story:** As the author of the write-up, I want both versions measured with the same listeners and the same properties, so that the comparison is fair and can be repeated.

#### Acceptance criteria

1. THE comparison SHALL start only after every other task of this spec is done, and SHALL be the first point at which the No_Spec_Version's code is read.
2. THE comparison SHALL run the No_Spec_Version from the commits on `experiment/no-spec` without changing its code, on a separate branch `experiment/no-spec-measured` created from it that adds only the shared listeners, checks and an adapter. `experiment/no-spec` itself SHALL stay unchanged.
3. THE adapter for the No_Spec_Version SHALL translate names, units and call shapes only. It SHALL not add clamping, stopping, flagging, scheduling or any other search logic.
4. IF the No_Spec_Version cannot take the Settings, THEN THE comparison SHALL run it with its own values and record those values in the Comparison_Document.
5. IF a property cannot be checked for a version because the version does not report what the property needs, THEN THE Comparison_Document SHALL record that property as not checkable for that version and not count it as holding.
6. THE Comparison_Document SHALL record, for each version: which of the brief's five properties hold, with the first counterexample of each that does not; the share of Plausible_Range Ears that are Accurate, Flagged and Wrong; the median and largest number of trials per Room; the commit measured; and the commands that reproduce the numbers.
7. THE Comparison_Document SHALL also record the Spec_Version's numbers from its first complete run, before any counterexample was fixed.
8. THE Comparison_Document SHALL state that the numbers describe simulated listeners only and say nothing about how well the product works for people, and SHALL follow `wording.md`.

### Requirement 17: Done

**User story:** As the author, I want one checklist that says when this spec is finished.

#### Acceptance criteria

1. WHEN the spec is complete, THE Repository SHALL pass `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
2. WHEN the spec is complete, THE Property_Suite SHALL hold for every property, with every regression test in place as an ordinary test.
3. WHEN the spec is complete, THE Repository SHALL contain the scatter data written by the Scatter_Script for the Spec_Version and the Comparison_Document.

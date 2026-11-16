# Requirements: result page

## Introduction

This spec builds everything the result page needs that is not drawing. It adds saved visits in the browser's local storage (`src/storage`), the part of `src/session` that the page calls to save, list, compare and delete visits, a pure model of the lit cross-section made from a visit summary, every string the page shows (`src/copy`), the exemption of the fixed limits statement from the copy check, a hook that runs the copy check when a copy file is saved, and the properties of brief 06 with those that storage and the model need.

The page itself is built by hand by the project owner, outside this spec's tasks: everything under `src/ui/`, `index.html`, `src/main.ts`, the CSS, the drawing of the lit cross-section, the layout at phone and desktop sizes, input handling, turning the picture into an image file for the "save picture" control, and the browser tests in `tests/e2e/`. The owner builds the page against the types of one file, `src/session/result-page-types.ts`, which the first task writes with no behaviour. `design.md` gives that file in full in its section "Interface contract", with the names, signatures and full wording of every copy function and constant. The line of the brief's "Done when" about rendering every combination without overlap is the owner's to meet, and no task here claims it.

The input is `docs/briefs/06-result-page.md`; the steering files in `.kiro/steering/`; `docs/architecture.md` and `docs/roadmap.md`; the visit-flow spec under `.kiro/specs/visit-flow/`, above all its contract file `src/session/visit-flow-types.ts` and its decisions D1, D13, D15 and D17 and its open questions Q1 to Q4; and the code in `src/config`, `src/session`, `src/storage` (still empty), `src/copy`, and, read only, `src/ui/house/` and `src/ui/visit/`. Open points are settled in the Decisions section of `design.md` (D1, D2 and so on). Every new number was listed as a question for the project owner (Q1, Q2 and so on) in the same document. Those questions, Q1 to Q7, were decided on 2026-11-15 on the owner's behalf, at the owner's request, and every proposed value was kept; `design.md` gives each decision with its reasons. The visit-level false alarm limit of 0.2 (visit-flow Q1) and visit-flow Q1 to Q4 were open when this spec was written. Visit-flow Q1 to Q4 were decided by the owner's coordinator on 2026-11-16, at the owner's request, and the owner may reverse each of them; the limit stays 0.2.

Comparison with past visits is the second thing the roadmap cuts if time runs short. Its requirement (R20) is met by tasks of its own that come after saving and deleting, so that they can be left out without undoing anything.

Out of scope: drawing, layout, input handling, the image file and the browser tests (the owner's); the swapped repeat itself (brief 08); the missed-sound replay (brief 07); the no-headphone replay (brief 09), apart from keeping the visit log so that it can be exported; the robot module (brief 10), apart from saving nothing in robot mode.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Page**: the result page the project owner builds by hand in `src/ui`. It imports only `src/session`, `src/copy` and `src/config`.
- **Contract_File**: `src/session/result-page-types.ts`, the types the Page uses to save, list, compare and delete visits and to read the Result_Picture.
- **Visit_Flow**, **Visit_Log**, **Visit_Summary**, **Room_Summary**, **Visit_Ear_Result**, **Result_Snapshot**, **Visit_Limit**: as in the visit-flow spec. The Visit_Limit is `visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction`, 0.2, proposed by the visit-flow spec and decided by the owner's coordinator on 2026-11-16, at the owner's request (visit-flow Q1).
- **Live_Result**: the visit the Visit_Flow shows in its `result` stage, read from a Result_Snapshot.
- **Floor**: one Room_Summary of a visit, drawn as one floor of the house. Floors are visited in the order of the house, from the lowest up.
- **Wing**: the left or the right half of a Floor, one per ear.
- **Wing_State**: the state of a Visit_Ear_Result: `found`, `betterThanFloor`, `worseThanCap` or `unreliable`.
- **Floor_Scale**: the range of one Floor from its own loudest playable level, the `searchCapDb` of its Room_Summary, down to the quietest playable level, `floorDb`.
- **Light_Depth**: how far the light reaches into a Wing, as a fraction from 0 (dark) to 1 (the far wall), or none for an `unreliable` Wing, which is drawn hatched.
- **Result_Picture**: the frozen plain-data model of the lit cross-section that `resultPicture` returns: every Floor and Wing with its Light_Depth and lines, the lines above and beside the picture, and the Limits_Statement.
- **Limits_Statement**: the four sentences of `wording.md`, "What the result page must always say", written once in `src/copy/limits-statement.ts`.
- **Exempt_Terms**: `diagnosis` and `clinical`, the only banned terms the Limits_Statement may use, and only in the negative (`wording.md`).
- **Copy_Check**: `npm run check:copy`, which checks every string exported from `src/copy` against the banned terms in `src/config/banned-terms.ts`.
- **Copy_Hook**: the hook under `.kiro/hooks/` that runs the Copy_Check when a file under `src/copy/` is saved.
- **Storage_Area**: the part of the browser's `Storage` interface the archive uses: `getItem`, `setItem` and `removeItem`. `window.localStorage` is one.
- **Storage_Key**: `did-you-hear-that:saved-visits:v1`, the one key of local storage this product uses.
- **Store_Value**: the JSON text under the Storage_Key: a format version and a list of Store_Entries.
- **Store_Entry**: one saved visit as storage keeps it: its id, wall time, local date, visit type, headphone name, Payload and Checksum.
- **Payload**: the JSON text of what a saved visit holds beyond its envelope: the Visit_Log, the Visit_Summary and the settings it was drawn with.
- **Checksum**: a 32-bit hash over every field of a Store_Entry except itself, written as eight hexadecimal digits.
- **Unreadable_Entry**: a Store_Entry whose fields, Checksum or Payload do not check. It is kept as it was and not shown.
- **Unreadable_Value**: a Store_Value that is not JSON, not of the expected shape, or of another format version.
- **Visit_Store**: the object `createVisitStore` in `src/storage/create-visit-store.ts` returns. It reads and writes the Store_Value and knows nothing of visit logs.
- **Visit_Archive**: the object `createVisitArchive` in `src/session/create-visit-archive.ts` returns. It is what the Page calls to save, list, delete and export.
- **Saved_Visit**: a readable Store_Entry as the Visit_Archive gives it: envelope fields, Visit_Summary, Visit_Log, `floorDb` and `swappedRepeatDifferenceDb`.
- **Headphone_Name**: the name the visitor may give the headphones. Its **Tidy_Name** is the typed text in Unicode NFC with every run of white space made one space and trimmed, or none when nothing is left. Two names are the **Same_Name** when their Tidy_Names are equal ignoring letter case.
- **Earlier_Visit**: for a shown visit, the most recently saved Saved_Visit before it whose Headphone_Name is the Same_Name.
- **Outline**: the faint mark of an Earlier_Visit's Light_Depth drawn in the same Wing.
- **Wall_Clock**: the injected source of the date: epoch milliseconds and the visitor's local calendar date. `createSystemWallClock` in `src/config/system-wall-clock.ts` is the one on the page.
- **Robot_Mode**: the page opened in robot mode (brief 10). The page's entry gives the mode `robot` to the Visit_Archive.
- **Property_Suite**: the property tests of this spec under `tests/properties/`, named `result-page-cp<n>-*.property.test.ts`.

## Requirements

### Requirement 1: The interface contract comes first

**User story:** As the project owner building the page by hand, I want every type I may call and read in one small file before any behaviour exists, so that I can build the page while the rest is written.

#### Acceptance criteria

1. THE Contract_File SHALL hold, as TypeScript types, the options and methods of the Visit_Archive, the Saved_Visit, the list, the outcomes of saving and deleting, the Result_Picture with its Floors, Wings, Outlines and lines, the input of `resultPicture`, and the shapes of `createVisitArchive`, `resultPicture`, `findEarlierVisit` and `canonicalHeadphoneName`, exactly as "Interface contract" in `design.md` gives them.
2. THE Contract_File SHALL contain types only and no statement that runs, SHALL import only types, only from `src/config/` and `src/session/visit-flow-types.ts`, and SHALL be the first file this spec's tasks write.
3. WHEN the Contract_File changes after the first task, THE change SHALL only add types, fields or methods, and SHALL neither remove nor rename nor change the meaning of anything in it (D1).
4. THE Visit_Archive and the picture model SHALL offer the Page nothing beyond the Contract_File and the four functions it names.
5. THE spec SHALL add nothing to `src/session/visit-flow-types.ts`, because the Result_Snapshot already gives the Visit_Log and the Visit_Summary and `chooseSwappedRepeat(roomIndex)` already starts the swapped repeat (D2). IF a later task finds that the visit flow's contract must grow, THEN the addition SHALL be stated in `design.md` first and SHALL only add, as visit-flow D1 requires.
6. THE Contract_File's types `WallClock` and `StorageArea` SHALL be checked by type-level tests to fit `createSystemWallClock` in `src/config` and the Storage_Area of `src/storage`, and the copy's own names for Wing_States and reasons SHALL be checked to equal the session's.

### Requirement 2: New numbers are in config and name their decision

**User story:** As the project owner, I want every number this spec adds in one config file, marked with the question that decided it, so that I can see where each one comes from.

#### Acceptance criteria

1. THE file `src/config/result-page-config.ts` SHALL hold `resultPageConfig` with `foundLightDepthAtCapFraction`, `foundLightDepthAtFloorFraction`, `betterThanFloorLightDepthFraction`, `worseThanCapLightDepthFraction`, `savedVisitsMaxCount` and `headphoneNameMaxCharacterCount`, deeply frozen, every field name ending in its unit, with the values of "Config" in `design.md`.
2. THE comment of every field that is not fixed by the brief SHALL say that it was decided on 2026-11-15 on the owner's behalf, at the owner's request, and name its question in `design.md`, and `design.md` SHALL describe each as decided so wherever it mentions it.
3. THE config test SHALL check the values, the unit endings, deep freezing, that `0 = worseThanCapLightDepthFraction < foundLightDepthAtCapFraction < foundLightDepthAtFloorFraction < betterThanFloorLightDepthFraction = 1`, and that both counts are positive whole numbers.
4. THE spec SHALL change no value of `hearingMethodConfig`, `audioOutputConfig`, `audioSafetyConfig` or `visitFlowConfig`, and no steering file.
5. THE code of this spec in `src/session`, `src/storage` and `src/copy` SHALL contain no number that sets a Light_Depth, a limit or a count other than values read from `src/config`, apart from 0 and 1.

### Requirement 3: Time and randomness

**User story:** As the author of the tests, I want saving and listing to run the same way every time, so that a broken case can be replayed.

#### Acceptance criteria

1. THE Visit_Archive SHALL read the date only from the injected Wall_Clock, and SHALL not read a clock itself, as the lint rules for `src/session` require.
2. THE Visit_Archive SHALL draw every Saved_Visit id from a random source made from the seed it was created with.
3. THE file `src/config/system-wall-clock.ts` SHALL hold `createSystemWallClock`, which gives epoch milliseconds from `Date.now()` and the local calendar date of that moment as `YYYY-MM-DD`.
4. THE Visit_Store and the Visit_Archive SHALL order saved visits by the order in which they were saved, never by their wall times, so that a system clock set back cannot reorder them.
5. THE Visit_Store, the Visit_Archive and `resultPicture` SHALL run under Node in Vitest with an in-memory Storage_Area in place of local storage.

### Requirement 4: The stored format

**User story:** As the visitor, I want my visits kept in this browser only, in a form a later version of the house can recognise.

#### Acceptance criteria

1. THE Visit_Store SHALL keep every saved visit under the one Storage_Key, as one Store_Value holding the format version 1 and the list of Store_Entries in save order, as "The stored format" in `design.md` gives it.
2. THE Store_Entry SHALL hold the Saved_Visit id, the wall time in epoch milliseconds, the local date, the visit type, the Tidy_Name or null, the Payload as JSON text, and the Checksum.
3. THE Visit_Store SHALL read and write no key of local storage other than the Storage_Key.
4. THE product SHALL send nothing it saves or reads anywhere: no network request, no cookie, and no storage other than local storage under the Storage_Key.
5. THE `src/storage` module SHALL import only from `src/config`, and SHALL treat the Payload as text whose content it does not read (D4).

### Requirement 5: Reading saved visits

**User story:** As the visitor, I want to see the visits I saved, newest first, and never a wrong one.

#### Acceptance criteria

1. WHEN the Visit_Store reads and the Storage_Key holds nothing, THE Visit_Store SHALL report the state `ready` with no entries.
2. WHEN the Visit_Store reads a Store_Value of format version 1, THE Visit_Store SHALL report `ready`, every Store_Entry whose fields and Checksum check, in save order, and the number of Unreadable_Entries.
3. THE Visit_Store SHALL count as unreadable a Store_Entry with a missing or mistyped field, an id that is not eight lowercase hexadecimal digits, an id already used by an earlier entry, a local date that is not a calendar date, a visit type other than `quick` or `full`, or a Checksum that does not match.
4. WHEN the Visit_Archive lists, THE Visit_Archive SHALL read local storage at that moment and give every readable Saved_Visit newest first, each with its date label, visit type label and delete label from `src/copy`, the number of Unreadable_Entries, whether a save can be tried, and the lines to show.
5. THE Visit_Archive SHALL count as unreadable an entry whose Payload is not JSON, whose Payload format version is not 1, whose Visit_Summary or Visit_Log does not have the shape of the visit-flow contract, whose Visit_Summary breaks a rule of "Checking a payload" in `design.md`, or whose visit type differs from its Visit_Log's.
6. THE Visit_Archive SHALL give the Visit_Summary of a Saved_Visit as it was saved, and SHALL not compute it again from the Visit_Log (D9).

### Requirement 6: Writing and deleting

**User story:** As the visitor, I want saving and deleting to do exactly what I asked and nothing else.

#### Acceptance criteria

1. WHEN the Visit_Store adds, changes or removes an entry, THE Visit_Store SHALL read the Store_Value again just before, and write the whole new Store_Value with one `setItem` call.
2. WHEN the Visit_Store writes, THE Visit_Store SHALL keep every other Store_Entry, readable or unreadable, as the same JSON value it read, and every field of the Store_Value it does not know.
3. WHEN one entry is removed and nothing else is left in the Store_Value, THE Visit_Store SHALL remove the Storage_Key.
4. WHEN all entries are removed, THE Visit_Store SHALL remove the Storage_Key, also when it holds an Unreadable_Value.
5. IF an entry to be changed or removed is not in the Store_Value, THEN THE Visit_Store SHALL write nothing and report `notFound`.
6. IF an entry to be added has an id already in the Store_Value, THEN THE Visit_Store SHALL write nothing and report `idTaken`.

### Requirement 7: When storage cannot be used

**User story:** As the visitor, I want the page to keep working and tell me plainly when this browser will not save, without losing what is saved.

#### Acceptance criteria

1. IF reading `localStorage` throws, gives null or undefined, or `getItem` throws, THEN THE Visit_Store SHALL report `unavailable`, and THE Visit_Archive SHALL list no visit and say that this browser does not let the house keep visits.
2. IF `setItem` throws an error the browser names as a full quota, THEN THE Visit_Store SHALL report `full`; IF it throws any other error, THEN `refused` (D8).
3. IF a write is refused or full, THEN THE Store_Value SHALL be exactly what it was before the write.
4. IF the Storage_Key holds an Unreadable_Value, THEN THE Visit_Store SHALL report `unreadable`, write nothing when asked to add, change or remove one entry, and remove the Storage_Key only when asked to remove all (D7).
5. THE Visit_Store and the Visit_Archive SHALL never throw because of anything local storage does or holds.
6. THE Visit_Archive SHALL never give a Saved_Visit that differs from a visit that was saved, whatever was changed in the Store_Value (D6).

### Requirement 8: Creating the archive, and robot mode

**User story:** As the project owner, I want one object for saved visits that works on the result, at the front door and in the replay mode, and that keeps nothing in robot mode.

#### Acceptance criteria

1. WHEN `createVisitArchive` is called with a function that returns local storage, a Wall_Clock, a seed and a mode, THE Visit_Archive SHALL touch local storage only inside its methods, and only through that function, called again at each method inside a `try`.
2. IF the seed is not a whole number from 0 to 2³² − 1, THEN `createVisitArchive` SHALL throw a `RangeError`.
3. WHILE the mode is `robot`, THE Visit_Archive SHALL never call the function that returns local storage, SHALL list the state `off` with no visits, SHALL refuse every save and every delete with the reason `robotMode`, and SHALL export nothing (visit-flow D15).
4. THE Visit_Archive SHALL be independent of the Visit_Flow, so that the Page may create it once for the page and use it outside the `result` stage (D3).

### Requirement 9: Saving the shown visit

**User story:** As the visitor, I want to save the visit I see, with a name for my headphones if I like, when I choose to.

#### Acceptance criteria

1. WHEN `save` is called with a visit's Visit_Log and Visit_Summary and the text the visitor typed as the Headphone_Name, THE Visit_Archive SHALL add one Store_Entry with a new id, the Wall_Clock's epoch milliseconds and local date, the visit type of the Visit_Log, the Tidy_Name or null, and a Payload holding the Visit_Log and the Visit_Summary unchanged with `hearingMethodConfig.floorDb` and `hearingMethodConfig.swappedRepeatDifferenceDb` (D9).
2. THE Visit_Archive SHALL save only when `save` is called, which the Page does on the visitor's press, and SHALL save nothing when the result is reached (D10).
3. WHEN `save` is called again on the same page with the same Visit_Log object, and the visit it saved is still stored, THE Visit_Archive SHALL change only the Headphone_Name of that entry when it differs, and add no entry.
4. IF the Tidy_Name has more Unicode code points than `headphoneNameMaxCharacterCount`, THEN THE Visit_Archive SHALL refuse with `nameTooLong` and write nothing.
5. IF as many readable visits are saved as `savedVisitsMaxCount`, THEN THE Visit_Archive SHALL refuse a new save with `tooMany` and delete nothing (D12).
6. IF the Visit_Store reports `unavailable`, `unreadable`, `refused` or `full`, THEN THE Visit_Archive SHALL refuse with that reason and give the line for it from `src/copy`.
7. IF the Visit_Store reports `idTaken`, THEN THE Visit_Archive SHALL draw a new id and try again.
8. WHEN a save succeeds, THE outcome SHALL give the Saved_Visit as a later list gives it, and the line for a saved visit.

### Requirement 10: Deleting and exporting

**User story:** As the visitor, I want to delete any one saved visit or all of them.

#### Acceptance criteria

1. WHEN `deleteVisit(id)` is called for a listed visit, THE Visit_Archive SHALL remove that entry and nothing else, and give the line for a deleted visit.
2. WHEN `deleteAll` is called, THE Visit_Archive SHALL remove the Storage_Key, and give the number of visits that were listed and the line for every visit deleted.
3. IF a delete is refused, THEN THE outcome SHALL give the reason (`robotMode`, `unavailable`, `unreadable`, `refused` or `notFound`) and its line.
4. WHEN `exportVisitLog(id)` is called for a listed visit, THE Visit_Archive SHALL return the JSON text of its Visit_Log, and otherwise null (D26).

### Requirement 11: A saved visit and the visit log

**User story:** As the author of the no-headphone replay, I want a saved visit to hold the same visit log the flow produced, so that it can be played back and checked against the engine.

#### Acceptance criteria

1. THE Payload SHALL hold the Visit_Log exactly as the Result_Snapshot gave it, so that `JSON.parse` of the exported text deep-equals `JSON.parse(JSON.stringify(log))`.
2. THE Payload SHALL hold the Visit_Summary that was shown, and the `floorDb` and `swappedRepeatDifferenceDb` in force when it was saved.
3. THE Visit_Archive SHALL check the Visit_Log of a Payload only for its format version 1, its visit type and its rooms matching the Visit_Summary's, and SHALL leave the full check of a log against the engine to the no-headphone replay spec (D9).
4. THE Visit_Flow SHALL still write nothing to local storage (visit-flow D15). Only the Visit_Archive writes.

### Requirement 12: The picture: floors and wings

**User story:** As the visitor, I want each floor of the house lit as far as each ear caught a sound there, with a plain line for each wing.

#### Acceptance criteria

1. WHEN `resultPicture` is given a Live_Result, or a Saved_Visit, THE Result_Picture SHALL give one Floor per Room_Summary in visit order, which is the order of the house from the lowest floor up, and the rooms of the house the visit did not enter.
2. THE Result_Picture SHALL give, for each Floor, its room, room name, pitch label, a short label and a sentence for its left and right difference, the offer of the swapped repeat or none, and a description for a visitor who cannot see the picture.
3. THE Result_Picture SHALL give, for each Wing, its ear, its Wing_State, its Light_Depth, its line, and, for an `unreliable` Wing, the line for its first reason.
4. THE line of a Wing SHALL be: for `found`, the quietest level caught, labelled relative to the visitor's calibration; for `betterThanFloor`, "Quieter than this house can whisper."; for `worseThanCap`, that the loudest sound the house may play here was not caught; for `unreliable`, that this room should be visited again.
5. THE Result_Picture SHALL be a pure function of its input and `src/config`, frozen, made of plain data, and SHALL not throw for any Visit_Summary the Visit_Flow or the Visit_Archive gives.

### Requirement 13: How far the light reaches

**User story:** As the visitor, I want deeper light to mean that a quieter sound was caught on that floor, and nothing more.

#### Acceptance criteria

1. THE Light_Depth of a `found` Wing SHALL be `foundLightDepthAtCapFraction` plus `(foundLightDepthAtFloorFraction − foundLightDepthAtCapFraction)` times the position of its threshold in its Floor_Scale, from 0 at the Floor's `searchCapDb` to 1 at `floorDb`, held between 0 and 1, as "How far the light reaches" in `design.md` gives it.
2. THE Light_Depth SHALL be `betterThanFloorLightDepthFraction` for `betterThanFloor`, `worseThanCapLightDepthFraction` for `worseThanCap`, and none for `unreliable`.
3. THE Light_Depth of a Wing SHALL depend only on its own Visit_Ear_Result, its Floor's `searchCapDb` and `floorDb`.
4. WHEN two `found` Wings are on the same Floor_Scale, THE Wing with the quieter threshold SHALL have a Light_Depth no shallower than the other's.
5. THE `floorDb` of a Live_Result SHALL be `hearingMethodConfig.floorDb`, and of a Saved_Visit the `floorDb` saved with it.
6. THE numbers of this mapping SHALL be those decided in Q1 on 2026-11-15 on the owner's behalf, at the owner's request, and the conflict of R14.5 SHALL be put to the owner (Q2), which was decided on the same day in the same way.

### Requirement 14: The picture never compares floors

**User story:** As the project owner, I want nothing the page says or draws from this model to compare one floor with another, because headphones differ at every pitch.

#### Acceptance criteria

1. THE Result_Picture SHALL hold no field computed from more than one Floor's results, other than the counts and the notice of R16.
2. THE Floor of a Result_Picture SHALL be the same whatever the other Floors hold, as long as the visit-level marking is the same.
3. THE Result_Picture SHALL order Floors only by their place in the house, never by a result.
4. THE strings of a Floor SHALL name no other Floor's room or pitch, and the strings outside the Floors SHALL name no room and no pitch.
5. WHERE the Page draws the picture, THE design SHALL tell the owner how the drawing can avoid suggesting that Floors can be compared, and SHALL put the remaining conflict between the brief's picture and `product.md` and `wording.md` to the owner as a question without settling it (D16, Q2). Q2 was decided on 2026-11-15 on the owner's behalf, at the owner's request: the brief's picture is kept, and the drawing SHALL carry no ticks, numbers or axis on a measuring line and nothing that joins one Floor to another.

### Requirement 15: Left and right, and the swapped repeat

**User story:** As the visitor, I want to see how far apart my left and right were on each floor, and to be offered the swapped repeat where they were far apart.

#### Acceptance criteria

1. THE short label of a Floor's difference SHALL be a dash when `rightMinusLeftDb` is null, `0 dB` when it rounds to 0, and otherwise its size in whole decibels with the side on which the quieter sound was caught.
2. THE difference SHALL be worded by side ("on your left", "on your right"), and SHALL not say whether it belongs to the ears or to the headphones.
3. WHEN the Result_Picture is of a Live_Result and the Room_Summary offers the swapped repeat, THE Floor SHALL give the room index to give to `chooseSwappedRepeat`, the line that explains the repeat and the label of its button.
4. THE Result_Picture of a Saved_Visit SHALL offer no swapped repeat, because only the Live_Result can start one (D20).

### Requirement 16: What is said above the picture

**User story:** As the visitor, I want to know how often I answered when the house made no sound, and to be told plainly when that makes the whole visit unreliable.

#### Acceptance criteria

1. THE Result_Picture SHALL give the false alarm line built from the Visit_Summary's pooled false alarm and no-sound trial counts, in the form "You answered 2 of 9 times when I made no sound."
2. WHEN the Visit_Summary says the pooled false alarm rate is above its limit, THE Result_Picture SHALL give a notice with a heading and a line saying that the whole visit is unreliable and inviting the visitor to walk through the house again.
3. THE notice SHALL name the limit from the Visit_Summary's own `visitFalseAlarmRateLimitFraction`, so that it follows whatever value the owner chooses in visit-flow Q1 and a Saved_Visit keeps the limit it was judged by.
4. THE Result_Picture SHALL say nothing about the answers outside every window (visit-flow Q2, decided by the owner's coordinator on 2026-11-16, at the owner's request: no rule for those answers).

### Requirement 17: The limits statement

**User story:** As the project owner, I want the four statements of `wording.md` next to the picture every time, and the copy check to let through only their two negative uses of banned words.

#### Acceptance criteria

1. THE file `src/copy/limits-statement.ts` SHALL hold `limitsStatement`: a heading and the four sentences of "Limits statement" in `design.md`, as constants.
2. THE Result_Picture SHALL always hold `limitsStatement` itself, whatever its input.
3. THE Copy_Check SHALL allow the Exempt_Terms only in the strings of the export `limitsStatement` of `src/copy/limits-statement.ts`, and SHALL still report every other banned term there.
4. THE list of Exempt_Terms SHALL live in `src/config/banned-terms.ts` beside the banned terms, so that the check and the copy share one source.
5. THE copy test SHALL check that each Exempt_Term in the Limits_Statement comes after "not" in its sentence.
6. WHERE the Page shows a picture or saves it as an image, THE Page SHALL show the Limits_Statement next to it, never behind a link, and include it in the image. This is the owner's to build.

### Requirement 18: Every string is in src/copy

**User story:** As the project owner, I want every string the result page shows ready in `src/copy`, so that I add none of my own.

#### Acceptance criteria

1. THE copy of this spec SHALL hold every constant and function of "The copy" in `design.md`, with that wording: headings, the labels of the save picture, headphone name, save, show, delete and delete all controls, the line for no saved visits, every line for saving or deleting that is not possible, and every sentence that depends on a result.
2. THE copy functions SHALL take plain values and names defined in `src/copy`, import only from `src/config` and other copy files, and throw a `RangeError` for values that do not fit.
3. THE copy SHALL never put a Headphone_Name or any other text the visitor typed inside a sentence of the house (D11).
4. THE copy SHALL contain no banned term outside the Limits_Statement, SHALL say nothing about accuracy, and SHALL label every level it shows as relative to the visitor's own calibration.
5. THE copy SHALL name visit types by their number of rooms and not by minutes (D22).
6. THE copy tests SHALL check every constant and the output of every function for representative inputs against the banned terms.

### Requirement 19: The copy hook

**User story:** As the project owner, I want the agent told at once when a saved copy file holds a banned word.

#### Acceptance criteria

1. THE file `.kiro/hooks/copy-check-on-copy-save.json` SHALL hold one `PostFileSave` hook whose matcher takes every file under `src/copy/` and nothing else, and whose command runs the Copy_Check in hook mode, with the form of `.kiro/hooks/render-check-on-synth-save.json`.
2. WHEN the Copy_Check runs in hook mode and finds a banned term, THE Copy_Check SHALL write every finding to standard error and exit with 1, as the render tool's hook mode does, so that Kiro gives the findings to the agent.
3. WHEN the Copy_Check runs in hook mode and finds none, THE Copy_Check SHALL print one line on standard output and exit with 0.
4. THE hook file SHALL be checked by a test like `tests/render-check-hook.test.ts`.
5. THE design SHALL not claim that the hook's findings reach the agent in a headless CLI session, which `docs/experiments/hook-catches.md` did not see (D24).

### Requirement 20: Comparison with an earlier visit

**User story:** As the visitor, I want my earlier visit with the same headphones drawn faintly in the same wings, so that I can see this visit against that one.

#### Acceptance criteria

1. WHEN `findEarlierVisit` is given a list, a Headphone_Name and the id of the shown Saved_Visit or none, THE function SHALL return the Earlier_Visit: the newest listed visit saved before the shown one (or the newest of all for a visit not saved) whose Headphone_Name is the Same_Name, or none.
2. IF the Headphone_Name has no Tidy_Name, THEN `findEarlierVisit` SHALL return none.
3. WHEN `resultPicture` is given an Earlier_Visit, THE Result_Picture SHALL give, for every Wing of a Floor whose room the Earlier_Visit also has, the Earlier_Visit's Wing_State and an Outline at the Light_Depth its result would have on the shown Floor's Floor_Scale, or no Outline for `unreliable`, and the line that names the Earlier_Visit's date and says that each visit is relative to its own calibration.
4. THE Result_Picture SHALL give no Outline on a Floor the Earlier_Visit did not enter, and no sentence that compares the two visits.
5. WHERE the tasks of this requirement are left out, THE Result_Picture SHALL give no Outline and no comparison, and nothing else SHALL change.
6. THE tasks of this requirement SHALL come after saving and deleting, and SHALL only add files or add to files, so that leaving them out undoes nothing.

### Requirement 21: Properties

**User story:** As the project owner, I want the brief's properties and those of storage and the model checked over every combination, so that I can trust what the page is given.

#### Acceptance criteria

1. THE Property_Suite SHALL check that for every combination of Wing_States, differences, false alarm counts, visit limits and markings, kinds of picture, dates, list states, refusals and, once R20 is built, Earlier_Visits, no generated string holds a banned term outside the Limits_Statement, and every Result_Picture holds the Limits_Statement (brief property "Safe wording", CP1).
2. THE Property_Suite SHALL check that no generated string compares, ranks, takes a mean of or sums Floors (brief property 2, CP2).
3. THE Property_Suite SHALL check the further properties of "Correctness properties" in `design.md` with the run counts stated there, each with a new random fast-check seed on every run.
4. IF the property files of this spec take more than the time budget of `design.md` together, THEN the task SHALL stop and report the times to the owner, and SHALL change no run count.
5. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression test in `tests/properties/result-page-regressions.test.ts`, first with `it.fails`, and the task SHALL stop and report it so that the fix is committed separately.

### Requirement 22: The open choices of the visit flow

**User story:** As the project owner, I want the result page to work whatever I choose in the visit flow's open questions.

#### Acceptance criteria

1. THE result page SHALL work for any Visit_Limit the owner chooses (visit-flow Q1), reading it from the Visit_Summary, and SHALL describe 0.2 as decided by the owner's coordinator on 2026-11-16, at the owner's request.
2. THE result page SHALL work whether or not the owner adds a rule for answers outside every window (visit-flow Q2), and whatever the visits are called or how long they take (visit-flow Q3).
3. THE result page SHALL work whether a device change starts the room again or ends the visit (visit-flow Q4), because each Floor is drawn on its own Floor_Scale.

### Requirement 23: Boundaries and documentation

**User story:** As the project owner, I want the tasks to stay out of the page I am building.

#### Acceptance criteria

1. THE tasks of this spec SHALL create or change no file under `src/ui/`, `tests/e2e/` or `tests/properties/screen-leak/`, nor `index.html`, `listen.html`, `src/main.ts`, the root `README.md` or anything under `.kiro/steering/`.
2. THE tasks of this spec SHALL change nothing in `src/session/visit-flow-types.ts`, `src/engine/` or `src/audio/`, and no existing value in `src/config`.
3. THE tasks SHALL not commit; each task's work is committed afterwards by a separate run with a one-line message, so anything a task records goes in `design.md` or a README.
4. THE READMEs of `src/storage/`, `src/session/`, `src/copy/`, `src/config/`, `tools/` and `tests/properties/` SHALL describe what this spec adds, and SHALL follow `wording.md`.

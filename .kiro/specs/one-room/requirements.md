# Requirements: one room

## Introduction

On 2026-11-16 the project owner asked for a change of shape. In the owner's words, translated from Chinese: the interface should not be the earlier one with a game set into it, but one made for the game; the visit can use one room only; one room can hold several kinds of sounds, which can be found together and need not be found one after another; there can be several monsters, not only ghosts; think about what makes it more fun; build a version directly, and the owner will look at it. Shortly before, the owner had said that one room took too long.

This spec makes that change. The rooms of a visit, each of which is one pitch and one sound, become creatures that share one room. Their threshold searches run as before, each with its own seed, cap and floor, and their trials take turns in an order that nothing on the screen gives away. One practice, the roll call, introduces every creature. One lantern and one count serve the whole room, and each creature has a card that shows how its own chase stands. A creature whose search ends goes home and the others go on. The screen of the room is new: a dark room with a doorway at each side, the lantern hanging in the middle and the creatures' cards along the floor. A caught sound shows its creature in the doorway of its side, and a sound that went by is seen leaving.

It adds the mixed runner, the roll call and the turn seed in `src/session`; the creatures of the room's snapshot; a rise limit by sound for a mixed span in the output stage, which restates audio-safety rule 4 for a room with several sounds and was approved by the owner on 2026-11-17; one config value; the creatures' copy; the screen of the room under `src/ui/room/`; and browser tests of that screen. The engine, the sounds, calibration, the headphone check, the result picture and the swapped repeat stay as they are.

**How it was built.** The Kiro credits ran out during the audible-start spec (its `tasks.md`, "The light plan of 2026-11-16"). The code of this spec was written by Claude Code in this working tree, at the owner's request, and the owner asked for a version to look at, not for a plan to approve first. So this spec was written alongside the code and finished after it. It is the record of what was built and why, in the form the earlier specs have, and the code cites it by section and by decision. Unlike the earlier specs, the screen is part of this spec, because the request was for a screen.

**The decisions.** Every point the request left open is settled in `design.md` as a decision (D1, D2 and so on) and listed in "Questions for the project owner", each marked "Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it". One decision changes how an audio-safety rule is counted (D4). The coordinator put it to the owner, who approved it on 2026-11-17. Nothing else in this spec loosens an audio-safety rule or value. A question that only a listening session can settle is marked FOR THE OWNER and left open.

Also read: every file in `.kiro/steering/`; `docs/architecture.md`; the specs under `.kiro/specs/visit-flow/`, `audible-start/` (above all the light plan in its `tasks.md`), `audio-output/`, `missed-sound-replay/` and `threshold-search/`; and the code of `src/session`, `src/audio/output`, `src/copy`, `src/ui/visit`, `src/ui/room`, `tests/properties` and `tests/e2e`.

Out of scope: anything in `src/engine` (each creature's search is the threshold search, unchanged); the five sounds of `src/audio/synth`; calibration and the headphone check; the result picture, which still draws one floor for each pitch; the swapped repeat, which still runs one floor alone; saved visits; the no-headphone replay (brief 09), the robot module (brief 10) and the last door (brief 11); and what the room sounds like on real headphones, which only the owner's listening can tell.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Visit_Flow**, **Visit_Log**, **Visit_Summary**, **Room_Attempt**, **Snapshot**, **Visit_Event**, **Pause**, **Timer**, **Room_Runner**, **Output_Shell**: as in the visit-flow spec.
- **Practice**, **Practice_Sound**, **Not_Heard_Notice**: as in the audible-start spec's light plan. A room practises before it counts; a Practice_Sound counts for nothing; the notice offers to try again or to go on.
- **Rise_Limit**, **Cap**, **Ceiling**: as in the audio-output spec and `audio-safety.md` (rules 4, 2 and 1).
- **Contract_File**: `src/session/visit-flow-types.ts`. This spec only adds to it (visit-flow D1).
- **Room**: one room of the visit as the Visit_Log and the result keep it: one pitch and one sound (`VisitRoom`). A quick visit has three and a full visit five.
- **Creature**: a Room as the visitor meets it in the One_Room: the maker of that Room's sound, with a name, a kind and a home.
- **One_Room**: the room the screen shows, in which the searches of several Rooms take turns.
- **Rooms_Together_Count**: `visitFlowConfig.roomsTogetherMaxCount`: how many Rooms' searches take turns in one Room_Run at most.
- **Together**: the state of a site whose Rooms_Together_Count is above 1. **One_At_A_Time**: the state of a site whose Rooms_Together_Count is 1, which runs its Rooms as the earlier specs describe.
- **Room_Run**: the searches that begin in the same step and take turns, from their Practice to the end of the last of them, or until the run is abandoned.
- **Member**: one Room of a Room_Run, with its Room_Attempt.
- **Track**: a Member's search inside the Mixed_Runner, with the trial it waits on.
- **Open_Track**: a Track whose search has not finished and which has a trial waiting.
- **Turn**: the choice of the Track whose trial is presented next.
- **Turn_Source**: the seeded random source that draws every Turn of one Room_Run.
- **Turn_Seed**: the seed of the Turn_Source, computed from the engine seeds of the Room_Run's Members by `turnSeedOf`.
- **Mixed_Runner**: `createMixedRoomRunner` of `src/session/room-runner.ts`, which presents and decides the trials of several Tracks, one at a time.
- **Roll_Call**: the Practice of a Room_Run Together: every Member practised in turn, with one Not_Heard_Notice for all of them.
- **Counting**: the part of a Room_Run after its Practice, in which every trial is logged and decided as the visit-flow spec says.
- **Decision**: the moment a trial is scored: its answer was taken, or its time to answer is over.
- **Mixed_Span**: a span of the Rise_Limit begun with `beginRoom({ riseLimitPer: "sound" })`, in which each sound is limited by the last sound of the same sound id on that ear.
- **Lantern**, **Chase**: as in the game layer of 2026-11-16 (`src/session/lantern.ts`, `chase-score.ts`): the lights an answer spends, and the count of caught sounds with its row.
- **Creature_Tally**: the Chase of one Creature alone: how many of its sounds were caught and the quietest catch on each side.
- **Scene**: the picture of the One_Room: a wall with a **Doorway** at each side, the floor and the hanging Lantern (`src/ui/room/build-room-scene.ts`).
- **Shelf**: the row of **Cards** along the floor of the Scene, one for each Creature (`src/ui/room/creature-shelf.ts`).
- **Caption**: the line under the Scene in which the house says what just happened.
- **Phone_On_Its_Side**: a screen at most 520 CSS pixels high and wider than it is high.
- **Property_Suite**: the property tests under `tests/properties/` that this spec extends or adds to.

## Requirements

### Requirement 1: The contracts only grow

**User story:** As the project owner, I want the one room added to the contracts the rest of the house is built against, with nothing in them renamed or changed, so that the result page, the replay and the swapped repeat keep working.

#### Acceptance criteria

1. THE Contract_File SHALL gain exactly the additions of "Interface contract" in `design.md`: the fields `creatures` and `together` of `RoomSnapshot`, the fields `practising` and `notHeard` of `RoomPractice`, and the types `RoomCreature` and `PracticeMiss`.
2. Every field this spec adds to an existing type SHALL be optional, so that object literals written before it still compile, and the Visit_Flow SHALL give every one of them in every Snapshot of the stage `room`.
3. THE output stage's `beginRoom` SHALL gain one optional argument, `BeginRoomOptions`, and a call without it SHALL do what `beginRoom()` did before this spec.
4. THE additions SHALL remove, rename or change the meaning of nothing in the Contract_File or in the output stage's interface. `VisitLog`, `VisitSummary`, `RoomSummary`, `VisitStage`, `PauseReason`, `TrialReaction`, every Visit_Event and every type of the replay, the result and the swapped repeat SHALL stay as they are.
5. THE spec SHALL change nothing in `src/engine/`, `src/audio/synth/` or `src/storage/`.
6. THE Visit_Log of a visit Together SHALL have the shape it has One_At_A_Time: one Room_Attempt for each run of each Room, every trial and every Practice_Sound logged with its own Room and attempt, so that the summary, the replay, the result picture, the saved visit and the swapped repeat read it unchanged.

### Requirement 2: The number is in config

**User story:** As the project owner, I want one number to say how many searches share a room, so that I can go back to one room at a time by changing it.

#### Acceptance criteria

1. `visitFlowConfig` SHALL hold `roomsTogetherMaxCount` with the value 5, frozen, with a comment that says what the value does at 1 and from the Room count of the longest visit up.
2. THE config test SHALL check that the value is a whole number and is at least the Room count of the longest visit.
3. `createVisitFlow` SHALL take `roomsTogetherMaxCount` as an option that stands in place of the config value, and SHALL throw a `RangeError` unless it is a whole number from 1 up.
4. WHERE the Rooms_Together_Count is 1, THE Visit_Flow SHALL run the Rooms one after another, each with its own Practice and a rest before the next, as it did before this spec.
5. THE spec SHALL change no other value of any config. Every quantity of the house that this spec uses in `src/session`, `src/copy` and `src/audio/output` (a level, a time, a count that could be tuned) SHALL be read from `src/config`. The constants of the Turn_Seed's fold are part of its definition and SHALL stay beside it.

### Requirement 3: The searches share one room run

**User story:** As the visitor, I want every creature of the house in one room, so that the visit is one game and not the same game three or five times.

#### Acceptance criteria

1. WHEN the Visit_Flow starts a Room_Run, THE Members SHALL be the Rooms of the visit that have not finished, in visit order, and at most the first Rooms_Together_Count of them.
2. THE Visit_Flow SHALL give each Member its own threshold search, made by `createThresholdSearch` with `hearingMethodConfig`, its own engine seed drawn from the visit's random source in Member order, its own search cap and search floor under the calibration in use, and its own Room_Attempt, all as a Room has them One_At_A_Time.
3. THE Mixed_Runner SHALL present one trial at a time and SHALL decide it before it presents another: with the response window, the gap, the no-sound trials and the refusal rule of the visit-flow spec, and with the sound of the Room whose trial it is.
4. THE Visit_Flow SHALL log every trial with the Room and the attempt of its own Member, and SHALL hand each scored trial to that Member's search alone.
5. WHEN a Member's search finishes, THE Visit_Flow SHALL end that Member's Room_Attempt as `finished`, SHALL emit `roomFinished` for its Room, and SHALL go on with the other Members.
6. WHEN every Member's search has finished, THE Room_Run SHALL end. IF Rooms of the visit are left, THEN THE Visit_Flow SHALL show the rest between rooms and start the next Room_Run from it; otherwise it SHALL go on to the replay of missed sounds.
7. THE Mixed_Runner SHALL throw a `RangeError` for an empty list of Tracks, and `createRoomRunner` SHALL be the Mixed_Runner with one Track, so that a Room alone and the swapped repeat run on the same code as the One_Room.

### Requirement 4: Whose turn it is

**User story:** As the visitor, I want not to know which creature comes next, so that I listen instead of counting.

#### Acceptance criteria

1. THE Mixed_Runner SHALL draw a Turn once when the Counting starts and once after every Decision, and SHALL draw only while two or more Tracks are open.
2. THE Turn SHALL fall on each Open_Track with the same chance: with `n` Open_Tracks in Member order, on the Track at the index `floor(u × n)`, held to `n − 1`, for a draw `u` of the Turn_Source.
3. WHILE one Track is open, THE Mixed_Runner SHALL give every Turn to it and SHALL draw nothing.
4. THE Turn_Seed SHALL be `turnSeedOf` of the Members' engine seeds in Member order: a pure function that folds the seeds to one whole number from 0 to 2³² − 1 and draws nothing from the visit's random source.
5. `turnSeedOf` SHALL throw a `RangeError` for a seed that is not a whole number from 0 to 2³² − 1.
6. WHILE a trial waits through a Pause, or is asked for again after the Output_Shell refused its sound, THE Turn SHALL stay with its Track, and THE Mixed_Runner SHALL draw nothing for it.
7. Between the start of a trial's gap and its Decision, THE Mixed_Runner SHALL call nothing that reaches the interface.
8. THE Turns of every Room_Run SHALL be found again from the Visit_Log alone: from the engine seeds of its Room_Attempts and the order of its decided trials.

### Requirement 5: The roll call

**User story:** As the visitor, I want to meet every creature and hear its sound once in each ear before anything counts, so that I know what I am listening for.

#### Acceptance criteria

1. WHEN a Room_Run starts Together, THE Visit_Flow SHALL practise its Members one after another in Member order: each Member's sound in the left ear and then in the right ear, at that Member's practice levels (`practiceLevelsDb` of the audible-start light plan), with the gap and the answers of a Practice.
2. THE Visit_Flow SHALL log every Practice_Sound in the Visit_Log's practice, with its own Room and attempt, and never among the trials.
3. WHEN a round of the Roll_Call has left a side of a Member uncaught, THE Visit_Flow SHALL begin the Pause `practiceNotHeard` once, after the last Member of the round, and its view SHALL name every side that was not caught, in the order practised.
4. WHEN `resume` is called in that Pause, THE Visit_Flow SHALL practise a new round for those sides alone. WHEN `goOnWithoutPractice` is called, THE Counting SHALL start without them.
5. WHILE the Roll_Call is in its phase `practice`, THE view SHALL give `practising`: the Room whose sound plays or is about to play. It SHALL never give the side.
6. WHEN the Roll_Call is over, THE Visit_Flow SHALL light the Lantern, SHALL emit `countingStarted` once for each Member, and SHALL start the Counting of all Members at once.
7. THE roll call's runner SHALL throw a `RangeError` for an empty list of Rooms, and `createPractisedRoomRunner` SHALL be that runner with one Room, so that a Room alone practises on the same code.
8. WHEN a Practice_Sound is caught Together, THE line of `practiceSoundScored` SHALL name the Creature that made it.

### Requirement 6: No jump upward, counted by creature

**User story:** As the visitor, I want no creature's sound ever to come back much louder than it was last time, however the creatures take turns.

#### Acceptance criteria

1. WHEN a Room_Run starts Together, THE Visit_Flow SHALL begin a Mixed_Span: `output.beginRoom({ riseLimitPer: "sound" })`.
2. WHILE a Mixed_Span holds, THE Output_Shell SHALL hold every Practice_Sound and every trial sound to at most one upward step above the last sound of the same sound id on the same ear (rule 4 as restated in `audio-safety.md`), and SHALL hold the first sound of a sound id on an ear to no earlier sound.
3. THE Cap, the Ceiling, the fades, the pause on hide and every other audio-safety rule SHALL apply in a Mixed_Span exactly as they do outside one.
4. WHEN `beginRoom` is called without an argument, THE Output_Shell SHALL begin a span in which every sound on an ear is limited by the last sound on that ear, as before this spec.
5. WHEN the Room_Runs of a visit are over, THE Visit_Flow SHALL begin a plain span before the replay of missed sounds, so that the replay is a span of its own.
6. THE design SHALL record that the restatement of rule 4 was approved by the owner, and on which day.

### Requirement 7: Pauses, a change of device and a stop

**User story:** As the visitor, I want a pause to cost me nothing and a change of headphones to start again only what it has to.

#### Acceptance criteria

1. WHILE a Pause holds in the One_Room, THE Visit_Flow SHALL schedule nothing. WHEN it ends, THE trial or Practice_Sound it interrupted SHALL be presented again as it was, by the same Creature.
2. WHEN a Pause begins in the One_Room, THE Visit_Log SHALL record it against the first Member that has not finished.
3. WHEN the output device changes during a Room_Run, THE Visit_Flow SHALL end the Room_Attempt of every Member that has not finished as `abandoned`, and of no other. A Member whose search had finished SHALL keep its result.
4. WHEN the visit comes back to the room after a calibration again and a correct headphone check, THE next Room_Run SHALL hold the Rooms that have not finished, with a new Room_Attempt, a new engine seed and a Roll_Call of their own, and SHALL hold no Room that has finished.
5. WHEN `stop` is called in the One_Room, THE Visit_Flow SHALL leave nothing scheduled and nothing sounding, as the visit-flow spec says of a room.

### Requirement 8: One lantern and one chase

**User story:** As the visitor, I want one lantern to look after and one count to raise, whoever is making the sound.

#### Acceptance criteria

1. THE Room_Run SHALL have one Lantern, lit when the Counting starts, and one Chase, which counts the scored trials of every Member.
2. WHILE the Roll_Call runs, an answer SHALL spend nothing. WHILE the Counting runs, an answer SHALL spend one light, and a catch SHALL give one back, as in the game layer of 2026-11-16.
3. IF an answer is given while the Lantern is dark, THEN THE Visit_Flow SHALL log it as ignored against the Member whose trial waits, or against the first Member that has not finished when no trial waits.
4. THE Snapshot of the room SHALL give `creatures`: for every Room that has begun a run, in visit order, whether it is `about` or `gone`, its Creature_Tally, and the top and the floor of its search.
5. THE fields of a `RoomCreature` SHALL change only when a Room_Run begins, in the moment a trial is scored and when its search ends, so that they say nothing of a trial that is not decided.
6. THE scale of the Chase SHALL reach from the highest search cap to the lowest search floor of the Members.
7. `chaseScoreOf` SHALL let a row of catches run on between Room_Attempts that were under way at the same time, and between no others.

### Requirement 9: The creatures and their words

**User story:** As the visitor, I want to know who is in the room by name, and to be told plainly what I caught and what went by.

#### Acceptance criteria

1. `src/copy/creature-copy.ts` SHALL give every sound id a Creature: a name, a kind, a home and one sentence for its sound, and every line the One_Room says of a Creature.
2. THE line of a caught sound SHALL name the Creature, the side, the pitch and the level, and SHALL give the level relative to the visitor's calibration.
3. THE lines of a sound that went by, of an answer on the other side and of a Creature that has gone home SHALL name the Creature and say only what happened.
4. THE line for an answer when no sound was made SHALL stay the fixed line of `wording.md`.
5. THE Not_Heard_Notice of the Roll_Call SHALL name each Creature and side that was not caught, SHALL ask the visitor to check the earpieces and the volume, and SHALL say what each of its two choices does.
6. THE front door, the rules and the announcement of the replay SHALL speak of creatures that take turns in one room, and SHALL promise nothing the One_Room does not do.
7. Every string of this spec SHALL be in `src/copy`, SHALL pass `npm run check:copy`, SHALL not mock the visitor, and SHALL not speak of hands.
8. THE Creatures SHALL be this project's own drawings and names. No trademark, logo or figure of anyone else SHALL be used.

### Requirement 10: The screen of the room

**User story:** As the visitor, I want a room made for this game: where the sounds come from, what I carry, and who is still about, at one look.

#### Acceptance criteria

1. THE screen SHALL show the Scene for the whole of the stage `room`: a Doorway at the left and at the right, the hanging Lantern with the count beside it, the Shelf with one Card for each Creature, the two answers, and the Caption.
2. WHILE the Roll_Call practises a Creature, THE screen SHALL show that Creature at the exact middle of the Scene with its introduction, and SHALL say that a sound is playing while its Practice_Sound plays.
3. WHEN a Practice_Sound is caught, THE screen SHALL show rings at the Doorway of its side and the house's line that names the Creature.
4. WHEN a counted sound is caught, THE screen SHALL show its Creature in the Doorway of its side, SHALL light its Card, and SHALL say the line of the catch.
5. WHEN a counted sound went by or was answered on the other side, THE screen SHALL show its Creature leaving through the Doorway of its side and SHALL say the line.
6. WHEN an answer was given to no sound, THE screen SHALL say the fixed line and SHALL show no Creature.
7. WHEN a turn with no sound goes by unanswered, THE screen SHALL show nothing at all.
8. THE Card of a Creature SHALL show its name, how many of its sounds were caught, a bar at each side for its quietest catch on that side, and, once its search has ended, that it has gone home.
9. WHEN a search ends, THE screen SHALL say where its Creature went, and THE bar's words SHALL say how many are still about.
10. WHILE the Lantern is dark, THE screen SHALL dim the Scene and SHALL say that the Lantern is out and that a light comes back.
11. WHILE a notice lies over the room, THE Scene SHALL stay as it was behind it, faint, and the answers SHALL not be offered.

### Requirement 11: Nothing before the answer

**User story:** As the project owner, I want the one room to keep the experience rule: nothing on the screen may tell when a sound plays or on which side before the visitor has answered.

#### Acceptance criteria

1. Between the start of a counted trial's gap and its Decision, nothing on the screen SHALL change because of that trial: no Creature, no Card, no word of the bar, no line and no light.
2. THE Creature of a counted sound SHALL be shown only after the Decision of its trial.
3. THE Practice MAY say that a sound is playing and who makes it, and SHALL never show the side: the practising Creature stands at the middle of the Scene, at the same distance from both Doorways.
4. THE Lantern SHALL change only with the visitor's own answers, with a catch in the moment it is scored and with the clock.
5. THE screen-leak properties of `tests/properties/screen-leak/` SHALL hold for the screen record of whole visits Together as they hold One_At_A_Time: a predictor that reads the screen does no better than chance at telling whether a trial has a sound and on which side.

### Requirement 12: No jump scares on the screen

**User story:** As the visitor, I want the room to stay calm: nothing flashes and nothing lunges.

#### Acceptance criteria

1. Every change of brightness in the Scene, on the Shelf and in the Caption SHALL be a fade of at least 0.2 seconds (audio-safety rule 9).
2. WHERE the visitor asks for less motion, THE screen SHALL show every state of the room with no movement of a Creature, the Lantern or the floor, and SHALL still fade.
3. A Creature SHALL appear at its place and fade in. It SHALL not move towards the visitor.

### Requirement 13: Small screens

**User story:** As a visitor on a phone, I want every part of the room on the page and nothing over anything else.

#### Acceptance criteria

1. At 360 by 640, 390 by 844, 640 by 360, 844 by 390, 768 by 1024, 1024 by 768 and 1280 by 800 CSS pixels, in every state of the room, no part of the room SHALL lie over another, every part SHALL be on the page, no word on a Card SHALL be cut off, and the page SHALL not scroll sideways.
2. WHILE the Roll_Call runs on a Phone_On_Its_Side, THE Shelf SHALL be hidden, the floor SHALL be low and the practising Creature SHALL stand clear under the words. WHEN the Counting starts, THE Shelf SHALL come in as a fade and the floor SHALL rise slowly.
3. On a Phone_On_Its_Side that is also narrower than 48rem, both counts SHALL stand at the right of the Lantern, each on a row of its own, clear of the bar's buttons.
4. On a narrow upright screen, the lines of the Counting SHALL end above the Doorways, and the count of a Card SHALL be whole for the longest count and for the words that say a Creature has gone home.
5. THE answers SHALL take touch as well as the keyboard, and the keys SHALL be named only where a keyboard is likely.

### Requirement 14: A screen for everyone

**User story:** As a visitor who cannot see the picture, I want the room in words.

#### Acceptance criteria

1. THE Scene SHALL be one image with a label that says what it is.
2. Every Card SHALL have a label that says who the Creature is, whether it is still about, how many of its sounds were caught and its quietest catch on each side, in words and relative to the calibration.
3. THE Caption, the line that a Practice_Sound is playing, the introduction of a Creature and the line of a dark Lantern SHALL be announced as status.
4. THE room SHALL pass the accessibility rules of axe-core in the browser tests, and every control SHALL be reachable and usable by keyboard.

### Requirement 15: The replay and the result after the one room

**User story:** As the visitor, I want the sounds I missed played again with the creature that made them, and the result to stay the picture it was.

#### Acceptance criteria

1. WHILE a missed sound is played again, THE screen SHALL show its Creature in the Doorway of the side it came from, with its words and the count of each side.
2. THE replay SHALL play the missed sounds in the order they were made, which Together is the order of the turns.
3. THE result SHALL show one floor for each Room with what the Visit_Summary says of it, unchanged by this spec.
4. THE swapped repeat SHALL run one floor alone, on a plain span, unchanged by this spec.

### Requirement 16: The earlier way stays

**User story:** As the project owner, I want to be able to go back to one room at a time with one number, and to know that both ways are checked.

#### Acceptance criteria

1. Every property of the visit flow (CP1 to CP10), the practice property of audible-start (CP1) and the screen-leak properties SHALL run for both ways the Rooms can run: One_At_A_Time, and Together with the shipped Rooms_Together_Count.
2. No run count, tolerance or timeout of an existing property SHALL be lowered, and no property SHALL be weakened.
3. THE whole-visit browser tests SHALL walk a site of either kind: they go on from a rest whenever the page offers one.
4. WHERE the Rooms_Together_Count is 1, THE screen SHALL name the Room and its place in the order of Rooms in the bar, as before; Together, the bar SHALL be empty through the Roll_Call and then say how many Creatures are still about.

### Requirement 17: The properties

**User story:** As the project owner, I want the things that must never go wrong in the one room checked over many drawn visits.

#### Acceptance criteria

1. THE Property_Suite SHALL check, over drawn whole visits Together, that the visit ends, that the Visit_Log holds exactly the trials that were played, that nothing reaches the interface before a trial is scored, that answers are judged against their windows, that the log replays through the engine, that the Output_Shell is used as it requires, that pauses discard and repeat, that a stop leaves nothing, that the summary and the visit rule follow from the log, and that the same seed gives the same visit.
2. THE property of the replaying log SHALL also find every Turn again from the engine seeds of the log.
3. THE property of pauses SHALL check, for the One_Room, that the Turn stays with its Creature through a Pause and that a change of device starts again every Creature still about and none that has gone home; and a fixed draw SHALL show that the checked visits met each of those cases.
4. THE rise-limit property of the output stage SHALL check a Mixed_Span: over drawn sequences of sounds of several sound ids, each rises by at most one step per ear above the last sound of the same sound id and stays within the Cap.
5. THE practice property SHALL check Together that no Practice_Sound and no trial is above its Room's cap or below its floor, and that each rise on an ear is at most one upward step above the last sound of the same Creature.
6. THE Property_Suite SHALL show that the visits it checks Together did take turns, so that it cannot pass by checking visits that ran one Room at a time. The properties of what reaches the interface (CP3), of the answers (CP4), of the Output_Shell (CP6) and of the pauses (CP7), the practice property and the screen-leak properties SHALL each count something that only a visit that took turns gives, and SHALL fail when that count stays too low. The property of the replaying log (CP5) SHALL check of every visit that its first Room_Run holds as many Members as the Rooms_Together_Count allows. The other properties run on the same harness with the same count.

### Requirement 18: The browser tests

**User story:** As the project owner, I want the screen of the room checked in a real browser, muted, without anyone pressing Start by hand.

#### Acceptance criteria

1. `tests/e2e/room.spec.ts` SHALL check every state of the room of Requirement 10 on the development replay sheet, with every motion and with less motion, on whole visits that `tests/e2e/simulated-room.ts` plays in Node with the real Visit_Flow Together.
2. THE browser tests SHALL check that every change of brightness in those states is a fade.
3. THE browser tests SHALL check the sizes and the conditions of Requirement 13, criterion 1, in three states: the Roll_Call with the longest introduction, the Counting just after a Creature went home, and a dark Lantern with long counts.
4. `tests/e2e/visit.spec.ts` SHALL walk the built page from the front door into the One_Room, answer the Roll_Call by keyboard and by touch, and check the notice after a Practice_Sound that was not caught, a Pause and a stop.
5. THE browser SHALL run muted in every test, and no test SHALL check what anything sounds like.

### Requirement 19: The steering and the documents

**User story:** As the project owner, I want the steering to say what the house now does, so that the next spec starts from the truth.

#### Acceptance criteria

1. `audio-safety.md` SHALL state rule 4 as restated for a room in which several sounds take turns, with the day of the owner's approval.
2. `product.md` and `hearing-method.md` SHALL describe the one room: the creatures, the roll call, the turns, and what stays as it was.
3. THE READMEs of `src/session/`, `src/copy/`, `src/ui/`, `tests/e2e/` and `tests/properties/screen-leak/`, the root `README.md`, `docs/architecture.md` and `docs/roadmap.md` SHALL describe the one room where they described rooms one after another.

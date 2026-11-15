# Tasks: missed-sound replay

Work through the tasks in order. Each task ends with its own checks holding, and after every task `npm run typecheck`, `npm test`, `npm run lint` and `npm run check:copy` pass. Requirement numbers refer to `requirements.md`; decision, question and CP numbers to `design.md`.

The tasks are done in four batches, marked below. A batch may also end after any task inside it, because every task leaves the four commands passing.

Tasks do not commit. After each task a separate run makes one commit for it with a one-line message, so no task asks for anything in a commit message body. What a task must record (property times, the measurement printed again, a counterexample) goes in `design.md` or a README, in the place the task names (D27, R19.3). Before ending a task, run `git status` and check that only the files the task names were created or changed, apart from the owner's own work in progress.

The project owner builds the screen by hand in the same working tree. No task creates or changes anything under `src/ui/`, `tests/e2e/` or `tests/properties/screen-leak/`, nor any CSS or HTML file (`index.html`, `listen.html`, `result-sheet.html`), `src/main.ts`, the root `README.md` or anything under `.kiro/steering/` (R19.1). No task changes `src/engine/`, `src/audio/`, `src/storage/`, `src/session/result-page-types.ts`, `src/session/visit-log-recorder.ts`, `src/session/room-runner.ts`, `src/session/summarize-visit.ts`, `src/copy/leaving-copy.ts`, an existing value in `src/config`, `package.json`, `package-lock.json`, a hook or a lint rule. Tasks change only the files listed in "Files" in `design.md`, and in `src/session/visit-flow-types.ts` they only add (R19.2).

Q6 is decided: the owner takes option (a). Before task 1 runs, the owner changes the `MissedSoundReplaySnapshot` literal in `src/ui/visit/screen-of-snapshot.test.ts` so that it compiles with and without the field `replay`. That is why task 1 can make `replay` a required field. No task touches that file. If `npm run typecheck` fails on it after task 1, stop and report it to the owner.

Q1, Q2, Q3, Q4, Q5 and Q7 stay open. Their values (`replaySoundsMaxCount` 20, `replayGapMs` 400, wrong sides not replayed, the running count over the whole visit so far, the room top as the cap, the run counts and the 45 second budget) are PROPOSED, NOT APPROVED. Describe them so wherever a task writes about them, and never change one to make a check hold. Never change a steering value. Visit-flow Q1 to Q4 stay open as well.

Run counts of the properties are those of "Run counts and time" in `design.md`. No task lowers a run count. If this spec's property files take more than 45 seconds together, stop, write the times in `design.md` under "Run counts and time", and report them to the owner.

If a property finds a counterexample, add it to `tests/properties/missed-sound-replay-regressions.test.ts` as a named case with `it.fails`, as "Counterexamples" in `design.md` describes, write it in `design.md` under "Counterexamples", and stop the task there and report it, so that the case and the fix are committed separately.

Until task 12, the stage `missedSoundReplay` plays nothing: `startReplay` does nothing, and the field `replay` holds the stand-in view of task 1 (R1.5). The controller's properties (tasks 9 to 11) exist before the flow can play a replayed sound.

- [ ] 1. Land the interface contract with a silent stage
  - Check first that the owner's literal in `src/ui/visit/screen-of-snapshot.test.ts` is cast with `as MissedSoundReplaySnapshot` (Q6, option (a)). If it is not, stop and report; do not change the file.
  - Change `src/session/visit-flow-types.ts` by the additions of "Interface contract" in `design.md`, word for word: `startReplay` after `chooseSwappedRepeat` with its comment; the required field `replay` and the new comment of `MissedSoundReplaySnapshot`; `ReplaySoundStartedEvent` in the union `VisitEvent`; the new block at the end of the file. No new import and no statement that runs. Prettier may rewrap lines; that is the only difference allowed.
  - Add to `src/session/visit-flow-types.test.ts`, as type-level checks only: `VisitFlow["startReplay"]` is `() => void`; `MissedSoundReplaySnapshot["replay"]` equals `MissedSoundReplay`; `Extract<MissedSoundReplay, { phase: P }>` gives each phase's interface; `Extract<VisitEvent, { kind: "replaySoundStarted" }>` equals `ReplaySoundStartedEvent`; `ReplayPauseReason` equals `"hidden" | "interrupted"` and is assignable to `PauseReason`; `ReplayPhase` and `ReplayEnding` are the listed unions. The existing checks stay as they are.
  - Create `src/copy/replay-copy.ts` with `replayCopy` word for word from "`src/copy/replay-copy.ts`", and `src/copy/replay-copy.test.ts` with its first cases: every constant has the design's wording; every string reachable from `replayCopy` is non-empty, trimmed and free of banned terms; the object and `pauseLines` are frozen.
  - Change `src/session/create-visit-flow.ts` by the smallest change that compiles: a method `startReplay()` that does nothing in every stage, and in `buildSnapshot` for this stage a field `replay` holding one frozen stand-in view of phase `announcing` that promises nothing: `heading`, `startLabel`, `stopLabel` and `proceedLabel` from `replayCopy` (`proceedLabel` is `skipButton`, because `proceed` leads to the result), `announcementLines` empty, both counts 0, `selectionLine` null, `canStart` false, `canSkip` true. A comment says that task 12 replaces it. Nothing else in the flow changes: no seed is drawn, no timer is set, nothing plays, and `proceed` and `stop` act as today.
  - Change `src/session/create-visit-flow.test.ts`: add `startReplay` to the action names and actions, in no stage's `accepts`, so the table's test checks that it changes nothing in every stage; and one example that in `missedSoundReplay` the snapshot has a `replay` with `canStart` false and `startReplay` makes no output call and no backend `schedule` call.
  - Change `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-timeline.ts` only to pass `startReplay` through (the recorded wrapper and the list of action names).
  - In `design.md`, add one sentence under Q6: the owner took option (a) and changed the literal before task 1. Change nothing else of the questions.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`; `git diff src/session/visit-flow-types.ts` removes no line other than the union `VisitEvent` and the comment of `MissedSoundReplaySnapshot`, each rewritten (R1.2).
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 15.5, 16.1, 16.2, 19.1, 19.2_
  - _Decisions: D1, D23, D27_

- [ ] 2. Add the config, the selection and the plan
  - Create `src/config/missed-sound-replay-config.ts` and its test as in "Config", with the file's own `deepFreeze`. The comment of `replayRaiseDb` names brief 07; the comments of `replaySoundsMaxCount` and `replayGapMs` say PROPOSED, NOT APPROVED and name D7 and Q1, D9 and Q2. The test checks the three values, the unit endings `Db`, `Count` and `Ms`, deep freezing, `replayRaiseDb` above 0, `replaySoundsMaxCount` a whole number of at least 2, `replayGapMs` a whole number above 0, and has a test named for Q1 and Q2 whose message says that the two values are PROPOSED, NOT APPROVED and await the owner's choice.
  - Create `src/session/even-selection-indexes.ts` (`evenSelectionIndexes`) and its test as in "The selection": every position when the count is at most the most count, including 0; the 20 positions of the example of 56; the first and the last kept; gaps of `floor` or `ceil` of the step; a frozen result; a `RangeError` for a negative, fractional or non-finite count and for a most count below 2 or fractional.
  - Create `src/session/missed-sound-replay-plan.ts` (`planMissedSoundReplay` and its types) and its test as in "The replay plan", on hand-built frozen logs: one case each for a caught, a wrong-side, a discarded and a no-sound trial and a trial of an abandoned run, none of them in the plan; the order kept; the room from `log.rooms` and the ear of the trial; the missed level is `playedLevelDb` also when `clampLimit` is not null; the raise, the cap from the last calibration, a top above `capRelativeToAnchorDb` held at it, the asked level and `heldByCap`; a selection with a most count passed through the settings; `selected`; a log with no miss and no calibration gives an empty plan; the two `RangeError` cases; the plan deeply frozen and equal for a JSON copy of the log.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 3.1 to 3.6, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 14.5_
  - _Decisions: D2 to D7_

- [ ] 3. Add the counts and the render seed
  - Create `src/session/replay-counts.ts` (`replayCounts`) and its test as in "The counts": a through-order of null, 0, a middle order and one past the last; no-sound, discarded and abandoned trials not counted; made equals caught plus wrong side plus missed on each side; at null the two missed counts add up to the plan's `missedSounds.length`; the result frozen.
  - Create `src/session/replay-render-seed.ts` (`replayRenderSeed`) and its test as in "The render seed": on hand-built logs whose engine seeds the test draws by the rule of visit-flow D19, the result is the draw after the render seed and one engine seed per room run; it depends only on `visitSeed` and the number of room runs; it is a whole number from 0 to 2³² − 1; equal for a JSON copy. Use the same draw as the flow's `drawSeed`. The check against a seed the flow actually drew is task 12's.
  - Check: `npm run typecheck`, `npm test`, `npm run lint` (no clock and no `Math.random` in `src/session`), `npm run check:copy`.
  - _Requirements: 8.4, 8.5, 14.1, 14.2, 14.5_
  - _Decisions: D2, D11_

- [ ] 4. Write the plan's properties
  - Create `tests/properties/missed-sound-replay-arbitraries.ts` with the drawn visit logs and most counts of "Correctness properties": calibrations with tops from `rangeReport`, and one log in five with tops drawn freely; abandoned runs and rooms with no finished run; no-sound shares, clamped plays, discarded trials and shares of misses from 0 to 1; frozen like the recorder's logs.
  - Create the files for CP1 and CP3 with the run counts of "Run counts and time", each with a timeout of 120 seconds. CP1's oracle is written from R3 and R4, not from the plan's code, and computes the selection in integers.
  - Create `tests/properties/missed-sound-replay-regressions.test.ts` with a comment on the naming rule and one `it.todo`, as the earlier specs do.
  - Run `npm test` three times and write the time of each new property file in `design.md` under "Run counts and time". If this spec's property files take more than 45 seconds together, stop and report the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 3.2, 3.3, 3.5, 4.1 to 4.3, 5.1 to 5.3, 17.1, 17.3, 17.4, 17.5_
  - _Decisions: D3, D5, D7, D26_

**End of batch 1.** The contract is in place for the owner, and the plan, the counts and the render seed exist as pure functions with their properties.

- [ ] 5. Add the replay's lines
  - Create `src/copy/replay-lines.ts` with the types and functions of "`src/copy/replay-lines.ts`", word for word. It imports only from `src/config` and `src/copy/room-copy.ts`. Every function throws a `RangeError` for the values of the table's `RangeError` rows.
  - Add to `src/copy/replay-copy.test.ts` the cases of "The copy tests": every output of the table; the representative inputs (counts 0 to 25, 56, 99, 100, 101, 999 and 1000; every side, ending and pause reason; missed levels from −70 to 15 in 5 dB steps and −0.4, 0, 0.4; both values of `capChangedLevel`; every pitch of `hearingMethodConfig.roomFrequenciesHz`) free of banned terms, with every number of decibels followed by " quieter than your calibration", " louder than your calibration" or " louder than when it went by"; and the `RangeError` cases.
  - Create `src/session/replay-types-match.test.ts` with type-level checks only: `ReplaySideName` equals `Ear`; `ReplayEndingName` equals `ReplayEnding`; `ReplayPauseName` equals `ReplayPauseReason`; the keys of `replayCopy.pauseLines` are exactly `ReplayPauseName`.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 1.6, 4.5, 5.4, 6.1, 7.5, 8.3, 13.2, 16.1 to 16.5_
  - _Decisions: D12, D23, D24, D25_

- [ ] 6. Add the replayed sound and the view
  - Create `src/session/replay-sound.ts` (`replaySoundOf`) and its test as in "The Replay_Controller": the planned fields, the position and its label, the room name and pitch label, the played level and clamp limit from the outcome; `capChangedLevel` true when `heldByCap`, true when the outcome names a clamp limit, false otherwise, with the ripple label to match; the sound frozen.
  - Create `src/session/missed-sound-replay-view.ts` (`missedSoundReplayView`) and its test as in "`missedSoundReplayView(input, settings)`": each phase's fields; the selection line only for a selection; counts through the current sound's trial order in `playing` and null before the first sound; the whole log's counts in `finished` and `nothingMissed`; the pause line of each reason and none without a pause; `canStart`, `canSkip` and `proceedLabel` of each phase as the table "What each phase accepts" gives them; `stopLabel` in every phase; the end line of each ending; the view deeply frozen and equal for equal inputs.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 4.5, 4.6, 5.4, 5.5, 6.1, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 9.1, 10.1, 10.4, 11.7, 13.2, 14.5, 15.5_
  - _Decisions: D10, D11, D13, D21, D23, D25_

- [ ] 7. Add the Replay_Controller
  - Create `src/session/create-missed-sound-replay.ts` (`createMissedSoundReplay`) as in "The Replay_Controller". It reads time only through the timer it is given, plays only through `output.play` with the Purpose `replay`, takes `replayGapMs` from `missedSoundReplayConfig`, `scheduleLeadMs` from `audioOutputConfig` and `refusedPlaysInARowMaxCount` from `visitFlowConfig`, and adds no number of its own. The flow does not use it yet.
  - Create `src/session/create-missed-sound-replay.test.ts` on the fake audio backend, a calibrated `createAudioOutput` and the manual timer, as `room-runner.test.ts` builds them, and on a scripted output for refusals: the first phase from the plan; `start` only from `announcing`; the first play one gap after `start`, with the room's Sound_Id, the ear, the asked level, the Purpose `replay` and the given random source; the `replaySoundStarted` event at the sound's start on the page clock, with and without a timestamp pair; the next play one gap after the end of the one before; `finished` with `allPlayed` after the last; `skip` during a sound calls `stopAll` and in `announcing` does not; `cut` during a sound and in a gap, then `resume` asks for the cut sound or the next one gap later; `end("deviceChanged")`; `notRunning` hands the shell's reason, or `interrupted` for none or `control`, to the callback; `notCalibrated` ends with `deviceChanged`; any other refusal asks for the same sound one gap later, three in a row end with `soundRefused`, and a scheduled play resets the count; after `cancel` no timer is pending; the log deep-equals itself before and after.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.5, 2.6, 3.4, 4.3, 4.4, 6.2, 7.1, 7.2, 7.3, 7.6, 10.2, 10.3, 11.2, 11.3, 11.5, 12.1, 12.2, 12.3, 13.1, 13.5, 14.1, 14.3, 14.5, 15.1, 15.3_
  - _Decisions: D8, D9, D10, D14, D15, D16, D20, D22_

- [ ] 8. Add the measurement again
  - Create `tests/listeners/replay-length-measurement.ts`, the measurement of "Measurements" as a function, and `tests/listeners/print-replay-length-measurement.ts`, which prints its tables as Markdown with the method and seeds stated there: `playPopulationRooms` with `specSearchUnderTest` and `hearingMethodConfig`, 1000 visits per row, the Attentive and the Plausible ranges, seed 20261117 for quick visits and 20261118 for full ones, and the first run's figure with seed 20261116. The selection uses `evenSelectionIndexes`; the most counts (20, 30, 45, 60, no limit) and gaps (300, 400, 600 ms) are parameters of the measurement, and it changes no config value. It writes no file and needs no `package.json` script.
  - Run `npx tsx tests/listeners/print-replay-length-measurement.ts` and compare its tables with those of "Measurements". If any figure differs, write the printed tables below the paragraph that says so, with the date, and say which figures changed. Change no question and no proposed value; if a change bears on Q1 or Q2, say so in the report.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.4, 19.2, 19.3_
  - _Decisions: D28_

**End of batch 2.** Every pure part, the copy and the controller exist and are tested; the stage still plays nothing.

- [ ] 9. Write the harness and the properties of skipping and reproducing
  - Add to `tests/properties/missed-sound-replay-arbitraries.ts` the replay scripts and refusal scripts of "Correctness properties".
  - Create `tests/properties/missed-sound-replay-harness.ts` as "The replay harness" describes: a controller on a shell from `createShellUnderTest` at `harnessSampleRateHz`, calibrated with `calibrate` to the setting of the log's last calibration, with the log's tops taken from that shell's range report; the flow's small part as "What the flow does" gives it; a record of every view, event, backend call and `stopAll`; and a scripted output in place of the shell for refusals. Files that use it replace the render functions with the worst-case renderers through `vi.mock`.
  - Create the files for CP4, CP5 and CP6 with the run counts of "Run counts and time", each with a timeout of 120 seconds. CP6 here checks two harnesses; its check against the flow's own draw is part of CP10 (task 13).
  - Run `npm test` three times and write the time of each new property file under "Run counts and time". If this spec's property files take more than 45 seconds together, stop and report the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 9.1, 9.2, 10.2, 10.3, 11.1, 11.6, 13.5, 14.3, 14.4, 17.3, 17.4, 17.5_
  - _Decisions: D2, D13, D14, D26_

- [ ] 10. Write the properties of safety, pauses and refusals
  - Create the files for CP7 and CP8 with the run counts of "Run counts and time", each with a timeout of 120 seconds. CP7 measures fades with `measureFadeLengths` and checks the other channel for `+0`; CP8 uses the refusal scripts for one run in three.
  - Run `npm test` three times and write the time of each new property file under "Run counts and time". If this spec's property files take more than 45 seconds together, stop and report the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 4.4, 4.6, 6.1, 6.2, 7.1 to 7.3, 11.2 to 11.5, 11.7 to 11.9, 12.1 to 12.3, 13.1, 13.2, 15.3, 15.4, 15.6, 17.3, 17.4, 17.5_
  - _Decisions: D8, D9, D15, D16, D18, D26_

- [ ] 11. Write the properties of the counts and the wording
  - Create `tests/properties/missed-sound-replay-text.ts` as in "Correctness properties": every string of a view and an event with its place, and the allowed forms of CP9.
  - Create the files for CP2 and CP9 with the run counts of "Run counts and time", each with a timeout of 120 seconds. CP2's parser of the count lines knows the English number words independently of `countWords`, and CP2 checks the views of harness runs as well as `replayCounts`.
  - Run `npm test` three times and write the time of each new property file under "Run counts and time". If this spec's property files take more than 45 seconds together, stop and report the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 8.1 to 8.5, 16.3, 16.4, 17.2, 17.3, 17.4, 17.5_
  - _Decisions: D11, D12, D25, D26_

**End of batch 3.** Every property of the controller holds before the flow plays a replayed sound.

- [ ] 12. Play the replay in the visit flow
  - Change `src/session/create-visit-flow.ts` as in "What the flow does", replacing the stand-in view of task 1: on entering the stage, draw the render seed from the visit's source and make the controller; `startReplay` in `announcing` with no pause, through `withSound`; `proceed` calls `skip` first; `stop` calls `cancel`; the first branch of `onOutputStopped` for this stage; the first branch of `endPause` for this stage, which writes nothing to the recorder; a play refused `notRunning` handled as a stop report; the snapshot's `replay` from the controller's view. Nothing the flow does in another stage changes.
  - Change `src/session/create-visit-flow.test.ts`: the row of `missedSoundReplay` in "What each stage accepts" for the new actions, and one example for each row of "What each phase accepts"; `activationRefused` when the browser saw no press, with the phase still `announcing`; the seed drawn on entering equals `replayRenderSeed` of the log, and the draws before it equal the logged engine seeds; `beginRoom` before the first replayed play; the `result` stage holds the same log object, deep-equal to the log on entering, after a watched, skipped, stopped and device-ended replay and after a left page; no pause of this stage in the log's `pauses`.
  - Every visit-flow property must still pass unchanged: the simulated visitor still calls `proceed` in this stage, which now skips the replay.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 1.5, 6.3, 6.4, 6.5, 9.2, 10.2, 10.3, 11.1 to 11.9, 12.1, 12.4, 13.3, 13.4, 13.5, 14.2, 15.1_
  - _Decisions: D8, D13, D14, D15, D17, D18, D19, D20, D21_

- [ ] 13. Play the replay in whole visits
  - Change `tests/listeners/simulated-visitor.ts` and `tests/properties/visit-flow-arbitraries.ts` by an optional replay behaviour (watch to the end, skip at a time, stop at a time, or the disturbances of a replay script), drawn by a new arbitrary that only this spec's files use. Without it the visitor calls `proceed` after a rest as now, and the existing arbitraries draw as before.
  - Create `tests/properties/missed-sound-replay-simulated-visits.test.ts`: a quick and a full visit played to the result through `tests/properties/visit-flow-harness.ts` and the simulated visitor, with fixed seeds and the worst-case renderers through `vi.mock`, the replay watched to its end, each playing exactly its plan with the Purpose `replay` and reaching `result` with the same log object; and the visit of CP4 with a listener who catches everything, through the flow.
  - Create the file for CP10 with its run count and a timeout of 120 seconds, including CP6's check that the seed drawn on entering equals `replayRenderSeed(log)` and that the draws before it equal the logged engine seeds.
  - Run `npm test` three times and write the time of the new property file and of the simulated visits under "Run counts and time". If this spec's property files take more than 45 seconds together, stop and report the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 1.1, 7.1, 9.1, 9.2, 13.3, 13.4, 14.2, 15.1, 17.3, 17.4, 17.5, 17.6_
  - _Decisions: D2, D13, D18, D26_

- [ ] 14. Update the READMEs
  - `src/session/README.md`: a section on the missed-sound replay: the contract's additions and the rule of only adding, with Q6 settled by the owner's option (a); the plan and which trials it holds; the cap; the selection; the counts; the render seed from the log; the controller and the flow's part; that the log is not changed. `replaySoundsMaxCount`, `replayGapMs` and the readings of Q3, Q4 and Q5 are described as PROPOSED, NOT APPROVED.
  - `src/copy/README.md`: a section on the replay's copy: `replayCopy`, the lines, counts in words, and levels labelled relative to the visitor's calibration.
  - `src/config/README.md`: `missed-sound-replay-config.ts` with its values, `replayRaiseDb` from brief 07 and the other two PROPOSED, NOT APPROVED (Q1, Q2).
  - `tests/properties/README.md`: a section on the replay's properties, arbitraries, harness, text helpers, simulated visits and regression file, with the run counts and the 45 second budget PROPOSED, NOT APPROVED (Q7).
  - `tests/listeners/README.md`: the replay length measurement and how to print it, and that its figures come from the engine alone and say nothing about real visitors.
  - Every README follows `wording.md`: a "self-check" or "a first listen", never a hearing test, and no claim about accuracy.
  - Check: `findBannedTerms` over the five changed READMEs with `bannedTerms`, through a one-off `npx tsx -e` that writes nothing; `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 19.4_
  - _Decisions: D27_

- [ ] 15. Final checks
  - Run `npm run typecheck`, `npm test` (three times), `npm run lint`, `npm run check:copy` and `npm run build`.
  - Search the new and changed files in `src/session/` and `src/copy/` for numbers that set a level, a wait, a count or a limit outside `src/config`, apart from 0, 1 and the bound of the number words (R2.6). Confirm that the stand-in view of task 1 is gone.
  - Run `git status` and `git log` for this spec's commits: no file under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `src/engine/`, `src/audio/`, `src/storage/` or `.kiro/steering/`, nor any CSS or HTML file, `src/main.ts`, the root `README.md` or `src/session/result-page-types.ts` was changed by this spec; every file changed is in "Files"; and the diff of `src/session/visit-flow-types.ts` since before task 1 only adds, apart from the two rewritten lines of task 1.
  - Review the work against `requirements.md` and the coverage table of `design.md`, requirement by requirement, and check R18 against "What this spec leaves to other specs". Confirm that Q6 is described as the owner's option (a), that Q1 to Q5 and Q7 and their values are still described as PROPOSED, NOT APPROVED, and that the times under "Run counts and time" add up to at most 45 seconds.
  - Report everything that does not fit, with the requirement or the row it concerns. Fix nothing in this task.
  - Check: every command above.
  - _Requirements: 1.4, 2.4, 2.6, 15.2, 15.7, 17.4, 18.1, 18.2, 19.1 to 19.4_
  - _Decisions: D27_

# Tasks: visit flow

Work through the tasks in order. Each task ends with its own checks passing and one or more small commits whose messages say what changed, in the present tense. Commit messages and READMEs follow `wording.md`: no "pass", "fail", "score", "scored", "test result" or the other banned words. Code names such as `trialScored` are not matched by the check; in prose say "answered" or "decided" (D30). Requirement numbers refer to `requirements.md`. Decision, question and CP numbers refer to `design.md`.

The project owner is building the interface by hand in the same working tree. No task creates or changes anything under `src/ui/`, nor `index.html`, `listen.html` or `src/main.ts` (R24.1). No task changes `src/copy/`, `src/engine/`, `src/audio/`, `src/storage/`, `tools/`, `.kiro/steering/`, `docs/briefs/`, `package.json`, `package-lock.json`, or the READMEs of `src/config/`, `src/copy/` and `src/ui/` (R24.2, D30). Many of those files hold the owner's uncommitted work. Before each commit, run `git status` and stage only the files of the task, by name.

Never change a value from a steering file. The visit limit of `visitFlowConfig` was decided by the owner's coordinator on 2026-11-16, at the owner's request (Q1), and the owner may reverse it: do not present it as the owner's own decision anywhere, and do not change it to make a check hold. If only another value would do, keep the case as an expected break and add the numbers to Q1.

If a property finds a counterexample, keep it as a named regression test in `tests/properties/visit-flow-regressions.test.ts`, first with `it.fails`, and put the fix in a separate commit, as the Testing strategy in `design.md` describes.

- [x] 1. Write the interface contract
  - Write `src/session/visit-flow-types.ts` exactly as the file in "Interface contract" in `design.md`: types and type re-exports only, no statement that runs, nothing else. This file is what the interface is built against, so it comes first and alone.
  - Write `src/session/visit-flow-types.test.ts` with type-level checks only (`expectTypeOf`), as `ear-types-match.test.ts` does: `LoggedEarResult` equals the engine's `EarResult`; `LoggedRoomResult` equals `Omit<RoomResult, "trials">`; `ScoredVisitTrial` with `kind: "sound"` has a `SoundOutcome` and with `kind: "noSound"` a `NoSoundOutcome`; every `VisitSnapshot` member has a different `stage`.
  - Check: `npm run typecheck`, `npm run lint`, `npm test`. Commit the two files alone.
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 9.3_
  - _Decisions: D1, D31_

- [x] 2. Add the visit flow config
  - Write `src/config/visit-flow-config.ts` as in "Config" in `design.md`, with its own `deepFreeze`. The comment on `visitFalseAlarmRateUnreliableAboveFraction` says that the value was decided by the owner's coordinator on 2026-11-16, at the owner's request, and names D17 and Q1.
  - Write `src/config/visit-flow-config.test.ts`: the exact values; unit endings; deeply frozen; the visit limit above 0 and at most `hearingMethodConfig.falseAlarmRateUnreliableAboveFraction`; the refusal count a positive integer; and a test named for Q1 whose message says the value was decided by the owner's coordinator on 2026-11-16, at the owner's request, and that the owner may reverse it.
  - Do not change `hearing-method-config.ts`, `audio-output-config.ts`, `audio-safety-config.ts` or `src/config/README.md`.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`.
  - _Requirements: 17.7, 20.1, 20.2, 20.3_
  - _Decisions: D17, D25_

- [x] 3. Add the small pure helpers
  - Write `src/session/visit-rooms.ts` (`visitRooms`), `window-start.ts` (`soundWindowStartMs`, `noSoundWindowStartMs`) and `answer-time.ts` (`answerTimeMs`) as in "The rooms of a visit" and "Time and windows" in `design.md`, each with its test.
  - `visit-rooms.test.ts`: the quick visit is corridor, stairs, attic and the full visit cellar to attic, with indices from 0 and the config's frequencies; results are frozen; a frequency with no ghost sound throws a `RangeError` (through a settings parameter with a default, as `roomSearchCapDb` takes its settings).
  - `window-start.test.ts`: conversion with a pair whose page clock is 1000 ms ahead; no pair gives presentation plus 50 ms; never earlier than the presentation; the no-sound start with offsets of 0, 30 ms and −80 ms.
  - `answer-time.test.ts`: a time stamp now, earlier, missing, NaN, Infinity and in the future.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 2.7, 7.3, 7.4, 7.5, 7.8_
  - _Decisions: D3, D4, D18, D33, D34_

- [x] 4. Add the visit-level rule and the visit summary
  - Write `src/session/judge-visit-false-alarms.ts` and `summarize-visit.ts` as in "The visit summary and the visit-level rule" in `design.md`. `summarizeVisit` takes its settings as a parameter with the shipped config as the default.
  - `judge-visit-false-alarms.test.ts`: 4 of 20 at 0.2 is not above; 5 of 21 is; 0 no-sound trials gives rate 0 and not above; the counts are sums.
  - `summarize-visit.test.ts`, on hand-built logs: an unmarked visit keeps every ear as the search gave it; a marked visit makes every ear unreliable with `visitFalseAlarmRate` last and offers no repeat; an ear already unreliable keeps its reasons in order; `levelNotAsAsked` on one floor only; an abandoned attempt is left out of the pooled counts; `rightMinusLeftDb` and the offer at 14 dB, 15 dB and −15 dB; the ignored answer count.
  - Write the pure part of CP9 in `tests/properties/visit-flow-cp9-summary-and-visit-rule.property.test.ts` (300 runs over arbitrary room results and limits). Its visit part is added in task 11.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 17.1 to 17.6, 18.1 to 18.5_
  - _Decisions: D17, D23, D24_

- [x] 5. Measure the visit-level rule
  - Write `tests/listeners/visit-rule-measurement.ts` (`measureVisitFalseAlarmRule`) and `tests/listeners/print-visit-rule-measurement.ts` as in "The measurement" in `design.md`, with the cases, seeds and visit counts of "Measurements". The rule is applied with `judgeVisitFalseAlarms`. The script prints the tables and writes no file.
  - Run `npx tsx tests/listeners/print-visit-rule-measurement.ts` and compare its tables with "Measurements". Write the run's numbers and its commit as a new decision in `design.md` (the next free D number), saying where they differ from the design's figures and why if they do. Point Q1 to that decision. Do not change the proposed value.
  - Write `tests/properties/visit-flow-cp11-visit-rule-effect.property.test.ts` with the limits of CP11 and a timeout of 120 seconds.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 22.6, 23.1 to 23.5_
  - _Decisions: D17_

- [x] 6. Add the visit log recorder
  - Write `src/session/visit-log-recorder.ts` (`createVisitLogRecorder`) as in "The visit log" in `design.md`, producing the `VisitLog` of the contract.
  - `visit-log-recorder.test.ts`: times are relative to the visit's start; `order` counts scored and discarded trials together from 1; every entry and the log are frozen; `log()` returns copies, so later entries do not change a log already returned; `JSON.parse(JSON.stringify(log))` deep-equals the log; the recorder refuses a scored trial with an outcome that does not fit its kind (a `TypeError`).
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 10.1, 10.2, 10.4 to 10.7_
  - _Decisions: D10, D28_

- [x] 7. Add the room runner
  - Write `src/session/room-runner.ts` (`createRoomRunner`) following "The room runner" in `design.md`, with every wait on the injected timer and every random number from the sources it is given.
  - `room-runner.test.ts`, with the fake backend, the manual timer, a calibrated output shell (as `tests/properties/output-shell-harness.ts` calibrates one) and a scripted search or a real one: the gap is waited from the previous answer; a sound is played with the Purpose `trial`, the room's sound, the trial's ear and level; the window opens at the converted start; an answer at the window start counts and one at its end does not; a second answer in the window is ignored; no answer gives `none` at the window's end; a no-sound trial schedules nothing and its window uses the latest offset; answers outside windows are recorded as ignored; a pause during a gap logs nothing, a pause after presentation logs a discarded trial, and resuming presents the same trial after its gap; abandoning ends the runner; a refused sound is logged and tried again after its gap, and the third refusal in a row calls `soundRefused`; `notRunning` calls `pauseFromOutput`; the `scored` callback runs inside the answer call or the window-end callback.
  - Check: `npm test`, `npm run lint` (no clock read, no timer global, no `Math.random` in `src/session`).
  - _Requirements: 7.1 to 7.11, 8.1, 8.2, 8.4, 9.1, 9.2, 12.3, 12.4, 12.7, 21.1 to 21.3_
  - _Decisions: D3, D4, D9, D10, D25, D34_

- [x] 8. Add the visit flow
  - Write `src/session/create-visit-flow.ts` (`createVisitFlow`, `VisitFlowTestOptions`, `PresentedTrial`) following "The stage machine" in `design.md`: creation, `withSound`, the visit's lifetime, the pause table, the stop table, notifications and visit tokens. It returns a frozen object that implements the contract's `VisitFlow`.
  - `create-visit-flow.test.ts`, with the fake backend and the manual timer:
    - creation makes no context and shows `entry`; a bad seed throws a `RangeError`; `chooseVisit` calls `createOrResume` before it returns; `noGesture` sets `activationRefused`;
    - one row for each line of "What each stage accepts": the stage is entered as stated, every listed action works, and an unlisted action changes nothing;
    - the calibration snapshot follows the controller; a kept setting is logged with the room tops and moves to the headphone check; `roomsLine` counts this visit's rooms;
    - the headphone check: an answer before a play is ignored; each judgement and its line; only `correct` lets the visit go on;
    - the first room calls `beginRoom` and creates the search with the rounded room top as its cap; `roomStarted` and `roomFinished` are handed out; the last room leads to `missedSoundReplay` after `beginRoom`;
    - reactions: a catch gives `ripple`, an answer to silence `noSoundLine`, a miss, a wrong side and a no-response `none`;
    - the pause table and the stop table, row by row, including a device change in a room (abandoned attempt, calibration `again`, headphone check, a new attempt of the same room, no rules) and `pageLeft`;
    - events are handed out before the snapshot listeners of the same change; a scoring that changes nothing in the snapshot notifies nobody; snapshots and events are frozen; a throwing listener does not stop the others;
    - unsupported devices from `activate` and from a later report;
    - `backToFrontDoor` from `exit` and `result` starts the next visit with a new visit seed and the same shell;
    - the result snapshot's summary equals `summarizeVisit` of its log.
  - Check: `npm test`, `npm run lint`, `npm run typecheck`.
  - _Requirements: 1.4, 2.1 to 2.7, 3.1 to 3.6, 4.1 to 4.5, 5.1 to 5.5, 6.1 to 6.5, 8.3, 8.5, 9.1 to 9.5, 10.3, 11.1 to 11.7, 12.1, 12.2, 12.5 to 12.8, 13.1 to 13.5, 14.1 to 14.7, 15.1 to 15.3, 16.1 to 16.5, 19.1 to 19.4, 20.4_
  - _Decisions: D2, D5, D6, D8, D11 to D16, D19 to D22, D29, D35_

- [x] 9. Add the harness, the simulated visitor and the simulated visits
  - Write `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-arbitraries.ts` as in "The Visit_Harness" and the visitor script of "Correctness properties" in `design.md`, and `tests/listeners/simulated-visitor.ts` with its test (one quick visit with a Step_Listener; every caught trial is a sound at or above its threshold).
  - Write `tests/properties/visit-flow-simulated-visits.test.ts`: a quick and a full visit to `result` with an Attentive_Range listener, a Plausible_Range listener, and each of the five Extreme_Listeners, all with fixed seeds and the worst-case renderers through `vi.mock`. For each: the stage reaches `result`, every room has one finished attempt, and the summary equals `summarizeVisit` of the log. For "never answers": every ear worse than cap. For "answers at random" and "always answers": the visit is marked by the visit rule.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 22.1, 22.2, 22.3_
  - _Decisions: D26, D27_

- [x] 10. Write the brief's properties
  - Write the files for CP1, CP2, CP3 and CP4 with the run counts of "Correctness properties", each with a timeout of 120 seconds, using the harness, the arbitraries and the simulated visitor.
  - Write `tests/properties/visit-flow-regressions.test.ts` with a comment on the naming rule and one `it.todo`, as the earlier specs did.
  - Run `npm test` three times and note the time of each new property file in the commit message body.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 8.3, 9.4, 9.5, 10.1, 10.2, 11.2, 11.3, 22.4, 22.5, 22.7_
  - _Decisions: D26, D27_

- [x] 11. Write the other properties
  - Write the files for CP5, CP6, CP7, CP8 and CP10, and add the visit part of CP9 to its file. CP6 uses the harness's spy around the output shell.
  - Run `npm test` three times. If this spec's property files take more than 60 seconds together, halve their counts and record the times as a new decision in `design.md`.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 6.1, 6.2, 7.9, 12.3 to 12.7, 13.1 to 13.3, 14.1 to 14.7, 16.1, 17.1 to 17.4, 18.1 to 18.5, 19.3, 22.6_
  - _Decisions: D9, D12, D13, D17, D19_

- [x] 12. Update the READMEs
  - In `src/session/README.md`, describe the visit flow: the contract file and its rule of only adding, `createVisitFlow`, the room runner, the log recorder, the summary and the visit-level rule with its limit (Q1), and what the flow does not do (draw, store).
  - In `tests/listeners/README.md`, describe the simulated visitor and the measurement script, with the command that runs it. In `tests/properties/README.md`, describe the visit harness, the visitor scripts and the regression file.
  - Check: `findBannedTerms` over the three changed READMEs (through a one-off `npx tsx -e` that writes nothing), `npm run lint`.
  - _Requirements: 24.4, 24.5_
  - _Decisions: D30_

- [x] 13. Final checks
  - Run `npm run typecheck`, `npm test` (three times), `npm run lint`, `npm run check:copy` and `npm run build`.
  - Search `src/session/` for numbers that set a level, a time or a limit outside `src/config` (R20.4). Search `src/ui/` for `onTrialPresented` and `VisitFlowTestOptions` and confirm neither appears in a file this spec could have touched.
  - Run `git status` and `git log` for this spec's commits: no file under `src/ui/`, nor `index.html`, `listen.html`, `src/main.ts`, nor any file listed as "Not changed" in `design.md` was changed or committed by this spec, and the owner's uncommitted files are still uncommitted.
  - Review the diff against `requirements.md` and the coverage table in `design.md`. Confirm that Q1 describes the visit limit as decided by the owner's coordinator on 2026-11-16, at the owner's request.
  - Check: every command above.
  - _Requirements: 20.4, 24.1, 24.2, 24.3, 24.5_
  - _Decisions: D30_

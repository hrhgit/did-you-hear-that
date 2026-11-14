# Tasks: audio output

Work through the tasks in order. Each task ends with its own checks passing and one or more small commits whose messages say what changed, in the present tense. Commit messages follow `wording.md`: no "pass", "fail", "score", "test result" or the other banned words (D30). Requirement numbers refer to `requirements.md`. Decision, question and CP numbers refer to `design.md`.

Never loosen a value from a steering file, and never loosen one of the guarded values of D32, to make a check or a property hold. If only a looser value would do, stop, keep the case as an expected break, and add a question to "Questions for the project owner" in `design.md`.

Do not edit `.kiro/steering/`, any file under `docs/briefs/`, anything under `tools/`, `docs/reports/` or `.kiro/hooks/`, or `package.json` (D31). If a brief still has uncommitted edits from the project owner, leave them uncommitted and out of every commit. Before each commit, check `git status` and stage only the files of the task.

If a property finds a counterexample, keep it as a named regression test in `tests/properties/audio-output-regressions.test.ts`, first with `it.fails`, and put the fix in a separate commit, as the Testing strategy in `design.md` describes.

Until task 12, nothing in this spec can make a sound in a browser. Task 16 is for the project owner, not for an agent.

- [x] 1. Add the ceiling and the output config
  - In `src/config/audio-safety-config.ts`, add `ceilingFraction: 0.25` with the comment quoting its row of the Initial values table, and reword the file comment to say the ceiling has been added. In its test, add the field to the exact-value check and a third loosening guard, `ceilingFraction <= 0.25`, with the message of R1.2.
  - Write `src/config/audio-output-config.ts` with the fields and values of the Config section of `design.md`, each comment naming its decision, its own `deepFreeze`, and `peakBoundDb` keyed by `SoundId`. Write `audio-output-config.test.ts` with every config test listed there, including the loosening guards of D32.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`.
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.6_
  - _Decisions: D1, D2, D6, D8, D10, D13, D14, D17, D20, D32_

- [x] 2. Add the output types and the two small helpers
  - Write `src/audio/output/output-types.ts` as in "Types" in `design.md`.
  - Write `gain-to-decibels.ts` and its test (round trip with `decibelsToGain` within 10⁻¹² dB from −200 to +60 dB; 1 gives 0).
  - Write `apply-output-fade.ts` (64-bit output, input untouched, F not rounded) and its test: first and last samples exactly `+0`; a constant buffer measures a fade of 25 ms within one sample at 44100 and 48000 Hz with `measureFadeLengths`; a buffer shorter than two fades is still zero at both ends.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 3.1, 10.1_
  - _Decisions: D13, D25_

- [x] 3. Add `preparePlayback`
  - Write `prepare-playback.ts` following the eleven steps in `design.md`, in that order, never throwing.
  - `prepare-playback.test.ts`: one case for each refusal reason; the anchor cap (request +20 gives +15, limit `anchorCap`); the ceiling (a buffer with peak 0.5 at gain 1 and Level 0 gives a peak within 10⁻⁶ of 0.25, limit `ceiling`, and the played level that gain implies); the rise limit for one ear and for `both`, and its tolerance (a rise of exactly 5 dB through `decibelsToGain` is not clamped); `-0` turned into `+0`; the other channel all `+0`; the input unchanged; with no limit, the played level is the requested level exactly.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1 to 7.7, 8.1, 8.2, 10.1 to 10.5, 11.2, 11.3_
  - _Decisions: D1, D2, D5, D13, D15, D21_

- [x] 4. Add playable buffers, room tops, the range report and the calibration control functions
  - Write `render-playable-buffer.ts`, `room-top-level.ts`, `range-report.ts`, `calibration-setting-top.ts` and `next-calibration-setting.ts` as described in `design.md`, each with its test.
  - `render-playable-buffer.test.ts`: with injected renderers, a buffer above the bound is rendered again from the same source; the eighth failure gives `peakBoundNotMet`; a throwing renderer gives `renderFailed`; with the real renderers, every sound at seeds 1 to 10 at 44100 and 48000 Hz is accepted, and the attempt count is noted.
  - `room-top-level.test.ts` and `range-report.test.ts`: the table of room tops in `design.md` at settings −40, −19, −10 and −4 dB, to 0.01 dB; `setBy`; `floorRmsFraction`.
  - `calibration-setting-top.test.ts`: the top is −4 dB with the shipped config; the two checks of R2.4 and R2.5.
  - `next-calibration-setting.test.ts`: the first repeat at −60 whatever is asked; rounding down to the 1 dB grid; the 5 dB rise limit; the range; NaN.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 2.4, 2.5, 9.1, 9.2, 9.4, 9.5, 16.1, 16.2_
  - _Decisions: D6, D7, D8_

- [x] 5. Write the properties of the pure core
  - Write `tests/properties/output-arbitraries.ts` as described under "Correctness properties" in `design.md`, reusing the sample rate and seed arbitraries of `tests/properties/sound-arbitraries.ts`.
  - Write the files for CP1, CP2, CP3, CP4, CP5, CP6, CP11 and CP12 with the run counts given there, each with a timeout of 120 seconds. Write `audio-output-regressions.test.ts` with a comment on the naming rule and one `it.todo`, as the ghost-sounds spec did (its D38).
  - Run `npm test` three times and note the times of CP3 and CP6 in the commit message body.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 7.1, 7.2, 8.1, 8.2, 8.3, 9.2, 9.4, 9.6, 10.1, 10.2, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_
  - _Decisions: D28_

- [ ] 6. Add the backend interface, the fake backend and the output shell
  - Write `audio-backend.ts`, `fake-audio-backend.ts` and `create-audio-output.ts` as described in "The output shell" and "The fake backend" in `design.md`. The shell takes a `Timer` from `src/config/timer.ts` for the suspend after a stop.
  - `create-audio-output.test.ts`, with the fake backend and the manual timer: the order inside `activate` (`createOrResume` recorded before the first await); `noGesture`; every state and the refusals in each; calibration first (R15.1); keep and its two refusals; the headphone check in the left ear at Level 0; `play` returns start and end times 50 ms ahead and on the audio clock; busy; the clamp log; `beginRoom`; a replay exempt from the rise limit; every stop reason, the fade, the suspend or close after the timer, and that nothing plays until `activate`; `deviceChanged` forgets the calibration.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 3.3, 3.5, 3.6, 4.1 to 4.4, 5.2 to 5.4, 7.8, 8.4, 9.3, 11.1, 11.4, 11.5, 12.1 to 12.3, 13.1, 13.2, 14.1 to 14.7, 15.1 to 15.3, 16.3 to 16.6, 17.1, 17.2_
  - _Decisions: D3, D4, D11, D12, D14, D15, D16, D17, D18, D19, D20, D22, D23_

- [ ] 7. Write the properties of the shell
  - Write the files for CP7, CP9, CP10 and CP13, with operation-sequence arbitraries added to `output-arbitraries.ts`.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 4.4, 5.2, 5.3, 5.4, 11.1 to 11.5, 12.1, 12.2, 14.1 to 14.7, 15.1, 16.1 to 16.6, 20.4_
  - _Decisions: D8, D14, D15, D16, D18_

- [ ] 8. Add the session helpers and the search property
  - Write `src/session/room-search-cap.ts` and `judge-headphone-check.ts` with their tests. `room-search-cap.test.ts`: the bracketed grid values in the room-top table of `design.md`; a top exactly on the grid; a top above +15; the result passes `validateSearchSettings` when used as the cap.
  - Add a type-level test in `src/session/` that the output stage's `Ear` and the engine's `Ear` are the same type.
  - Write the CP8 property file, driving `createThresholdSearch` through the shell with the fake backend and listeners from `tests/listeners/`.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 9.6, 11.6, 17.3, 17.7, 20.4_
  - _Decisions: D7, D15, D20_

- [ ] 9. Add the copy
  - Write `calibration-copy.ts`, `headphone-check-copy.ts`, `output-state-copy.ts` and `listening-page-copy.ts` under `src/copy/` with the lines in `design.md` (calibration table, headphone check table, the stop control, a line for each stop reason, a line for each unsupported reason, and the listening page's labels). `roomsShortLine(count, total)`, `levelLabel(levelDb)` (always "relative to your calibration") and `clampLine(limit)` are functions.
  - `output-copy.test.ts`: `findBannedTerms` with `bannedTerms` over every string and over the output of every function for counts 0 to 5 and a range of levels; no line contains "turn up", "turn the volume up" or "raise", except the two lines of R16.8 and R16.9, which say not to and are listed by name in the test (R16.10).
  - Check: `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 5.5, 16.6 to 16.10, 17.4 to 17.6, 18.1 to 18.4_
  - _Decisions: D9, D10, D11, D12, D20_

- [ ] 10. Add the Web Audio backend and the output graph
  - Write `channel-index.ts`, `output-graph.ts` and `web-audio-backend.ts` as in "The Web Audio backend" in `design.md`. These are the only files that name Web Audio types.
  - There is no Node test for these two files beyond type-checking. They are checked in a browser by task 13.
  - Check: `npm run typecheck`, `npm run lint`, and a search that no file under `src/` outside these two names `AudioContext`, `AudioBuffer`, `GainNode` or `copyToChannel`.
  - _Requirements: 3.2, 3.4, 4.1, 4.5, 5.1, 5.3, 5.4, 6.5, 6.6, 10.6, 13.2, 14.3 to 14.6_
  - _Decisions: D3, D11, D12, D14, D17, D18, D24, D25_

- [ ] 11. Add the calibration controller and the listening page session
  - Write `src/session/calibration-controller.ts` and `listening-page-session.ts` as described in `design.md`, with the timer injected. The session creates the Web Audio backend from the `window` it is given, the shell and the controller, and gives the UI a snapshot and actions.
  - Tests with the fake backend (passed in place of the window-built backend through an option) and the manual timer: repeats follow one another with the gap; the control shows the played setting; stopping ends the loop; the sound rows start at the lower of −25 and the rounded top and move one grid step; play outcomes and clamp limits appear in the snapshot; the headphone check answers give their lines.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 16.7 to 16.11, 17.3 to 17.7, 19.4 to 19.9_
  - _Decisions: D8, D9, D20, D26, D27_

- [ ] 12. Add the listening page
  - Write `listen.html` at the repository root, `src/ui/listening-page/start-listening-page.ts`, `render-listening-page.ts` and `listening-page.css`, in the order of the page described in `design.md`. Every string comes from `src/copy/`. The stop button is in the page before any script runs and stays fixed at the top. The Start button calls the session's start inside its click handler, with no `await` before it.
  - Check: `npm run typecheck`, `npm run lint`, `npm run build`, and confirm that `dist/` holds no `listen.html`.
  - _Requirements: 14.8, 19.1 to 19.9_
  - _Decisions: D26_

- [ ] 13. Add the Browser_Suite
  - Write `tests/e2e/dev-server.ts` and `tests/e2e/listening-page.spec.ts`, and add the development server to `playwright.config.ts` (D31). The probes and the offline render are described under "Testing strategy" in `design.md`.
  - Cover R21.1 to R21.5: no context before Start and one after; the first recorded buffer is a calibration repeat whose RMS matches the bottom of the control within 0.01 dB; no recorded sample beyond 0.25; exact zero on the other channel of every one-ear sound; the offline render of a left-only and a right-only buffer, and of a stop, which reaches exact zero within 20 ms and stays there; the stop button and a hidden page stop sound and nothing new starts until Start; and the built `dist/` holds none of the listening page's strings. The existing placeholder test stays as it is.
  - Check: `npm run test:e2e`, `npm run lint`.
  - _Requirements: 3.7, 21.1 to 21.5_
  - _Decisions: D14, D25, D26, D31_

- [ ] 14. Update the READMEs
  - Describe the output stage, its layers and its one entry point in `src/audio/output/README.md`; the calibration controller, the listening page session and the session helpers in `src/session/README.md`; the new copy files in `src/copy/README.md`; the listening page in `src/ui/README.md`, with how to open it; the manual record in `docs/README.md`.
  - Check: `findBannedTerms` over the changed READMEs, `npm run lint`.
  - _Requirements: 23.1, 23.2_

- [ ] 15. Final checks
  - Run `npm run typecheck`, `npm test` (three times, noting the time of CP3, CP6 and CP8; apply D28 if needed), `npm run lint`, `npm run check:copy`, `npm run build` and `npm run test:e2e`.
  - Search `dist/` for `createFakeAudioBackend`, `listen.html` and the listening page's header line. None may be found.
  - Search `src/`, `tests/` and `tools/` for the literal `0.25` and for `20` or `1500` used as a fade or a duration outside `src/config`. Only config and tests that quote the config may hold them.
  - Review the diff against `requirements.md` and the coverage table in `design.md`. Confirm that no file listed as "Not changed" in `design.md` changed and that the owner's uncommitted brief edits are still uncommitted.
  - Check: every command above.
  - _Requirements: 1.3, 3.1 to 3.7, 21.5, 23.2_
  - _Decisions: D28, D31_

- [ ] 16. The first listen (project owner)
  - Follow "Manual checks" in `design.md` on the listening page, in two desktop browsers, and write `docs/experiments/audio-output-listening.md` with the items of R22.3 and the answer to every item, including the optional ones if they were done.
  - Bring the findings of item 11 to Q1, and any other finding to the matching question in `design.md`. Nothing in the manual checklist is claimed as met before this record exists.
  - _Requirements: 22.1 to 22.4_
  - _Decisions: D29_

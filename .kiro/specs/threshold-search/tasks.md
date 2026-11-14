# Tasks: threshold search

Work through the tasks in order. Each task ends with its own checks passing and one or more small commits whose messages say what changed, in the present tense. Commit messages follow `wording.md`: no "pass", "fail", "score", "test result" or the other banned words (D20). Requirement numbers refer to `requirements.md`. Decision numbers refer to the Decisions section of `design.md`, and CP numbers to its Correctness properties.

Do not check out, read, diff or otherwise look at `experiment/no-spec` or its commits before task 14 (R16.1).

If a property finds a counterexample, keep it as a named regression test and put the fix in a separate commit, as D20 describes.

- [x] 1. Add the threshold search rule values to the hearing method config
  - In `src/config/hearing-method-config.ts`, add the six fields of R12.1 to `HearingMethodConfig` with a one-line JSDoc each, and their values to `hearingMethodConfig`. The comment on each value names its decision in `design.md` (D1, D3, D4, D5 or D8), because none of them is a row of the steering table (D15).
  - Leave every existing field and value as it is.
  - Update `src/config/hearing-method-config.test.ts`. Extend the exact-value check, renaming it to say it holds the hearing method table and the threshold search rule values. Add invariants: `noSoundTrialProbabilityFraction` lies within the no-sound share range, `thresholdCatchShareMinFraction` lies from 0 to 1, the three new counts are positive integers, and `inconsistentCatchMarginDb` is a positive integer. The unit-suffix test already covers the new names.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`.
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 2. Add the engine types, fraction comparisons, room limits and settings validation
  - Write `src/engine/search-types.ts` exactly as in the Types section of `design.md`.
  - Write `src/engine/fraction-comparisons.ts` with `atLeastFraction` and `atMostFraction` and the 10⁻⁹ tolerance (D29). Test boundaries in `fraction-comparisons.test.ts`: 3 of 20 at 0.15 is at least; 13 of 53 at 0.25 is at most; 14 of 54 is not; 3 of 10 at 0.3 is at most; one value just past each limit by more than the tolerance.
  - Write `src/engine/room-limits.ts`. Its test checks the shipped settings give 2, 4, 40, 13 and 53, plus one hand-computed case with other counts.
  - Write `src/engine/validate-search-settings.ts` with the checks in the order the design gives. Its test checks:
    - the shipped config is accepted
    - the result is a frozen copy holding exactly the `ThresholdSearchSettings` fields, and is not the object passed in
    - one rejected example for each of R2.3 to R2.9, each message naming the field. For R2.9, a share range of 0.30 to 0.31 admits no whole number of no-sound trials with 4 sound trials.
  - Check: `npm run lint` reports no import from outside `src/config`, and no clock or random use. Run `npm test`.
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 9.6, 10.2_
  - _Decisions: D6, D14, D29_

- [x] 3. Add response classification and the per-ear search
  - Write `src/engine/classify-response.ts`. Its test covers the five outcomes of R4.2 to R4.6 for both ears, and a `TypeError` for `"LEFT"`, `""`, `undefined` and `0`.
  - Write `src/engine/ear-search.ts` following `createEarSearch` in `design.md`: the order of the ending rules, the clamping, the direction from the previous outcome (D2) and `remainingPresentationsLowerBound`.
  - Write `ear-search.test.ts`:
    - traces A to G from the Worked examples, each as a scripted outcome list, checking every level, every direction, the ending and the number of presentations
    - trace B again with every miss replaced by a wrong side, giving the same levels and ending
    - the lower bound is 2 at the start, never below 1 while searching, 0 once ended, and never more than the presentations actually still needed in traces A to G
    - `next` and `record` throw an `Error` after the ear has ended.
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.6, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1_
  - _Decisions: D1, D2, D3, D4, D6_

- [x] 4. Add the no-sound schedule and the final ear result
  - Write `src/engine/no-sound-schedule.ts`. Test it with the shipped settings: at the start (0 no-sound, 0 sound, lower bound 4) a no-sound trial is allowed; with 1 no-sound, 0 sound and lower bound 4 it is not; a room of 4 sound trials and 0 no-sound trials needs a closing trial; 4 sound trials and 1 no-sound trial do not.
  - Write `src/engine/finalize-ear-result.ts`. Test each reason alone and all three together, in the order of R8.5. Test the cap as the reference for worse than cap, that better than floor is never marked inconsistent, trace E, trace G, and the four counts.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.2, 9.3, 11.2_
  - _Decisions: D5, D7, D8, D16_

- [x] 5. Compose the room search
  - Write `src/engine/threshold-search.ts` (`createThresholdSearch`) following "The room, step by step" in `design.md`, with the draw order 1, 2, 3 and frozen trials, records and results.
  - Write `threshold-search.test.ts` using a stub `RandomSource` that returns scripted values and counts its calls:
    - the first trial exists after creation, and `current()` called repeatedly returns the same trial and draws nothing
    - trial numbers run from 1
    - a draw below 0.2 makes a no-sound trial, and a draw at or above it a sound trial
    - the ear draw picks left below 0.5 and right otherwise, and is skipped when only one ear is searching
    - the gap formula hits both ends of the range
    - when the share maximum forbids a no-sound trial, no kind draw is made
    - with draws that never make a no-sound trial, closing trials are added until the minimum share is reached
    - a false alarm rate above the limit makes both ears unreliable, and one exactly at the limit does not
    - `respond` with an invalid value throws a `TypeError` and changes nothing; after the room has finished it throws an `Error`
    - changing the settings object after creation changes nothing
    - returned objects are frozen.
  - Check: `npm run lint` and `npm test`.
  - _Requirements: 1.3, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.7, 4.8, 9.1, 9.2, 9.3, 9.5, 10.3, 11.1, 11.2, 11.3, 11.4, 11.5_
  - _Decisions: D7, D8, D10, D11, D12, D13_

- [x] 6. Add the simulated listeners
  - Write `tests/listeners/listener-types.ts`, `psychometric-listener.ts` and `extreme-listeners.ts` as in the Simulated listeners part of `design.md`, with the fixed order of draws per trial.
  - Write `listener-parameter-arbitraries.ts` with the Plausible_Range and Attentive_Range from D17, on the 0.1 dB and 0.001 grids.
  - Write `psychometric-listener.test.ts` with the rate checks the design lists (20 000 trials, fixed seeds, within 0.02), the step case and the false alarm side split. Write `extreme-listeners.test.ts` checking each listener's defining behaviour on sound and no-sound trials.
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
  - _Decisions: D17_

- [x] 7. Add the harness: the search interface, the spec adapter, accuracy and population
  - Write `tests/listeners/search-under-test.ts` with the interfaces in `design.md`.
  - Write `spec-search-under-test.ts`: `specSearchUnderTest`, which stops a run that exceeds its `trialBudget` and reports `"budgetExceeded"`, and `runSpecRoom`, which returns the full `RoomResult`. Write `searches-under-test.ts` with the registry `{ spec: specSearchUnderTest }`.
  - Write `classify-accuracy.ts` following D18. Its test covers each state at and just past each 5 dB boundary, and `"unreported"`.
  - Write `measure-population.ts`. It derives every room's engine seed and listener seed from one seed through a `RandomSource`, so rows are reproducible. Its test runs 50 listeners twice and checks the rows are equal.
  - _Requirements: 13.7, 14.2, 15.1, 15.3_
  - _Decisions: D18, D21_

- [x] 8. Write the universal property checks
  - Write `tests/properties/checks/valid-settings-arbitrary.ts`, which generates settings over the ranges needed to exercise every validation rule and keeps only those `validateSearchSettings` accepts.
  - Write `tests/properties/checks/ear-oracle.ts` from the requirements, without importing engine modules other than `search-types.ts` and `fraction-comparisons.ts`. Write `ear-oracle.test.ts`, feeding it hand-written records for traces A to G and checking the expected endings and levels.
  - Write one check module each for CP1, CP4, CP5, CP6, CP7, CP9, the universal part of CP10, and CP13, as described in `design.md`. Harness-neutral modules take the search and the settings arbitrary as parameters, and import nothing spec-only (D21).
  - Do not add Vitest property files yet. Task 9 adds them after the first complete run.
  - Check: `npm run typecheck`, `npm run lint`, `npm test` (the oracle test).
  - _Requirements: 14.1, 14.2, 14.3_
  - _Properties: CP1, CP4, CP5, CP6, CP7, CP9, CP10, CP13_

- [x] 9. Write the statistical checks and the property CLI, and record the first complete run
  - Write one check module each for CP2, CP3, CP8, the statistical part of CP10, CP11 and CP12, with the fixed seeds, run counts and limits from `design.md`.
  - Write `tests/properties/checks/run-brief-properties.ts` and add `"experiment:properties": "tsx tests/properties/checks/run-brief-properties.ts"` to `package.json`. With `--search <name>` it runs every harness-neutral check against that search with the shipped settings. It writes `docs/experiments/brief-properties-<name>.json`, holding the search name, the git commit, the settings, each brief property with its parts (holds, checkable, first counterexample, metrics), and the population numbers from `measurePopulation`. It prints a short table and always exits 0, because it reports and does not judge.
  - Run `npm run experiment:properties -- --search spec`. Copy the output to `docs/experiments/brief-properties-spec-first-run.json`. Commit it with the check modules before changing any engine code (D30).
  - Write the Vitest files: `threshold-search-*.property.test.ts` for each check and `threshold-search-extreme-listeners.test.ts` for CP12's examples. Universal checks use at least 200 runs and a random seed. CP2 and CP8 get a 60 s timeout and the others 30 s.
  - Commit the Vitest files of every check. Those that hold are active. Those that do not are committed with `it.skip` and a comment, and listed with their first counterexample in a status line under this task. Task 10 removes each skip together with its fix (D20).
  - Create `tests/properties/threshold-search-regressions.test.ts` with a header comment explaining the naming and the `it.fails` rule. Leave it empty if nothing was found.
  - _Requirements: 14.1, 14.2, 14.3, 14.7, 16.7_
  - _Properties: CP2, CP3, CP8, CP10, CP11, CP12_
  - _Decisions: D19, D20, D30_
  - Status after the first complete run (commit 0057576, `docs/experiments/brief-properties-spec-first-run.json`): CP2 and CP3 do not hold, and their Vitest files are committed with `it.skip`. Every other check holds. CP2: 36 of 100 Plausible_Range sets are below 93 percent Accurate or Flagged; the shrunk first counterexample is left −55.1 dB, right 0 dB, width 1 dB, all rates 0 (set seed 4263754660), with 78.0 percent Accurate or Flagged because its left ear is found at −50, 5.1 dB above the true threshold. CP3: 11 of 50 Attentive_Range sets are below 88 percent Accurate; the shrunk first counterexample is left −0.1 dB, right 0 dB, width 1 dB, all rates 0 (set seed 3252736698), with 82.6 percent Accurate because its left ear is found at 5, 5.1 dB above.

- [ ] 10. Handle every counterexample
  - Take the checks that do not hold, exact and universal ones first (CP1, CP4 to CP7, CP9, CP13), then the statistical ones. For each counterexample:
    1. Add a regression test to `threshold-search-regressions.test.ts`, named `regression <n>: <what went wrong> (<CP>, seed <s>)`. It uses hard-coded listener parameters and seeds and is marked `it.fails`. Commit it alone, for example "Add regression case for guessed catches below threshold".
    2. Find the cause from the trial records of that case.
    3. Change the engine. Allowed without asking: implementation bugs, the definition of an inconsistent response and its margin (as a config value), the no-sound schedule within the share range, and a refinement of the threshold reading that stays within "at least 2 of 3 presentations reached while rising". Not allowed silently: any value in the initial values table of `hearing-method.md`, the step rule, the listener ranges of D17, and the limits of CP2, CP3 and CP8. For those, R14.6 applies: record a decision with the measured numbers first. Because nobody can be asked, prefer leaving the regression as `it.fails` with that decision written down, and say so in the final report, over moving the goalposts.
    4. In one commit: the engine change, the regression changed from `it.fails` to `it`, the `it.skip` removed from the property's Vitest file if task 9 skipped it, and a new decision (D31 onwards) in `design.md` saying what was wrong and what changed. Update `requirements.md` in the same commit if the behaviour a requirement describes has changed.
    5. Run `npm test` and `npm run experiment:properties -- --search spec`. A fix that makes another check stop holding is not finished.
  - Done when every check holds under `npm test` and in the CLI, no property file is skipped, and every regression test is an ordinary `it`.
  - _Requirements: 14.4, 14.5, 14.6, 17.2_
  - _Properties: CP1 to CP13_
  - Status (commit 6158997): not done, because CP2 and CP3 still do not hold. Every exact and universal check held on the first run, so there was nothing to handle there. Regression 1 (CP2) and regression 2 (CP3) led to D40, which holds a found level while the level one step quieter could still reach 2 of 3. Regression 2 is now an ordinary `it`. What remains are ears found one grid step too loud. Removing them needs a value task 10 may not move silently, so regression 1 and regression 3 (CP3) stay `it.fails`, the CP2 and CP3 property files stay skipped, and D41 records the measured numbers: CP2 has 26 of 100 sets below 93 percent, and CP3 has 8 of 50 sets below its limits. The project owner has to choose one of the options in D41 before this task can be marked done.
  - Status after the amendment of property 1 (commits 2c33951 to 148fd0e): still not done, because CP2 does not hold. The project owner chose the tolerance of one grid step on 2026-11-14, and D42 applies it: CP2 went from 26 to 1 of 100 sets below 93 percent, CP3 from 8 to 0 of 50 sets below its limits, and the population of 3000 from 41.4 to 44.8 percent Accurate. The share within the original 5 dB is reported beside it and is unchanged (48.9 percent for CP2, 94.2 for CP3, 41.4 for the population). Regressions 1 and 3 are now ordinary `it`, and the CP3 property file is active. One kind of listener remains: a guesser just under the false alarm limit (set seed 1113057956: left 11.2 dB, right 14.7 dB, width 4.3 dB, lapse 0.062, false alarm 0.299, wrong side 0.006) with 92.5 percent Accurate or Flagged. Its shrunk form is regression 4 (set seed 4040559320, left 4.2 dB, 91.75 percent) and stays `it.fails`. `tests/properties/threshold-search-cp2-accurate-or-flagged.property.test.ts` stays `it.skip`, because the only remedies D43 found need a value task 10 may not move silently (the false alarm limit or the no-sound share of `hearing-method.md`, the false alarm range of D17, or the CP2 limit). D43 gives the numbers and the cause read from the trial records.

- [x] 11. Write the scatter data
  - Write `tests/listeners/write-scatter-data.ts` as in the Scatter data section of `design.md`, and add `"experiment:scatter": "tsx tests/listeners/write-scatter-data.ts"` to `package.json`.
  - Run it twice and confirm with `cmp` that the two files are identical. Commit `docs/experiments/threshold-search-scatter-spec.csv`.
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - _Decisions: D22, D42_
  - Status (commits 80c6a97 and d50e902): two runs gave byte-identical files under `cmp`. 6000 rows with the `withinFiveDb` column of D42. Accurate 2689 (44.8 percent), Flagged 3180 (53.0 percent), Wrong 131 (2.2 percent), within the original 5 dB 2482 (41.4 percent), the same as the population in the property CLI.

- [x] 12. Update the READMEs
  - `src/engine/README.md`: what the engine is and that `createThresholdSearch` is its entry point.
  - `tests/listeners/README.md`: the listener types, the harness and the scatter script.
  - `tests/properties/README.md`: the `checks/` directory, the regression file and the `it.fails` rule, and that statistical checks use fixed seeds.
  - `docs/README.md`: the `experiments/` directory.
  - Follow `wording.md`. Say "self-check" or "first listen" if the product is named, and never "hearing test".
  - _Requirements: 14.1_
  - Status (commit e59f15d): all four READMEs updated. The product is not named in them. A search for every term in `src/config/banned-terms.ts` finds only `it.fails`, the name of the Vitest function that the task asks `tests/properties/README.md` to describe.

- [ ] 13. Verify the spec version is complete
  - Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. All must exit 0. Record the wall time of `npm test`, which must be under 3 minutes (R14.7).
  - Run `npm run check:copy` and `npm run render:sounds` to confirm nothing changed for them.
  - Read every file under `src/engine/` for numeric literals. Any number other than 0, 1 and the tolerance must come from the settings (R12.4).
  - Run `npm run experiment:properties -- --search spec` and confirm that every brief property holds in `docs/experiments/brief-properties-spec.json`. Commit it.
  - Write the commit hash measured into a status line under this task. Task 15 cites it.
  - _Requirements: 12.4, 14.7, 17.1, 17.2_
  - Status: not done, because brief property 1 does not hold in `docs/experiments/brief-properties-spec.json`. Commit measured: a480f64da2e2a7ff6aeebb56300ff2fbe1cb9133, with a clean working tree. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` exit 0. `npm test` took 2.8 s wall time: 45 files with 713 tests, 1 expected break (regression 4) and 1 skipped file (CP2). `npm run check:copy` finds no banned terms in 2 strings and `npm run render:sounds` has no ghost sounds to render, as before. The only numeric literals in `src/engine/` outside comments and tests are 0, 1 and the tolerance 1e-9. Brief properties 2 to 5 hold. Brief property 1 does not: CP1 and CP3 hold, CP2 has 1 of 100 sets below its limit (D43). Population of 3000: 44.8 percent Accurate, 53.0 Flagged, 2.2 Wrong, 41.4 within the original 5 dB, median 30 and largest 53 trials per room.

- [ ] 14. Measure the no-spec version
  - Only now read `experiment/no-spec`. Record its commit hash.
  - Create the measurement branch in a worktree outside the repository directory: `git worktree add ../did-you-hear-that-no-spec-measured -b experiment/no-spec-measured experiment/no-spec`.
  - Read the no-spec code. Note its API, its numbers, whether it takes a seed and settings, what it reports per ear, and whether it uses `Math.random`, the clock, audio or the DOM.
  - Copy the harness-neutral files listed in step 2 of the Comparison experiment section of `design.md`. Write `tests/listeners/no-spec-search-under-test.ts` following D23, and make the registry there list only it.
  - If the branch lacks dev dependencies the harness needs (`fast-check`, `tsx`, `vitest`), install the versions `main` uses, in the worktree only, and record that.
  - Run `npm run experiment:properties -- --search no-spec` there, and the scatter script with `--search no-spec`.
  - Commit the harness, the adapter, the JSON and the CSV on `experiment/no-spec-measured`. Do not push.
  - Confirm that `experiment/no-spec` still points at the hash recorded at the start. Remove the worktree with `git worktree remove` and keep the branch.
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
  - _Decisions: D21, D23_

- [ ] 15. Write the comparison document
  - On `main`, copy `brief-properties-no-spec.json` and `threshold-search-scatter-no-spec.csv` from `experiment/no-spec-measured` into `docs/experiments/` with `git show`.
  - Write `docs/experiments/spec-vs-no-spec.md` with the parts listed in the Comparison experiment section of `design.md`: the versions and commits, the method, the table of the five brief properties, the population table, the spec version's first-run row, what the adapter had to interpret, and the limits. Every number comes from the three JSON files.
  - Follow `wording.md`. Say "holds" and "does not hold". State that the numbers describe simulated listeners and say nothing about how well either version works for people. Before committing, search the document for every term in `src/config/banned-terms.ts`.
  - Run `npm run lint`, `npm test` and `npm run build` once more, and confirm `git status` shows nothing uncommitted.
  - _Requirements: 16.6, 16.7, 16.8, 17.1, 17.3_

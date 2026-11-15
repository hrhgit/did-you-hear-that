# Tasks: result page

Work through the tasks in order. Each task ends with its own checks holding. Requirement numbers refer to `requirements.md`; decision, question and CP numbers to `design.md`.

Tasks do not commit. After each task a separate run makes one commit for it with a one-line message, so no task asks for anything in a commit message body. What a task must record (measured sizes, property times, a counterexample) goes in `design.md` or a README, in the place the task names (D29). Before ending a task, run `git status` and check that only the files the task names were created or changed.

The project owner builds the page by hand in the same working tree. No task creates or changes anything under `src/ui/`, `tests/e2e/` or `tests/properties/screen-leak/`, nor `index.html`, `listen.html`, `src/main.ts`, the root `README.md` or anything under `.kiro/steering/` (R23.1). No task changes `src/session/visit-flow-types.ts`, `src/engine/`, `src/audio/`, an existing value in `src/config`, `package.json` or `package-lock.json` (R23.2).

Never change a steering value. The numbers of `resultPageConfig` marked `PROPOSED, NOT APPROVED` (Q1, Q4, Q5) and the visit limit of `visitFlowConfig` (visit-flow Q1) are proposals: do not present them as approved anywhere, and do not change them to make a check hold. Visit-flow Q1 to Q4 stay open.

Run counts of the properties are those of "Run counts and time" in `design.md`. If this spec's property files take more than 30 seconds together, stop, write the times in `design.md` under "Run counts and time", and report them to the owner. Do not change a run count.

If a property finds a counterexample, add it to `tests/properties/result-page-regressions.test.ts` as a named case with `it.fails`, as "Counterexamples" in `design.md` describes, write it in `design.md` under "Counterexamples", and stop the task there and report it, so that the case and the fix are committed separately.

Tasks 12 and 13 are the comparison with an earlier visit, which the roadmap cuts second. They may be left out. Task 14 is written to hold with or without them.

- [x] 1. Write the interface contract
  - Create `src/session/result-page-types.ts` exactly as the file in "Interface contract" in `design.md`: types and type re-exports only, no statement that runs, nothing else. It imports only from `src/config/hearing-method-config.ts`, `src/config/sound-id.ts` and `src/session/visit-flow-types.ts`. This is what the owner builds the page against, so it comes first and alone. Prettier may rewrap lines; that is the only difference allowed.
  - Create `src/session/result-page-types.test.ts` with type-level checks only (`expectTypeOf`), as `ear-types-match.test.ts` does: `ResultSnapshot` is assignable to `VisitToSave`; the DOM's `Storage` is assignable to `StorageArea`; `WingState` equals `VisitEarResult["state"]`; the members of `ResultPictureInput` and of `SaveOutcome` and `DeleteOutcome` are told apart by `kind`, `saved` and `deleted`.
  - Check: `npm run typecheck`, `npm run lint`, `npm test`.
  - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - _Decisions: D1, D2_

- [x] 2. Add the config, the wall clock and the allowed terms
  - Create `src/config/result-page-config.ts` and `src/config/result-page-config.test.ts` as in "Config" in `design.md`, with the file's own `deepFreeze`. The comments of the four proposed fields say `PROPOSED, NOT APPROVED` and name their decision and question. The test checks the values, the unit endings, deep freezing, the order `0 = worseThanCap < atCap < atFloor < betterThanFloor = 1`, that both counts are positive whole numbers, and has a test named for Q1, Q4 and Q5 whose message says that the values are proposals awaiting the owner's choice.
  - Create `src/config/system-wall-clock.ts` and `src/config/system-wall-clock.test.ts` as in "`src/config/system-wall-clock.ts`": fake system time before and after local midnight, and the zero padding of single-digit months and days.
  - Change `src/config/banned-terms.ts` by adding the export `limitsStatementAllowedTerms` as in "`src/config/banned-terms.ts`", and `src/config/banned-terms.test.ts` by adding: frozen; every allowed term is in `bannedTerms`. Change nothing else in the file.
  - Create `src/session/result-page-types-match.test.ts` with one type-level check: the return type of `createSystemWallClock` is assignable to `WallClock`.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`.
  - _Requirements: 1.6, 2.1 to 2.4, 3.3, 17.4_
  - _Decisions: D14, D15, D23, D30_

- [x] 3. Add the limits statement and its exemption in the copy check
  - Create `src/copy/limits-statement.ts` with `limitsStatement` exactly as in "`src/copy/limits-statement.ts`", and `src/copy/limits-statement.test.ts`: the heading and the four sentences, in order, character for character; each of `limitsStatementAllowedTerms` that appears comes after the word "not" in the same sentence; no other banned term appears; the object and its array are frozen.
  - Change `tools/run-copy-check.ts` by adding the option `exemptions` as in "The copy check and its one exemption", and `tools/run-copy-check.test.ts` by adding its four cases. Existing behaviour and output without exemptions stay the same.
  - Change `tools/check-copy.ts` to give the one exemption: `src/copy/limits-statement.ts`, `limitsStatement`, `limitsStatementAllowedTerms`.
  - Check: `npm run check:copy` reports no banned term with the statement present; `npm test`; `npm run lint`.
  - _Requirements: 17.1, 17.3, 17.4, 17.5_
  - _Decisions: D23_

- [x] 4. Add the copy hook
  - Create `tools/copy-check-streams.ts` (`copyCheckStreams`) and `tools/copy-check-streams.test.ts` as in "The copy hook": without hook mode every line goes to standard output; in hook mode with exit code 1 every line goes to standard error; in hook mode with exit code 0 one line goes to standard output.
  - Change `tools/check-copy.ts` to accept `--hook` and print through `copyCheckStreams`. Without `--hook` its output is unchanged.
  - Create `.kiro/hooks/copy-check-on-copy-save.json` exactly as in "The copy hook", and `tests/copy-check-hook.test.ts` with the checks listed there, in the form of `tests/render-check-hook.test.ts`. Do not change `.kiro/hooks/render-check-on-synth-save.json`.
  - Run `npm run --silent check:copy -- --hook` once and check that it exits with 0 and prints one line. Do not claim in any file that the hook's findings reach the agent.
  - Check: `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 19.1 to 19.5_
  - _Decisions: D24_

- [x] 5. Add the result copy
  - Create `src/copy/result-page-copy.ts`, `src/copy/result-lines.ts` and `src/copy/saved-visit-lines.ts` with the constants, types and functions of "The copy" in `design.md`, word for word. They import only from `src/config` and other copy files.
  - Create `src/copy/result-copy.test.ts` as in "The copy tests": every exported string, every output of the tables, the representative inputs against the banned terms, levels labelled relative to the calibration, and the `RangeError` cases.
  - Add to `src/session/result-page-types-match.test.ts`: `WingStateName` equals `WingState`; `UnreliableReasonName` equals `VisitUnreliableReason`; `SaveRefusalName` equals `SaveRefusal`; `DeleteRefusalName` equals `DeleteRefusal`.
  - Check: `npm run check:copy`, `npm test`, `npm run lint`, `npm run typecheck`.
  - _Requirements: 1.6, 12.4, 15.1, 15.2, 16.1 to 16.3, 18.1 to 18.6_
  - _Decisions: D11, D17, D18, D19, D21, D22, D30_

- [x] 6. Add the visit store
  - Create in `src/storage/`: `storage-area.ts`, `saved-visits-key.ts`, `visit-store-types.ts`, `entry-checksum.ts`, `storage-error-kind.ts`, `fake-storage-area.ts` and `create-visit-store.ts`, as in "The stored format" in `design.md`, each with its test where "Files" lists one. Nothing in `src/storage` imports outside `src/config`, reads a clock or draws a random number.
  - `entry-checksum.test.ts`: known values for fixed fields; a change of any one field changes the checksum; eight lowercase hexadecimal digits.
  - `storage-error-kind.test.ts`: `QuotaExceededError` and `NS_ERROR_DOM_QUOTA_REACHED` by name, codes 22 and 1014, `SecurityError`, a plain `Error`, and values that are not errors.
  - `fake-storage-area.test.ts`: each option behaves as described, and calls are recorded.
  - `create-visit-store.test.ts`: the value's format and key; one row for each line of the failure table in "The Visit_Store"; each rule of "What storage checks"; untouched and unreadable entries and unknown fields kept as the same JSON values on every write; the key removed when the last entry goes and on `removeAll`; `notFound` and `idTaken`; a refused or full write leaves the area's content as it was; no other key is read or written.
  - Add to `src/session/result-page-types-match.test.ts`: the storage `StorageArea` equals the contract's.
  - Check: `npm test`, `npm run lint`, `npm run typecheck`.
  - _Requirements: 1.6, 3.4, 3.5, 4.1 to 4.5, 5.1 to 5.3, 6.1 to 6.6, 7.1 to 7.5_
  - _Decisions: D4, D5, D6, D7, D8_

- [x] 7. Add the picture model
  - Create `src/session/light-depth-fraction.ts` (`lightDepthFraction`) and its test as in "How far the light reaches": the table's values with the proposed config; each state; a span of 0 or less; thresholds outside the scale held at its ends; settings given as a parameter with `resultPageConfig` as the default.
  - Create `src/session/result-picture.ts` (`resultPicture`) and its test as in "`resultPicture(input)`", without the outline step: `earlier` and `comparison` are always null.
  - `result-picture.test.ts`, on summaries made with `summarizeVisit` from hand-built logs: a quick visit has three floors in visit order and the cellar and nursery closed; each state's line, depth and reason line; the difference label and line for null, 0, 15 and −15; the swapped repeat offered on a live picture and never on a saved one; the false alarm line; the notice and its limit when the visit is marked, and none otherwise; the limits statement is the constant itself; `floorDb` from the config for a live picture and from the saved visit otherwise; the date, visit type labels, caption and file name; the picture is deeply frozen and equal for equal inputs.
  - Check: `npm test`, `npm run lint` (no clock read and no `Math.random` in `src/session`), `npm run typecheck`.
  - _Requirements: 12.1 to 12.5, 13.1 to 13.5, 14.1 to 14.3, 15.1 to 15.4, 16.1 to 16.4, 17.2_
  - _Decisions: D15, D16, D18, D19, D20, D21_

- [x] 8. Add the archive
  - Create `src/session/canonical-headphone-name.ts` (`canonicalHeadphoneName`, `sameHeadphoneNameKey`) and its test: NFC, runs of white space and control characters, trimming, empty to null, letter case kept in the tidy form and ignored in the key.
  - Create `src/session/saved-visit-payload.ts` (`savedVisitPayloadJson`, `parseSavedVisitPayload`) and its test as in "The saved visit and the visit log": a payload written and read back deep-equals the JSON round trip of its visit; one case that returns null for each rule of "Checking a payload"; a payload whose summary offers the swapped repeat less often than its difference allows still reads; it never throws for any string. Add to `src/session/result-page-types-match.test.ts` a check that the parser's list of known reasons covers `VisitUnreliableReason` exactly.
  - Create `src/session/create-visit-archive.ts` (`createVisitArchive`) and its test as in "The archive", on `createFakeStorageArea` and a wall clock written in the test: a bad seed throws a `RangeError`; nothing is called at creation; `list` in each state with its lines; `save` writes one entry with the wall clock's time and date and the shipped `floorDb` and difference; a second save of the same log changes only the name, or nothing; `nameTooLong` at one past the limit; `tooMany` at the limit; every store refusal maps to its reason and line; `idTaken` draws again; a clock set back keeps the order of saving; `deleteVisit`, `deleteAll` and `notFound`; `exportVisitLog`; in robot mode the storage function is never called; with a storage function that throws, no method throws.
  - Check: `npm test`, `npm run lint`, `npm run typecheck`.
  - _Requirements: 3.1, 3.2, 3.4, 5.4 to 5.6, 7.5, 7.6, 8.1 to 8.4, 9.1 to 9.8, 10.1 to 10.4, 11.1 to 11.4_
  - _Decisions: D3, D9, D10, D11, D12, D13, D14, D26, D27_

- [x] 9. Write the brief's properties and those of the picture
  - Create `tests/properties/result-page-arbitraries.ts` and `tests/properties/result-page-text.ts` as in "Correctness properties" in `design.md`, without earlier visits for now.
  - Create the files for CP1, CP2, CP3 and CP4 with the run counts of "Run counts and time", each with a timeout of 120 seconds.
  - Create `tests/properties/result-page-regressions.test.ts` with a comment on the naming rule and one `it.todo`, as the earlier specs do.
  - Run `npm test` three times and write the time of each new property file in `design.md` under "Run counts and time". If this spec's property files take more than 30 seconds together, stop and report the times.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 12.5, 13.1 to 13.4, 14.1 to 14.4, 17.2, 18.4, 21.1 to 21.5, 22.1_
  - _Decisions: D16, D21, D28_

- [x] 10. Write the properties of storage and the archive, and save simulated visits
  - Add to `tests/properties/result-page-arbitraries.ts` the stored values and storage behaviours of "Correctness properties".
  - Create the files for CP5, CP6, CP7 and CP8 with the run counts of "Run counts and time", each with a timeout of 120 seconds.
  - Create `tests/properties/result-page-simulated-visits.test.ts`: a quick and a full visit played to the result through `tests/properties/visit-flow-harness.ts` and `tests/listeners/simulated-visitor.ts`, with fixed seeds and the worst-case renderers through `vi.mock`, each saved through an archive on a fake storage area, listed back deep-equal to the JSON round trip of the result snapshot's log and summary, exported, and drawn with `resultPicture` for both kinds.
  - Write in `design.md` under "Measured sizes" the length in characters of the stored value after each of the two saves, with the seeds and the listener used, and say whether the estimate under "Sizes" holds, and what the measured sizes mean for the options of Q4. Do not change `savedVisitsMaxCount`.
  - Run `npm test` three times and write the time of each new property file under "Run counts and time". If this spec's property files take more than 30 seconds together, stop and report the times.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 4.1 to 4.4, 5.1 to 5.6, 6.1 to 6.6, 7.1 to 7.6, 8.3, 9.1 to 9.8, 10.1 to 10.4, 11.1, 11.2, 21.3 to 21.5_
  - _Decisions: D5, D6, D7, D9, D13, D28_

- [x] 11. Update the READMEs
  - `src/storage/README.md`: the store, the key and its version, the envelope and opaque payload, the checksum, unreadable entries and values, the failure names, the fake storage area, and that nothing leaves the browser.
  - `src/session/README.md`: a section on the result page: the contract and its rule of only adding, the archive and robot mode, the payload and how a saved visit relates to the visit log, the picture model and how far the light reaches, with its numbers described as proposed, not approved.
  - `src/copy/README.md`: a section on the result page's copy, the limits statement and its exemption, and that the headphone name never enters a sentence.
  - `src/config/README.md`: `result-page-config.ts` with its proposed values, `system-wall-clock.ts`, and `limitsStatementAllowedTerms`.
  - `tools/README.md`: the copy check's exemption and hook mode, and the copy hook.
  - `tests/properties/README.md`: a section on the result page's properties, arbitraries, text helpers, simulated visits and regression file.
  - Write nothing about comparison with an earlier visit here; task 12 adds it.
  - Check: `findBannedTerms` over the six changed READMEs with `bannedTerms`, through a one-off `npx tsx -e` that writes nothing; `npm run lint`.
  - _Requirements: 23.4_
  - _Decisions: D29_

- [x] 12. Add comparison with an earlier visit
  - Create `src/session/find-earlier-visit.ts` (`findEarlierVisit`) and its test as in "Comparison with an earlier visit": the newest earlier visit with the same name; the shown visit never; an unlisted or null shown id; empty and space-only names; letter case and spacing ignored; visits with no name never match.
  - Create `src/copy/comparison-lines.ts` with `comparisonCopy`, `earlierVisitLine` and `earlierVisitUnreliableLine` word for word, and add its strings and outputs to `src/copy/result-copy.test.ts`.
  - Change `src/session/result-picture.ts` by adding the outline step, and add to `src/session/result-picture.test.ts`: outlines on shared floors only; none for unreliable earlier ears; outline depths on the shown floor's scale; the comparison line for an earlier visit marked as a whole and for one that was not; with `earlierVisit: null` every existing case gives the same picture as before. Change nothing else in `result-picture.ts`.
  - Add a paragraph on comparison to `src/session/README.md` and `src/copy/README.md`.
  - Check: `npm run check:copy`, `npm test`, `npm run lint`, `npm run typecheck`, and `findBannedTerms` over the two READMEs as in task 11.
  - _Requirements: 20.1 to 20.6_
  - _Decisions: D25_

- [x] 13. Write the comparison property
  - Add earlier visits to `tests/properties/result-page-arbitraries.ts`, and let CP1 and CP2 draw an earlier visit or none.
  - Create the file for CP9 with its run count and a timeout of 120 seconds.
  - Run `npm test` three times and write the times of CP1, CP2 and CP9 under "Run counts and time" in `design.md`. If this spec's property files take more than 30 seconds together, stop and report the times.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 20.1 to 20.5, 21.1 to 21.4_
  - _Decisions: D25, D28_

- [x] 14. Final checks
  - Run `npm run typecheck`, `npm test` (three times), `npm run lint`, `npm run check:copy` and `npm run build`.
  - Search `src/session/`, `src/storage/` and `src/copy/` for numbers that set a depth, a limit or a count outside `src/config` (R2.5). Search `src/ui/` and confirm that no file this spec could have touched imports `src/storage`.
  - Run `git status` and `git log` for this spec's commits: no file under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/` or `.kiro/steering/`, nor `index.html`, `listen.html`, `src/main.ts`, the root `README.md` or `src/session/visit-flow-types.ts` was changed by this spec.
  - Review the work against `requirements.md` and the coverage table of `design.md`. If tasks 12 and 13 were left out, check that R20.5 holds: every `earlier` and `comparison` is null and nothing refers to a missing file. Confirm that Q1, Q4 and Q5 and the visit limit are still described as proposed, not approved, and that visit-flow Q1 to Q4 are still described as open.
  - Check: every command above.
  - _Requirements: 2.2, 2.5, 22.1 to 22.3, 23.1 to 23.4_
  - _Decisions: D29_

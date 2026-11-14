# Tasks: ghost sounds

Work through the tasks in order. Each task ends with its own checks passing and one or more small commits whose messages say what changed, in the present tense. Commit messages follow `wording.md`: no "pass", "fail", "score", "test result" or the other banned words (D28). Requirement numbers refer to `requirements.md`. Decision numbers refer to the Decisions section of `design.md`, and CP numbers to its Correctness properties.

Do not add any code that plays sound, any page or any player (R17). Do not change the lint rules. Do not edit `.kiro/steering/audio-safety.md`, `docs/briefs/02-ghost-sounds.md` or `docs/briefs/03-audio-output.md`. If one of them still has uncommitted edits from the project owner, leave them uncommitted and out of every commit.

From task 2 until task 9, `npm run render:sounds` exits 1 with the stub's "rendering is not implemented yet" message. That is expected (D27). Do not run it as a check before task 9.

If a property finds a counterexample, keep it as a named regression test in `tests/properties/ghost-sounds-regressions.test.ts`, first with `it.fails`, and put the fix in a separate commit, as the Testing strategy in `design.md` describes. Never loosen a value from a steering file to remove one.

- [x] 1. Add the sound ids and the three config files
  - Write `src/config/sound-id.ts` as in the Config section of `design.md`.
  - Write `src/config/audio-safety-config.ts` with `fadeMinMs: 20` and `ghostSoundMaxDurationMs: 1500`, each with a comment quoting its row of the Initial values table, and a file comment saying where the values come from, that they may be made stricter at any time and that loosening needs the project owner's approval. Leave the ceiling out (D1).
  - Write `src/config/sound-rules-config.ts` and `src/config/ghost-sound-config.ts` with the fields and values in `design.md`. Each value's comment names the brief or its decision. Give each file its own `deepFreeze`, as `hearing-method-config.ts` does.
  - Write the three tests. `audio-safety-config.test.ts`: exact values, unit suffixes, frozen, and the two loosening guards with the message of R1.5. `sound-rules-config.test.ts`: exact values, unit suffixes, frozen, the largest `calibrationShapeDb` value is 0. `ghost-sound-config.test.ts`: every invariant listed under "Config tests" in `design.md`, including D24 and the octave tolerance for the band margin.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`.
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - _Decisions: D1, D2, D5, D6, D7, D8, D10, D12, D24_

- [x] 2. Add the FFT, the band edges and the spectrum energies
  - Write `src/audio/synth/fft.ts` (`fftInPlace`, iterative radix-2, forward and inverse, throwing a `RangeError` for a length that is not a power of two or for arrays of unequal length) and `fft.test.ts`: agreement with a direct DFT on fixed signals of lengths 1, 2, 8 and 1024; forward then inverse gives the input back; Parseval.
  - Write `src/audio/synth/band-edges.ts` and its test with the exact edges for 500 Hz and 8000 Hz from `design.md`.
  - Write `src/audio/synth/measure/spectrum-energies.ts` following D3, and `spectrum-energies.test.ts`: total equals the sum of squares; the bin width is at most 0.5 Hz at 22050, 44100, 48000 and 192000 Hz; a bin exactly on an edge counts as in band; a 500 Hz tone is more than 99.9 percent in its band; a 700 Hz tone is less than 0.1 percent in the 500 Hz band.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 3.1, 3.2, 3.3, 11.1, 11.4, 11.5_
  - _Decisions: D2, D3, D13_

- [x] 3. Add the fade measurement, measureSound and checkSound
  - Write `src/audio/synth/measure/measurement-types.ts` exactly as in the Measurement section of `design.md`.
  - Write `fade-lengths.ts` following D4, with its own `rampInverse`. It must not import any synthesis helper (R11.3). `fade-lengths.test.ts`: a constant signal with raised-cosine fades of 441 samples measures 441 within one sample at both ends; leading zeros followed by the same ramp measure the same length from the onset; a step after zeros measures at most one sample; a signal whose peak is at 15 ms after the onset measures at most 15 ms; an all-zero buffer gives 0.
  - Write `measure-sound.ts` and `check-sound.ts`. `check-sound.test.ts` covers each rule just inside and just past its limit, the rule order, the all-zero buffer (R6.2, R7.4), a non-zero first or last sample, and the calibration-only and ghost-only rules.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 6.2, 6.3, 7.4, 9.3, 11.1, 11.2, 11.3, 11.6, 11.7_
  - _Decisions: D4, D7, D8, D13_

- [x] 4. Add the synthesis helpers
  - Write `validate-sample-rate.ts`, `raised-cosine-ramp.ts`, `event-envelope.ts`, `shaped-noise.ts` and `finish-sound.ts` under `src/audio/synth/` as described in `design.md`, each with its test:
    - `validateSampleRate`: accepts 22050 and 192000; rejects 22049.9, 0, −1, NaN and ±Infinity with a `RangeError` naming the value and 22050.
    - `raisedCosineRamp`: 0 at 0 and below, 1 at 1 and above, 0.5 at 0.5, monotone.
    - `eventEnvelope`: zero at the start, peak 1 at the end of the attack, zero slope at the joins (checked numerically), and zero at `noteLengthMs` for the note shape.
    - `shapedNoise`: equal output for equal seeds; the magnitude of each bin of the FFT of the full-length output equals the gain function (no randomness in magnitudes, D11); bins 0 and M/2 are zero.
    - `finishSound`: first and last samples exactly zero; RMS equals `referenceRmsFraction` within 10⁻⁶ dB; returns a new `Float32Array`; throws an `Error` for an all-zero input.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 3.1, 3.2, 3.4, 3.5, 4.3, 7.1, 9.1_
  - _Decisions: D6, D7, D9, D11, D12, D14_

- [x] 5. Add the cellar knock, the corridor hum and the attic whine
  - For each, write the plan file and the render file as described under "The sounds" in `design.md`, with the draw order fixed and written in a comment at the top of the plan function.
  - Each `*.test.ts`: at seeds 1, 2 and 3 and at 44100 and 48000 Hz, `checkSound(measureSound(...))` is empty, there is no `NaN`, the length is `floor(durationMs × rate / 1000)`, and the plan is frozen. For the cellar, also check that a plan has exactly `knockCount` knocks.
  - Note the measured out-of-band ratio, the shortest fade and the crest factor at seed 1 in the commit message body, for comparison with the Feasibility table.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 4.1, 4.2, 4.4, 5.1, 5.2, 5.5, 5.7, 5.8, 6.1, 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2_
  - _Decisions: D5, D6, D9, D10, D15_

- [x] 6. Add the nursery music box and the stairs scrape
  - As task 5, for `nursery-music-box` and `stairs-scrape`. The nursery test also checks that no note in a plan equals the one before it. The stairs test checks that every grain start lies before `durationMs − grainLengthMinMs`.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 4.1, 4.2, 4.4, 5.3, 5.4, 5.7, 5.8, 6.1, 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2_
  - _Decisions: D5, D6, D10, D11, D15_

- [x] 7. Add the calibration hiss and the renderer record
  - Write `calibration-hiss.ts` as described in `design.md`. Its test checks the shape within `calibrationShapeToleranceDb` at 22050, 44100 and 48000 Hz, that the short-time RMS over 50 ms windows between the fades varies by less than 1.5 dB, and the rules at seeds 1 to 3.
  - Write `sound-renderers.ts` and its test: exactly the six Sound_Ids, frozen, each entry the matching function, and two renders with the same seed are equal even with another render in between (R3.5).
  - Check: `npm test`, `npm run lint`. Confirm with `npm run build` and a search of `dist/` that no synthesis code is in the bundle (R3.6).
  - _Requirements: 3.5, 3.6, 4.1, 5.6, 8.1, 10.1, 10.2, 10.3_
  - _Decisions: D8, D11_

- [x] 8. Write the property tests
  - Write `tests/properties/sound-arbitraries.ts` (seeds 0 to 2³² − 1, the report rates, the other rates of CP2, the rejected rates of CP5, and path arbitraries for CP8) and the files for CP1 to CP7 named in `design.md`, with the run counts given there. Give each test a timeout of 120 seconds. Write `ghost-sounds-regressions.test.ts` with a comment explaining the naming rule and no cases yet.
  - Run `npm test` three times and note the time of CP1 and CP2 in the commit message body. If together they take more than 60 seconds, lower the run counts as D21 says and update D21 with the measured times.
  - If a property finds a counterexample, follow the rule at the top of this file.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 6.1, 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2, 10.1, 10.3, 11.5, 11.6, 11.7, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  - _Decisions: D21_

- [x] 9. Replace the render tool
  - Write the files under `tools/sound-render/` and their tests: `parse-render-arguments` (no arguments, repeated `--changed`, `--hook`, unknown arguments, `--changed` without a path); `sounds-for-changed-path` (D17, with Windows-style and absolute paths); `hook-event-paths` (paths at any depth, in arrays, under any key; empty, non-JSON and pathless input); `measure-sounds` (with the real renderer for one sound, and with an injected throwing renderer); `format-sound-report` (fixed decimals, worst value with its seed, the rules column, no date, the Notes section).
  - Replace `tools/run-sound-render.ts` with the core of the Interface section of `design.md`, and replace `tools/run-sound-render.test.ts` with tests of the three modes using injected renderers: one meeting every rule, one breaking the band rule, one skipping the fade, and one that throws. Check exit codes, which lines go to standard output and which to standard error in hook mode, that a report is returned only in full mode, and that a witness line is returned only in hook mode, with the input cut to 4000 characters. Remove the stub's tests (D27).
  - Add a test that runs `findBannedTerms` with `bannedTerms` over a report built from real measurements and over every line the core can print, including each broken-rule description (R12.7, D22).
  - Write the CP8 property file.
  - Replace the body of `tools/render-sounds.ts`: parse the arguments, read standard input only for `--hook` and only when it is not a terminal, stopping at the end of the stream or after 2 seconds without data; call the core; create `docs/reports/` if needed and write the report; append the witness line to `path.join(os.tmpdir(), "did-you-hear-that-hook-runs.log")`, warning on standard error if that fails; print the lines; set `process.exitCode`.
  - Check: `npm test`, `npm run lint`, `npm run typecheck`.
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_
  - _Decisions: D16, D17, D18, D22, D27_

- [x] 10. Write the sound report
  - Run `npm run render:sounds`. It must exit 0 and write `docs/reports/sounds.md`. Run it a second time and confirm with `git diff` that the report does not change.
  - Read the report against the Feasibility table in `design.md`. If any sound's margin to a limit is under 3 dB or 3 ms, note it in the commit message body. Do not change a rule.
  - Run `npm run render:sounds -- --changed src/audio/synth/cellar-knock.ts` (one sound, no report written), `-- --changed src/config/ghost-sound-config.ts` (every sound) and `-- --changed src/ui/base.css` (nothing checked, exit 0). Confirm with `git status` that only the report changed.
  - Commit the report.
  - _Requirements: 10.4, 12.1, 12.2, 12.3, 12.5, 13.1, 13.2, 13.3, 13.4, 13.10_
  - _Decisions: D16_

- [x] 11. Add the hook
  - Write `.kiro/hooks/render-check-on-synth-save.json` exactly as in "The hook" in `design.md`.
  - Write `tests/render-check-hook.test.ts` with the field checks, the matching and non-matching paths, and the check for regular expression features the Rust `regex` crate lacks.
  - Run the hook's command by hand the way Kiro will:
    - `echo '{"path":"src/audio/synth/attic-whine.ts"}' | npm run --silent render:sounds -- --hook`: exit 0, one summary line on standard output, one new line in the witness log
    - `npm run --silent render:sounds -- --hook < /dev/null`: every sound is checked and the reason is printed.
  - Do not test the hook by making a bad change in this session. Hooks load when a session starts, so this session cannot show the hook firing (D19). Task 14 does that.
  - Check: `npm test`, `npm run lint`.
  - _Requirements: 13.5, 13.6, 13.7, 13.9, 14.1, 14.2, 14.3, 14.4, 14.5_
  - _Decisions: D18, D19_

- [x] 12. Update the READMEs
  - `src/audio/synth/README.md`: the six sounds and their files, the plan and render split, `finishSound`, the `measure/` subdirectory and who may use it (D13), and that nothing here plays sound.
  - `tools/README.md`: the render tool's three modes, the report, and the witness log.
  - `docs/README.md`: `reports/sounds.md`, and `experiments/hook-catches.md` once task 14 writes it.
  - Run `findBannedTerms` over the changed READMEs, for example with a short `npx tsx -e` call, and expect no match.
  - _Requirements: 18.1, 18.2_

- [x] 13. Final checks before the hook demonstration
  - Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run render:sounds`. All exit 0, and the report does not change.
  - Search `src/audio/synth`, `tools/sound-render`, `tools/run-sound-render.ts` and the new tests for the literals `20` and `1500` used as a fade or a duration. Every such use reads `audioSafetyConfig` (R1.4).
  - Confirm that `git ls-files` lists no `.wav`, `.mp3`, `.ogg`, `.flac` or `.m4a` file and that no file under `tools/lint/` or `eslint.config.js` changed (R17).
  - Review the whole diff of this spec against the requirements coverage table in `design.md`.
  - Commit everything, so that the hook file is in a commit before task 14's session starts.
  - _Requirements: 1.4, 3.1, 3.2, 17.1, 17.2, 17.3_
  - _Decisions: D23_

- [ ] 14. Show the hook firing on a deliberate bad change, and record it
  - This task runs from a new session, started after task 13's commit. Follow "The hook in a headless CLI session" in `design.md`.
  - Note the number of lines in the witness log, `kiro-cli --version` and `git hash-object .kiro/hooks/render-check-on-synth-save.json`.
  - Run the headless command given in `design.md`, from the repository root, with its output captured to `$TMPDIR/hook-demo-stream.jsonl`.
  - Afterwards, confirm with `git status` and `git diff` that `src/audio/synth/attic-whine.ts` is back as it was. If it is not, restore it with `git checkout -- src/audio/synth/attic-whine.ts`. The bad change is never committed (R15.5).
  - If the witness log gained a line for the change, write `docs/experiments/hook-catches.md` with every item listed for every case in `design.md`.
  - If it gained no line, write the record with the extra items listed for that case, using the sentence given there. Then take the PostToolUse fallback of D20: add the second hook to the same file, extend `tests/render-check-hook.test.ts`, commit, start a new headless session, and repeat once. Record that run the same way. If there is still no line, repeat the demonstration in the Kiro IDE by asking the agent there to make the same change, and record that run too. Update D20 in `design.md` with what was found, and keep or remove the second hook accordingly.
  - Mark the brief's Done-when line as met only if one recorded run has a witness line for the deliberate change. Otherwise, say in the record that it is still open (R15.6).
  - Commit `docs/experiments/hook-catches.md` and any change from the fallback. Do not commit the stream capture or the witness log.
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 14.1_
  - _Decisions: D19, D20_

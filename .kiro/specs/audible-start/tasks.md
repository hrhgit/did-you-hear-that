# Tasks: audible start

Work through the tasks in order. Each task ends with its own checks holding, and after every task `npm run typecheck`, `npm test`, `npm run lint` and `npm run check:copy` pass. Requirement numbers refer to `requirements.md`; decision, question and CP numbers to `design.md`.

The order is the one the request fixes: the calibration target (task 1); the calibration music with its copy, the anchor steering, the rule 6 sentence and the cap (tasks 2 to 7); the playable floor and the Keep_Minimum (tasks 8 and 9); practice (tasks 10 to 16); the output latency and the result line (tasks 17 and 18); the wording and whole visits (task 19); the measurements and the steering (tasks 20 and 21).

**Commits.** Tasks do not commit. No task runs `git add`, `git commit`, `git push`, `git remote`, `git config`, `git stash`, `git reset`, `git checkout` or `gh`. After the tasks a separate run makes one commit per task with the one-line message the task proposes (present tense, no full stop), covering the files the task lists. Before ending a task, run `git status` and check that only the files the task names were created or changed. The files that were already changed or untracked before task 1 (`docs/licences.md`, `src/ui/visit/visit.css`, `src/ui/visit/calibration-action-for-key.ts` and its test, `public/`, `docs/briefs/08b-audible-start.md`) are not this spec's and go in no task's commit.

**Boundaries.** The project owner builds the screen by hand in the same working tree. No task creates or changes anything under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/` or `public/`, any CSS or HTML file, `src/main.ts`, the root `README.md`, `docs/licences.md`, `src/audio/synth/`, `src/storage/`, `package.json`, `package-lock.json`, a hook or a lint rule (R28.1). No task adds, converts or downloads an audio file or writes decoded audio to disk (R28.2). No task plays a sound or opens a browser: no `npm run dev`, `npm run preview`, `npm run test:e2e` or Playwright command. In the two contract files the tasks only add, and change only the comments "Interface contract" in `design.md` names (R1.2). Every field a task adds to a type that an Owner_Literal builds is optional (D29); after every task `npm run typecheck` passes with the owner's files unchanged (R1.4). If a task cannot keep that, it stops and reports which file and which field.

**The decisions.** The brief's decisions were made by the owner's coordinator on 2026-11-16, at the owner's request. The owner may reverse any of them. The points the brief left open are D1 to D38 of `design.md`, each listed as a question Q1 to Q38 marked "Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it". The exception to rule 6 was approved by the owner on 2026-11-16. Write them so wherever a task writes about them, and never write that the owner decided a decision of the coordinator. Q39 to Q42 are FOR THE OWNER and stay open; no task settles them. Never change a steering value except as "Steering" in `design.md` gives it, never loosen an audio-safety value, and if a task finds that it would have to, it stops and reports.

**Names are final.** The names and shapes of "Interface contract" are final. If a task finds that one must change, it stops before the change and reports which and why.

**Run counts, timeouts and time.** The run counts are those of "Correctness properties" (Q36). No task lowers a run count, a timeout or a tolerance. Every property file has a timeout of 120 seconds. Every task that adds property files runs `npm test` three times, with Vitest's JSON reporter written outside the working tree (for example `npm test -- --reporter=default --reporter=json --outputFile=/tmp/audible-start-times-<n>.json`, removed afterwards), and writes under "Run counts and time" in `design.md`: the time of each of this spec's property files in each run (the sum of its test durations, without its import), their sum, the whole of `npm test`, the date, and whether the machine was loaded. It never stops because of time; task 21 computes the budget (R24.4). A test under `src/audio` that hits its 5 second timeout on a loaded machine is run again, not changed.

**Counterexamples.** A property that fails is a fault of the code or a wrong statement of the property. Never weaken a property to make it pass. For a fault, add the case to `tests/properties/audible-start-regressions.test.ts` as `regression <n>: <what went wrong> (<property>, seed <s>)`, written out and first with `it.fails`, write it under "Counterexamples" in `design.md`, stop the task and report it. For a statement you believe is wrong, change nothing in the property, write the case under "Counterexamples" and report it. If an existing accuracy property of the threshold search or the visit flow fails (threshold-search CP1 to CP3, visit-flow CP11), stop and report the property and by how much it misses its tolerance, and loosen nothing (R24.2).

## The light plan of 2026-11-16

The Kiro credits ran out after task 7. From task 8 on, the code was written by Claude Code (Claude Opus 5.5) in this working tree, at the owner's request, and in a lighter form that the owner approved: less new machinery, the same audio-safety rules and no loosened tolerance, run count or timeout. Each block below was committed on its own after `npm run typecheck`, `npm run lint`, `npm run check:copy` and `npx vitest run` passed. The owner's screen (`src/ui/`, `tests/e2e/`) was changed in the same way, because the practice needs a screen to be usable. The task list below is kept as Kiro wrote it; this section says what happened to each open task.

| Task | What happened | Commit |
|---|---|---|
| 8. The playable floor | Done as written. | 9f1d48d |
| 9. Keep_Minimum −27 dB | Done as written. | 9f1d48d |
| 10. The practice ladder and the search's starts | Simplified. The ladder is the anchor, then one upward step, at most the room's top (`practiceLevelsDb`). The search does not start from the practice: every ear starts 10 dB below the anchor (`hearing-method-config`), so CP2 (the search starts from the practice catch) has nothing to check and was not written. | 38d6725, 2d1ddcd |
| 11. Each ear's own starting level | Dropped, for the same reason: the fixed start of −10 dB stays. | none |
| 12. The practice copy and view | Done, with the screen drawn as well (the practice under the bar, the line while a practice sound plays, the notice with Start counting first and Try again after it). | 2d1ddcd, and the commit after 1834bd8 |
| 13. Practice in the room runner, logged apart | Done (`practised-room-runner.ts`; practice is logged in `visitLog.practice`, never in the trials). | 2d1ddcd |
| 14. Try again or go on | Done. | 2d1ddcd, ed75066 |
| 15. Practice in the swapped repeat | Dropped. The repeat runs on a room the visitor has already practised. | none |
| 16. The brief's properties | Simplified to one property, CP1 (`audible-start-cp1-practice-never-too-loud.property.test.ts`): no practice sound or trial of a room above its cap or below its floor, practice played as asked, each rise on an ear at most one upward step. It was mutation-tested (a doubled step and a floor of −80 were both caught). The visit-flow properties CP3, CP4, CP6 and CP7 and the regressions were extended to know practice; none was weakened. | 2d1ddcd |
| 17. Lengthen the window by the output latency | Dropped. A known-limits line in `hearing-method.md` says so instead. | this notes commit |
| 18. The Floor_Line | Done (`playableFloorLine`, shown under the floor's words). | 6086a3e |
| 19. The wording and whole visits | `check:copy` passes; the e2e suite was run headless and muted, after its tests were brought up to the music and the practice (see below). | ed75066 |
| 20. Measure the visit lengths | The measuring tool was dropped. Measured instead with a probe that was not kept: 200 simulated visitors of the plausible range per visit type, whole visits through the visit flow's harness, answers 0 to 1.4 s after the window opens, no rests. The rooms with their practice took a median of 4.5 minutes (90th percentile 6.5) in a quick visit and 7.8 minutes (10.9) in a full one; practice was about 20 s and 35 s of that. With the replay's half minute the visits stay under their names, "about 7 minutes" and "about 12 minutes", which were not changed. | none |
| 21. Practice and the floor in the steering | Done in a shorter form: the Practice section describes what was built, not the design's ladder; the floor bullets and the Bluetooth bullet are as the design wrote them; the latency bullet is new; "Starting level" stays. The READMEs of `src/session/` and `src/copy/` describe practice; the property budget was not measured again. | this notes commit |

The e2e tests the design listed under "May stop passing" were brought up to date, each still as strict: the listening page's first calibration sound is the music's loop, checked by its RMS times its level gain against the bottom of the control to 0.01 dB, and its peak times that gain against the ceiling (every other buffer is still checked as handed over); a stop allows the loop's own fade in beside the one stop fade; the replay and result fixtures use thresholds inside the playable range (its floor is −35 dB at the calibration they keep), and the earpiece repeat uses even ears at −25 dB with a 15 dB imbalance, because at −30 the ear on the louder earpiece heard the floor itself and no floor offered the repeat; the visit tests know the practice.

Open for the owner: Q39, Q41 and Q42 need a person to listen, and nothing here settles them.

## The game layer of 2026-11-16

Not in this spec. The owner asked for the rooms to play more like a game, with gameplay put ahead of the precision of the calibration, and decided the design with Claude Code on 2026-11-16: the trials stay as they are, at random moments, and a lantern makes an answer cost something. Claude Code wrote it in this working tree, with the screen, and committed each step after `npm run typecheck`, `npm run lint`, `npm run check:copy` and `npx vitest run` passed.

| Step | What was built | Commit |
|---|---|---|
| The lantern | `lanternConfig` (3 lights, 8000 ms to come back) and `createLantern`. | db6056a |
| The lantern in the rooms | Every answer in a counted room spends a light and a catch gives it back. With no light left an answer is logged as one that scored nothing and the room holds its trials until a light is back. A pause fills the lantern. The snapshot carries the lantern and the chase (caught, in a row, the quietest catch on each side). The practice and the swapped repeat have none. | db6056a |
| The picture | A caught sound shows its shape by its wall; a sound that went by is shown leaving by its side, with "One went by on your left" or "That one was on your left". The lantern's lights, the count and the row, and a depth scale at each edge. A dark lantern dims the house slowly and says so. | f69fe64 |
| The score | The result page shows the catches in all, the longest row and the catches of each room, counted from the log by the same function as the rooms. It shows no levels side by side, because the limits statement says floors cannot be compared; the depth per floor that was first proposed was changed to a count for that reason. | b861f67 |
| The rules | A fourth sentence about the lantern, and a second line of the counting. | f69fe64 |

What changed in rules that held before:

- A sound that went by used to show nothing. It is now shown after its trial is scored. The reactions `slipped` and `otherSide` are new; `reactionOfEvent` gives both only for a `trialScored` event.
- A room's snapshot used to stay the same from one decision to the next. The lantern now changes between decisions. The properties were restated, not loosened: visit-flow CP3 compares the snapshots without the lantern, and checks that a light comes back exactly `rechargeMs` after an answer or the light before, that an answer that decides nothing costs one light (none when dark or paused) and that a deciding answer costs one unless it was a catch; CP2 discards a trial also when the lantern went dark while it was presented; the screen-leak properties record a change of the lantern alone apart and require it to be one light. The predictor still sees every change and still does no better than chance.
- The rules test now expects four sentences. The design-pinned `resultPageCopy` is unchanged; the score's heading is in `chaseScoreCopy`.

Checked: the e2e suite ran headless and muted with the lantern. The practice test failed on the new chase line before the counting's lines, and was restated to check those lines, the full lantern, "0 caught" and both empty depth scales; the suite then passed. Screenshots showed the depth scales crossing the house's eaves and floor names on a narrow upright screen, and the counting's lines running into the roof; both were moved in `visit.css`.

Not done: the `WHOLE_VISIT=1` spec was not run with the lantern, and nobody has played it to tune `rechargeMs`.

## The pace and the ghost of 2026-11-16

Not in this spec. The owner played and found a room too long, and asked for the ghost to be drawn after the Kiro ghost. Claude Code changed both in this working tree on 2026-11-16 and committed them after `npm run typecheck`, `npm run lint`, `npm run check:copy`, `npx vitest run` and the e2e suite passed.

- **The pace.** Simulated visitors (psychometric listeners, quick visit, six threshold pairs, three rooms each) took about 80 s a room, 12 to 32 counted trials at about 4.3 s each. The gap between trials went from 1.5–4.0 s to 1.0–2.5 s and the response window from 2.0 s to 1.8 s, in `hearingMethodConfig` and the steering's Initial values table; the same visitors then took about 56 s a room. The window stays longer than the longest ghost sound (1.4 s), as the config test asks. Fewer trials were measured and not taken: with 1500 plausible listeners, a limit of 14 trials per ear instead of 20 moved the median room from 30 to 28 trials but the accurate ears from 48.7 % to 40.3 %.
- **Tests restated for the pace.** The gap literals of `src/engine/threshold-search.test.ts` follow the new range. In `tests/listeners/simulated-visitor.test.ts` the visitor leaves the swapped room at 40 s instead of 60 s, because the room now ends before 60 s and the test is about leaving before its end. `tests/properties/visit-flow-regressions.test.ts` regression 1 moved its device changes to 232 000 and 242 900 ms, measured on the same visit, so that they still fall in the third room's counting and between its second attempt's start and first sound.
- **The ghost.** The Kiroween rules forbid using the sponsor's logos and marks without its written consent, so the house draws a ghost of its own in that spirit, not the logo: a pale rounded figure with two tall dark eyes looking into the room, three soft lobes at its hem and a tail flicking towards the wall it came through, in a faint violet glow, edged by the lamp. A sound that went by is the same shape as a broken grey line, as before.

## The calibration control of 2026-11-16

Not in this spec. The owner played a visit and found that the music did not follow the control: it rose slowly towards the setting, and started too quietly. The owner decided to drop the limit on how fast the calibration sound rises and to raise its start. Claude Code changed it in this working tree on 2026-11-16 and committed it after `npm run typecheck`, `npm run lint`, `npm run check:copy`, `npx vitest run` and the e2e suite passed.

| What | Before | Now |
|---|---|---|
| `calibrationSettingMinDb`, where every calibration starts | −60 dB | −40 dB (about 66 dB below full scale) |
| `calibrationRiseMaxDb` | 5 dB | 40 dB, the whole control |
| `calibrationMusicRisePeriodMs` | 2000 ms | 100 ms, one gain step: one exponential ramp reaches the target |
| Calibration hiss repeats in the shell's per-ear rise limit | held to `upwardStepDb` | exempt, like a replay |
| Their guards | `<= −60`, `<= 5`, `>= 2000` | `<= −40`, `<= 40`, `>= 100` |

The steering's exception to rule 6 now says the calibration sound follows the control from −40 dB. Rule 4 and every other limit on the ghost sounds are unchanged. The two rise lines of `calibrationCopy` say the sound follows the control.

What changed in tests that held before:

- The tests that walked the old climb (5 dB per repeat, 0.25 dB per 100 ms step) now check that one repeat or one step reaches the target, with targets above the new bottom. The config test that the calibration rise is at most one upward step became a test that it covers the whole control.
- `tests/properties/visit-flow-regressions.test.ts`, regression 1: the calibration now ends sooner, so the visit's times moved. Its two device changes moved from 304 000 and 318 500 ms to 300 700 and 311 800 ms, so that they still land in the first counted trial of the third room's first attempt and in the first practice sound of its second, as the regression needs. The times were measured with a run of the same visit.
- `tests/properties/missed-sound-replay-regressions.test.ts`, regression 4: the gaps between replays are compared with `toBeCloseTo(…, 9)` instead of `toEqual`, because the clock now starts at a time where the subtraction gives 1200.0000000000002 ms. The gaps themselves are unchanged.

Not done: nobody has listened to the new start with headphones at a high system volume.

- [x] 1. Add the calibration target
  - Create `src/session/calibration-target-setting.ts` (`calibrationTargetSettingDb(settingDb, { bottomDb, topDb, stepDb })`) and its test, as "The calibration target" in `design.md`: on the grid, itself; between grid settings, rounded down with the tolerance of `next-calibration-setting.ts`; below the bottom and −Infinity, the bottom; above the top and +Infinity, the top; NaN and a value that is not a number, null.
  - Change `src/session/calibration-controller.ts`: `setTarget(settingDb)` sets the target from that function and notifies, and does nothing for null; `louder()` and `quieter()` compute their setting as today and pass it through the same function (D2). `open()` is unchanged: it puts the target at the bottom (D3). The way repeats are played does not change (R3.8). In its test: every row of the table; `louder` and `quieter` give what they gave before; a target set before `open` is at the bottom after it; repeats rise by at most 5 dB towards a target dragged to the top.
  - Change `src/session/visit-flow-types.ts` by `setCalibrationTarget` with its comment, and the optional `CalibrationSnapshot.targetSettingDb` with its comment, word for word from "Interface contract". Add type checks to `visit-flow-types.test.ts`.
  - Change `src/session/create-visit-flow.ts`: `setCalibrationTarget(settingDb)` calls `calibration.setTarget` in the `calibration` Stage with no Pause and is ignored otherwise; the `calibration` snapshot gives `targetSettingDb`, the bottom of the control while the calibration is fresh. In `create-visit-flow.test.ts`: the method in the table of stages and actions, accepted only in `calibration` without a pause; examples of a drag to the top, of NaN, and of a target before the start.
  - Change `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-timeline.ts` only to pass the method through. Change `tests/listeners/simulated-visitor.ts` and its test so that a script may calibrate by `setCalibrationTarget`, by presses (as today, the default) or both; `tests/properties/visit-flow-arbitraries.ts` draws which.
  - Create `tests/properties/audible-start-arbitraries.ts` with the control paths CP7 needs, and `tests/properties/audible-start-cp7-calibration-target.property.test.ts` (CP7, 300 runs). Run `npm test` three times and record the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`; `git diff src/session/visit-flow-types.ts` adds lines only.
  - _Requirements: 1.1, 1.3, 1.4, 3.1 to 3.9, 27.2_
  - _Properties: CP7_
  - _Decisions: D1, D2, D3, D29, D30_
  - _Files: creates `src/session/calibration-target-setting.ts`, `src/session/calibration-target-setting.test.ts`, `tests/properties/audible-start-arbitraries.ts`, `tests/properties/audible-start-cp7-calibration-target.property.test.ts`; changes `src/session/calibration-controller.ts`, `src/session/calibration-controller.test.ts`, `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-visit-flow.test.ts`, `tests/properties/visit-flow-harness.ts`, `tests/properties/visit-flow-timeline.ts`, `tests/properties/visit-flow-arbitraries.ts`, `tests/listeners/simulated-visitor.ts`, `tests/listeners/simulated-visitor.test.ts`, `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `Add a command that sets the calibration target to any setting`_

**End of batch 1.**

- [x] 2. Add the music's config and its pure helpers
  - Change `src/config/audio-output-config.ts`: add `calibrationSettingSpanMinDb` 10, `calibrationMusicRisePeriodMs` 2000, `calibrationMusicGainStepMs` 100 and `calibrationMusicLoadMaxMs` 10000 with the comments of "Config". In its test: the values, the unit endings, the guard that refuses `calibrationMusicRisePeriodMs` below 2000 with the loosening message, and that the step divides the period.
  - Create `src/config/calibration-music-config.ts` (`calibrationMusicConfig.filePath` `"audio/calibration-waltz.m4a"`, deeply frozen) and its test: the only field; a relative path without `..`; ends `.m4a`.
  - Create, in `src/audio/output/`: `measure-calibration-music.ts` (`measureCalibrationMusic(samples)`: `{ rmsFraction, peakFraction, crestDb }`, or null for an empty, silent or not finite buffer), `calibration-music-top.ts` (`calibrationMusicTopDb(crestDb)`: the highest grid setting at which the music's peak at Music_Level_Gain is at most the ceiling, and `calibrationControlTopDb(crestDb)`: the lower of that and `calibrationSettingTopDb()`), `next-calibration-music-setting.ts` (`nextCalibrationMusicSettingDb(playedDb, targetDb, topDb)` as "Playing" says), each with its test: a crest of 18.40 and of 18.44 dB gives −5; the measured case of 44 100 Hz (peak 0.92182, RMS 0.11088) gives a peak of 0.2338 at −5; a rise never above 0.25 dB a step; a fall in one step; never above the top. None imports Web Audio.
  - Create `tools/measure-calibration-music.ts` as D8: it decodes `public/audio/calibration-waltz.m4a` with ffmpeg into memory at 44 100 and 48 000 Hz, measures with `measureCalibrationMusic`, works out the top, the loop step and the loudness of the music and of the hiss (`ffmpeg -af ebur128`, the hiss from `renderCalibrationHiss` piped to ffmpeg's input), and prints them; it writes no file and is not run by `npm test`. Add one line to `tools/README.md`. Run it once if ffmpeg is on the machine and check that its figures equal "Measurements of the file" in `design.md` to the decimals given; if they differ, write the new figures there and report.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.1, 2.6, 4.3, 5.3, 5.4, 5.5_
  - _Properties: CP6 uses them (task 3)_
  - _Decisions: D6, D7, D8, D9_
  - _Files: creates `src/config/calibration-music-config.ts`, `src/config/calibration-music-config.test.ts`, `src/audio/output/measure-calibration-music.ts`, `src/audio/output/measure-calibration-music.test.ts`, `src/audio/output/calibration-music-top.ts`, `src/audio/output/calibration-music-top.test.ts`, `src/audio/output/next-calibration-music-setting.ts`, `src/audio/output/next-calibration-music-setting.test.ts`, `tools/measure-calibration-music.ts`; changes `src/config/audio-output-config.ts`, `src/config/audio-output-config.test.ts`, `tools/README.md`_
  - _Commit: `Add the calibration music's config and the pure functions that measure and step it`_

- [x] 3. Play the calibration music in the output stage
  - Change `src/audio/output/audio-backend.ts` by `loadCalibrationMusic(path)`, `startLoop(channels, startMs, levelGain, fadeInMs)`, `rampLoopLevel(levelGain, startMs, endMs)` and `stopLoop(fadeOutMs)`, with comments; `fadeToSilence` also stops the loop.
  - Change `src/audio/output/output-graph.ts` and `web-audio-backend.ts`: the loop's source of two equal channels, its level gain (exponential ramps) and its fade gain (the raised-cosine curve of `apply-output-fade.ts`), behind the stop gain; the fetch from `document.baseURI`, `decodeAudioData`, a copy of the first channel. Change `fake-audio-backend.ts`: a scripted `loadCalibrationMusic` (resolve, reject, pending) and a record of every loop call with its audio clock time.
  - Change `src/audio/output/create-audio-output.ts` by the shell's music calls of "Playing" in `design.md`: loading in the first `activate` that creates the context, once; measuring; the Music_Top; the fallback rules and the time-out (`hiss` for the life of the shell); start at the bottom with the fade in; steps by the injected timer that never overlap on the audio clock; the ceiling on the measured peak, logged if it ever acts; `busy` for every other sound while the music plays and during its stop fade; stop on `stopCalibrationMusic` and on every stop; `keepCalibration` with the music keeps the Played_Setting rounded down to the grid. The hiss repeats are unchanged. In its test: each row of the error table that concerns the music; loading once; the time-out; a result after the time-out dropped; `busy`; keep while rising.
  - Create `tests/properties/calibration-music-fixture.ts` (samples made in code, as "Testing the music under Node") and `tests/properties/audible-start-cp6-music-is-safe.property.test.ts` (CP6, 300 runs). Extend `tests/properties/output-shell-harness.ts` only by a music load the test resolves. Run `npm test` three times and record the times.
  - Change `src/audio/output/README.md` by the music path.
  - Check: `npm run typecheck`, `npm test`, `npm run lint` (Web Audio types only in `web-audio-backend.ts` and `output-graph.ts`), `npm run check:copy`.
  - _Requirements: 4.1 to 4.4, 4.7, 5.1 to 5.10_
  - _Properties: CP6_
  - _Decisions: D4, D5, D6, D7, D9, D10_
  - _Files: creates `tests/properties/calibration-music-fixture.ts`, `tests/properties/audible-start-cp6-music-is-safe.property.test.ts`; changes `src/audio/output/audio-backend.ts`, `src/audio/output/output-graph.ts`, `src/audio/output/web-audio-backend.ts`, `src/audio/output/fake-audio-backend.ts`, `src/audio/output/create-audio-output.ts`, `src/audio/output/create-audio-output.test.ts`, `src/audio/output/README.md`, `tests/properties/output-shell-harness.ts`, `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `Load, measure and loop the calibration music in the output stage`_

- [x] 4. Calibrate with the music, and write its copy
  - Change `src/copy/calibration-copy.ts` and `src/copy/visit-copy.ts` word for word from "The calibration copy" in `design.md`; `src/copy/leaving-copy.ts` (`pauseLines.deviceChanged`) and `src/copy/output-state-copy.ts` (device changed) as "Every place that names the hiss"; `src/copy/output-copy.test.ts` (`/calibrate again/i`) and the copy tests for every new string, free of banned terms and of "hand".
  - Change `src/session/calibration-controller.ts`: it plays the music while the shell's Calibration_Sound is `music`, the repeats while it is `hiss`, and while `loading` it remembers `open()` and starts the sound when loading ends, if still open; the target goes to the shell with `setCalibrationMusicTarget`; the played setting follows the shell's steps; `close()` and `keep()` stop the music; its top is the shell's `calibrationControlTopDb()`; its snapshot gives the sound and its line from the copy of that sound. In its test, with the Fake_Backend and the manual timer: the music path, loading then music, loading then fallback, the lines of each.
  - Change `src/session/visit-flow-types.ts` by `CalibrationSound`, `CalibrationAnchor`, the optional `CalibrationSnapshot.calibrationSound`, `heading` and `introLines`, the optional `LoggedCalibration.anchor`, and the rewritten comments of `startCalibration`, `louder`, `CalibrationSnapshot` and `playing`, word for word; type checks in `visit-flow-types.test.ts`.
  - Change `src/session/create-visit-flow.ts`: the `calibration` snapshot gives `calibrationSound`, `heading` (again or not), `introLines`, `line` and `controlTopDb` from the shell's top; a kept calibration is logged with `anchor` `music` or `hiss`; `startCalibration` while loading starts the sound when ready (R4.6); the comment of `calibrationFresh`. Change `src/session/visit-log-recorder.ts` and its test to record `anchor`. Examples in `create-visit-flow.test.ts`. Change `src/session/listening-page-session.ts` and its test so that its controller uses the music as the visit does (Q34).
  - Change the comments of `calibrationSettingMinDb` and `headphoneCheckLevelDb` in `src/config/audio-output-config.ts`, and the READMEs of `src/session/`, `src/copy/`, `src/config/`, `src/audio/output/` and `tests/listeners/` where they describe calibration, as "Every place that names the hiss" lists. Change `tests/listeners/simulated-visitor.ts` and `tests/properties/visit-flow-harness.ts` so that the harness resolves the music load with a fixture by default and can reject it.
  - Search `src/`, `tests/listeners/`, `tests/properties/` (not `screen-leak/`) and `tools/` for "hand" and "hiss" and check that every remaining one is in the table's "unchanged" or "owner" rows; report the owner's.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 1.1 to 1.4, 4.5, 4.6, 6.1 to 6.3, 7.1 to 7.5, 8.4_
  - _Properties: CP6, CP7 still pass; every existing calibration property passes_
  - _Decisions: D4, D10, D26, D29, D32, D34_
  - _Files: changes `src/copy/calibration-copy.ts`, `src/copy/visit-copy.ts`, `src/copy/leaving-copy.ts`, `src/copy/output-state-copy.ts`, `src/copy/output-copy.test.ts`, `src/copy/house-copy.test.ts`, `src/copy/README.md`, `src/session/calibration-controller.ts`, `src/session/calibration-controller.test.ts`, `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-visit-flow.test.ts`, `src/session/visit-log-recorder.ts`, `src/session/visit-log-recorder.test.ts`, `src/session/listening-page-session.ts`, `src/session/listening-page-session.test.ts`, `src/session/README.md`, `src/config/audio-output-config.ts`, `src/config/README.md`, `src/audio/output/README.md`, `tests/listeners/simulated-visitor.ts`, `tests/listeners/simulated-visitor.test.ts`, `tests/listeners/README.md`, `tests/properties/visit-flow-harness.ts`_
  - _Commit: `Calibrate with the music at a comfortable volume and rewrite the calibration copy`_

- [x] 5. Write the anchor and the exception to rule 6 into the steering
  - Change `.kiro/steering/hearing-method.md`: "Level scale" becomes the two paragraphs of "The anchor" in `design.md`, word for word.
  - Change `.kiro/steering/product.md`: step 2 becomes the text of "The anchor", word for word.
  - Change `.kiro/steering/audio-safety.md`: the sentence of "The exception to rule 6", word for word, indented under item 6. Nothing else.
  - Change the comment of `ghostSoundMaxDurationMs` in `src/config/audio-safety-config.ts` by the sentence of "The exception to rule 6". No value changes.
  - Change `docs/architecture.md`: the paragraph "The level scale" and open question 3, as "Every place that names the hiss" gives.
  - Check: `git diff .kiro/steering/audio-safety.md` adds that paragraph and removes no line; `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 8.1 to 8.3, 9.1, 9.2, 26.3_
  - _Decisions: the brief's anchor; the exception approved by the owner on 2026-11-16_
  - _Files: changes `.kiro/steering/hearing-method.md`, `.kiro/steering/product.md`, `.kiro/steering/audio-safety.md`, `src/config/audio-safety-config.ts`, `docs/architecture.md`_
  - _Commit: `Make the comfortable music volume the anchor and record the owner's exception for the calibration music`_

- [x] 6. Lower the cap to 5 dB above the anchor
  - Change `src/config/hearing-method-config.ts`: `capRelativeToAnchorDb` 5, with the comment of "Config". In its test: the value, and the guard that refuses above 5 with the message of "Config".
  - Change `.kiro/steering/hearing-method.md`: the row "Loudest allowed level" as "Steering" gives it.
  - Update every test that writes 15 as the cap or as an expected top, as the table of "The cap" lists, to the values the config now gives; change no property's statement, run count or tolerance. If a test or property fails for a reason other than an expected value of 15, stop and report.
  - Check that every room reaches at least `roomTopMinDb` (0) at the Control_Top of the music and of the hiss (`calibrationSettingTopDb` and `calibrationControlTopDb` tests).
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.3, 10.1 to 10.4_
  - _Properties: every existing property, unchanged statements_
  - _Decisions: the brief's cap_
  - _Files: changes `src/config/hearing-method-config.ts`, `src/config/hearing-method-config.test.ts`, `.kiro/steering/hearing-method.md`, and the tests listed in "The cap": `src/audio/output/room-top-level.test.ts`, `range-report.test.ts`, `prepare-playback.test.ts`, `create-audio-output.test.ts`, `src/session/room-search-cap.test.ts`, `listening-page-session.test.ts`, `room-runner.test.ts`, `create-visit-flow.test.ts`, `create-swapped-repeat.test.ts`, `missed-sound-replay-plan.test.ts`, `missed-sound-replay-view.test.ts`, `src/copy/swapped-repeat-copy.test.ts`, `tests/properties/swapped-repeat-arbitraries.ts`, and any other test whose expected value was the cap of 15_
  - _Commit: `Lower the cap to 5 dB above the anchor`_

- [x] 7. Keep saved visits from before and compare only like anchors
  - Create `src/session/calibration-anchor.ts` (`anchorKindOf(log, calibrationIndex)`, absent `anchor` giving `hands`; `floorAnchorKind(log, roomIndex)`; `sameAnchorKind`) and its test.
  - Change `src/session/result-picture.ts` and its test: an earlier mark only between floors of one Anchor_Kind, `comparison` null when no floor has one (R11.3). Change `src/session/find-earlier-visit.ts` and its test as R11.4.
  - Change `src/session/saved-visit-payload.ts` and its test: the rule for `calibrations[i].anchor` of "Checking a payload"; a payload of today reads unchanged.
  - Change `tests/properties/result-page-arbitraries.ts` to draw saved visits with and without `anchor`. Create `tests/properties/audible-start-cp10-saved-visits-and-anchors.property.test.ts` with CP10's anchor and payload parts (300 runs); task 8 and task 18 add the floor and the Floor_Line parts. Run `npm test` three times and record the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 11.1 to 11.5_
  - _Properties: CP10 (anchors); result-page CP5, CP7, CP9 unchanged statements_
  - _Decisions: D26_
  - _Files: creates `src/session/calibration-anchor.ts`, `src/session/calibration-anchor.test.ts`, `tests/properties/audible-start-cp10-saved-visits-and-anchors.property.test.ts`; changes `src/session/result-picture.ts`, `src/session/result-picture.test.ts`, `src/session/find-earlier-visit.ts`, `src/session/find-earlier-visit.test.ts`, `src/session/saved-visit-payload.ts`, `src/session/saved-visit-payload.test.ts`, `tests/properties/result-page-arbitraries.ts`, `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `Compare a visit only with earlier visits whose anchor was set the same way`_

**End of batch 2.**

- [ ] 8. Add the playable floor
  - Change `src/config/audio-output-config.ts` by `playableRmsMinFraction` and `playableRangeBelowAnchorMinDb` with the comments of "Config"; tests of the values.
  - Create `src/audio/output/room-floor-level.ts` and its test, as "The playable floor": −57.98 − S for every sound, never below −70. Change `src/audio/output/range-report.ts` and its test by `floorLevelDb`, `floorSetBy` and `playableRmsMinFraction`.
  - Create `src/session/room-search-floor.ts` and its test: the table of "The playable floor" at −27, −16, −5 and −4.
  - Change `src/session/visit-flow-types.ts` by the optional `LoggedCalibration.roomFloorLevelDb`, `LoggedRoomAttempt.searchFloorDb` and `RoomSummary.searchFloorDb`, word for word. Change `src/session/visit-log-recorder.ts`, `create-visit-flow.ts`, `create-swapped-repeat.ts`, `summarize-visit.ts`, `result-picture.ts`, `light-depth-fraction.ts` (comment), `swapped-repeat-comparison.ts`, `swapped-repeat-run-holds.ts`, `saved-visit-payload.ts` and `listening-page-session.ts`, and their tests, as the table "How each part gets it" says: each room run creates its search with `floorDb` its Search_Floor; the repeat throws if its floor differs from the first run's.
  - Extend CP10 by the floor rules of "Checking a payload", and the existing properties' arbitraries (`tests/properties/visit-flow-arbitraries.ts`, `output-arbitraries.ts`, `missed-sound-replay-arbitraries.ts`, `swapped-repeat-arbitraries.ts`, `result-page-arbitraries.ts`) by the floor where they build attempts or summaries. Change result-page CP3's statement as "Existing properties" says.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 12.1 to 12.8_
  - _Properties: CP10; result-page CP3; visit-flow CP5, CP6; swapped-repeat CP4_
  - _Decisions: D23, D24_
  - _Files: creates `src/audio/output/room-floor-level.ts`, `src/audio/output/room-floor-level.test.ts`, `src/session/room-search-floor.ts`, `src/session/room-search-floor.test.ts`; changes `src/config/audio-output-config.ts`, `src/config/audio-output-config.test.ts`, `src/audio/output/range-report.ts`, `src/audio/output/range-report.test.ts`, `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/visit-log-recorder.ts`, `src/session/visit-log-recorder.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-visit-flow.test.ts`, `src/session/create-swapped-repeat.ts`, `src/session/create-swapped-repeat.test.ts`, `src/session/summarize-visit.ts`, `src/session/summarize-visit.test.ts`, `src/session/result-picture.ts`, `src/session/result-picture.test.ts`, `src/session/light-depth-fraction.ts`, `src/session/swapped-repeat-comparison.ts`, `src/session/swapped-repeat-comparison.test.ts`, `src/session/swapped-repeat-run-holds.ts`, `src/session/swapped-repeat-run-holds.test.ts`, `src/session/saved-visit-payload.ts`, `src/session/saved-visit-payload.test.ts`, `src/session/listening-page-session.ts`, `src/session/listening-page-session.test.ts`, `tests/properties/visit-flow-arbitraries.ts`, `tests/properties/output-arbitraries.ts`, `tests/properties/missed-sound-replay-arbitraries.ts`, `tests/properties/swapped-repeat-arbitraries.ts`, `tests/properties/result-page-arbitraries.ts`, `tests/properties/result-page-cp3-depth-on-one-floor.property.test.ts`, `tests/properties/audible-start-cp10-saved-visits-and-anchors.property.test.ts`_
  - _Commit: `Play and count nothing below the room's playable floor`_

- [ ] 9. Raise the Keep_Minimum to −27 dB
  - Change `src/config/audio-output-config.ts`: `calibrationSettingKeepMinDb` −27, its comment naming D25 and the brief. In its test: the guard refuses below −27; −27 is exactly the lowest grid setting at which every room's Search_Floor is at most `−playableRangeBelowAnchorMinDb`; the Control_Top of the music (−5) and of the hiss (−4) minus the Keep_Minimum is at least `calibrationSettingSpanMinDb`.
  - Update the tests whose expected value was −40 (`create-audio-output.test.ts`, `calibration-controller.test.ts`, `create-visit-flow.test.ts`, `listening-page-session.test.ts`, and any other); the visit flow's arbitraries read the config.
  - Create `tests/properties/audible-start-cp3-nothing-below-floor.property.test.ts` with CP3 for the trials of the search (300 room runs, 50 whole visits); task 16 adds its practice part. Run `npm test` three times and record the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.4, 2.5, 13.1 to 13.3_
  - _Properties: CP3_
  - _Decisions: D25_
  - _Files: creates `tests/properties/audible-start-cp3-nothing-below-floor.property.test.ts`; changes `src/config/audio-output-config.ts`, `src/config/audio-output-config.test.ts`, the tests whose expected value was −40, `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `Raise the lowest setting that can be kept to leave 30 dB below the anchor in every room`_

**End of batch 3.**

- [ ] 10. Add the practice ladder and the search's starts
  - Create `src/session/room-practice.ts` (`createRoomPractice`) and its test, as "The rule for each ear" and "Order, gaps and answers": the ladder 0, 5, 5 at a cap of 5 and 0, 0 at a cap of 0; a wrong side not a catch; two misses at the top end an ear unheard; a random ear among those practising and a gap from the search's range, from the source it is given; a round for the given ears only; frozen; no clock.
  - Create `src/session/search-starting-levels.ts` (`searchStartingLevelsDb`) and its test: catch − 10 within floor and cap; null for `notHeard`.
  - Create `tests/listeners/practise-for-search.ts` (`practiseForSearch(listener, settings, random)`: plays a round with `createRoomPractice` and gives `startingLevelsDb`, going on at once for an unheard ear) and its test with Step_Listeners.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 14.2 to 14.7, 14.9, 15.7, 27.3_
  - _Properties: CP2 and CP5 use them (task 16)_
  - _Decisions: D12, D13, D17_
  - _Files: creates `src/session/room-practice.ts`, `src/session/room-practice.test.ts`, `src/session/search-starting-levels.ts`, `src/session/search-starting-levels.test.ts`, `tests/listeners/practise-for-search.ts`, `tests/listeners/practise-for-search.test.ts`_
  - _Commit: `Add the practice ladder of a room and the search's starting levels`_

- [ ] 11. Give each ear its own starting level and remove the fixed one
  - Change `src/engine/search-types.ts`, `ear-search.ts`, `validate-search-settings.ts` and the comment of `room-limits.ts` as "The search start, and the engine change": `startingLevelsDb`, null starting ended as worse than cap, the grid rules; both null finished at creation. Change their tests and `threshold-search.test.ts`.
  - Change `src/config/hearing-method-config.ts` and its test: remove `startingLevelDb`, add `practiceStartLevelDb` 0 with its comment.
  - Change every file of the table "What happens to `startingLevelDb`" in `design.md` as it says, and nothing else in them. In `create-visit-flow.ts` and `create-swapped-repeat.ts`, until task 13 each room run starts both ears at `searchStartingLevelsDb` of a catch at `practiceStartLevelDb` (−10), the start practice gives a visitor who catches the first practice sound; say so in a comment that task 13 removes.
  - Change the engine's shipped-settings checks and `tests/listeners/spec-search-under-test.ts`, `searches-under-test.ts`, `visit-rule-measurement.ts` and `attribution-measurement.ts` so that each room's starts come from `practiseForSearch` with the room's own listener (D35). Change `tests/properties/threshold-search-regressions.test.ts` so that each case runs with the settings it was found with, written out (start −25 for both ears, cap 15, floor −70); regression 4 stays `it.fails`.
  - Run threshold-search CP2 once without its skip. If it holds, remove the skip and its comment and write that under "Counterexamples" in `design.md`; if not, keep the skip and write the set and its share there. Run CP1, CP3 and visit-flow CP11; if one fails, stop and report the property and by how much, and loosen nothing.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`; `grep -rn startingLevelDb src tests tools` finds nothing.
  - _Requirements: 2.2, 14.10, 15.4, 15.5, 24.2, 24.3_
  - _Properties: threshold-search CP1 to CP13 and regressions; visit-flow CP5, CP11; swapped-repeat CP1, CP4 (statements as "Existing properties")_
  - _Decisions: D15, D16, D35_
  - _Files: changes `src/engine/search-types.ts`, `src/engine/ear-search.ts`, `src/engine/ear-search.test.ts`, `src/engine/validate-search-settings.ts`, `src/engine/validate-search-settings.test.ts`, `src/engine/room-limits.ts`, `src/engine/threshold-search.test.ts`, `src/config/hearing-method-config.ts`, `src/config/hearing-method-config.test.ts`, `src/config/audio-output-config.test.ts`, `src/session/room-search-cap.ts`, `src/session/room-search-cap.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-swapped-repeat.ts`, `src/session/listening-page-session.ts`, `src/session/listening-page-session.test.ts`, `src/audio/output/create-audio-output.test.ts`, `tests/listeners/classify-accuracy.ts`, `tests/listeners/classify-accuracy.test.ts`, `tests/listeners/spec-search-under-test.ts`, `tests/listeners/searches-under-test.ts`, `tests/listeners/visit-rule-measurement.ts`, `tests/listeners/attribution-measurement.ts`, `tests/properties/checks/valid-settings-arbitrary.ts`, `tests/properties/checks/ear-oracle.ts`, `tests/properties/checks/cp1-step-listeners-exact-check.ts`, `tests/properties/checks/cp5-levels-in-range-check.ts`, `tests/properties/checks/cp13-settings-validation-check.ts`, `tests/properties/checks/measure-listener-set.ts`, `tests/properties/output-arbitraries.ts`, `tests/properties/missed-sound-replay-arbitraries.ts`, `tests/properties/audio-output-cp11-range-report.property.test.ts`, `tests/properties/visit-flow-cp9-summary-and-visit-rule.property.test.ts`, `tests/properties/threshold-search-regressions.test.ts`, `tests/properties/threshold-search-cp2-accurate-or-flagged.property.test.ts`, `.kiro/specs/audible-start/design.md`_
  - _Commit: `Give each ear its own starting level and remove the fixed starting level`_

- [ ] 12. Add the practice copy and the practice view
  - Create `src/copy/practice-copy.ts` and `src/copy/practice-lines.ts` word for word from "The practice copy", and `src/copy/practice-copy.test.ts`: every string; every room; both sides and both; free of banned terms, "hand", "wireless" and "Bluetooth"; the `RangeError` cases.
  - Change `src/copy/leaving-copy.ts` and `src/copy/swapped-repeat-copy.ts` by `pauseLines.practiceNotHeard`, and their tests.
  - Change `src/session/visit-flow-types.ts` by `RoomPracticePhase`, `RoomPractice`, `practiceNotHeard` in `PauseReason` and `SwappedRepeatPauseReason`, and the comments of `VisitPause.reason` and `SnapshotBase.pause`, word for word. Create `src/session/room-practice-view.ts` and its test; create `src/session/audible-start-types-match.test.ts` (copy names against session names: pause reasons, phases, sides, Calibration_Sounds). Update the existing types-match tests of pause reasons.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 1.6, 15.1, 17.1, 18.1 to 18.5_
  - _Properties: CP9 checks these strings (task 19)_
  - _Decisions: D19, D33_
  - _Files: creates `src/copy/practice-copy.ts`, `src/copy/practice-lines.ts`, `src/copy/practice-copy.test.ts`, `src/session/room-practice-view.ts`, `src/session/room-practice-view.test.ts`, `src/session/audible-start-types-match.test.ts`; changes `src/copy/leaving-copy.ts`, `src/copy/swapped-repeat-copy.ts`, `src/copy/swapped-repeat-copy.test.ts`, `src/copy/output-copy.test.ts`, `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/swapped-repeat-types-match.test.ts`, `src/session/replay-types-match.test.ts`_
  - _Commit: `Add the practice lines of every room and the view of practice`_

- [ ] 13. Run practice in the room runner and log it
  - Change `src/session/visit-flow-types.ts` by `LoggedPractice`, `PracticeTrialCommon`, `ScoredPracticeTrial`, `DiscardedPracticeTrial`, `PracticeTrial`, `LoggedPracticeRefusedPlay`, the optional `VisitLog.practice`, `LoggedRoomAttempt.searchStartLevelDb` and `countingStartedAtMs`, word for word.
  - Change `src/session/visit-log-recorder.ts` and its test by the practice calls of "The log".
  - Change `src/session/room-runner.ts` and its test: options `createSearch(startingLevelsDb)`, the practice settings, `searchCapDb` and `searchFloorDb` in place of `search`; practice first, with the gap, play, window and scoring of trials; `practiceNotHeard(ears)` and `countingStarted(searchStartLevelDb)` callbacks; `resume()` in the Not_Heard state starts a new round; `goOnWithoutPractice()`; pauses discard and repeat a practice sound; refusals counted with the run's trials (D38); a search finished at creation finishes the run at once; `practiceScored` for every scored practice sound; the hook gives `practice: true` for a practice sound.
  - Change `src/session/create-visit-flow.ts` and `src/session/create-swapped-repeat.ts` only to build the runner the new way, removing the comment of task 11; the flow's pause `practiceNotHeard` comes in task 14, and until then a Not_Heard run goes on at once (say so in a comment that task 14 removes).
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 14.1, 14.7, 14.8, 15.2 to 15.5, 16.1, 16.2, 16.4, 16.5, 20.1, 20.4_
  - _Properties: visit-flow CP2, CP4, CP5, CP7 (statements as "Existing properties", changed here)_
  - _Decisions: D11, D13, D16, D18, D22, D38_
  - _Files: changes `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/visit-log-recorder.ts`, `src/session/visit-log-recorder.test.ts`, `src/session/room-runner.ts`, `src/session/room-runner.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-swapped-repeat.ts`, `tests/properties/visit-flow-cp2-log-holds-played-trials.property.test.ts`, `tests/properties/visit-flow-cp4-answers-against-windows.property.test.ts`, `tests/properties/visit-flow-cp5-log-replays.property.test.ts`, `tests/properties/visit-flow-cp7-pauses-discard-and-repeat.property.test.ts`, `tests/properties/visit-flow-cp7-check.ts`, `tests/listeners/simulated-visitor.ts`, `tests/listeners/simulated-visitor.test.ts`_
  - _Commit: `Begin every room run with practice and log it apart from the trials`_

- [ ] 14. Tell the visitor about practice and let them try again or go on
  - Change `src/session/visit-flow-types.ts` by `goOnWithoutPractice` and the sentence of `resume`, the optional `RoomSnapshot.practice`, `PracticeSoundScoredEvent`, `CountingStartedEvent` and the two members of `VisitEvent`, word for word.
  - Change `src/session/create-visit-flow.ts`: the pause `practiceNotHeard` begun by the runner's callback and written to the log; `resume` in it plays the practice again (a press); `goOnWithoutPractice`; the `room` snapshot's `practice` from `roomPracticeView`; `practiceSoundScored` and `countingStarted`; remove the comment of task 13. Examples in `create-visit-flow.test.ts`: each row of "What each new command accepts"; a silent visitor reaches the pause; try again; go on.
  - Change `tests/listeners/simulated-visitor.ts` and its test: it answers practice sounds from the hook, and handles the pause by a drawn number of tries and then `goOnWithoutPractice`, going on at once by default; `tests/properties/visit-flow-arbitraries.ts` draws the behaviour; `visit-flow-harness.ts` and `visit-flow-timeline.ts` pass `goOnWithoutPractice` through.
  - Change visit-flow CP1, CP3 and CP6 as "Existing properties" says, and nothing else in them.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 15.1 to 15.3, 15.6, 17.1 to 17.6, 27.1_
  - _Properties: visit-flow CP1, CP3, CP6_
  - _Decisions: D14, D19, D20_
  - _Files: changes `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-visit-flow.test.ts`, `tests/listeners/simulated-visitor.ts`, `tests/listeners/simulated-visitor.test.ts`, `tests/properties/visit-flow-arbitraries.ts`, `tests/properties/visit-flow-harness.ts`, `tests/properties/visit-flow-timeline.ts`, `tests/properties/visit-flow-cp1-visit-ends.property.test.ts`, `tests/properties/visit-flow-cp3-nothing-before-scoring.property.test.ts`, `tests/properties/visit-flow-cp6-rooms-as-output-requires.property.test.ts`_
  - _Commit: `Show the practice of each room and offer to hear it again or go on`_

- [ ] 15. Practise in the swapped repeat
  - Change `src/session/visit-flow-types.ts` by the optional `SwappedRepeatRoom.practice` and `SwappedRepeatRun.practice`, word for word.
  - Change `src/session/create-swapped-repeat.ts`, `swapped-repeat-run.ts`, `swapped-repeat-view.ts`, `swapped-repeat-run-holds.ts` and `create-visit-flow.ts` (the repeat's pause and `goOnWithoutPractice`), and their tests, as "Practice in the swapped repeat": practice on the swapped earpieces, each practice sound with its earpiece, the pause written to the run's record, the view's `practice`.
  - Change `tests/properties/swapped-repeat-harness.ts` and `swapped-repeat-arbitraries.ts`, and swapped-repeat CP3, CP7 and CP8 as "Existing properties" says.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 19.1 to 19.4_
  - _Properties: swapped-repeat CP1 to CP11_
  - _Decisions: D21_
  - _Files: changes `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/create-swapped-repeat.ts`, `src/session/create-swapped-repeat.test.ts`, `src/session/swapped-repeat-run.ts`, `src/session/swapped-repeat-run.test.ts`, `src/session/swapped-repeat-view.ts`, `src/session/swapped-repeat-view.test.ts`, `src/session/swapped-repeat-run-holds.ts`, `src/session/swapped-repeat-run-holds.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-visit-flow.test.ts`, `tests/properties/swapped-repeat-harness.ts`, `tests/properties/swapped-repeat-arbitraries.ts`, `tests/properties/swapped-repeat-cp3-earpieces-in-the-record.property.test.ts`, `tests/properties/swapped-repeat-cp7-safe-sounds.property.test.ts`, `tests/properties/swapped-repeat-cp8-nothing-before-scoring.property.test.ts`_
  - _Commit: `Begin the swapped repeat's room with practice on the swapped earpieces`_

- [ ] 16. Check practice with the brief's properties
  - Create `tests/properties/audible-start-cp1-no-jump.property.test.ts`, `audible-start-cp2-search-starts-from-heard.property.test.ts`, `audible-start-cp4-practice-does-not-count.property.test.ts`, `audible-start-cp5-silent-listener-told.property.test.ts` and `audible-start-cp8-practice-screen.property.test.ts`, as "Correctness properties", with the listeners and run counts stated there; extend `audible-start-cp3-nothing-below-floor.property.test.ts` by practice sounds; extend `audible-start-arbitraries.ts`; add the saved payload rules of practice to CP10.
  - Run `npm test` three times and record the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 14, 15, 16.3, 17, 20.3, 24.1_
  - _Properties: CP1, CP2, CP3, CP4, CP5, CP8, CP10_
  - _Decisions: D36_
  - _Files: creates the five property files above; changes `tests/properties/audible-start-cp3-nothing-below-floor.property.test.ts`, `tests/properties/audible-start-cp10-saved-visits-and-anchors.property.test.ts`, `tests/properties/audible-start-arbitraries.ts`, `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `Check that practice never jumps, starts the search from what was heard and counts for nothing`_

**End of batch 4.**

- [ ] 17. Extend the response window by the reported output latency
  - Change `src/config/hearing-method-config.ts` by `responseWindowLatencyMaxMs` 500 with its comment; its test.
  - Change `src/audio/output/audio-backend.ts`, `web-audio-backend.ts`, `fake-audio-backend.ts` and `create-audio-output.ts` by `outputLatencyMs()`, and their tests (null for undefined, NaN or negative).
  - Create `src/session/response-window-ms.ts` and its test. Change `src/session/visit-flow-types.ts` by the optional `LoggedCalibration.outputLatencyMs` and `LoggedRoomAttempt.responseWindowMs`, word for word. Change `room-runner.ts`, `visit-log-recorder.ts`, `create-visit-flow.ts` and `create-swapped-repeat.ts`, and their tests: the latency logged at keep; every window of a run that long; the attempt's `responseWindowMs`. Add the payload rules to `saved-visit-payload.ts` and its test.
  - Create `tests/properties/audible-start-cp11-latency-window.property.test.ts` (CP11, 200 runs). Change visit-flow CP4 as "Existing properties" says. Run `npm test` three times and record the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 21.1 to 21.5_
  - _Properties: CP11; visit-flow CP4_
  - _Decisions: D28, D31_
  - _Files: creates `src/session/response-window-ms.ts`, `src/session/response-window-ms.test.ts`, `tests/properties/audible-start-cp11-latency-window.property.test.ts`; changes `src/config/hearing-method-config.ts`, `src/config/hearing-method-config.test.ts`, `src/audio/output/audio-backend.ts`, `src/audio/output/web-audio-backend.ts`, `src/audio/output/fake-audio-backend.ts`, `src/audio/output/create-audio-output.ts`, `src/audio/output/create-audio-output.test.ts`, `src/session/visit-flow-types.ts`, `src/session/visit-flow-types.test.ts`, `src/session/room-runner.ts`, `src/session/room-runner.test.ts`, `src/session/visit-log-recorder.ts`, `src/session/visit-log-recorder.test.ts`, `src/session/create-visit-flow.ts`, `src/session/create-visit-flow.test.ts`, `src/session/create-swapped-repeat.ts`, `src/session/create-swapped-repeat.test.ts`, `src/session/saved-visit-payload.ts`, `src/session/saved-visit-payload.test.ts`, `tests/properties/visit-flow-cp4-answers-against-windows.property.test.ts`, `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `End each response window later by the output latency the browser reports`_

- [ ] 18. Say when a result is as quiet as the house can play
  - Create `src/copy/playable-floor-lines.ts` and its test, word for word from "The result line"; `src/session/playable-floor-ears.ts` and its test.
  - Change `src/session/result-page-types.ts` by the optional `PictureFloor.playableFloorLine` and the sentence of `SavedVisit.floorDb`, word for word; its type test. Change `src/session/result-picture.ts` and its test: the line for live and saved visits, a saved visit from before against its `floorDb`. Change `tests/properties/result-page-text.ts` to collect it, and extend CP10 by R22.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 22.1 to 22.4_
  - _Properties: CP10; result-page CP1 (its text helper)_
  - _Decisions: D27_
  - _Files: creates `src/copy/playable-floor-lines.ts`, `src/copy/playable-floor-lines.test.ts`, `src/session/playable-floor-ears.ts`, `src/session/playable-floor-ears.test.ts`; changes `src/session/result-page-types.ts`, `src/session/result-page-types.test.ts`, `src/session/result-picture.ts`, `src/session/result-picture.test.ts`, `tests/properties/result-page-text.ts`, `tests/properties/audible-start-cp10-saved-visits-and-anchors.property.test.ts`_
  - _Commit: `Say on the result when a floor reaches the quietest the house can play`_

- [ ] 19. Check the wording and whole visits
  - Create `tests/properties/audible-start-text.ts`, `audible-start-cp9-safe-wording.property.test.ts` (CP9, 500 runs), `audible-start-cp12-whole-visits.property.test.ts` (CP12, 30 runs), `audible-start-simulated-visits.test.ts` (a quick and a full visit with an Attentive listener, one with a one-sided silent listener that goes on, one with the music refused) and `audible-start-regressions.test.ts` (empty but for its header comment, unless a task before found a case).
  - Run `npm test` three times and record the times.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 18.5, 22.3, 24.1, 24.5_
  - _Properties: CP9, CP12_
  - _Decisions: D36_
  - _Files: creates `tests/properties/audible-start-text.ts`, `tests/properties/audible-start-cp9-safe-wording.property.test.ts`, `tests/properties/audible-start-cp12-whole-visits.property.test.ts`, `tests/properties/audible-start-simulated-visits.test.ts`, `tests/properties/audible-start-regressions.test.ts`; changes `.kiro/specs/audible-start/design.md` (times)_
  - _Commit: `Check the new wording and whole visits with practice and the music`_

**End of batch 5.**

- [ ] 20. Measure the visit lengths again
  - Create `tests/listeners/visit-length-measurement.ts` and `tests/listeners/print-visit-length-measurement.ts` as "Visit lengths" in `design.md` (D37). They choose nothing and write no file.
  - Run the print script and write its table under "Visit lengths" in `design.md`, with the date and the commit it ran on, in place of "Not yet measured.".
  - If the rounded plausible length at the middle setting with no allowance is 7 minutes for the quick visit and 12 for the full one, change no name. Otherwise change `src/copy/front-door-copy.ts` (the two buttons), step 1 of `.kiro/steering/product.md` and the comment of `VisitType` in `src/config/hearing-method-config.ts` to the new figures, and list in `design.md` under "What the owner builds" every place under `src/ui/` and `tests/e2e/` that names the old ones (search for "7 minutes", "12 minutes", `frontDoorCopy.choices`).
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 25.1, 25.2, 27.4_
  - _Decisions: D37_
  - _Files: creates `tests/listeners/visit-length-measurement.ts`, `tests/listeners/print-visit-length-measurement.ts`; changes `.kiro/specs/audible-start/design.md`, `tests/listeners/README.md`, and only if the names change `src/copy/front-door-copy.ts`, its test, `.kiro/steering/product.md`, `src/config/hearing-method-config.ts`_
  - _Commit: `Measure the visit lengths again with practice included`_

- [ ] 21. Write practice and the floor into the steering, and close
  - Change `.kiro/steering/hearing-method.md` by the Practice section, the two bullets of "When a search cannot finish honestly", the Bluetooth bullet of "Known limits" and the rows of the Initial values table, word for word from "Steering" in `design.md`. Change `.kiro/steering/product.md` by the experience rule of "Steering", word for word.
  - Change the READMEs of `src/session/`, `src/copy/`, `src/config/`, `src/engine/`, `src/audio/output/`, `tests/properties/` and `tests/listeners/` to describe what this spec added, following `wording.md`.
  - Run `npm test` three times with every property file present; compute the budget by the rule of "Run counts and time"; write it there with the three runs; report it.
  - Search `src/` (but `src/ui/`) for numbers that set a level, a wait, a count or a limit outside `src/config` (R2.8), for "hand", "wireless" and "Bluetooth" in `src/copy` (only the Floor_Line), and for `startingLevelDb` anywhere; run `git status` and check that only this spec's files changed.
  - Check: `npm run typecheck`, `npm test`, `npm run lint`, `npm run check:copy`.
  - _Requirements: 2.8, 24.4, 26.1 to 26.3, 28.1 to 28.3_
  - _Decisions: D36; the brief's practice and floor_
  - _Files: changes `.kiro/steering/hearing-method.md`, `.kiro/steering/product.md`, `src/session/README.md`, `src/copy/README.md`, `src/config/README.md`, `src/engine/README.md`, `src/audio/output/README.md`, `tests/properties/README.md`, `tests/listeners/README.md`, `.kiro/specs/audible-start/design.md` (budget)_
  - _Commit: `Write practice and the playable floor into the steering`_

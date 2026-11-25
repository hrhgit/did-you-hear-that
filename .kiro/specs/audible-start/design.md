# Design: audible start

## Overview

The owner's first visit, on Bluetooth earbuds, showed three faults: the calibration took dozens of presses, matching a hiss to rubbed hands could not be done with earbuds in, and the first room began with nothing to hear. This spec answers each of them, and treats Bluetooth headphones as the main case without asking the visitor what they wear.

The brief's decisions were made by the owner's coordinator on 2026-11-16, at the owner's request. The owner may reverse any of them. Every point the brief leaves open is a decision below (D1 to D38). Each one that had more than one option is also a question of the same number under "Questions for the project owner", with its options and its reason; the others (D2, D5, D17, D21 to D23, D25, D33) follow from the brief or the code.

```
   src/ui  (built by hand by the owner against visit-flow-types.ts and result-page-types.ts)
     │  setCalibrationTarget  startCalibration  keepCalibration     resume (try again)  goOnWithoutPractice
     │  snapshot.calibration: targetSettingDb, calibrationSound, heading, introLines
     │  snapshot.room.practice: phase, soundPlaying, lines      events: practiceSoundScored, countingStarted
     │  picture floor: playableFloorLine
     ▼
  ┌──────────────────────────── src/session ─────────────────────────────────────────────────┐
  │ create-visit-flow.ts        the target, the practice pause, the floor, the window          │
  │ calibration-controller.ts   setTarget; music or hiss repeats                               │
  │ room-runner.ts              practice, then the search it creates from the practice catches │
  │   ├── room-practice.ts            pure: the practice ladder of each ear                    │
  │   ├── search-starting-levels.ts   pure: catch − 10 dB, within floor and cap                │
  │   ├── room-search-floor.ts        pure: the playable floor on the level grid               │
  │   └── response-window-ms.ts       pure: 2000 ms + reported latency, at most 500 ms more    │
  │ room-practice-view.ts       pure: what the room's screen says about practice               │
  │ calibration-anchor.ts       pure: the anchor kind of a floor; same kind or not             │
  │ summarize-visit.ts, result-picture.ts, saved-visit-payload.ts, find-earlier-visit.ts        │
  │ create-swapped-repeat.ts    the same practice, on the swapped earpieces                    │
  └──────────┬───────────────────────────────────────────────┬─────────────────────────────┘
             │ play("trial") for practice and search;        │ every visitor-facing string
             │ calibration music: start, target, stop         ▼
   src/audio/output                                   src/copy  calibration, practice, floor line
     create-audio-output.ts   loads the music once, measures it, loops it, ramps its gain
     room-floor-level.ts      pure: the level that reaches the playable RMS
     measure-calibration-music.ts, calibration-music-top.ts, next-calibration-music-setting.ts
     web-audio-backend.ts, output-graph.ts, fake-audio-backend.ts
   src/engine                 each ear starts at its own level; an ear may start as worse than cap
```

The design rests on these choices.

- **Practice is a step of the room runner before the search** (D11). A pure ladder in `src/session/room-practice.ts` gives each ear's practice sounds: the anchor first, one upward step louder after each sound not caught, up to the room's top. The search is created only when practice ends, with each ear's start 10 dB below its practice catch. The engine changes in one place: each ear has its own starting level, and an ear with no start begins as worse than cap. So the engine's search, its properties and its result are unchanged in shape.
- **An ear that goes on is recorded as worse than cap by the engine itself**, with every count 0 (D16). The summary, the picture, the replay and the swapped repeat read that state as they read it today and need no new state.
- **Practice is logged apart from the trials** (D18). The log's `trials`, `ignoredAnswers` and `refusedPlays` hold exactly what they held before, so nothing that reads them counts practice. A new optional `practice` field holds the practice sounds.
- **The not-heard moment is a pause** (D14). The flow begins a pause with the new reason `practiceNotHeard`. The owner's current screen already shows any pause as a notice with the line for its reason and a control that calls `resume`, so the visitor is told and can try again before the owner draws the new screen.
- **The music is played by the output stage alone** (D5). The shell fetches and decodes it once, measures its RMS and peak, loops it in both channels at a gain that rises by at most 0.25 dB per 100 ms step, and refuses every other sound while it plays. The hiss repeats stay as they are and are the fallback.
- **The playable floor is computed like the room's top and travels the same way** (D23): the range report gives it, the logged calibration keeps it, the room run rounds it to the grid and gives it to the search as `floorDb`, the attempt and the summary keep it, and the picture draws each floor between its own top and its own floor.
- **Every field added to a type the owner builds as a literal is optional** (D29), so that `npm run typecheck` passes with the owner's files unchanged after every task.

## Sources

- `docs/briefs/08b-audible-start.md`.
- `.kiro/steering/`: `audio-safety.md` (rules 1 to 9; rule 4 "Within a room"; rule 6 and its table; "Making one looser ... needs the project owner's approval first"), `hearing-method.md` (the search; "Level scale"; the four end states; "Known limits"; the Initial values table), `product.md` (step 2; "What the result may claim"; the experience rule "Before the visitor answers, nothing on screen may reveal when a sound plays or which side it is on"), `wording.md` (banned words; levels relative to the calibration; tone), `structure.md` (module rules; `Db` and `Gain` endings; numbers in `src/config`; strings in `src/copy`), `tech.md` (a context created or resumed only in a gesture; the sample rate from the context; time and randomness injected; no network requests other than the site's own files).
- `docs/architecture.md` ("The level scale"; "Open questions that code cannot settle" 1 and 3).
- `.kiro/specs/audio-output/`: D7 and "What the visit flow does with it" (the room top and its rounding), D8 (the control: bottom −60, step 1, rise 5 per repeat, top −4), D10 (Keep_Minimum and the estimate of where settings fall), D13 and D14 (fades), D16 (one sound at a time), D20 (the headphone check at 0 dB), D21 (both ears only for the calibration noise), D32 (guards against loosening), "Measurements" ("The digital floor"), Q1.
- `.kiro/specs/threshold-search/`: CP1 to CP3 and D42 (the accuracy band), CP2's expected break and regression 4, D2 to D6, D14 (floor, start and cap on one grid).
- `.kiro/specs/visit-flow/`: R11.2, R11.3, D3, D4 (window starts), D9 (a paused trial comes again after its own gap), D19 (seeds), D25 (three refusals), D26 (the test hook), "How long the rooms take", Q3 (the visit names), CP1 to CP11.
- `.kiro/specs/missed-sound-replay/`: the replay's raise and cap (`missed-sound-replay-plan.ts`), its measured length, the owner's rule for time budgets.
- `.kiro/specs/swapped-repeat/`: R7 (the room run again exactly as before), R16.2, R17.4 (`beginRoom` after the swap check), D9, Q11.
- `.kiro/specs/result-page/`: D9 (a saved visit is the log unchanged), D15 and D16 (each floor on its own scale), D25 (the earlier visit), "Checking a payload".
- The code: `src/engine/` (`search-types.ts`, `ear-search.ts`, `threshold-search.ts`, `validate-search-settings.ts`, `finalize-ear-result.ts`, `no-sound-schedule.ts`, `fraction-comparisons.ts`); `src/session/` (`create-visit-flow.ts`, `visit-flow-types.ts`, `calibration-controller.ts`, `room-runner.ts`, `room-search-cap.ts`, `visit-log-recorder.ts`, `window-start.ts`, `summarize-visit.ts`, `saved-visit-payload.ts`, `result-page-types.ts`, `result-picture.ts`, `light-depth-fraction.ts`, `find-earlier-visit.ts`, `create-swapped-repeat.ts`, `create-missed-sound-replay.ts`, `missed-sound-replay-plan.ts`, `listening-page-session.ts`); `src/audio/output/` (all of it); `src/config/` (all of it); `src/copy/` (all of it); `tests/listeners/` and `tests/properties/`.
- Read only, the owner's: `src/ui/visit/screen-of-snapshot.ts` and its test (the pause notice; the calibration sheet hides `line` when it equals `calibrationCopy.openLine`), `src/ui/visit/build-visit-page.ts` (uses `calibrationCopy.openLine` and `visitCopy` headings directly), `src/ui/visit/calibration-action-for-key.ts` (untracked, in progress: arrows one step, Shift or Page Up and Page Down five, Home and End, Enter keeps), `src/ui/visit/reaction-of-event.ts` (null for an event kind it does not know), `src/ui/result/picture-sheet.test.ts`, `tests/properties/screen-leak/`, `tests/e2e/visit-steps.ts`, `tests/e2e/listening-page.spec.ts`.
- American Speech-Language-Hearing Association, Guidelines for Manual Pure-Tone Threshold Audiometry (2005), https://www.asha.org/policy/gl2005-00014/, fetched again on 2026-11-16. Quoted under "Practice".
- MDN, "AudioContext: outputLatency property", https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency, fetched on 2026-11-16: "provides an estimation of the output latency of the current audio context", "Baseline 2025 ... Since March 2025, this feature works across the latest devices and browser versions."
- Measurements made for this design, writing no file in the working tree: "Measurements".

## Files

Created:

```
src/config/
  calibration-music-config.ts           calibrationMusicConfig.filePath (R4.1)
  calibration-music-config.test.ts

src/audio/output/
  measure-calibration-music.ts          measureCalibrationMusic: RMS, peak and crest of decoded samples (R4.3)
  measure-calibration-music.test.ts
  calibration-music-top.ts              calibrationMusicTopDb: the Music_Top for a crest factor (R4.3, D7)
  calibration-music-top.test.ts
  next-calibration-music-setting.ts     nextCalibrationMusicSettingDb: one step of the music's level (R5.3, R5.4)
  next-calibration-music-setting.test.ts
  room-floor-level.ts                   roomFloorLevelDb: the Playable_Floor (R12.1)
  room-floor-level.test.ts

src/session/
  calibration-target-setting.ts         calibrationTargetSettingDb: a target on the grid, within the control (R3)
  calibration-target-setting.test.ts
  room-search-floor.ts                  roomSearchFloorDb (R12.4)
  room-search-floor.test.ts
  room-practice.ts                      createRoomPractice: the pure practice ladder (R14, R15)
  room-practice.test.ts
  search-starting-levels.ts             searchStartingLevelsDb (R14.9, R15.3)
  search-starting-levels.test.ts
  room-practice-view.ts                 roomPracticeView: what the room's screen says about practice (R17, R18)
  room-practice-view.test.ts
  response-window-ms.ts                 responseWindowMs: the window with the Latency_Allowance (R21.3)
  response-window-ms.test.ts
  calibration-anchor.ts                 anchorKindOf, sameAnchorKind (R11)
  calibration-anchor.test.ts
  playable-floor-ears.ts                playableFloorEars: the ears that get the Floor_Line (R22.1)
  playable-floor-ears.test.ts
  audible-start-types-match.test.ts     type-level checks: copy names against session names (R1.6)

src/copy/
  practice-copy.ts                      practiceCopy and the lines of every room (R15, R18)
  practice-lines.ts                     notHeardLine, practiceCaughtLine (R15.1, R17.6)
  practice-copy.test.ts
  playable-floor-lines.ts               playableFloorLine (R22.3)
  playable-floor-lines.test.ts

tools/
  measure-calibration-music.ts          decodes the music with ffmpeg in memory and prints its numbers (D8)

tests/listeners/
  practise-for-search.ts                practiseForSearch: practice with a listener, then the search's starts (R27.3)
  practise-for-search.test.ts
  visit-length-measurement.ts           the measurement of "Visit lengths", as a function (R25)
  print-visit-length-measurement.ts     prints it; writes no file

tests/properties/
  calibration-music-fixture.ts          deterministic music-like samples with a chosen crest factor, made in code
  audible-start-arbitraries.ts
  audible-start-text.ts                 every string of the new views, events and lines, for CP9
  audible-start-cp1-no-jump.property.test.ts
  audible-start-cp2-search-starts-from-heard.property.test.ts
  audible-start-cp3-nothing-below-floor.property.test.ts
  audible-start-cp4-practice-does-not-count.property.test.ts
  audible-start-cp5-silent-listener-told.property.test.ts
  audible-start-cp6-music-is-safe.property.test.ts
  audible-start-cp7-calibration-target.property.test.ts
  audible-start-cp8-practice-screen.property.test.ts
  audible-start-cp9-safe-wording.property.test.ts
  audible-start-cp10-saved-visits-and-anchors.property.test.ts
  audible-start-cp11-latency-window.property.test.ts
  audible-start-cp12-whole-visits.property.test.ts
  audible-start-simulated-visits.test.ts
  audible-start-regressions.test.ts
```

Changed (each by the task that names it in `tasks.md`):

- `src/config/hearing-method-config.ts` and its test: `startingLevelDb` removed; `practiceStartLevelDb` and `responseWindowLatencyMaxMs` added; `capRelativeToAnchorDb` 15 → 5 with its guard; the comment of `VisitType` if the names change (R25).
- `src/config/audio-output-config.ts` and its test: `calibrationSettingKeepMinDb` −40 → −27 with its guard; `playableRmsMinFraction`, `playableRangeBelowAnchorMinDb`, `calibrationSettingSpanMinDb`, `calibrationMusicRisePeriodMs`, `calibrationMusicGainStepMs`, `calibrationMusicLoadMaxMs` added; the comments of D8 and D20 that name the hiss and the hands.
- `src/config/audio-safety-config.ts`: one sentence in the comment of `ghostSoundMaxDurationMs` on the exception. No value.
- `src/engine/search-types.ts`, `ear-search.ts`, `validate-search-settings.ts`, `room-limits.ts` (comment only), and their tests: per-ear starting levels (D15).
- `src/audio/output/audio-backend.ts`, `web-audio-backend.ts`, `output-graph.ts`, `fake-audio-backend.ts`, `create-audio-output.ts`, `range-report.ts`, `README.md`, and their tests: the music, the floor in the range report, the output latency.
- `src/session/visit-flow-types.ts`, `result-page-types.ts` and their type tests: "Interface contract".
- `src/session/calibration-controller.ts`, `create-visit-flow.ts`, `room-runner.ts`, `room-search-cap.ts` (grid origin), `visit-log-recorder.ts`, `summarize-visit.ts`, `result-picture.ts`, `light-depth-fraction.ts` (comment), `saved-visit-payload.ts`, `find-earlier-visit.ts`, `create-swapped-repeat.ts`, `swapped-repeat-run.ts`, `swapped-repeat-run-holds.ts`, `swapped-repeat-view.ts`, `swapped-repeat-comparison.ts` (its floor argument), `listening-page-session.ts`, `README.md`, and their tests.
- `src/copy/calibration-copy.ts`, `visit-copy.ts`, `leaving-copy.ts`, `output-state-copy.ts`, `swapped-repeat-copy.ts` (one key of `pauseLines`), `front-door-copy.ts` (only if R25.2 applies), `README.md`, and their tests.
- `tools/README.md`: one line on `measure-calibration-music.ts`.
- `tests/listeners/`: `simulated-visitor.ts`, `classify-accuracy.ts`, `spec-search-under-test.ts`, `searches-under-test.ts`, `visit-rule-measurement.ts`, `attribution-measurement.ts`, `README.md`, and their tests.
- `tests/properties/`: `visit-flow-harness.ts`, `visit-flow-timeline.ts`, `visit-flow-arbitraries.ts`, `output-arbitraries.ts`, `output-shell-harness.ts`, `missed-sound-replay-arbitraries.ts`, `swapped-repeat-arbitraries.ts`, `swapped-repeat-harness.ts`, `result-page-arbitraries.ts`, `result-page-text.ts`, `checks/` (`valid-settings-arbitrary.ts`, `ear-oracle.ts`, `cp1-step-listeners-exact-check.ts`, `cp5-levels-in-range-check.ts`, `cp13-settings-validation-check.ts`, `measure-listener-set.ts`), the property files listed under "Existing properties", `threshold-search-regressions.test.ts`, `threshold-search-cp2-accurate-or-flagged.property.test.ts` (D35), `README.md`.
- `.kiro/steering/hearing-method.md`, `.kiro/steering/product.md`, `.kiro/steering/audio-safety.md`: "Steering".
- `docs/architecture.md`: the paragraph "The level scale" and open question 3 ("Every place that names the hiss").

Not changed: everything under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `public/`; every CSS and HTML file; `src/main.ts`; the root `README.md`; `docs/licences.md`; `src/audio/synth/`; `src/storage/`; `package.json` and `package-lock.json`; every hook and lint rule.

## Interface contract

The contracts are `src/session/visit-flow-types.ts` and `src/session/result-page-types.ts`. This spec only adds to them (R1). It does not land them in one task: each task adds the part it builds (D30), with the names below, which are final now so that the owner can build against them.

### How the interface uses it

```ts
flow.subscribe((snapshot) => {
  if (snapshot.stage === "calibration") {
    show(snapshot.heading, snapshot.introLines, snapshot.line);                  // all from src/copy
    slider({ bottom: snapshot.controlBottomDb, top: snapshot.controlTopDb,
             thumb: snapshot.targetSettingDb, played: snapshot.playedSettingDb,
             onDrag: (settingDb) => flow.setCalibrationTarget(settingDb) });    // drag and keys
    if (snapshot.calibrationSound === "loading") show(snapshot.line);           // "The music is on its way."
    button(calibrationCopy.startButton, () => flow.startCalibration());         // a press: may start sound
    button(calibrationCopy.keepButton, () => flow.keepCalibration());
  }
  if (snapshot.stage === "room") {
    const practice = snapshot.practice;                                         // RoomPractice
    if (practice.phase === "practice") { show(practice.heading, practice.lines);
      if (practice.soundPlaying) show(practice.soundPlayingLine); }             // never a side
    if (practice.phase === "notHeard") { show(practice.heading, practice.notHeardLines);
      button(practice.tryAgainLabel, () => flow.resume());                       // a press: starts sound
      button(practice.goOnLabel, () => flow.goOnWithoutPractice()); }
    if (practice.phase === "counting") show(practice.lines);                     // the same for the whole search
  }
});
flow.onEvent((event) => {
  if (event.kind === "practiceSoundScored" && event.reaction === "ripple") ripple(event.trial.ear, event.line);
  if (event.kind === "countingStarted") { /* the counted part of the room begins */ }
});
// result page: floor.playableFloorLine beside the floor when it is not null
```

### What is added to each existing type

| Type | What is added | Owner_Literal or code outside `src/session` that builds it |
|---|---|---|
| `VisitFlow` | `setCalibrationTarget(settingDb)`, `goOnWithoutPractice()`; a sentence in the comments of `startCalibration`, `louder` and `resume` | `tests/properties/visit-flow-harness.ts`, `visit-flow-timeline.ts` wrap the flow (this spec's tasks). `src/ui` only calls it |
| `PauseReason` | the member `practiceNotHeard` | Nothing builds one outside the flow. The owner's screen reads `leavingCopy.pauseLines[reason]`, which gains the key, and `it.each<PauseReason>` in `screen-of-snapshot.test.ts` lists four members, which still type-checks |
| `VisitPause`, `SnapshotBase` | a sentence in the comments of `reason` and of `pause` | none |
| `CalibrationSnapshot` | optional `targetSettingDb`, `calibrationSound`, `heading`, `introLines` | `src/ui/visit/screen-of-snapshot.test.ts` builds one (`const calibration: CalibrationSnapshot`). Optional, so it compiles |
| `RoomSnapshot` | optional `practice` | `tests/properties/screen-leak/screen-record.test.ts` builds `{ ...base("room"), room }`. Optional, so it compiles |
| `VisitEvent` | the members `PracticeSoundScoredEvent`, `CountingStartedEvent` | Nothing builds one outside the flow. `reaction-of-event.ts` gives null for a kind it does not know |
| `VisitLog` | optional `practice` | Built only by the recorder and by this repository's test builders |
| `LoggedCalibration` | optional `anchor`, `roomFloorLevelDb`, `outputLatencyMs` | as `VisitLog` |
| `LoggedRoomAttempt` | optional `searchFloorDb`, `searchStartLevelDb`, `countingStartedAtMs`, `responseWindowMs` | as `VisitLog` |
| `RoomSummary` | optional `searchFloorDb` | `screen-of-snapshot.test.ts` and `screen-record.test.ts` build one. Optional, so they compile |
| `SwappedRepeatPauseReason` | the member `practiceNotHeard` | `swappedRepeatCopy.pauseLines` gains the key (this spec) |
| `SwappedRepeatRoom` | optional `practice` | built only by `swappedRepeatView` |
| `SwappedRepeatRun` | optional `practice` | built by `swappedRepeatRunOf` and test builders |
| `PictureFloor` (result page) | optional `playableFloorLine` | `src/ui/result/picture-sheet.test.ts` builds one in `floor()`. Optional, so it compiles |
| Every other type of the two files | nothing | |

The new types are `CalibrationSound`, `CalibrationAnchor`, `RoomPracticePhase`, `RoomPractice`, `LoggedPractice`, `PracticeTrial`, `ScoredPracticeTrial`, `DiscardedPracticeTrial`, `LoggedPracticeRefusedPlay`, `PracticeSoundScoredEvent` and `CountingStartedEvent`.

### The additions to `visit-flow-types.ts`

In `VisitFlow`, after `quieter`:

```ts
  /**
   * Calibration: puts the target of the control at `settingDb`, for a control that can be dragged
   * or moved by keys. The target is rounded down to the control's grid and held from the bottom of
   * the control to its top; NaN changes nothing. The sound still starts at the bottom of the control
   * and still rises by at most 5 dB per repeat of the hiss, or 5 dB in 2 seconds for the music: the
   * played setting follows the target. Ignored outside calibration and while a pause holds.
   */
  setCalibrationTarget(settingDb: number): void;
```

After `resume`:

```ts
  /**
   * While the pause `practiceNotHeard` holds, in a room or in the room of a swapped repeat: goes on
   * without the practice. Each side that did not catch the practice sound is marked "worse than
   * cap" on this floor, and the counting begins for the other side if it caught it. Ignored
   * otherwise.
   */
  goOnWithoutPractice(): void;
```

The comment of `startCalibration` becomes: "Calibration: starts the calibration sound at the bottom of the control: the music, looping, or the hiss repeats where the music cannot be loaded. While the music is still loading, it starts once it is ready. Also starts it again after a stop." The comment of `louder` becomes: "Calibration: moves the control one step louder. The hiss rises by at most 5 dB per repeat, the music by at most 5 dB in 2 seconds." The comment of `resume` gains: "In the pause `practiceNotHeard`, plays the practice again for each side that did not catch it. Call it from the visitor's press, because it starts sound."

`PauseReason` becomes `"visitor" | "hidden" | "interrupted" | "deviceChanged" | "practiceNotHeard"`. The comment of `VisitPause.reason` gains: "`practiceNotHeard`: a practice sound was not caught on a side at the loudest this room may play; nothing plays until the visitor tries again or goes on." The comment of `SnapshotBase.pause` becomes: "The pause that holds, or null. While it holds, only `resume` and `stop` do anything, and in the pause `practiceNotHeard` also `goOnWithoutPractice`."

In `CalibrationSnapshot` (its first comment becomes "Setting the calibration sound to a comfortable listening volume."; the comment of `playing` becomes "Whether the calibration sound is playing now: the music, or hiss repeats one after another."):

```ts
  /**
   * Where the control is moving to: the thumb of a slider. On the control's grid, from the bottom to
   * the top. The bottom until the sound has started. Always present in the snapshots the flow gives;
   * optional only so that literals written before it still compile.
   */
  readonly targetSettingDb?: number;
  /** `loading`: the music is not ready yet. `music` or `hiss`: the sound of this calibration. Always present, as above. */
  readonly calibrationSound?: CalibrationSound;
  /** The heading of this screen, from `calibrationCopy`. Always present, as above. */
  readonly heading?: string;
  /** What to read before using the control, in order: what to do, why, how the sound follows the control, the keys. Always present, as above. */
  readonly introLines?: readonly string[];
```

In `RoomSnapshot`:

```ts
  /** What the room says about its practice and its counting. Always present, as above. */
  readonly practice?: RoomPractice;
```

In `LoggedCalibration`, `LoggedRoomAttempt` and `RoomSummary`:

```ts
  // LoggedCalibration
  /** How the anchor was set. Absent in a calibration recorded before the audible-start spec, which was matched to the visitor's hands. */
  readonly anchor?: CalibrationAnchor;
  /** The quietest level each room's sound could be played at with this calibration (the Playable_Floor). Absent before the audible-start spec. */
  readonly roomFloorLevelDb?: Readonly<Record<GhostSoundId, number>>;
  /** The output latency the browser reported when it was kept, or null when it reported none. Absent before the audible-start spec. */
  readonly outputLatencyMs?: number | null;

  // LoggedRoomAttempt
  /** The quietest level this run's search could ask for: the room's playable floor on the level grid. Absent before the audible-start spec, when it was `hearingMethodConfig.floorDb` then. */
  readonly searchFloorDb?: number;
  /** Each ear's first search level, null for an ear that went on without catching the practice sound; null while the counting never began. Absent before the audible-start spec, when both were the fixed starting level then. */
  readonly searchStartLevelDb?: Readonly<Record<Ear, number | null>> | null;
  /** When the counting began, or null if it never did. Absent before the audible-start spec. */
  readonly countingStartedAtMs?: number | null;
  /** The length of every response window of this run, practice included. Absent before the audible-start spec, when it was `responseWindowMs` then. */
  readonly responseWindowMs?: number;

  // RoomSummary
  /** The quietest level the search could ask for here. Always present for a visit recorded with the audible-start spec; absent before it. Never compared across floors. */
  readonly searchFloorDb?: number;
```

In `VisitLog`:

```ts
  /** Every practice sound, practice answer that scored nothing, and refused practice sound. Absent in a visit recorded before the audible-start spec. */
  readonly practice?: LoggedPractice;
```

In `SwappedRepeatRoom` and `SwappedRepeatRun`:

```ts
  // SwappedRepeatRoom
  /** As `RoomSnapshot.practice`, for the repeated room. Always present in the views the flow gives. */
  readonly practice?: RoomPractice;
  // SwappedRepeatRun
  /** The practice of this run, each sound with its ear and earpiece. Absent in a record made before the audible-start spec. */
  readonly practice?: LoggedPractice;
```

`SwappedRepeatPauseReason` becomes `Extract<PauseReason, "visitor" | "hidden" | "interrupted" | "practiceNotHeard">`.

`VisitEvent` gains `| PracticeSoundScoredEvent | CountingStartedEvent`. New block at the end of the file:

```ts
// ─── Calibration, practice and the playable floor ───────────────────────────────────────
// audible-start design.md.

/** What a calibration plays. `loading`: the music is not ready yet; `hiss`: the music could not be loaded. */
export type CalibrationSound = "loading" | "music" | "hiss";

/** How a calibration's anchor was set. `hands`: matched to rubbed hands, before the audible-start spec. */
export type CalibrationAnchor = "hands" | "music" | "hiss";

/**
 * `practice`: the room's sound plays to one ear at a time until each ear has caught it once;
 * nothing counts. `notHeard`: a side did not catch it at the loudest this room may play; the
 * pause `practiceNotHeard` holds. `counting`: the search; the screen holds nothing about a trial.
 */
export type RoomPracticePhase = "practice" | "notHeard" | "counting";

/** What the room's screen says about its practice. Every string comes from `src/copy`. */
export interface RoomPractice {
  readonly phase: RoomPracticePhase;
  /** True from a practice sound's presentation until it is answered or its window closes. Never says which side. False outside `practice`. */
  readonly soundPlaying: boolean;
  /** "Practice" in `practice` and `notHeard`; null in `counting`. */
  readonly heading: string | null;
  /** In `practice` and `notHeard`: the room's sound, that nothing counts yet, when the counting begins. In `counting`: the line that starts it. Constant within a phase. */
  readonly lines: readonly string[];
  /** While `soundPlaying`: "Listen. It is making its sound now."; otherwise null. */
  readonly soundPlayingLine: string | null;
  /** In `notHeard`: the sides that did not catch it; otherwise empty. */
  readonly notHeardEars: readonly Ear[];
  /** In `notHeard`: which side, what to check, and what each choice does; otherwise empty. */
  readonly notHeardLines: readonly string[];
  /** The label of the control that calls `resume` in `notHeard`. */
  readonly tryAgainLabel: string;
  /** The label of the control that calls `goOnWithoutPractice` in `notHeard`. */
  readonly goOnLabel: string;
}

/** The fields of every practice sound in the log. Times on the visit log's clock. */
export interface PracticeTrialCommon {
  /** Its position among the practice sounds of the visit (or of the repeat run), from 1. */
  readonly order: number;
  readonly roomIndex: number;
  readonly attempt: number;
  /** 1, then 2 and up after each try again. */
  readonly round: number;
  /** Its number within the round, from 1. A sound played again after a pause keeps its number. */
  readonly practiceNumber: number;
  /** The ear it was for. */
  readonly ear: Ear;
  /** The earpiece it played in: the same as `ear` in the rooms of the visit. */
  readonly earpiece: Ear;
  readonly requestedLevelDb: number;
  readonly playedLevelDb: number;
  readonly clampLimit: ClampLimit | null;
  readonly gapBeforeMs: number;
  readonly presentedAtMs: number;
  readonly windowStartMs: number;
}

export type ScoredPracticeTrial = PracticeTrialCommon & {
  readonly status: "scored";
  readonly response: VisitorResponse;
  /** `caught`, `wrongSide` or `missed`, as for a sound trial. Only `caught` ends the ear's practice. */
  readonly outcome: SoundOutcome;
  readonly answeredAtMs: number | null;
  readonly responseTimeMs: number | null;
  readonly scoredAtMs: number;
};

export type DiscardedPracticeTrial = PracticeTrialCommon & {
  readonly status: "discarded";
  readonly discardedAtMs: number;
};

export type PracticeTrial = ScoredPracticeTrial | DiscardedPracticeTrial;

/** A practice sound the output stage would not play. */
export interface LoggedPracticeRefusedPlay {
  readonly atMs: number;
  readonly roomIndex: number;
  readonly attempt: number;
  readonly round: number;
  readonly practiceNumber: number;
  readonly reason: PlayRefusal;
}

/** Everything of practice, kept apart from the trials that make the result. */
export interface LoggedPractice {
  readonly trials: readonly PracticeTrial[];
  readonly ignoredAnswers: readonly LoggedIgnoredAnswer[];
  readonly refusedPlays: readonly LoggedPracticeRefusedPlay[];
}

/** Released in the same moment a practice sound is scored. */
export interface PracticeSoundScoredEvent {
  readonly kind: "practiceSoundScored";
  readonly room: VisitRoom;
  /** null in a room of the visit; the run number in a swapped repeat. */
  readonly swappedRepeatRunNumber: number | null;
  readonly trial: ScoredPracticeTrial;
  /** `ripple` for a caught practice sound, drawn on `trial.ear`; `none` otherwise. */
  readonly reaction: Extract<TrialReaction, "ripple" | "none">;
  /** For `ripple`, the ripple's label; otherwise null. */
  readonly line: string | null;
}

/** Released when the practice of a room run ends and its counting begins. Says nothing about any trial. */
export interface CountingStartedEvent {
  readonly kind: "countingStarted";
  readonly room: VisitRoom;
  readonly swappedRepeatRunNumber: number | null;
}
```

### The additions to `result-page-types.ts`

In `PictureFloor`:

```ts
  /**
   * When an ear of this floor caught the quietest sound the house would play here, or came within
   * one step of it: the line that says this is as quiet as the house can play through these
   * headphones at this volume. Otherwise null. Show it beside the floor. Always present in the
   * pictures `resultPicture` gives; optional only so that literals written before it still compile.
   */
  readonly playableFloorLine?: string | null;
```

The comment of `SavedVisit.floorDb` gains: "A floor of a visit recorded with the audible-start spec uses its own `searchFloorDb` instead."

### What each new command accepts

| Command | Accepted | Ignored |
|---|---|---|
| `setCalibrationTarget(settingDb)` | `calibration` Stage, no Pause, `settingDb` a number that is not NaN | every other Stage; a Pause; NaN or a value that is not a number |
| `goOnWithoutPractice()` | the Pause `practiceNotHeard` in `room`, or in the `room` phase of `swappedRepeat` | everything else |
| `resume()` in the Pause `practiceNotHeard` | as every `resume`: calls `activate` in the call | as today |

## Config

| Value | File | Value | Source | Guard |
|---|---|---|---|---|
| `practiceStartLevelDb` | `hearing-method-config.ts` | 0 | Brief: "Practice begins at the anchor for each ear" | none: never above the room's top (R14.2) |
| `responseWindowLatencyMaxMs` | `hearing-method-config.ts` | 500 | D31 | none: it only lengthens a window |
| `capRelativeToAnchorDb` | `hearing-method-config.ts` | 15 → 5 | Brief, "The cap comes down" | test refuses above 5 (R2.3) |
| `startingLevelDb` | `hearing-method-config.ts` | removed | Brief: "The fixed starting level ... is no longer used" | |
| `calibrationSettingKeepMinDb` | `audio-output-config.ts` | −40 → −27 | "The Keep_Minimum" | guard refuses below −27 |
| `playableRmsMinFraction` | `audio-output-config.ts` | `10 ** (-84 / 20)`, about 6.31 × 10⁻⁵ | Brief: "starting value 84 dB below full scale" | none: raising it is a method change (audio-output Q1) |
| `playableRangeBelowAnchorMinDb` | `audio-output-config.ts` | 30 | Brief: "at least 30 dB of playable range below the anchor" | test: Keep_Minimum meets it (R2.5) |
| `calibrationSettingSpanMinDb` | `audio-output-config.ts` | 10 | D9: the fewest dB of settings that can be kept | test: Control_Top − Keep_Minimum ≥ it |
| `calibrationMusicRisePeriodMs` | `audio-output-config.ts` | 2000 | Brief: "5 dB per 2 seconds", the exception approved by the owner on 2026-11-16 | guard refuses below 2000 |
| `calibrationMusicGainStepMs` | `audio-output-config.ts` | 100 | D6 | test: divides the rise period |
| `calibrationMusicLoadMaxMs` | `audio-output-config.ts` | 10000 | D4 | none |
| `filePath` | `calibration-music-config.ts` | `"audio/calibration-waltz.m4a"` | Brief | test: a relative path ending `.m4a` |

The cap's comment in the config: "Loudest allowed level | 5 dB above the anchor. Lowered from 15 dB on 2026-11-16 (brief 08b, a decision of the owner's coordinator at the owner's request): the music anchor is likely louder than rubbed hands, so the lower cap keeps the loudest sound no louder at the ear than before. Making it stricter is allowed; raising it needs the project owner's approval first." The config test's guard message: "capRelativeToAnchorDb is above 5 dB. It was made stricter on 2026-11-16; a higher cap needs the project owner's approval first."

`calibrationMusicConfig.filePath` lives in a file of its own because the config tests require every field of `audioOutputConfig` to end in a unit (`/(Db|Ms|Hz|Fraction|Count)$/`) and a path has none. Its test checks that it is the only field, that it is a relative path with no `..`, and that it ends `.m4a`. No new config value is a steering value of `audio-safety.md`.

What happens to `startingLevelDb` and to everything that uses it:

| File | Today | With this spec |
|---|---|---|
| `src/config/hearing-method-config.ts` and test | the field −25; tests check floor < start < cap | removed; `practiceStartLevelDb` 0; tests check floor < `practiceStartLevelDb` ≤ cap |
| `src/engine/search-types.ts` | `ThresholdSearchSettings` picks `startingLevelDb` | picks the config fields without it, and adds `startingLevelsDb: Readonly<Record<Ear, number \| null>>` (D15) |
| `src/engine/ear-search.ts` | both ears start at `startingLevelDb` | each ear at `startingLevelsDb[ear]`; null starts ended as worse than cap |
| `src/engine/validate-search-settings.ts` and test | floor, start, cap on one grid | floor, each non-null start, and cap on one grid; each start from floor to cap |
| `src/engine/threshold-search.test.ts`, `room-limits.ts` | settings with one start | settings with `startingLevelsDb` |
| `src/session/room-search-cap.ts` and test | grid origin `startingLevelDb` | grid origin `practiceStartLevelDb`. 0 and −25 lie on the same 5 dB grid, so every cap is unchanged |
| `src/session/listening-page-session.ts` and test | each row starts at the lower of −25 and its top | at the lower of `practiceStartLevelDb` and its top, the level of a room's first sound now (D34) |
| `src/config/audio-output-config.test.ts` | `roomTopMinDb ≥ startingLevelDb` | `roomTopMinDb ≥ practiceStartLevelDb` |
| `src/audio/output/create-audio-output.test.ts` | reads it for a level | `practiceStartLevelDb` |
| `tests/listeners/classify-accuracy.ts` and test | grid origin | `practiceStartLevelDb`; the same grid |
| `tests/properties/checks/valid-settings-arbitrary.ts` | one start | per-ear starts on the drawn grid, null one time in ten for each ear |
| `checks/ear-oracle.ts` | the first level is the start | each ear's first level is its own start; a null start is ended at once |
| `checks/cp1-step-listeners-exact-check.ts`, `cp5-levels-in-range-check.ts` | grid origin | `practiceStartLevelDb` |
| `checks/cp13-settings-validation-check.ts` | mutations of the start | mutations of each ear's start |
| `tests/properties/output-arbitraries.ts`, `missed-sound-replay-arbitraries.ts`, `audio-output-cp11-range-report.property.test.ts` | grid origin | `practiceStartLevelDb` |
| `tests/properties/visit-flow-cp9-summary-and-visit-rule.property.test.ts` | reads it for a level | `practiceStartLevelDb` |
| the engine's shipped-settings checks (CP1, CP2, CP3, CP8, CP10 to CP12) and `spec-search-under-test.ts` | `hearingMethodConfig` | `hearingMethodConfig` with each room's `startingLevelsDb` from `practiseForSearch` with the room's own listener (D35) |
| `tests/properties/threshold-search-regressions.test.ts` | `hearingMethodConfig` | the settings each case was found with, written out: start −25 for both ears, cap 15, floor −70 (D35) |

## The calibration target

`calibrationTargetSettingDb(settingDb, control)` in `src/session/calibration-target-setting.ts` is pure. `control` is `{ bottomDb, topDb, stepDb }`.

| `settingDb` | Target |
|---|---|
| not a number, or NaN | unchanged (the function returns null and the caller keeps the target) |
| between grid settings | rounded down to the grid `bottomDb + k × stepDb`, with the tolerance of `next-calibration-setting.ts` (10⁻⁹ of a step), so a sound is never set louder than asked |
| below the bottom, or −Infinity | the bottom |
| above the top, or +Infinity | the top |
| on the grid, in range | itself |

The controller's `setTarget(settingDb)` sets its target to that value and notifies; `louder()` and `quieter()` call the same function with the setting they compute, so their behaviour is unchanged. The top is the Control_Top of the sound in use (D7). Before the sound starts the target may change, but `open()` puts it at the bottom, as it does today (D3); the flow's snapshot gives the bottom while the calibration is fresh. The flow accepts `setCalibrationTarget` only in the `calibration` Stage with no Pause.

Nothing about how the output stage plays the Calibration_Repeats changes (R3.8): `nextCalibrationSettingDb` still plays the bottom first and limits each later repeat to 5 dB above the one before, so a target dragged to the top rises over at least 12 repeats from −60 to −4. The task of the target changes only the session and adds no output code.

## The calibration music

### Loading

- **When.** The shell begins loading in the first `activate` that creates the audio context, right after `backend.createOrResume()`, inside the press (D4). In the visit that press is the front door's choice of a visit (`chooseVisit` calls `activate`); on the listening page it is Start. The fetch needs no gesture; the decoding needs the context, which exists from then on.
- **How.** `backend.loadCalibrationMusic(filePath)` resolves the path against `document.baseURI`, fetches it with `fetch` (the site's own file, `tech.md`), decodes it with `context.decodeAudioData`, and resolves with a copy of the first channel and the context's rate. The decoded buffer is at the context's rate, so the samples the shell measures are the samples it plays (`tech.md`: the sample rate comes from the context).
- **Measuring.** `measureCalibrationMusic(samples)` gives `{ rmsFraction, peakFraction, crestDb }`, or null for an empty, silent or not finite buffer. `calibrationMusicTopDb(crestDb)` gives the Music_Top (below).
- **Once.** The shell loads at most once in its life. A device change, a stop or a closed context keeps the samples. A failure or a time-out makes the Calibration_Sound `hiss` for the life of the shell, so the visits of one page all use one Anchor_Kind (D10).
- **Fallback.** `hiss` when: the fetch rejects or answers with a status that is not OK; the decoding rejects; `measureCalibrationMusic` gives null; the Music_Top is below Keep_Minimum + `calibrationSettingSpanMinDb` (−17 dB), which would leave fewer than 10 dB of settings to keep (D9); or nothing has arrived `calibrationMusicLoadMaxMs` (10 s) after the load began. A result that arrives after the time-out is dropped.
- **What the visitor sees while it loads.** The calibration screen with `calibrationSound` `loading` and `line` "The music is on its way." The start control works: a press while loading is remembered by the controller, and the sound starts when loading ends, from the bottom of the control (music) or with the first hiss repeat (fallback), provided the screen is still shown, no Pause holds and the shell runs (R4.6). Until then nothing plays.

### Playing

The shell's music calls (not contract; `src/audio/output/create-audio-output.ts`):

```ts
calibrationSound(): CalibrationSound;
onCalibrationSoundChange(listener: (sound: CalibrationSound) => void): () => void;
calibrationControlTopDb(): number;          // the Control_Top of the sound in use; the hiss's while loading
startCalibrationMusic(): CalibrationMusicOutcome;   // refused: notRunning, notCalibrating, notReady, busy, unsupported
setCalibrationMusicTarget(settingDb: number): void;
calibrationMusicSettingDb(): number | null;  // the Played_Setting reached, or null when the music is not playing
onCalibrationMusicStep(listener: (settingDb: number) => void): () => void;
stopCalibrationMusic(): void;
```

- **Start.** Accepted only while calibrating, running and `music`. The Played_Setting is `calibrationSettingMinDb` (−60). The backend starts a looping source of two equal channels at Music_Level_Gain(−60) behind a fade gain that rises from exact zero over `outputFadeMs` (25 ms) with the raised-cosine curve of `apply-output-fade.ts`. The source goes to the stop gain of the output graph, so `fadeToSilence` stops it with every other sound.
- **Steps.** While it plays, the shell runs one step every `calibrationMusicGainStepMs` (100 ms) by its injected timer. A step first reads the audio clock; if the previous ramp has not ended there, it waits for the remainder and does nothing else, so ramps never overlap. Then `nextCalibrationMusicSettingDb(playedDb, targetDb, topDb)` gives the next setting: rising, the lower of the target and `playedDb + calibrationRiseMaxDb × calibrationMusicGainStepMs / calibrationMusicRisePeriodMs` (0.25 dB); falling, the target; never above the top. The backend ramps the level gain exponentially from the old value to the new one over the step, so the level in decibels moves in a straight line at most 2.5 dB/s. A timer that fires late only holds the level longer. A target change takes effect at the next step.

> **Changed by the owner on 2026-11-16, after playing.** The music lagged the control and started too quiet. `calibrationMusicRisePeriodMs` is 100 and `calibrationRiseMaxDb` 40, so one step of 100 ms reaches any setting on the control, and the bottom is −40 dB. The times and the 0.25 dB step below are the ones this design was written with. See `tasks.md`, "The calibration control of 2026-11-16".
- **The ceiling.** The level gain is `min(Music_Level_Gain(setting), ceilingFraction / musicPeakFraction)`. At every setting up to the Music_Top the first is the smaller, so the second never acts; if it ever did, the shell logs a clamp entry with the Purpose `calibration` and the limit `ceiling` (rule 2). Exponential ramps between values within the limit stay within it, and the fade gains never exceed 1.
- **Stop.** `stopCalibrationMusic()` fades the fade gain to exact zero over `stopFadeMs` (20 ms) and stops the source at the end. `stopAll`, a hidden page, a left page, an interruption and a device change stop it through `fadeToSilence`, as every sound. The controller calls `stopCalibrationMusic` on keep and on `close`, which the flow calls when it leaves the `calibration` Stage.
- **Busy.** While the music plays, and until its stop fade ends, `play`, `playHeadphoneCheck` and `playCalibrationRepeat` refuse `busy`.
- **Keep.** With the music, `keepCalibration` keeps `calibrationMusicSettingDb()` rounded down to the grid, refuses `noRepeatPlayed` if the music never played in this calibration, and refuses `systemVolumeHigh` below the Keep_Minimum, as today.
- **Nothing else loops.** The loop calls take no Sound_Id: they play only the decoded music. `preparePlayback` still refuses every buffer longer than `ghostSoundMaxDurationMs` (rule 6 and its exception).

### The top of the control

```
musicPeakAtSettingDbFs(S) = 20·log10(referenceRmsFraction) + S + crestDb = −26.02 + S + crestDb
Music_Top = the highest grid setting S with −26.02 + S + crestDb ≤ 20·log10(ceilingFraction) = −12.04
          = floor-to-grid(13.98 − crestDb)
Control_Top(music) = min(calibrationSettingTopDb(), Music_Top)
```

With the measured crest factor of 18.40 dB (44.1 kHz) or 18.44 dB (48 kHz), 13.98 − crest is −4.42 or −4.46, so the Music_Top is −5 dB. The hiss's top is −4 dB (audio-output D8), so the Control_Top is −5 dB with the music and stays −4 dB with the hiss. While loading, the snapshot gives −4; it moves to −5 when the music is ready.

### Measurements of the file

Decoded with `ffmpeg -i public/audio/calibration-waltz.m4a -f f32le -ac 1 -ar <rate> -` into memory and measured on 2026-11-16, writing no file (`tools/measure-calibration-music.ts` repeats it, D8):

| Rate | Samples | Length | RMS | Peak | Crest | Music_Top |
|---|---|---|---|---|---|---|
| 44100 Hz | 4 704 015 | 106.67 s | 0.11088, −19.10 dBFS | 0.92182, −0.71 dBFS | 18.40 dB | −5 dB |
| 48000 Hz | 5 120 017 | 106.67 s | 0.11088, −19.10 dBFS | 0.92702, −0.66 dBFS | 18.44 dB | −5 dB |

- Music_Level_Gain at −5 dB is 10^(−5/20) × 0.05 / 0.11088 = 0.2536, and the peak there is 0.2338 (44.1 kHz) or 0.2351 (48 kHz), below the 0.25 ceiling. At −4 dB it would be 0.262 and 0.264, above it.
- At the bottom, −60 dB, the music's RMS is 5.0 × 10⁻⁵ of full scale, 86 dB below full scale, as quiet as the hiss there.
- Over 1 s windows the music's RMS ranges from −25.6 to −12.6 dBFS, 6.5 dB either side of its whole RMS (Q41).
- The loop point: in the first file the last decoded sample was −0.081 and the first −0.0001, a step of 0.081 at the seam. The coordinator replaced the file with one that has a 10 ms fade at each end; decoded, it begins at about 0.003 and ends at about −0.0001, with RMS and peak unchanged (Q40).
- Integrated loudness by ffmpeg's EBU R128 filter (BS.1770): the music −19.4 LUFS at an RMS of −19.10 dBFS; the hiss, 40 renders of `renderCalibrationHiss` at 48 kHz (seed 12345) piped to ffmpeg in memory, −23.3 LUFS at an RMS of −26.02 dBFS. At equal RMS the hiss is about 3.0 LU louder than the music.
- Ramp times: from −60 to the Keep_Minimum (−27) takes 13.2 s, to the top (−5) 22 s. The hiss repeats rise 5 dB per 1.9 s (1500 ms sound, 400 ms gap), 2.6 dB/s, so the music's 2.5 dB/s is about what the repeats allow now, as the brief says.

### The hiss at the anchor

The headphone check and the swap check play the hiss at `headphoneCheckLevelDb` (0 dB), with the same RMS as the music at the kept setting, as today. By the loudness measure above, that hiss is about 3 LU louder than the music the visitor called clear and comfortable, so it is clearly audible; no listening test is needed to know that. Its peak at the Control_Top is −26.02 + 15.5 − 5 = −15.5 dBFS, within the ceiling. Whether it feels comfortable is part of the first listening session (Q41 lists it with the music's own changes of level).

### Testing the music under Node

The Fake_Backend gains `loadCalibrationMusic`, which returns a promise the test resolves with samples or rejects, or leaves pending; `startLoop`, `rampLoopLevel` and `stopLoop`, which it records with their audio clock times; and `outputLatencyMs`, which the test sets. `tests/properties/calibration-music-fixture.ts` makes deterministic samples in code (no audio file): a few seconds of a sum of sine partials under a slow envelope, scaled to a chosen RMS and crest factor, at a chosen rate. The pure functions (`measureCalibrationMusic`, `calibrationMusicTopDb`, `nextCalibrationMusicSettingDb`) are tested with plain arrays. CP6 runs the shell on the Fake_Backend with the manual timer and rebuilds the gain over time from the recorded calls. `web-audio-backend.ts` is not run under Node, as today; manual checks for the owner are under "What the owner builds".

## The calibration copy

`src/copy/calibration-copy.ts`. The music's lines replace the text of the existing constants, so the owner's page shows them at once; the hiss lines are new.

| Constant | Text |
|---|---|
| `calibrationCopy.heading` | "Set the music to a comfortable volume" |
| `calibrationCopy.againHeading` | "Set the music again" |
| `calibrationCopy.openLine` | "Move the control until the music is as loud as you would listen to music in a quiet room: clear and comfortable, not loud. Leave your system volume where you usually have it. The music starts very quietly." |
| `calibrationCopy.whyLine` | "This tells the house how loud is safe on these headphones at this volume, and gives your result a level to be measured from." |
| `calibrationCopy.riseLine` | "The music follows the control a little at a time, so it takes a few seconds to get louder." |
| `calibrationCopy.keysLine` | "On a keyboard, the arrow keys move the control one step. Shift with an arrow, Page Up or Page Down move it five steps. Home and End go to the ends. Enter keeps the setting." |
| `calibrationCopy.atTopLine` | "This is as loud as the music goes here. If it still sounds too quiet, keep this setting." |
| `calibrationCopy.systemVolumeHighLine` | "Your system volume is set very high. Turn it down, then set the music again." |
| `calibrationCopy.loadingLine` | "The music is on its way." |
| `calibrationCopy.keptLine` | unchanged (rule 8) |
| `calibrationCopy.startButton`, `quieterButton`, `louderButton`, `keepButton` | unchanged |
| `calibrationCopy.hiss.heading` | "Set the hiss to a comfortable volume" |
| `calibrationCopy.hiss.againHeading` | "Set the hiss again" |
| `calibrationCopy.hiss.openLine` | "The calibration sound is a hiss. Move the control until it is as loud as you would listen to music in a quiet room: clear and comfortable, not loud. Leave your system volume where you usually have it. The hiss starts very quietly." |
| `calibrationCopy.hiss.riseLine` | "The hiss follows the control a little at a time, so it takes a few seconds to get louder." |
| `calibrationCopy.hiss.atTopLine` | "This is as loud as the hiss goes here. If it still sounds too quiet, keep this setting." |
| `calibrationCopy.hiss.systemVolumeHighLine` | "Your system volume is set very high. Turn it down, then set the hiss again." |

`whyLine` and `keysLine` serve both sounds. `introLines` is `[openLine, whyLine, riseLine, keysLine]` of the sound in use (the music's while loading); `heading` is the heading or the again heading of that sound. `visitCopy.calibrationHeading` and `visitCopy.recalibrateHeading` become the same strings as `calibrationCopy.heading` and `againHeading`, so the owner's page shows the music headings until it reads `snapshot.heading`. No line mentions hands, and no line suggests raising the system volume (audio-output D9). The keys line names what the owner's `calibration-action-for-key.ts` does today; if the owner changes the keys, the line is the owner's to ask for (Q32).

The strings the owner's page must stop using: `calibrationCopy.openLine` as a fixed paragraph (`build-visit-page.ts`), `visitCopy.calibrationHeading` and `visitCopy.recalibrateHeading` (headings). It should show `snapshot.heading`, `snapshot.introLines` and `snapshot.line` instead, which name the hiss when the music could not be loaded. Until it does, the visitor on the hiss fallback reads the music's opening paragraph and the hiss's line below it.

## Every place that names the hiss

| Place | Today | Change | By |
|---|---|---|---|
| `src/copy/calibration-copy.ts` | hands and hiss | "The calibration copy" | task 4 |
| `src/copy/visit-copy.ts` `calibrationHeading`, `recalibrateHeading` | "Match the hiss to your hands", "Match the hiss again" | the music headings | task 4 |
| `src/copy/leaving-copy.ts` `pauseLines.deviceChanged` | "You will match the hiss again" | "Your audio device changed, so the visit paused. You will calibrate again, and then this room starts over." | task 4 |
| `src/copy/output-state-copy.ts` (device changed) | "Match the hiss again before the house plays anything else." | "All sound stopped because your audio device changed. Calibrate again before the house plays anything else." | task 4 |
| `src/copy/output-copy.test.ts` | `/match the hiss again/i` | `/calibrate again/i` | task 4 |
| `src/session/visit-flow-types.ts` comments | `startCalibration`, `louder`, `CalibrationSnapshot`, `playing` | "Interface contract" | task 4 |
| `src/session/create-visit-flow.ts` comment of `calibrationFresh` | "starts the hiss" | "starts the calibration sound" | task 4 |
| `src/config/audio-output-config.ts` comments of `calibrationSettingMinDb`, `headphoneCheckLevelDb` | "for the hiss", "matched to their hands" | "for the calibration sound", "the anchor: the level the visitor just set" | task 4 |
| `src/session/README.md`, `src/copy/README.md`, `src/config/README.md`, `src/audio/output/README.md`, `tests/listeners/README.md` | as found by `grep -n "hands\|hiss"` | where they describe calibration | task 4 |
| `.kiro/steering/hearing-method.md` "Level scale", `.kiro/steering/product.md` step 2 | hands | "The anchor" | task 5 |
| `docs/architecture.md` "The level scale"; open question 3 | "matched the visitor's hand rubbing"; "Is the hand-rubbing anchor repeatable" | "the calibration music at the setting the visitor chose as comfortable"; "Is a comfortable music volume repeatable enough for this visit against last visit to mean anything?" | task 5 |
| `src/audio/synth/calibration-hiss.ts` | "a steady hiss shaped like hands rubbing" | unchanged: it describes the hiss's shape, which stays | – |
| The headphone check and swap check lines | "Which side was the hiss on?" | unchanged: those sounds stay the hiss | – |
| The owner's: `src/ui/visit/build-visit-page.ts` (`calibrationCopy.openLine`, `visitCopy` headings), `calibration-action-for-key.ts` and `screen-of-snapshot.ts` comments, `tests/e2e/visit-steps.ts` comments, `src/ui/README.md` (listening page "starts with a very quiet hiss"), the root `README.md` line 9 ("match the hiss to their hands") | | listed for the owner | owner |

## The anchor

New text of "Level scale" in `.kiro/steering/hearing-method.md`:

> All levels are in decibels relative to the calibration anchor. The anchor is the volume at which the visitor would listen to music in a quiet room: clear and comfortable, not loud. The visitor sets a piece of calibration music to it with the page's control and leaves the system volume at its usual level. Zero means "as loud as the calibration music at the setting the visitor chose", matched by RMS. Where the music cannot be loaded the calibration sound is the hiss, set in the same way. Negative numbers are quieter.
>
> The anchor is a rough reference and nothing more. It is what this visitor finds comfortable on these headphones at this volume, so it differs between people and says nothing about how well anyone hears. Visits whose anchors were set in different ways (rubbed hands before 2026-11-16, the music, the hiss) are never compared. Never convert a level on this scale to dB SPL or dB HL in visitor-facing output.

New step 2 of "What the visitor does" in `.kiro/steering/product.md`:

> 2. Calibrates. Sets a piece of music in the headphones to the volume at which they would listen to music in a quiet room, clear and comfortable, without changing the system volume. Confirms left and right are not swapped.

What the music keeps and what it gives up. `product.md` lets the result claim two comparisons only: the left ear against the right ear on the same floor, and the same person with the same headphones on a later visit. Neither needs a reference outside the headphones. Left against right compares two levels played through the same calibration, so the anchor cancels. The later visit compares two anchors set by the same person, on the same headphones, in the same way, so it holds as far as a comfortable volume is repeatable for that person, which is open question 3 of `docs/architecture.md`, as it was for the hands. The music gives up what the hands only seemed to give: a link, however rough, to a sound outside the headphones. A visitor with poor hearing will choose a louder setting, so the numbers are relative to what that visitor finds comfortable, and they never say how good anyone's hearing is. The product already makes no such claim (`wording.md`: no clinical scale, no comparison with other people). Its gain: every visitor can do it, with earbuds in and noise cancelling on, and knows what to aim for.

## The exception to rule 6

The sentence added to `.kiro/steering/audio-safety.md`, as a new paragraph directly under the list item of rule 6 (the item and every other line unchanged):

> Exception, approved by the project owner on 2026-11-16: the calibration music may play without a break while the calibration screen is open and the visitor has started it; it still fades in and out, starts at the bottom of the control and rises by no more than 5 dB in any 2 seconds, and every other sound keeps the limit above.

No other sentence of `audio-safety.md` is out of date: rule 8's line still follows calibration, and the Initial values table holds no value this spec changes. The comment of `audioSafetyConfig.ghostSoundMaxDurationMs` gains: "The calibration music is the one exception, approved by the owner on 2026-11-16 (audio-safety.md, rule 6)."

## The cap

`capRelativeToAnchorDb` goes from 15 to 5, a decision of the brief (made by the owner's coordinator on 2026-11-16, at the owner's request). It is stricter, which `audio-safety.md` allows; no other audio-safety value moves. The reason beside the value is given under "Config". The worst case stays bounded twice: by 5 dB above an anchor that is likely about 10 dB above the old one, and by the unchanged ceiling of 0.25 of full scale.

| What | Before | After |
|---|---|---|
| `preparePlayback` step 6, the anchor cap | requests above 15 clamped | above 5 clamped. No search, practice or check asks above its room's top, so none is |
| Room_Top `min(cap, 13.98 − peakBound − S)` | at most 15 | at most 5. Every room is at 5 for settings up to −9 dB (stairs: 13.98 − 17 − S ≥ 5 needs S ≤ −8.02) |
| Search_Cap (grid) | 0 to 15 | 0 or 5. At the music's Control_Top (−5): cellar 5, corridor 5, nursery 5, stairs 0, attic 5 |
| `roomTopMinDb` | 0 | 0, unchanged: every room still reaches the anchor at the Control_Top; practice begins there |
| "worse than cap" | not caught at up to 15 dB above the hands | not caught at up to 5 dB above the comfortable volume, or the room's lower top; in the search, or twice at the top in practice |
| Missed-sound replay | raised by 20 dB, held at the room's top, at most 15 | held at the room's top, at most 5. More replayed sounds are held below their raised level, and `capChangedLevel` says so |
| `roomsShortLine` | counts rooms whose cap is below 15 | below 5: at settings up to −9 dB none, at −5 dB one (stairs) |
| Range_Report `belowAnchorCapDb` | 15 − top | 5 − top |
| The headphone check, at 0 dB | ≤ cap | ≤ cap |
| threshold-search CP1 to CP3, CP8, CP10 to CP12 (shipped settings) | cap 15 | cap 5. Thresholds are drawn from the floor to the cap, so from −70 to 5 (D35, "Measurements") |
| threshold-search regressions 1 to 4 | shipped settings | the settings they were found with, written out (cap 15) |
| visit-flow arbitraries | target from −40 to −4 | from −27 to the Control_Top, read from the config |
| visit-flow CP6 | each attempt's cap is `roomSearchCapDb` of its top | unchanged statement, new values |
| swapped-repeat arbitraries and CP1 | caps 0 to 15 | caps 0 to 5 |
| missed-sound replay CP7 | replay at most the cap | unchanged statement |
| audio-output CP1, CP5, CP6, CP7, CP8, CP11 | read the config | unchanged statements; tests that write 15 as an expected top (`room-top-level.test.ts`, `range-report.test.ts`, `prepare-playback.test.ts`, `create-audio-output.test.ts`, `room-search-cap.test.ts`, `listening-page-session.test.ts`, `room-runner.test.ts`, `create-visit-flow.test.ts`, `create-swapped-repeat.test.ts`, the replay's tests, `swapped-repeat-copy.test.ts`) get the new expected values |

## Saved visits from before, and the earlier visit

A Payload written before this spec has format 1 and none of the new fields. It reads as today (R11.1): the reader checks a new field only when it is present ("Checking a payload"). The picture draws each of its floors between the floor's own `searchCapDb` (up to 15, the cap then) and the Saved_Visit's `floorDb` (−70), as today. Its calibrations have no `anchor`, so their Anchor_Kind is `hands`.

`anchorKindOf(log, calibrationIndex)` gives a calibration's Anchor_Kind; a floor's kind is that of the calibration of its last finished attempt. `resultPicture` gives a wing an earlier mark only when the shown floor and the earlier floor have the same kind, and gives `comparison` null when no floor has a mark. `findEarlierVisit` skips a listed visit whose kind is `hands` unless the shown visit is a listed visit whose kind is `hands`; for a live visit, which is never `hands`, it skips every `hands` visit. A live visit with the music and a saved one with the hiss, or the other way, is caught by the picture's own rule (D26). So a visit is never compared with one whose anchor was the hands, and never with one whose anchor was set with the other sound.

Checking a payload (additions to result-page "Checking a payload"): when present, `visitLog.practice` is an object with the three lists; `calibrations[i].anchor` is `music` or `hiss` (a saved `hands` is unreadable, because no calibration is logged so); `roomFloorLevelDb` has a finite number for every ghost room; `outputLatencyMs` is null or a finite number from 0 up; `roomAttempts[i].searchFloorDb` is finite and below `searchCapDb`; `searchStartLevelDb` is null or has `left` and `right`, each null or finite from `searchFloorDb` to `searchCapDb`; `responseWindowMs` is finite and at least 0; `summary.rooms[i].searchFloorDb` is finite and below its `searchCapDb`; a Repeat_Record's `practice` follows the log's rule. Any break makes the payload unreadable, as every other rule does.

## The playable floor

`roomFloorLevelDb(soundId, calibrationGain)` in `src/audio/output/room-floor-level.ts`, next to `room-top-level.ts`, is pure:

```
playableLevelDb = gainToDecibels(playableRmsMinFraction / (referenceRmsFraction × calibrationGain))
roomFloorLevelDb = max(hearingMethodConfig.floorDb, playableLevelDb)
```

With the shipped numbers `playableLevelDb = −84 + 26.02 − S = −57.98 − S` for every sound, because every sound has the reference RMS (ghost-sounds D7). It is not rounded. `roomSearchFloorDb(floorLevelDb, settings)` in `src/session/room-search-floor.ts` gives the lowest Level_Grid level at or above it: `practiceStartLevelDb + ceil((floorLevelDb − practiceStartLevelDb) / upwardStepDb − 10⁻⁹) × upwardStepDb`, and never below `floorDb`. Rounding up keeps every level the search asks for at or above the exact floor.

How each part gets it, as each gets the room's top today (D23):

| Part | The room's top today | The floor |
|---|---|---|
| Output stage | `rangeReport(gain).rooms[id].topLevelDb`, `setBy` | `rooms[id].floorLevelDb`, `floorSetBy` (`fixedFloor` or `playableRms`); the report also gives `playableRmsMinFraction` beside `floorRmsFraction` |
| Logged calibration | `roomTopLevelDb` | `roomFloorLevelDb` (optional field) |
| Room run (`startRoom`, the repeat's `startRoom`) | `roomSearchCapDb(top)` as the search's `capRelativeToAnchorDb` | `roomSearchFloorDb(floor)` as the search's `floorDb`, and to the practice |
| Engine settings | `capRelativeToAnchorDb` | `floorDb` (the engine already takes it; "better than floor" is two catches there) |
| Room_Attempt | `searchCapDb` | `searchFloorDb` |
| `summarizeVisit` | `searchCapDb` from the attempt | `searchFloorDb` from the attempt, when present |
| `resultPicture`, `lightDepthFraction` | `FloorScale.searchCapDb` | `FloorScale.floorDb` = `roomSummary.searchFloorDb ?? source.floorDb` |
| `swappedRepeatComparison` | the first run's cap | the first run's floor, the same way |
| Repeat_Run | checks its cap equals the first run's | checks its floor equals the first run's `searchFloorDb`, and throws otherwise |
| Missed-sound replay | holds each sound at the room's top | nothing: it plays logged trials, all at or above the floor, 20 dB louder |
| Listening page | each row's top | each row gains `playableFloorLevelDb`; its lowest level stays `floorDb`, so the owner can listen below the playable floor (Q39) |

The arithmetic at the Keep_Minimum, the middle and the Control_Top. The exact floor is `max(−70, −57.98 − S)`; the top is `min(5, 13.98 − peakBound − S)`; brackets give the grid values.

| Setting S | Exact floor | Search_Floor | Cellar top (13.5) | Corridor (5.5) | Nursery (10) | Stairs (17) | Attic (4.5) | Range per room, top − floor |
|---|---|---|---|---|---|---|---|---|
| −27 (Keep_Minimum) | −30.98 | −30 | 5 | 5 | 5 | 5 | 5 | 35, 35, 35, 35, 35 |
| −16 (middle) | −41.98 | −40 | 5 | 5 | 5 | 5 | 5 | 45 each |
| −5 (Control_Top, music) | −52.98 | −50 | 5.48 (5) | 5 | 5 | 1.98 (0) | 5 | 55, 55, 55, 50, 55 |
| −4 (Control_Top, hiss) | −53.98 | −50 | 4.48 (0) | 5 | 7.98 (5) | 0.98 (0) | 5 | 50, 55, 55, 50, 55 |

The fixed floor (−70) acts only above S = 12.02 dB, which no setting reaches, so the playable RMS sets every floor. The practice level (0) and every Search_Start (−10 or −5) lie above every Search_Floor, and every Search_Floor lies below its Search_Cap.

## The Keep_Minimum

A calibration can be kept only when every room has at least `playableRangeBelowAnchorMinDb` (30 dB) of playable range below the anchor: `0 − Search_Floor ≥ 30`, so the Search_Floor is at most −30. The exact floor is at most −30 for S ≥ −27.98, and the grid floor too (at −27 it is −30; at −28 the exact floor is −29.98 and the grid floor −25). So the Keep_Minimum is **−27 dB**, raised from −40. A higher Keep_Minimum refuses more settings and asks more visitors to turn the system volume down, which is always safe; `audio-safety.md` allows any value to be made stricter, and audio-output D32 guards this value against loosening only.

The settings that can be kept are −27 to −5 with the music (23 settings, 22 dB) and −27 to −4 with the hiss (24 settings, 23 dB), more than the 10 dB the brief requires. Every room then has 35 dB (at −27) to 55 dB (at the top) between its floor and its top, as the table gives; the stairs has 50 dB at the top.

What the estimate of audio-output D10 says. D10 assumed rubbed hands at about 65 dB SPL at the ear (unverified) and headphones that play full scale at 90 to 115 dB SPL at the volume the visitor uses; the setting S that matches a level L is then `L + 26 − fullScale`, from −24 to +1 for L = 65. The brief expects a comfortable music volume to be louder than rubbed hands, which raises S. So the whole range of the estimate lies at or above −24, 3 dB above the new Keep_Minimum: by that estimate no visitor inside it is asked to turn the volume down, and only a visitor whose volume is at least 3 dB above the loudest case of the estimate, or who chooses music quieter than about 62 dB SPL at the ear on loud headphones, is. How many visitors that is cannot be told from the estimate; the first listening sessions will show it. The same estimate puts visitors with quiet headphones at the top of the control (S above −5 for L = 65 when full scale is below about 96 dB SPL), where the line at the top tells them to keep the setting.

## Practice

### What the guideline says

From the ASHA guideline (2005), fetched again on 2026-11-16:

- "The basic procedure for threshold determination consists of (a) familiarization with the test signal and (b) threshold measurement."
- "Familiarization. The purpose of familiarization is to assure the audiologist that the participant understands and can perform the response task. Familiarization is a recommended practice for general populations ... The participant should be familiarized with the task before threshold determination by presenting a signal of sufficient intensity to evoke a clear response." Its second method: "Present a 1000-Hz tone at a 30 dB hearing level (HL). If a clear response occurs, begin threshold measurement. If no response occurs, present the tone at 50 dB HL and at successive additional increments of 10 dB until a response is obtained."
- Table 1, "Difficult to test": "Repeat familiarization task at test frequencies other than 1000 Hz when responses are inconsistent."
- On the first threshold presentation: "Level of first presentation. The level of the first presentation of the test tone shall be well below the expected threshold." And: "After each failure to respond to a signal, the level is increased in 5-dB steps until the first response occurs. After the response, the intensity is decreased 10 dB, and another ascending series is begun."

What the product takes and where it departs. It familiarizes in every room, because each room is another pitch and another sound. It begins at a level meant to be clear (the anchor) and rises after no response, in 5 dB steps rather than 10 dB, because the cap allows only one step above the anchor. It treats the practice catch as "the response" and begins the search 10 dB below it. It does not follow "well below the expected threshold": its search starts at a level that is usually heard and goes down from there, as the search did before practice was added (from −25 dB), and finds the threshold on the rising presentations as the guideline defines it. This departure is recorded in the Practice section of `hearing-method.md` ("Steering").

### Where practice lives

Practice is a step of the room runner before the search (D11). The rule is the pure state machine `createRoomPractice` in `src/session/room-practice.ts`; the room runner presents its sounds with the same gap, play, window and scoring code as trials; when practice ends, the runner creates the search with `createSearch(startingLevelsDb)`, which the flow and the repeat give it, and runs the search as today. The engine gains only per-ear starting levels (D15). The other place, a phase of the engine's search, would put a command that is not a response (try again, go on) into the engine, interleave practice records with the search's trial numbers, and change every engine property and its oracle.

### The rule for each ear

`createRoomPractice({ settings, searchCapDb, ears, random })`, where `settings` picks `practiceStartLevelDb`, `upwardStepDb`, `capMissesForWorseThanCapCount`, `gapBetweenTrialsMinMs` and `gapBetweenTrialsMaxMs`, and `ears` lists the ears to practise (both at the start, the unheard ones on a try again):

- Each ear's first level is `min(practiceStartLevelDb, searchCapDb)`: the anchor, 0 dB, since every Search_Cap is 0 or 5.
- A `caught` answer ends that ear's practice with its catch at that level.
- A `missed` or `wrongSide` answer raises its next level by `upwardStepDb`, at most `searchCapDb`. At `searchCapDb`, it counts a miss at the top; after `capMissesForWorseThanCapCount` (2) misses at the top, that ear's practice ends unheard. Two misses at the loudest level are the evidence the search needs to call an ear worse than cap (threshold-search D4), so going on records the same state on the same evidence (D12).
- So at a Search_Cap of 5 an ear hears at most 0, 5, 5: three sounds. At a Search_Cap of 0 it hears at most 0, 0: two sounds. With both ears unheard, a round is at most 6 sounds (R15.7).
- `current()` gives the next practice sound `{ ear, levelDb, gapBeforeMs, practiceNumber }`, or `{ kind: "ended", catches: Record<Ear, number | "notHeard"> }`; `respond(outcome)` records the outcome of the sound waiting. Pure, frozen, no clock.

### Order, gaps and answers

- **Order.** Each practice sound is for an ear drawn uniformly among the ears whose practice has not ended (one draw when there are two). Once one ear has caught, the rest of the round is on the other ear; nothing counts in practice, so the visitor gains nothing by knowing it (D13).
- **Gaps.** Each gap is drawn as the engine draws one (whole milliseconds, uniform from `gapBetweenTrialsMinMs` to `gapBetweenTrialsMaxMs`), so practice has the rhythm of the room. The first practice sound also waits its gap after the room starts.
- **Random numbers** come from the visit's sound source (`Visit.soundRandom`), never from the engine seed, so the search draws exactly what it would draw without practice, and `swappedRepeatEngineSeed` and `replayRenderSeed` count the same draws (D13).
- **Windows.** A practice sound has the window of a trial: its Window_Start from the scheduled start and the timestamp pair, and the length of R21.3.
- **A wrong-side answer** is scored `wrongSide`, which does not end the ear's practice: as in the search, a wrong side is not a catch (`hearing-method.md`).
- **An answer with no sound playing** (outside every practice window, or after the first answer in one) is logged in `practice.ignoredAnswers` and changes nothing. Practice has no no-sound trials, so no answer is a false alarm.
- **A pause** (visitor, hidden, interrupted) discards the presented practice sound, logged as discarded, and after `resume` the same sound (ear, level, practice number) is presented again after its own gap, as a trial is (visit-flow D9). A device change abandons the attempt as today; the new attempt begins with practice again.
- **A refused practice sound** follows the room runner's rule: `notRunning` acts as a stop report; any other refusal is logged in `practice.refusedPlays` and the sound is presented again after its gap; the count of refusals in a row is shared with the run's trials, so three in a row in practice end the visit as `soundRefused`, as in a room (D38).

### When an ear does not catch it

When every ear's practice has ended and at least one ended unheard, practice is Not_Heard: the runner stops presenting, and the flow begins a pause with the reason `practiceNotHeard` (D14). It is told at once: no sound plays and no timer runs until the visitor acts. The room's snapshot gives the phase `notHeard`, the ears not heard and the lines; the pause field gives the reason. If both ears are unheard the visitor is told after at most 6 sounds; with one ear heard, after at most 3 sounds of the other.

- **Try the practice again** is `resume` in that pause, a press, so `activate` runs in the call (a visitor who chose another output can be heard now). A new round begins for every ear that did not catch, from the anchor; ears that caught keep their catch. The round number goes up by one. There is no limit on tries.
- **Go on** is `goOnWithoutPractice()`. The pause ends, and the Counting begins with Search_Start null for every ear that did not catch.
- **Stop** leaves the house, as in every room. A hidden page, an interruption or a device change during the pause act as for any pause (`beginPause` keeps a pause that holds, except that a device change replaces it).

### How an ear that goes on is recorded

The engine is created with `startingLevelsDb[ear] = null` for that ear (D16). `createEarSearch` with a null start begins ended with the ending `worseThanCap` and no presentation. `finalizeEarResult` then gives `worseThanCap` with every count 0, or `unreliable` with the reason `falseAlarmRate` if the room's false alarm rate is above its limit, exactly as for any ear that ends worse than cap. The other ear searches alone, as an ear does today once the other has ended. With both ears null the search has no sound trial, needs no closing no-sound trial (`atLeastFraction(0, 0, share)` holds), and is finished at creation with both ears worse than cap and a false alarm rate of 0; the runner then finishes the room at once.

So `summarizeVisit`, `resultPicture`, the missed-sound replay and the swapped repeat need no new state. The summary shows `worseThanCap`. The picture draws it as the hatched end of "worse than cap". The replay has nothing to play from that ear, because it has no trial. The swapped repeat is not offered for that floor, because it needs both ears found, and an ear that goes on in a Repeat_Run makes its outcome `unclear` with `noLevel`.

### The search start, and the engine change

`searchStartingLevelsDb(catches, { searchFloorDb, searchCapDb, downwardStepDb })` gives, for each ear, `min(searchCapDb, max(searchFloorDb, catch − downwardStepDb))`, or null for `notHeard` (D17). The 10 dB of the brief is the search's own downward step, as if the practice catch were the search's first catch, so no new number is needed. The catches are 0 or 5 and every Search_Floor is at most −30, so the starts are −10 or −5.

`ThresholdSearchSettings` becomes `Pick<HearingMethodConfig, the same fields without "startingLevelDb"> & { readonly startingLevelsDb: Readonly<Record<Ear, number | null>> }` (D15). `validateSearchSettings` checks that each non-null start is a whole number from `floorDb` to `capRelativeToAnchorDb` and on the grid of the floor and the cap, and that floor and cap are on one grid when both starts are null. Every room run of the visit and of the repeat creates its search with `{ ...hearingMethodConfig, capRelativeToAnchorDb: searchCapDb, floorDb: searchFloorDb, startingLevelsDb }`.

### The log

The recorder gains `practiceScored`, `practiceDiscarded`, `practiceAnswerIgnored`, `practicePlayRefused` and `countingStarted({ roomIndex, attempt, searchStartLevelDb, atMs })`; `attemptStarted` gains `searchFloorDb` and `responseWindowMs`. Practice goes to `log.practice`, never to `trials`, `ignoredAnswers` or `refusedPlays` (D18). The engine's result holds only the search's trial records, as today. So every reader of the log counts exactly what it counted before: the summary's catch counts, false alarms, ignored answers and its visit rule; the replay's missed sounds; the picture; the saved visit's checks. Practice is still in the log, so a whole visit can be read back, and the no-headphone replay (brief 09) may show it.

### Practice in the swapped repeat

The Repeat_Run uses the same room runner, so it begins with practice on the earpieces of the swap: a practice sound for the left ear plays in the right earpiece, through the same swapped view of the output, and each logged practice sound names its ear and its earpiece (D21). The run's own recorder holds its practice, and `swappedRepeatRunOf` puts it in the record's `practice`. Nothing goes to the Visit_Log. The pause `practiceNotHeard` holds in the repeat's room as in the rooms (`SwappedRepeatPauseReason` gains it), is written to the run's record, and `goOnWithoutPractice` acts there. The repeat's view of the phase `room` gains `practice`. `beginRoom` is still called after the last swap check and before the first sound of the run (swapped-repeat R17.4), which is now a practice sound.

### Audio safety during practice

Rule 4 in practice:

| Case | What happens | Why rule 4 holds |
|---|---|---|
| A practice sound after a quieter practice sound on the same ear | It is exactly one upward step (5 dB) louder, or as loud, never more | The ladder rises by `upwardStepDb` and stops at the Search_Cap; the output stage's Rise_Limit per channel, which spans practice and search because `beginRoom` is not called between them, limits it again (D22) |
| The first practice sound of a room after the last sound of the room before | It plays at the anchor (0 dB), after the rest between rooms and the visitor's press of "go on"; the last sound of the room before may have been as quiet as that room's floor | Rule 4 applies "within a room": `beginRoom` starts each room's Rise_Limit afresh, as today, when the first sound was at −25 dB after a last sound as low as −70 dB. The anchor is the visitor's own comfortable volume and at most the room's top, so no cap or ceiling acts. Whether it startles is a listening question (Q42) |
| The practice of a swapped repeat after the swap check's hiss | The hiss plays at 0 dB in the left earpiece; `beginRoom` follows; the first practice sound plays at 0 dB | Equal levels, and a new room span; no rise |
| A practice started again after "try again" | Each unheard ear starts again at the anchor; its last sound was at the Search_Cap (0 or 5), so the new sound is as loud or 5 dB quieter | No rise. `beginRoom` is not called, so the Rise_Limit still holds |
| The first search sound after practice | One downward step below the catch, or the Search_Floor | A fall |
| Counting after "go on" | Nothing plays for the unheard ear; the other ear's search goes on | No sound, no rise |

Every rule:

| Rule | During practice |
|---|---|
| 1, one output path | Every practice sound through `output.play` with the Purpose `trial`, the room's sound and the ear's channel (or the swapped earpiece) |
| 2, a hard cap | At most the Search_Cap, which is at most the Room_Top under the new cap and the ceiling; the output stage applies the cap and the ceiling to every sound |
| 3, no sudden sounds | The 25 ms output fade on every sound; the 20 ms stop fade on stop, pause, hidden, leaving |
| 4, no jumps upward | Above |
| 5, silent means silent | One channel per practice sound, exact zero on the other; practice has no no-sound trials; no keep-alive signal |
| 6, short sounds | The room sounds, 0.8 to 1.4 s; one sound at a time |
| 7, the visitor stays in control | The stop control in every room phase, practice included; pause; hiding the page pauses; leaving ends the visit |
| 8, calibration can be undone by the volume keys | The kept line before the rooms, unchanged |
| 9, no jump scares | The room's own sound at a comfortable level, after a press; the copy holds no threat and nothing sudden |

### What the screen is told

`roomPracticeView({ roomId, phase, soundPlaying, notHeardEars })` in `src/session/room-practice-view.ts` is pure and gives the `RoomPractice` of the contract, every string from `src/copy` (D19). The flow passes the runner's practice state:

- `practice`: `heading` "Practice"; `lines` the room's line, "This is practice. Nothing counts yet.", "The counting begins once you have caught it on both sides."; `soundPlaying` true from a practice sound's presentation to its scoring or discarding; `soundPlayingLine` "Listen. It is making its sound now." while it is true.
- `notHeard`: `heading` "Practice"; `notHeardEars`; `notHeardLines` from `notHeardLine(ears)`, the check line and the choices line; the two labels.
- `counting`: `heading` null; `lines` the room's counting line only; `soundPlaying` false; the same view for the whole search.

Why showing that a practice sound plays leaks nothing about a counted trial. Practice and counting never overlap in a room run: the search is created only after every ear's practice has ended, so every practice sound is presented before the first counted trial, and a try again comes before it too. The indicator never names a side, and no field of the view depends on which ear a practice sound is for. In `counting` the view is constant and the snapshot does not change between a trial's presentation and its scoring, so visit-flow R11.2 and R11.3 hold for every counted trial as before. The only events of the counting are `trialScored` at scoring; `countingStarted` comes before the first counted trial's gap and names no trial. The search draws its gaps, ears and no-sound trials from its own engine seed, untouched by practice, so when practice ended says nothing about the counted trials that follow. Showing practice sounds makes no claim about hearing, because practice counts for nothing.

`practiceSoundScored` is handed out in the step that scores a practice sound, with the reaction `ripple` and the label `practiceCaughtLine(side, frequencyHz, levelDb)` for a catch, and `none` otherwise (D20). It comes after the answer, as every ripple does.

### The practice copy

`src/copy/practice-copy.ts`:

| Constant | Text |
|---|---|
| `heading` | "Practice" |
| `notCountingLine` | "This is practice. Nothing counts yet." |
| `countingBeginsLine` | "The counting begins once you have caught it on both sides." |
| `soundPlayingLine` | "Listen. It is making its sound now." |
| `checkLine` | "Check that your headphones are on and connected, that this device is playing through them, and that its sound is not muted." |
| `choicesLine` | "You can hear the practice again, or go on without it. If you go on, that side is marked as not caught at the loudest this room may play." |
| `tryAgainButton` | "Hear the practice again" |
| `goOnButton` | "Go on without it" |
| `roomLines.cellar` | "Something is knocking under the floor. Tell me which side it is on." |
| `roomLines.corridor` | "Something is humming along the corridor. Tell me which side it is on." |
| `roomLines.nursery` | "A music box is playing somewhere in the nursery. Tell me which side it is on." |
| `roomLines.stairs` | "Something is scraping on the stairs. Tell me which side it is on." |
| `roomLines.attic` | "Something is whining up in the attic. Tell me which side it is on." |
| `countingLines.cellar` | "The knocking has noticed you. From now on it counts, and it will be quieter." |
| `countingLines.corridor` | "The humming has noticed you. From now on it counts, and it will be quieter." |
| `countingLines.nursery` | "The music box has noticed you. From now on it counts, and it will be quieter." |
| `countingLines.stairs` | "The scraping has noticed you. From now on it counts, and it will be quieter." |
| `countingLines.attic` | "The whining has noticed you. From now on it counts, and it will be quieter." |

`src/copy/practice-lines.ts`:

- `notHeardLine(ears)`: for `["left"]` "I played it as loud as I may in this room, and you did not catch it on your left."; for `["right"]` the same with "right"; for both "I played it as loud as I may in this room, and you did not catch it on either side." A `RangeError` for an empty list or a side that is not `left` or `right`.
- `practiceCaughtLine(side, frequencyHz, levelDb)`: "Practice. You caught it on your left. 1 kHz, as loud as your calibration." built from `pitchLabel` and `relativeLevelLabel` of `room-copy.ts`.

`leavingCopy.pauseLines.practiceNotHeard` (shown by the owner's current pause notice, whose button "Go on" calls `resume`): "I played this room's sound as loud as I may, and you did not catch it on one side. Check that your headphones are on and connected, that this device is playing through them, and that its sound is not muted. Then go on, and I will play the practice again." `swappedRepeatCopy.pauseLines.practiceNotHeard` is the same string.

The lines threaten nothing, describe no scream and nothing sudden, and blame no one; "loud" appears only as "as loud as I may", the limit the house keeps.

## Output latency

`backend.outputLatencyMs()` gives `context.outputLatency × 1000` when it is a finite number from 0 up, and null otherwise or with no context; the shell's `outputLatencyMs()` passes it on. MDN lists the property in every current browser since March 2025; older browsers give undefined, which is null here.

- **When it is read.** At `keepCalibration`. The flow logs it in the calibration as `outputLatencyMs` (null when none), and uses that value until the next calibration (D28). A device change, which is when latency changes most, already forces a new calibration.
- **The window.** `responseWindowMs(latencyMs, settings)` in `src/session/response-window-ms.ts` gives `responseWindowMs + min(responseWindowLatencyMaxMs, max(0, latencyMs ?? 0))`: 2000 to 2500 ms. Only the end moves. The Window_Start stays as today, from the timestamp pair, which already follows the output where the browser's `getOutputTimestamp` reports it (visit-flow D3). Moving the start later could drop an early answer to a sound the browser placed too late; ending later only accepts later answers. Every trial and practice sound of a run has the same window; the attempt logs it as `responseWindowMs`. A no-sound trial's window has the same length, so the no-sound trials stay like the sound trials.
- **The limit**, `responseWindowLatencyMaxMs`, is 500 ms (D31). It is not an audio-safety value: a longer window plays nothing louder or longer.
- **The gap and the visit lengths.** The gap is drawn by the engine and waited after each decision, so it is unchanged. A trial decided at the end of its window (a miss, or a no-sound trial left alone) is decided later by the allowance, so the time from one sound to the next grows by up to 500 ms for those trials and not at all for answered ones. With about half of a room's trials decided at their window's end, the allowance adds at most about 0.5 s × 15 = 7.5 s to a room of 30 trials. The visit length measurement prints the lengths without the allowance and with the largest one (R25).

## The result line

`playableFloorEars(roomSummary, floorDb, settings)` in `src/session/playable-floor-ears.ts` gives the ears of a floor whose result is `betterThanFloor`, or `found` with `thresholdDb ≤ floorDb + upwardStepDb`, where `floorDb` is the floor's `searchFloorDb`, or the Saved_Visit's `floorDb` for a floor without it (D27). `resultPicture` gives each Picture_Floor `playableFloorLine: playableFloorLine(ears)` when the list is not empty, and null otherwise. The line is per floor, so a floor with both ears says it once.

`playableFloorLine(ears)` in `src/copy/playable-floor-lines.ts`:

- one ear: "On your left, this is as quiet as the house can play through these headphones at this volume. Wireless headphones in particular stop there."
- both: "On both sides, this is as quiet as the house can play through these headphones at this volume. Wireless headphones in particular stop there."

It is the only string of `src/copy` with "wireless" or "Bluetooth" (CP9). An unreliable ear, an ear worse than cap and a found ear more than one step above the floor give no line. A floor of a saved visit from before this spec gets the line by the same rule against its fixed floor (−70), which was the quietest the house played then. The visitor is never asked what headphones they wear: no copy asks, no snapshot field holds an answer, and no command takes one.

## Bluetooth

| What Bluetooth can do | What the product does now | What this spec adds | What only a listening session can settle |
|---|---|---|---|
| Cut the first part of a sound after silence (the link or the earbuds wake up, or the codec starts again) | A 25 ms fade on every sound; sounds of 0.8 to 1.4 s; gaps of 1.5 to 4 s of exact silence (rule 5) | Practice at the anchor, so a cut start cannot leave the visitor with nothing to hear; the window's end moves by the reported latency. No signal keeps the link awake (rule 5) | Whether the owner's earbuds cut the start of a sound after 1.5 to 4 s of silence, by how much, and whether that cut grows near the floor (Q39) |
| A codec that drops very quiet sound, or a path of about 16 bits | The fixed floor of −70 dB lay 100 to 115 dB below full scale, under one 16-bit step (audio-output "The digital floor") | The playable floor: nothing below an RMS of 84 dB below full scale is played or counted; the result line where an ear reaches it | Whether −84 dB is the right value for real earbuds and codecs (Q39) |
| The volume changing by itself (the earbuds' own volume, a hearing-protection or "reduce loud audio" setting, absolute volume) | The kept line asks not to raise the system volume (rule 8); the cap is relative to the calibration | Calibration at the visitor's usual system volume; the result line says "at this volume". Nothing can detect a change | Whether common earbuds change the level between calibration and the rooms (Q39) |
| Switching to another device or to call mode (multipoint, a call, an app using the microphone) | A `devicechange` stops all sound and asks for a new calibration; a context below 22 050 Hz is refused | The music stops with every sound; a new calibration uses the music already decoded | Whether a multipoint switch fires `devicechange` in each browser (Q39) |
| Delay the sound by 100 ms or more | The window starts from `getOutputTimestamp` where the browser gives it | The window ends later by `outputLatency`, up to 500 ms, logged with the calibration | Whether the reported latency matches what reaches the ear |

## Existing properties

These keep their tolerances, run counts and timeouts. Only the statements named here change, to say what the house now does.

| Property | Change |
|---|---|
| threshold-search CP1 (step listeners exact) | shipped settings with each ear's start from `practiseForSearch` with the Step_Listener; an ear above the cap ends `worseThanCap` from practice; true thresholds from 20 dB below the floor to 20 dB above the cap, as before |
| threshold-search CP2, CP3 (accuracy) | the same, with Psychometric_Listeners; tolerances 93 % and 88 % / 10 % unchanged; CP2's skip removed if it holds (D35) |
| threshold-search CP4 to CP7, CP9, CP13 | the valid-settings arbitrary draws per-ear starts, null one time in ten for each ear; CP5's "at most one step above that ear's previous level" holds from each ear's own start; CP7 for rooms with at least one sound trial |
| threshold-search CP8, CP10, CP11, CP12 | shipped settings with practised starts; limits unchanged |
| threshold-search regressions 1 to 4 | the settings each was found with, written out; regression 4 stays `it.fails` |
| visit-flow CP1 (every visit ends) | the time budget gains, per attempt, `(tries + 1) × 6 × (gapBetweenTrialsMaxMs + scheduleLeadMs + responseWindowMs + responseWindowLatencyMaxMs)` for practice, and the window term includes the allowance |
| visit-flow CP2 (log holds played trials) | the sound trials of the log and the practice sounds, merged in presentation order, are one for one the backend's `schedule` calls of the `room` stage |
| visit-flow CP3 (nothing before scoring) | its intervals start at `countingStarted`; between it and each scoring nothing changes as before; during practice only `practice.soundPlaying` and the phase may change, and only `practiceSoundScored` and `countingStarted` are handed out |
| visit-flow CP4 (answers against windows) | the window is `[windowStart, windowStart + attempt.responseWindowMs)`; practice answers are checked against practice windows and `practice.ignoredAnswers` |
| visit-flow CP5 (log replays) | the search is created with the attempt's `searchStartLevelDb`, `searchFloorDb` and `searchCapDb` |
| visit-flow CP6 (rooms as output requires) | `beginRoom` before the first practice sound of every attempt; practice plays too have the Purpose `trial`, no clamp, played level equal to asked; `searchFloorDb` equals `roomSearchFloorDb` of the calibration's floor |
| visit-flow CP7 (pauses discard and repeat) | holds for practice sounds; the pause `practiceNotHeard` discards nothing and schedules nothing |
| visit-flow CP11 (statistical) | the rooms run with practised starts; its limits unchanged |
| missed-sound replay CP1 to CP10 | unchanged statements; the logs they draw gain practice |
| swapped-repeat CP1 | caps 0 to 5; the starts from practice with the Step_Listener in Worn_Headphones |
| swapped-repeat CP3, CP4, CP7, CP8 | each sound of the room, practice included, names its earpiece; CP4 replays from the attempt's starts; CP7's rise limit spans practice and search; CP8's intervals start at `countingStarted` |
| audio-output CP9 (calibration control) | unchanged for the hiss repeats; the music is CP6 here |
| audio-output CP11 (range report) | gains `floorLevelDb` and `floorSetBy` |
| result-page CP3 (depth on one floor), CP9 (earlier visit) | the floor's own `searchFloorDb`; the earlier mark only for the same Anchor_Kind |

## Correctness properties

Every property is universal, with a new random fast-check seed on every run, unless it says otherwise. The brief lists seven properties; CP1 to CP6 are the first six, and the seventh, "Accuracy is kept", is the existing accuracy properties under "Existing properties", not a new file.

The **arbitraries** (`audible-start-arbitraries.ts`) draw: a visitor script of the visit flow's arbitraries, now with a calibration target from the Keep_Minimum to the Control_Top and a calibration made by drags, presses or both; a practice behaviour (how many tries before going on, from 0 to 2; going on at once by default); listeners from the Plausible and Attentive ranges, the Extreme_Listeners (the never-answering one among them), a Step_Listener, a listener deaf on one side, a listener that misses only at the top, and a `fc.func` listener; a reported latency (null, NaN, negative, 0 to 800 ms); for CP6 a music fixture (crest 3 to 25 dB, rate 22 050 to 96 000 Hz) and a control path (targets at times from 0 to 60 s, any number including NaN and ±Infinity, with keep, close, `stopAll`, hidden, interrupted, `deviceChanged`, `pageLeft`).

**CP1. Never louder than allowed, never a jump** (300 room runs and 50 whole visits; R14, R20; brief property 1). Over room runs on the output shell harness with the manual timer and over whole visits through the visit flow's harness, quick and full, with every listener above: every practice sound and trial is at most its run's Search_Cap and at most `capRelativeToAnchorDb`; on each ear within a run, each sound's asked level and each applied gain is at most one `upwardStepDb` above the one before on that ear, across practice, every try again and the search; `beginRoom` comes before the first sound of every run; the same in the Repeat_Run.

**CP2. The search starts from what was heard** (1000 pure runs and 50 whole visits; R14.8, R14.9; brief property 2). For every finished attempt whose counting began: each ear with a practice catch at level L has as its first search trial the level `min(searchCapDb, max(searchFloorDb, L − downwardStepDb))`, equal to `searchStartLevelDb[ear]`; each ear that went on has no search trial, `searchStartLevelDb[ear]` null and the result `worseThanCap` with every count 0. The pure runs compose `createRoomPractice` and the engine with every listener; the visits check the log.

**CP3. Nothing below the playable floor** (300 room runs and 50 whole visits; R12, R13; brief property 3). With every setting that can be kept, drawn from the Keep_Minimum to the Control_Top of the music and of the hiss: every practice sound and trial asks for and is played at a level at least `searchFloorDb`, which is at least `roomFloorLevelDb`; the RMS of the non-zero channel of every scheduled ghost sound is at least `playableRmsMinFraction × decibelsToGain(−levelToleranceDb)`; no found threshold is below `searchFloorDb`; a `keepCalibration` below the Keep_Minimum is refused `systemVolumeHigh`; at every setting that can be kept, every room's Search_Floor is at most `−playableRangeBelowAnchorMinDb`.

**CP4. Practice does not count** (50 whole visits and 300 drawn logs; R16; brief property 4). For every visit that reaches the result, and for logs drawn with practice: `summarizeVisit(log)` deep-equals `summarizeVisit` of the log without `practice`; so do `missedSoundReplayPlan` and `resultPicture` of the result; the threshold, the four counts and the false alarm rate of every room are those the engine gives from the attempt's scored trials alone; no practice sound is in `trials`, `ignoredAnswers` or `refusedPlays`, and every one is in `practice`.

**CP5. A silent listener is told** (100 room runs and 30 whole visits; R15; brief property 5). For a listener that never answers, and for a listener deaf on one side: in every room, the pause `practiceNotHeard` begins after at most 2 × ((Search_Cap − `practiceStartLevelDb`) / `upwardStepDb` + `capMissesForWorseThanCapCount`) practice sounds in one round (6 at a cap of 5, 4 at a cap of 0), with `notHeardEars` the silent sides and `notHeardLines` naming them; while it holds nothing is scheduled; after `resume` a new round holds the same bound; after `goOnWithoutPractice` the room finishes, the silent sides `worseThanCap`, and the visit reaches the result.

**CP6. The music is safe** (300 runs; R5; brief property 6). On the output shell with the Fake_Backend, the manual timer, a music fixture and a control path: every output sample bound, the fixture's peak × the level gain × the fade gain, is at most `ceilingFraction` at every moment; over any two moments t1 < t2 of the recorded automation, the level in dB rises by at most `calibrationRiseMaxDb × (t2 − t1) / calibrationMusicRisePeriodMs` (plus 10⁻⁹ dB); the first level of every start is `calibrationSettingMinDb`; every start fades in from exact zero over at least `fadeMinMs` and every stop fades out to exact zero over at least `fadeMinMs`; the music stops at keep, close, `stopAll`, hidden, interrupted, `deviceChanged` and `pageLeft`; both channels are equal; no other sound is scheduled while it plays; the Played_Setting never exceeds the Control_Top; a fixture whose Music_Top would be below Keep_Minimum + 10 gives `hiss`; a load that fails or exceeds `calibrationMusicLoadMaxMs` gives `hiss`, and the hiss repeats then play as audio-output CP9 says.

**CP7. The calibration target** (300 runs; R3). For any sequence of `setCalibrationTarget`, `louder`, `quieter` and stops at drawn times, with the hiss repeats: every played setting is on the grid, the first of each calibration is the bottom, each is at most 5 dB above the one before; `targetSettingDb` is always on the grid within the control; NaN changes nothing; ±Infinity give the ends; a target set before the start leaves the target at the bottom after it; `louder` and `quieter` give what they gave before this spec.

**CP8. The practice screen leaks nothing** (100 whole visits; R17). Every `room` snapshot names no side of an unscored sound; `practice.soundPlaying` is true exactly from a practice sound's presentation to its scoring or discarding; every practice sound of a run is presented before its first counted trial; from `countingStarted` to the end of the run, the snapshot does not change between a trial's presentation and its scoring and only `trialScored` events are handed out; `practiceSoundScored` comes in the step that scores its practice sound; the same in the Repeat_Run.

**CP9. Safe wording** (500 runs; R7, R18, R22; `wording.md`). Every string of `calibrationCopy`, `practiceCopy`, `practice-lines.ts`, `playableFloorLine`, the new pause lines and of the new views, events and picture lines, for every room, side, phase and Calibration_Sound: no banned term; no "hand"; "wireless" or "Bluetooth" only in the Floor_Line; every `\d+ dB` followed by "quieter than your calibration" or "louder than your calibration"; no word of threat (kill, die, dead, blood, scream, hurt, attack); no word of blame (fail, failed, wrong, bad, poor); none empty or with white space at an end.

**CP10. Saved visits and anchors** (300 runs; R11). A payload written before this spec reads with every new field absent and everything else as `parseSavedVisitPayload` gives it today; a payload with the new fields round-trips; a payload whose new fields break a rule of "Checking a payload" is unreadable and never throws; `resultPicture` gives earlier marks only between floors of one Anchor_Kind, and `comparison` null when there is none; `findEarlierVisit` never returns a `hands` visit for a live visit or a `music` or `hiss` saved visit; `playableFloorLine` follows R22 for live and saved visits.

**CP11. The latency window** (200 room runs; R21). With a reported latency of null, NaN, negative, 0 to 800 ms: every window of the run, practice included, is `responseWindowMs + min(responseWindowLatencyMaxMs, max(0, latency))` long, logged as the attempt's `responseWindowMs`; an answer inside it scores, one at or after its end does not; the Window_Start is as `soundWindowStartMs` gives it.

**CP12. Whole visits** (30 runs; R1, R14 to R22, R27). A quick and a full visit with the simulated visitor, the music or its fallback, practice and its pauses, through the visit flow's harness: the visit reaches the result; every room began with practice and the counting; every room's first practice sound was at the anchor; the log's practice, floors, starts and windows are present and consistent; the result's picture has a Floor_Line exactly where R22 says.

The other checks are examples: each pure helper; the config values and guards; the copy; the controller with music, loading and fallback on the manual timer; the room runner's practice states; each row of "What each new command accepts" in `create-visit-flow.test.ts`; `audible-start-simulated-visits.test.ts`, which plays a quick and a full visit with an Attentive listener, one with a one-sided silent listener that goes on, and one in which the music cannot be loaded.

## Measurements

**The music** and **the hiss at the anchor**: "The calibration music".

**Accuracy with practice and the lower cap.** Measured on 2026-11-16 with a script outside the working tree that imported the shipped engine and listener tools, removed afterwards. It ran CP2's 100 Plausible sets (fast-check seed 20261116) and CP3's 50 Attentive sets (seed 20261117), 400 rooms each, with `classifyAccuracy`. Practice was modelled as R14 gives it (anchor, +5 dB to the cap, 2 misses at the cap), each ear's search from its own start (each ear run in its own search with that start, which is how the engine treats ears that do not share trials), and an unheard ear counted `worseThanCap`.

| Settings | CP2 sets below 93 % | CP2 worst set | CP3 sets failing | CP3 worst set (Accurate) |
|---|---|---|---|---|
| Today: start −25, cap 15, floor −70 | 1 of 100 (the expected break) | 92.5 % | 0 of 50 | 93.0 % |
| Start −25, cap 5 | 0 | 93.6 % | 0 | 93.4 % |
| Practice, cap 5, floor −70 | 0 | 96.0 % | 0 | 95.6 % |
| Practice, cap 5, floor −50 | 0 | 95.6 % | 0 | 93.5 % |
| Practice, cap 5, floor −30 | 0 | 93.3 % | 0 | 93.9 % |

Overall over the Plausible sets with practice, cap 5 and floor −70: 57.4 % Accurate, 41.1 % Flagged, 1.5 % Wrong (today 53.4, 44.6, 2.0). So by this estimate no accuracy property loses its tolerance, and CP2 may hold where it did not (D35). The estimate is not the property: task 11 runs the real ones.

## Error handling

| Situation | Behaviour |
|---|---|
| `setCalibrationTarget` with NaN, a string, undefined | nothing changes |
| `setCalibrationTarget` outside calibration or during a pause | ignored |
| The music fetch rejects, gives a status that is not OK, or decoding rejects | `hiss` for the life of the shell; the visitor reads the hiss lines and nothing about the failure |
| Decoded samples empty, silent or not finite | `hiss` |
| Music_Top below Keep_Minimum + 10 dB | `hiss` |
| No samples after 10 s | `hiss`; a later result is dropped |
| The context closes during loading (page left) | the load's result is kept if it arrives; a new context after `activate` plays it |
| The music is started before the shell runs, outside calibration, or while another sound ends | refused `notRunning`, `notCalibrating` or `busy`; the controller tries again after `calibrationRepeatGapMs` on `busy`, as for repeats |
| A timer step fires before the previous ramp has ended on the audio clock | the step waits for the remainder and does nothing else |
| A keep while the music still rises | keeps the Played_Setting reached, rounded down to the grid |
| A practice sound refused | the room runner's rule (D38) |
| A device change during practice or during the pause `practiceNotHeard` | the attempt is abandoned; calibration again; the room starts again with practice |
| A pause during practice | the practice sound is discarded and played again after its gap |
| `goOnWithoutPractice` outside the pause `practiceNotHeard` | ignored |
| Both ears go on | the room finishes at once, both `worseThanCap` |
| A Search_Cap of 0 | the ladder holds one level, 0; two misses there end an ear unheard |
| `outputLatency` missing, NaN or negative | null; no allowance |
| `outputLatency` above 500 ms | the allowance is 500 ms; the reported value is logged |
| A saved payload with a new field that breaks its rule | unreadable, never throws |
| An earlier visit of another Anchor_Kind | no earlier mark; `comparison` null if no floor matches |

## Testing strategy

### Shells, timers and visits

The pure properties (CP2's pure part, CP7's helper part, CP9, CP10) need no shell. CP1, CP3, CP5, CP11 and the room-level parts run on `tests/properties/output-shell-harness.ts`: a real output shell on the Fake_Backend, calibrated, with the manual timer and the worst-case renderers through `vi.mock`, and a room runner built as the flow builds it. CP6 runs a shell alone. CP4, CP8, CP12 and the whole-visit parts use `tests/properties/visit-flow-harness.ts` and the Simulated_Visitor, whose music load the test resolves with a fixture or rejects.

### Run counts and time

The run counts are those of "Correctness properties" (D36). Estimates before the files exist, not measured: CP2, CP7, CP9 and CP10 a few seconds each; CP1, CP3, CP5, CP11 5 to 15 s each, since each room run renders 10 to 60 worst-case sounds; CP6 5 to 10 s; CP4, CP8, CP12 10 to 25 s each, as the visit flow's whole-visit properties took 3 to 9 s for 50 visits and practice adds a few sounds a room. Together perhaps 60 to 150 s in `npm test` with the other files in parallel.

The budget follows the rule the owner chose for the replay on 2026-11-15, as the swapped repeat did: this spec's property files must take together at most the slowest of three runs of `npm test` with every one of them present, plus about three tenths, rounded up to a multiple of 15 seconds, on the project machine when nothing else heavy runs on it. The time of a file is the sum of its test durations in Vitest's JSON reporter, without its import. No task before the last can know the budget, so each task that adds property files runs `npm test` three times and records the times here, and does not stop because of time; the last task computes the budget and reports it. Every property file has a timeout of 120 seconds. No task lowers a run count.

Measured times:

| Task | Date | File | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|---|
| 1 | 2026-11-16 | `audible-start-cp7-calibration-target.property.test.ts` (controller 1.18, 1.33, 1.42 s; visit flow 5.15, 5.23, 5.29 s) | 6.33 s | 6.56 s | 6.71 s |
| 1 | 2026-11-16 | Sum of this spec's property files | 6.33 s | 6.56 s | 6.71 s |
| 1 | 2026-11-16 | The whole of `npm test` | 74.4 s | 81.5 s | 82.4 s |
| 3 | 2026-11-16 | `audible-start-cp6-music-is-safe.property.test.ts` | 17.08 s | 18.90 s | 18.55 s |
| 3 | 2026-11-16 | `audible-start-cp7-calibration-target.property.test.ts` | 5.97 s | 6.41 s | 5.87 s |
| 3 | 2026-11-16 | Sum of this spec's property files | 23.05 s | 25.32 s | 24.42 s |
| 3 | 2026-11-16 | The whole of `npm test` | 78.0 s | 83.5 s | 85.1 s |
| 7 | 2026-11-16 | `audible-start-cp6-music-is-safe.property.test.ts` | 15.83 s | 18.78 s | 19.02 s |
| 7 | 2026-11-16 | `audible-start-cp7-calibration-target.property.test.ts` | 5.69 s | 5.58 s | 6.59 s |
| 7 | 2026-11-16 | `audible-start-cp10-saved-visits-and-anchors.property.test.ts` (anchor and payload parts) | 0.44 s | 0.42 s | 0.43 s |
| 7 | 2026-11-16 | Sum of this spec's property files | 21.97 s | 24.78 s | 26.03 s |
| 7 | 2026-11-16 | The whole of `npm test` | 76.5 s | 82.7 s | 85.8 s |

Task 1: the machine ran nothing else heavy; the load came from the three runs themselves (load average 10.4 on 8 cores after the third).

Task 3: the machine ran nothing else heavy (load average 1.6 on 8 cores before the first run); the load came from the three runs themselves (8.6 after the third).

Task 7: the machine ran nothing else heavy (load average 2.3 on 8 cores before the first run); the load came from the three runs themselves (9.7 after the third). From task 4 on, the whole-visit properties calibrate with the harness's music fixture.

### Counterexamples

A counterexample becomes a named case in `tests/properties/audible-start-regressions.test.ts`, `regression <n>: <what went wrong> (<property>, seed <s>)`, written out and first with `it.fails`. The task stops there and reports it, so that the case and the fix go in separate commits (`tech.md`). A property is never weakened to pass. A case that only an owner's choice or a steering value could remove stays an expected break and is reported with its question. A counterexample of an existing accuracy property stops the task with the property and the amount by which it misses (R24.2).

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | `visit-flow-types.test.ts`, `result-page-types.test.ts`; `audible-start-types-match.test.ts`; `npm run typecheck` with the owner's files unchanged |
| R2 | the config tests and guards; the final task's search for numbers |
| R3 | `calibration-target-setting.test.ts`; `calibration-controller.test.ts`; `create-visit-flow.test.ts`; CP7 |
| R4 | `create-audio-output.test.ts` (loading, once, fallback, time-out); `measure-calibration-music.test.ts`; `calibration-music-top.test.ts`; CP6 |
| R5 | `next-calibration-music-setting.test.ts`; `create-audio-output.test.ts`; CP6 |
| R6 | `calibration-controller.test.ts`; CP6; audio-output CP9 |
| R7 | `calibration-copy` cases in `output-copy.test.ts`; `npm run check:copy`; CP9; the search for "hands" and "hiss" |
| R8 | review of the steering against "The anchor"; `create-visit-flow.test.ts` (the anchor kind logged) |
| R9 | `git diff .kiro/steering/audio-safety.md` adds one paragraph and removes nothing |
| R10 | `hearing-method-config.test.ts`; `room-top-level.test.ts`; `missed-sound-replay-plan.test.ts`; the existing properties |
| R11 | `saved-visit-payload.test.ts`; `calibration-anchor.test.ts`; `result-picture.test.ts`; `find-earlier-visit.test.ts`; CP10 |
| R12 | `room-floor-level.test.ts`; `room-search-floor.test.ts`; `range-report.test.ts`; `summarize-visit.test.ts`; `result-picture.test.ts`; `create-swapped-repeat.test.ts`; CP3 |
| R13 | `audio-output-config.test.ts`; `create-audio-output.test.ts`; CP3 |
| R14 | `room-practice.test.ts`; `search-starting-levels.test.ts`; `room-runner.test.ts`; `ear-search.test.ts`; CP1; CP2 |
| R15 | `room-runner.test.ts`; `create-visit-flow.test.ts`; CP5 |
| R16 | `visit-log-recorder.test.ts`; CP4 |
| R17 | `room-practice-view.test.ts`; CP8 |
| R18 | `practice-copy.test.ts`; CP9 |
| R19 | `create-swapped-repeat.test.ts`; `swapped-repeat-run.test.ts`; the swapped repeat's properties; CP1; CP8 |
| R20 | CP1; "Audio safety during practice"; the output stage's properties |
| R21 | `response-window-ms.test.ts`; `room-runner.test.ts`; CP11 |
| R22 | `playable-floor-ears.test.ts`; `playable-floor-lines.test.ts`; `result-picture.test.ts`; CP10; CP12 |
| R23 | review of "Bluetooth" |
| R24 | the property files; the existing properties; the regressions; the times below |
| R25 | `visit-length-measurement.ts` and its print script; "Visit lengths" |
| R26 | review of the steering against "Steering" |
| R27 | `simulated-visitor.test.ts`; `practise-for-search.test.ts` |
| R28 | the final task's `git status` and search |

## How the design serves the steering

| Rule | How |
|---|---|
| audio-safety 1 | Practice through `output.play`; the music through the output stage's loop, which plays nothing else |
| audio-safety 2 | The cap at 5 dB; practice at most the Search_Cap; the music's gain at most `ceilingFraction / peak` and its setting at most the Control_Top |
| audio-safety 3 | The output fade on practice sounds; the music's raised-cosine fade in and its stop fade |
| audio-safety 4 | "Rule 4 in practice"; the music rises at most 5 dB in 2 s, as the approved exception says |
| audio-safety 5 | One channel per practice sound; no keep-alive signal; the music in both channels only during calibration |
| audio-safety 6 | Every ghost, check and replay sound still at most 1.5 s; the music is the one exception, approved by the owner on 2026-11-16 |
| audio-safety 7 | The stop control in practice and calibration; the music stops on every stop, hidden page, left page and device change |
| audio-safety 8 | The kept line unchanged |
| audio-safety 9 | Practice at a comfortable level; the copy threatens nothing |
| product, what the result may claim | "The anchor": left against right and the same person later both survive; the music claims nothing more |
| product, nothing reveals a sound before the answer | The one exception, for practice, written into `product.md` with its reason; counted trials as before (CP8) |
| product, followable without headphones | A ripple and a label for every caught practice sound and trial |
| wording | CP9; `check:copy`; no "hand", "wireless" only in the Floor_Line; levels relative to the calibration |
| hearing-method | Practice as familiarization, with its source and its departure; the floor and the cap in the table |
| structure | Pure helpers in `audio/output` and `session`; numbers in `src/config`; strings in `src/copy`; `Db`, `Ms`, `Fraction` endings |
| tech | The context created in a press and the music decoded with it; the sample rate from the context; time and randomness injected; the music's path tested under Node; no network request but the site's own file |

No steering value is loosened. The cap is made stricter, the Keep_Minimum is made stricter, and the one exception to rule 6 is the one the owner approved.

## Steering

The tasks make these edits, word for word. Nothing else in the steering changes.

### `.kiro/steering/audio-safety.md`

Under the list item of rule 6, as a paragraph indented by three spaces so that it belongs to item 6, the sentence of "The exception to rule 6". No other line changes (task 5).

### `.kiro/steering/hearing-method.md`

"Level scale" becomes the two paragraphs of "The anchor" (task 5).

The row "Loudest allowed level" of the Initial values table becomes (task 6): `| Loudest allowed level | 5 dB above the anchor. Lowered from 15 dB on 2026-11-16: the anchor is now a comfortable music volume, likely louder than rubbed hands, and the lower cap keeps the loudest sound no louder at the ear than before |`

A new section after "The search" and before "Level scale" (task 21):

> ## Practice
>
> Each room begins with practice, the familiarization step of the procedure the search follows. Practice plays the room's own sound to one ear at a time, in random order, and the visitor names the side, as in the search. Practice has no no-sound trials and counts for nothing.
>
> - Each ear's practice begins at the anchor. After a practice sound the visitor does not catch on its side, the next one for that ear is one upward step louder, up to the room's top.
> - An ear's practice ends at its first catch. That ear's search then begins one downward step (10 dB) below the level of that catch, within the room's playable floor and its top.
> - An ear that does not catch the practice sound at the room's top on 2 presentations ends its practice unheard. When every ear's practice has ended and one ended unheard, the visitor is told what to check and may hear the practice again or go on. Going on records that ear on that floor as worse than cap.
> - Practice sounds are logged as practice. They are not part of the threshold, the catch counts, the false alarm rate, the missed-sound replay or the picture.
>
> Source: the ASHA guideline (2005) cited above, read again on 2026-11-16. It says that "The basic procedure for threshold determination consists of (a) familiarization with the test signal and (b) threshold measurement", that the purpose of familiarization "is to assure the audiologist that the participant understands and can perform the response task", and that the participant "should be familiarized with the task before threshold determination by presenting a signal of sufficient intensity to evoke a clear response". One of its methods presents a tone at a set level and raises it until a response occurs. It recommends repeating familiarization at other frequencies when responses are inconsistent. For the threshold measurement it says "After the response, the intensity is decreased 10 dB, and another ascending series is begun", which is how the search treats the practice catch. It also says "The level of the first presentation of the test tone shall be well below the expected threshold". The product does not follow that sentence: its search starts at a level that is usually heard and comes down, as it did before practice was added.

In "When a search cannot finish honestly", the two bullets become (task 21):

> - **better than floor**: the visitor still caught the quietest sound the product will play in that room with that calibration, its playable floor. Report "quieter than this house can whisper" and no number, and say that this is as quiet as the house can play through these headphones at this volume
> - **worse than cap**: the visitor did not catch the loudest sound the product is allowed to play in that room, in the search, or twice in practice before going on. Report that plainly and no number

In "Known limits to keep in mind", the Bluetooth bullet becomes (task 21):

> - Bluetooth headphones carry about 16 bits and may gate, cut or reshape very quiet sounds. So the house does not play or count on a sound below a room's playable floor: the higher of the quietest playable level and the level at which a sound's RMS is 84 dB below full scale with the visitor's calibration, about one bit above one step of a 16-bit path. That value comes from arithmetic; a listening session with the listening page settles it. A result at that floor, or within one step of it, says that this is as quiet as the house can play through these headphones at this volume.

In the Initial values table (task 21): the row "Starting level" is removed; "Response window after a sound starts" becomes `2.0 s, ending later by the output latency the browser reports, at most 0.5 s later`; "Quietest playable level" becomes `70 dB below the anchor, or higher: the level at which a sound's RMS is 84 dB below full scale with the visitor's calibration (the playable floor)`; and after "Upward step after a miss" come four rows:

```
| Practice: first level | the anchor |
| Practice: after a practice sound not caught | one upward step louder, up to the room's top |
| Practice sounds not caught at the room's top before the visitor is told | 2 |
| First level of an ear's search | one downward step (10 dB) below its practice catch, within the room's playable floor and top |
```

### `.kiro/steering/product.md`

Step 2 becomes the text of "The anchor" (task 5). In "Experience rules", the second bullet becomes (task 21):

> - Before the visitor answers, nothing on screen may reveal when a sound plays or which side it is on. The one exception is the practice at the start of each room: while a practice sound plays, the screen says that a sound is playing now, never which side. Practice counts for nothing, comes before every counted sound of the room, and is there so that the visitor knows the house and the headphones work and what to do.

If the visit lengths change (R25), step 1 and the comment of `VisitType` change with them (task 20).

## Visit lengths

Visit-flow Q3 named the visits from the median rooms of the plausible range ("How long the rooms take": 3000 listeners per range, five rooms each, seed 20261203, the steering's gaps and window, the 50 ms scheduling lead, 700 ms to answer a caught sound or a false alarm and the full window otherwise) plus the replay's median length (missed-sound-replay "Measurements": 30.2 s quick, 30.5 s full), rounded up to a whole minute: 7 and 12 minutes. That measurement was made inline and not kept.

`tests/listeners/visit-length-measurement.ts` does it again as a function, and `print-visit-length-measurement.ts` prints it (D37): the same listeners, seed, timing and replay figures, with practice before each room's search (each practice sound timed as a trial: its gap, the lead, 700 ms for an answer and the full window otherwise; a visitor told Not_Heard goes on at once, and the count of such rooms is printed), the cap of 5, and each room's Search_Floor and Search_Cap at three settings: the Keep_Minimum (−27), the middle (−16) and the music's Control_Top (−5). It prints each with the latency allowance 0 and 500 ms. The names follow the plausible median at the middle setting with no allowance, rounded up as visit-flow Q3 did. Task 20 runs it, writes the table here, and changes the names only if a rounded length is not 7 or 12.

Not yet measured.

## What the owner builds

Outside this spec's tasks, by hand:

- **The calibration screen.** The heading, `introLines` and `line` from the snapshot, in place of `calibrationCopy.openLine` and the `visitCopy` headings. A control that can be dragged and calls `setCalibrationTarget(settingDb)`, its thumb at `targetSettingDb` and the played setting shown from `playedSettingDb`, so that the visitor sees the music catch up. The keys of `calibration-action-for-key.ts`: a move of n steps is `setCalibrationTarget(targetSettingDb + n × calibrationSettingStepDb)`, an end is `setCalibrationTarget(controlBottomDb)` or `(controlTopDb)`, as the keys line says. While `calibrationSound` is `loading`, `line` says so; the start control still works. `controlTopDb` may move from −4 to −5 when the music is ready.
- **The room's practice.** From `snapshot.practice` and the repeat's `repeat.practice`: in `practice`, the heading, the lines, and `soundPlayingLine` while `soundPlaying`, never anything that names a side; in `notHeard`, the heading, `notHeardLines` and two controls, `goOnLabel` ("Start counting") first and lit, calling `goOnWithoutPractice`, then the quieter `tryAgainLabel` calling `resume` (a press); in `counting`, the counting line, unchanged until the room ends. The visible stop control in every phase. The ripple of `practiceSoundScored` with the reaction `ripple`, on `trial.ear`, labelled with `event.line`.
- **The result page.** `floor.playableFloorLine` beside the floor when it is not null, and in the floor's words for a visitor who cannot see the picture.
- **The listening page.** It may show each room's `floorLevelDb` from the range report and each row's `playableFloorLevelDb`, so that a listening session can find where the owner's headphones stop.
- **The screen-leak property** (`tests/properties/screen-leak/`): once the screen draws practice, the counted part of a room starts at `countingStarted` (and the repeat's), as `roomStarted` starts it today; the screen changes during practice are allowed by the new exception of `product.md`.
- **The browser tests and manual checks.** On a real browser: that the music loads and loops without a click at the seam (Q40); that it starts very quietly and follows the control; that Stop, hiding the tab and keeping the setting stop it at once; that a failed load (block the file in the developer tools) gives the hiss lines; Safari on iOS and Chrome on Android decode the AAC file. Playwright's Chromium may be built without the AAC decoder; then the e2e visits run on the hiss fallback.

What the visitor sees until the owner's screen reads the new fields:

- **Calibration.** The owner's page shows the music's opening paragraph and headings (the rewritten constants), its louder and quieter buttons move the target one step, and the music rises a little at a time. On the hiss fallback the page shows the music's opening paragraph with the hiss's line below it.
- **Practice.** The lit room as today, with practice sounds and no text about practice. A caught practice sound gives no ripple. When a side is not heard, the owner's pause notice shows "The house is waiting", the not-heard line and its button "Go on", which plays the practice again; going on without practice is not offered until the owner draws it, and the visitor can stop.
- **The result.** No Floor_Line.

The owner's files that stop compiling or passing when the contracts grow:

- **Compiling: none.** Every field added to a type an Owner_Literal builds is optional (D29); every union only gains members, and no owner file switches over `PauseReason` or `VisitEvent["kind"]` exhaustively (searched in `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`).
- **May stop passing:**
  - `tests/properties/screen-leak/screen-leak.property.test.ts`: checks 1, 2 and 5 say the page changes at decisions only. The pause notice of `practiceNotHeard` is a change before the first counted decision of a room, in the visits where a drawn listener misses the practice sound twice at the top. Check 3's fixed seeds play different visits, because rooms now begin with practice. The owner restates them with `countingStarted` as the start of the counted part.
  - `tests/e2e/listening-page.spec.ts`: "hands Web Audio only buffers within the ceiling, the first a quiet calibration repeat" expects hiss repeats; with the music the first sound is the loop. Its press count to the Keep_Minimum reads the config and follows −27.
  - `tests/e2e/visit-steps.ts`, `visit.spec.ts`, `whole-visit.spec.ts`, `whole-swapped-repeat.spec.ts`, `swapped-repeat.spec.ts`: the music rises at 2.5 dB/s rather than per repeat; every room begins with practice sounds, which their robot listener does not know, so their timing and their counts of sounds change.
  - `tests/e2e/front-door.spec.ts` and the owner's pages, only if task 20 renames the visits.
  - `src/ui/visit/screen-of-snapshot.test.ts` and `src/ui/result/picture-sheet.test.ts`: compile and pass, because they read none of the new fields.
- **Not the owner's files, but the owner's text:** the root `README.md` line 9 says "match the hiss to their hands"; `src/ui/README.md` says the listening page "starts with a very quiet hiss".

## Questions for the project owner

Every question below but Q39, Q41 and Q42 was decided by the owner's coordinator on 2026-11-16, at the owner's request, with the option marked; the owner may reverse each. Each is the option that changes least and keeps every audio-safety rule. Q39 to Q42 are FOR THE OWNER: they need a person to listen.

**Q1. What a target between grid settings, beyond the ends, or NaN does. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Rounded down to the grid, held at the ends, NaN ignored. (b) Kept between grid settings, so that the music stops between steps. Reason: (a) is what `nextCalibrationSettingDb` does with a request, so the control has one grid, and never sets a sound louder than asked.

**Q3. A target set before the sound starts. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Accepted, and `open()` puts the target at the bottom as it does today. (b) Kept, so that the sound starts at the bottom and rises to it at once. Reason: (a) changes no behaviour of `open()`, and the owner's screen offers the control only once the sound plays.

**Q4. When and from which press the music is fetched, and what the visitor sees meanwhile. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) From the press that first creates the audio context (the choice of a visit), with a 10 s limit, the line "The music is on its way.", and the start press remembered. (b) From the start press of calibration, with the visitor waiting there. (c) At page load. Reason: (a) gives the file the time the visitor spends reading the calibration screen; (c) fetches for visitors who never enter, and decoding needs a context, which only a press may create (`tech.md`).

**Q6. The steps of the music's level. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Steps of 100 ms, each an exponential ramp of at most 0.25 dB, none before the last has ended on the audio clock, falls within one step. (b) One long ramp to the target at 2.5 dB/s, cancelled on each change. Reason: (a) bounds the rate by construction whatever the timer does; (b) needs Web Audio's cancel-and-hold, which browsers implement unevenly.

**Q7. The top of the control with the music. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Worked out from the decoded peak: −5 dB with this file; the hiss's −4 dB stays for the hiss. (b) A fixed bound of the music's crest factor in config (19 dB would give −6). Reason: the file is fixed, not random, so its measured peak is exact, as the brief asks ("measures its RMS and peak from the decoded samples"); (b) costs a decibel of range for no safety, since the ceiling acts on the measured peak either way.

**Q8. How the numbers of the file are reproduced. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) A tool script that decodes with ffmpeg into memory and prints the numbers, and pure functions tested on samples made in code. (b) A decoded test fixture in the repository. Reason: the brief forbids adding or converting an audio file; (a) needs ffmpeg only on the machine that runs the tool, and `npm test` needs nothing.

**Q9. The fewest settings a music file must leave to be used. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) 10 dB above the Keep_Minimum, the brief's own figure, else the hiss. (b) Any top at or above the Keep_Minimum. Reason: the brief names 10 dB as the least range of settings worth keeping.

**Q10. Loading once, and the fallback for the rest of the page. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) One load per page; after a failure the hiss for the life of the page. (b) Try again at every calibration. Reason: (a) keeps one Anchor_Kind for all visits of a page and asks the network once.

**Q11. Where practice lives. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) A step of the room runner before the search, its rule a pure module in `src/session`, and the engine gaining per-ear starts. (b) A phase of the engine's search. Reason: (a) leaves the engine's search, its records and its properties as they are; (b) would put try again and go on, which are not responses, into the engine and interleave practice with the search's trial numbers.

**Q12. How many practice sounds at the top before the visitor is told. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) 2, the count that ends a search as worse than cap, read from `capMissesForWorseThanCapCount`. (b) 1. (c) 3. Reason: going on records "worse than cap", and (a) records it on the evidence the search needs for that state; no new number.

**Q13. Practice order, gaps and answers. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) A random ear among those still practising, the search's gap range, both from the visit's sound source; a wrong side counts as not caught; an answer with no sound playing is logged and changes nothing. (b) Alternate ears. (c) Keep caught ears in the draw, at their catch level, so that the side stays unknown to the end. Reason: (a) is the search's own rules; (b) lets a visitor answer by pattern; (c) adds sounds to every room for no gain, since practice counts nothing.

**Q14. When the visitor is told, and what try again and go on do. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) When every ear's practice has ended and one is unheard; a pause `practiceNotHeard`; `resume` plays the practice again for the unheard ears from the anchor; `goOnWithoutPractice` goes on. (b) As soon as one ear is unheard, with the other ear's practice halted. (c) A view field only, with no pause. Reason: (a) reaches the message within 6 sounds and asks once per round; the pause lets the owner's current screen tell the visitor at once (D14), which (c) would not.

**Q15. How the engine gets per-ear starts. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) `startingLevelsDb` in the settings, replacing `startingLevelDb`, with null for an unheard ear. (b) A second argument of `createThresholdSearch`. Reason: (a) keeps every input in the validated, frozen settings, as today.

**Q16. How an ear that goes on is recorded. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) The engine starts it ended as worse than cap with every count 0. (b) The session builds that ear's result itself. Reason: with (a) the room result comes from the engine as every other, and the false alarm rule acts on it as on any ear.

**Q18. Where practice is logged. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) An optional `practice` field of the log with its own lists. (b) The log's `trials` with a flag. Reason: (a) leaves every reader of `trials` counting what it counted, which is what "Practice does not count" asks.

**Q19. When the screen says a practice sound plays. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) From its presentation to its scoring. (b) From its start to its end on the audio clock. Reason: (a) needs no timer of its own and covers the sound and its window.

**Q20. Two new events. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) `practiceSoundScored` with a ripple for a catch, and `countingStarted`. (b) None. Reason: `product.md` asks for a ripple for every caught sound, and the screen-leak property needs to know where the counted part starts.

**Q24. The playable RMS as a fraction. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) `playableRmsMinFraction`, as `ceilingFraction` and the range report's `floorRmsFraction` are. (b) A positive number of dB below full scale. Reason: (a) compares with the range report directly and fits the config's unit endings.

**Q26. Which anchors are compared. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Three kinds, `hands`, `music` and `hiss`, compared only within one kind. (b) `music` and `hiss` treated as one kind. Reason: the same visitor may choose a comfortable hiss several decibels away from a comfortable piece of music, which would shift every floor of the later visit; (a) is stricter.

**Q27. The result line per floor and when. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) One line per floor naming the ears, for `betterThanFloor` or `found` within one upward step of the floor. (b) One line per ear. Reason: (a) says it once where both ears reach the floor.

**Q28. When the latency is read and how it is used. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Read at keep, logged with the calibration, and only the window's end moved. (b) Read at every trial. (c) The window's start moved as well. Reason: (a) is logged once and stays the same within a calibration; (c) could drop an early answer.

**Q29. Optional fields. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Every field added to a type an Owner_Literal builds is optional. (b) Required fields, with the owner's literals cast before task 1. Reason: the owner's files then compile after every task without being touched; (b) is cleaner once the owner has cast their literals, and can follow later.

**Q30. Landing the contract. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Each task adds the part it builds, with the names of this design. (b) One task lands all of it first, with stand-ins. Reason: the order of the tasks is fixed by the request, starting with the calibration target; the names are final here either way.

**Q31. The latency limit. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) 500 ms. (b) 300 ms. (c) None. Reason: it only lengthens a window and plays nothing; (c) would let a wrong report stretch every trial; the value has no measured source.

**Q32. The calibration copy. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) The music's lines in the existing constants, the hiss's in `calibrationCopy.hiss`, the keys line as the owner's key handling works today. (b) New constants only, the old ones removed. Reason: (a) shows the new text on the owner's page at once and breaks nothing; the keys line must follow the owner's keys if they change.

**Q34. The listening page. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) It calibrates with the music like the visit, its rows start at the practice level, and its lowest level stays the fixed floor. (b) It keeps the hiss repeats. Reason: a listening session meant to settle the playable floor (Q39) needs the visit's anchor, and must be able to play below the floor to find it.

**Q35. The engine's accuracy properties and its regressions. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) CP1 to CP3 with the shipped settings and starts from practice with each room's own listener; regressions with the settings they were found with; CP2's skip removed if it then holds, regression 4 kept as `it.fails`. (b) CP1 to CP3 kept at a start of −25. Reason: the properties should test the search as the visit runs it now, with tolerances unchanged; the regressions keep testing the case they record.

**Q36. Run counts and the time budget. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) The counts of "Correctness properties" and the budget rule of the replay and the swapped repeat. (b) Half the counts. Reason: the rule is the owner's of 2026-11-15.

**Q37. How the visit lengths are measured and named. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) The method of visit-flow Q3, with practice, at the middle setting and no latency allowance, kept as a script. (b) At the Keep_Minimum, the longest case. Reason: (a) is the measurement the names already come from.

**Q38. Practice refusals. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: (a).** (a) Counted with the run's trials towards three in a row. (b) A count of their own. Reason: three refusals in a row mean the house cannot play, whatever the sound.

**Q39. FOR THE OWNER. The playable floor on real Bluetooth headphones.** The starting value, an RMS of 84 dB below full scale, is arithmetic: one bit above one step of a 16-bit path. Whether the owner's earbuds play a sound there, cut its start after silence, or change level by themselves, only a listening session can tell. Options: keep it; raise it, which shortens the range and is a method change, not a safety one; lower it. Use the listening page, which can play below the floor.

**Q40. The loop point of the waltz.** Decoded, the file ends at −0.081 and begins at −0.0001: a step of 0.081 at the seam, at the 99.9th percentile of the steps within the piece, and an AAC decoder may add silence at the start. Whether the loop clicks or pauses, only listening can tell. Options: keep the file; ask for a file whose ends meet; cross-fade the loop in code. None changes a safety value. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: the coordinator made a new file whose ends meet. It has a 10 ms fade at each end (`docs/licences.md`), so the decoded file begins at about 0.003 and ends at about −0.0001, a step at the seam well inside the steps within the piece. Its RMS (−19.10 dBFS) and peak (−0.71 dBFS) are unchanged. Whether an AAC decoder adds a short silence at the start is still for a listening test; a silence of a few milliseconds in a loop of 106.7 s does no harm.

**Q41. FOR THE OWNER. The music's own changes of level, and the hiss after it.** Over 1 s windows the waltz's RMS moves 6.5 dB either side of its whole RMS, so a visitor who sets the control during a quiet passage sets the anchor higher than the music sounded on average. And the hiss of the headphone check, at the same RMS, is about 3 LU louder than the music. Whether either makes the setting unstable or the check unpleasant, only listening can tell. Options: keep; ask for a file with a steadier level; play the check lower, which changes the guarded `headphoneCheckLevelDb` in the stricter direction.

**Q42. FOR THE OWNER. The first practice sound of a room.** It plays at the anchor, the visitor's own comfortable volume, after the rest between rooms; the room before may have ended near its floor, 30 to 50 dB quieter. Rule 4 applies within a room and no cap acts, but whether it startles, only listening can tell. Options: keep it, as the brief asks; begin practice lower, which the brief's "as loud as the music the visitor has just set" rules out unless the owner changes it.

### Found in the existing code

- `audio-safety-config.ts` already applies the longest-sound limit to the calibration noise (ghost-sounds D8), which is why the music needs the owner's exception.
- `calibration-controller.ts` already has `targetSettingDb` in its own snapshot; the flow's snapshot did not pass it on.
- `create-visit-flow.ts` computes `controlTopDb` once, from the hiss's top; with the music it reads the shell's Control_Top.
- `listening-page-session.ts` starts its rows at `startingLevelDb`; it moves to `practiceStartLevelDb` (Q34).
- threshold-search CP2 is skipped as an expected break (one of 100 sets at 92.5 %); by the estimate in "Measurements" it may hold with practice (Q35).
- The owner's `calibration-action-for-key.ts` is in the working tree and not yet committed; the keys line follows it as it stands.
- `output-graph.ts` says the stop gain is the only automation in the graph; the music's level and fade gains are a second and third, on the music's own source only.

### Found in the brief and the steering

- The brief lists seven properties; CP1 to CP6 and the existing accuracy properties cover them ("Correctness properties").
- The brief says practice rises "one upward step louder, up to the room's top level"; the guideline's familiarization rises 10 dB at a time. With a cap 5 dB above the anchor only one step is possible either way.
- The guideline says the first threshold presentation is "well below the expected threshold"; the search, before and after this spec, starts above it ("Practice", "What the guideline says").
- `hearing-method.md` gives "15 dB above the anchor" in its table; the cap task changes it (task 6), and the other rows change with practice (task 21), so for a few tasks the table has the new cap and the old starting level.

## Decisions

**D1. A target is rounded down to the grid and held within the control; NaN changes nothing** (Q1). The control has one grid, and no input sets a sound louder than asked.

**D2. `louder` and `quieter` go through the same function.** They compute the setting as today and pass it to `calibrationTargetSettingDb`, so their behaviour is unchanged and the rule lives once.

**D3. A target set before the sound starts is taken, and `open()` puts the target at the bottom** (Q3). Today's behaviour of `open()` is kept.

**D4. The music is loaded from the first press that creates the context, with a 10 s limit, and a start press during loading waits for it** (Q4).

**D5. The music is played by the output stage alone.** It owns the context and every limit (rule 1). Its loop takes no Sound_Id, so nothing else can loop, and every other sound is refused `busy` while it plays.

**D6. The level moves in steps of 100 ms, each an exponential ramp of at most 0.25 dB, never overlapping on the audio clock** (Q6).

**D7. The top of the control is worked out from the decoded music's peak** (Q7): −5 dB with this file, −4 dB for the hiss.

**D8. A tool script decodes the file with ffmpeg in memory** (Q8). `tools/measure-calibration-music.ts` spawns `ffmpeg -v error -i <file> -f f32le -ac 1 -ar <rate> -` for 44 100 and 48 000 Hz, reads the samples from its output into memory, measures them with `measureCalibrationMusic`, works out the top with `calibrationMusicTopDb`, and prints the table of "Measurements of the file", the loop step and the loudness of the music and of the hiss (`ffmpeg -af ebur128`, the hiss piped from `renderCalibrationHiss`). It writes no file, needs ffmpeg, and is not run by `npm test`.

**D9. A music file must leave at least 10 dB of settings to keep, else the hiss** (Q9).

**D10. The music is loaded once per page; after a failure the hiss stays** (Q10).

**D11. Practice is a step of the room runner before the search** (Q11).

**D12. Two practice sounds not caught at the top end an ear's practice unheard** (Q12).

**D13. Practice draws a random ear among those practising and a gap from the search's range, from the visit's sound source; a wrong side is not a catch; an answer with no sound playing changes nothing** (Q13).

**D14. The not-heard moment is a pause with the reason `practiceNotHeard`; `resume` plays the practice again, `goOnWithoutPractice` goes on** (Q14). The owner's current screen shows every pause as a notice with its reason's line and a button that calls `resume`, so the visitor is told at once and can try again before the owner draws the practice screen.

**D15. The engine takes a starting level per ear** (Q15).

**D16. An ear that goes on starts ended as worse than cap** (Q16).

**D17. The search starts one downward step below the practice catch.** The brief's 10 dB is `downwardStepDb`, so the practice catch acts as the search's first catch and no number is added.

**D18. Practice is logged in its own optional field** (Q18).

**D19. The room's snapshot says when a practice sound plays, from its presentation to its scoring, and practice always comes before counting** (Q19).

**D20. Two events: `practiceSoundScored` and `countingStarted`** (Q20).

**D21. The swapped repeat practises through the same room runner, on the swapped earpieces.** It runs the room again exactly as before, which now includes practice (swapped-repeat R7).

**D22. Practice sounds are trials to the output stage.** They have the Purpose `trial`, so the Rise_Limit acts on them and spans practice and search; `beginRoom` comes only at the start of a room run.

**D23. The playable floor is computed and passed on as the room's top is.**

**D24. The playable RMS is a fraction of full scale in config** (Q24).

**D25. The Keep_Minimum is −27 dB.** It is the lowest setting at which every room keeps 30 dB of playable range below the anchor ("The Keep_Minimum"). It is stricter than −40, which `audio-safety.md` allows.

**D26. Anchors are compared only within one kind; the picture checks every floor, and `findEarlierVisit` skips the hands for a visit of today** (Q26).

**D27. The Floor_Line is per floor, for `betterThanFloor` or `found` within one step of the floor** (Q27).

**D28. The latency is read at keep and moves only the window's end** (Q28).

**D29. Fields added to types the owner builds as literals are optional** (Q29).

**D30. Each task adds the part of the contract it builds** (Q40).

**D31. The latency allowance is at most 500 ms** (Q31).

**D32. The calibration copy rewrites the existing constants for the music and adds the hiss's** (Q32).

**D33. Each room's practice and counting lines name its own sound.** The cellar knocks, the corridor hums, the nursery's music box plays, the stairs scrape and the attic whines, as `src/audio/synth` makes them, so the ghost met in practice is the one that backs away.

**D34. The listening page calibrates with the music and starts its rows at the practice level** (Q34).

**D35. The engine's accuracy properties run with starts from practice; its regressions keep the settings they were found with** (Q35).

**D36. Every new property is universal, with the run counts given, and the budget follows the owner's rule** (Q36).

**D37. The visit lengths are measured again by the method of visit-flow Q3, with practice** (Q37).

**D38. Practice refusals count with the run's trials** (Q38).

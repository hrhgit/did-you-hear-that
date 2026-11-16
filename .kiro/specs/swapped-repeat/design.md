# Design: swapped repeat

## Overview

A floor whose left and right were far apart cannot say on its own whether the difference belongs to the visitor's ears or to the two sides of the headphones. The only tool the house has is to turn the headphones round and run the room again. If the side that needed the louder sound stays with the same ear, the difference seems to belong to the ears; if it moves with the earpiece, it seems to belong to the headphones; anything else is unclear. The visit flow already reaches the stage `swappedRepeat` from the result with `chooseSwappedRepeat(roomIndex)` and leaves it empty (visit-flow D24). This spec fills it. The project owner draws the screen by hand in `src/ui` from the stage's snapshot.

```
   src/ui  (built by hand by the owner against visit-flow-types.ts and result-page-types.ts)
     │  chooseSwappedRepeat  confirmSwap  playSwapCheck  answerSwapCheck  startSwappedRoom
     │  answer  pause  resume  proceed (back to the picture)  stop
     │  snapshot.repeat: SwappedRepeat    event: swappedTrialScored    result: swappedRepeats, turnBackLine
     ▼
  ┌──────────────────────────── src/session ──────────────────────────────────────────────────┐
  │ create-visit-flow.ts   the stage: gestures, the pause field, stop, back, earpiece state    │
  │   └── create-swapped-repeat.ts   the Repeat_Controller: phases, checks, the run, the view  │
  │         ├── judge-swap-check.ts            pure: answer → Swap_Check_Judgement             │
  │         ├── swapped-earpiece-output.ts     the output, with each sound on the other side   │
  │         ├── room-runner.ts (unchanged)     plays the room's search as in every room        │
  │         ├── swapped-repeat-engine-seed.ts  pure: visit log, run number → engine seed       │
  │         ├── swapped-repeat-run.ts          pure: the run's record, with every earpiece     │
  │         ├── swapped-repeat-outcome.ts      pure: first run, repeat → outcome               │
  │         ├── swapped-repeat-comparison.ts   pure: first run, record → Comparison            │
  │         └── swapped-repeat-view.ts         pure: state → SwappedRepeat                     │
  │ result-picture.ts        the Comparison beside its floor                                   │
  │ saved-visit-payload.ts   the records in a saved visit, and a visit saved before them       │
  └──────────┬───────────────────────────────────────────┬───────────────────────────────────┘
             │ playHeadphoneCheck, play("trial"),        │ every visitor-facing string
             │ beginRoom, stopAll                         ▼
   src/audio/output  (unchanged)                  src/copy  swapped-repeat-copy.ts, swapped-repeat-lines.ts
```

The design rests on these choices.

- **The engine searches the visitor's ears, and the output is asked for the other earpiece.** The visitor answers by naming the side they heard, which is an ear. So the search runs exactly as it does in every room, over the left and the right ear, and its trials, answers and results are in ears. Only the request to the output stage changes: a sound for the left ear goes to the right earpiece and a sound for the right ear to the left earpiece, through a thin view of the output that swaps the channel of `play` and nothing else. The room runner, the engine and the output stage are unchanged.
- **Every sound and every answer names both.** The repeat keeps its own record beside the visit log. Each trial in it holds its ear and its earpiece; each answer holds the side named and the earpiece on that side; each swap check holds the earpiece it played in; the record holds which earpiece sat on which ear. A property checks the record against the channel the output stage actually filled.
- **The house knows only what it has checked.** The flow keeps an earpiece state: `asMarked` from the visit's headphone check, `unknown` from the moment the swap is asked for, `swapped` once a swap check is answered on the right, and `unknown` again from the moment the repeat ends, however it ends. No room run starts unless the state is `swapped`, and the result carries a line that asks the visitor to turn the headphones back. A later repeat checks the swap again, and a new visit checks left and right again, so nothing after a repeat relies on how the headphones sit.
- **Nothing sounds until the visitor presses for it.** The stage opens with the instruction, which plays nothing. The hiss of the check plays on the visitor's press, and the room starts on another press after a confirmed check. The interface that exists today calls none of the new methods, so until the owner's screen is built the stage plays nothing.
- **The visit log and the summary are never touched.** The repeat writes nothing to the log, and the result keeps the same log object and the same summary. The outcome is worked out by a pure function from the first run's summary and the repeat's own results, and nothing corrects any number.
- **The repeat sits beside its floor on the result, and in a saved visit.** Each floor of the picture gains the Comparison of its repeat: both runs side by side, by ear and by earpiece, with the outcome. A saved visit keeps its repeats; a visit without one is saved exactly as before this spec, and a visit saved before this spec reads with none.

## Sources

- `docs/briefs/08-swapped-repeat.md`.
- `.kiro/steering/`: `hearing-method.md` ("Left and right difference and the swapped repeat": the 15 dB limit, "If the quieter side follows the ear, the difference is attributed to the ears", "If the quieter side follows the earpiece, the difference is attributed to the headphones", "Anything else is reported as unclear"; the 10 dB down and 5 dB up steps; the four end states; "An estimate is only presented as a threshold in the first state"); `audio-safety.md` (rules 1 to 9 and the initial values; rule 4's "Within a room ... on the same ear"; rule 7's visible stop control; rule 8's volume warning); `product.md` (step 7: "Swaps the headphones and repeats one room, if left and right differed a lot on that floor"; "What the result may claim": left against right on one floor, "checked by the swapped-headphone repeat"; "No correction for specific headphone models"; the experience rules); `wording.md` (banned words; "self-check"; levels relative to the calibration; item 4 of "What the result page must always say"; tone); `structure.md` (module rules, `Db` and `Gain` endings, `left` and `right`, one export per file, strings in `src/copy`, numbers in `src/config`); `tech.md` (an `AudioContext` started only in a gesture; time and randomness injected; tests under Node; a counterexample kept as a named regression).
- `docs/architecture.md`: the session as the only part that knows the order of things; "swapped repeat | Property test over ear and headphone imbalances | The attribution is right for every combination"; one visit log as the source for the replay, the result, the stored result and the replay mode.
- `docs/roadmap.md`: spec 8 needs spec 6; "The attribution property passes; the flow offers and runs the repeat"; property 8 of the eight properties.
- `.kiro/specs/visit-flow/`: D1 (the contract only grows), D3 and D4 (window starts on the page clock), D9 (a paused trial is presented again after its own gap), D13 (stop in the swapped repeat silences and returns to the result), D19 (seeds drawn as `floor(u × 2³²)` from the visit's source), D24 (the offer: both found and at least 15 dB apart; "the swapped-repeat spec adds the repeat and may narrow when it is offered"), D25 (three refusals in a row), D26 (the test hook `onTrialPresented`), D28 (the log is assembled once, when the rooms end), D35 (a dropped visit plays nothing more), R11.2 to R11.5, R12, R14.3, R16.4, R16.5, and the tables "What each stage accepts", "Which events may be shown at once", "Pauses" and "Stop".
- `.kiro/specs/result-page/`: D1, D9 (a saved visit is the log unchanged and the summary as shown), D15 and D16 (each floor on its own scale), D19 (the difference told by side, not by ear or earpiece), D20 (only the live result offers the repeat), "Checking a payload", "The archive" (a second `save` of the same log only renames).
- `.kiro/specs/missed-sound-replay/`: the form of this spec; D9 and regression 4 (a first sound refused `busy` by the sound before it); D15 (pauses); D18 (nothing written to the log after the rooms); D20 (the flow keeps gestures, the controller keeps the rest); Q6 (landing a required field against the owner's fixtures); Q7 and the owner's rule for the time budget; "What this spec leaves to other specs" ("It inherits an output shell whose previous gain on each ear may be a replayed sound's, so it must call `beginRoom` before its room ... and a calibration that a device change in the replay or on the result may have removed").
- `.kiro/specs/audio-output/`: R9.2 and R9.4 (the room top, and no clamp at or below it), R11 (the rise limit per channel and `beginRoom`), D16 (one sound at a time, `busy`), the headphone check (left channel, `headphoneCheckLevelDb`, Purpose `headphoneCheck`).
- `.kiro/specs/threshold-search/`: CP1 (step listeners: the estimate is the lowest grid level at or above the true threshold), D16 (wrong sides counted, never unreliable on their own).
- The code: `src/session/create-visit-flow.ts` (the stand-in stage: `chooseSwappedRepeat` checks `swappedRepeatOffered`, `proceed` and `stop` lead back to `result`, `canProceed` is true there, stop reports begin no pause there; `startRoom` builds the search with `{ ...hearingMethodConfig, capRelativeToAnchorDb: roomSearchCapDb(top) }` and the room runner; `beginPause` and `endPause` write to the visit's recorder; `soundRefused` in a room leaves the house; `dropVisit`), `visit-flow-types.ts`, `room-runner.ts` (`output.play({ ear: trial.ear, purpose: "trial" })`, the refusal rule, `PresentedTrial`), `visit-log-recorder.ts` (a fresh recorder numbers attempts and trials from 1; `log()` throws while a run or a pause is open), `summarize-visit.ts` (`levelNotAsAsked`, the offer rule, the private `visitEarResult`), `judge-headphone-check.ts`, `result-picture.ts`, `result-page-types.ts`, `saved-visit-payload.ts` (unknown keys are ignored on reading; `formatVersion` 1), `create-visit-archive.ts` (`savedIds` keyed by the log object; a second `save` only renames), `src/storage/create-visit-store.ts` and `visit-store-types.ts` (`changeName` is the only change of an entry), `find-earlier-visit.ts`, `light-depth-fraction.ts`, `room-search-cap.ts`, `src/audio/output/create-audio-output.ts` (`playHeadphoneCheck` plays the calibration hiss in the left channel at `headphoneCheckLevelDb` with the Purpose `headphoneCheck`, and the rise limit applies to it; `beginRoom` clears the previous gains; `play` refuses `busy` while a sound plays; `deviceChanged` forgets the calibration), `src/config/` (`hearing-method-config.ts`, `audio-output-config.ts`, `audio-safety-config.ts`, `ghost-sound-config.ts`, `visit-flow-config.ts`, `banned-terms.ts`), `src/copy/` (`limits-statement.ts`, `result-lines.ts`, `result-page-copy.ts`, `room-copy.ts`, `headphone-check-copy.ts`, `calibration-copy.ts`, `leaving-copy.ts`, `find-banned-terms.ts`), `tests/listeners/` (`psychometric-listener.ts`, `simulated-visitor.ts`, `spec-search-under-test.ts`, `listener-parameter-arbitraries.ts`), `tests/properties/` (`visit-flow-harness.ts`, `visit-flow-timeline.ts`, `visit-flow-arbitraries.ts`, `result-page-arbitraries.ts`, `result-page-text.ts`, the replay harness).
- Read only, the owner's: `src/ui/visit/screen-of-snapshot.ts` (the stand-in notice `leavingCopy.swappedRoomNotBuilt` with "Back to the picture", which calls `proceed`; the stop control hidden in `result` and `swappedRepeat`), `src/ui/visit/screen-of-snapshot.test.ts`, `src/ui/visit/start-visit.ts` (the result view stays drawn during the swapped repeat), `src/ui/visit/reaction-of-event.ts` (null for an event kind it does not know), `src/ui/result/create-result-view.ts` (draws `floor.swappedRepeat`), `src/ui/result/picture-sheet.test.ts`, `tests/e2e/result-page.spec.ts`.

No web source was read for this design. One measurement was made, described in "Measurements".

## Files

Created:

```
src/config/
  swapped-repeat-config.ts             swappedRepeatConfig (R2)
  swapped-repeat-config.test.ts

src/session/
  judge-swap-check.ts                  judgeSwapCheck (R5.4)
  judge-swap-check.test.ts
  earpiece-on-ear.ts                   earpieceOnEar: which earpiece sits on each ear, for an arrangement (R8)
  earpiece-on-ear.test.ts
  swapped-earpiece-output.ts           swappedEarpieceOutput: the output with each `play` on the earpiece of its ear (R8.1, D3)
  swapped-earpiece-output.test.ts
  swapped-repeat-engine-seed.ts        swappedRepeatEngineSeed (R7.3)
  swapped-repeat-engine-seed.test.ts
  swapped-repeat-outcome.ts            swappedRepeatOutcome (R10)
  swapped-repeat-outcome.test.ts
  swapped-repeat-run.ts                swappedRepeatRunOf: the frozen Repeat_Record (R8, R10.7, R11.1)
  swapped-repeat-run.test.ts
  swapped-repeat-comparison.ts         swappedRepeatComparison (R11.2, R12)
  swapped-repeat-comparison.test.ts
  swapped-repeat-view.ts               swappedRepeatView: the view of one moment (R3 to R6, R11, R14)
  swapped-repeat-view.test.ts
  create-swapped-repeat.ts             createSwappedRepeat: the Repeat_Controller (R3 to R11, R14, R15)
  create-swapped-repeat.test.ts
  swapped-repeat-run-holds.ts          swappedRepeatRunsHold: the payload rules of a saved visit's records (R13.4)
  swapped-repeat-run-holds.test.ts
  swapped-repeat-types-match.test.ts   type-level checks: copy names against session names (R1.7)

src/copy/
  swapped-repeat-copy.ts               swappedRepeatCopy: every fixed string of the repeat (R18)
  swapped-repeat-lines.ts              every sentence that depends on the repeat (R18)
  swapped-repeat-copy.test.ts

tests/listeners/
  worn-headphones.ts                   wornHeadphones: a listener wearing headphones (R21.1)
  worn-headphones.test.ts
  attribution-measurement.ts           the measurement of "Measurements", as a function (R21.4)
  print-attribution-measurement.ts     prints it again with the seeds of "Measurements"

tests/properties/
  swapped-repeat-arbitraries.ts        drawn ear differences, imbalances, visit logs at the result, repeat scripts, refusal scripts
  swapped-repeat-oracle.ts             the oracle of "Correct attribution", written from R10 and not from the outcome's code
  swapped-repeat-harness.ts            a Repeat_Controller on a calibrated output shell, or on a scripted output
  swapped-repeat-text.ts               every string of a view, an event, a result and a picture's repeat, and the allowed forms of CP9
  swapped-repeat-cp1-correct-attribution.property.test.ts
  swapped-repeat-cp2-outcome-rule.property.test.ts
  swapped-repeat-cp3-earpieces-in-the-record.property.test.ts
  swapped-repeat-cp4-engine-as-before.property.test.ts
  swapped-repeat-cp5-presses-and-endings.property.test.ts
  swapped-repeat-cp6-pauses-devices-refusals.property.test.ts
  swapped-repeat-cp7-safe-sounds.property.test.ts
  swapped-repeat-cp8-nothing-before-scoring.property.test.ts
  swapped-repeat-cp9-safe-wording.property.test.ts
  swapped-repeat-cp10-whole-visits.property.test.ts
  swapped-repeat-cp11-saved-visits.property.test.ts
  swapped-repeat-simulated-visits.test.ts   a quick and a full visit with the repeat run to its end from the result
  swapped-repeat-regressions.test.ts
```

Changed, by addition only:

- `src/session/visit-flow-types.ts`: the additions of "Interface contract" (R1.1).
- `src/session/result-page-types.ts`: the additions of "Interface contract" (R1.2).
- `src/session/visit-flow-types.test.ts`, `result-page-types.test.ts`, `result-page-types-match.test.ts`: type-level checks of the additions.
- `src/session/create-visit-flow.ts`: the stage as "The repeat in the visit flow" describes; the test hook's trial gains the earpiece (R8.7); `dropVisit` also ends a repeat under way. Nothing it does in another stage changes.
- `src/session/create-visit-flow.test.ts`: examples of each row of "What each phase accepts"; the table of stages and the actions it tries gains the four new methods.
- `src/session/summarize-visit.ts`: exports the helpers that give an ear's result with the added reasons and tell whether a run played a sound at another level than asked, unchanged, so that a repeat's ears are judged by the same code (R10.7). Nothing else changes.
- `src/session/result-picture.ts` and its test: the field `repeat` of each floor, and no offer on a floor that has a repeat (R12).
- `src/session/saved-visit-payload.ts` and its test: the key `swappedRepeats` (R13). The test's two expectations of a whole parsed payload gain `swappedRepeats: []`.
- `src/session/create-visit-archive.ts` and its test: `swappedRepeats` in every saved visit; a second `save` of a visit whose saved copy lacks records replaces its payload (Q5, decided by the owner on 2026-11-15); the method `savedCopyLacksRepeats` (chosen by the owner's coordinator on 2026-11-15; the owner may reverse it). The test's expectations of a whole saved visit gain `swappedRepeats: []`.
- `src/session/find-earlier-visit.test.ts` and `src/session/result-picture.test.ts`: their `SavedVisit` literals gain `swappedRepeats: []`, which the required field needs.
- `src/storage/visit-store-types.ts`, `src/storage/create-visit-store.ts` and `src/storage/create-visit-store.test.ts`: the method `changePayload(savedVisitId, payloadJson)` and its tests (Q5, decided by the owner on 2026-11-15). This is the one change of this spec under `src/storage/`.
- `tests/listeners/simulated-visitor.ts`: Worn_Headphones for every trial, the earpiece from the hook, and an optional swapped-repeat behaviour (R21.2, R21.3). `tests/properties/visit-flow-arbitraries.ts`: an arbitrary of that behaviour that only this spec's files use.
- `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-timeline.ts`: their wrappers of `VisitFlow` pass the four new methods through, because they implement the interface; the harness's hook type gains the earpiece. Nothing else changes in them.
- `tests/properties/result-page-arbitraries.ts`: its `SavedVisit` builder gains `swappedRepeats`, and optionally draws records. `tests/properties/result-page-text.ts`: collects the strings of a floor's `repeat`, so that the result page's own wording property covers them.
- The READMEs of `src/session/`, `src/copy/`, `src/config/`, `tests/properties/` and `tests/listeners/`. `src/storage/README.md` is not changed (R23.4).

Not changed: everything under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `.kiro/steering/`, `src/engine/`, `src/audio/`; everything under `src/storage/` but `changePayload` and its test, `src/storage/README.md` included; every CSS and HTML file; `src/main.ts`; the root `README.md`; `src/session/room-runner.ts`, `visit-log-recorder.ts`, `judge-headphone-check.ts`, `create-missed-sound-replay.ts`; every existing value in `src/config`; `src/copy/leaving-copy.ts` (its stand-in `swappedRoomNotBuilt` stays for the owner's screen until the owner replaces it); `package.json` and `package-lock.json`; every hook and every lint rule.

## Interface contract

The contracts are `src/session/visit-flow-types.ts` and `src/session/result-page-types.ts`. This spec adds to them and changes nothing in them (visit-flow D1, result-page D1, R1). The first task writes the additions with the smallest change of `create-visit-flow.ts`, `result-picture.ts` and `create-visit-archive.ts` that builds them, with the four new methods doing nothing and `savedCopyLacksRepeats` answering false, so the owner can build the screen at once and the stage still plays nothing (R1.6).

### How the interface uses it

```ts
flow.subscribe((snapshot) => {
  if (snapshot.stage === "result") {
    if (snapshot.turnBackLine !== null) show(snapshot.turnBackLine);         // above the picture
    // resultPicture({ kind: "live", visit: snapshot, ... }) now gives floor.repeat for each repeated floor.
    // The save control shows again while archive.savedCopyLacksRepeats(snapshot) is true (Q5).
  }
  if (snapshot.stage !== "swappedRepeat") return;
  const view = snapshot.repeat;                                              // SwappedRepeat
  showStop(view.stopLabel, () => flow.stop());                               // every phase (audio-safety rule 7)
  button(view.backLabel, () => flow.proceed());                              // every phase but a paused room
  switch (view.phase) {
    case "unavailable": show(view.heading, [view.line]); break;
    case "instruction": show(view.heading, [...view.lines, view.againLine]);
                        button(view.confirmLabel, () => flow.confirmSwap()); break;          // plays nothing
    case "check":       show(view.question, [view.judgementLine, view.cutLine, view.playRefusalLine]);
                        button(view.playLabel, () => flow.playSwapCheck());                  // a press: may start sound
                        if (view.awaitingAnswer) for (const answer of answers)
                          button(view.answers[answer], () => flow.answerSwapCheck(answer)); break;
    case "ready":       show(view.heading, [view.judgementLine, ...view.lines]);
                        button(view.startLabel, () => flow.startSwappedRoom()); break;       // a press: starts sound
    case "room":        lightRoom(snapshot.room.roomId);
                        if (snapshot.pause !== null) { show(view.pauseLine); button(view.resumeLabel, () => flow.resume()); }
                        else { answers(view.answers, (side, at) => flow.answer(side, at)); button(view.pauseLabel, () => flow.pause()); }
                        break;                                                                // nothing else changes until an answer is scored
    case "finished":    show(view.heading, [view.endLine, view.turnBackLine]);
                        if (view.comparison) drawComparison(view.comparison); break;
  }
});

flow.onEvent((event) => {
  if (event.kind === "swappedTrialScored" && event.reaction === "ripple") ripple(event.trial.ear, event.line);
  if (event.kind === "swappedTrialScored" && event.reaction === "noSoundLine") say(event.line);
});
```

### What is added to each existing type

| Type | What is added | Code outside `src/session` that builds or implements it |
|---|---|---|
| `VisitFlow` | The methods `confirmSwap()`, `playSwapCheck()`, `answerSwapCheck(answer)`, `startSwappedRoom()`; one sentence in the comments of `answer` and `pause` | `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-timeline.ts` wrap the flow in an object typed `VisitFlow` and must pass the methods through (this spec's tasks). `src/ui` only calls the flow |
| `SwappedRepeatSnapshot` | The field `readonly repeat: SwappedRepeat`, always present | `src/ui/visit/screen-of-snapshot.test.ts` builds one as a literal ("says that the swapped repeat is not built and leads back to the picture"). Without a cast it would no longer type-check; the owner's coordinator cast it with `as SwappedRepeatSnapshot` on 2026-11-15, so it type-checks before and after the addition (Q8) |
| `ResultSnapshot` | The fields `readonly swappedRepeats: readonly SwappedRepeatRun[]` and `readonly turnBackLine: string \| null`, always present | `src/ui/visit/screen-of-snapshot.test.ts` builds one as a literal ("names the result and holds nothing of it"), cast with `as ResultSnapshot` on 2026-11-15, so it type-checks before and after the addition (Q8). `tests/e2e/simulated-result.ts` uses `Pick<ResultSnapshot, "visitLog" \| "summary">`, which is unaffected |
| `VisitEvent` | The member `SwappedTrialScoredEvent` | Nothing builds one outside the flow. `src/ui/visit/reaction-of-event.ts` gives null for a kind it does not know, and visit-flow CP3 ignores a kind it does not list |
| `VisitToSave` (result page) | The optional field `readonly swappedRepeats?: readonly SwappedRepeatRun[]` | `tests/e2e/result-page.spec.ts` builds `VisitToSave` values; optional, so they still compile. A `ResultSnapshot` still fits it, and now carries its records |
| `SavedVisit` (result page) | The field `readonly swappedRepeats: readonly SwappedRepeatRun[]`, always present, empty for a visit without a repeat | `src/session/find-earlier-visit.test.ts`, `src/session/result-picture.test.ts` and `tests/properties/result-page-arbitraries.ts` build literals (this spec's tasks). No owner file builds one |
| `PictureFloor` (result page) | The field `readonly repeat: SwappedRepeatComparison \| null`, always present | `src/ui/result/picture-sheet.test.ts` builds one as a literal (`floor()`), cast with `as PictureFloor` on 2026-11-15, so it type-checks before and after the addition (Q8) |
| `VisitArchive` (result page) | The method `savedCopyLacksRepeats(visit)`; one sentence in the comment of `save` (Q5) | Only `createVisitArchive` builds one (this spec's tasks). `src/ui/visit/start-visit.ts` and `src/ui/result/start-result-sheet.ts` create it with `createVisitArchive`; `src/ui/result/create-result-view.ts` receives one typed `VisitArchive` and only calls its methods; `tests/properties/result-page-arbitraries.ts` (`saveThroughArchive`) and the result page's property files use `createVisitArchive`; nothing in `tests/e2e/` names the type. No file builds one by hand, so nothing stops compiling |
| `VisitStore` (`src/storage/visit-store-types.ts`, not a contract file) | The method `changePayload(savedVisitId, payloadJson)` (Q5) | Only `createVisitStore` builds one, and only `create-visit-archive.ts` and the store's own test use it. Nothing stops compiling |
| `VisitLog`, `VisitSummary`, `RoomSummary`, `SnapshotBase`, `VisitStage`, `PauseReason`, `TrialReaction`, `ScoredVisitTrial`, every replay type, `ResultPicture`, `PictureWing`, `SwappedRepeatOffer`, every other type | Nothing | |
| `src/audio/output/*`, `src/engine/*`, `room-runner.ts`'s `PresentedTrial` | Nothing | |

`SnapshotBase.pause` and `canProceed` keep their meaning: in this stage a Pause holds only in the phase `room`, and `canProceed` is true whenever no Pause holds, as it is today (`proceed` goes back to the result). The test-only `VisitFlowTestOptions.onTrialPresented` of `create-visit-flow.ts`, which is not part of the contract, takes a `FlowPresentedTrial`, a `PresentedTrial` with two more fields (R8.7); a listener typed for `PresentedTrial` still fits it.

### The additions to `visit-flow-types.ts`

In `VisitFlow`, the comment of `answer` gains the sentence "Also in the phase `room` of the swapped repeat, where the side is the visitor's own ear." The comment of `pause` gains "Also in the phase `room` of the swapped repeat." Added after `startReplay`:

```ts
  /** Swapped repeat, phase `instruction`: the visitor says the earpieces are swapped. Plays nothing. */
  confirmSwap(): void;
  /**
   * Swapped repeat, phase `check`: plays the hiss in the left earpiece. Call it from the visitor's
   * press, because it may start sound (it calls `activate` within the call).
   */
  playSwapCheck(): void;
  /** Swapped repeat, phase `check`: the answer to "Which side was the hiss on?". Ignored until a check has been played. */
  answerSwapCheck(answer: HeadphoneCheckAnswer): void;
  /**
   * Swapped repeat, phase `ready`: runs the room again. Call it from the visitor's press, because
   * it starts sound. In this stage `proceed` goes back to the picture at any moment, silencing any
   * sound, and `stop` silences at once and goes back to the picture.
   */
  startSwappedRoom(): void;
```

`ResultSnapshot` after the addition:

```ts
/** The result. The result page spec draws it. */
export interface ResultSnapshot extends SnapshotBase<"result"> {
  readonly visitLog: VisitLog;
  readonly summary: VisitSummary;
  /** Every swapped repeat of this visit that ran to its end, in the order they ended. Pass the snapshot to `resultPicture`, which draws each beside its floor. */
  readonly swappedRepeats: readonly SwappedRepeatRun[];
  /** Once a swapped repeat has begun, the line that asks the visitor to turn the headphones back; otherwise null. Show it above the picture. */
  readonly turnBackLine: string | null;
}
```

`SwappedRepeatSnapshot` after the addition, with its first comment line now "The swapped repeat of one floor (swapped-repeat design.md)":

```ts
export interface SwappedRepeatSnapshot extends SnapshotBase<"swappedRepeat"> {
  readonly room: VisitRoom;
  readonly visitLog: VisitLog;
  readonly summary: VisitSummary;
  /** What the repeat shows and says now. Every string comes from `src/copy`. */
  readonly repeat: SwappedRepeat;
}
```

`VisitEvent` after the addition:

```ts
export type VisitEvent =
  | RoomStartedEvent
  | TrialScoredEvent
  | RoomFinishedEvent
  | ReplaySoundStartedEvent
  | SwappedTrialScoredEvent;
```

The new block, at the end of the file:

```ts
// ─── The swapped repeat ──────────────────────────────────────────────────────────────────
// swapped-repeat design.md. An ear is the visitor's own ear: the side the visitor names. An
// earpiece is a side of the headphones: the channel the output stage plays. Every level is in
// decibels relative to the visitor's calibration.

/**
 * What the house knows of how the headphones sit. `asMarked`: the left earpiece is on the left
 * ear, as the visit's headphone check found. `swapped`: the left earpiece is on the right ear, as
 * a swap check of the repeat under way found. `unknown`: the visitor was asked to swap or to turn
 * the headphones back, and nothing has checked it since.
 */
export type EarpieceState = "asMarked" | "swapped" | "unknown";

/** How the earpieces sat during one run of a room. */
export type EarpieceArrangement = "asMarked" | "swapped";

/**
 * What an answer to the swap check says. The hiss always plays in the left earpiece.
 * `confirmed`: heard on the right, so the earpieces are swapped. `notSwapped`: heard on the left.
 * `bothSides` and `notHeard`: as in the visit's headphone check.
 */
export type SwapCheckJudgement =
  "confirmed" | "notSwapped" | "bothSides" | "notHeard";

/**
 * `unavailable`: the repeat cannot run; nothing plays. `instruction`: how to swap the earpieces.
 * `check`: the hiss in one earpiece and the answer. `ready`: the swap is confirmed; the room starts
 * on a press. `room`: the room runs again. `finished`: no more sound plays.
 */
export type SwappedRepeatPhase =
  "unavailable" | "instruction" | "check" | "ready" | "room" | "finished";

/**
 * `calibrationGone`: the audio device changed after the rooms, so the house holds no calibration.
 * `calibrationChanged`: this floor was measured with an earlier calibration than the one the house
 * holds now, because the audio device changed during the visit.
 */
export type SwappedRepeatUnavailableReason = "calibrationGone" | "calibrationChanged";

/**
 * `finished`: the room's search ended. `deviceChanged`: the audio device changed during the room,
 * so the calibration is gone. `soundRefused`: the house could not play a sound three times in a row.
 */
export type SwappedRepeatEnding = "finished" | "deviceChanged" | "soundRefused";

/**
 * `followsEar`: the same ear needed the louder sound both times. `followsEarpiece`: the same
 * earpiece did. `unclear`: anything else.
 */
export type SwappedRepeatOutcome = "followsEar" | "followsEarpiece" | "unclear";

/**
 * Why an outcome is unclear. `noLevel`: an ear of the repeat has no level (unreliable, quieter than
 * the house can whisper, or not caught at the loudest). `differenceShrank`: left and right of the
 * repeat came out less than half the limit apart.
 */
export type SwappedRepeatUnclearReason = "noLevel" | "differenceShrank";

/** The pause reasons that pause the repeat's room. A device change ends the room instead. */
export type SwappedRepeatPauseReason = Extract<PauseReason, "visitor" | "hidden" | "interrupted">;

/** One answered swap check. */
export interface LoggedSwapCheck {
  readonly answer: HeadphoneCheckAnswer;
  readonly judgement: SwapCheckJudgement;
  /** The earpiece the hiss played in: always `left`. */
  readonly earpiece: Ear;
  /** On the visit log's clock. */
  readonly answeredAtMs: number;
}

/** The two fields every trial of a repeat adds to a trial of the visit log. */
export interface EarpiecePart {
  /** The earpiece the sound played in, or null for a no-sound trial. `ear` is the ear it reached. */
  readonly earpiece: Ear | null;
  /** For a scored trial answered with a side, the earpiece on the ear named; otherwise null. */
  readonly responseEarpiece: Ear | null;
}

/** One played trial of a swapped repeat. */
export type SwappedRepeatTrial = VisitTrial & EarpiecePart;

/** One scored trial of a swapped repeat. */
export type ScoredSwappedRepeatTrial = ScoredVisitTrial & EarpiecePart;

/** An answer in the repeat's room that scored nothing. */
export interface SwappedRepeatIgnoredAnswer extends LoggedIgnoredAnswer {
  /** The earpiece on the ear named. */
  readonly earpiece: Ear;
}

/**
 * The record of one swapped repeat that ran to its end. Plain data, frozen: it survives
 * JSON.stringify and JSON.parse unchanged. Times are on the visit log's clock.
 */
export interface SwappedRepeatRun {
  /** The version of this format. Raised when a field changes meaning. */
  readonly formatVersion: 1;
  /** The floor it repeated. */
  readonly roomIndex: number;
  /** 1 for the first repeat begun in this visit, then 2 and up; runs that did not end count too. */
  readonly runNumber: number;
  /** The calibration of the visit log it used: the one the floor's first run used. */
  readonly calibrationIndex: number;
  /** For each ear, the earpiece on it while the room ran: `{ left: "right", right: "left" }`. */
  readonly earpieceOnEar: Readonly<Record<Ear, Ear>>;
  /** Every answered swap check of this repeat, in order. The last is `confirmed`. */
  readonly swapChecks: readonly LoggedSwapCheck[];
  /** The run of the room's search, as the visit log records a room run: attempt 1, ending `finished`. */
  readonly attempt: LoggedRoomAttempt;
  /** Every trial that was played, in order, numbered from 1. */
  readonly trials: readonly SwappedRepeatTrial[];
  readonly ignoredAnswers: readonly SwappedRepeatIgnoredAnswer[];
  readonly pauses: readonly LoggedPause[];
  readonly refusedPlays: readonly LoggedRefusedPlay[];
  /** Each ear's result: the search's, made unreliable with `levelNotAsAsked` as a room of the visit is. */
  readonly left: VisitEarResult;
  readonly right: VisitEarResult;
  /** Right threshold minus left threshold, by ear, when both are found; otherwise null. */
  readonly rightMinusLeftDb: number | null;
  /** The floor's first run, as the summary gave it: right minus left, by ear. */
  readonly firstRightMinusLeftDb: number;
  /** The left and right difference that offered the repeat: `swappedRepeatDifferenceDb` then. */
  readonly differenceLimitDb: number;
  /** Below this size the repeat's difference counts as shrunk: half the limit then. */
  readonly unclearBelowDb: number;
  readonly outcome: SwappedRepeatOutcome;
  /** For `unclear`, why; otherwise null. */
  readonly unclearReason: SwappedRepeatUnclearReason | null;
}

/** Released in the same moment a trial of the repeat is scored, never earlier. */
export interface SwappedTrialScoredEvent {
  readonly kind: "swappedTrialScored";
  readonly room: VisitRoom;
  readonly runNumber: number;
  /** The trial, with its ear and its earpiece. Draw a ripple on `trial.ear`. */
  readonly trial: ScoredSwappedRepeatTrial;
  /** What to show now, as in every room. */
  readonly reaction: TrialReaction;
  /** For `ripple`, the ripple's label, naming the ear, the earpiece, the pitch and the level; for `noSoundLine`, the line; otherwise null. */
  readonly line: string | null;
}

/** One ear of one run in a comparison. */
export interface SwappedRepeatComparisonWing {
  readonly ear: Ear;
  /** The earpiece on this ear in this run. */
  readonly earpiece: Ear;
  /** Such as "Right earpiece". */
  readonly earpieceLabel: string;
  readonly state: VisitEarResult["state"];
  /** The level for `found`, otherwise null. */
  readonly thresholdDb: number | null;
  /** As `PictureWing.lightDepthFraction`, on this floor's own scale; null for `unreliable`. */
  readonly lightDepthFraction: number | null;
  /** As `PictureWing.line`. */
  readonly line: string;
  /** For an unreliable ear, why, in one line; otherwise null. */
  readonly reasonLine: string | null;
}

/** One run of the floor in a comparison. */
export interface SwappedRepeatComparisonRun {
  readonly arrangement: EarpieceArrangement;
  /** "Headphones as marked" or "Headphones swapped". */
  readonly label: string;
  /** The visitor's left ear. */
  readonly left: SwappedRepeatComparisonWing;
  /** The visitor's right ear. */
  readonly right: SwappedRepeatComparisonWing;
  /** Right minus left, by ear, when both are found; otherwise null. */
  readonly rightMinusLeftDb: number | null;
  /** As `PictureFloor.differenceLabel`: "–", "0 dB", or such as "15 dB quieter on the left". */
  readonly differenceLabel: string;
}

/** A floor's first run and its swapped repeat side by side. Plain data, frozen. */
export interface SwappedRepeatComparison {
  readonly roomIndex: number;
  readonly runNumber: number;
  readonly heading: string;
  /** In this order: the first run, as marked; the repeat, swapped. */
  readonly runs: readonly [SwappedRepeatComparisonRun, SwappedRepeatComparisonRun];
  readonly outcome: SwappedRepeatOutcome;
  readonly unclearReason: SwappedRepeatUnclearReason | null;
  /** Short, beside the floor. */
  readonly outcomeLabel: string;
  /** In order. For `followsEar` the last line says when to see a hearing professional. */
  readonly outcomeLines: readonly string[];
  /** Everything above in words, for a visitor who cannot see the picture. */
  readonly description: string;
}

/** What every phase of the repeat gives. */
export interface SwappedRepeatViewBase<Phase extends SwappedRepeatPhase> {
  readonly phase: Phase;
  readonly heading: string;
  /** Such as "Stairs". */
  readonly roomName: string;
  /** Such as "4 kHz". */
  readonly pitchLabel: string;
  /** The first run's difference, as the picture labels it. */
  readonly firstDifferenceLabel: string;
  /** What the house knows of the earpieces now. */
  readonly earpieces: EarpieceState;
  /** The label of the visible stop control. Show the control in every phase of this stage. */
  readonly stopLabel: string;
  /** The label of the control that calls `proceed`, which goes back to the picture. */
  readonly backLabel: string;
}

export interface SwappedRepeatUnavailable extends SwappedRepeatViewBase<"unavailable"> {
  readonly reason: SwappedRepeatUnavailableReason;
  readonly line: string;
}

export interface SwappedRepeatInstruction extends SwappedRepeatViewBase<"instruction"> {
  /** How to swap, the volume line and what comes next. Show all of them before the confirm control. */
  readonly lines: readonly string[];
  /** After a check heard on the left: the headphones are still the way they were. Otherwise null. */
  readonly againLine: string | null;
  /** The label of the control that calls `confirmSwap`. */
  readonly confirmLabel: string;
}

export interface SwappedRepeatCheck extends SwappedRepeatViewBase<"check"> {
  /** "Which side was the hiss on?" */
  readonly question: string;
  /** The label of each answer to pass to `answerSwapCheck`. */
  readonly answers: Readonly<Record<HeadphoneCheckAnswer, string>>;
  /** The label of the control that calls `playSwapCheck`. */
  readonly playLabel: string;
  /** True from a played check until its answer. Show the answers only then. */
  readonly awaitingAnswer: boolean;
  /** Why the last press of play did not play the check, or null. */
  readonly playRefusal: PlayRefusal | null;
  readonly playRefusalLine: string | null;
  /** The judgement of the last answer while it keeps the visitor here, or null. */
  readonly judgement: Extract<SwapCheckJudgement, "bothSides" | "notHeard"> | null;
  readonly judgementLine: string | null;
  /** When the last check was cut off by a hidden page or an interruption, the line that asks for it again; otherwise null. */
  readonly cutLine: string | null;
}

export interface SwappedRepeatReady extends SwappedRepeatViewBase<"ready"> {
  /** The line of the confirmed check. */
  readonly judgementLine: string;
  /** What happens next. */
  readonly lines: readonly string[];
  /** The label of the control that calls `startSwappedRoom`. */
  readonly startLabel: string;
}

/** The room runs again. Nothing here changes while a trial waits to be scored. */
export interface SwappedRepeatRoom extends SwappedRepeatViewBase<"room"> {
  readonly runNumber: number;
  /** The two answers, as in every room: the visitor names the ear. */
  readonly answers: Readonly<Record<Ear, { readonly name: string; readonly hint: string }>>;
  /** The label of the control that calls `pause`. */
  readonly pauseLabel: string;
  /** While the snapshot's pause holds, why and what happens next; otherwise null. */
  readonly pauseLine: string | null;
  /** The label of the control that calls `resume`. */
  readonly resumeLabel: string;
}

export interface SwappedRepeatFinished extends SwappedRepeatViewBase<"finished"> {
  readonly ending: SwappedRepeatEnding;
  readonly endLine: string;
  /** For the ending `finished`, both runs side by side and the outcome; otherwise null. */
  readonly comparison: SwappedRepeatComparison | null;
  /** Always: the headphones may still be swapped. */
  readonly turnBackLine: string;
}

/** The swapped repeat as the stage shows it now. */
export type SwappedRepeat =
  | SwappedRepeatUnavailable
  | SwappedRepeatInstruction
  | SwappedRepeatCheck
  | SwappedRepeatReady
  | SwappedRepeatRoom
  | SwappedRepeatFinished;
```

The block imports nothing new: `Ear`, `HeadphoneCheckAnswer`, `LoggedIgnoredAnswer`, `LoggedPause`, `LoggedRefusedPlay`, `LoggedRoomAttempt`, `PauseReason`, `PlayRefusal`, `ScoredVisitTrial`, `TrialReaction`, `VisitEarResult`, `VisitRoom` and `VisitTrial` are already in the file. It contains no statement that runs.

### The additions to `result-page-types.ts`

```ts
// added to the imports from "./visit-flow-types" and to the re-exports:
//   SwappedRepeatComparison, SwappedRepeatOutcome, SwappedRepeatRun

/** A visit to save or to draw: what the result snapshot holds. A `ResultSnapshot` fits it. */
export interface VisitToSave {
  readonly visitLog: VisitLog;
  readonly summary: VisitSummary;
  /** The swapped repeats that ran to their end (swapped-repeat design.md). Missing means none. */
  readonly swappedRepeats?: readonly SwappedRepeatRun[];
}

// in SavedVisit, after swappedRepeatDifferenceDb:
  /** The swapped repeats saved with it, in the order they ended. Empty for a visit saved without one, and for every visit saved before the swapped-repeat spec. */
  readonly swappedRepeats: readonly SwappedRepeatRun[];

// in PictureFloor, after swappedRepeat:
  /** This floor's swapped repeat beside its first run, or null when the visit has none for it. */
  readonly repeat: SwappedRepeatComparison | null;

// in VisitArchive, after save:
  /**
   * Whether this visit's saved copy lacks swapped repeats that the visit now holds: true when this
   * page saved the same `visitLog` object before, that saved copy is still listed, and the visit
   * holds a swapped repeat whose run number no repeat of the saved copy has. `save` would then
   * replace the saved copy's payload, so show the save control again while this is true
   * (swapped-repeat Q5). False for a visit this page has not saved, for a saved copy that is no
   * longer listed, in robot mode and whenever local storage cannot be read. Reads local storage
   * now, as `list()` does. Never throws.
   */
  savedCopyLacksRepeats(visit: VisitToSave): boolean;
```

The comment of `PictureFloor.swappedRepeat` gains "Null also once this floor has a repeat (swapped-repeat Q4)." `VisitArchive.save`'s comment gains one sentence: "When the visit now holds swapped repeats that the saved copy lacks, it replaces the saved copy's payload and keeps its id, date and name." That sentence widens what `save` does in a case that did not exist before this spec; the owner decided it in Q5 on 2026-11-15. The method `savedCopyLacksRepeats` answers the sub-question of Q5, as the owner's coordinator chose it on 2026-11-15 (the owner may reverse it): the page compares nothing, and the archive says whether the saved copy lags ("Saved visits"). The archive is the place because it alone knows which saved visit the page saved for a log (`savedIds`) and what that copy holds now; a function of the two lists would need the page to find the saved copy itself.

### What each phase accepts

Every action not listed is ignored in this stage. While a Pause holds, only `resume` and `stop` act (visit-flow R12.5). `canProceed` is true whenever no Pause holds.

| Phase | Entered | `confirmSwap` | `playSwapCheck` | `answerSwapCheck` | `startSwappedRoom` | `answer`, `pause` | `proceed` | `stop` | Shell stop `hidden`, `interrupted` | Shell stop `deviceChanged` | Shell stop `pageLeft` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `unavailable` | `chooseSwappedRepeat` without the floor's calibration; a device change before the room | Ignored | Ignored | Ignored | Ignored | Ignored | `result` | `stopAll`; `result` | Nothing | Nothing | `result` |
| `instruction` | `chooseSwappedRepeat`; a check answered `notSwapped` | `check` | Ignored | Ignored | Ignored | Ignored | `result` | `stopAll`; `result` | Nothing | `unavailable`, `calibrationGone` | `result` |
| `check` | `confirmSwap` | Ignored | The hiss in the left earpiece (gesture) | Judged once a check was played | Ignored | Ignored | `stopAll` if the hiss may play; `result` | `stopAll`; `result` | The check counts as not played; `cutLine` | `unavailable`, `calibrationGone` | `result` |
| `ready` | a check answered `confirmed` | Ignored | Ignored | Ignored | `beginRoom`; the room starts (gesture); `room` | Ignored | `result` | `stopAll`; `result` | Nothing | `unavailable`, `calibrationGone` | `result` |
| `room`, no Pause | `startSwappedRoom` | Ignored | Ignored | Ignored | Ignored | `answer` scores or is logged as ignored; `pause` begins a Pause `visitor` and calls `stopAll` | `stopAll`; the run ends without a record; `result` | `stopAll`; the run ends without a record; `result` | Pause with that reason; the presented trial is discarded | The run ends without a record; `finished`, `deviceChanged` | The run ends without a record; `result` |
| `room`, Pause holds | a pause | Ignored | Ignored | Ignored | Ignored | Ignored | Ignored | `stopAll`; the run ends without a record; `result` | Stays paused | Pause ends; `finished`, `deviceChanged` | Pause ends; the run ends; `result` |
| `finished` | the search ended; a device change in the room; three refusals in a row | Ignored | Ignored | Ignored | Ignored | Ignored | `result` | `stopAll`; `result` | Nothing | Nothing | `result` |

`resume()` while a Pause holds calls `withSound`, which calls `activate` within the call. Once the shell runs, the Pause ends; with a calibration the run resumes and presents the waiting trial after its own gap; without one the phase becomes `finished` with `deviceChanged`. Leaving the stage in any way after the phase `instruction` was shown sets the earpiece state to `unknown` (D5).

## Config

### `src/config/swapped-repeat-config.ts`

```ts
/**
 * The number the swapped repeat adds (swapped-repeat design.md, "Config"). The limit that offers
 * the repeat is `hearingMethodConfig.swappedRepeatDifferenceDb`; the search's settings are
 * `hearingMethodConfig`; the hiss of the swap check plays at `audioOutputConfig.headphoneCheckLevelDb`
 * through the output stage; the most refusals in a row is `visitFlowConfig.refusedPlaysInARowMaxCount`.
 */
export interface SwappedRepeatConfig {
  /**
   * Brief 08: unclear includes "a difference that shrank below half the limit". The repeat's left
   * and right difference counts as shrunk when its size is below this share of
   * `swappedRepeatDifferenceDb`. Above 0 and below 1.
   */
  readonly unclearBelowLimitFraction: number;
}

export const swappedRepeatConfig: SwappedRepeatConfig = deepFreeze({
  // Brief 08, "half the limit"
  unclearBelowLimitFraction: 0.5,
});
```

The file has its own `deepFreeze`, as the other config files do. The test checks the value, that the field name ends in `Fraction`, deep freezing, and that the value lies above 0 and below 1.

| Field | Value | Status |
|---|---|---|
| `unclearBelowLimitFraction` | 0.5 | From brief 08 |

Existing values the repeat reads and does not change: `hearingMethodConfig.swappedRepeatDifferenceDb` (15 dB), every search setting of `hearingMethodConfig`, `hearingMethodConfig.floorDb` (the scale of the light), `audioOutputConfig.scheduleLeadMs` (through the room runner), `visitFlowConfig.refusedPlaysInARowMaxCount` (3, through the room runner). The output stage reads its own limits. No other number is added. Unclear_Below is 15 × 0.5 = 7.5 dB; on the search's 5 dB grid a difference of 5 dB counts as shrunk and one of 10 dB does not.

The run counts and the time budget of the property files are test settings, not product numbers. They are stated in "Run counts and time" and are PROPOSED, NOT APPROVED (Q9).

## Which earpiece is on which ear

### Ears, earpieces and the output

An **ear** is the visitor's own left or right ear. The visitor answers by naming the side they heard a sound on, so an answer is an ear, and the threshold search, which only knows the answers, searches ears. An **earpiece** is a side of the headphones: the channel the output stage fills. The output stage's `PlayRequest.ear` names an earpiece; `structure.md` names both sides `left` and `right` everywhere, so the two are told apart by the field, never by the value.

```ts
// src/session/earpiece-on-ear.ts
/** For each ear, the earpiece on it: as marked, its own; swapped, the other. Frozen. */
export function earpieceOnEar(arrangement: EarpieceArrangement): Readonly<Record<Ear, Ear>>;

// src/session/swapped-earpiece-output.ts
/**
 * The output shell as the room runner of a swapped repeat sees it: `play` sends each request for
 * an ear to the earpiece on that ear, by `earpieceOnEar("swapped")`. Every other method is the
 * shell's own. Frozen.
 */
export function swappedEarpieceOutput(output: AudioOutput): AudioOutput;
```

The room runner of a repeat is created on `swappedEarpieceOutput(output)` (D3). It asks for a sound of the search's ear; the view sends it to the other earpiece; the sound reaches the ear the search meant, because the visitor has swapped the earpieces. Its `PlayedTrial` keeps `ear` as the ear, which is what the visit log's `ear` means ("The ear it played to").

### In the record, every answer and every sound

The repeat records its run on its own `VisitLogRecorder`, created when the room starts with the visit's type, seed and rooms and the visit's start time, so that its times are on the visit log's clock and its attempt and trial numbers start at 1. The flow never writes to the visit's own recorder after the rooms (visit-flow D28, D2 here). When the run's search finishes, `swappedRepeatRunOf` turns that recorder's log into a Repeat_Record:

```
earpieces       = earpieceOnEar("swapped")                  { left: "right", right: "left" }
trials          = each trial T of the run's log, with
                    earpiece         = T.kind is "sound" ? earpieces[T.ear] : null
                    responseEarpiece = T.status is "scored" and T.response is a side ? earpieces[T.response] : null
ignoredAnswers  = each entry A, with earpiece = earpieces[A.side]
swapChecks      = the controller's list, each with earpiece "left"
attempt         = the run's one room attempt (ending "finished", its room result)
left, right     = visitEarResult(attempt.result.<ear>, levelDiffers(run log, attempt) ? ["levelNotAsAsked"] : [])
                  (the helpers of summarize-visit.ts, exported unchanged)
rightMinusLeftDb, outcome, unclearReason, firstRightMinusLeftDb, differenceLimitDb, unclearBelowDb
                = swappedRepeatOutcome(...) (below)
pauses, refusedPlays = the run's lists, unchanged (each pause has the stage "swappedRepeat")
deep-freeze and return
```

So every sound of the repeat names its ear and its earpiece; every scored answer names the ear it named and the earpiece on that ear; every answer that scored nothing names the same; every swap check names its earpiece; and the record names which earpiece sat on which ear. The `swappedTrialScored` event holds the scored trial with both fields, and its ripple line names both ("You caught it on your left, from the right earpiece. ..."). The test hook gives the earpiece of every presented trial: the flow wraps the hook for each room runner and adds `earpiece` (the ear's own earpiece in the rooms of the visit, the other in a repeat) and `swappedRepeatRunNumber` (null in the rooms of the visit). CP3 checks all of it against the channel the backend was actually given.

### The earpiece state, and what happens when the repeat ends

The flow keeps `earpieces: EarpieceState` for the visit (D5):

| Moment | State | Why |
|---|---|---|
| The visit's headphone check is answered `correct` | `asMarked` | The check found the left earpiece on the left ear. Every room of the visit runs then |
| The stage enters `instruction` | `unknown` | The visitor was asked to swap; nothing has checked it |
| A swap check is answered `confirmed` | `swapped` | The hiss of the left earpiece was heard on the right |
| A swap check is answered anything else | `unknown` | |
| The stage is left in any way after `instruction` was shown: `proceed`, `stop`, a left page, from any phase | `unknown` | The visitor is told to turn back, and nothing checks it |
| `backToFrontDoor` | dropped with the visit | The next visit's headphone check decides it again |

The phase `finished` gives the Turn_Back_Line, and so does every `result` snapshot while the state is not `asMarked`: "If the headphones are still swapped, turn them back now, so that the left earpiece is on your left ear." It is the same line whether the visitor swapped or not, finished or not, because the house cannot tell (Q7). Nothing later in the visit relies on the earpieces: `startSwappedRoom` acts only in the state `swapped`, which only a confirmed check of the same repeat sets; a second repeat starts from its own instruction and check, which give the right answer whether or not the visitor turned the headphones back in between; and no other stage of a finished visit plays a sound. A new visit runs its own headphone check before any room. CP3 checks that no trial sound is played while the state is not `asMarked` in a room or `swapped` in a repeat.

## The outcome

### `swappedRepeatOutcome(input, settings)`

```ts
// src/session/swapped-repeat-outcome.ts
export interface SwappedRepeatOutcomeInput {
  /** The floor's first run, as the summary gives it. Both ears found, at least the limit apart. */
  readonly first: { readonly left: VisitEarResult; readonly right: VisitEarResult };
  /** The repeat's ears, after `levelNotAsAsked`. */
  readonly repeat: { readonly left: VisitEarResult; readonly right: VisitEarResult };
}
export interface SwappedRepeatOutcomeSettings {
  readonly differenceLimitDb: number;   // hearingMethodConfig.swappedRepeatDifferenceDb
  readonly unclearBelowDb: number;      // that × swappedRepeatConfig.unclearBelowLimitFraction
}
export interface SwappedRepeatJudgement {
  readonly outcome: SwappedRepeatOutcome;
  readonly unclearReason: SwappedRepeatUnclearReason | null;
  readonly firstRightMinusLeftDb: number;
  readonly rightMinusLeftDb: number | null;
  readonly differenceLimitDb: number;
  readonly unclearBelowDb: number;
}
export function swappedRepeatOutcome(
  input: SwappedRepeatOutcomeInput,
  settings: SwappedRepeatOutcomeSettings = shippedOutcomeSettings,
): SwappedRepeatJudgement;
```

```
d1 = first.right.thresholdDb − first.left.thresholdDb       (RangeError unless both found and |d1| ≥ differenceLimitDb)
RangeError unless 0 < unclearBelowDb ≤ differenceLimitDb, both finite
repeat.left or repeat.right not found        → unclear, noLevel,           rightMinusLeftDb null
d2 = repeat.right.thresholdDb − repeat.left.thresholdDb
|d2| < unclearBelowDb                         → unclear, differenceShrank
sign(d2) = sign(d1)                           → followsEar
otherwise                                     → followsEarpiece
```

Both differences are right minus left by **ear**. In the first run the earpieces were as marked, so the ear that needed the louder sound wore its own earpiece; in the repeat it wore the other one. If d2 has the sign of d1, the same ear needed the louder sound both times, with a different earpiece each time: the brief's "follows the ear". If the sign is the other, the other ear needed the louder sound in the repeat, and that ear wore the earpiece that the first ear wore in the first run: the same earpiece needed the louder sound both times, the brief's "follows the earpiece". The size test comes first, so d2 = 0 is unclear. An unreliable repeat, a repeat quieter than the house can whisper on one side, and one not caught at the loudest on one side all have no level on that side and are unclear (`hearing-method.md`: "An estimate is only presented as a threshold in the first state").

The repeat's ears are judged as `summarizeVisit` judges a room: the search's result, with `levelNotAsAsked` added when a scored sound trial of the run was played at another level than asked (D10). The visit's pooled false alarm rule is not applied again: the first run offered the repeat, so the visit was not above the visit limit, and applying it to the repeat would need a new pooled count that changes nothing in the summary. The search's own per-room false alarm rule still acts on the repeat.

In the language of the brief's property, with an Ear_Difference E (true right minus true left threshold) and a Headphone_Imbalance H (how much quieter the right earpiece plays), the first run measures about E + H and the repeat about E − H, each within the search's error. "Correctly attributed" therefore means: the outcome the rule gives for D1 = E + H and D2 = E − H. "Measurements" shows how far that is from the brief's literal sentences. The owner decided on 2026-11-15 that the property states the rule's own answer, with the brief's sentences asserted where one of E and H is zero, and that the rule of the brief is kept as it is (Q1, option (a)).

## The repeat in the visit flow

### The Repeat_Controller (`create-swapped-repeat.ts`)

The Repeat_Controller holds one visit to the stage: its phase, its swap checks, the room run and its recorder, and the view. Gestures, the snapshot's pause field, the earpiece state of the visit and the stage stay in the flow (D22), so the controller can be tested on a calibrated output shell and a manual timer without a whole visit (CP3 to CP9).

```ts
export interface SwappedRepeatOptions {
  readonly output: AudioOutput;
  /** The visit's timer: its callbacks run as steps of the flow and stop when the visit is dropped. */
  readonly timer: Timer;
  readonly log: VisitLog;
  readonly summary: VisitSummary;
  readonly roomIndex: number;
  /** The number this repeat's room run will have if it starts. */
  readonly runNumber: number;
  /** The timer's time when the visit began, so that the run's times are on the log's clock. */
  readonly visitStartedAtMs: number;
  /** Null, or why the repeat cannot run (D8). */
  readonly unavailable: SwappedRepeatUnavailableReason | null;
  /** The visit's render source (visit-flow D19). */
  readonly soundRandom: RandomSource;
  /** Draws the engine seed from the visit's source when the room starts. */
  readonly drawEngineSeed: () => number;
  readonly latestOffset: LatestOffset;
  readonly emit: (event: SwappedTrialScoredEvent) => void;
  /** A play was refused `notRunning`: the flow acts as on a stop report with this reason. */
  readonly notRunning: (reason: StopReason) => void;
  /** The run ended with a record. The flow adds it to the visit's list. */
  readonly recorded: (run: SwappedRepeatRun) => void;
  readonly onTrialPresented?: (trial: FlowPresentedTrial) => void;
  readonly settings?: SwappedRepeatSettings;   // the outcome's settings and floorDb
}

export interface SwappedRepeatController {
  phase(): SwappedRepeatPhase;
  /** Whether a sound of this repeat may be under way: from a scheduled hiss or trial to its end, or a room run that has not ended. */
  mayBeSounding(): boolean;
  view(input: { readonly earpieces: EarpieceState; readonly pauseReason: SwappedRepeatPauseReason | null }): SwappedRepeat;
  /** instruction → check. */
  confirmSwap(): void;
  /** In `check`, once sound runs: playHeadphoneCheck; sets awaitingAnswer, or the refusal. */
  playCheck(): void;
  /** In `check` with a check waiting: judges it, adds it to the list; gives the judgement, or null when ignored. */
  answerCheck(answer: HeadphoneCheckAnswer): SwapCheckJudgement | null;
  /** A hidden page or an interruption in `check`: the waiting check counts as not played. */
  checkCut(): void;
  /** ready → room, once sound runs: beginRoom, the engine seed, the recorder, the runner, start. */
  startRoom(): void;
  answer(side: Ear, pressedAtMs?: number): void;
  /** In `room`: the runner pauses (discarding a presented trial), the pause is written to the run's recorder. Returns whether it paused. */
  pause(reason: SwappedRepeatPauseReason): boolean;
  /** After the pause: ends it in the run's recorder; with a calibration the runner resumes, without one `finished` with deviceChanged. */
  resume(): void;
  /** The calibration is gone: before the room → unavailable, calibrationGone; in the room → the run is abandoned, finished, deviceChanged. */
  calibrationGone(): void;
  /** The stage is being left: cancels every timer; a run under way is abandoned and gives no record. */
  leave(): void;
}

export function createSwappedRepeat(options: SwappedRepeatOptions): SwappedRepeatController;
```

```
create:          phase = unavailable ? "unavailable" : "instruction"

confirmSwap():   instruction → check; againLine cleared; nothing plays

playCheck():     check only
                 outcome = output.playHeadphoneCheck(soundRandom)          the left earpiece, headphoneCheckLevelDb
                 refused notRunning     → notRunning(the shell's reason, or "interrupted")
                 refused notCalibrated  → calibrationGone()
                 refused other          → playRefusal = reason (nothing counted; the visitor may press again)
                 scheduled              → awaitingAnswer = true; judgement, cutLine, playRefusal cleared;
                                          hissEndsAtMs on the page clock (as the replay puts a sound's end)

answerCheck(a):  check and awaitingAnswer only
                 j = judgeSwapCheck(a); add { answer: a, judgement: j, earpiece: "left", answeredAtMs } to swapChecks
                 awaitingAnswer = false
                 confirmed           → ready
                 notSwapped          → instruction, with againLine
                 bothSides, notHeard → stay in check with the judgement's line
                 return j

startRoom():     ready only
                 output.beginRoom()                                              the rise limit starts afresh (R17.4)
                 report = output.rangeReport(); report null → calibrationGone(); return
                 searchCapDb = roomSearchCapDb(report.rooms[room.roomId].topLevelDb, hearingMethodConfig)
                 (equals the first run's searchCapDb: the same calibration gives the same top; checked, D9)
                 engineSeed = drawEngineSeed()
                 recorder = createVisitLogRecorder({ visitType, visitSeed, rooms, startedAtMs: visitStartedAtMs })
                 attempt  = recorder.attemptStarted({ roomIndex, engineSeed, calibrationIndex, searchCapDb, startedAtMs: now })
                 search   = createThresholdSearch({ settings: { ...hearingMethodConfig, capRelativeToAnchorDb: searchCapDb },
                                                    random: createSeededRandom(engineSeed) })
                 runner   = createRoomRunner({ output: swappedEarpieceOutput(output), timer, search, room, attempt,
                                               soundRandom, recorder, latestOffset,
                                               scored: (entry) → emit swappedTrialScored with the trial's earpieces,
                                               finished: (result) → attemptEnded finished; record = swappedRepeatRunOf(...);
                                                                    recorded(record); phase finished, ending finished,
                                               pauseFromOutput: → notRunning(the shell's reason, or "interrupted"),
                                               soundRefused: → output.stopAll(); attemptEnded abandoned; finished, soundRefused,
                                               onTrialPresented: hook with earpiece and runNumber })
                 phase = room; runner.start()

calibrationGone(): instruction, check, ready → unavailable, calibrationGone
                   room → runner.abandon(); close an open pause; attemptEnded abandoned; finished, deviceChanged
leave():         clear timers; a run not ended → runner.abandon(); no record
```

The run's search is created as `startRoom` in the flow creates the search of every room, with the same settings and a cap from the same function, and played by the same room runner, so its gaps, no-sound trials, response window, scoring and refusal rule are those of every room (D9). Its only differences are the output view, the recorder it writes to, the callbacks and the seed, which is the next draw of the visit's source.

### `swappedRepeatEngineSeed(log, runNumber)`

```ts
// src/session/swapped-repeat-engine-seed.ts
export function swappedRepeatEngineSeed(log: VisitLog, runNumber: number): number;
```

```
source = createSeededRandom(log.visitSeed); draw = floor(source.next() × 2³²)
draw once                                         the visit's render seed (visit-flow D19)
draw once for each entry of log.roomAttempts      the engine seeds of the rooms
draw once                                         the replay's render seed (missed-sound-replay R14.2)
draw runNumber − 1 times                          the engine seeds of the earlier repeat runs, ended or not
return the next draw
```

It throws a `RangeError` unless `runNumber` is a whole number of at least 1. The flow draws from the visit's source and does not call this function, so that a later spec can draw after it; a unit test and CP4 check that the two are equal. A run that did not end still drew its seed, which is why the Run_Number counts runs that gave no record (R11.5).

### What the flow does

The flow keeps its stage machine. The `Visit` gains `startedAtMs`, `earpieces` (set to `asMarked` by a `correct` headphone check), `swappedRepeats` (the records, in order), `repeatRunCount` and `repeat` (the controller of the stage, or null). Nothing it does in another stage changes.

**`chooseSwappedRepeat(roomIndex)`.** As today, in `result` with no Pause, for a floor whose summary offers the repeat, and now also only when `swappedRepeats` holds no record of that floor (Q4). The flow finds the calibration the floor's first run used (the `calibrationIndex` of the floor's last finished attempt in the log) and compares it with the shell: `output.rangeReport()` null gives `calibrationGone`; a last kept calibration of another index gives `calibrationChanged` (D8, Q6). It creates the controller with `runNumber = repeatRunCount + 1` and enters the stage. When the phase is `instruction`, `earpieces` becomes `unknown`. Nothing plays.

**`confirmSwap()`, `answerSwapCheck(answer)`.** In the stage with no Pause, passed to the controller. A `confirmed` judgement sets `earpieces` to `swapped`; any other judgement sets it to `unknown`.

**`playSwapCheck()`, `startSwappedRoom()`.** In the stage with no Pause and the right phase: `withSound(() => { if the visit, the stage, the phase and the pause are unchanged: controller.playCheck() })`, or for the room, with `earpieces === "swapped"`, `repeatRunCount += 1` and `controller.startRoom()`. `withSound` calls `activate` within the call when the shell does not run, as every gesture of the flow does (visit-flow R2.5), and sets `activationRefused` when the browser saw no press.

**`answer(side, pressedAtMs)`.** As today in `room`; in the stage's phase `room` with no Pause, passed to the controller.

**`pause()`.** As today in `room`; in the stage's phase `room` with no Pause: `controller.pause("visitor")`, the snapshot's `pause = { reason: "visitor" }`, then `output.stopAll()`. The flow's `beginPause` is not used here, because it writes to the visit's recorder.

**Stop reports.** `onOutputStopped(reason)` gains a first branch for this stage, before the check of `pausableStages`, which stays as it is:

```
repeatStopped(reason):
  control                → nothing: the flow caused it (stop, pause, back)
  pageLeft               → controller.leave(); pause = null; leaveRepeat(); result
  deviceChanged          → pause = null; controller.calibrationGone()
  hidden, interrupted    → phase room and pause null and controller.pause(reason) → pause = { reason }
                           phase check → controller.checkCut()
                           elsewhere   → nothing
```

**`resume()`.** As today, `withSound(endPause)`. `endPause` gains a first branch for this stage: `pause = null; controller.resume()`, and returns before it reaches the visit's recorder.

**`proceed()` and `stop()`.** `proceed` keeps its meaning in this stage, back to the result (visit-flow R16.5); `stop` keeps its (visit-flow R14.3). Both now, before entering `result`: `stop` has already called `stopAll`; `proceed` calls it when `controller.mayBeSounding()`; then `controller.leave()`, `pause = null` and `leaveRepeat()`, which sets `earpieces` to `unknown` when the stage got past `unavailable`, clears `swappedRoom` and the controller.

**The end.** When the run's search finishes, the controller calls `recorded(run)`, and the flow adds the record to `swappedRepeats`. The phase `finished` waits for `proceed`, as the replay's end does (missed-sound-replay D17).

**A play refused `notRunning`** reaches the flow through the controller's `notRunning` callback and is handled as a stop report with that reason, as in a room.

**`unsupported`.** An unsupported report can only come from `activate`, here inside `playSwapCheck`, `startSwappedRoom` or `resume`. The flow handles it as in every stage (visit-flow R15.1): it shows the `unsupported` stage and drops the visit. This spec does not change that ("Found in the existing code").

**The snapshots.** `buildSnapshot` for this stage gives the existing fields and `repeat: controller.view({ earpieces, pauseReason })`. For `result` it gives the existing fields and `swappedRepeats: Object.freeze([...visit.swappedRepeats])` and `turnBackLine: earpieces === "asMarked" ? null : swappedRepeatCopy.turnBackLine`. The view is a pure function of the controller's state; in the phase `room` it depends on nothing but the pause, so the flow's comparison of plain data publishes no snapshot between a trial's presentation and its scoring (visit-flow R11.4, R16 here).

**Leaving the visit.** `dropVisit` clears the visit's timer handles, which include the controller's and its runner's, and now also calls `controller.leave()`, so a dropped visit plays nothing more (visit-flow D35).

### `swappedRepeatView(input)`

```ts
// src/session/swapped-repeat-view.ts — pure; every string from src/copy; deep-frozen
export function swappedRepeatView(input: {
  readonly roomSummary: RoomSummary;
  readonly phase: SwappedRepeatPhase;
  readonly earpieces: EarpieceState;
  readonly unavailable: SwappedRepeatUnavailableReason | null;
  readonly again: boolean;                       // instruction after notSwapped
  readonly awaitingAnswer: boolean;
  readonly playRefusal: PlayRefusal | null;
  readonly judgement: SwapCheckJudgement | null;
  readonly cut: boolean;
  readonly runNumber: number;
  readonly pauseReason: SwappedRepeatPauseReason | null;
  readonly ending: SwappedRepeatEnding | null;
  readonly record: SwappedRepeatRun | null;
  readonly floorDb: number;
}): SwappedRepeat;
```

It fills each phase of the contract from `swappedRepeatCopy` and `swapped-repeat-lines.ts`, the room's name and pitch from `room-copy.ts`, the first run's difference from `differenceLabel`, and in `finished` the Comparison of `swappedRepeatComparison(roomSummary, record, floorDb)` when the ending is `finished`.

## The result page

### The Comparison (`swapped-repeat-comparison.ts`)

```ts
export function swappedRepeatComparison(
  firstRun: RoomSummary,
  run: SwappedRepeatRun,
  floorDb: number,
): SwappedRepeatComparison;
```

```
scale      = { searchCapDb: firstRun.searchCapDb, floorDb }               the floor's own scale (result-page D15, D16)
wing(result, ear, earpiece) = { ear, earpiece, earpieceLabel: earpieceLabels[earpiece], state,
                                thresholdDb (found only), lightDepthFraction(result, scale),
                                line: wingLine(...), reasonLine: the first reason's line or null }
runs[0]    = { arrangement: "asMarked", label, left: wing(firstRun.left, left, left), right: wing(firstRun.right, right, right),
               rightMinusLeftDb: firstRun.rightMinusLeftDb, differenceLabel }
runs[1]    = { arrangement: "swapped", label, left: wing(run.left, left, right), right: wing(run.right, right, left),
               rightMinusLeftDb: run.rightMinusLeftDb, differenceLabel }
outcome, unclearReason from the record; outcomeLabel, outcomeLines, description from the copy
RangeError when run.roomIndex is not firstRun.room.roomIndex
```

Both runs are drawn on the floor's own scale. The repeat used the calibration and the search cap of the first run (D8, D9), so a depth in the repeat means what a depth in the first run means on that floor, and nothing across floors (`product.md`: "Floors are never compared with each other").

### `resultPicture`

Each floor gains `repeat`: the Comparison of the record of that floor in `visit.swappedRepeats` (live) or `savedVisit.swappedRepeats` (saved), or null; a missing list is empty. The floor's `swappedRepeat` offer is null when the floor has a record (Q4). Every other field of the floor and of the picture is what it is today for the same summary (R12.3): the repeat changes no wing, no depth, no difference and no description of the first run, and corrects nothing (brief, "Out of scope"). The earlier visit's outlines and the `comparison` line read the summaries alone, so they are the same with and without repeats on either side (R12.5, CP11).

### Saved visits (`saved-visit-payload.ts`, `create-visit-archive.ts`)

**Writing.** `savedVisitPayloadJson(visit)` writes the key `swappedRepeats` with `visit.swappedRepeats` unchanged when it has at least one record, after `visitLog`. A visit without a record is written exactly as before this spec, byte for byte (D17). `formatVersion` stays 1: the new key is optional, and the reading code of before this spec ignores keys it does not know, so a payload with repeats still reads in a page of before this spec, without its repeats.

**Reading.** `SavedVisitPayload` gains `swappedRepeats: readonly SwappedRepeatRun[]`. A payload without the key gives `[]`: every visit saved before this spec reads as before, with no repeat, and its picture is what it was. A payload with the key is readable only when `swappedRepeatRunsHold(runs, summary, visitLog)` holds; otherwise the whole entry is unreadable, as any other broken rule makes it (result-page, "Checking a payload"). The rules:

1. `swappedRepeats` is an array of plain objects, none of `formatVersion` other than 1.
2. Each `roomIndex` is a room of the log; its room summary offers the repeat and has both ears `found`; no two records have the same `roomIndex` (Q4).
3. `runNumber` is a whole number of at least 1, strictly increasing along the list.
4. `calibrationIndex` is the `calibrationIndex` of the floor's last finished attempt in the log.
5. `earpieceOnEar` is exactly `{ left: "right", right: "left" }`.
6. `swapChecks`, `trials`, `ignoredAnswers`, `pauses` and `refusedPlays` are arrays; the last swap check is `confirmed`; every sound trial's `earpiece` is `earpieceOnEar[ear]` and every no-sound trial's is null; every ignored answer's `earpiece` is `earpieceOnEar[side]`.
7. `attempt` is a plain object with the record's `roomIndex`, attempt 1, ending `finished` and a result object.
8. `left` and `right` meet rule 4 of a room summary (the ear result rule); `rightMinusLeftDb` is right minus left when both are found and null otherwise.
9. `firstRightMinusLeftDb` equals the floor summary's `rightMinusLeftDb`.
10. `differenceLimitDb` and `unclearBelowDb` are finite, `0 < unclearBelowDb ≤ differenceLimitDb`.
11. `outcome` and `unclearReason` are what `swappedRepeatOutcome` gives for the floor summary's ears and the record's ears with the record's own `differenceLimitDb` and `unclearBelowDb`.

The trials are not checked against the engine, as the log's are not (result-page D9). The saved visit's `swappedRepeats` is the parsed list, deeply frozen. `savedVisitOf` in the archive adds it.

**A visit saved before its repeat.** The archive keys a visit saved on this page by its log object, and a second `save` of the same log only renames (result-page, "The archive"). The repeat leaves the log object as it was, so without a change a visit saved before its repeat and saved again after it would keep no repeat. Decided by the owner on 2026-11-15 (Q5, option (a)):

- The store gains `changePayload(savedVisitId, payloadJson)` in `src/storage/visit-store-types.ts` and `create-visit-store.ts`: it gives one entry a new payload and a new checksum and keeps its id, its dates, its visit type, its headphone name, its place in the list and every other entry and unknown field as they were, in one `setItem`, as `changeName` does for the name. It refuses as `changeName` does: `unavailable`, `unreadable`, `refused`, `full` and `notFound`, and never throws. Its test in `create-visit-store.test.ts` follows the `changeName` cases: the payload changed and every other field kept, the checksum new and valid, each refusal, a full quota that leaves the stored text unchanged. This is the one change of this spec under `src/storage/`.
- `save`, given a log it saved before whose saved copy is still listed, compares the records with the private `lacksRepeats(visit, savedCopy)` below. When the visit now holds records the saved copy lacks, it writes the visit's new payload with `changePayload`, checked first with `parseSavedVisitPayload` as a new save is, and gives `saved: true`, the saved visit as `list()` now gives it, `renamed: false` and the line `swappedRepeatCopy.savedAgainLine`. The saved visit keeps its id, date and name: a different name typed in the same press is not applied by that call, and the next press, which then finds nothing lacking, renames as today. A refused `changePayload` gives the refusal as a save refusal; `notFound` falls through to a new save, as a rename that finds its entry gone does. When nothing is lacking, `save` renames as today.
- The page shows its save control again while the live result holds records its saved copy lacks. The page compares nothing (the sub-question of Q5, chosen by the owner's coordinator on 2026-11-15; the owner may reverse it). The archive says it:

```ts
// src/session/result-page-types.ts, in VisitArchive (see "The additions to result-page-types.ts")
savedCopyLacksRepeats(visit: VisitToSave): boolean;
```

```
savedCopyLacksRepeats(visit):
  robot mode                                   → false
  id = savedIds.get(visit.visitLog); none      → false        (this page has not saved this visit)
  read(); not ready, or id not listed          → false        (no saved copy to lag; a save adds a new one)
  lacksRepeats(visit, listed)                  → true or false
lacksRepeats(visit, savedCopy) = some record r of (visit.swappedRepeats ?? []) such that
                                 no record of savedCopy.swappedRepeats has r.runNumber
```

`save` and `savedCopyLacksRepeats` use the same `lacksRepeats`, so the control the page shows and what a press does cannot disagree. Run numbers identify a record: they are unique within a visit and strictly increase along its list (R11.5, rule 3 of "Checking a payload"). The method reads local storage at each call, as `list()` does, and catches what the store catches, so it never throws. Until the task that saves records, it answers false (task 1, R1.6).

Its tests, in `create-visit-archive.test.ts`: false for a visit never saved; false right after a save; true for a `VisitToSave` with the same log and one more record; false again after `save` of that visit, which gives `savedAgainLine`; false after the saved copy was deleted; false in robot mode, with `options.localStorage` never called; false when local storage is missing, throws or holds an unreadable value; and its answer equals whether a `save` would give `savedAgainLine`. Its property is CP11 (below): for every sequence of saves, added records, renames and deletes on a fake storage area, it is true exactly when the rule above says so, it is false after every `save` that gives `saved: true`, and it never throws, also on the stored values CP11 changes.

**Comparison with an earlier visit.** `findEarlierVisit` reads names and ids; `resultPicture`'s comparison reads the earlier visit's summary. Neither reads a repeat. So the comparison works for every pair of saved visits, with or without repeats, and with either saved before this spec (R13.7, CP11). Only the same person with the same headphones is compared, as before (`product.md`).

## Which limits of the output stage act on each sound of the repeat

The stage plays two kinds of sound: the swap check, through `playHeadphoneCheck` (Purpose `headphoneCheck`), and the room's trials, through `play` with the Purpose `trial`, by way of the room runner and the earpiece view. From `create-audio-output.ts`, `prepare-playback.ts`, `render-playable-buffer.ts` and the audio-output spec. Nothing in the output stage changes, and this spec lifts no limit.

| Limit | Where | Swap check | Room trial | Why |
|---|---|---|---|---|
| One way to the speakers, rendered from a Sound_Id | `playHeadphoneCheck`, `play` | Acts | Acts | Rule 1. The flow passes a Sound_Id and never samples; the earpiece view only changes `ear` of the request |
| Running and calibrated | `notRunning`, `notCalibrated` | Acts | Acts | A stopped shell plays nothing; a device change forgets the calibration, and the repeat does not calibrate again (D8) |
| Peak bound, up to 8 renders | `renderPlayableBuffer` | Acts | Acts | |
| Sample rate at least 22050 Hz; empty, over 1500 ms or not finite refused; level and gains finite | preparation steps 1 to 3 | Acts | Acts | Rule 6. The hiss lasts 1500 ms, the room sounds 800 to 1400 ms |
| One channel only | step 4 | Acts: the left channel | Acts: the channel of the earpiece on the trial's ear | Rule 5 |
| Output fade of 25 ms, and the check of at least 20 ms | steps 5 and 11 | Acts | Acts | Rule 3 |
| Anchor cap, 15 dB | step 6 | Acts; never lowers: the hiss is at `headphoneCheckLevelDb`, 0 dB | Acts; never lowers: every level is at most the search cap, the room top on the 5 dB grid | Rule 2 |
| Rise limit, one upward step (5 dB) per channel since `beginRoom` | step 7 | Acts | Acts | Rule 4. The flow calls `beginRoom` after the last swap check and before the first trial, so within the room the limit runs per earpiece. The earpiece of each ear is fixed for the whole run, so a rise per earpiece is a rise per ear, which is what rule 4 asks. The search's own steps already keep every rise within one upward step per ear |
| Ceiling, 0.25 of full scale | steps 8 and 11 | Acts | Acts; never lowers at or below the room top (audio-output R9.4) | Rule 2 |
| Exact zero on the other channel | step 10 | Acts | Acts | Rule 5 |
| One sound at a time (`busy`) | `schedule` | Acts | Acts | See the next table |
| Previous gain recorded per channel; clamp log | `schedule` | Acts | Acts | A clamp would be logged with its Purpose, and a trial played at another level than asked makes the ear `levelNotAsAsked` (D10) |
| Stop fade of 20 ms to exact zero; suspend or close after it | `stop` | Acts | Acts | Rule 7: `stopAll` from stop, pause and back; every page event |
| Replay exemption from the rise limit | `previousAppliedGain: null` for the Purpose `replay` | Not used | Not used | The stage plays nothing with the Purpose `replay` |
| Calibration limits | calibration only | Not applied | Not applied | The repeat does not calibrate (brief) |

### Which sound of the repeat can be refused `busy`

The output stage refuses a sound `busy` while an earlier one has not ended (audio-output D16). The lesson of the replay (its regression 4) is that this must be stated for every sound, with what then happens. The figures are config values: the hiss lasts 1500 ms (`ghostSoundConfig.calibration.durationMs`), a sound starts `scheduleLeadMs` = 50 ms after its request, the shortest gap before a trial is `gapBetweenTrialsMinMs` = 1500 ms, the longest room sound lasts 1400 ms, and the stop fade is 20 ms.

| Sound | Can it be refused `busy`? | What then |
|---|---|---|
| The swap check, first press | Only when a sound still plays as the stage is used: after a skipped replay the stop fade of 20 ms is over long before a person reaches this press; a simulated visitor could press within it | `playRefusal` is `busy` with its line; nothing is counted; the visitor presses again. There is no limit on the number of presses |
| The swap check, a press while its own hiss plays | Yes: a second press within 1550 ms of the first | The same: the line, nothing counted, the hiss that plays is the one the answer belongs to |
| The first trial of the room | Only in a window of 50 ms: the visitor plays the check, answers at once while the hiss plays, presses start at once, and the search's first gap is its shortest. The hiss then ends at most 1550 ms after the press of play and the first request comes at least 1500 ms after the press of start | The room runner counts it as one refusal, logs it in the run's `refusedPlays`, and presents the same trial again after its own gap, at least 1500 ms later, when the hiss has ended. So the hiss can give at most one `busy` refusal in a row, below the three that end the run. The refusal is in the record and changes no result. CP6 checks that no run ends `soundRefused` from `busy` refusals alone |
| A later trial | No: a trial is decided at the earliest when its window opens, which is when its sound starts, and the next request comes at least 1500 ms after that, after the longest room sound (1400 ms) has ended. A cut sound has faded out in 20 ms, and the waiting trial is presented again after its own gap | — |
| A trial after `resume` | No: the stop fade ended the sound, and the trial comes after its own gap | — |
| Anything after the repeat | Nothing plays after the repeat in a finished visit | — |

Should the owner prefer that no `busy` refusal can happen at all, the start control could wait for the end of the hiss; that needs no number but adds a state, and is not proposed because the refusal is harmless and recorded.

## The copy

Every string below is the full wording. The copy files import only `src/config` and other files of `src/copy` (`roomNames`, `pitchLabel`, `relativeLevelLabel`, `roomCopy` from `room-copy.ts`; `headphoneCheckCopy`; `calibrationCopy.keptLine`; `leavingCopy.pauseLines`; `limitsStatement`; `differenceLabel`, `wingLine` and `unreliableReasonLine` from `result-lines.ts`). Every function throws a `RangeError` for a value that does not fit, as the existing copy functions do. A level is always given by `relativeLevelLabel`, so relative to the visitor's calibration; a difference only by `differenceLabel`, which names the side the quieter sound was caught on (result-page D19).

### `src/copy/swapped-repeat-copy.ts`

```ts
/** Every fixed string of the swapped repeat (swapped-repeat design.md, "The copy"). */
export const swappedRepeatCopy = Object.freeze({
  heading: "This room again, with the headphones swapped",
  backButton: "Back to the picture",
  stopButton: "Stop the sounds",
  instructionLines: Object.freeze([
    "Take the headphones off and put them on the other way round: the left earpiece on your right ear, and the right earpiece on your left ear.",
    calibrationCopy.keptLine,   // "Leave your system volume where it is now. The house keeps every sound below its limit only if you do not turn the volume up."
    "When they are on, the house plays a hiss in one earpiece, so that you can check the swap.",
  ]),
  againLine:
    "The hiss was on your left, so the headphones are still the way they were. Put the left earpiece on your right ear and the right earpiece on your left ear, then check again.",
  confirmButton: "They are swapped",
  playCheckButton: headphoneCheckCopy.playButton,   // "Play the check"
  question: headphoneCheckCopy.question,            // "Which side was the hiss on?"
  answers: headphoneCheckCopy.answers,
  /** The keys are the swap check's judgements that keep the visitor in the check, and `confirmed`. */
  judgementLines: Object.freeze({
    confirmed: "The hiss came from the left earpiece and you heard it on your right. The headphones are swapped.",
    bothSides: headphoneCheckCopy.judgementLines.bothSides,
    notHeard: headphoneCheckCopy.judgementLines.notHeard,
  }),
  cutLine: "The hiss was cut off. Play the check again.",
  playRefusedLine: "The house could not play the hiss just now. Try again in a moment.",
  startButton: "Go into the room",
  pauseButton: roomCopy.pauseButton,                // "Pause"
  resumeButton: roomCopy.goOnButton,                // "Go on"
  /** The keys are the repeat's pause reasons. */
  pauseLines: Object.freeze({
    visitor: leavingCopy.pauseLines.visitor,
    hidden: leavingCopy.pauseLines.hidden,
    interrupted: leavingCopy.pauseLines.interrupted,
  }),
  /** The keys are the unavailable reasons. */
  unavailableLines: Object.freeze({
    calibrationGone:
      "Your audio device changed after the rooms, so the house no longer has your calibration. This room cannot be visited again on this visit. Your picture has not changed.",
    calibrationChanged:
      "Your audio device changed after this room, so the house would play it with another calibration. This room cannot be visited again on this visit. Your picture has not changed.",
  }),
  /** The keys are the endings. */
  endLines: Object.freeze({
    finished: "That was this room again, with the headphones swapped.",
    deviceChanged:
      "Your audio device changed, so the house stopped the room. Your picture has not changed.",
    soundRefused:
      "The house could not play its sounds on this device, so it stopped the room. Your picture has not changed.",
  }),
  turnBackLine:
    "If the headphones are still swapped, turn them back now, so that the left earpiece is on your left ear.",
  comparisonHeading: "This room both ways round",
  /** The keys are the arrangements. */
  runLabels: Object.freeze({ asMarked: "Headphones as marked", swapped: "Headphones swapped" }),
  /** The keys are the earpieces. */
  earpieceLabels: Object.freeze({ left: "Left earpiece", right: "Right earpiece" }),
  /** The letters printed on headphones, which the page draws on a small sketch of the swapped headphones. The keys are the earpieces. */
  earpieceMarks: Object.freeze({ left: "L", right: "R" }),
  /** The keys are the outcomes. */
  outcomeLabels: Object.freeze({
    followsEar: "The difference stayed with your ears",
    followsEarpiece: "The difference moved with the headphones",
    unclear: "Not clear",
  }),
  savedAgainLine: "The saved visit now holds the room you visited again.",   // Q5, decided by the owner on 2026-11-15
  /** Shown beside the save control while `archive.savedCopyLacksRepeats` is true (the sub-question of Q5, chosen by the owner's coordinator on 2026-11-15). */
  savedCopyLacksLine: "The saved visit does not hold the room you visited again yet. Save again to add it.",
});
```

`answers` and `question` are those of the visit's headphone check, so the visitor answers the same question with the same labels. The pause lines are the visit's: "The visit is paused. The sound you were waiting for will come again later." and the two for a hidden page and an interruption.

`savedCopyLacksLine` and `earpieceMarks` were added on 2026-11-15 at the request of the owner's coordinator, who builds the page and needs every string it shows in `src/copy`. Their wording is the coordinator's proposal; the owner has not decided it. The page shows `savedCopyLacksLine` beside its save control while `savedCopyLacksRepeats` is true, and draws `earpieceMarks`, the letters printed on headphones, on a small sketch of the swapped headphones. The keys of `earpieceMarks` are the earpieces, `left` and `right`, as `structure.md` asks of every name in code; only the strings are the letters printed on the headphones.

### `src/copy/swapped-repeat-lines.ts`

```ts
export type SwapSideName = "left" | "right";
export type SwappedRepeatOutcomeName = "followsEar" | "followsEarpiece" | "unclear";
export type SwappedRepeatUnclearReasonName = "noLevel" | "differenceShrank";

export function readyLines(roomId: GhostSoundId, frequencyHz: number): readonly string[];
export function swappedCaughtLine(ear: SwapSideName, earpiece: SwapSideName, frequencyHz: number, levelDb: number): string;
export function outcomeLines(outcome: SwappedRepeatOutcomeName, unclearReason: SwappedRepeatUnclearReasonName | null): readonly string[];
export function comparisonDescription(input: ComparisonWords): string;   // plain values of both runs and the outcome
```

`swapped-repeat-types-match.test.ts` checks that `SwapSideName` equals `Ear`, `SwappedRepeatOutcomeName` equals `SwappedRepeatOutcome`, `SwappedRepeatUnclearReasonName` equals `SwappedRepeatUnclearReason`, and that the keys of `judgementLines` are `confirmed` and the judgements of `SwappedRepeatCheck["judgement"]`, of `pauseLines` exactly `SwappedRepeatPauseReason`, of `unavailableLines` exactly `SwappedRepeatUnavailableReason`, of `endLines` exactly `SwappedRepeatEnding`, of `runLabels` exactly `EarpieceArrangement`, of `earpieceLabels` exactly `Ear`, of `earpieceMarks` exactly `Ear` and of `outcomeLabels` exactly `SwappedRepeatOutcome`.

| Function and input | Output |
|---|---|
| `readyLines("stairs", 4000)` | 1. `Stairs, 4 kHz. The room runs again just as it did before.` 2. `Say on which side you hear each sound, as you did the first time. The side is your own ear, whichever earpiece is on it.` |
| `swappedCaughtLine("left", "right", 4000, -35)` | `You caught it on your left, from the right earpiece. 4 kHz, 35 dB quieter than your calibration.` |
| `swappedCaughtLine("right", "left", 1000, 0.2)` | `You caught it on your right, from the left earpiece. 1 kHz, as loud as your calibration.` |
| `swappedCaughtLine(e, e, f, l)` (ear and earpiece the same side) | `RangeError`: in a repeat each ear wears the other earpiece |
| `outcomeLines("followsEar", null)` | 1. `When you swapped the headphones, the same ear needed the louder sound. So the difference seems to belong to your ears.` 2. `limitsStatement.sentences[3]`: `See a hearing professional if a difference between your left and your right is still there after you swap the headphones, if your hearing changes suddenly, or if ringing in your ears does not go away.` |
| `outcomeLines("followsEarpiece", null)` | 1. `When you swapped the headphones, the same earpiece needed the louder sound. So the difference seems to belong to the headphones.` |
| `outcomeLines("unclear", "differenceShrank")` | 1. `The swap did not make it clear where the difference belongs.` 2. `With the headphones swapped, your left and right came out close together.` |
| `outcomeLines("unclear", "noLevel")` | 1. `The swap did not make it clear where the difference belongs.` 2. `With the headphones swapped, one side has no level, so the two runs of this room cannot be set side by side.` |
| `outcomeLines("unclear", null)`, `outcomeLines("followsEar", "noLevel")`, … | `RangeError`: a reason exactly for `unclear` |
| `comparisonDescription(...)` for a first run of −40 and −20, a repeat of −40 and −20, `followsEar` | `Stairs, 4 kHz. Headphones as marked: left ear with the left earpiece, the quietest sound you caught here was 40 dB quieter than your calibration; right ear with the right earpiece, the quietest sound you caught here was 20 dB quieter than your calibration; 20 dB quieter on the left. Headphones swapped: left ear with the right earpiece, …; right ear with the left earpiece, …; 20 dB quieter on the left.` followed by the outcome lines |

The ear lines of a comparison are `wingLine` of `result-lines.ts` ("The quietest sound you caught here was 35 dB quieter than your calibration.", "Quieter than this house can whisper.", "You did not catch the loudest sound the house may play here.", "This room should be visited again."), so a level reads the same on the floor and in its repeat.

Why these words. The outcome lines say where the difference seems to belong and nothing more (brief): no line says that an ear is fine or that the headphones are faulty, and "seems" stands in every attribution, because two runs of a staircase are not proof (brief, "never stated as certain"; Q1, decided by the owner on 2026-11-15: every attribution says "seems"). The line of `followsEar` repeats when to see a hearing professional in the words the result page already shows, taken from the constant so that the two can never drift apart (`wording.md`, item 4). The line of `followsEarpiece` names no action: the product makes no claim about headphones and corrects nothing. `unclear` gives its reason in plain words. Nothing names a number of decibels except through `relativeLevelLabel` and `differenceLabel`. The check's lines reuse the visit's where the situation is the same, so the visitor reads one voice.

### The copy tests

`src/copy/swapped-repeat-copy.test.ts`, in the form of `replay-copy.test.ts`: every string reachable from `swappedRepeatCopy` is non-empty, trimmed and free of banned terms; `savedCopyLacksLine` has the wording above, and `earpieceMarks` is frozen with exactly the keys `left` and `right` and the letters `L` and `R`; every function gives the outputs of the table; for representative inputs (every room and pitch, every ear and earpiece pair of a swap, levels from −70 to 15 in 5 dB steps and −0.4, 0, 0.4, every outcome with its reasons, every state of every wing) every output is free of banned terms, every match of `\d+ dB` is followed by " quieter than your calibration", " louder than your calibration", " quieter on the left" or " quieter on the right", the outcome lines of `followsEar` end with `limitsStatement.sentences[3]` exactly, and no other outcome's lines contain it; the inputs of the `RangeError` rows throw. `npm run check:copy` checks the exported constants, and the copy hook runs it on save.

## Measurements

The brief's property names four cases: only the ear difference at or above the limit, only the headphone imbalance, neither, and both. Whether the brief's rule can meet them decided how the property is stated (Q1, decided by the owner on 2026-11-15) and bears on which listeners it uses (Q2, PROPOSED, NOT APPROVED). These figures were measured once while this design was written, with a script run from outside the repository and then deleted. Task-level work adds `tests/listeners/attribution-measurement.ts` and `tests/listeners/print-attribution-measurement.ts`, which give them again with the same seeds, and writes the figures below if they differ.

Method: the shipped engine through `specSearchUnderTest`, with `hearingMethodConfig` (search cap 15 dB). For each pair of an Ear_Difference E and a Headphone_Imbalance H on the grid −40, −38, …, 40 dB (41 × 41 = 1681 pairs), a base level drawn from −35 to −25 dB, true thresholds `base − E/2` (left ear) and `base + E/2` (right ear), and earpiece offsets −H/2 (left) and +H/2 (right). The first run plays each ear's sound through its own earpiece, the repeat through the other one, each with its own engine seed and listener seed drawn from seed 20261120. The outcome is the rule of "The outcome" applied to the two runs, and "not offered" when the first run's ears are not both found or less than 15 dB apart. Three kinds of listener: Step_Listeners (one run per pair), and psychometric listeners with the other parameters drawn from the Attentive and the Plausible ranges of the threshold-search spec (three runs per pair, 5043 in all).

"Literal" is the brief's sentences read as written: only |E| ≥ 15 gives `followsEar`, only |H| ≥ 15 gives `followsEarpiece`, neither gives "not offered", and for both no attribution is stated (only `unclear` or not offered); within one upward step (5 dB) of 15 for E or H, `unclear` and "not offered" are also accepted. "Rule oracle" is the rule applied to the true D1 = E + H and D2 = E − H; within one step of a boundary of the rule (|D1| = 15, |D2| = 7.5), the neighbouring answer is also accepted; a run whose ears have no level is accepted when the rule's own answer is "not offered" or `unclear`.

| | Step | Attentive | Plausible |
|---|---|---|---|
| Runs | 1681 | 5043 | 5043 |
| Not offered | 484 | 1597 | 3733 |
| `followsEar` | 480 | 1326 | 293 |
| `followsEarpiece` | 479 | 1326 | 301 |
| `unclear` (of them, a repeat ear without a level) | 238 (0) | 794 (133) | 716 (576) |
| Failing the literal reading | 324 | 1018 | 1367 |
| Failing the rule oracle, one step | 0 | 0 | 20 |
| Failing the rule oracle, two steps | 0 | 0 | 12 |

The literal failures by case, one run per pair, leaving out the pairs where a run had no level:

| Case | Step: failures of pairs | Attentive: failures of pairs | First failing example (step) |
|---|---|---|---|
| Both at or above 15 | 262 of 671 | 247 of 631 | E = −40, H = −34: first run −70, repeat −10, `followsEar` |
| Neither | 49 of 225 | 46 of 214 | E = −14, H = −6: first run −20, repeat −10, `followsEar` |
| Only the ear | 5 of 390 | 7 of 369 | E = −22, H = 10: first run −10, not offered |
| Only the earpiece | 8 of 390 | 8 of 356 | E = −10, H = 20: first run 10, not offered |

What this shows. With E and H measured together, the first run sees their sum and the repeat their difference. So the brief's rule offers the repeat when two differences below the limit add up to it ("neither", E = −14 and H = −6), finds no offer when one cancels the other in the first run ("only the ear", E = −22 and H = 10), and names an attribution when both are large but one dominates ("both", E = −40 and H = −34). Each answer is what the rule says for the two runs; the literal sentences describe a situation where one of E and H is zero. With one of them zero, a second measurement of 1040 runs (E or H from 15 to 40 dB in each sign, the other 0, ten runs each, seed 20261121) gave the brief's answer every time a run had levels on both sides: Step_Listeners 1040 of 1040; Attentive listeners all but 77 runs without a level and 4 within one step of the limit; Plausible listeners all but 834 runs without a level and 3 within one step. The rule oracle with one step of tolerance found no failure for Step_Listeners or Attentive listeners; for Plausible listeners, whose psychometric width reaches 8 dB, 20 of 5043 runs, and 12 with two steps.

A room of the shipped engine played by a simulated listener took about 0.03 ms on the project machine in this script, so the pure attribution property of CP1 costs well under a second for 1000 runs. The figures come from the engine alone and say nothing about real visitors.

## Error handling

| Situation | Behaviour |
|---|---|
| `chooseSwappedRepeat` for a floor that does not offer the repeat, that has a record, or with a whole number that is no room | Ignored, as today; the record rule is Q4, decided by the owner on 2026-11-15 |
| The shell holds no calibration when the stage is entered | `unavailable`, `calibrationGone`; nothing plays (D8, Q6) |
| The floor's first run used an earlier calibration | `unavailable`, `calibrationChanged` (D8, Q6) |
| `confirmSwap` twice, `answerSwapCheck` before a check, an answer that is not one of the four | Ignored; the flow checks the answer as `answerHeadphoneCheck` does |
| `playSwapCheck` while the browser sees no press | `activationRefused` true; the phase stays `check`; the next press tries again |
| The swap check refused `busy`, a render or preparation refusal | Its line; nothing counted; the visitor presses again |
| The swap check refused `notCalibrated` | `unavailable`, `calibrationGone` |
| The swap check refused `notRunning` | As a stop report with the shell's reason; in `check` that sets the check back (R5.6) |
| A hidden page or an interruption during the check | The waiting check counts as not played, with `cutLine` (D13) |
| A check heard on the left | The instruction again, with `againLine` |
| A check heard on both sides or not at all | The visit's lines for those; the visitor plays the check again |
| `startSwappedRoom` without a confirmed check | Ignored |
| The shell's calibration is gone when the room would start | `unavailable`, `calibrationGone` |
| The room's search cap differs from the first run's | Cannot happen with the same calibration (D9). `startRoom` throws an `Error` naming both caps, so a bug shows instead of a run on another scale |
| A hidden page, an interruption or a visitor's pause in the room | Pause; the presented trial is discarded and presented again after its own gap after `resume` (visit-flow D9) |
| A device change in the room | The run is abandoned without a record; `finished`, `deviceChanged`; the picture is unchanged |
| A device change before the room | `unavailable`, `calibrationGone` |
| A left page | `result`; a run under way is abandoned. The shell has stopped and will close its context |
| A trial refused three times in a row | `stopAll`; `finished`, `soundRefused`; the visit and its result are kept (R15.4) |
| `proceed` or `stop` in the middle of the room | `stopAll`; the run is abandoned without a record; `result` with the Turn_Back_Line; the offer stays (D11) |
| An unsupported report from `activate` inside a press of this stage | As in every stage (visit-flow R15.1): the `unsupported` stage, and the visit is dropped. Not changed here; listed under "Found in the existing code" |
| A saved payload whose repeats break a rule | The entry is unreadable, as for any broken rule (result-page, "Checking a payload") |
| A saved payload from before this spec | Read with `swappedRepeats: []` |
| A second `save` whose `changePayload` is refused | The refusal's line, as for any refused save; the saved copy stays as it was, and `savedCopyLacksRepeats` stays true (Q5) |
| `savedCopyLacksRepeats` while local storage is missing, refuses or holds an unreadable value | False; it never throws |
| A copy function given a value that does not fit | `RangeError` |
| A bug in the controller's own code | Not caught, so that the properties find it |

## Correctness properties

Every property is universal: fast-check with a new random seed on every run (R20.2). None is statistical. The brief's property is CP1.

The **arbitraries** (`tests/properties/swapped-repeat-arbitraries.ts`) draw:

- **An ear difference and an imbalance**: whole numbers of dB, E and H each from −40 to 40, with one run in four with E = 0, one in four with H = 0, and one in four with |E| or |H| within one step of 15, so that the brief's clean cases and the boundaries are reached often; a base level such that every true threshold heard through an earpiece lies at least one step inside the floor and the search cap, and otherwise one run in ten beyond it, so that ears without a level occur; a search cap on the 5 dB grid from 0 to 15 dB (`roomTopMinDb` and the anchor cap); two engine seeds.
- **A visit log at the result**: a visit run of the visit flow's arbitraries with a Step_Listener in Worn_Headphones of the drawn E and H, played through the visit flow's harness until `result`; or, for the controller-level properties, a drawn log of the replay's arbitraries with a floor whose summary offers the repeat, and one log in five whose floor used an earlier calibration.
- **A repeat script**: the floor to repeat (an offered one, or one not offered, or one with a record); whether the visitor swaps on the first instruction; the first answer to the check (`right`, `left`, `bothSides`, `nothingHeard`) and the later ones; when `confirmSwap`, `playSwapCheck`, `answerSwapCheck` and `startSwappedRoom` come, possibly twice, possibly in the wrong phase; up to six events at times from 0 to 10 minutes: `proceed`, `stop`, `pause`, `resume`, a shell report `hidden`, `interrupted`, `deviceChanged` or `pageLeft`, a press while the backend refuses activation; each pause followed by `resume` after 0 to 10 s or not at all; the listener's answer delays and time stamps as the visit flow's scripts draw them.
- **A refusal script** (CP6): for each `play` and `playHeadphoneCheck` of a scripted output, scheduled or refused with any `PlayRefusal`.
- **A saved visit with repeats** (CP11): a visit of the result page's arbitraries with zero to three records drawn on its offered floors, and stored values of the result page's arbitraries, changed as CP7 of the result page changes them.

The **oracle** (`tests/properties/swapped-repeat-oracle.ts`) is written from R10 and the rule of "The outcome", not from `swappedRepeatOutcome`'s code. Given E, H, the search cap, the floor and the two runs' ear results, it gives the set of accepted answers among "not offered", `followsEar`, `followsEarpiece` and `unclear`:

```
D1 = E + H, D2 = E − H, s = upwardStepDb (5 dB), L = swappedRepeatDifferenceDb, h = L × unclearBelowLimitFraction
first run has an ear without a level             → { not offered }            (the summary offers nothing)
repeat has an ear without a level                → { unclear }               (noLevel)
otherwise:
  |D1| ≥ L + s                → "not offered" is not accepted
  |D1| < L − s                → only "not offered" is accepted
  expected = |D2| < h ? unclear : sign(D2) = sign(D1) ? followsEar : followsEarpiece
  accepted ∪= { expected }
  | |D2| − h | < s            → accepted ∪= { unclear, the attribution of D2's sign }
```

For a Step_Listener each ear's estimate is the lowest grid level at or above its true threshold through its earpiece (threshold-search CP1), so each measured difference lies within one step of D1 or D2, which is why one step of tolerance is enough. The brief's sentences then hold where one of E and H is zero, and CP1 asserts them there: with H = 0 and |E| ≥ L + s the answer is `followsEar`; with E = 0 and |H| ≥ L + s it is `followsEarpiece`; with one of them 0 and the other of size below L − s the repeat is not offered. Where both are not zero only the oracle's set applies; it already excludes an offer whenever |E| + |H| < L − s, because |D1| ≤ |E| + |H|. With both at or above L no answer is excluded, and no line of any answer states it as certain: every attribution says "seems" (CP9). This is the owner's decision of 2026-11-15 (Q1, option (a)); the rule of the brief itself is kept as it is.

The **repeat harness** (`tests/properties/swapped-repeat-harness.ts`) builds a Repeat_Controller on an output shell from `createShellUnderTest` at `harnessSampleRateHz`, calibrated to the setting of the log's last calibration, with the worst-case renderers through `vi.mock`, as the replay's harness does. It plays the flow's small part as `create-visit-flow.ts` does it (the pause field, activation on a press, the earpiece state, the result), and records every view after every step, every event, every backend call with its two channels, every `play` and `playHeadphoneCheck` request with its outcome, and every `beginRoom` and `stopAll`. A simulated visitor in Worn_Headphones answers each presented trial from the backend's channel and its own earpieces, and the check from its own earpieces. For refusals it can put a scripted output in place of the shell. CP10 runs the real flow through the visit flow's harness, so that the flow's part is checked as well.

`tests/properties/swapped-repeat-text.ts` collects every string of a view, an event, a result snapshot's `turnBackLine` and a floor's `repeat`, each with its place, and holds the allowed forms of CP9.

**CP1. Correct attribution** (Universal, 1000 runs; R10, R20.1; brief property). Generated: an ear difference, an imbalance, a base level, a search cap and two engine seeds. A Step_Listener in Worn_Headphones plays the floor once with the earpieces as marked and once swapped, through `createThresholdSearch` with `hearingMethodConfig` and that cap, as the controller creates it. The first run's ears are judged as `summarizeVisit` judges a room, the offer as the summary gives it, and the outcome by `swappedRepeatOutcome`. The answer (not offered, or the outcome) is in the oracle's accepted set. The brief's sentences are asserted where one of E and H is zero (Q1, decided by the owner on 2026-11-15).

**CP2. The outcome rule** (Universal, 1000 runs; R10.1 to R10.6). Generated: two first-run ear results, found and at least the limit apart, two repeat ear results in any state, and settings with `0 < unclearBelowDb ≤ differenceLimitDb`. `swappedRepeatOutcome` is unclear with `noLevel` exactly when a repeat ear is not found, unclear with `differenceShrank` exactly when both are found and |d2| < `unclearBelowDb`, and otherwise `followsEar` exactly when d2 has the sign of d1; mirroring left and right (both differences negated) gives the same outcome; the result is frozen and the input unchanged; inputs whose first run is not offered throw a `RangeError`.

**CP3. Every sound and every answer names its earpiece, and nothing assumes a swap** (Universal, 300 runs; R8, R9). Generated: a visit log at the result, an imbalance and a repeat script, on the repeat harness. For every backend `schedule` of the stage:
- a swap check fills the left channel only;
- a trial sound fills only the channel of `earpieceOnEar("swapped")[ear]` of the trial it presented, and that trial's `earpiece` in the record and in the hook is that channel;
- for every scored trial, `responseEarpiece` is the earpiece on the ear named, and for every ignored answer, `earpiece` is the earpiece on its side; every swap check's `earpiece` is `left`; the record's `earpieceOnEar` is `{ left: "right", right: "left" }`;
- no trial sound is scheduled while the earpiece state is not `swapped`, and a room starts only after a `confirmed` check of the same visit to the stage, with no `notSwapped` answer after it;
- the simulated visitor's own answers agree with the record: every trial it heard on an ear is recorded with that ear, through the earpiece the backend filled;
- after the stage is left in any way past `instruction`, the result's `turnBackLine` is the Turn_Back_Line, the earpiece state is `unknown`, and a second repeat plays no trial before its own `confirmed` check;
- the visit log deep-equals before and after, and the result holds the same log and summary objects.

**CP4. The room runs exactly as before** (Universal, 300 runs; R7, R19.3). Generated: a visit log at the result and a repeat script that reaches the end of the room. For the record: `attempt.searchCapDb` equals the first run's `searchCapDb`; `calibrationIndex` equals the first run's; `createThresholdSearch` with `hearingMethodConfig`, that cap and `attempt.engineSeed`, given the record's scored responses in order, asks for exactly the record's scored trials (kind, ear, level, gap, trial number) and gives the record's room result; every trial was played with the Purpose `trial` and the room's Sound_Id; the gaps between a trial's decision and the next request are the search's gaps on the page clock, as visit-flow CP4 states for rooms; and the engine seed equals `swappedRepeatEngineSeed(log, runNumber)`, for every visit of CP10 also equal to the draw the flow made.

**CP5. Nothing sounds before a press; every ending plays nothing more** (Universal, 300 runs; R3.6, R3.7, R4.2, R6, R11.3, R14.2, R14.7). Generated: a visit log at the result and a repeat script with an ending (`proceed`, `stop`, `pageLeft`) at a drawn time, possibly during the hiss, in the room, in a gap or during a pause. Then:
- the first sound after entering the stage, after a confirmed check, and after each pause follows a press of `playSwapCheck`, `startSwappedRoom` or `resume` in the step that led to it; no sound is scheduled in `unavailable`, `instruction`, `ready` or `finished`;
- right after the ending, `stopAll` was called when a sound of the stage may have been under way, the stage is `result`, and advancing the clocks by 10 minutes makes no `play`, no `playHeadphoneCheck`, no backend `schedule` and no event, and the controller has no pending timer;
- a run ended this way gives no record, the result's `swappedRepeats` is as before, and the floor's offer is still there;
- every view has a non-empty `stopLabel`.

**CP6. Pauses, device changes and refusals** (Universal, 300 runs; R5.2, R5.6, R14.3 to R14.6, R14.8 to R14.10, R15). Generated: a visit log at the result, a repeat script, and for one run in three a refusal script on a scripted output. Then:
- while a pause holds, no sound is asked for, `canProceed` is false, and the view's `pauseLine` is the line of its reason; after a `resume` the shell accepts, the next trial presented is the waiting one, after its own gap;
- a pause is written to the record's `pauses` with the stage `swappedRepeat`, and never to the visit log;
- a `deviceChanged` report in the room gives `finished` with `deviceChanged`, no record and no sound after it; before the room it gives `unavailable` with `calibrationGone`;
- a hidden page or an interruption in `check` while a check waits sets `awaitingAnswer` to false and gives `cutLine`, and an answer then is ignored;
- a refused swap check gives its line, counts nothing, and a later press plays;
- trial refusals follow the room runner's rule: `notRunning` as a stop report; `notCalibrated` as a device change; any other the same trial again after its own gap, recorded in `refusedPlays`; three in a row give `finished` with `soundRefused`, `stopAll`, and the `result` stage after `proceed` with the same log, never `exit`;
- no run ends `soundRefused` when its only refusals are `busy` refusals while the hiss of the check still played.

**CP7. Every sound of the repeat is safe** (Universal, 200 runs; R17). Generated: a visit log at the result and a repeat script. For every backend `schedule` of the stage: one channel holds a sample that is not zero and every sample of the other is `+0`; the peak is at most `ceilingFraction`; it lasts at most `ghostSoundMaxDurationMs`; `measureFadeLengths` gives at least `fadeMinMs` in and out; a swap check is at `headphoneCheckLevelDb` with the Purpose `headphoneCheck`; a trial is at most the run's search cap with the Purpose `trial`, and its played level equals its asked level; `beginRoom` was called after the last check and before the first trial; within the run, on each channel, no trial's applied gain rises more than one upward step above the previous one on that channel; no request has the Purpose `replay`.

**CP8. Nothing gives a sound away before the answer** (Universal, 200 runs; R16). Generated: a visit log at the result and a repeat script that reaches the room. Between the presentation of each trial and its scoring no snapshot is published and no event is handed out; each `swappedTrialScored` event comes in the step that scores its trial, never for a discarded one, with the reaction `ripple` exactly for a caught sound, `noSoundLine` exactly for an answer on a no-sound trial and `none` otherwise, and its line is `swappedCaughtLine` of its ear, earpiece, pitch and played level, or `roomCopy.noSoundLine`, or null; every view of the phase `room` without a pause is equal to the first.

**CP9. Safe wording** (Universal, 500 runs; R18; `wording.md`). Generated: a visit log at the result and a repeat script, and views and comparisons made directly for every phase, judgement, pause reason, ending, unavailable reason, outcome and unclear reason, and every state of every ear. For every generated string: no banned term (`findBannedTerms` with `bannedTerms`); every match of `\d+ dB` is followed by " quieter than your calibration", " louder than your calibration", " quieter on the left" or " quieter on the right"; no word about accuracy or certainty (accurate, accuracy, precise, precision, exact, exactly, validated, verified, guaranteed, certain, certainly, definitely, proves, proof, caused); no word that compares the visitor with anyone (the banned list's, and others, everyone, most people); no word of blame (fail, failed, wrong, bad, poor, faulty, broken, only); every outcome line of an attribution contains "seems"; the lines of `followsEar` contain `limitsStatement.sentences[3]` exactly and those of every other outcome do not; no string is empty or starts or ends with white space; every string names only its own room and pitch.

**CP10. The repeat in whole visits** (Universal, 30 runs; R1, R8.8, R9, R11, R12, R13, R20.6; brief, "Done when"). Generated: a visitor script of the visit flow's arbitraries with a Step_Listener in Worn_Headphones of a drawn E and H and a swapped-repeat behaviour, played through the visit flow's harness with `spyOnOutput`. Then:
- the visit reaches `result`; when the summary offers the repeat on a floor and the behaviour runs it to its end, the result's `swappedRepeats` holds one record of that floor whose answer is in the oracle's accepted set for that visit's E and H, and `resultPicture` of the result snapshot gives that floor a `repeat` equal to `swappedRepeatComparison` of it and no offer, and every other field of the picture equal to the picture of the summary without repeats;
- the result's log and summary are the same objects as before the stage;
- every sound of the stage is a check through `playHeadphoneCheck` or a trial through `play` with the Purpose `trial`; no sound of the stage comes before a press (CP5);
- the engine seed of the run equals the next draw of the visit's source (CP4);
- the result saved with an archive on a fake storage area and read back gives the same records, and a visit without a record gives a payload equal to the one of before this spec.

**CP11. Saved visits and the earlier visit** (Universal, 300 runs; R13). Generated: a saved visit with repeats, a stored value, and pairs of saved visits with the same headphone name, each with or without repeats, each written with or without the key. A visit with records written and read back gives records that deep-equal their JSON round trip; a payload without the key reads with `[]` and every other field as `parseSavedVisitPayload` of before this spec gives it; a payload whose records break any rule of "Checking a payload" is unreadable and never throws; `findEarlierVisit` and the `comparison` and `earlier` fields of `resultPicture` are the same whether or not either visit has records; a visit saved, repeated and saved again keeps its id, date and name, reads with its records and gives `savedAgainLine`, and a save that adds nothing only renames, as today (Q5, decided by the owner on 2026-11-15); `savedCopyLacksRepeats` is true exactly when this page saved the log, its saved copy is listed and the visit holds a record whose run number that copy lacks, false after every `save` that gives `saved: true`, false in robot mode, and never throws, also on changed stored values (chosen by the owner's coordinator on 2026-11-15).

The other checks are examples: each pure helper, the config value, the copy outputs of the table, the controller's phases one by one on the manual timer, each row of "What each phase accepts" in `create-visit-flow.test.ts`, `swappedRepeatEngineSeed` against a flow's draws, and `swapped-repeat-simulated-visits.test.ts`, which plays a quick and a full visit with an uneven Step_Listener through the visit flow's harness and simulated visitor to the result and the repeat to its end, once with an ear difference only and once with an imbalance only, and checks the outcome.

## What tests/listeners gains

- **`worn-headphones.ts`.** `wornHeadphones(listener, { imbalanceDb, earpieceOnEar })` gives a function from `{ kind, earpiece, levelDb }` to a response. For a sound it finds the ear the earpiece sits on, lowers the level by that earpiece's share (−H/2 for the left earpiece, +H/2 for the right, so that the right plays H dB quieter than the left), and asks the listener for that sound on that ear. A no-sound trial goes to the listener unchanged. `earpieceOnEar` is read at every call, so the visitor can swap and turn back during a visit. Its test checks a Step_Listener's catches against the shifted thresholds in both arrangements.
- **`simulated-visitor.ts`.** The hook's trial now has `earpiece`; the visitor answers every trial through its Worn_Headphones (an imbalance of 0 and the as-marked arrangement by default, so that every existing visit plays exactly as before). The visitor's script gains `headphones?: { imbalanceDb }` and `swappedRepeat?: VisitorSwappedRepeatBehaviour`: which floor (the first offered, the last offered, a drawn one, or one not offered), whether the visitor swaps on the first instruction (if not, it confirms without swapping, and its check answer then follows what it wears), its first answer to the check, delays before each press, a list of events like the replay's (`proceed`, `stop`, `pause`, `resume`, `hidden`, `interrupted`, `deviceChanged`, `pageLeft`, refused presses), and whether it turns back on reading the Turn_Back_Line. The visitor answers the check from its own arrangement: the hiss of the left earpiece is on the ear that earpiece sits on. With a behaviour, `result` is not the visitor's last stage until the behaviour has run; without one, the visitor stops at `result` as now. The `VisitDriver`'s hook type becomes `FlowPresentedTrial`.
- **`attribution-measurement.ts`, `print-attribution-measurement.ts`.** The measurement of "Measurements" as a function and a print script with its seeds, in the form of the replay's measurement. Not test files; they choose nothing and change no config value.

## Testing strategy

### Shells, timers and visits

The pure properties (CP1, CP2, the view part of CP9, CP11) need no shell. The controller-level properties (CP3 to CP8 and the run part of CP9) use the repeat harness: a real output shell on the fake backend, calibrated, and the manual timer, moved together. CP10 and the simulated visits use `tests/properties/visit-flow-harness.ts` and the simulated visitor, so that their logs are real and the flow's own part is checked. Every file that renders replaces the synth's render functions with the worst-case renderers through `vi.mock`.

### Run counts and time

The run counts, PROPOSED, NOT APPROVED (Q9):

| Property | Runs | Estimate before the files exist, not measured |
|---|---|---|
| CP1 | 1000 | 1 to 2 s: two engine rooms of about 0.03 ms each per run, and fast-check's own cost |
| CP2 | 1000 | about 1 s |
| CP3 | 300 | 3 to 6 s: one controller run renders 15 to 60 worst-case sounds at 22050 Hz; the replay's harness took 3.8 ms to build and 3.3 ms to play a script of up to 20 sounds |
| CP4 | 300 | 3 to 6 s |
| CP5 | 300 | 3 to 6 s |
| CP6 | 300 | 3 to 6 s |
| CP7 | 200 | 4 to 8 s: it also measures every fade |
| CP8 | 200 | 2 to 4 s |
| CP9 | 500 | 4 to 8 s: half its runs play a script on the harness |
| CP10 | 30 | 5 to 8 s: the replay's 30 whole visits took 3.3 to 3.6 s, and each run here adds a room |
| CP11 | 300 | 2 to 4 s |

Run alone the files might take 30 to 60 seconds together; in `npm test`, with the other files in parallel workers, the replay's files took about twice their time alone. No figure here is measured.

The time budget, PROPOSED, NOT APPROVED (Q9), follows the rule the owner chose for the replay on 2026-11-15: the property files of this spec must take together at most the slowest of three runs of `npm test` with every property file of this spec present, plus about three tenths, rounded up to a multiple of 15 seconds, on the project machine when nothing else heavy runs on it. The time of a file is the sum of its test durations as Vitest's JSON reporter gives them, without its import, as the replay measured.

How the tasks treat time (R20.4). Until every property file exists there is no budget, because the rule needs the three runs with every file present. So every task that adds property files runs `npm test` three times and writes the time of each of this spec's property files, the times together and the time of the whole of `npm test` under this heading, and does not stop because of time. The final task, with every file present, runs `npm test` three times, computes the budget by the rule, writes it here as PROPOSED, NOT APPROVED with the three runs it came from, and reports it to the owner. No task lowers a run count. If the owner's machine was loaded during a run, the task says so beside the times, as the replay's task 15 did. Each property file has a timeout of 120 seconds, as the replay's do, so that a run that hangs fails instead of blocking the suite.

### Counterexamples

A counterexample becomes a named case in `tests/properties/swapped-repeat-regressions.test.ts`, `regression <n>: <what went wrong> (<property>, seed <s>)`, with the case written out, first with `it.fails`. The task that finds it stops there and reports it, so that the case and the fix go in separate commits (`tech.md`). A case that could only be removed by changing a steering value, or by a choice that is the owner's (Q1 to Q10), stays an expected break and is reported with the question it belongs to. A counterexample of CP1 in the "both" or "neither" cases is not a bug of the code while Q1 is open: it is evidence for Q1, and the task reports it as such.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | `visit-flow-types.test.ts`, `result-page-types.test.ts` (the additions); `swapped-repeat-types-match.test.ts`; `npm run typecheck`; review of the additions against "Interface contract"; CP10 |
| R2 | `swapped-repeat-config.test.ts`; the final task's search for numbers |
| R3 | `create-visit-flow.test.ts`; `create-swapped-repeat.test.ts`; CP5; CP6 |
| R4 | `swapped-repeat-view.test.ts`; `create-swapped-repeat.test.ts`; CP3; CP5 |
| R5 | `judge-swap-check.test.ts`; `create-swapped-repeat.test.ts`; CP3; CP6 |
| R6 | `create-visit-flow.test.ts` (activation and its refusal); CP5 |
| R7 | `swapped-repeat-engine-seed.test.ts`; CP4; CP10 |
| R8 | `swapped-earpiece-output.test.ts`; `swapped-repeat-run.test.ts`; CP3; CP8; CP10 |
| R9 | `create-visit-flow.test.ts`; CP3; CP10 |
| R10 | `swapped-repeat-outcome.test.ts`; CP1; CP2 |
| R11 | `swapped-repeat-comparison.test.ts`; `create-swapped-repeat.test.ts`; CP5; CP10 |
| R12 | `result-picture.test.ts`; CP10; CP11 |
| R13 | `saved-visit-payload.test.ts`; `swapped-repeat-run-holds.test.ts`; `create-visit-archive.test.ts` (the second `save` and `savedCopyLacksRepeats`); `src/storage/create-visit-store.test.ts` (`changePayload`); CP10; CP11 |
| R14 | `create-visit-flow.test.ts` (each row of "What each phase accepts"); CP5; CP6 |
| R15 | `create-swapped-repeat.test.ts`; CP6; "Which sound of the repeat can be refused `busy`" |
| R16 | CP8 |
| R17 | CP7; "Which limits of the output stage act on each sound of the repeat"; the output stage's own properties, unchanged |
| R18 | `swapped-repeat-copy.test.ts`; `npm run check:copy`; CP9; the result page's CP1 with its text helper extended |
| R19 | `npm run lint` (no clock in `src/session`); CP4; `swapped-repeat-run.test.ts` (the JSON round trip) |
| R20 | The property files; the regression file; the simulated visits; the times under "Run counts and time" |
| R21 | `worn-headphones.test.ts`; `simulated-visitor.test.ts`; CP3; CP10 |
| R22 | Review of "What this spec leaves to other specs" and "What the owner builds" |
| R23 | The final task's `git status` and search |

## How the design serves the steering

| Rule | How |
|---|---|
| audio-safety 1, one output path | The check through `playHeadphoneCheck`, the trials through `play` with the Purpose `trial`. The earpiece view only changes the `ear` of a request and calls the shell's own `play` |
| audio-safety 2, a hard cap | The check at 0 dB, the trials at most at the search cap, the room top on the grid; the output stage applies both limits and the ceiling to every sound |
| audio-safety 3, no sudden sounds | The output fade of 25 ms on every sound; the 20 ms stop fade on stop, pause, back and every page event; a cut trial comes again from its start after its gap |
| audio-safety 4, no jumps upward | `beginRoom` after the check and before the room; the search's steps; the output stage's rise limit per channel, which is per ear because the earpiece of each ear is fixed for the run. No exemption is used |
| audio-safety 5, silent means silent | The output stage routes each sound to one channel with exact zeros on the other; the earpiece view keeps one channel per request; checked again in CP7. A no-sound trial plays nothing |
| audio-safety 6, short sounds | The hiss of 1500 ms and the room sounds of 800 to 1400 ms; one sound at a time |
| audio-safety 7, the visitor stays in control | `stop` in every phase silences at once and returns to the picture; `pause` in the room; back silences too; hiding the page pauses the room or cuts the check; leaving ends the repeat. The view gives the stop label in every phase, and the owner shows the control ("What the owner builds") |
| audio-safety 8, the volume keys | The instruction repeats the calibration's line: leave the volume where it is, the limit holds only if you do not turn it up |
| audio-safety 9, no jump scares | The check is the visit's own hiss at the anchor level, on a press; the room is the room the visitor already knows; nothing plays without a press |
| product, what the result may claim | The repeat is the check of left against right that `product.md` names; the outcome says where the difference seems to belong and nothing more; floors are never compared; no number is corrected |
| product, nothing reveals a sound before the answer | The room phase's view does not change while a trial waits, and its only event comes at scoring (R16, CP8) |
| product, followable without headphones | Each caught sound has a ripple line with ear, earpiece, pitch and level; the Comparison describes both runs in words |
| product, results stay in the browser | The records are saved only in the visit's payload in local storage, only on the visitor's save |
| wording, banned words, item 4, tone | CP9 over every string; `check:copy`; the copy hook; the professional sentence taken from the limits statement; "seems" in every attribution; a check heard on the wrong side is met with an instruction, never a reproach |
| wording, levels relative to the calibration | Every level by `relativeLevelLabel`; every difference by `differenceLabel` |
| hearing-method | The search runs as in every room; the 15 dB limit offers the repeat; "follows the ear", "follows the earpiece" and "unclear" are the method's three answers; a repeat without a level is unclear, as "An estimate is only presented as a threshold in the first state" asks |
| structure | Session code in `src/session`, importing `engine`, `audio/output`, `copy` and `config`; numbers in `src/config`; strings in `src/copy`; `Db` and `Fraction` endings; `left` and `right` for both ears and earpieces, told apart by field names |
| tech | Time from the visit's timer only; randomness from the visit's source; runs under Node; no runtime dependency; sound started only in a press (`playSwapCheck`, `startSwappedRoom`, `resume`); a counterexample kept as a regression |

No number or rule from a steering file is changed or loosened by this spec.

## What this spec leaves to other specs

- **The no-headphone replay (brief 09).** It replays a whole recorded visit from a saved visit's log. The log is unchanged by the repeat; a saved visit's `swappedRepeats` hold each repeat's trials in the same shape as the log's, with the earpiece added, so its spec may replay them too. This spec adds nothing for it.
- **The last door (brief 11).** It goes between the last room and the replay (visit-flow D22). If it draws from the visit's source, it draws before the replay's seed, and `swappedRepeatEngineSeed` must then count its draws; its spec says so. If it adds entries to `log.roomAttempts`, the seed function counts them already.
- **The robot module (brief 10).** It may play the repeat through the contract and the hook, which now gives each trial's earpiece. A robot listener that wears simulated headphones needs the earpiece, not the ear, to hear a sound. This spec adds no hook.
- **The house interface and the result page.** The screen of this stage and the drawing of the Comparison are the owner's ("What the owner builds").
- **Any later stage that plays after the result.** It finds the earpiece state `unknown` after a repeat and must check the earpieces before it plays a sound to one ear. It inherits an output shell whose previous gains may be the repeat's, so it calls `beginRoom` before its room, and a calibration that a device change may have removed.

## Whatever the owner chooses in visit-flow Q1 to Q4 and replay Q1 to Q5

- **Visit-flow Q1, the visit limit.** A marked visit offers no repeat, as today; the repeat does not apply the visit rule again (D10).
- **Visit-flow Q2, constant pressing.** Ignored answers of the repeat are recorded with their earpiece and score nothing.
- **Visit-flow Q3, the length of the visits.** A repeat adds one room, about 1.7 minutes for an attentive listener (the rooms' median of 5.1 minutes over 3 rooms), and only for a visitor who asks for it.
- **Visit-flow Q4, a device change mid-room.** If a device change starts a room again with a new calibration, a floor measured before it gives `calibrationChanged` (Q6 here).
- **Replay Q1 to Q5.** The repeat comes after the replay and reads nothing of it but the one draw of its seed.

## What the owner builds

Outside this spec's tasks, by hand:

- **The screen of `swappedRepeat`** in `src/ui`, replacing the stand-in notice in `src/ui/visit/screen-of-snapshot.ts`, drawn from `snapshot.repeat` alone: the heading, the room's name and pitch, the first run's difference; in `unavailable` the line; in `instruction` the lines, the line asking again when there is one, and the confirm control (`confirmLabel`, calling `confirmSwap`); in `check` the question, the play control (`playLabel`, calling `playSwapCheck`), the four answers while `awaitingAnswer` (each calling `answerSwapCheck`), and the judgement, refusal and cut lines when present; in `ready` the judgement line, the lines and the start control (`startLabel`, calling `startSwappedRoom`); in `room` the lit room, the two answers by keyboard and touch (calling `answer`, as in every room), the pause control (`pauseLabel`, calling `pause`), and while `snapshot.pause` holds the pause line and the resume control (`resumeLabel`); in `finished` the end line, the Comparison when there is one, and the Turn_Back_Line; in every phase but a paused room the back control (`backLabel`, calling `proceed`).
- **The visible stop control in this stage, in every phase.** `screenOfSnapshot` hides it in `swappedRepeat` today (and in `result`, where nothing plays). Once the repeat plays, audio-safety rule 7 needs it shown, with `repeat.stopLabel` and `flow.stop()`. Until the screen calls `playSwapCheck` or `startSwappedRoom`, nothing plays in this stage, so the stand-in stays safe.
- **The room phase must leak nothing.** The screen must not change between a sound and the visitor's answer, as in every room. The owner's screen-leak property in `tests/properties/screen-leak/` should cover the repeat's room as it covers the rooms of the visit.
- **The ripple of each `swappedTrialScored` event** with the reaction `ripple`, on `trial.ear` (the visitor's ear, which is the side of the screen), labelled with `event.line`; the line of `noSoundLine`. `reaction-of-event.ts` gives null for this kind today, which is safe.
- **The result page.** The Comparison of `floor.repeat` beside its floor, live and saved, with both runs' wings by ear, each labelled with its earpiece, on the floor's own scale, the outcome label and lines, and the description for a visitor who cannot see the picture; `turnBackLine` above the picture when it is not null; no swap offer where `floor.swappedRepeat` is null. Whether the saved image (`save-picture.ts`) includes the repeat is the owner's choice. As Q5 decides, the save control comes back after a repeat on a visit already saved: the page shows it while `archive.savedCopyLacksRepeats(live)` is true and compares no lists itself. `create-result-view.ts` already replaces `live` with each new result snapshot, so `archive.save(live, …)` passes the records, and a press then gives `savedAgainLine`.
- **The owner's files that would break when the contracts grow** (Q8). The owner's coordinator changed all three in the working tree on 2026-11-15, before the first task:
  - `src/ui/visit/screen-of-snapshot.test.ts`: the `ResultSnapshot` literal of "names the result and holds nothing of it" lacks `swappedRepeats` and `turnBackLine`, and the `SwappedRepeatSnapshot` literal of "says that the swapped repeat is not built and leads back to the picture" lacks `repeat`. Without a change both would stop type-checking (`npm run typecheck`, so also `npm run build` and the deploy). Both are now cast, with `as ResultSnapshot` and `as SwappedRepeatSnapshot`, and both types are imported. Under Vitest both tests pass either way, because `screenOfSnapshot` reads neither field.
  - `src/ui/result/picture-sheet.test.ts`: `floor()` builds a `PictureFloor` without `repeat`. It is now cast with `as PictureFloor`. Under Vitest it passes either way.
  - The archive's new method `savedCopyLacksRepeats` breaks no file: searched in `src/ui/`, `tests/e2e/`, `src/main.ts` and `tests/`, nothing builds a `VisitArchive` by hand. `src/ui/visit/start-visit.ts` and `src/ui/result/start-result-sheet.ts` create one with `createVisitArchive`; `src/ui/result/create-result-view.ts` receives one typed `VisitArchive` and only calls its methods; `tests/e2e/` does not name the type. The store's `changePayload` breaks nothing either: only `createVisitStore` builds a `VisitStore`.
  - No other owner file was found that builds one of the grown types. `tests/e2e/result-page.spec.ts` builds `VisitToSave` values, whose new field is optional. `tests/e2e/simulated-result.ts` picks two fields of `ResultSnapshot`. `reaction-of-event.ts` and `screen-of-snapshot.ts` keep compiling and keep their behaviour; `screen-of-snapshot.ts`'s stand-in keeps working, because it calls `proceed`, which still returns to the result. No exhaustive `switch` over `VisitEvent["kind"]` was found in `src/ui`.
  - Behaviour that changes on the owner's result page without a file breaking: once `result-picture.ts` gains `repeat`, a floor with a record loses its swap offer; and every result after a visit to the stage has a `turnBackLine`, which the owner's page does not show until the owner adds it. With the stand-in screen the visitor never sees the instruction, yet the line appears, because the flow cannot tell what the screen showed.
- The browser tests in `tests/e2e/`, and the "real visit" half of the brief's "Done when".

## Questions for the project owner

The owner decided Q1, Q4 and Q5 on 2026-11-15, each with option (a); they are marked "Decided by the owner on 2026-11-15" wherever they appear, and the options not chosen stay below so that the choice can be read later. Q8 and the sub-question of Q5 were chosen by the owner's coordinator on 2026-11-15, and the owner may reverse them. Q2, Q3, Q6, Q7, Q9 and Q10 are not decided: the design uses the proposed answer of each so that it is complete, and every such proposal is marked PROPOSED, NOT APPROVED wherever it appears. The brief's "half the limit" (`unclearBelowLimitFraction` 0.5) and "one upward step" (the property's tolerance, `upwardStepDb`) are given and are not questions.

**Q1. What "Correct attribution" states. Decided by the owner on 2026-11-15: option (a).** The brief's four sentences are false for the brief's own rule when both the ears and the headphones differ, because the first run measures their sum and the repeat their difference ("Measurements": 324 of 1681 pairs fail for Step_Listeners, almost all where both or neither are at the limit). Options:

- (a) **Chosen by the owner on 2026-11-15.** The property states the rule's own answer for the true differences D1 = E + H and D2 = E − H, with "unclear" or no offer also accepted within one upward step of a boundary of the rule (|D1| = 15 dB, |D2| = 7.5 dB). The brief's sentences are asserted where one of E and H is zero: only the ear (H = 0, |E| ≥ 20) gives "follows the ear"; only the earpiece (E = 0, |H| ≥ 20) gives "follows the earpiece"; one of them zero and the other below 10 gives no offer. With both at or above the limit any answer is accepted, and "never stated as certain" is read as the wording: every attribution says "seems", and CP9 checks that no line claims certainty. The rule of the brief itself is kept as it is. (As first proposed, this option also asserted "neither" as |E| + |H| < 10 gives no offer; the owner's wording asserts the sentences only where one of E and H is zero, and the oracle still excludes an offer in that case, because |D1| ≤ |E| + |H|.) Measured: no failure for Step_Listeners or Attentive listeners. Cost: the property no longer says what the brief's sentences say for mixed cases; it says what the house does, and the brief's cases where one side is zero.
- (b) The brief's sentences as written, with its one-step tolerance around 15 dB for E and H. Cost: it fails, by measurement, for about one pair in five; it could only pass with a different rule.
- (c) A different rule that estimates both parts, E ≈ (d1 + d2) / 2 and H ≈ (d1 − d2) / 2, and names an attribution only when one part reaches a share of the limit and the other does not. Cost: a new rule and at least one new number, which the brief does not give; a "both" outcome the brief does not have; new copy.

**Q2. Which listeners CP1 uses. Proposed: (a), PROPOSED, NOT APPROVED.**

- (a) **Proposed.** Step_Listeners in the universal property, because their estimate is within one step of the truth on every run (threshold-search CP1), so one step of tolerance is exact; the Attentive and Plausible figures as a printed measurement that passes or fails nothing. Cost: the property says nothing about listeners whose answers vary.
- (b) Also Attentive listeners in the universal property. Measured: 0 failures in 5043 runs, but nothing makes that certain, so a rare run could fail without a bug; the threshold-search spec allows an Attentive estimate up to 5 dB off on each ear, two steps on a difference. Cost: a flaky property, or a statistical one with a fixed seed and a share of failures allowed, which is a new number.
- (c) Plausible listeners too. Measured: 20 failures of 5043 with one step, 12 with two; most runs have no level and say nothing. Cost: as (b), more often.

**Q3. Which earpiece the swap check plays in. Proposed: (a), PROPOSED, NOT APPROVED.**

- (a) **Proposed.** Always the left earpiece: the output stage's existing `playHeadphoneCheck`, the visit's own hiss, at 0 dB, with the Purpose `headphoneCheck`. No change to `src/audio/output`. Cost: a visitor who knows the visit's check played left can answer "right" without listening; the check guards against a forgotten swap, not against a visitor who wants to skip it.
- (b) A drawn earpiece. Cost: the output stage's `playHeadphoneCheck` takes no side, so `src/audio/output` would change, which this spec leaves alone; a drawn side needs the visit's random source and a second answer table.
- (c) A room sound through `play` with the Purpose `trial` on a drawn earpiece. Cost: a level for it, which is a new number; a trial sound outside the search, which the rise limit then counts.

**Q4. How often a floor may be repeated. Decided by the owner on 2026-11-15: option (a).** `product.md` step 7 still says "repeats one room"; see "Found in the brief and the steering".

- (a) **Chosen by the owner on 2026-11-15.** Until one run of that floor ends with a record. Then the floor shows the repeat and offers no other; other floors that offer one still do. A run that does not end leaves the offer. Cost: a visitor who swapped badly cannot try again on this visit; they can on a later one.
- (b) Any number of times; the floor shows the last record. Cost: a visitor can repeat until an answer pleases them, and the picture hides the earlier answers; the saved visit grows.
- (c) One repeat in the whole visit, as `product.md` step 7 says ("repeats one room"), on any floor that offers it. Cost: a visitor with two far-apart floors must choose; the brief says the repeat is "Offered on the result page for any floor".

**Q5. A visit saved before its repeat. Decided by the owner on 2026-11-15: option (a). Its sub-question was chosen by the owner's coordinator on 2026-11-15, and the owner may reverse it: the page compares nothing, and the archive's `savedCopyLacksRepeats` says whether the saved copy lags ("Saved visits").** The archive keys a visit saved on this page by its log object, and saving the same log again only renames it. The repeat does not touch the log, so a repeat done after a save would not reach the saved copy.

- (a) **Chosen by the owner on 2026-11-15.** The store gains `changePayload(savedVisitId, payloadJson)`, and `save` of a visit saved before, when the visit now holds records the saved copy lacks, replaces the payload under the same id, date and name, with the line `savedAgainLine`. The page shows its save control again while the live result holds more records than its saved copy. Cost: one store method and a wider `save` (its comment gains a sentence, which R1.3 lets through only with this answer); `src/storage` and its test change, and this is the one change the tasks make under `src/storage`. A sub-question: should a function in `src/session` say whether the saved copy lags, so that the page compares nothing, or may the page compare the two list lengths? Chosen by the owner's coordinator on 2026-11-15; the owner may reverse it: something in `src/session` says it, and the page compares nothing. It is the archive's method `savedCopyLacksRepeats(visit)`, false for a visit this page has not saved (R13.9, "Saved visits", CP11). The other answer, the page comparing `SavedVisit.swappedRepeats.length` with `ResultSnapshot.swappedRepeats.length`, would need the page to find the saved copy of the live visit itself.
- (b) The saved copy keeps no repeat; the result after the repeat says so, and saving again only renames. Cost: the visitor loses the repeat unless they delete the visit and save it anew, which gives it a new date.
- (c) The swap offer is shown only before the visit is saved. Cost: a visitor who saves first loses the repeat altogether.

**Q6. When the floor's calibration is gone or changed. Proposed: (a), PROPOSED, NOT APPROVED.** A device change after the rooms forgets the calibration; a device change during the visit means a floor measured before it used an earlier calibration than the one held now. The brief says the calibration is not repeated.

- (a) **Proposed.** The stage opens in `unavailable` with a line, plays nothing, and goes back to the picture. The offer still shows on the picture, because the picture is drawn from the summary alone. Cost: a press that leads to "cannot".
- (b) Narrow the offer in `summarizeVisit`: offered also requires the floor's attempt to use the last calibration of the log. Visit-flow D24 allows narrowing. Cost: the summary changes for new visits; visit-flow CP9, which states the offer exactly, changes; it still cannot know a device change on the result page, so (a) stays needed for that.
- (c) Allow the repeat on the new calibration: a left and right difference within one run does not depend on the anchor. Cost: a device change may mean other headphones, and then the repeat compares two pairs of headphones; the two runs' depths are on two scales.

**Q7. Turning the headphones back. Proposed: (a), PROPOSED, NOT APPROVED.**

- (a) **Proposed.** One line, at the end of the repeat and above the picture, whenever the earpiece state is not as marked: "If the headphones are still swapped, turn them back now, so that the left earpiece is on your left ear." No sound. Nothing later relies on it: a second repeat checks again, and a new visit checks left and right. Cost: the line stays above the picture for the rest of the visit, also after the visitor turned back.
- (b) A turn-back check: a press plays the hiss again and the answer must be "left"; the line goes when it is. Cost: one more sound, phase and state; nothing in a finished visit needs it.

**Q8. Landing the contract's additions against the owner's fixtures. Chosen by the owner's coordinator on 2026-11-15; the owner may reverse it: option (a), already done in the working tree.** The new fields of `ResultSnapshot`, `SwappedRepeatSnapshot` and `PictureFloor` are required, as visit-flow D1 and result-page D1 intend, and three literals in the owner's tests lack them (`src/ui/visit/screen-of-snapshot.test.ts` twice, `src/ui/result/picture-sheet.test.ts` once). After the first task, `npm run typecheck`, and with it `npm run build`, fails on those files until they change; this spec's tasks may not touch `src/ui/` (R23.1). Options:

- (a) **Chosen by the owner's coordinator on 2026-11-15.** The owner changes the three literals before the first task, for example `{ ...base("swappedRepeat", 3), room: stairs, visitLog: {} as VisitLog, summary: {} as VisitSummary } as SwappedRepeatSnapshot`, the same with `as ResultSnapshot`, and `repeat: null` in `floor()` after the first task or `as PictureFloor` before it. Each compiles before and after the addition. This is what the owner chose for the replay (its Q6). Cost: three lines of the owner's, at a set time.

  Done in the working tree, and checked on 2026-11-15 by reading the two files: in `src/ui/visit/screen-of-snapshot.test.ts` the literal of "names the result and holds nothing of it" ends `} as ResultSnapshot)` and the literal of "says that the swapped repeat is not built and leads back to the picture" ends `} as SwappedRepeatSnapshot)`, with both types added to the file's import from `../../session/visit-flow-types`; in `src/ui/result/picture-sheet.test.ts` `floor()` returns its literal `as PictureFloor`. A type assertion from a literal that lacks the new fields to the grown type is allowed, because the grown type is assignable to the literal's type, so the three compile before and after the contract grows. `npm run typecheck` passes on the working tree as it is. As a further check, in a temporary copy of the tree outside the workspace, deleted afterwards, the three new fields were added to the two contract files: `tsc -p tsconfig.node.json` reported no error in `src/ui/` or `tests/e2e/` (only in `create-visit-flow.ts` and `result-picture.ts`, which task 1 changes), and with the two files as committed, without the casts, it reported exactly the three literals.
- (b) The owner allows the first task to add the fields to those literals, as the one change under `src/ui/`. Cost: an exception to R23.1.
- (c) Make the new fields optional. Cost: every reader must handle a missing field that never occurs, and a flow or picture that forgot a field would still compile.

**Q9. Run counts and the time budget of the property files. Proposed: the counts and the rule of "Run counts and time", PROPOSED, NOT APPROVED.** The counts: 1000 for the pure CP1 and CP2, 300 for most controller properties, 200 for CP7 and CP8, 500 for CP9, 30 for CP10, 300 for CP11. The budget: the rule the owner chose for the replay on 2026-11-15, the slowest of three runs of `npm test` with every property file of this spec present, plus about three tenths, rounded up to a multiple of 15 seconds, on the project machine when nothing else heavy runs on it. Options:

- (a) **Proposed.** These counts and this rule. The tasks record times and never stop on an unmeasured budget; the final task computes the budget and reports it. Cost: `npm test` grows by an estimated 30 to 60 seconds, not measured; the replay's files already take about 60 seconds of it.
- (b) Fewer controller runs (100 each for CP3 to CP8), the same rule. Cost: about two thirds less time for those files; a rare case is less likely to be found in one run.
- (c) A fixed budget chosen now, such as 60 seconds. Cost: a number without a measurement behind it, which the replay's experience (45 seconds proposed, 56 to 62 measured) argues against.

**Q10. A repeat that does not finish. Proposed: (a), PROPOSED, NOT APPROVED.**

- (a) **Proposed.** It gives no record, is shown nowhere and is not saved; only its run number and the turn-back line remain. Cost: a run cut short by a device change leaves no trace the visitor can see.
- (b) It gives a record with an ending and no outcome, shown beside the floor as "not finished" and saved. Cost: a third kind of record in the picture and the payload; more copy; nothing to compare.

### Found in the existing code

Not questions, but things the owner may want to know. None is changed here.

- `screenOfSnapshot` hides the stop control in `swappedRepeat` (see "What the owner builds").
- The stand-in `leavingCopy.swappedRoomNotBuilt` stays in `src/copy/leaving-copy.ts` until the owner's screen no longer uses it.
- `chooseSwappedRepeat` today shows the stage for any offered floor, any number of times; Q4, decided by the owner on 2026-11-15, narrows it.
- A second `save` of the same log only renames; Q5, decided by the owner on 2026-11-15, widens it for a saved copy that lacks repeats.
- An unsupported report from `activate` inside a press of this stage drops a finished visit and shows `unsupported`, as visit-flow R15.1 says for every stage and as the replay noted. A device that ran the rooms is very unlikely to turn unsupported here.
- In a room of the visit, three refusals in a row leave the house (`soundRefused` calls `leave`); in the repeat they end the repeat only, and the comment of `visitFlowConfig.refusedPlaysInARowMaxCount` ("the visit ends") stays as it is, as the replay left it.
- The flow's `beginPause` and `endPause` write to the visit's recorder, which must not be written after the rooms; the repeat's pauses go to its own recorder (D2).
- The comments of `VisitFlow.answer` and `pause` say "In a room"; they gain one sentence for the repeat's room.
- `PresentedTrial` in `room-runner.ts` has no earpiece; the flow adds it in the hook (R8.7) instead of changing the runner.
- `summarize-visit.ts` keeps the helpers a repeat needs private; this spec exports them unchanged.

### Found in the brief and the steering

- The brief's property is not true of the brief's rule for mixed cases (Q1, "Measurements").
- The brief offers the repeat "for any floor"; `product.md` step 7 says "repeats one room" (Q4). The owner decided Q4 on 2026-11-15 with option (a): a floor may be repeated until one run of it ends with a record, and other floors that offer a repeat still offer it. The wording of `product.md` step 7 is now behind this decision. Changing it is the owner's: no task of this spec changes `.kiro/steering/`.
- The brief does not say how the repeat leads back to the result, whether it is saved, what happens to a visit saved before it, or what a device change does; D8, D11, D17 and Q5, Q6, Q10 cover them.
- The brief says the instruction is repeated "if it did not" swap; it does not say what follows a check heard on both sides or not at all. D6 uses the visit's lines for those and lets the visitor play the check again.
- `hearing-method.md` says "If the quieter side follows the ear". The brief says "the same ear needed the louder sound". For a difference both say the same thing; the design uses the brief's form because it names the side whose level is higher.
- `docs/architecture.md` lists the stages as "... missed-sound replay, result, swapped repeat", which matches the flow.

## Decisions

Each point below was open in the brief, the steering, the earlier specs or the code, and is this spec's to settle. Where the owner may see it otherwise, a question names it.

**D1. The contracts gain four methods, three fields, one event kind, the new types, three fields of the result page and one method of the archive; nothing in them changes, apart from what `save` does for a saved copy that lacks repeats (Q5).** Visit-flow D1 and result-page D1 let later specs add fields, event kinds and methods. Each new method is one press of the visitor, so the screen calls one method per control and two of them are the gestures that may start sound. `proceed` keeps its meaning, back to the picture, in every phase (visit-flow R16.5), and `stop` keeps its own (visit-flow R14.3). `answer`, `pause` and `resume` are reused in the repeat's room, because it is a room: the visitor answers and pauses as in every room. `VisitToSave.swappedRepeats` is optional because `VisitToSave` is an input that existing callers build; the output fields are required (Q8). `savedCopyLacksRepeats` is a method of the archive, not a function of two lists, because only the archive knows which saved visit the page saved for a log object (the sub-question of Q5, chosen by the owner's coordinator on 2026-11-15; the owner may reverse it).

**D2. The repeat keeps its own record beside the visit log, and never touches the log or the summary.** The log is assembled once when the rooms end (visit-flow D28) and the replay, the result, the saved visit and the no-headphone replay read it; the archive keys a saved visit by the log object (result-page, "The archive"). Writing the repeat's trials into the log would change what the replay plans and what the summary counts, and would break that key. So the repeat runs on a fresh `VisitLogRecorder` of its own, whose log is turned into a Repeat_Record. The repeat's pauses go there too; the flow's `beginPause` and `endPause`, which write to the visit's recorder, are not used in this stage, as in the replay (missed-sound-replay D18).

**D3. The search runs over ears, and the output is asked for the other earpiece.** The answer is the only thing the search learns, and the visitor names the ear they heard. Running the search over ears keeps it exactly as before, with the same scoring of a wrong side (`hearing-method.md`). The swap goes into one place: a view of the output whose `play` sends a request for an ear to the earpiece on that ear. The room runner and the output stage are unchanged, and the mapping is fixed for the whole run. The other way, running the search over earpieces and translating each answer, would change the meaning of `ear` in the room runner's records and make the ripple appear on the side of the earpiece, not the side the visitor heard.

**D4. Every trial, answer and check names both.** The visit log's `ear` stays "the ear it played to", which is what reached the visitor; `earpiece` is the channel; `responseEarpiece` is the earpiece on the ear named; each check names its earpiece; the record names the whole mapping. With these, the record alone says what played where and what the visitor said, and CP3 can compare it with the channels the backend received. The rooms of the visit do not gain the field: their mapping is the identity, which the visit's headphone check established, and their log is unchanged (D2).

**D5. The house knows only what it has checked.** The flow keeps one earpiece state per visit: as marked after the visit's check, unknown once a swap is asked for, swapped after a confirmed check, unknown again as soon as the stage is left. A room run starts only from `swapped`, and only a confirmed check of the same visit to the stage sets it; leaving the stage, however it happens, cannot leave it at `swapped`. So nothing later can play a sound for an ear on the wrong earpiece: a second repeat checks again from its instruction, and a new visit checks again with its headphone check. The Turn_Back_Line says what the visitor should do (Q7).

**D6. The swap check is the visit's own check, judged the other way round.** The output stage already has one single-sided check: the hiss in the left channel at 0 dB with the Purpose `headphoneCheck`. After a swap it reaches the right ear. `judgeSwapCheck` maps `right` to `confirmed`, `left` to `notSwapped` (the instruction again, as the brief asks), and `bothSides` and `nothingHeard` to the visit's own judgements and lines. There is no limit on tries: the visitor can always go back to the picture. The side is Q3.

**D7. Nothing sounds until the visitor presses for it.** Entering the stage and confirming the swap play nothing; the hiss plays on `playSwapCheck`; the room starts on `startSwappedRoom` after a confirmed check, in a phase of its own, so that the answer to the check is never also the start of the room. Both presses are gestures, which the browser needs to start sound again after the page was hidden (`tech.md`). After a pause, sound starts again only on `resume`. The interface that exists today calls neither new press, so the stand-in plays nothing.

**D8. The repeat uses the first run's calibration or does not run.** The brief: "Calibration is not repeated. The same calibration gain is used." The output stage holds the last kept calibration; a calibration is kept only before a room, so after the rooms it is the log's last one, or none after a device change. When it is none, or when the floor's first run used an earlier one, the stage opens in `unavailable` and plays nothing. A device change before the room gives the same; one during the room ends the run. Q6 asks whether the owner prefers to narrow the offer instead.

**D9. The engine runs exactly as before; only the seed is new.** The search is created as `startRoom` creates every room's, from `hearingMethodConfig` with the cap `roomSearchCapDb` of the room's top, which with the same calibration is the first run's cap; the controller checks that and throws if not. The same room runner plays it, so the gaps, the no-sound share and spacing, the response window, the scoring, the rule of three refusals and the discarding of a paused trial are those of every room. The seed is the next draw of the visit's source, after the replay's: the same seed as the first run would replay the first run's schedule of gaps and no-sound trials for the same answers, which a visitor could learn. `swappedRepeatEngineSeed` gives the draw from the log and the run number, so a record can be checked from the log.

**D10. The outcome is the brief's rule, and the repeat's ears are judged like a room's.** "The same ear needed the louder sound both times", "the same earpiece needed the louder sound both times", "unclear: anything else, including a difference that shrank below half the limit, or an unreliable repeat". The rule compares the signs of the two differences by ear, after the test for a repeat ear without a level and the test for a difference below half the limit. An ear quieter than the house can whisper or not caught at the loudest has no level and is unclear like an unreliable one, because no number can be compared. `levelNotAsAsked` applies as in a room; the visit's pooled false alarm rule is not applied again, because the first run passed it and the summary does not change.

**D11. Only a repeat that runs to its end gives a record.** A record without an outcome has nothing to set beside the first run. A run cut short gives no record, shows nothing and is not saved; its seed was drawn, so the run number still counts it. Q10 asks whether the owner wants it shown.

**D12. One finished repeat per floor.** Decided by the owner on 2026-11-15 (Q4, option (a)): a floor may be repeated until one run of it ends with a record; other floors that offer the repeat still offer it.

**D13. Pauses only in the room; a cut check is played again.** In the room the repeat pauses as every room does: a visitor's pause, a hidden page and an interruption discard the presented trial, which comes again after its own gap (visit-flow D9). Before the room nothing plays but the hiss, so a hidden page begins no pause; if it cuts a hiss that waits for its answer, the check counts as not played, so that an answer always belongs to a hiss the visitor could hear. A device change ends the repeat, because the calibration is gone (D8). A left page returns to the picture, as `stop` does, because the visit is complete (visit-flow D13).

**D14. A refused sound follows the room's rule, and three refusals end the repeat, not the visit.** The room runner already retries a trial after its gap and gives up after `refusedPlaysInARowMaxCount`; in a room that leaves the house, but here the visit is complete and its result must stay (as the replay does, missed-sound-replay D16). A refused check counts nothing, because it is one press and the visitor can press again. Which sound can be refused `busy` is in its own table.

**D15. Back and stop both return to the picture, silencing first.** `proceed` from any phase is "Back to the picture"; it calls `stopAll` when a sound of the stage may be under way. `stop` silences at once and returns, as today. Both end a run under way without a record.

**D16. The repeat is drawn beside its floor, on the floor's own scale, and corrects nothing.** The brief: "The result page shows the repeat next to the first run for that floor." The Comparison holds both runs by ear, each ear labelled with its earpiece, so that a visitor can see which side moved; its depths use the first run's cap and the visit's floor, so a depth in the repeat means what it means on that floor and nothing across floors. The floor's own wings, depths, difference and description are unchanged (brief, "Out of scope"). The earlier visit's outlines read only summaries, so comparisons are unchanged.

**D17. A saved visit keeps its repeats under an optional key; a visit without one is saved as before.** Writing the key only when there is a record keeps every payload without a repeat identical to what the result page writes today, so its tests and every saved visit stay as they are. The format version stays 1, because the reading code ignores unknown keys and a missing key means no repeat. The records are checked on reading as strictly as the summary is, and their outcome is worked out again from their own numbers, so that a changed record is unreadable rather than wrong. What happens to a visit saved before its repeat is Q5, decided by the owner on 2026-11-15: its payload is replaced under the same id, date and name.

**D18. Every string and number is in the view.** The screen then has nothing to work out or word, and CP9 can check everything the screen shows from the views alone. The copy defines its own names for sides, outcomes and reasons, because it may import only `config`, and type tests check that they equal the session's.

**D19. The room's snapshot leaks nothing.** The phase `room`'s view depends on nothing but the pause, and its one event comes at scoring, so visit-flow R11.2 and R11.3 hold in the repeat's room as in every room.

**D20. The outcome lines say "seems" and say where, nothing more.** Two runs of a staircase cannot prove where a difference belongs. "Seems to belong to your ears" and "seems to belong to the headphones" are the brief's words; the line of `followsEar` adds the limits statement's sentence on when to see a hearing professional, from the constant itself, so that the product says it in one wording only. No line says an ear is fine or the headphones are faulty.

**D21. "Correct attribution" is stated in the rule's own terms, for Step_Listeners.** The measurement shows that the brief's sentences hold where one of the two differences is zero and fail where both act, because the first run sees their sum and the repeat their difference. The property that can be true for every run is the rule applied to the true sum and difference, within one step of its boundaries, which is exact for Step_Listeners. The brief's sentences are asserted where one of E and H is zero. The owner decided this on 2026-11-15 (Q1, option (a)); the choice of Step_Listeners is still Q2, PROPOSED, NOT APPROVED.

**D22. The flow keeps gestures, the pause field, the earpiece state and the stage; the controller keeps the rest.** The same split as the replay (missed-sound-replay D20), for the same reason: the controller can be tested on a shell and a manual timer in milliseconds, and the flow's part stays small enough for CP10's whole visits.

**D23. One number is added, from the brief.** `unclearBelowLimitFraction` = 0.5, "half the limit". The limit, the search's settings, the check's level and the refusal count are existing values. No timing number is needed, because every step waits for a press or for the search's own gaps.

**D24. The test hook carries the earpiece, and the simulated visitor wears its headphones.** A listener with an imbalance must hear a sound on the earpiece that played it, on the ear that earpiece sits on. The simulated visitor takes the earpiece from the hook, keeps its own arrangement, swaps when told (or not, by its script), and answers the check from what it wears. So a flow that recorded the wrong earpiece would give answers that do not fit the record, and CP3 would see it.

**D25. What the tasks touch, and how they are committed.** The tasks create and change only the files listed in "Files", never `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, a CSS or HTML file, `src/main.ts`, the root `README.md` or `.kiro/steering/`. They only add to the two contract files; in `create-visit-flow.ts` they change nothing outside this stage and the shared paths it branches from (`onOutputStopped`, `endPause`, `pause`, `answer`, `proceed`, `stop`, `chooseSwappedRepeat`, `dropVisit`, `buildSnapshot`, the hook of `startRoom`). They do not commit. A separate run makes one commit per task with a one-line message, so anything a task must record (property times, a counterexample, the measurement printed again) is written in this design or a README.

**D26. Every property is universal; times are recorded, and the budget is set from measured runs.** Nothing here is statistical, so no seed is fixed. Because the budget rule needs three runs with every property file present, no task before the last can know the budget, so no task stops on one; each records its times, and the last computes the budget and reports it (Q9).

**D27. The measurement was made once from outside the repository.** It answers whether the brief's sentences hold for the brief's rule, which Q1 and Q2 need, and took one script over the existing listener tools. The script was not kept in the working tree; a task adds it to `tests/listeners/` with the same seeds, so that the figures can be reproduced and checked. The figures come from the engine alone and say nothing about real visitors.

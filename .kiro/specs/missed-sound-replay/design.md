# Design: missed-sound replay

## Overview

The replay is the moment before the visitor leaves. The house plays again every sound the visitor did not catch, louder, from the room and the side it came from, in the order it came, and then shows the picture. The visit flow already reaches the stage `missedSoundReplay` after the last room, calls `output.beginRoom()` there, and leaves it empty (visit-flow D21). This spec fills it. The project owner draws the screen by hand in `src/ui` from the stage's snapshot.

```
   src/ui  (built by hand by the owner against visit-flow-types.ts)
     │  flow.startReplay()   flow.proceed() (skip, or go on)   flow.stop()   flow.resume()
     │  snapshot.replay: MissedSoundReplay      event: replaySoundStarted
     ▼
  ┌──────────────────────────── src/session ─────────────────────────────────────────────┐
  │  create-visit-flow.ts   the stage: gesture, pause field, stop, skip, result           │
  │    └── create-missed-sound-replay.ts   the Replay_Controller: phase, timers, plays    │
  │          ├── missed-sound-replay-plan.ts   pure: VisitLog → Replay_Plan               │
  │          │     └── even-selection-indexes.ts   pure: which of n to play when n > max  │
  │          ├── replay-counts.ts              pure: VisitLog, order → counts per side    │
  │          ├── replay-render-seed.ts         pure: VisitLog → the render seed           │
  │          ├── replay-sound.ts               pure: planned sound + play outcome → sound │
  │          └── missed-sound-replay-view.ts   pure: state → MissedSoundReplay            │
  └───────────┬────────────────────────────────────────┬─────────────────────────────────┘
              │ play({ purpose: "replay" }), stopAll   │ every visitor-facing string
              ▼                                        ▼
   src/audio/output  (unchanged)                 src/copy  replay-copy.ts, replay-lines.ts
```

The design rests on six choices.

- **The replay is a plan made from the visit log alone.** `planMissedSoundReplay` reads the log and the config and nothing else: which trials were missed, on which ear, in which room, at what level, and at what level each is played again. The seed of the renders also follows from the log. So the replay of a stored log can be computed again anywhere, and a failing case is replayed from the log.
- **"The cap" is the cap the output stage already enforces.** Each sound is asked for at 20 dB above the level it was missed at, or at its room's top under the calibration the output stage holds, whichever is lower. The room top is the lower of the anchor cap and the ceiling for that sound (audio-output R9.2), which is audio-safety rule 2, and at or below it the ceiling never acts (audio-output R9.4). The session knows it from the log, so the ripple label can say "as loud as the house may play" before the sound plays, and the output stage never has to lower a replayed level.
- **Nothing plays until the visitor has read what is coming and pressed.** The stage opens with the announcement and waits for `startReplay`, which is a press and so also the gesture that may start sound again. The interface that exists today never calls `startReplay`, so until the owner builds the replay screen the stage plays nothing.
- **The snapshot holds every moment in words.** The stage's snapshot gains one field, `replay`, a view per phase: the announcement, the sound under way with its side, room, ripple label and whether the cap changed it, the running count of each side in words, the selection line, the pause line, the end line, the line when nothing was missed, the labels of every control, and whether the replay can be started or skipped now. One event, `replaySoundStarted`, says when to draw a ripple.
- **The visit log is not touched.** The replay reads the log; it writes nothing to it. The result shows the same log object and the same summary whether the replay was watched, skipped or cut short. The result page saves that log unchanged (result-page D9) and its archive keys a saved visit by that object, and the no-headphone replay reads the same log.
- **The output stage is unchanged.** The replay uses the Purpose `replay`, which exists for it. Of the output stage's limits only the rise limit does not act on a replay, as rule 4 allows; every other limit acts, and "Which limits of the output stage act on a replayed sound" lists them from the code.

## Sources

- `docs/briefs/07-missed-sound-replay.md`.
- `.kiro/steering/`: `audio-safety.md` (rules 1 to 9, above all rule 4 and its one exception for the replay, rule 7 and the stop control, and the initial values: 20 ms fades, 1.5 s, the 0.25 ceiling), `product.md` (step 5: "Every sound they missed is played again, louder, from where it was"; the experience rules: no sudden loud sounds; a ripple labelled with pitch and level for a visitor without headphones), `wording.md` (banned words, levels relative to the calibration, tone: the house never mocks a miss), `hearing-method.md` (10 dB down after a catch, 5 dB up after a miss; a wrong side counts as a miss for the ear and is recorded separately), `structure.md` (module rules, numbers in `src/config`, strings in `src/copy`, `Db`, `Ms`, `Count` endings, `left` and `right`), `tech.md` (time and randomness injected, tests under Node, the `AudioContext` started only in a gesture).
- `docs/architecture.md`: one visit log as the source for the replay, the result, the stored result and the replay mode; the session as the only part that knows the order of things.
- `docs/roadmap.md`: spec 7 needs spec 5; the replay is never cut, because it is what a judge without headphones sees.
- `.kiro/specs/visit-flow/`: D1 (the contract only grows), D6 (a wrong side is shown as nothing, like a miss, "because the hearing method counts it as a miss for the ear and the replay will show it"), D13 (stop in the replay shows the result), D19 (one seed makes every random choice; seeds drawn as `floor(u × 2³²)`), D21 (the replay stage is reached and left empty), D25 (three refusals in a row), D28 (the log is assembled once, when the rooms are over), R11, R12, R14.2, R15.1, R16, and the tables "What each stage accepts", "Pauses" and "Stop".
- `.kiro/specs/audio-output/`: R9.2 (the room top), R9.4 and CP6 (at or below a room's top a sound plays at the level asked, with no clamp; CP6 checks this on the search's grid), R11.1 and R11.5 (a replay is exempt from the rise limit, and its gain is still recorded as the previous gain), D4, D15, D16 (one sound at a time), D22 (the clamp log), and "What the visit-flow spec must do" ("Call `beginRoom` ... before the missed-sound replay", "Play replays with the Purpose `replay`").
- `.kiro/specs/ghost-sounds/`: the room sounds and their durations (800 to 1400 ms).
- `.kiro/specs/threshold-search/`: the outcomes `caught`, `wrongSide` and `missed`, and the counts of `EarCounts` (`missCount` counts answers of `none` only).
- `.kiro/specs/result-page/`: the form of this spec; D9 (the log is saved unchanged); the copy conventions (`relativeLevelLabel`, `pitchLabel`, `RangeError` for values that do not fit).
- The code: `src/session/create-visit-flow.ts` (the stand-in stage: `finishRoom` calls `output.beginRoom()`, assembles the log and enters the stage; `canProceed` is true there; `proceed` and `stop` lead to `result`; stop reports in this stage begin no pause because it is not in `pausableStages`; `beginPause` and `endPause` write to the recorder), `src/session/visit-flow-types.ts`, `src/session/visit-log-recorder.ts` (the log is a frozen copy), `src/session/room-runner.ts` and `src/session/window-start.ts` (how a sound's start is put on the page clock, and how refusals are handled), `src/audio/output/create-audio-output.ts` (`previousAppliedGain: sound.purpose === "replay" ? null : { ...previousGain }`, and the replay's gain recorded as the previous gain), `src/audio/output/prepare-playback.ts`, `src/audio/output/room-top-level.ts`, `src/audio/output/range-report.ts`, `src/session/room-search-cap.ts`, `src/config/` (every config file named in this design), `src/copy/room-copy.ts` (`pitchLabel`, `relativeLevelLabel`, `roomNames`, `caughtLine`), `src/copy/leaving-copy.ts`, `src/copy/find-banned-terms.ts`, `tests/listeners/simulated-visitor.ts` (it calls `proceed` after a rest in this stage), `tests/properties/visit-flow-harness.ts`, `tests/properties/output-shell-harness.ts`.
- Read only: `src/ui/visit/screen-of-snapshot.ts` (the stage shows the stand-in notice `leavingCopy.lastRoom` with "See the picture", which calls `proceed`, and hides the stop control there), `src/ui/visit/screen-of-snapshot.test.ts` (builds a `MissedSoundReplaySnapshot` literal), `src/ui/visit/reaction-of-event.ts` (gives null for an event kind it does not know), `src/config/ripple-config.ts` (a ripple lasts 2 × 340 + 2200 = 2880 ms).

No web source was read for this design. One measurement was made, described in "Measurements".

## Files

Created:

```
src/config/
  missed-sound-replay-config.ts        missedSoundReplayConfig (R2)
  missed-sound-replay-config.test.ts

src/session/
  even-selection-indexes.ts            evenSelectionIndexes: which positions of n to play (R5)
  even-selection-indexes.test.ts
  missed-sound-replay-plan.ts          planMissedSoundReplay, PlannedReplaySound, ReplayPlan (R3, R4, R5)
  missed-sound-replay-plan.test.ts
  replay-counts.ts                     replayCounts: the counts of each side through an order (R8)
  replay-counts.test.ts
  replay-render-seed.ts                replayRenderSeed: the render seed from the log (R14.2)
  replay-render-seed.test.ts
  replay-sound.ts                      replaySoundOf: a planned sound and its play outcome as the view gives it (R4.6, R7)
  replay-sound.test.ts
  missed-sound-replay-view.ts          missedSoundReplayView: the Replay_View of one moment (R6 to R13)
  missed-sound-replay-view.test.ts
  create-missed-sound-replay.ts        createMissedSoundReplay: the Replay_Controller (R6, R7, R10 to R13)
  create-missed-sound-replay.test.ts
  replay-types-match.test.ts           type-level checks: copy names against session names (R1.6)

src/copy/
  replay-copy.ts                       replayCopy: every fixed string of the replay (R16)
  replay-lines.ts                      countWords and every sentence that depends on the replay (R16)
  replay-copy.test.ts

tests/properties/
  missed-sound-replay-arbitraries.ts   drawn visit logs, max counts, replay scripts, refusal scripts
  missed-sound-replay-harness.ts       a Replay_Controller on a calibrated output shell, or on a scripted output
  missed-sound-replay-text.ts          every string of a view and an event, and the allowed forms of CP9
  missed-sound-replay-cp1-missed-in-order.property.test.ts
  missed-sound-replay-cp2-counts-equal-log.property.test.ts
  missed-sound-replay-cp3-even-selection.property.test.ts
  missed-sound-replay-cp4-nothing-missed.property.test.ts
  missed-sound-replay-cp5-skip-plays-nothing-more.property.test.ts
  missed-sound-replay-cp6-reproducible-from-log.property.test.ts
  missed-sound-replay-cp7-announced-faded-capped.property.test.ts
  missed-sound-replay-cp8-pauses-endings-refusals.property.test.ts
  missed-sound-replay-cp9-safe-wording.property.test.ts
  missed-sound-replay-cp10-whole-visits.property.test.ts
  missed-sound-replay-simulated-visits.test.ts   a quick and a full visit with the replay watched to its end
  missed-sound-replay-regressions.test.ts

tests/listeners/
  replay-length-measurement.ts         the measurement of "Measurements", as a function
  print-replay-length-measurement.ts   prints it again with the seeds of "Measurements"
```

Changed, by addition only:

- `src/session/visit-flow-types.ts`: the additions of "Interface contract" (R1).
- `src/session/visit-flow-types.test.ts`: type-level checks of the additions.
- `src/session/create-visit-flow.ts`: the stage as "The replay in the visit flow" describes. Nothing it does in another stage changes.
- `src/session/create-visit-flow.test.ts`: examples of each row of "What each phase accepts".
- `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-timeline.ts`: their wrappers of `VisitFlow` pass `startReplay` through, because they implement the interface. Nothing else changes in them.
- `tests/listeners/simulated-visitor.ts` and `tests/properties/visit-flow-arbitraries.ts`: an optional replay behaviour in the visitor script. Without it the visitor does what it does now, a `proceed` after a rest, which is a skip, so every visit-flow property runs as before.
- The READMEs of `src/session/`, `src/copy/`, `src/config/`, `tests/properties/` and `tests/listeners/`.

Not changed: everything under `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `.kiro/steering/`, `src/engine/`, `src/audio/`, `src/storage/`; `index.html`, `listen.html`, `result-sheet.html`, `src/main.ts`, the root `README.md`; `src/session/result-page-types.ts` and every file of the result page; `src/session/visit-log-recorder.ts`, `room-runner.ts`, `summarize-visit.ts`; every existing value in `src/config`; `src/copy/leaving-copy.ts` (its stand-in `lastRoom` stays for the owner's screen until the owner replaces it); `package.json` and `package-lock.json`; every hook and every lint rule.

## Interface contract

The contract is `src/session/visit-flow-types.ts`. This spec adds to it and changes nothing in it (visit-flow D1, R1). The first task writes the additions with the smallest change of `create-visit-flow.ts` that builds the view, and with `startReplay` doing nothing, so the owner can build the screen at once and the stage still plays nothing (R1.5).

### How the interface uses it

```ts
// On every snapshot of the stage:
flow.subscribe((snapshot) => {
  if (snapshot.stage !== "missedSoundReplay") return;
  const view = snapshot.replay;                       // MissedSoundReplay
  showStop(view.stopLabel);                           // visible in every phase (audio-safety rule 7)
  switch (view.phase) {
    case "nothingMissed": show(view.heading, [view.line, view.counts.leftLine, view.counts.rightLine]);
                          button(view.proceedLabel, () => flow.proceed()); break;
    case "announcing":    show(view.heading, [...view.announcementLines, view.selectionLine]);
                          button(view.startLabel, () => flow.startReplay());       // a press: it may start sound
                          button(view.proceedLabel, () => flow.proceed()); break;  // skip
    case "playing":       if (snapshot.pause !== null) { show(view.pauseLine); button(view.resumeLabel, () => flow.resume()); }
                          else button(view.proceedLabel, () => flow.proceed());    // skip the rest
                          if (view.current) { lightRoom(view.current.room.roomId); show(view.current.positionLabel); }
                          if (view.counts) show([view.counts.leftLine, view.counts.rightLine]); break;
    case "finished":      show(view.heading, [view.endLine, view.counts.leftLine, view.counts.rightLine]);
                          button(view.proceedLabel, () => flow.proceed()); break;
  }
});

// The ripple of each replayed sound, at the moment it starts:
flow.onEvent((event) => {
  if (event.kind === "replaySoundStarted") ripple(event.sound.ear, event.sound.rippleLabel);
});

// The stop control, in every phase of this stage:
stopButton.onclick = () => flow.stop();               // silences at once and shows the result
```

### What is added to each existing type

| Type | What is added | Code outside `src/session` that builds or implements it |
|---|---|---|
| `VisitFlow` | The method `startReplay(): void` | `tests/properties/visit-flow-harness.ts` and `tests/properties/visit-flow-timeline.ts` wrap the flow in an object typed `VisitFlow`; they pass the method through (this spec's tasks). `src/ui` only calls the flow |
| `MissedSoundReplaySnapshot` | The field `readonly replay: MissedSoundReplay`, always present | `src/ui/visit/screen-of-snapshot.test.ts` builds one as a literal for its stand-in test. With the field required, that literal no longer type-checks until it gains the field. It is the owner's file (Q6) |
| `VisitEvent` | The member `ReplaySoundStartedEvent` | Nothing builds a `VisitEvent` outside the flow. `src/ui/visit/reaction-of-event.ts` gives null for a kind it does not know, and the visit-flow property CP3 ignores a kind it does not list, so both keep working |
| `VisitLog`, `VisitSummary`, `ResultSnapshot`, `SnapshotBase`, `VisitStage`, `PauseReason`, `TrialReaction`, `ScoredVisitTrial`, every other type | Nothing | |
| `src/session/result-page-types.ts`, `src/audio/output/output-types.ts`, `create-audio-output.ts` | Nothing | |

`SnapshotBase.pause` and `SnapshotBase.canProceed` keep their meaning: in this stage a Pause holds only while the replay is paused by a hidden page or an interruption (D15), and `canProceed` is true whenever no Pause holds, as it is today.

### The additions

Added to `VisitFlow`, after `chooseSwappedRepeat`:

```ts
  /**
   * Missed-sound replay, phase `announcing`: starts the sounds. Call it from the visitor's press,
   * because it may start sound (it calls `activate` within the call). Does nothing in any other
   * phase or stage, or while a pause holds. In this stage `proceed` skips the replay, or goes on to
   * the result once it has finished, and `stop` silences at once and shows the result.
   */
  startReplay(): void;
```

`MissedSoundReplaySnapshot` after the addition:

```ts
/** The replay of missed sounds (missed-sound-replay design.md). */
export interface MissedSoundReplaySnapshot extends SnapshotBase<"missedSoundReplay"> {
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
  /** What the replay shows and says now. Every string comes from `src/copy`. */
  readonly replay: MissedSoundReplay;
}
```

`VisitEvent` after the addition:

```ts
/** Every event. The interface ignores a kind it does not know, so later specs can add kinds. */
export type VisitEvent =
  RoomStartedEvent | TrialScoredEvent | RoomFinishedEvent | ReplaySoundStartedEvent;
```

The new block, at the end of the file:

```ts
// ─── The missed-sound replay ─────────────────────────────────────────────────────────────
// missed-sound-replay design.md. Every level is in decibels relative to the visitor's calibration.

/**
 * `nothingMissed`: the visit has no missed sound. Nothing plays; one line says so.
 * `announcing`: the house says what is about to happen. Nothing plays until `startReplay`.
 * `playing`: the sounds play one after another, or the replay is paused.
 * `finished`: no more sound plays. A line says how the replay ended.
 */
export type ReplayPhase = "nothingMissed" | "announcing" | "playing" | "finished";

/**
 * `allPlayed`: every sound of the replay was played. `deviceChanged`: the audio device changed,
 * so the calibration is gone and the replay stopped. `soundRefused`: the house could not play a
 * sound three times in a row.
 */
export type ReplayEnding = "allPlayed" | "deviceChanged" | "soundRefused";

/** The pause reasons that pause the replay. A device change ends it instead, and nothing else pauses it. */
export type ReplayPauseReason = Extract<PauseReason, "hidden" | "interrupted">;

/** Released when a replayed sound starts. Draw its ripple now, on its side. */
export interface ReplaySoundStartedEvent {
  readonly kind: "replaySoundStarted";
  readonly sound: ReplaySound;
}

/** One sound of the replay, as it was played. Plain data, frozen. */
export interface ReplaySound {
  /** Its place in the replay, from 1 to `replaySoundCount`. */
  readonly position: number;
  /** Such as "Sound 3 of 20". */
  readonly positionLabel: string;
  /** The `order` of the missed trial it plays again. */
  readonly trialOrder: number;
  /** The room it came from. Light this room. */
  readonly room: VisitRoom;
  /** Such as "Stairs". */
  readonly roomName: string;
  /** Such as "4 kHz". */
  readonly pitchLabel: string;
  /** The side it came from. Draw the ripple on this side. */
  readonly ear: Ear;
  /** The level it was missed at: the level its trial was played at. */
  readonly missedLevelDb: number;
  /** The missed level plus the replay's raise (20 dB). */
  readonly raisedLevelDb: number;
  /** The loudest level the house may play this sound at now: its room's top with the calibration in use. */
  readonly replayCapDb: number;
  /** The level asked of the output stage: the raised level, or the cap when that is lower. */
  readonly askedLevelDb: number;
  /** The level the output stage played. Equal to the asked level unless a limit of the output stage acted. */
  readonly playedLevelDb: number;
  /** The limit of the output stage that lowered it, or null. */
  readonly clampLimit: ClampLimit | null;
  /** True when the cap held it below its raised level, or the output stage lowered it. */
  readonly capChangedLevel: boolean;
  /** The ripple's label: the side, the pitch, the level it was missed at, and whether the cap changed it. */
  readonly rippleLabel: string;
}

/** The counts of one side. */
export interface ReplaySideCounts {
  /** Sound trials the house played on this side. */
  readonly madeCount: number;
  /** Of them, caught on this side. */
  readonly caughtCount: number;
  /** Of them, answered with the other side. */
  readonly wrongSideCount: number;
  /** Of them, not answered. These are the sounds the replay plays again. */
  readonly missedCount: number;
}

/** The running count of both sides. */
export interface ReplayCounts {
  /**
   * The scored sound trials of finished room runs are counted up to and including this order, or
   * all of them when null.
   */
  readonly throughTrialOrder: number | null;
  readonly left: ReplaySideCounts;
  readonly right: ReplaySideCounts;
  /** Such as "On your left I made nine sounds. You caught four." */
  readonly leftLine: string;
  /** Such as "On your right I made seven sounds. You caught three." */
  readonly rightLine: string;
}

/** What every phase of the replay gives. */
export interface ReplayViewBase<Phase extends ReplayPhase> {
  readonly phase: Phase;
  /** The heading of the stage. */
  readonly heading: string;
  /** The sounds of the visit that were not caught, in all. */
  readonly missedSoundCount: number;
  /** The sounds the replay plays: all of them, or an evenly spread selection. */
  readonly replaySoundCount: number;
  /**
   * When the replay plays a selection, such as "You did not catch fifty-six sounds. I will play
   * twenty of them, spread over the whole visit."; otherwise null.
   */
  readonly selectionLine: string | null;
  /** The label of the visible stop control. Show the control in every phase of this stage. */
  readonly stopLabel: string;
  /** Whether `startReplay` would start the sounds now. */
  readonly canStart: boolean;
  /** Whether `proceed` would skip the replay now. */
  readonly canSkip: boolean;
  /** The label of the control that calls `proceed` in this phase: skip, skip the rest, or see the picture. */
  readonly proceedLabel: string;
}

/** Nothing was missed. */
export interface ReplayNothingMissed extends ReplayViewBase<"nothingMissed"> {
  /** The one line: there is nothing to play again. */
  readonly line: string;
  /** The counts of the whole visit. */
  readonly counts: ReplayCounts;
}

/** Before the first sound. */
export interface ReplayAnnouncing extends ReplayViewBase<"announcing"> {
  /** What is about to happen, in order. Show all of them before the start control. */
  readonly announcementLines: readonly string[];
  /** The label of the control that calls `startReplay`. */
  readonly startLabel: string;
}

/** The sounds are playing, or the replay is paused. */
export interface ReplayPlaying extends ReplayViewBase<"playing"> {
  /** The sound playing now, or the last one that started; null before the first starts. */
  readonly current: ReplaySound | null;
  /** The running count through the current sound, or null before the first starts. */
  readonly counts: ReplayCounts | null;
  /** While the snapshot's pause holds, why the sounds paused and what happens next; otherwise null. */
  readonly pauseLine: string | null;
  /** The label of the control that calls `resume`. */
  readonly resumeLabel: string;
}

/** No more sound plays. */
export interface ReplayFinished extends ReplayViewBase<"finished"> {
  readonly ending: ReplayEnding;
  /** How the replay ended. */
  readonly endLine: string;
  /** The counts of the whole visit. */
  readonly counts: ReplayCounts;
  /** The last sound that started, or null when none did. */
  readonly last: ReplaySound | null;
}

/** The replay as the stage shows it now. */
export type MissedSoundReplay =
  | ReplayNothingMissed
  | ReplayAnnouncing
  | ReplayPlaying
  | ReplayFinished;
```

The block imports nothing new: `ClampLimit`, `Ear`, `PauseReason` and `VisitRoom` are already in the file. It contains no statement that runs.

### What each phase accepts

Every action not listed is ignored in this stage, as today. `pause()` is ignored in every phase (D15). While a Pause holds, only `resume` and `stop` act (visit-flow R12.5).

| Phase | Entered | `startReplay` | `proceed` | `stop` | Shell stop `hidden`, `interrupted` | Shell stop `deviceChanged` | Shell stop `pageLeft` | `canStart` | `canSkip` | `canProceed` |
|---|---|---|---|---|---|---|---|---|---|---|
| `nothingMissed` | The last room finished and the plan has no sound | Ignored | `result` | `stopAll`; `result` | Nothing | Nothing | `result` | false | false | true |
| `announcing` | The last room finished and the plan has a sound | Sound starts (gesture); `playing`; the first sound one Replay_Gap later | Skip: `result` | `stopAll`; `result` | Nothing: nothing plays | `finished`, `deviceChanged` | `result` | true | true | true |
| `playing`, no Pause | `startReplay` | Ignored | Skip: `stopAll`; `result` | `stopAll`; `result` | Pause with that reason; timers cancelled; a sound under way is cut | `finished`, `deviceChanged` | `result` | false | true | true |
| `playing`, Pause holds | A stop report | Ignored | Ignored | `stopAll`; `result` | Stays paused | Pause ends; `finished`, `deviceChanged` | Pause ends; `result` | false | false | false |
| `finished` | The last sound ended; a device change; three refusals in a row | Ignored | `result` | `stopAll`; `result` | Nothing | Nothing | `result` | false | false | true |

`resume()` while a Pause holds calls `withSound`, which calls `activate` within the call. Once the shell runs, the Pause ends and the cut sound, or the next one, is asked for one Replay_Gap later.

## Config

### `src/config/missed-sound-replay-config.ts`

```ts
/**
 * The numbers the missed-sound replay adds (missed-sound-replay design.md, "Config"). Every field
 * name ends in its unit. The most refusals in a row of one sound are not here: the replay reads
 * `visitFlowConfig.refusedPlaysInARowMaxCount` (D16).
 */
export interface MissedSoundReplayConfig {
  /** Brief 07: "Each sound is played 20 dB above the level at which it was missed, clamped to the cap." */
  readonly replayRaiseDb: number;
  /**
   * PROPOSED, NOT APPROVED (missed-sound-replay design.md, D7 and Q1). The most sounds one replay
   * plays. With more missed sounds than this, the replay plays an evenly spread selection of this
   * many and says how many there were in all. A whole number of at least 2.
   */
  readonly replaySoundsMaxCount: number;
  /**
   * PROPOSED, NOT APPROVED (D9, Q2). The wait from the end of one replayed sound to the request
   * for the next, on the timer's clock. The sound then starts after the output stage's scheduling
   * lead. Also the wait from the start press, and from the end of a pause, to the next request.
   */
  readonly replayGapMs: number;
}

export const missedSoundReplayConfig: MissedSoundReplayConfig = deepFreeze({
  // Brief 07
  replayRaiseDb: 20,
  // D7, Q1: PROPOSED, NOT APPROVED. Awaits the owner's choice.
  replaySoundsMaxCount: 20,
  // D9, Q2: PROPOSED, NOT APPROVED. Awaits the owner's choice.
  replayGapMs: 400,
});
```

The file has its own `deepFreeze`, as `visit-flow-config.ts` does. The test checks the three values, that every field name ends in `Db`, `Count` or `Ms`, deep freezing, `replayRaiseDb > 0`, `replaySoundsMaxCount` a whole number of at least 2 (the selection keeps the first and the last missed sound, D7), and `replayGapMs` a whole number above 0. A test named for Q1 and Q2 checks the two proposed values with a message saying that they are PROPOSED, NOT APPROVED and await the owner's choice in Q1 and Q2.

| Field | Value | Status |
|---|---|---|
| `replayRaiseDb` | 20 | From brief 07 |
| `replaySoundsMaxCount` | 20 | PROPOSED, NOT APPROVED (Q1) |
| `replayGapMs` | 400 | PROPOSED, NOT APPROVED (Q2) |

Existing values the replay reads and does not change: `hearingMethodConfig.capRelativeToAnchorDb` (15 dB, the anchor cap), `audioOutputConfig.scheduleLeadMs` (50 ms, to put a sound's start on the page clock when the backend gives no timestamp pair), `visitFlowConfig.refusedPlaysInARowMaxCount` (3, D16). The output stage reads its own limits (see "Which limits of the output stage act on a replayed sound").

No other number is added. The bound below which `countWords` writes words (999) is a limit of English number words, not a tunable value, and affects no sound, wait or count (D12). The run counts and the time budget of the property files are test settings, stated in "Run counts and time" and put to the owner in Q7.

## The replay plan

### `planMissedSoundReplay(log, settings)`

```ts
// src/session/missed-sound-replay-plan.ts
export type ReplayPlanSettings =
  Pick<HearingMethodConfig, "capRelativeToAnchorDb"> &
  Pick<MissedSoundReplayConfig, "replayRaiseDb" | "replaySoundsMaxCount">;

/** One missed trial as the replay will play it. Plain data, frozen. */
export interface PlannedReplaySound {
  readonly trialOrder: number;
  readonly room: VisitRoom;
  readonly ear: Ear;
  readonly missedLevelDb: number;
  readonly raisedLevelDb: number;
  readonly replayCapDb: number;
  readonly askedLevelDb: number;
  /** askedLevelDb < raisedLevelDb. */
  readonly heldByCap: boolean;
}

export interface ReplayPlan {
  /** Every Missed_Trial, in order. */
  readonly missedSounds: readonly PlannedReplaySound[];
  /** The sounds the replay plays, in order: all of them, or the Even_Selection. */
  readonly sounds: readonly PlannedReplaySound[];
  /** sounds.length < missedSounds.length. */
  readonly selected: boolean;
}

export function planMissedSoundReplay(
  log: VisitLog,
  settings: ReplayPlanSettings = { ...hearingMethodConfig, ...missedSoundReplayConfig },
): ReplayPlan;
```

```
finished    = the (roomIndex, attempt) pairs of log.roomAttempts whose ending is "finished"
missed      = the entries of log.trials, in their order, with
                status "scored", kind "sound", outcome "missed", and (roomIndex, attempt) in finished
if missed is not empty and log.calibrations is empty → RangeError
calibration = the last entry of log.calibrations
for each trial T of missed:
  room   = log.rooms[T.roomIndex]                                  (none → RangeError)
  raised = T.playedLevelDb + replayRaiseDb
  cap    = min(calibration.roomTopLevelDb[room.roomId], capRelativeToAnchorDb)
  asked  = min(raised, cap)
  planned sound = { trialOrder: T.order, room, ear: T.ear, missedLevelDb: T.playedLevelDb,
                    raisedLevelDb: raised, replayCapDb: cap, askedLevelDb: asked,
                    heldByCap: asked < raised }
positions = evenSelectionIndexes(missed.length, replaySoundsMaxCount)
sounds    = the planned sounds at those positions, in order
deep-freeze and return { missedSounds, sounds, selected: sounds.length < missedSounds.length }
```

The log's trials are already in the order of `order` (visit-flow R10.1), so filtering keeps the order. A trial's `ear` is never null for a sound trial. The function reads nothing but the log and the settings.

**Which trials** (D3). A Missed_Trial is a scored sound trial with the outcome `missed` in a room run that finished. Left out, and why:

- Caught trials: they were heard.
- Wrong-side trials: the visitor answered, on the other side. The brief says "every trial scored as missed", and the log names that outcome `missed`. Whether to replay them is Q3. Until the owner decides, they are left out, and the count line says how often the visitor named the other side, so that the numbers still add up (R8.3).
- Discarded trials: they were cut by a pause or a device change and played again later as the same trial (visit-flow D9). The trial that was scored is in the log; the discarded copy is not a miss.
- Trials of an abandoned room run: the run was stopped by a device change and its room run again with a new calibration (visit-flow D12). Its results are left out of the summary, so its misses are left out of the replay, and the replay and the picture describe the same trials. The counts leave them out too (R8.5).
- No-sound trials: nothing was played.

**The missed level** (D4) is the trial's `playedLevelDb`, what the output stage played, not the level the search asked for. The two differ only when a limit acted, which the visit flow records (audio-output, "What the visit-flow spec must do").

### The cap

The Replay_Cap of a sound is the `roomTopLevelDb` of its room in the last kept calibration of the log, held at most at the anchor cap (D5).

- `roomTopLevelDb` is what `roomTopLevelDb(soundId, calibrationGain)` gave when that calibration was kept: the highest level a playable buffer of that sound can be played at without reaching the ceiling, never above the anchor cap (audio-output R9.2). It is the lower of the two limits of audio-safety rule 2 for that sound with that calibration.
- The last kept calibration of the log is the one the output stage holds in the replay. A calibration is kept only in the `calibration` stage, which comes before a room, and the replay follows the last room in the same step. A device change between them makes the output stage forget the calibration; then the first `play` is refused `notCalibrated` and the replay ends (R12.2).
- The `min` with `capRelativeToAnchorDb` changes nothing for a log the flow made, because every top is already at most the anchor cap. It keeps the rule for a log made under other settings, such as a stored one.
- At or below a room's top the ceiling never acts (audio-output R9.4, checked by its CP6 on the search's grid): a playable buffer's peak is at most its bound, and the output fade only lowers samples. So a sound asked for at its Replay_Cap is played at that level, and `heldByCap` tells, before the sound plays, whether the cap changed it. The ripple label can say so (R4.5).

A visit with a device change has rooms measured under different calibrations. Each missed level is relative to the calibration of its own room run; the replay plays it 20 dB above that figure under the last calibration. Both calibrations match the same hand rubbing, so the figure keeps its meaning (D6).

The Replay_Cap can lie above every level the search played in that room: the search's cap is the room top rounded down to the 5 dB grid (`roomSearchCapDb`), so up to one step lower. A replayed sound can therefore be louder than any trial of its room by less than 5 dB, and up to 20 dB louder than the sound it replays. Rule 4 allows that for the replay alone ("the one place a larger rise is allowed, and it is still limited by the cap"). Whether the owner wants the stricter cap of the search instead is Q5.

### The selection

```ts
// src/session/even-selection-indexes.ts
/** The positions, from 0, of the items to keep out of `count` so that at most `maxCount` are kept, evenly spread. */
export function evenSelectionIndexes(count: number, maxCount: number): readonly number[];
```

```
count ≤ maxCount → [0, 1, …, count − 1]
otherwise        → [floor(k × (count − 1) / (maxCount − 1)) for k = 0 … maxCount − 1]
```

It throws a `RangeError` unless `count` is a whole number of 0 or more and `maxCount` a whole number of at least 2. The products are whole numbers far below 2⁵³, so the division is exact enough that `Math.floor` gives the same position on every machine.

What it gives (D7): exactly `maxCount` positions; strictly increasing, because the step `(count − 1) / (maxCount − 1)` is above 1 when `count > maxCount`; the first missed sound and the last; and gaps between consecutive positions that are `floor(step)` or `ceil(step)`, so they differ by at most one. With 56 missed sounds and 20 to play, the step is 55 / 19 ≈ 2.89 and the positions are 0, 2, 5, 8, 11, 14, 17, 20, 23, 26, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55.

### The counts

```ts
// src/session/replay-counts.ts
export function replayCounts(
  log: VisitLog,
  throughTrialOrder: number | null,
): Readonly<Record<Ear, ReplaySideCounts>>;
```

Counted are the scored sound trials of finished room runs, the same scope as the plan (R8.5), whose `order` is at most `throughTrialOrder`, or all of them for null. For each, on its ear: `madeCount` + 1, and one of `caughtCount`, `wrongSideCount`, `missedCount` + 1 by its outcome. So `madeCount = caughtCount + wrongSideCount + missedCount` on each side, and at null the two `missedCount`s add up to the plan's `missedSounds.length`.

### The render seed

```ts
// src/session/replay-render-seed.ts
/** The seed of the replay's renders, from the log alone (D2). */
export function replayRenderSeed(log: VisitLog): number;
```

```
source = createSeededRandom(log.visitSeed)
draw   = floor(source.next() × 2³²)
draw once                                  the seed of the visit's sound renders (visit-flow D19)
draw once for each entry of log.roomAttempts   that run's engine seed, in order
return the next draw
```

This is the draw the visit flow makes from the visit's own source when it enters the stage: the visit source draws the render seed first and one engine seed per room run as it starts (visit-flow D19), and nothing else draws from it. The flow draws it from the source rather than calling this function, so that a later stage (the swapped repeat) draws the one after it. A unit test, and CP6 for every visit of CP10, check that the two are equal, and that the draws in between equal the logged engine seeds.

## The replay in the visit flow

### The Replay_Controller (`create-missed-sound-replay.ts`)

The Replay_Controller holds one replay: its plan, its phase, its timers, its plays and the sound under way. It has no part in gestures, the snapshot's pause field or the stage, which stay in the flow, so it can be tested on a calibrated output shell and a manual timer without a whole visit (CP4 to CP8).

```ts
export interface MissedSoundReplayOptions {
  readonly output: AudioOutput;
  /** The visit's timer: its callbacks run as steps of the flow and stop when the visit is dropped. */
  readonly timer: Timer;
  readonly log: VisitLog;
  /** The source of every render: createSeededRandom(the seed drawn on entering the stage). */
  readonly random: RandomSource;
  /** Hands an event to the flow, which releases it at the end of the step. */
  readonly emit: (event: ReplaySoundStartedEvent) => void;
  /** A play was refused `notRunning`: the flow acts as on a stop report with this reason. */
  readonly notRunning: (reason: StopReason) => void;
  readonly settings?: MissedSoundReplaySettings;   // the plan's settings, replayGapMs, scheduleLeadMs, refusedPlaysInARowMaxCount
}

export interface MissedSoundReplayController {
  readonly plan: ReplayPlan;
  phase(): ReplayPhase;
  /** The view for the snapshot, given the reason of the pause that holds, or null. */
  view(pauseReason: ReplayPauseReason | null): MissedSoundReplay;
  /** announcing → playing; asks for the first sound one gap later. The flow calls it once sound runs. */
  start(): void;
  /** Cancels every timer. Calls output.stopAll() when a sound may be under way. For skip. */
  skip(): void;
  /** A hidden page or an interruption in `playing`: cancels the timers; a sound under way is cut. Returns whether the replay is now paused. */
  cut(): boolean;
  /** After the pause ends: asks for the cut sound, or the next, one gap later. */
  resume(): void;
  /** Ends the replay with this ending: cancels the timers; `finished`. */
  end(ending: Exclude<ReplayEnding, "allPlayed">): void;
  /** Cancels every timer for good. For stop, a left page and the result. */
  cancel(): void;
}

export function createMissedSoundReplay(options: MissedSoundReplayOptions): MissedSoundReplayController;
```

It keeps: `plan`; `phase`; `nextIndex`, the index in `plan.sounds` of the sound to play next or the one under way; `current`, the `ReplaySound` that started last, or null; `ending`; `refusalsInARow`; `handle`, the one pending timer; and `underWay`, true from a scheduled play to the end of that sound.

```
create:    plan = planMissedSoundReplay(log); phase = plan.sounds empty ? nothingMissed : announcing

start():   phase announcing only → phase = playing; ask after replayGapMs

ask after d:   handle = timer.setTimeout(play, d)

play():
  planned    = plan.sounds[nextIndex]
  askedAtMs  = timer.now()
  outcome    = output.play({ soundId: planned.room.roomId, ear: planned.ear,
                             levelDb: planned.askedLevelDb, purpose: "replay", random })
  refused notRunning     → notRunning(the shell's stop reason, or "interrupted" when it gives none or `control`,
                                      as the room runner does); return
  refused notCalibrated  → end("deviceChanged"); return
  refused anything else  → refusalsInARow += 1
                           refusalsInARow ≥ refusedPlaysInARowMaxCount → end("soundRefused")
                           otherwise ask after replayGapMs           (the same sound again)
  scheduled →
    refusalsInARow = 0; underWay = true
    startAtMs = soundWindowStartMs({ startMs: outcome.startMs, pair: output.timestampPair(),
                                     presentedAtMs: askedAtMs })
    endAtMs   = startAtMs + (outcome.endMs − outcome.startMs)
    handle = timer.setTimeout(started, max(0, startAtMs − timer.now()))
      started():
        current = replaySoundOf(planned, outcome, plan.sounds.length)
        emit({ kind: "replaySoundStarted", sound: current })
        handle = timer.setTimeout(ended, max(0, endAtMs − timer.now()))
      ended():
        underWay = false; nextIndex += 1
        nextIndex = plan.sounds.length → phase = finished; ending = allPlayed
        otherwise                      → ask after replayGapMs

cut():     phase playing only → clear handle; underWay = false (nextIndex stays: the cut sound comes again); true
resume():  phase playing only → ask after replayGapMs
skip():    clear handle; if underWay → output.stopAll()
end(e):    clear handle; underWay = false; phase = finished; ending = e
cancel():  clear handle; underWay = false
```

One timer at a time, so one sound at a time: the next request comes only after the end of the sound before, which also keeps the output stage from refusing it `busy` (audio-output D16). A sound's start and end are put on the page clock as the room runner puts a trial's window start (`soundWindowStartMs`, visit-flow D3), so the ripple appears when the sound starts and the next sound waits for the end of this one plus the gap.

`replaySoundOf(planned, outcome, soundCount)` in `replay-sound.ts` gives the frozen `ReplaySound`: the planned fields; `position`; `positionLabel(position, soundCount)`; `roomNames[room.roomId]`; `pitchLabel(room.frequencyHz)`; `playedLevelDb` and `clampLimit` from the outcome; `capChangedLevel = heldByCap || outcome.clampLimit !== null`; and `rippleLabel(ear, frequencyHz, missedLevelDb, capChangedLevel)`. When the output stage names a clamp anyway, which audio-output R9.4 rules out at or below the room top, the label says the cap changed the level and the view gives the played level, so the label is never wrong about what played.

### What the flow does

The flow keeps its stage machine and adds a `replay` field to the visit. Nothing it does in another stage changes.

**On entering the stage.** `finishRoom` already calls `output.beginRoom()`, assembles the log and enters `missedSoundReplay` (visit-flow R16.1). It now also, in the same step and before entering:

```
renderSeed     = drawSeed(current.source)        // equals replayRenderSeed(log) (R14.2, CP6)
current.replay = createMissedSoundReplay({ output, timer: current.timer, log, random: createSeededRandom(renderSeed),
                                           emit, notRunning: (reason) => replayStopped(reason) })
```

Nothing plays. The snapshot is published with the view of `nothingMissed` or `announcing`.

**`startReplay()`.** In the stage, with no Pause and the phase `announcing`: `withSound(() => { if the stage, the visit and the phase are unchanged and no Pause holds: current.replay.start() })`. `withSound` calls `activate` within the call when the shell does not run, as every other gesture of the flow does (visit-flow R2.5), and sets `activationRefused` when the browser saw no press. Elsewhere: nothing.

**Between sounds.** The controller's timer callbacks run on the visit's timer, so each runs as one step of the flow and the snapshot listeners hear of the new current sound after the `replaySoundStarted` event of the same step (visit-flow R11.5). During the gap the view keeps the last sound as its current sound and the counts through it.

**`proceed()` (skip, or go on).** `canProceed` is true whenever no Pause holds, as today. The existing branch for this stage gains one line before it: `current.replay.skip()`. Then, as today, `summaryOf(current)` and `result`.

**`stop()`.** As today, `output.stopAll()`, then for this stage: `current.replay.cancel()`, `pause = null`, `summaryOf(current)` and `result` (visit-flow R14.2).

**Stop reports.** `onOutputStopped(reason)` gains a first branch for this stage, before the check of `pausableStages`, which does not list this stage and stays as it is:

```
replayStopped(reason):
  control                → nothing: the flow caused it (stop, skip)
  pageLeft               → current.replay.cancel(); pause = null; summaryOf(current); result
  deviceChanged          → phase announcing or playing: current.replay.end("deviceChanged"); pause = null
  hidden, interrupted    → pause === null and current.replay.cut(): pause = { reason }
```

The flow's `beginPause` and `endPause` are not used in this stage, because they write the pause to the visit log's recorder, and the log was assembled when the rooms ended (visit-flow D28, D18 here). The snapshot's `pause` field is set directly, so the owner's pause handling and `canProceed` work as in every other stage.

**`resume()`.** As today, `withSound(endPause)`. `endPause` gains a first branch for this stage: `pause = null; current.replay.resume()`, and returns before it reaches the recorder.

**A play refused `notRunning`** reaches the flow through the controller's `notRunning` callback and is handled as a stop report with that reason (visit-flow's table "Pauses", last row, does the same in a room).

**`unsupported`.** An unsupported report can come only from `activate`, here inside `startReplay` or `resume`. The flow handles it as it does in every stage (visit-flow R15.1): it shows the `unsupported` stage and drops the visit. This spec does not change that ("Error handling").

**The snapshot.** `buildSnapshot` for this stage gives `{ ...base("missedSoundReplay"), visitLog: logOf(current), replay: current.replay.view(pause?.reason ?? null) }`. The view is a pure function of the controller's state, so the snapshot changes only when the phase, the current sound or the pause changes, and the flow's comparison of plain data publishes it only then (visit-flow R11.4).

**The end.** After the last sound ends, the controller shows `finished` with `allPlayed`. The stage waits for `proceed`, which shows `result` (D17). The result is built from the same log object with `summarizeVisit`, as today, so it is the same whatever happened in the replay (R13.4).

**Leaving the visit.** `dropVisit` clears the visit's timer handles, which include the controller's, so a dropped visit plays nothing more (visit-flow D35).

### `missedSoundReplayView(input, settings)`

```ts
// src/session/missed-sound-replay-view.ts
export interface ReplayViewInput {
  readonly log: VisitLog;
  readonly plan: ReplayPlan;
  readonly phase: ReplayPhase;
  readonly current: ReplaySound | null;
  readonly ending: ReplayEnding | null;
  readonly pauseReason: ReplayPauseReason | null;
}
export function missedSoundReplayView(
  input: ReplayViewInput,
  settings: Pick<MissedSoundReplayConfig, "replayRaiseDb"> = missedSoundReplayConfig,
): MissedSoundReplay;
```

```
missed = plan.missedSounds.length; played = plan.sounds.length
base   = { heading: replayCopy.heading, missedSoundCount: missed, replaySoundCount: played,
           selectionLine: plan.selected ? selectionLine(missed, played) : null,
           stopLabel: replayCopy.stopButton }
counts(order) = the two sides of replayCounts(log, order), with sideCountLine of each
nothingMissed → { ...base, phase, line: replayCopy.nothingMissedLine, counts: counts(null),
                  canStart: false, canSkip: false, proceedLabel: replayCopy.goOnButton }
announcing    → { ...base, phase, announcementLines: announcementLines(replayRaiseDb),
                  startLabel: replayCopy.startButton,
                  canStart: true, canSkip: true, proceedLabel: replayCopy.skipButton }
playing       → { ...base, phase, current, counts: current ? counts(current.trialOrder) : null,
                  pauseLine: pauseReason ? replayCopy.pauseLines[pauseReason] : null,
                  resumeLabel: replayCopy.resumeButton,
                  canStart: false, canSkip: pauseReason === null, proceedLabel: replayCopy.skipRestButton }
finished      → { ...base, phase, ending, endLine: endLine(ending, played, missed), counts: counts(null),
                  last: current, canStart: false, canSkip: false, proceedLabel: replayCopy.goOnButton }
deep-freeze and return
```

## Which limits of the output stage act on a replayed sound

From `create-audio-output.ts`, `prepare-playback.ts` and `render-playable-buffer.ts`, and the audio-output spec. Nothing in the output stage changes.

| Limit | Where | On a replayed sound | Why |
|---|---|---|---|
| One way to the speakers, rendered from a Sound_Id | `play` renders the sound itself (audio-output D4) | Acts | Rule 1. The replay passes the room's Sound_Id and never samples |
| Running and calibrated | `play`: `notRunning`, `notCalibrated` | Acts | A stopped shell plays nothing; a device change forgets the calibration (R12) |
| Peak bound, up to 8 renders | `renderPlayableBuffer` | Acts | Keeps a render's peak under its bound, which is what makes the room top safe |
| Sample rate at least 22050 Hz | step 1 | Acts | |
| Empty, longer than 1500 ms, not finite | step 2 | Acts | Rule 6. Room sounds last 800 to 1400 ms |
| Level and gains finite | step 3 | Acts | |
| A ghost sound in one ear only | step 4 | Acts | The replay asks for one ear |
| Output fade of 25 ms at both ends, and the fade check of at least 20 ms | steps 5 and 11 | Acts | Rule 3: "Every sound fades in and fades out over at least 20 ms" |
| Anchor cap, 15 dB | step 6 | Acts, never lowers | The Asked_Level is at most the Replay_Cap, which is at most the anchor cap |
| Rise limit, one upward step (5 dB) per ear per Room_Span | step 7 | Does not act | The shell passes `previousAppliedGain: null` for the Purpose `replay` (audio-output R11.5, D15), because rule 4 makes the replay "the one place a larger rise is allowed" |
| Ceiling, 0.25 of full scale, the whole sound turned down, then checked on every sample | steps 8 and 11 | Acts; never lowers a replayed sound | At or below the room top the ceiling never acts (audio-output R9.4). The output stage's CP6 checks that on the search's 5 dB grid up to the search's cap; a replay may ask for the exact top, so this spec's CP7 checks it there. If it ever acted, the outcome would name `ceiling` and the label would say the cap changed the level |
| Exact zero on the other channel | step 10 | Acts | Rule 5 |
| One sound at a time (`busy`) | `schedule` | Acts | The controller asks for the next sound only after the end of the last plus the gap (D9) |
| Previous gain recorded per ear | `schedule` | Acts | A replay's gain becomes the previous gain of its ear (audio-output R11.1). The flow called `beginRoom` on entering the stage, and the swapped repeat must call it before its room (R18) |
| Clamp_Log | `schedule` | Acts | A clamped replay is logged with the Purpose `replay` (audio-output D22) |
| Stop fade of 20 ms to exact zero; suspend or close after it | `stop` | Acts | Rule 7. `stopAll` from stop and skip, and every page event |
| Calibration rise of 5 dB, the Keep_Minimum, the control's top | calibration only | Does not apply | The replay plays no calibration repeat |
| The search's cap, `roomSearchCapDb` on the 5 dB grid | the engine's settings, not the output stage | Not an output limit | The Replay_Cap is the room top, up to one step above it (Q5) |

This spec lifts no limit. The one limit that does not act is the one rule 4 names, and the output stage already lifts it for the Purpose `replay` alone.

## The copy

Every string below is the full wording. The owner can review it here. The copy files import only `src/config` and other files of `src/copy` (`roomNames`, `pitchLabel` and `relativeLevelLabel` from `room-copy.ts`). Every function throws a `RangeError` for a value that does not fit, as the existing copy functions do. Levels are labelled by `relativeLevelLabel`, so always relative to the visitor's calibration. The one other number of decibels is the raise, which is a difference and is said as one ("20 dB louder than when it went by").

### `src/copy/replay-copy.ts`

```ts
/** Every fixed string of the missed-sound replay (missed-sound-replay design.md, "The copy"). */
export const replayCopy = Object.freeze({
  heading: "The sounds you did not catch",
  startButton: "Play them",
  skipButton: "Skip them",
  skipRestButton: "Skip the rest",
  goOnButton: "See the picture",
  resumeButton: "Go on",
  stopButton: "Stop the sounds",
  nothingMissedLine: "You answered every sound I made, so I have nothing to play again.",
  /** Why the sounds paused. The keys are the replay's pause reasons. */
  pauseLines: Object.freeze({
    hidden:
      "The sounds paused while this page was out of sight. When you go on, they carry on where they stopped.",
    interrupted:
      "Something else on this device took over the sound, so the sounds paused. When you go on, they carry on where they stopped.",
  }),
});
```

`nothingMissedLine` says "answered", not "caught", because a visit can have no missed sound and still some answers on the wrong side (Q3). It is true under every option of Q3.

### `src/copy/replay-lines.ts`

```ts
export type ReplaySideName = "left" | "right";
export type ReplayEndingName = "allPlayed" | "deviceChanged" | "soundRefused";
export type ReplayPauseName = "hidden" | "interrupted";

/** A whole number in English words, from "zero" to "nine hundred and ninety-nine"; from 1000 up, in digits. */
export function countWords(count: number): string;
export function announcementLines(raiseDb: number): readonly string[];
export function selectionLine(missedCount: number, replayCount: number): string;
export function positionLabel(position: number, count: number): string;
export function rippleLabel(
  side: ReplaySideName, frequencyHz: number, missedLevelDb: number, capChangedLevel: boolean,
): string;
export function sideCountLine(
  side: ReplaySideName, madeCount: number, caughtCount: number, wrongSideCount: number,
): string;
export function endLine(ending: ReplayEndingName, replayCount: number, missedCount: number): string;
```

`replay-types-match.test.ts` checks that `ReplaySideName` equals `Ear`, `ReplayEndingName` equals `ReplayEnding`, `ReplayPauseName` equals `ReplayPauseReason`, and that the keys of `replayCopy.pauseLines` are exactly `ReplayPauseName`.

| Function and input | Output |
|---|---|
| `countWords(0)`, `(7)`, `(13)`, `(20)`, `(56)`, `(100)`, `(105)`, `(999)`, `(1000)` | `zero`, `seven`, `thirteen`, `twenty`, `fifty-six`, `one hundred`, `one hundred and five`, `nine hundred and ninety-nine`, `1000` |
| `countWords(n)`, n negative, not whole or not finite | `RangeError` |
| `announcementLines(20)` | 1. `Before you leave, I will play again the sounds you did not catch.` 2. `Each one comes from the room and the side where I made it, in the order I made them.` 3. `Each one is 20 dB louder than when it went by, but never louder than the house may play.` 4. `Leave the volume as it is. You can stop the sounds at any moment.` |
| `announcementLines(r)` | Line 3 with `r` rounded to a whole number; `RangeError` unless `r` is finite and above 0 |
| `selectionLine(56, 20)` | `You did not catch fifty-six sounds. I will play twenty of them, spread over the whole visit.` (`RangeError` unless 1 ≤ replay count < missed count) |
| `positionLabel(3, 20)` | `Sound 3 of 20` (`RangeError` unless 1 ≤ position ≤ count, both whole) |
| `rippleLabel("left", 4000, -35, false)` | `On your left, 4 kHz. When you did not catch it, it was 35 dB quieter than your calibration. Now it is louder.` |
| `rippleLabel("right", 1000, 5, true)` | `On your right, 1 kHz. When you did not catch it, it was 5 dB louder than your calibration. Now it is as loud as the house may play.` |
| `rippleLabel(s, f, 0.3, false)` | `On your {s}, {pitchLabel(f)}. When you did not catch it, it was as loud as your calibration. Now it is louder.` |
| `sideCountLine(s, 0, 0, 0)` | `I have not made a sound on your {s} yet.` |
| `sideCountLine("left", 1, 1, 0)` | `On your left I made one sound. You caught it.` |
| `sideCountLine("left", 1, 0, 0)` | `On your left I made one sound. You did not catch it.` |
| `sideCountLine("left", 1, 0, 1)` | `On your left I made one sound. You named the other side.` |
| `sideCountLine("right", 7, 3, 0)` | `On your right I made seven sounds. You caught three.` |
| `sideCountLine("right", 7, 7, 0)` | `On your right I made seven sounds. You caught every one.` |
| `sideCountLine("right", 7, 0, 0)` | `On your right I made seven sounds. You caught none of them.` |
| `sideCountLine("right", 7, 3, 1)` | `On your right I made seven sounds. You caught three. Once you named the other side.` |
| `sideCountLine("left", 9, 4, 2)` | `On your left I made nine sounds. You caught four. Two times you named the other side.` |
| `sideCountLine(s, m, c, w)`, c + w > m, or a count not a whole number of 0 or more | `RangeError` |
| `endLine("allPlayed", 1, 1)` | `That was the one sound you did not catch.` |
| `endLine("allPlayed", n, n)`, n ≥ 2 | `That was every sound you did not catch.` |
| `endLine("allPlayed", 20, 56)` | `Those were twenty of the fifty-six sounds you did not catch.` |
| `endLine("deviceChanged", …)` | `Your audio device changed, so I cannot play the sounds again. Your picture is ready.` |
| `endLine("soundRefused", …)` | `The house could not play these sounds on this device, so it stopped them. Your picture is ready.` |

The count line has the brief's form ("On your right I made seven sounds. You caught three.") and adds the wrong-side sentence only when the visitor named the other side, so that made = caught + wrong side + missed can be read from the line (R8.4). "One" and "two" at the start of the wrong-side sentence are written "Once" and "Two times"; from three up the number word is capitalised ("Three times you named the other side."). Counts and the selection are in words, positions in digits like "Room 2 of 3" (D12).

The ripple label names the side first, as `caughtLine` does for a caught sound ("You caught it on your left. 4 kHz, ..."), so that a visitor reading the screen without sound knows where it came from. It gives the missed level, the brief's "original level", and says "Now it is louder" or "Now it is as loud as the house may play" (R4.5). It gives no number for the replayed level and no difference, so that the label carries only one level and that level is relative to the calibration (D25).

### The copy tests

`src/copy/replay-copy.test.ts`, in the form of `house-copy.test.ts`: every string reachable from `replayCopy` is non-empty, trimmed and free of banned terms; every function gives the outputs of the table; for representative inputs (counts 0 to 25, 56, 99, 100, 101, 999 and 1000; every side, ending and pause reason; missed levels from −70 to 15 in 5 dB steps and −0.4, 0, 0.4; both values of `capChangedLevel`; every pitch of `hearingMethodConfig.roomFrequenciesHz`) every output is free of banned terms, and every number of decibels is followed by " quieter than your calibration", " louder than your calibration" or " louder than when it went by"; and the inputs of the table's `RangeError` rows throw. `npm run check:copy` checks the exported constants.

## Measurements

How many sounds a visit misses decides how often the selection is used and how long the replay takes, which is what Q1 and Q2 trade. These figures were measured once while this design was written, with a script run from outside the repository and not kept. Task-level work adds `tests/listeners/replay-length-measurement.ts` and `tests/listeners/print-replay-length-measurement.ts`, which give them again with the same seeds, and writes the figures they print below this paragraph if they differ.

Method: `playPopulationRooms` with `specSearchUnderTest` and `hearingMethodConfig` (the shipped engine), 1000 visits per row, with the Attentive and the Plausible ranges of the threshold-search spec (D17 there), seed 20261117 for quick visits and 20261118 for full ones. Each room of a visit is played by its own listener drawn from the range, because `playPopulationRooms` draws one listener per room; a real visit has one listener in every room, so the spread between visits is somewhat narrower than here. A missed sound is a sound trial answered with nothing; a wrong side is a sound trial answered with the other side, which for these listeners includes guesses on sounds they did not hear. The length of a replay is the sum, over the sounds it plays, of the room sound's duration from `ghostSoundConfig` (800 to 1400 ms) and the 50 ms scheduling lead, plus one gap between each two sounds. Renders, pauses, the announcement and the time to read it are not included.

Missed sounds and wrong sides per visit:

| | Attentive, quick | Attentive, full | Plausible, quick | Plausible, full |
|---|---|---|---|---|
| Missed sounds, median (10th to 90th percentile) | 33 (25 to 42) | 56 (45 to 67) | 37 (27 to 47) | 60 (47 to 74) |
| Missed sounds, most | 60 | 82 | 67 | 90 |
| Wrong sides, median (90th percentile) | 0 (1) | 0 (2) | 7 (14) | 13 (20) |

The search steps 10 dB down after a catch and 5 dB up after a miss, so it spends most of its trials just below what the visitor hears. In a first run of the same measurement with seed 20261116 (3000 rooms taken three or five at a time), attentive quick visits had a median of 57 sound trials and 33 missed sounds. A replay that stays short is therefore a selection in almost every visit, not only in long ones.

Share of visits that get a selection, and the replay's length (median, 90th percentile, longest), with the proposed gap of 400 ms:

| Most sounds played | Attentive, quick | Attentive, full | Plausible, quick | Plausible, full |
|---|---|---|---|---|
| **20, proposed** | 98 %; 30.2, 31.0, 31.8 s | 100 %; 30.5, 31.4, 32.4 s | 98 %; 30.2, 31.0, 32.2 s | 100 %; 30.5, 31.4, 33.1 s |
| 30 | 65 %; 44.7, 46.3, 47.5 s | 100 %; 46.0, 47.3, 48.9 s | 77 %; 44.7, 46.7, 48.3 s | 100 %; 46.0, 47.3, 49.3 s |
| 45 | 4.5 %; 50.0, 63.6, 71.5 s | 90 %; 69.2, 71.2, 73.3 s | 16 %; 55.5, 67.8, 72.3 s | 93 %; 69.2, 71.3, 75.0 s |
| 60 | 0 %; 50.0, 63.6, 90.2 s | 30 %; 86.4, 93.5, 97.6 s | 0.3 %; 55.5, 72.3, 91.8 s | 47 %; 90.0, 94.2, 98.0 s |
| No limit | 0 %; 50.0, 63.6, 90.2 s | 0 %; 86.4, 103.0, 127.5 s | 0 %; 55.5, 72.3, 101.3 s | 0 %; 92.0, 115.1, 138.6 s |

The gap's effect, as the median length over the four rows:

| Gap | Most 20 | Most 30 | No limit, quick | No limit, full |
|---|---|---|---|---|
| 300 ms | 28.3 to 28.6 s | 41.8 to 43.1 s | 46.9 to 51.9 s | 80.9 to 86.0 s |
| **400 ms, proposed** | 30.2 to 30.5 s | 44.7 to 46.0 s | 50.0 to 55.5 s | 86.4 to 92.0 s |
| 600 ms | 34.0 to 34.3 s | 50.5 to 51.8 s | 56.5 to 62.6 s | 97.3 to 103.8 s |

The rooms alone already take a median of 5.1 and 8.4 minutes for attentive listeners (visit-flow, "How long the rooms take"), above the 3 and 7 minutes the front door promises (visit-flow Q3). The proposed replay adds about half a minute to that.

A replayed sound every 1.6 s or so means ripples overlap: one lasts 2880 ms (`rippleConfig`). That is the owner's drawing to handle ("What the owner builds").

## Error handling

| Situation | Behaviour |
|---|---|
| A log with no missed trial in a finished room run | `nothingMissed`: one line, nothing plays (R9) |
| A log with a missed trial and no calibration, or a trial whose room the log does not have | `planMissedSoundReplay` throws a `RangeError`. The flow never makes such a log: a room runs only after a kept calibration, and every trial is of one of its rooms |
| `startReplay` while the browser sees no press | `activationRefused` true; the phase stays `announcing`; the next press tries again (R6.4) |
| A hidden page or an interruption while a sound plays | Pause; the stop fade of 20 ms silences it; the sound is played again from its start, faded in, after `resume` (R11.2, R11.3) |
| A hidden page or an interruption in a gap | Pause; after `resume` the next sound comes one gap later |
| A hidden page in `announcing`, `nothingMissed` or `finished` | No pause; nothing plays; `startReplay` starts sound again with its press |
| A device change in `announcing` or `playing` | `finished` with `deviceChanged`; the result follows on `proceed`. The calibration is gone, and the replay does not calibrate again for a few louder sounds (D15) |
| A device change in `nothingMissed` or `finished` | Nothing here. The calibration is gone; a later stage that plays (the swapped repeat) must calibrate again (R18) |
| A left page | `result`, with the replay cancelled. The shell has stopped and will close its context |
| `play` refused `notRunning` | As a stop report with the shell's reason, or `interrupted` when the shell gives none or `control` (R12.1) |
| `play` refused `notCalibrated` | `finished` with `deviceChanged` (R12.2) |
| `play` refused `busy`, a render refusal or a preparation refusal | The same sound again one gap later; three in a row end the replay with `soundRefused` (R12.3, D16) |
| The output stage lowers a replayed sound (audio-output R9.4 rules it out; handled all the same) | The played level and the clamp are in the view, and the label says the cap changed the level |
| An unsupported report from `activate` inside `startReplay` or `resume` | As in every stage (visit-flow R15.1): the `unsupported` stage, and the visit is dropped. Not changed by this spec; listed under "Found in the existing code" at the end of "Questions for the project owner" |
| A copy function given a value that does not fit | `RangeError`, as the existing copy functions do. The view never gives one for a plan and counts made from a log the flow produced |
| A bug in the controller's own code | Not caught, so that the properties find it |

## Correctness properties

Every property is universal: fast-check with a new random seed on every run (R17.3). None is statistical. The brief's two properties are CP1 and CP2.

The **arbitraries** (`tests/properties/missed-sound-replay-arbitraries.ts`) draw:

- **A visit log**: a visit type and its rooms from `visitRooms`; one to three calibrations, each with a setting on the control's grid from the Keep_Minimum (−40 dB) to the top (−4 dB) and the `roomTopLevelDb` of `rangeReport` at that setting, and in one log in five, tops drawn freely from −10 to 20 dB, so that the `min` with the anchor cap is exercised; for each room zero to two abandoned room runs and then one finished run, and in one log in ten a room with no finished run; for each run 0 to 60 trials: no-sound trials with a share from 0 to 0.3, sound trials on a drawn ear at a level on the 5 dB grid from `floorDb` to the run's `searchCapDb`, played at the level asked or, one in twenty, lower with a clamp limit, scored `caught`, `wrongSide` or `missed` with a drawn share of misses from 0 to 1 (so that logs with no miss and with only misses both occur), or, one in twenty, discarded and followed by its scored copy; `order` from 1 with no gap. The log has the shape of the contract's `VisitLog` and is frozen like the recorder's.
- **A most count**: the shipped `replaySoundsMaxCount`, or a whole number from 2 to 80 given through the settings parameter, so that the properties hold whatever the owner chooses in Q1.
- **A replay script**: whether and when `startReplay` is called (0 to 30 s after the stage is entered, possibly more than once); up to six events at times from 0 to 120 s: `proceed`, `stop`, `pause`, `resume`, a shell report `hidden`, `interrupted`, `deviceChanged` or `pageLeft`, and a `resume` or `startReplay` while the fake backend refuses activation; each pause report followed by `resume` after 0 to 10 s or not at all.
- **A refusal script** (CP8): for each `play` of a scripted output, scheduled, or refused with any `PlayRefusal`.

The **replay harness** (`tests/properties/missed-sound-replay-harness.ts`) builds a Replay_Controller on an output shell from `createShellUnderTest` at `harnessSampleRateHz`, calibrated with `calibrate` to the setting of the log's last calibration, with the worst-case renderers through `vi.mock`, as the output stage's and the visit flow's properties do (audio-output D43). The log's last calibration takes its tops from that shell's range report, so the cap of the plan is the cap of the shell. The harness plays the flow's small part as `create-visit-flow.ts` does it (the pause field, activation on a press, the result), and records every view after every step, every event, every backend call and every `stopAll`. For refusals it can put a scripted output in place of the shell. CP10 runs the real flow, so that the flow's part is checked as well.

`tests/properties/missed-sound-replay-text.ts` collects every string of a view and an event, each with its place, and holds the allowed forms of CP9. Generated text is every field the contract describes as something to show or say: `heading`, `selectionLine`, `stopLabel`, `proceedLabel`, `line`, `announcementLines`, `startLabel`, `pauseLine`, `resumeLabel`, `endLine`, the counts' `leftLine` and `rightLine`, and each sound's `positionLabel`, `roomName`, `pitchLabel` and `rippleLabel`.

**CP1. The replay holds exactly the missed sounds, in order, on their ears, within the cap** (Universal, 1000 runs; R3, R4.1 to R4.3, R5.1, R5.2; brief property 1). Generated: a drawn visit log and a most count. An oracle in the test, written from R3 and R4 and not from the plan's code, lists the missed trials of finished runs. Then:
- `missedSounds` is that list, one for one and in order, each with the trial's order, its room from `log.rooms`, its ear and its played level as `missedLevelDb`;
- `sounds` is that list when it has at most the most count entries, and otherwise the entries at `floor(k × (n − 1) / (m − 1))`, computed by the oracle in integers;
- every sound has `raisedLevelDb = missedLevelDb + replayRaiseDb`, `replayCapDb` equal to the room's top in the last calibration held at the anchor cap, `askedLevelDb = min(raised, cap)`, so `askedLevelDb ≤ replayCapDb ≤ capRelativeToAnchorDb`, and `heldByCap` exactly when `askedLevelDb < raisedLevelDb`;
- no caught, wrong-side, discarded or no-sound trial and no trial of an abandoned run is in it.
CP7 checks the same of what was played.

**CP2. The counts in the text equal the counts in the log** (Universal, 1000 runs; R8; brief property 2). Generated: a drawn visit log and a through-order drawn from null, every order of the log, 0 and an order past the last. For both sides:
- `replayCounts` equals an oracle count over the log of the scored sound trials of finished runs up to that order, by outcome;
- `madeCount = caughtCount + wrongSideCount + missedCount`;
- the numbers in the side's line, read back by a parser in the test that knows the English number words independently of `countWords`, are the made count, the caught count (with "every one" read as the made count, "none of them" or "did not catch it" as 0, "caught it" as 1, and "You named the other side." as no catch and one wrong side) and the wrong-side count ("Once" as 1, absent as 0), and nothing else;
- at null, the two missed counts add up to the plan's `missedSounds.length`, and every view of `finished` and `nothingMissed` gives these counts;
- in every view of `playing` with a current sound, the counts are those through that sound's trial order.

**CP3. The selection is evenly spread and the same every time** (Universal, 1000 runs; R5). Generated: a count from 0 to 2000 and a most count from 2 to 200. `evenSelectionIndexes` gives every position from 0 when the count is at most the most count; otherwise exactly the most count of positions, strictly increasing, the first 0 and the last count − 1, with every gap between two consecutive positions equal to `floor` or `ceil` of `(count − 1) / (most − 1)`; and two calls with the same numbers give equal arrays. Counts below 0, not whole, and most counts below 2 throw a `RangeError`.

**CP4. A visit with nothing missed skips the stage** (Universal, 300 runs; R9). Generated: a drawn visit log with its share of misses set to 0, and a replay script. The controller's first view is `nothingMissed` with `nothingMissedLine` and the counts of the whole log; no view in the run has another phase; no `play` and no backend `schedule` call is made; no event is handed out; `startReplay` changes nothing; `proceed` leads to `result`. One example in `missed-sound-replay-simulated-visits.test.ts` plays a whole visit with a listener who catches everything (a step listener whose threshold lies below the floor) and checks the same through the flow.

**CP5. A skipped or stopped replay plays nothing more** (Universal, 300 runs; R10, R11.1, R11.6). Generated: a drawn visit log with at least one miss, and a replay script that ends with `proceed`, `stop` or `pageLeft` at a drawn time after `startReplay`, possibly in the middle of a sound, in a gap or during a pause. Right after it: `stopAll` was called when a sound was under way (for skip and stop; the shell's own stop has already faded it for `pageLeft`); the stage is `result`; then advancing the clocks by 10 minutes makes no `play`, no backend `schedule` call and no event, and the controller has no pending timer.

**CP6. A replay follows from its log alone** (Universal, 200 runs; R14, R13.5). Generated: a drawn visit log and a replay script. Two harnesses made from equal logs, with equal shells and timers and the same script, give equal views after every step, equal events and equal backend `schedule` calls, sample for sample. The plan is equal to `planMissedSoundReplay` of a deep copy of the log made with `JSON.parse(JSON.stringify(log))`. The log is deep-equal before and after the run. For every visit of CP10 the seed the flow drew on entering the stage equals `replayRenderSeed(log)`, and the draws before it equal the logged engine seeds.

**CP7. Every replayed sound is announced, faded and within the cap** (Universal, 300 runs; R4.4, R4.6, R6, R7, R15.3, R15.4). Generated: a drawn visit log with at least one miss and a replay script. For every backend `schedule` call of the run:
- it came after `startReplay`, and the last view published before the call that led to it (the press) was `announcing` with all four announcement lines;
- the channel of the sound's ear holds a sample that is not zero and every sample of the other channel is `+0`;
- its peak is at most `ceilingFraction`; it lasts at most `ghostSoundMaxDurationMs`; `measureFadeLengths` gives at least `fadeMinMs` in and out;
- it is the next sound of the plan, or the same sound again after a cut or a refusal, with its room's Sound_Id, its ear and its asked level, and its play outcome's played level equals the asked level with no clamp limit (audio-output R9.4), so it is at most `replayCapDb`; logs whose misses lie near the top make the asked level the exact room top in many runs, which the output stage's CP6 does not reach;
- its start is at least `replayGapMs` after the end of the sound before, on the page clock;
- the `replaySoundStarted` event for it comes at its start on the page clock, holds the sound as `replaySoundOf` gives it, and `capChangedLevel` is true whenever the played level is below the raised level.

**CP8. Pauses, endings and refusals** (Universal, 300 runs; R11.2 to R11.5, R11.7 to R11.9, R12, R13.1, R13.2). Generated: a drawn visit log with at least one miss and a replay script, and for one run in three a refusal script on a scripted output. Then:
- while a pause holds, no `play` is made, `canSkip` and `canProceed` are false, and the view's `pauseLine` is the line of its reason;
- after a `resume` that the shell accepts, the next `play` is the sound that was cut, or the next one when none was under way, one gap after the pause ended;
- a `deviceChanged` report in `announcing` or `playing` gives `finished` with `deviceChanged` and no `play` after it;
- after a refusal other than `notRunning` and `notCalibrated`, the next `play` is the same sound one gap later; the third refusal in a row gives `finished` with `soundRefused`; a scheduled play resets the count;
- a run with no ending event and every pause resumed reaches `finished` within `start delay + Σ pauses + Σ over the sounds of (replayGapMs + scheduleLeadMs + 1500 ms) × refusedPlaysInARowMaxCount`;
- every `finished` view has the end line of its ending and the counts of the whole log;
- the log's `pauses` and every other list of the log are unchanged.

**CP9. Safe wording** (Universal, 500 runs; R16; `wording.md`). Generated: a drawn visit log and a replay script; every view and event of the run, and a view of each phase made directly with every pause reason and every ending. For every generated string: no banned term (`findBannedTerms` with `bannedTerms`); every match of `\d+ dB` is followed by " quieter than your calibration", " louder than your calibration" or " louder than when it went by"; no word about accuracy (accurate, accuracy, precise, precision, exact, exactly, validated, verified, guaranteed, certain); no word that compares the visitor with anyone (the banned list's average, typical, percentile, and also: others, everyone, most people); no word of blame (fail, failed, wrong, bad, poor, only); no string is empty or starts or ends with white space; every string of a sound names only its own room and pitch.

**CP10. The replay at the end of whole visits** (Universal, 30 runs; R1, R7.1, R13.3, R13.4, R14.2, R15.1, R17.6; brief, "Done when"). Generated: a visitor script of the visit flow's arbitraries with a replay behaviour added (watch to the end, skip at a drawn time, stop at a drawn time, or the disturbances of a replay script), played through the visit flow's harness with `spyOnOutput`. Then:
- the visit reaches `result`, and its snapshot holds the same log object as the replay stage's snapshot, and the summary equals `summarizeVisit` of it;
- every play the flow made in the replay stage has the Purpose `replay` and is a sound of `planMissedSoundReplay(log)`, in the order CP7 states; no play has the Purpose `replay` in any other stage;
- `beginRoom` was called after the last trial and before the first replay play;
- the seed drawn on entering equals `replayRenderSeed(log)` (CP6);
- while a pause of the replay holds, the snapshot's `pause` has its reason and `canProceed` is false; no entry of the log's `pauses` names the replay stage.

The other checks are examples: each pure helper, the config values, the copy outputs of the table, the controller's phases one by one on the manual timer, each row of "What each phase accepts" in `create-visit-flow.test.ts`, `replayRenderSeed` against a flow's log, and `missed-sound-replay-simulated-visits.test.ts`, which plays a quick and a full visit through the visit flow's harness and simulated visitor to the result with the replay watched to its end, and checks that it played its plan.

## Testing strategy

### Shells, timers and visits

The controller-level properties (CP4 to CP9) use the replay harness: a real output shell on the fake backend, calibrated, and the manual timer, moved together as `output-shell-harness.ts` moves them. The pure properties (CP1 to CP3) need no shell. CP10 and the simulated visits use `tests/properties/visit-flow-harness.ts` and `tests/listeners/simulated-visitor.ts`, so that their logs are real ones and the flow's own part is checked. The simulated visitor gains an optional replay behaviour; without one it calls `proceed` after a rest, as it does now, which skips the replay, so the visit-flow properties are unchanged. Every file that renders replaces the synth's render functions with the worst-case renderers through `vi.mock`.

### Run counts and time

PROPOSED, NOT APPROVED (Q7):

| Property | Runs |
|---|---|
| CP1 | 1000 |
| CP2 | 1000 |
| CP3 | 1000 |
| CP4 | 300 |
| CP5 | 300 |
| CP6 | 200 |
| CP7 | 300 |
| CP8 | 300 |
| CP9 | 500 |
| CP10 | 30 |

The property files of this spec must take at most 45 seconds together on the project machine (PROPOSED, NOT APPROVED, Q7). Estimate, not measured: CP1 to CP3 and the view part of CP9 are pure and take a second or two each. A controller run renders up to 20 worst-case sounds at 22050 Hz and measures their fades, a few milliseconds a sound, so CP4 to CP9 take roughly 3 to 8 seconds each. A whole visit of the visit flow's harness took about 130 to 150 ms in the result page's simulated visits, so CP10 takes about 5 to 10 seconds with its replays. The tasks that write the properties run `npm test` three times and write the time of each file here. If the files take more than the budget together, the task stops and reports the times to the owner; it changes no run count.

Times of task 4. Three runs of `npm test` on 2026-11-15, with the files of tasks 1 to 4 present, gave these times per property file, in ms, as Vitest's JSON reporter gives them (the sum of the file's test durations, without the file's import). The run counts and the 45 second budget are PROPOSED, NOT APPROVED (Q7).

| File | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| CP1 | 1931 | 1663 | 1803 |
| CP3 | 1066 | 1046 | 1038 |
| Together | 2997 | 2709 | 2841 |

`missed-sound-replay-regressions.test.ts` holds one `it.todo` and took 0 ms. Every run was under the 45 second budget. CP3's 1000 runs are two properties of 1000 runs each: the positions, and the inputs that throw a `RangeError`. The whole of `npm test` took 47.9, 50.8 and 53.7 seconds in these runs.

### Counterexamples

A counterexample becomes a named case in `tests/properties/missed-sound-replay-regressions.test.ts`, `regression <n>: <what went wrong> (<property>, seed <s>)`, with the case written out, first with `it.fails`. The task that finds it stops there and reports it, so that the case and the fix go in separate commits, as the earlier specs do. A case that could only be removed by changing a proposed value of Q1 or Q2, or a steering value, stays an expected break, with a decision giving the case.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | `visit-flow-types.test.ts` (the additions); `replay-types-match.test.ts`; `npm run typecheck`; review of the additions against "Interface contract"; CP10 |
| R2 | `missed-sound-replay-config.test.ts`; the final task's search for numbers |
| R3 | `missed-sound-replay-plan.test.ts`; CP1 |
| R4 | `missed-sound-replay-plan.test.ts`; `replay-sound.test.ts`; CP1; CP7 |
| R5 | `even-selection-indexes.test.ts`; CP1; CP3; `missed-sound-replay-view.test.ts` (the selection line) |
| R6 | `create-missed-sound-replay.test.ts`; `create-visit-flow.test.ts` (activation and its refusal); CP7 |
| R7 | `create-missed-sound-replay.test.ts`; `replay-sound.test.ts`; CP7; CP10 |
| R8 | `replay-counts.test.ts`; `replay-copy.test.ts`; CP2 |
| R9 | CP4; the simulated visit that catches everything |
| R10 | `create-visit-flow.test.ts`; CP5 |
| R11 | `create-visit-flow.test.ts` (each row of "What each phase accepts"); CP5; CP8; CP10 |
| R12 | `create-missed-sound-replay.test.ts`; CP8 |
| R13 | `create-visit-flow.test.ts`; CP6; CP8; CP10 |
| R14 | `replay-render-seed.test.ts`; `npm run lint` (no clock in `src/session`); CP6; CP10 |
| R15 | CP7; "Which limits of the output stage act on a replayed sound"; the output stage's own CP1 to CP3 and CP7, unchanged |
| R16 | `replay-copy.test.ts`; `npm run check:copy`; CP9 |
| R17 | The property files; the regression file; the simulated visits; the times under "Run counts and time" |
| R18 | Review of "What this spec leaves to other specs" |
| R19 | The final task's `git status` and search |

## How the design serves the steering

| Rule | How |
|---|---|
| audio-safety 1, one output path | Every replayed sound is `output.play` with the Purpose `replay`. The session hands the output stage a Sound_Id, never samples |
| audio-safety 2, a hard cap | The Asked_Level is at most the room top under the calibration in use, which is the lower of the anchor cap and the ceiling for that sound. The output stage still applies both. A level the cap held back is said so on its ripple. Nothing above the cap is ever asked for, so the output stage has nothing to clamp; if it did clamp, the clamp would be returned, logged and shown on the label |
| audio-safety 3, no sudden sounds | The output fade of 25 ms and its check on every replayed sound; the 20 ms stop fade on stop, skip and every page event. A cut sound is played again from its start, faded in |
| audio-safety 4, no jumps upward | The replay is the one exception the rule names, and the output stage lifts the rise limit for the Purpose `replay` alone. The cap still holds. `beginRoom` is called before the replay, and any later room must call it again |
| audio-safety 5, silent means silent | The output stage routes each replayed sound to its ear with exact zeros on the other channel; checked again in CP7 |
| audio-safety 6, short sounds | Room sounds of 800 to 1400 ms; the output stage refuses anything over 1500 ms; one sound at a time |
| audio-safety 7, the visitor stays in control | `stop` silences at once and shows the result in every phase; skip silences too; hiding the page pauses, leaving it ends the replay. The view gives the stop control's label in every phase, and the owner shows the control in this stage ("What the owner builds") |
| audio-safety 8, the volume keys | The announcement says "Leave the volume as it is." No line advises raising it |
| audio-safety 9, no jump scares | The louder sounds are announced and wait for the visitor's press. Only the five room sounds play, at most at the cap. The drawing of ripples is the owner's and must not flash |
| product, the fear comes from things getting quieter | The replay plays what went by unheard, louder, after saying so. Nothing in it is sudden |
| product, nothing reveals a sound before the answer | The replay comes after the last answer. The rooms' rule that the snapshot does not change when a sound is scheduled (visit-flow R11.2, R11.3) concerns trials waiting to be scored; none is waiting here (D19) |
| product, followable without headphones | Every replayed sound has a ripple label with side, pitch and the level it was missed at, and the counts are in words |
| product, results stay in the browser | Nothing is stored or sent. The log is not changed |
| wording, banned words and tone | CP9 over every string; `check:copy`; the copy hook. "You did not catch it", never a word of blame |
| wording, levels relative to the calibration | Every level by `relativeLevelLabel`; the raise said as a difference; no number of decibels on its own |
| hearing-method | The replay changes no rule of the search and reads its outcomes as the log records them. Wrong sides are counted separately, as the method records them (Q3) |
| structure | Session code only in `src/session`, importing `audio/output`, `copy` and `config`; numbers in `src/config`; every string in `src/copy`; `Db`, `Ms`, `Count` endings; `left` and `right` |
| tech | Time from the visit's timer only; randomness from a seed that follows from the log; runs under Node; no runtime dependency; sound started only in a press (`startReplay`, `resume`) |

No number or rule from a steering file is changed or loosened by this spec.

## What this spec leaves to other specs

- **The swapped repeat (brief 08).** It starts from the `result` stage, after the replay. It inherits an output shell whose previous gain on each ear may be a replayed sound's, so it must call `beginRoom` before its room, as every room does. It inherits the visit's random source after the replay's one draw, and a calibration that a device change in the replay or on the result may have removed, so it must check `rangeReport()` and calibrate again if needed. The swapped repeat plays no replay of its own; whether it should is for its spec.
- **The no-headphone replay (brief 09).** It replays a whole recorded visit and draws the missed sounds itself (its brief: "including the ones the visitor missed, which are drawn differently"). This spec adds nothing for it. `planMissedSoundReplay`, `replayCounts` and the copy of this spec are pure and need only a log, so its spec may use them; it may also not. The stored log is unchanged by the replay, so it holds no trace of the replay.
- **The last door (brief 11).** It goes between the last room and the replay (visit-flow D22). The replay reads only `log.trials`; if the last door adds entries there, its spec says whether they are replayed and must keep the plan's rule that a Missed_Trial is a sound trial of a finished room run.
- **The robot module (brief 10).** It may watch the replay through the snapshot and the `replaySoundStarted` event. This spec adds no hook for it.
- **The house interface.** The screen of this stage is the owner's ("What the owner builds").

## Whatever the owner chooses in visit-flow Q1 to Q4

- **Q1, the visit limit.** The replay does not read the summary. Nothing changes.
- **Q2, constant pressing.** Ignored answers are not trials and are not replayed or counted.
- **Q3, the length of the visits.** The proposed replay adds about 30 seconds to every visit with a miss ("Measurements"). Q1 and Q2 here set that.
- **Q4, a device change mid-room.** If a device change starts the room again, the abandoned run's misses are left out (D3). If it ends the visit, there is no replay.

## What the owner builds

Outside this spec's tasks, by hand:

- The screen of `missedSoundReplay` in `src/ui`, replacing the stand-in notice in `src/ui/visit/screen-of-snapshot.ts`, drawn from `snapshot.replay` alone: the heading; in `announcing` the four announcement lines and the selection line before the start control (`startLabel`, calling `startReplay`) and the skip control (`proceedLabel`, calling `proceed`); in `playing` the lit room of `current.room`, the position label, both count lines, the selection line, the skip control, and while `snapshot.pause` holds the pause line and the resume control (`resumeLabel`, calling `resume`); in `finished` the end line, both count lines and the control that goes on; in `nothingMissed` the one line, the counts and the control that goes on.
- **The visible stop control in this stage, in every phase.** `screenOfSnapshot` hides it in `missedSoundReplay` today, with the comment that no sound can play after the last room. Once the replay plays, audio-safety rule 7 needs it shown, with `replay.stopLabel` and `flow.stop()`. Until the screen calls `startReplay`, nothing plays in this stage, so the stand-in stays safe.
- The ripple of each `replaySoundStarted` event on `sound.ear`, labelled with `sound.rippleLabel`, in `sound.room`. A replayed sound starts every 1.6 s or so and a ripple lasts 2880 ms, so ripples overlap; the reduced-motion form and the rule against flashes (rule 9) apply.
- The field `replay` in the literal of `src/ui/visit/screen-of-snapshot.test.ts` once the contract's additions land (Q6).
- `reaction-of-event.ts`: it gives null for `replaySoundStarted` today, which is safe; the owner adds the ripple there or elsewhere.
- The browser tests in `tests/e2e/`, and the "real visit" half of the brief's "Done when".

## Questions for the project owner

None of these is decided here. The design uses the proposed answer of each so that it is complete, and every proposed number is marked PROPOSED, NOT APPROVED in `src/config` and in this document.

**Q1. The most sounds one replay plays (`replaySoundsMaxCount`). Proposed: 20, PROPOSED, NOT APPROVED.** The brief asks for a brief replay and an evenly spread selection "if there are more missed sounds than the configured maximum". The search makes misses common: a quick visit misses a median of 33 to 37 sounds, a full one 56 to 60 ("Measurements"). So the maximum decides both how long the replay is and whether a selection is the rule or the exception. With the proposed gap of 400 ms:

| Option | Selection in | Replay length, median | What it costs |
|---|---|---|---|
| **20, proposed** | 98 to 100 % of visits | about 30 s, longest 33 s | Almost every replay is a selection, so "I will play twenty of them" is said nearly every time; a visitor hears about a third of a full visit's misses |
| 30 | 65 to 77 % of quick, every full visit | about 45 s, longest 49 s | Half as long again; still a selection in most visits |
| 45 | 5 to 16 % of quick, 90 to 93 % of full | 50 to 69 s, longest 75 s | A quick visit usually hears every miss; a minute or more of louder sounds at the end of a full visit |
| 60 | almost no quick, 30 to 47 % of full | 50 to 90 s, longest 98 s | Close to the whole list; one and a half minutes in a full visit |
| No limit (a very large value) | never | 50 to 92 s, longest 139 s | Every miss, as the brief's first sentence says; over two minutes in the longest full visits, which works against "the replay stays brief" |

**Q2. The gap between replayed sounds (`replayGapMs`). Proposed: 400 ms, PROPOSED, NOT APPROVED.** The wait from the end of one sound to the request for the next; the sound then starts 50 ms later. Options:

| Option | Median length at 20 sounds | What it costs |
|---|---|---|
| 300 ms | about 28.5 s | Sounds nearly run together: the attic's fade-out alone is 300 ms, so its tail and the next start are close; ripples overlap more |
| **400 ms, proposed** | about 30.3 s | The same silence the calibration repeats leave between them (400 ms, a separate value); ripples still overlap |
| 600 ms | about 34.2 s | Each sound stands apart; with a larger Q1 the replay grows by 0.2 s a sound |

Any value above 0 keeps the output stage from refusing a sound as `busy`, because the next request always comes after the end of the last sound.

**Q3. Answers on the wrong side.** The brief replays "every trial scored as missed", and the log names the outcome `missed`. A wrong side is a separate outcome: the visitor answered, on the other side. The hearing method counts it as a miss for the ear and records it separately, and visit-flow D6 expected that "the replay will show it". Plausible listeners give a median of 7 (quick) to 13 (full) wrong sides; attentive ones almost none. Options:

- (a) **Proposed.** Not replayed. The count line adds "Once you named the other side." or "Three times you named the other side." when there were any, so that made = caught + wrong side + missed can be read. Cost: a sound the visitor did not place correctly is not heard again; one more sentence in the count.
- (b) Replayed with the misses, in order. Cost: the replay includes sounds the visitor heard, which weakens "how much went by unheard"; the ripple label would need its own wording ("You named the other side"); the replay grows by a fifth for plausible listeners. The plan's filter and the label change; nothing else.
- (c) Not replayed and not mentioned. Cost: "On your right I made seven sounds. You caught three." with three replayed sounds instead of four reads as a wrong count, although each number is true.

**Q4. What the running count covers.** The brief: "A running count is shown in words, for example 'On your right I made seven sounds. You caught three.'" Options:

- (a) **Proposed.** Both sides over the whole visit so far: every scored sound trial of a finished room run up to and including the sound being replayed, so the numbers climb as the replay moves through the visit and reach the visit's totals at the end. Cost: with a selection, the numbers jump between replayed sounds; the counts pool every floor, which is a count of answers and not a level, as the pooled false alarm line is (result-page Q3).
- (b) The room of the current sound only, up to that sound. Cost: the counts start again in each room; the line would name the room; per-floor counts of catches are easy to read as a measure of that floor, which the staircase does not make them.
- (c) The visit's totals, shown from the announcement on. Cost: it does not run; the replay adds nothing to it.

**Q5. The cap of a replayed sound.** The brief: "20 dB above the level at which it was missed, clamped to the cap". The design reads "the cap" as audio-safety rule 2's cap for that sound with the calibration in use: the room's top, the lower of the anchor cap and the ceiling (D5). Rule 2 and the initial values allow a stricter cap at any time. Options:

- (a) **Proposed.** The room's top under the last kept calibration. Cost: a replayed sound can be up to one 5 dB step louder than any trial of its room, because the search's cap is the top rounded down to its grid; the louder end of the replay is the loudest moment of the product.
- (b) The search's cap of the trial's room run (`searchCapDb` of its attempt). The replay is never louder than the loudest level the search could ask for in that room. Cost: more sounds are held back; the label "as loud as the house may play" would become "as loud as this room went"; the plan reads the attempt's cap instead of the calibration's top.
- (c) A replay ceiling of its own below the room top, such as the anchor (0 dB). Cost: a new number for the owner; many sounds missed near the top would replay no louder than they were, which the label would say.

**Q6. Landing the contract's additions, and the owner's test fixture.** The field `replay` is required, as visit-flow D1 intends ("Later specs add fields"). `src/ui/visit/screen-of-snapshot.test.ts`, the owner's file, builds a `MissedSoundReplaySnapshot` literal without it, so after the first task `npm run typecheck` fails on that file, and this spec's tasks may not touch `src/ui/` (R19.1). Options:

- (a) **Proposed.** The owner changes that literal before the first task runs, for example to `{ ...base("missedSoundReplay", 3), visitLog: {} as VisitLog } as MissedSoundReplaySnapshot`, which compiles before and after the addition. Cost: one line of the owner's, at a set time.
- (b) The owner allows the first task to add `replay` to that literal, as the one change under `src/ui/`. Cost: an exception to R19.1.
- (c) Make `replay` optional. Cost: every reader must handle a missing view that never occurs, and a flow that forgot the view would still compile.

The owner took option (a) and changed the literal, which is now cast with `as MissedSoundReplaySnapshot`, before task 1 ran.

**Q7. Run counts and time budget of the property files. PROPOSED, NOT APPROVED.** The counts of "Run counts and time" and a budget of 45 seconds for this spec's property files together. Options: these; fewer runs of CP4 to CP8 (for example 100 each), which shortens the suite by about two thirds of their time and lowers the chance of finding a rare case in one run; or a larger budget. The visit flow's files take about 44 seconds and the result page's about 17 seconds today, so the whole of `npm test` would grow by about the budget.

### Found in the existing code

Not questions, but things the owner may want to know, none changed here:

- `screenOfSnapshot` hides the stop control in `missedSoundReplay` (see "What the owner builds").
- An unsupported report from `activate` inside `startReplay` or `resume` drops a finished visit and shows the `unsupported` stage, as visit-flow R15.1 says for every stage. A device that ran the rooms is very unlikely to turn unsupported here. Keeping the result would change a visit-flow requirement, so it is left as it is.
- `visitFlowConfig.refusedPlaysInARowMaxCount` says "the visit ends" in its comment. In the replay three refusals in a row end the replay, not the visit (D16); the comment stays as it is.

## Decisions

Each point below was open in the brief, the steering, the earlier specs or the code, and is this spec's to settle. Where the owner may see it otherwise, a question names it.

**D1. The contract gains one method, one field and one event kind, and nothing in it changes.** Visit-flow D1 lets later specs add fields, event kinds and methods. `startReplay` is the one new action, because the replay must not start by itself (D8). `replay` holds the whole view, so the owner reads one field. `replaySoundStarted` says when to draw a ripple, which a snapshot alone cannot say when a cut sound starts again with the same position. Skip reuses `proceed`, which already leads from this stage to the result (visit-flow R16.3); stop keeps its meaning (visit-flow R14.2). Q6 is about the one fixture the required field touches.

**D2. The replay follows from the log alone.** The plan reads the log and the config; the counts read the log; the render seed is the draw that comes after the log's own seeds in the visit's source (visit-flow D19). So a replay can be computed again from a stored log, the properties can check it from the log, and a failing case is replayed from the log. "The original sound" is the room's ghost sound, rendered again: the samples heard on the trial are not stored, and the renders of a visit's sound source depend on every calibration repeat before, which the log does not hold.

**D3. A missed trial is a scored sound trial with the outcome `missed` in a finished room run.** That is the brief's "every trial scored as missed" in the log's own terms. A discarded trial was played again and scored later as the same trial; counting both would replay one miss twice. An abandoned run is left out of the summary (visit-flow D12), so leaving it out here keeps the replay and the picture about the same trials. Wrong sides are Q3.

**D4. The missed level is the played level.** Visit-flow R10 records what was played, and the output stage asks that the played level, not the requested one, be recorded. What the visitor did not hear is the played sound.

**D5. "The cap" is the room's top under the calibration in use.** Audio-safety rule 2 defines the cap as the lower of the anchor cap and the ceiling. For a sound and a calibration that is the room top, which the log keeps for every calibration. Using it in the plan lets the label say before the sound plays whether the cap held it back, and the output stage never needs to clamp. The last calibration of the log is the one the output stage holds in the replay, because no calibration happens between the last room and the replay. A stricter reading is Q5.

**D6. Levels from before a device change are replayed on the last calibration.** Each level is relative to its own calibration, and every calibration matches the same hand rubbing. The replay raises each figure by 20 dB and plays it under the calibration in use, capped by that calibration's top. That keeps "20 dB above the level at which it was missed" in the only scale the house has.

**D7. The selection takes `floor(k × (n − 1) / (m − 1))`.** It is the simplest rule that is deterministic, keeps the order, spreads the gaps evenly (they differ by at most one) and keeps the first and the last missed sound, so the replay begins where the misses began and ends on the last one, near the end of the visit. It needs at least two sounds, hence the config's lower bound. Spreading over the visit's order, not per room or per side, keeps the brief's "in the order it happened". The number is Q1.

**D8. The replay starts on the visitor's press after the announcement.** The brief: "Before it starts, the house says what is about to happen". A press makes sure the visitor had the announcement in front of them, gives control (rule 7), and is a gesture, which the browser needs to start sound again after the page was hidden (`tech.md`). It needs no timing number. And the interface that exists today never calls `startReplay`, so the stage stays silent until the owner's screen is built. The first sound comes one gap after the press.

**D9. The gap runs from the end of one sound to the request for the next.** The brief: "Gaps between sounds are shortened to a fixed short interval". Measuring from the end makes the silence the same whatever each sound's length, and guarantees one sound at a time (audio-output D16). The end is put on the page clock as the room runner puts a sound's start (visit-flow D3). The number is Q2.

**D10. The current sound changes, and its event is handed out, when the sound starts.** The ripple belongs to the moment the sound is heard. The output stage gives the start on the audio clock; the controller converts it with `soundWindowStartMs` and waits until then. Between sounds the view keeps the last one, so the label stays readable during the gap.

**D11. The running count covers both sides, over the whole visit, up to the sound being replayed.** It runs, as the brief asks: each replayed sound moves it forward through the visit, and it reaches the visit's totals when the replay ends. It counts the same trials as the plan (scored sound trials of finished runs), so the visitor can read how many went by unheard. Its scope is Q4.

**D12. Counts are written in words; positions in digits.** The brief's example writes "seven" and "three". `countWords` writes every whole number up to 999 in words, which covers every count a visit can have (20 trials per ear per room, five rooms, a few room runs), and digits from 1000 on rather than throwing in front of the visitor. "Sound 3 of 20" is a label, written like "Room 2 of 3".

**D13. With nothing missed, the stage shows one line and waits.** The brief: "the stage is skipped with one line saying so". The line needs a place; the result snapshot is the result page's and gains nothing here. So the stage plays nothing, shows the one line and the counts, and goes on with `proceed`, the same control the stand-in uses today. No announcement is shown, because nothing is coming.

**D14. Skip is `proceed`, and it silences at once.** It is the control the stage already has. When a sound may be under way, skip calls `stopAll`, which fades to zero in 20 ms (rule 7), and cancels the replay's timer. In `announcing` there is nothing to silence, so the shell is left running for the next stage.

**D15. A hidden page or an interruption pauses the replay; a device change ends it; leaving the page shows the result; the visitor's `pause()` does nothing here.** The output stage already stops all sound on every page event (rule 7). Pausing keeps the visit's peak for a visitor who glanced at another tab, and the cut sound is played again from its start, faded in, rather than resumed in the middle. A device change makes the output stage forget the calibration, and calibrating again for a few louder sounds is more than the replay is worth, so the replay ends and the result follows. A left page shows the result, as `stop` does, because the visit is complete (visit-flow D13). The visitor already has skip and stop, so `pause()` adds nothing.

**D16. A refused sound is tried again, three times in a row at most.** The room runner does the same for a trial (visit-flow D25), and most refusals (a render over its peak bound) are random and pass on a new render. Three refusals in a row end the replay, not the visit: the result is complete and is shown. The number is the existing `refusedPlaysInARowMaxCount`, with the same meaning, refusals in a row of one sound, so no number is added. `notRunning` is a stopped shell and is handled as its stop; `notCalibrated` is a forgotten calibration and is handled as a device change.

**D17. The finished replay waits for the visitor.** The brief does not say how the replay leads to the result. Going on by itself would need a new timing number and would cut off the end line and the counts. One press, the same as the stand-in's "See the picture", needs neither.

**D18. The replay writes nothing to the visit log.** The log is assembled once, when the rooms end (visit-flow D28), and the result, the saved visit and the no-headphone replay read it. The result page's archive keys a saved visit by the log object (result-page, "The archive"), so the result must hold the same object. A replay's pauses and plays are not trials; the output stage's clamp log keeps any clamp with the Purpose `replay` (audio-output D22). This is also why the flow's `beginPause` and `endPause`, which write to the recorder, are not used here.

**D19. The replay's snapshot changes when a sound starts.** Visit-flow R11.2 and R11.3 keep a room's snapshot from changing while a trial waits to be scored, so that nothing gives a sound away before the answer. No trial waits in the replay: every answer has been given. The screen-leak property of the house interface ends at the last answer, so it is unaffected.

**D20. The flow keeps gestures, the pause field and the stage; the controller keeps the rest.** The flow already owns `withSound`, the snapshot's `pause` and the move to the result, and every other stage uses them. The controller owns what is new: the plan, the timer, the plays, the current sound and the phase. That split lets the controller be tested on a shell and a manual timer in milliseconds (CP4 to CP9), as the room runner is, and leaves the flow's part small enough for CP10's whole visits to check.

**D21. The view is a pure function of the controller's state.** The flow publishes a snapshot only when its plain data changes (visit-flow R11.4). A pure view changes exactly when the phase, the current sound or the pause changes, so the screen hears of each moment once.

**D22. Only the rise limit is lifted, and the output stage already lifts it.** Rule 4 names the replay as "the one place a larger rise is allowed", and the output stage passes no previous gain for the Purpose `replay` (audio-output R11.5). Every other limit acts, as the table "Which limits of the output stage act on a replayed sound" shows from the code. Nothing in `src/audio/output` changes.

**D23. Every string is in the view.** The screen then has nothing to word, and CP9 can check everything the screen shows from the views alone. The copy defines its own names for sides, endings and pause reasons, because it may import only `config`, and type tests check that they equal the session's.

**D24. The announcement names the raise, the cap and the volume.** It says what will happen, where from, in what order, how much louder ("20 dB louder than when it went by"), that nothing goes beyond what the house may play, not to change the volume, and that the sounds can be stopped. That is what makes the louder sounds expected (the brief) and repeats rule 8's warning at the loudest moment.

**D25. The ripple label carries one level, relative to the calibration.** It gives the side, the pitch and the level the sound was missed at, the brief's "original level", and then "Now it is louder" or "Now it is as loud as the house may play". A second number, the replayed level or the difference, would put two levels in one short label and invite comparing them with levels of other floors. The view still holds every level as numbers for anyone who needs them.

**D26. Every property is universal, with proposed run counts and a time budget.** Nothing here is statistical, so no seed is fixed. If the files exceed the budget, the task stops and reports the times; no count is lowered. The counts and the budget are Q7.

**D27. What the tasks touch, and how they are committed.** Unlike the result page, this spec must change `src/session/visit-flow-types.ts` and `src/session/create-visit-flow.ts`; it only adds to the first, and in the second changes nothing outside this stage and the two shared paths it branches from (`onOutputStopped`, `endPause`). The tasks create and change only the files listed in "Files", never `src/ui/`, `tests/e2e/`, `tests/properties/screen-leak/`, `index.html`, `listen.html`, `result-sheet.html`, `src/main.ts`, the root `README.md` or `.kiro/steering/`. They do not commit. A separate run makes one commit per task with a one-line message, so anything a task must record (property times, a counterexample, the measurement printed again) is written in this design or a README.

**D28. The measurement was made once from outside the repository.** It answers how many sounds a visit misses, which Q1 and Q2 need, and took one script over the existing population tools. The script was not kept in the working tree while the spec was being written; a task adds it to `tests/listeners/` with the same seeds, so that the figures can be reproduced and checked. The figures come from the engine alone, with one listener per room, and say nothing about real visitors.

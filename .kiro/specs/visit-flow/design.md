# Design: visit flow

## Overview

The visit flow is the part of `src/session` that knows the order of things. It owns one output shell for the life of the page, runs one visit at a time, and turns the threshold search's requests into sounds, windows and scored answers on the injected timer.

```
   src/ui  (built by hand against visit-flow-types.ts)
     │  chooseVisit, startCalibration, louder, quieter, keepCalibration,
     │  playHeadphoneCheck, answerHeadphoneCheck, proceed, answer(side, pressedAtMs),
     │  pause, resume, stop, chooseSwappedRepeat, backToFrontDoor
     ▼                                                    ▲ snapshot() / subscribe()  (stage state)
  ┌──────────────────────── src/session ───────────────────┴──── onEvent() (roomStarted,
  │  createVisitFlow                                               trialScored, roomFinished)
  │    stage machine: entry → calibration → headphoneCheck → rules → room ⇄ betweenRooms
  │                   → missedSoundReplay → result ⇄ swappedRepeat;   exit;  unsupported
  │    ├── calibration controller (audio-output spec, reused)
  │    ├── room runner: one Room_Attempt: gap → present → window → score → next
  │    │       │ current()/respond()             │ play(trial) / beginRoom / stopAll
  │    │       ▼                                 ▼
  │    │   src/engine  createThresholdSearch   src/audio/output  createAudioOutput
  │    ├── visit log recorder  (every played trial, in order)
  │    └── summarizeVisit + judgeVisitFalseAlarms  (pure: the result and the visit-level rule)
  └────────────────────────────────────────────────────────────────────────────────────
```

The design rests on four choices.

- **The interface sees nothing about a trial until it is scored.** The room snapshot holds the room and the pause state, and nothing that changes when a sound is scheduled or a window opens. The only event about a trial, `trialScored`, is created in the same timer callback or action that scores it. It carries a `reaction` that tells the interface what to draw at once: a ripple for a catch, the house's line for an answer to silence, and nothing for every other outcome. The interface can show every event the moment it arrives.
- **Answers are judged on the page clock against the moment the sound started.** The output shell returns the start on the audio clock. The flow converts it with the shell's timestamp pair. A no-sound trial's window opens where a sound asked for at the same moment would have started, including the measured output delay, so that the two kinds of trial cannot be told apart by timing (D4).
- **The visit log is the one record.** Every trial that was played is in it once, in order, scored or discarded. The result, the replay, the no-headphone replay and the stored visit read it. The visit summary is a pure function of the log, so the picture cannot disagree with the record.
- **A visit-level false alarm rule pools the no-sound trials of every room.** It is one pure function. Its limit is a new config value of 0.2, proposed by this spec and decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it (Q1). The measurement that lets the owner choose is in "Measurements".

## Sources

- `docs/briefs/04-visit-flow.md`.
- `.kiro/steering/`: `product.md` (the stages, the experience rules), `audio-safety.md` (rules 1 to 9), `hearing-method.md` (the initial values, the no-sound trials, the four end states), `structure.md` (module rules, naming), `tech.md` (gesture, injected time and randomness), `wording.md` (the no-sound line, banned words).
- `docs/architecture.md`: the session's place, the visit log as one source, the event stream for the interface.
- `.kiro/specs/audio-output/design.md`, section "What the visit-flow spec must do", whose obligations are requirements here (R2.5, R3.2, R6.1, R6.2, R10.3, R13.2, R16.1, R16.2, R7.3), and its decisions D14 (stops), D16 (one sound at a time), D17 (start times and the timestamp pair), D18 (device change), D20 (headphone check after calibration), D23 (gesture) and D47 (calibration controller).
- `.kiro/specs/threshold-search/design.md`: the engine interface, D7 (the visit-level rule belongs here), D17 (listener ranges), D24 (the room result carries every trial), D28 (trial fields must not reach the screen early), D42 (Accurate), and D43 with regression 4 (the guesser just under the false alarm limit).
- `.kiro/specs/ghost-sounds/design.md`: the five ghost sounds and their centre frequencies.
- The code: `src/config/hearing-method-config.ts`, `audio-output-config.ts`, `ghost-sound-config.ts`, `sound-id.ts`, `seeded-random.ts`, `timer.ts`, `manual-timer.ts`; `src/engine/threshold-search.ts`, `search-types.ts`, `fraction-comparisons.ts`; `src/audio/output/create-audio-output.ts`, `output-types.ts`, `audio-backend.ts`, `fake-audio-backend.ts`, `web-audio-backend.ts`, `range-report.ts`, `calibration-setting-top.ts`; `src/session/calibration-controller.ts`, `listening-page-session.ts`, `room-search-cap.ts`, `judge-headphone-check.ts`; `src/copy/calibration-copy.ts`, `headphone-check-copy.ts`, `output-state-copy.ts`; `src/storage/README.md` (the module is still empty); `tests/listeners/`; `tests/properties/worst-case-renderers.ts` and `output-shell-harness.ts`; the lint rules in `tools/lint/`.
- The interface files the project owner is writing by hand, read but not committed and not changed by this spec: `src/ui/visit/build-visit-page.ts`, `src/copy/visit-copy.ts`, `leaving-copy.ts`, `room-copy.ts`, `rules-copy.ts` and `front-door-copy.ts`. They show a front door with "Back to the front door" on the exit sheet, a paused sheet with "Go on", the kept-calibration line on the headphone check sheet, and room copy keyed by the ghost sound ids. The contract fits them (D14, D16, D18).
- Measurements: before writing this design I ran throwaway Node computations with `npx tsx --no-cache -e`, inline, writing no file, at commit 125e13f. They play whole visits through the shipped engine with the listeners of `tests/listeners/`. Their numbers are in "Measurements" and are the basis of D17, Q1 and Q3.

## Files

Created:

```
src/config/
  visit-flow-config.ts                 visitFlowConfig (R20)
  visit-flow-config.test.ts

src/session/
  visit-flow-types.ts                  the Contract_File: types only (task 1, R1)
  visit-flow-types.test.ts             type-level checks against the engine and the output stage
  visit-rooms.ts                       visitRooms: the rooms of a visit type, in order (R2.7)
  visit-rooms.test.ts
  window-start.ts                      soundWindowStartMs, noSoundWindowStartMs (R7.3 to R7.5)
  window-start.test.ts
  answer-time.ts                       answerTimeMs: the time an answer counts at (R7.8)
  answer-time.test.ts
  judge-visit-false-alarms.ts          the Visit_False_Alarm_Rule (R17)
  judge-visit-false-alarms.test.ts
  summarize-visit.ts                   summarizeVisit: the Visit_Summary from the Visit_Log (R18)
  summarize-visit.test.ts
  visit-log-recorder.ts                createVisitLogRecorder: builds the frozen Visit_Log (R10)
  visit-log-recorder.test.ts
  room-runner.ts                       createRoomRunner: one Room_Attempt on the timer (R7, R8, R12, R21)
  room-runner.test.ts
  create-visit-flow.ts                 createVisitFlow: the stage machine (R2 to R16, R19)
  create-visit-flow.test.ts

tests/listeners/
  simulated-visitor.ts                 drives a Visit_Flow through a visit with a Simulated_Listener (R22.2)
  simulated-visitor.test.ts
  visit-rule-measurement.ts            measureVisitFalseAlarmRule: whole visits through the engine (R23)
  print-visit-rule-measurement.ts      prints the table of R23.2; writes no file

tests/properties/
  visit-flow-harness.ts                the Visit_Harness (R22.1, D26)
  visit-flow-arbitraries.ts            visitor scripts: answers, presses, pauses, page events, stops
  visit-flow-cp1-visit-ends.property.test.ts
  visit-flow-cp2-log-holds-played-trials.property.test.ts
  visit-flow-cp3-nothing-before-scoring.property.test.ts
  visit-flow-cp4-answers-against-windows.property.test.ts
  visit-flow-cp5-log-replays.property.test.ts
  visit-flow-cp6-rooms-as-output-requires.property.test.ts
  visit-flow-cp7-pauses-discard-and-repeat.property.test.ts
  visit-flow-cp8-stop-leaves-nothing.property.test.ts
  visit-flow-cp9-summary-and-visit-rule.property.test.ts
  visit-flow-cp10-same-seed-same-visit.property.test.ts
  visit-flow-cp11-visit-rule-effect.property.test.ts
  visit-flow-simulated-visits.test.ts  quick and full visits to the result (R22.3)
  visit-flow-regressions.test.ts       counterexamples, one it.todo at first
```

Changed: the READMEs of `src/session/`, `tests/listeners/` and `tests/properties/`.

Not changed: everything under `src/ui/`, `index.html`, `listen.html`, `src/main.ts` (R24.1); everything under `src/copy/`, `src/engine/`, `src/audio/`, `src/storage/`, `tools/`, `.kiro/steering/`, `docs/briefs/`; `package.json` and `package-lock.json`; `hearing-method-config.ts`, `audio-output-config.ts`, `audio-safety-config.ts`; `src/config/README.md` and `src/copy/README.md`, which the owner is editing (D30); every lint rule.

## Interface contract

This is the complete content of `src/session/visit-flow-types.ts`. Task 1 writes it, with no statement that runs, before anything else, so that the interface can be built from it at once. `src/ui` imports these types from this file and the function `createVisitFlow` from `src/session/create-visit-flow.ts`, and nothing else from the flow. Changes after task 1 only add (D1).

### How the interface uses it

```ts
// In the page's entry, once:
const flow = createVisitFlow({ window, timer: createSystemTimer(), seed: drawSeedWithCrypto() });
flow.subscribe((snapshot) => draw(snapshot));      // redraw the current stage
flow.onEvent((event) => react(event));             // ripples and the house's line
draw(flow.snapshot());

// Inside each input handler, synchronously, with no await before the call:
quickButton.onclick = () => flow.chooseVisit("quick");
document.onkeydown = (event) => { const side = answerForKey(event); if (side) flow.answer(side, event.timeStamp); };
```

Every action is called from inside the visitor's input handler. An action that needs sound calls the output shell's `activate` within the call, which keeps the user gesture (R2.5). An action that does not fit the current stage is ignored (R3.6), so a stale press cannot break the visit.

### The file

```ts
// src/session/visit-flow-types.ts
//
// The interface contract of the visit flow (visit-flow design.md, "Interface contract"). Types
// only. src/ui reads every type it needs from here, and calls createVisitFlow from
// create-visit-flow.ts. Later specs may add to this file; they never remove, rename or change the
// meaning of what is here (D1).

import type { VisitType } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import type { Timer } from "../config/timer";
import type { PlayRefusal, KeepRefusal } from "../audio/output/create-audio-output";
import type { ClampLimit, UnsupportedReason } from "../audio/output/output-types";
import type { BrowserWindow } from "../audio/output/web-audio-backend";
import type {
  Ear,
  EarCounts,
  NoSoundOutcome,
  SoundOutcome,
  UnreliableReason,
  VisitorResponse,
} from "../engine/search-types";
import type {
  HeadphoneCheckAnswer,
  HeadphoneCheckJudgement,
} from "./judge-headphone-check";

export type {
  ClampLimit,
  Ear,
  EarCounts,
  GhostSoundId,
  HeadphoneCheckAnswer,
  HeadphoneCheckJudgement,
  KeepRefusal,
  NoSoundOutcome,
  PlayRefusal,
  SoundOutcome,
  UnreliableReason,
  UnsupportedReason,
  VisitorResponse,
  VisitType,
};

// ─── Creating the flow ───────────────────────────────────────────────────────────────────

/** What `createVisitFlow` in `create-visit-flow.ts` takes. */
export interface VisitFlowOptions {
  /** The page's window. The flow builds the Web Audio backend from it and hears its page events. */
  readonly window: BrowserWindow;
  /** The system timer of `src/config/system-timer.ts`. Every wait and every time the flow reads comes from it. */
  readonly timer: Timer;
  /** A whole number from 0 to 2³² − 1, drawn once by the page's entry with `crypto.getRandomValues`. */
  readonly seed: number;
}

/** The shape of `createVisitFlow`. It throws a `RangeError` for a seed that is not a whole number from 0 to 2³² − 1. */
export type CreateVisitFlow = (options: VisitFlowOptions) => VisitFlow;

// ─── The flow ────────────────────────────────────────────────────────────────────────────

/** One visit flow for the life of the page. It runs one visit at a time. */
export interface VisitFlow {
  /** The current state of the current stage. Frozen. Calling it changes nothing. */
  snapshot(): VisitSnapshot;
  /** Calls `listener` with the new snapshot after every change of the snapshot. Returns the function that removes it. */
  subscribe(listener: (snapshot: VisitSnapshot) => void): () => void;
  /** Calls `listener` with every event, before the snapshot listeners of the same change. Returns the function that removes it. */
  onEvent(listener: (event: VisitEvent) => void): () => void;

  /** Front door: starts a visit of this type, starts sound, and moves to calibration. */
  chooseVisit(visitType: VisitType): void;
  /** Calibration: starts the hiss at the bottom of the control and keeps repeating it. Also starts it again after a stop. */
  startCalibration(): void;
  /** Calibration: moves the control one step louder. The hiss rises by at most 5 dB per repeat. */
  louder(): void;
  /** Calibration: moves the control one step quieter than the setting last played. */
  quieter(): void;
  /** Calibration: keeps the setting last played and moves to the headphone check, or gives the reason it cannot. */
  keepCalibration(): void;
  /** Headphone check: plays the hiss in the left ear. */
  playHeadphoneCheck(): void;
  /** Headphone check: the visitor's answer to "Which side was the hiss on?". Ignored until a check has been played. */
  answerHeadphoneCheck(answer: HeadphoneCheckAnswer): void;
  /** Goes on to the next stage when the snapshot's `canProceed` is true. Does nothing otherwise. */
  proceed(): void;
  /**
   * In a room: the visitor names a side. `pressedAtMs` is the input event's `timeStamp`, on the
   * clock of the timer. Returns nothing and changes nothing visible unless it scores a trial.
   */
  answer(side: Ear, pressedAtMs?: number): void;
  /** In a room: pauses at once. A trial that was under way is played again later. */
  pause(): void;
  /** While paused: starts sound again and goes on. */
  resume(): void;
  /** The visible stop control. Stops all sound at once. Before the result it leaves the house with nothing kept. */
  stop(): void;
  /** Result: opens the swapped repeat for a room whose summary offers it. */
  chooseSwappedRepeat(roomIndex: number): void;
  /** Exit or result: drops the visit and shows the front door again. */
  backToFrontDoor(): void;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────────────────

/** One room of a visit. */
export interface VisitRoom {
  /** Its position in this visit, from 0. */
  readonly roomIndex: number;
  /** Which room of the house it is: the code name of its sound, from the cellar (500 Hz) up to the attic (8 kHz). */
  readonly roomId: GhostSoundId;
  /** Its pitch. */
  readonly frequencyHz: number;
}

// ─── Snapshots ───────────────────────────────────────────────────────────────────────────

export type VisitStage =
  | "entry"
  | "calibration"
  | "headphoneCheck"
  | "rules"
  | "room"
  | "betweenRooms"
  | "missedSoundReplay"
  | "result"
  | "swappedRepeat"
  | "exit"
  | "unsupported";

/** Why the visit is waiting for `resume`. */
export type PauseReason = "visitor" | "hidden" | "interrupted" | "deviceChanged";

/** A pause. The interface shows the line for its reason from `src/copy`. */
export interface VisitPause {
  /** `visitor`: the visitor paused. `hidden`: the page was hidden. `interrupted`: something else on the device took the sound. `deviceChanged`: the audio device changed, and the hiss will be matched again. */
  readonly reason: PauseReason;
}

/** The fields every snapshot has. */
export interface SnapshotBase<Stage extends VisitStage> {
  /** Which stage this is. */
  readonly stage: Stage;
  /** The visit type chosen, or null before one is chosen. */
  readonly visitType: VisitType | null;
  /** The rooms of the visit in the order they are visited, or empty before a visit type is chosen. */
  readonly rooms: readonly VisitRoom[];
  /** How many rooms of the visit are finished. */
  readonly finishedRoomCount: number;
  /** Whether `proceed` would go on now. */
  readonly canProceed: boolean;
  /** The pause that holds, or null. While it holds, only `resume` and `stop` do anything. */
  readonly pause: VisitPause | null;
  /** Whether the last start of sound was refused because the browser saw no press. The next press tries again. */
  readonly activationRefused: boolean;
}

/** The front door. */
export interface EntrySnapshot extends SnapshotBase<"entry"> {
  /** The two visits, in this order: quick, then full. */
  readonly choices: readonly {
    /** The visit type to pass to `chooseVisit`. */
    readonly visitType: VisitType;
    /** How many rooms that visit has. */
    readonly roomCount: number;
  }[];
}

/** Matching the hiss to the visitor's hands. */
export interface CalibrationSnapshot extends SnapshotBase<"calibration"> {
  /** True when this calibration follows a change of audio device during the visit. */
  readonly again: boolean;
  /** Whether hiss repeats are being played one after another now. */
  readonly playing: boolean;
  /** The setting of the last repeat played, which the visible control shows, or null before the first. */
  readonly playedSettingDb: number | null;
  /** The bottom of the control, where every calibration starts. */
  readonly controlBottomDb: number;
  /** The top of the control. */
  readonly controlTopDb: number;
  /** Whether the last repeat played at the top of the control. */
  readonly atTop: boolean;
  /** The calibration line to show now, from `calibrationCopy`. */
  readonly line: string;
  /** Why the last keep was refused, or null. */
  readonly keepRefusal: KeepRefusal | null;
}

/** Making sure left is left. Shown right after a calibration is kept. */
export interface HeadphoneCheckSnapshot extends SnapshotBase<"headphoneCheck"> {
  /** The line that says how many of this visit's rooms cannot get as loud as the house would like, from `roomsShortLine`. */
  readonly roomsLine: string;
  /** True from a played check until its answer. */
  readonly awaitingAnswer: boolean;
  /** Why the last press of play did not play the check, or null. */
  readonly playRefusal: PlayRefusal | null;
  /** The judgement of the last answer, or null before one. Only `correct` lets the visit go on. */
  readonly judgement: HeadphoneCheckJudgement | null;
  /** The line for that judgement, from `headphoneCheckCopy`, or null. */
  readonly judgementLine: string | null;
}

/** The rules, shown once per visit before the first room. */
export type RulesSnapshot = SnapshotBase<"rules">;

/** Inside a room. Holds nothing about the trial under way. */
export interface RoomSnapshot extends SnapshotBase<"room"> {
  /** The room the visitor is in. */
  readonly room: VisitRoom;
}

/** The rest between two rooms. The visit waits here until `proceed`. */
export interface BetweenRoomsSnapshot extends SnapshotBase<"betweenRooms"> {
  /** The room just finished. */
  readonly finishedRoom: VisitRoom;
  /** The room that comes next. */
  readonly nextRoom: VisitRoom;
}

/** The replay of missed sounds. The missed-sound replay spec adds its sounds and its fields. */
export interface MissedSoundReplaySnapshot extends SnapshotBase<"missedSoundReplay"> {
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
}

/** The result. The result page spec draws it. */
export interface ResultSnapshot extends SnapshotBase<"result"> {
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
  /** Each floor's result, with the visit-level rule applied. */
  readonly summary: VisitSummary;
}

/** The swapped repeat of one floor. The swapped-repeat spec adds its behaviour and its fields. */
export interface SwappedRepeatSnapshot extends SnapshotBase<"swappedRepeat"> {
  /** The floor to repeat. */
  readonly room: VisitRoom;
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
  /** The result the repeat was offered from. */
  readonly summary: VisitSummary;
}

/** Why the visitor is outside the house. */
export type ExitReason = "visitor" | "pageLeft" | "soundRefused";

/** The short exit screen. Holds no part of a result. */
export interface ExitSnapshot extends SnapshotBase<"exit"> {
  /** `visitor`: the stop control. `pageLeft`: the page was left. `soundRefused`: the house could not play a sound three times in a row. */
  readonly reason: ExitReason;
}

/** The device cannot carry the house. Nothing more happens on this page. */
export interface UnsupportedSnapshot extends SnapshotBase<"unsupported"> {
  /** The reason, as the output stage names it. The interface shows `outputStateCopy.unsupportedLines[reason]`. */
  readonly reason: UnsupportedReason;
  /** The device's sample rate, or null when no audio context could be made. */
  readonly sampleRateHz: number | null;
}

export type VisitSnapshot =
  | EntrySnapshot
  | CalibrationSnapshot
  | HeadphoneCheckSnapshot
  | RulesSnapshot
  | RoomSnapshot
  | BetweenRoomsSnapshot
  | MissedSoundReplaySnapshot
  | ResultSnapshot
  | SwappedRepeatSnapshot
  | ExitSnapshot
  | UnsupportedSnapshot;

// ─── Events ──────────────────────────────────────────────────────────────────────────────

/**
 * What the interface shows at once for a scored trial.
 * `ripple`: a ripple from the trial's side, labelled with the room's pitch and the played level.
 * `noSoundLine`: the house says "I made no sound that time." (wording.md).
 * `none`: nothing now. Missed sounds are shown in the replay.
 */
export type TrialReaction = "ripple" | "noSoundLine" | "none";

/** Released when a room begins. Says nothing about any trial. */
export interface RoomStartedEvent {
  readonly kind: "roomStarted";
  /** The room that begins. */
  readonly room: VisitRoom;
  /** 1 for the first run of this room, 2 after a device change made it start again. */
  readonly attempt: number;
}

/** Released in the same moment a trial is scored, never earlier. The only event that names a trial. */
export interface TrialScoredEvent {
  readonly kind: "trialScored";
  /** The room of the trial. */
  readonly room: VisitRoom;
  /** The trial's entry in the visit log. */
  readonly trial: ScoredVisitTrial;
  /** What to show now. */
  readonly reaction: TrialReaction;
}

/** Released when the last trial of a room has been scored. */
export interface RoomFinishedEvent {
  readonly kind: "roomFinished";
  /** The room that finished. */
  readonly room: VisitRoom;
}

/** Every event. The interface ignores a kind it does not know, so later specs can add kinds. */
export type VisitEvent = RoomStartedEvent | TrialScoredEvent | RoomFinishedEvent;

// ─── The visit log ───────────────────────────────────────────────────────────────────────
// Every time is in milliseconds on the timer's clock since the visit began (chooseVisit).

/** The record of one visit. Plain data: it survives JSON.stringify and JSON.parse unchanged. */
export interface VisitLog {
  /** The version of this format. Raised when a field changes meaning. */
  readonly formatVersion: 1;
  /** The visit type. */
  readonly visitType: VisitType;
  /** The seed of this visit. With the log's answers it reproduces every trial. */
  readonly visitSeed: number;
  /** The rooms in visit order. */
  readonly rooms: readonly VisitRoom[];
  /** Every calibration kept during the visit, in order. */
  readonly calibrations: readonly LoggedCalibration[];
  /** Every answered headphone check, in order. */
  readonly headphoneChecks: readonly LoggedHeadphoneCheck[];
  /** Every run of a room's search, in order. */
  readonly roomAttempts: readonly LoggedRoomAttempt[];
  /** Every trial that was played, in the order it was presented. */
  readonly trials: readonly VisitTrial[];
  /** Every answer in a room that scored no trial. */
  readonly ignoredAnswers: readonly LoggedIgnoredAnswer[];
  /** Every pause, in order. */
  readonly pauses: readonly LoggedPause[];
  /** Every sound the output stage would not play, in order. */
  readonly refusedPlays: readonly LoggedRefusedPlay[];
}

/** One kept calibration. */
export interface LoggedCalibration {
  /** Its position in `calibrations`, from 0. */
  readonly calibrationIndex: number;
  /** The setting of the control that was kept. */
  readonly settingDb: number;
  /** The highest level each room's sound could be played at with this calibration. */
  readonly roomTopLevelDb: Readonly<Record<GhostSoundId, number>>;
  /** When it was kept. */
  readonly keptAtMs: number;
}

/** One answered headphone check. */
export interface LoggedHeadphoneCheck {
  /** The calibration it followed. */
  readonly calibrationIndex: number;
  /** The visitor's answer. */
  readonly answer: HeadphoneCheckAnswer;
  /** What the answer said about the headphones. */
  readonly judgement: HeadphoneCheckJudgement;
  /** When it was answered. */
  readonly answeredAtMs: number;
}

/** The threshold search's result for one finished room run, without its trial records. */
export interface LoggedRoomResult {
  /** The left ear's result, as the threshold search gave it. */
  readonly left: LoggedEarResult;
  /** The right ear's result, as the threshold search gave it. */
  readonly right: LoggedEarResult;
  /** The room's no-sound trials. */
  readonly noSoundTrialCount: number;
  /** The room's answers to no-sound trials. */
  readonly falseAlarmCount: number;
  /** `falseAlarmCount / noSoundTrialCount`, or 0 without no-sound trials. */
  readonly falseAlarmRateFraction: number;
  /** Whether the room's own false alarm rate was above the per-room limit (30 percent). */
  readonly falseAlarmRateAboveLimit: boolean;
}

/** One ear's result, as the threshold search gave it. Counts are in every state. */
export type LoggedEarResult =
  | (EarCounts & {
      readonly state: "found";
      /** The quietest level caught on 2 of 3 rising presentations. */
      readonly thresholdDb: number;
    })
  | (EarCounts & { readonly state: "betterThanFloor" })
  | (EarCounts & { readonly state: "worseThanCap" })
  | (EarCounts & {
      readonly state: "unreliable";
      /** Why, in the order trialLimit, inconsistentCatch, falseAlarmRate. */
      readonly reasons: readonly UnreliableReason[];
    });

/** One run of a room's search. */
export interface LoggedRoomAttempt {
  /** The room. */
  readonly roomIndex: number;
  /** 1 for the first run, 2 and up after a device change. */
  readonly attempt: number;
  /** The seed of this run's threshold search. */
  readonly engineSeed: number;
  /** The calibration this run used. */
  readonly calibrationIndex: number;
  /** The loudest level this run's search could ask for: the room top on the level grid. */
  readonly searchCapDb: number;
  /** When it began. */
  readonly startedAtMs: number;
  /** When it ended. */
  readonly endedAtMs: number;
  /** `finished`: the search ended. `abandoned`: a device change stopped it and the room began again. */
  readonly ending: "finished" | "abandoned";
  /** The search's result when finished, or null when abandoned. */
  readonly result: LoggedRoomResult | null;
}

/** The fields of every logged trial. */
export interface VisitTrialCommon {
  /** Its position among the played trials of the visit, from 1. */
  readonly order: number;
  /** Its room. */
  readonly roomIndex: number;
  /** Its room run. */
  readonly attempt: number;
  /** Its number within that run, as the threshold search numbered it. A repeated trial keeps its number. */
  readonly trialNumber: number;
  /** The wait before it. */
  readonly gapBeforeMs: number;
  /** When it was presented: asked of the output stage, or, with no sound, when it would have been. */
  readonly presentedAtMs: number;
  /** When its response window opened: when the sound started, or when it would have started. */
  readonly windowStartMs: number;
}

/** The fields of a trial that played a sound. */
export interface SoundTrialPart {
  readonly kind: "sound";
  /** The ear it played to. */
  readonly ear: Ear;
  /** The level the threshold search asked for. */
  readonly requestedLevelDb: number;
  /** The level the output stage played. Equal to the request unless a limit acted. */
  readonly playedLevelDb: number;
  /** The limit that lowered it, or null. */
  readonly clampLimit: ClampLimit | null;
}

/** The fields of a trial that played nothing. */
export interface NoSoundTrialPart {
  readonly kind: "noSound";
  /** Always null: no ear. */
  readonly ear: null;
  /** Always null: no level. */
  readonly requestedLevelDb: null;
  /** Always null: no level. */
  readonly playedLevelDb: null;
  /** Always null. */
  readonly clampLimit: null;
}

/** The fields of a scored trial. */
export interface ScoredPart<Outcome extends SoundOutcome | NoSoundOutcome> {
  readonly status: "scored";
  /** What the visitor answered: a side, or none within the window. */
  readonly response: VisitorResponse;
  /** How the answer was scored. */
  readonly outcome: Outcome;
  /** When the scoring answer was pressed, or null for none. */
  readonly answeredAtMs: number | null;
  /** `answeredAtMs − windowStartMs`, or null for none. */
  readonly responseTimeMs: number | null;
  /** When it was scored: the answer, or the end of the window. */
  readonly scoredAtMs: number;
}

/** The fields of a trial that was played and then not scored, because the visit paused or the room began again. */
export interface DiscardedPart {
  readonly status: "discarded";
  /** When it was discarded. */
  readonly discardedAtMs: number;
}

export type ScoredVisitTrial =
  | (VisitTrialCommon & SoundTrialPart & ScoredPart<SoundOutcome>)
  | (VisitTrialCommon & NoSoundTrialPart & ScoredPart<NoSoundOutcome>);

export type DiscardedVisitTrial = VisitTrialCommon &
  (SoundTrialPart | NoSoundTrialPart) &
  DiscardedPart;

/** One played trial. */
export type VisitTrial = ScoredVisitTrial | DiscardedVisitTrial;

/** An answer in a room that scored nothing: outside every response window, or after the first answer in one. */
export interface LoggedIgnoredAnswer {
  /** When it was pressed. */
  readonly atMs: number;
  /** The side named. */
  readonly side: Ear;
  /** The room. */
  readonly roomIndex: number;
  /** The room run. */
  readonly attempt: number;
}

/** One pause. */
export interface LoggedPause {
  /** Why it began. A device change during a pause replaces the reason. */
  readonly reason: PauseReason;
  /** The stage it held. */
  readonly stage: VisitStage;
  /** The room, when it held a room or the rest after one, or null. */
  readonly roomIndex: number | null;
  /** When it began. */
  readonly startedAtMs: number;
  /** When it ended. */
  readonly endedAtMs: number;
}

/** A sound the output stage would not play. Nothing was scored for it. */
export interface LoggedRefusedPlay {
  /** When it was asked for. */
  readonly atMs: number;
  /** The room. */
  readonly roomIndex: number;
  /** The room run. */
  readonly attempt: number;
  /** The trial that was presented again afterwards. */
  readonly trialNumber: number;
  /** The output stage's reason. */
  readonly reason: PlayRefusal;
}

// ─── The visit summary ───────────────────────────────────────────────────────────────────

/** Why an ear's result is not presented as a number, including the two reasons this spec adds. */
export type VisitUnreliableReason =
  | UnreliableReason
  /** The whole visit's false alarm rate was above the visit limit. */
  | "visitFalseAlarmRate"
  /** A sound of this room was played at another level than the search asked for. */
  | "levelNotAsAsked";

/** One ear's result as the result page shows it: the search's result after the visit-level rules. */
export type VisitEarResult =
  | (EarCounts & {
      readonly state: "found";
      /** The quietest level caught on 2 of 3 rising presentations, relative to the visitor's calibration. */
      readonly thresholdDb: number;
    })
  | (EarCounts & { readonly state: "betterThanFloor" })
  | (EarCounts & { readonly state: "worseThanCap" })
  | (EarCounts & {
      readonly state: "unreliable";
      /** The search's reasons first, then this spec's. */
      readonly reasons: readonly VisitUnreliableReason[];
    });

/** One floor of the result. */
export interface RoomSummary {
  /** The room. */
  readonly room: VisitRoom;
  /** The left ear's result. */
  readonly left: VisitEarResult;
  /** The right ear's result. */
  readonly right: VisitEarResult;
  /** The loudest level the search could ask for here, with the calibration it used. */
  readonly searchCapDb: number;
  /** The room's no-sound trials. */
  readonly noSoundTrialCount: number;
  /** The room's answers to no-sound trials. */
  readonly falseAlarmCount: number;
  /** Right threshold minus left threshold when both ears are found, otherwise null. Never compared across floors. */
  readonly rightMinusLeftDb: number | null;
  /** Whether this floor offers the swapped repeat: both found and at least 15 dB apart. */
  readonly swappedRepeatOffered: boolean;
}

/** The result of a visit. */
export interface VisitSummary {
  /** One summary per room, in visit order. */
  readonly rooms: readonly RoomSummary[];
  /** No-sound trials over every finished room run. */
  readonly pooledNoSoundTrialCount: number;
  /** Answers to them. */
  readonly pooledFalseAlarmCount: number;
  /** `pooledFalseAlarmCount / pooledNoSoundTrialCount`, or 0 without no-sound trials. */
  readonly pooledFalseAlarmRateFraction: number;
  /**
   * The visit limit the rate was judged against (Q1, decided by the owner's coordinator on
   * 2026-11-16, at the owner's request).
   */
  readonly visitFalseAlarmRateLimitFraction: number;
  /** Whether the rate is above it. Then every ear is unreliable and the visit should be repeated. */
  readonly visitFalseAlarmRateAboveLimit: boolean;
  /** Answers in rooms that scored nothing. */
  readonly ignoredAnswerCount: number;
}
```

### What each stage accepts

Every action not listed for a stage is ignored there. While a pause holds, only `resume` and `stop` act.

| Stage | Entered | Accepts | `canProceed` |
|---|---|---|---|
| `entry` | on creation; `backToFrontDoor` | `chooseVisit` | false |
| `calibration` | `chooseVisit`; after a device change | `startCalibration`, `louder`, `quieter`, `keepCalibration`, `stop`, `resume` | false (a kept setting moves on by itself) |
| `headphoneCheck` | a kept calibration | `playHeadphoneCheck`, `answerHeadphoneCheck`, `proceed`, `stop`, `resume` | after the judgement `correct` |
| `rules` | `proceed` from the first headphone check | `proceed`, `stop`, `resume` | true |
| `room` | `proceed` from `rules` or `betweenRooms`, or from `headphoneCheck` after a device change | `answer`, `pause`, `resume`, `stop` | false |
| `betweenRooms` | a room finished and another follows | `proceed`, `stop`, `resume` | true |
| `missedSoundReplay` | the last room finished | `proceed`, `stop` | true |
| `result` | `proceed` or `stop` in `missedSoundReplay`; `proceed` or `stop` in `swappedRepeat` | `chooseSwappedRepeat`, `backToFrontDoor`, `stop` | false |
| `swappedRepeat` | `chooseSwappedRepeat` | `proceed`, `stop` | true |
| `exit` | `stop` or a left page before the result; three refused plays | `backToFrontDoor` | false |
| `unsupported` | the device cannot carry the house | nothing | false |

### Which events may be shown at once

The flow holds back every fact about a trial until the trial is scored. Nothing it hands out needs holding back by the interface.

| What | Released | May be shown |
|---|---|---|
| A new snapshot (`subscribe`) | When the stage, the pause, the calibration, the headphone check or the finished rooms change. Never when a sound is scheduled, a window opens or a trial is scored as missed | At once |
| `roomStarted` | When a room run begins, before its first gap | At once |
| `trialScored` | In the same moment the trial is scored: at the answer, or at the end of its window. Never for a discarded trial | At once, as its `reaction` says: `ripple`, `noSoundLine`, or nothing |
| `roomFinished` | When the room's last trial has been scored | At once |
| Answers that scored nothing | Not released. They appear only in the visit log and the summary | At the result |
| A miss, a wrong side and a no-response | Released as `trialScored` with the reaction `none` | Not before the replay (product.md) |

The fields of a `trialScored` event for a missed sound hold its ear and level. The interface draws nothing for it. The missed-sound replay draws it later from the visit log.

## Config

### `src/config/visit-flow-config.ts`

```ts
export interface VisitFlowConfig {
  /**
   * Decided by the owner's coordinator on 2026-11-16, at the owner's request (visit-flow
   * design.md, D17 and Q1). A visit whose false alarm rate over the no-sound trials of all its
   * rooms is above this is marked unreliable as a whole. A strict limit: a rate exactly at it is
   * not above it.
   */
  readonly visitFalseAlarmRateUnreliableAboveFraction: number;
  /** After this many refusals in a row of one trial's sound, the visit ends (D25). */
  readonly refusedPlaysInARowMaxCount: number;
}

export const visitFlowConfig: VisitFlowConfig = deepFreeze({
  // D17, Q1: proposed by this spec from the measurement in design.md; decided by the owner's
  // coordinator on 2026-11-16, at the owner's request.
  visitFalseAlarmRateUnreliableAboveFraction: 0.2,
  // D25
  refusedPlaysInARowMaxCount: 3,
});
```

The test checks the two values, that every field name ends in a unit, that the object is deeply frozen, that the visit limit is above 0 and at most `hearingMethodConfig.falseAlarmRateUnreliableAboveFraction` (a visit limit above the room limit would mark only visits whose rooms are mostly marked already), and that the refusal count is a positive integer. A test named for Q1 checks the value 0.2 with a message saying that the value was decided by the owner's coordinator on 2026-11-16, at the owner's request, in Q1, and that the owner may reverse it.

No other number is added. Everything else the flow needs comes from `hearingMethodConfig` (the response window, the room frequencies, the swapped repeat difference, the per-room limit, the search's settings), `audioOutputConfig` (the scheduling lead) and `ghostSoundConfig` (the centre frequency of each sound). The new config did not go into the initial values table of `hearing-method.md`; that was a steering change for the owner (Q1). Since Q1 was decided, the owner's coordinator added its row on 2026-11-16, at the owner's request.

## The rooms of a visit

`visitRooms(visitType)` returns, for each frequency of `hearingMethodConfig.roomFrequenciesHz[visitType]` in that order, a frozen `VisitRoom` with its index, its frequency and the Ghost_Sound whose `ghostSoundConfig[id].centreHz` equals it. It throws a `RangeError` if a frequency matches no ghost sound or more than one. With the shipped config the quick visit is corridor, stairs, attic and the full visit cellar, corridor, nursery, stairs, attic: the visitor walks up the house (D18).

## Time and windows

All times are read with `timer.now()`. In the browser that is `performance.now()`, the clock of `event.timeStamp` and of the page time in the output shell's timestamp pair.

`soundWindowStartMs({ startMs, pair, presentedAtMs })`, for a scheduled sound:

```
converted = pair === null ? presentedAtMs + scheduleLeadMs
                          : pair.performanceMs + (startMs − pair.audioClockMs)
windowStart = max(presentedAtMs, converted)
```

`noSoundWindowStartMs({ presentedAtMs, latestOffsetMs })`:

```
windowStart = presentedAtMs + max(0, scheduleLeadMs + latestOffsetMs)
```

`latestOffsetMs` is `soundWindowStart − (presentedAt + scheduleLeadMs)` of the last scheduled sound of the visit, 0 before the first. So a no-sound window opens where a sound asked for at the same moment would have started, including the output delay the browser reports (D4). The response window is `[windowStart, windowStart + responseWindowMs)`.

`answerTimeMs(pressedAtMs, nowMs)` returns `pressedAtMs` when it is a finite number at most `nowMs`, and `nowMs` otherwise (R7.8, D33).

## The room runner (`room-runner.ts`)

`createRoomRunner(options)` runs one Room_Attempt. It is given the output shell, the timer, the threshold search for the attempt, the room, the attempt number, the sound random source, the log recorder, the latest offset holder, and callbacks for `scored`, `finished`, `pauseFromOutput` and `soundRefused`. It holds one of four states.

| State | Holds | Leaves on |
|---|---|---|
| `waitingGap` | the waiting trial and the gap timer | the gap timer; `pause`; `abandon` |
| `presented` | the trial, its presentation time, its window, the scheduled play if any, and the window-end timer | an answer in the window; the window-end timer; `pause`; `abandon` |
| `paused` | the waiting trial | `resume` |
| `finished` | nothing | nothing |

Step by step:

```
start() / resume():
  trial = search.current().trial          # the same trial as before a pause (R12.7)
  state = waitingGap; set a timer for trial.gapBeforeMs → present()

present():
  presentedAt = timer.now()
  if trial is a sound trial:
    outcome = output.play({ soundId: room.roomId, ear: trial.ear, levelDb: trial.levelDb,
                            purpose: "trial", random: soundRandom })
    if outcome is refused:
      if reason is "notRunning": pauseFromOutput(); return          # the stop report follows or came first
      record the refusal; refusalsInARow += 1
      if refusalsInARow >= refusedPlaysInARowMaxCount: soundRefused(); return
      state = waitingGap; set a timer for trial.gapBeforeMs → present(); return
    refusalsInARow = 0
    windowStart = soundWindowStartMs(outcome.startMs, output.timestampPair(), presentedAt)
    latestOffset = windowStart − (presentedAt + scheduleLeadMs)
  else:
    windowStart = noSoundWindowStartMs(presentedAt, latestOffset)
  windowEnd = windowStart + responseWindowMs
  state = presented; set a timer for windowEnd − timer.now() → score("none", null)
  call the test hook onTrialPresented, if one was given (D26)

answer(side, pressedAtMs):
  at = answerTimeMs(pressedAtMs, timer.now())
  if state is presented and windowStart <= at < windowEnd: score(side, at)
  else: record an ignored answer (side, at)

score(response, at):
  clear the window-end timer
  step = search.respond(response)
  entry = the scored log entry (response, outcome from the trial record, answeredAt, responseTime, scoredAt)
  scored(entry)                                      # the trialScored event, in this same call
  if step is finished: state = finished; finished(step.result)
  else: trial = step.trial; state = waitingGap; set a timer for trial.gapBeforeMs → present()

pause() / abandon():
  clear every timer
  if state is presented: record the trial as discarded at timer.now()
  state = paused (pause) or finished (abandon)
```

The outcome of a scored entry is the one the search's trial record gives, read from `step` (the room result's last record when finished) or classified with the engine's `classifyResponse`, which `src/session` may import. Either way the flow does not classify answers itself.

Three things follow from this order. A trial is in the log only once it was presented (and, for a sound, scheduled), so the log holds the played trials. The search sees one response per scored trial and nothing for a discarded one. And between `start` and `score` the runner calls nothing that reaches the interface: the only callback that leads to an event is `scored`.

## The stage machine (`create-visit-flow.ts`)

### Creation

```ts
export function createVisitFlow(
  options: VisitFlowOptions | VisitFlowTestOptions,
): VisitFlow;

/** For tests and, later, the robot spec. Never passed by src/ui. */
export type VisitFlowTestOptions = {
  readonly timer: Timer;
  readonly seed: number;
  /** Called when a trial's window is set, with what a listener needs to answer it. */
  readonly onTrialPresented?: (trial: PresentedTrial) => void;
} & ({ readonly backend: AudioBackend } | { readonly output: AudioOutput });
```

`VisitFlowTestOptions` lives in `create-visit-flow.ts`, and `PresentedTrial` is defined in `room-runner.ts` and re-exported from `create-visit-flow.ts`; neither is in the contract. `PresentedTrial` is `{ kind, ear | null, levelDb | null, windowStartMs, windowEndMs, roomIndex, attempt, trialNumber }` (D26).

Creation validates the seed with `createSeededRandom`, which throws the `RangeError` of R2.2. It builds the backend from the window (or takes the test's backend or output), the output shell, and one calibration controller for the life of the flow. The controller's random source is a forwarding source whose `next` draws from the current visit's sound source (D19). It registers one stop listener and one unsupported listener on the shell and one change listener on the controller. Nothing plays and no `AudioContext` exists until the first `chooseVisit`.

### Making sure sound runs

Every action that needs sound goes through `withSound(action)`:

```
withSound(continuation):
  kind = output.state().kind
  if kind is "unsupported": show unsupported; return
  if kind is "running": continuation(); return
  token = the current visit's token and stage
  output.activate().then(result => {             # activate makes its backend calls before returning
    if token no longer matches: return           # the visitor left, stopped or moved on meanwhile
    running     → activationRefused = false; continuation()
    refused     → activationRefused = true; notify
    unsupported → show unsupported
    stopped     → begin a pause with that reason
  })
```

`chooseVisit`, `startCalibration`, `playHeadphoneCheck`, `proceed` into a room and `resume` use it. Because `activate` is called synchronously inside the action, the action keeps the gesture (R2.5, audio-output D23).

### The visit's lifetime

`chooseVisit(visitType)` draws a visit seed from the flow's source, makes the visit's sources (D19), records the start time, sets the rooms with `visitRooms`, creates a fresh log recorder, moves to `calibration`, and calls `withSound` to start the output shell. Calibration repeats start only when the visitor presses `startCalibration`, after reading the instructions.

`keepCalibration()` calls the controller's `keep`. When kept, the recorder adds a `LoggedCalibration` with the kept setting and the Room_Top_Level of each ghost sound from the Range_Report, and the stage becomes `headphoneCheck`. When refused, the snapshot shows the reason and the controller's line.

`playHeadphoneCheck()` calls the shell's `playHeadphoneCheck` with the visit's sound source. Scheduled: `awaitingAnswer` becomes true. Refused: `playRefusal` holds the reason. `answerHeadphoneCheck(answer)` judges it with `judgeHeadphoneCheck`, records it, sets the judgement and its line from `headphoneCheckCopy.judgementLines`, and clears `awaitingAnswer`. The roomsLine is `roomsShortLine(count, rooms.length)`, where `count` is the number of the visit's rooms whose `roomSearchCapDb` is below `capRelativeToAnchorDb`.

`proceed()` from `headphoneCheck` (after `correct`) goes to `rules` the first time and straight to the room that was due after a device change. From `rules` and `betweenRooms` it starts the next room. Starting a room:

```
startRoom(roomIndex):
  if output.rangeReport() is null: go to calibration (again = true); return    # R6.5
  withSound(() => {
    output.beginRoom()                                                          # R6.1
    capDb = roomSearchCapDb(report.rooms[roomId].topLevelDb, hearingMethodConfig)
    engineSeed = draw from the visit's room seed source                         # D19
    search = createThresholdSearch({ settings: { ...hearingMethodConfig, capRelativeToAnchorDb: capDb },
                                     random: createSeededRandom(engineSeed) })
    record the attempt; stage = room; emit roomStarted; runner.start()
  })
```

When the runner finishes, the recorder closes the attempt with the room result (without its trial records) and the flow emits `roomFinished`. If rooms remain, the stage becomes `betweenRooms`. After the last room it calls `output.beginRoom()` and the stage becomes `missedSoundReplay` (R16.1).

`proceed()` from `missedSoundReplay` builds the summary with `summarizeVisit(log)` and shows `result`. `chooseSwappedRepeat(roomIndex)` shows `swappedRepeat` when that room's summary offers it, and `proceed()` there returns to `result`. `backToFrontDoor()` in `exit` or `result` drops the visit and shows `entry`.

### Pauses

| Cause | In stage | Effect |
|---|---|---|
| `pause()` | `room` | Pause `visitor`; the runner pauses (discarding a presented trial); `output.stopAll()` silences any sound that is still playing |
| Shell stop `hidden` or `interrupted` | `calibration` to `betweenRooms` | Pause with that reason; in `room`, the runner pauses |
| Shell stop `deviceChanged` | `calibration` to `betweenRooms` | Pause `deviceChanged` (or a holding pause takes that reason); in `room`, the runner abandons the attempt; the calibration is forgotten by the shell |
| Shell stop `pageLeft` | `calibration` to `betweenRooms` | `exit` with `pageLeft`; the visit is dropped |
| Shell stop `control` | any | Caused by the flow itself (pause, stop); nothing more |
| `play` refused `notRunning` | `room` | As a stop with the shell's stop reason, or `interrupted` if the shell gives none |

`resume()` calls `withSound`. When the shell runs, the pause ends and is recorded with its end time. Then:

- in `room` with a kept calibration, the runner resumes and presents the same waiting trial after its own gap (R12.7, D9);
- in `room` or `betweenRooms` with no kept calibration (after a device change), the stage becomes `calibration` with `again` true, and after the keep and a correct headphone check `proceed` starts a new attempt of the room that was due (R13.2, R13.3);
- in `calibration`, the calibration stays closed until `startCalibration`, which starts again at the bottom of the control, as the controller requires (audio-output D47);
- elsewhere the stage simply goes on.

Stops in `entry`, `missedSoundReplay`, `result`, `swappedRepeat`, `exit` and `unsupported` begin no pause. Nothing plays in those stages in this spec. The replay and swapped-repeat specs add their own handling.

### Stop

`stop()`:

| Stage | Effect |
|---|---|
| `calibration` to `betweenRooms` | `output.stopAll()`; every timer of the visit is cleared; the visit and its log are dropped; `exit` with `visitor` |
| `missedSoundReplay` | `output.stopAll()`; `result` |
| `result` | `output.stopAll()`; stays |
| `swappedRepeat` | `output.stopAll()`; `result` |
| `entry`, `exit`, `unsupported` | `output.stopAll()` when the shell has started; stays |

After a stop that leaves the house, nothing is scheduled until a new `chooseVisit` (R14.7). The visit token changes, so a pending activation or timer of the dropped visit does nothing (D35).

### Notifications

The flow keeps the parts of the snapshot in plain variables and builds a new frozen snapshot whenever one of them changes. After every action, timer callback or shell report it compares the parts it changed and, if any changed, first hands out the events made in that step and then calls the snapshot listeners once with the new snapshot (R11.4, R11.5). A scoring that changes no part of the snapshot, which is every scoring except a room's last, notifies no snapshot listener. Listeners are called with the same guard as the output shell's: every listener is called even if one throws, and the first error is thrown afterwards, after the flow's own state is consistent (R11.7).

## The visit log (`visit-log-recorder.ts`)

`createVisitLogRecorder({ visitType, visitSeed, rooms, startedAtMs })` keeps the lists of the Contract_File's `VisitLog` and offers one method per kind of entry: `calibrationKept`, `headphoneCheckAnswered`, `attemptStarted`, `attemptEnded`, `trialScored`, `trialDiscarded`, `answerIgnored`, `pauseStarted`, `pauseEnded`, `playRefused`. Each makes a frozen entry with times relative to `startedAtMs`, and `trialScored` and `trialDiscarded` give it the next `order`. `log()` returns a frozen `VisitLog` with copies of the lists. The flow calls `log()` only when it enters `missedSoundReplay`, at which point every attempt and every pause has ended (D28).

Entries hold only strings, finite numbers, booleans, null, arrays and plain objects, so `JSON.parse(JSON.stringify(log))` deep-equals the log (R10.7).

## The visit summary and the visit-level rule

### `judgeVisitFalseAlarms(roomResults, limitFraction)`

```ts
export function judgeVisitFalseAlarms(
  roomResults: readonly Pick<LoggedRoomResult, "noSoundTrialCount" | "falseAlarmCount">[],
  limitFraction: number,
): {
  readonly pooledNoSoundTrialCount: number;
  readonly pooledFalseAlarmCount: number;
  readonly pooledFalseAlarmRateFraction: number;   // 0 without no-sound trials
  readonly aboveLimit: boolean;                    // pooled > 0 and !atMostFraction(fa, ns, limit)
};
```

It sums the two counts and judges the pooled rate with the engine's `atMostFraction`, so a rate exactly at the limit counts as at or below it, as the engine treats its own limit (threshold-search D7, D29). It is pure, and both the flow and the measurement call it (R17.6).

### `summarizeVisit(log, settings = { ...hearingMethodConfig, ...visitFlowConfig })`

```
finished = the attempts with ending "finished", one per room (the last attempt of each room)
judged   = judgeVisitFalseAlarms(finished results, visitFalseAlarmRateUnreliableAboveFraction)
for each room in visit order, with its finished attempt A:
  levelDiffers = some scored sound trial of A has playedLevelDb ≠ requestedLevelDb
  for each ear:
    r       = A.result[ear]
    reasons = r.state == "unreliable" ? r.reasons : []
    if levelDiffers:          reasons += "levelNotAsAsked"
    if judged.aboveLimit:     reasons += "visitFalseAlarmRate"
    ear result = reasons empty ? r : unreliable with reasons and r's counts
  rightMinusLeftDb = both found ? right.thresholdDb − left.thresholdDb : null
  swappedRepeatOffered = rightMinusLeftDb ≠ null and |rightMinusLeftDb| ≥ swappedRepeatDifferenceDb
ignoredAnswerCount = log.ignoredAnswers.length
```

The order of reasons is the search's own (`trialLimit`, `inconsistentCatch`, `falseAlarmRate`), then `levelNotAsAsked`, then `visitFalseAlarmRate`. The rule only adds: an ear the search marked unreliable stays so with every reason it had (R17.4). Because a marked ear is no longer `found`, a marked visit offers no swapped repeat (R17.3). Nothing compares one floor with another (R18.5).

## Measurements

Made before this design, inline with `npx tsx --no-cache -e` at commit 125e13f, writing no file. Each visit plays 3 (quick) or 5 (full) rooms of the shipped engine. A listener keeps its parameters in every room of its visit, so one true threshold per ear stands for all pitches; this changes nothing about false alarms, which do not depend on pitch in the listener model. Each room draws its own engine and listener seeds. Ears are judged with `classifyAccuracy` (threshold-search D42). "With the rule" counts every ear of a marked visit as Flagged.

### What the rule removes from the D43 case

The listener of regression 4 (left 4.2 dB, right 14.7 dB, width 4.3 dB, lapse 0.062, false alarm 0.299, wrong side 0.006) and the D43 set (left 11.2 dB, the rest the same). 2000 quick and 1200 full visits each, from a source seeded with `listenerSetSeed(parameters)` XOR the number of rooms. A quick visit had a median of 21 or 22 pooled no-sound trials (fewest 11 and 13), a full visit 35 or 36 (fewest 25).

| Listener, visit | Visit limit | Visits marked | Accurate | Flagged | Wrong | Wrong removed |
|---|---|---|---|---|---|---|
| Regression 4, quick | none | 0 % | 15.3 % | 79.1 % | 5.57 % | |
| | 0.30 | 46.9 % | 11.0 % | 85.1 % | 3.94 % | 29 % |
| | 0.25 | 64.2 % | 8.0 % | 89.1 % | 2.92 % | 48 % |
| | **0.20** | 82.2 % | 4.5 % | 93.9 % | **1.60 %** | **71 %** |
| | 0.15 | 93.3 % | 2.0 % | 97.4 % | 0.64 % | 89 % |
| Regression 4, full | none | 0 % | 16.1 % | 78.7 % | 5.23 % | |
| | 0.30 | 48.5 % | 10.5 % | 86.1 % | 3.40 % | 35 % |
| | 0.25 | 72.0 % | 6.5 % | 91.3 % | 2.21 % | 58 % |
| | **0.20** | 88.5 % | 2.9 % | 96.0 % | **1.09 %** | **79 %** |
| | 0.15 | 96.9 % | 0.9 % | 98.8 % | 0.32 % | 94 % |
| D43 set, quick | none | 0 % | 13.2 % | 80.8 % | 5.95 % | |
| | 0.30 | 47.5 % | 9.4 % | 86.3 % | 4.29 % | 28 % |
| | 0.25 | 67.2 % | 6.7 % | 90.2 % | 3.14 % | 47 % |
| | **0.20** | 83.7 % | 3.6 % | 94.6 % | **1.78 %** | **70 %** |
| | 0.15 | 93.2 % | 1.7 % | 97.5 % | 0.81 % | 86 % |
| D43 set, full | none | 0 % | 13.5 % | 80.7 % | 5.79 % | |
| | 0.30 | 49.4 % | 8.7 % | 87.6 % | 3.69 % | 36 % |
| | 0.25 | 72.0 % | 5.3 % | 92.4 % | 2.28 % | 61 % |
| | **0.20** | 89.1 % | 2.2 % | 96.7 % | **1.02 %** | **82 %** |
| | 0.15 | 97.4 % | 0.6 % | 99.1 % | 0.28 % | 95 % |

Without a visit rule, this listener has about 5.2 to 6.0 percent of ears Wrong, the "about 6 percent" of the brief. Reusing the per-room value 0.30 as the visit limit removes about a third of them. 0.20 removes 70 to 82 percent.

### What the rule costs

Listeners drawn uniformly from the two ranges of threshold-search D17 with `drawListenerParameters`, one visit each: 2000 Attentive and 6000 Plausible listeners per visit type, from seeds 20261201 (quick) and 20261202 (full). The share of visits marked, by the listener's own false alarm rate. "A room marked" is the share of visits in which the per-room rule already marked at least one room.

Attentive_Range (false alarm rate at most 0.02): at 0.30, 0.25 and 0.20 no visit was marked, quick or full. At 0.15, 0.4 percent of quick and 0.1 percent of full visits were. A room was already marked in 2.5 percent of quick and 4.0 percent of full visits. Accurate, Flagged and Wrong stayed at 97.6, 2.4 and 0.01 percent (quick) and 97.4, 2.6 and 0.00 percent (full) for every limit from 0.20 up.

Plausible_Range, visits marked:

| Listener's false alarm rate | Visits (quick) | A room marked | 0.30 | 0.25 | **0.20** | 0.15 |
|---|---|---|---|---|---|---|
| 0 to 0.05 | 581 | 4.5 % | 0.0 % | 0.2 % | **0.2 %** | 1.9 % |
| 0.05 to 0.10 | 613 | 18.3 % | 1.1 % | 1.6 % | **5.5 %** | 14.2 % |
| 0.10 to 0.15 | 600 | 32.8 % | 2.8 % | 6.7 % | **15.8 %** | 36.0 % |
| 0.15 to 0.20 | 647 | 53.8 % | 11.0 % | 19.8 % | **37.1 %** | 60.0 % |
| 0.20 to 0.25 | 616 | 64.8 % | 19.2 % | 33.4 % | **53.4 %** | 74.0 % |
| 0.25 to 0.30 | 567 | 77.6 % | 36.9 % | 54.3 % | **71.6 %** | 86.9 % |
| 0.30 to 0.50 | 2376 | 95.1 % | 77.9 % | 87.1 % | **94.4 %** | 97.8 % |

| Listener's false alarm rate | Visits (full) | A room marked | 0.30 | 0.25 | **0.20** | 0.15 |
|---|---|---|---|---|---|---|
| 0 to 0.05 | 583 | 5.8 % | 0.0 % | 0.0 % | **0.0 %** | 0.5 % |
| 0.05 to 0.10 | 620 | 27.6 % | 0.3 % | 0.3 % | **1.5 %** | 9.7 % |
| 0.10 to 0.15 | 595 | 48.4 % | 1.0 % | 3.5 % | **11.1 %** | 35.5 % |
| 0.15 to 0.20 | 601 | 69.9 % | 6.8 % | 15.5 % | **32.8 %** | 62.4 % |
| 0.20 to 0.25 | 623 | 83.3 % | 16.2 % | 34.8 % | **57.8 %** | 81.1 % |
| 0.25 to 0.30 | 608 | 93.6 % | 38.0 % | 57.7 % | **80.3 %** | 94.1 % |
| 0.30 to 0.50 | 2370 | 99.3 % | 82.9 % | 92.8 % | **97.7 %** | 99.7 % |

Over the whole Plausible population, Accurate, Flagged and Wrong were:

| Visit limit | Quick | Full |
|---|---|---|
| none | 44.9 / 53.1 / 2.00 % | 44.2 / 53.7 / 2.15 % |
| 0.30 | 39.4 / 59.3 / 1.27 % | 38.2 / 60.7 / 1.16 % |
| 0.25 | 36.7 / 62.3 / 1.04 % | 35.2 / 64.0 / 0.83 % |
| **0.20** | 32.4 / 66.9 / 0.72 % | 31.1 / 68.3 / 0.59 % |
| 0.15 | 26.4 / 73.1 / 0.49 % | 25.2 / 74.5 / 0.34 % |

The CP2 and CP3 measures of the threshold search, played as whole visits (the 100 Plausible sets of seed 20261116 and the 50 Attentive sets of seed 20261117, 134 quick or 80 full visits per set): no set fell below its limit at any visit limit, or without one. The lowest Plausible set had 94.3 percent Accurate or Flagged in quick visits without a rule and 97.3 percent at 0.20. The lowest Attentive set had 92.0 percent Accurate in quick visits at every limit from 0.20 up, and 91.7 percent at 0.15. These draws did not include the D43 set, which is why its own rows above are the measure of the case.

### How long the rooms take

Rooms of the shipped engine, timed with the steering's gaps and window, the 50 ms scheduling lead, an assumed 700 ms to answer a caught sound or a false alarm, and the full 2000 ms window otherwise. 3000 listeners per range, five rooms each, seed 20261203. Calibration, the headphone check, the rules, rests between rooms and the replay are not included.

| Range | Trials per room, median (90th percentile) | One room | Rooms of a quick visit | Rooms of a full visit |
|---|---|---|---|---|
| Attentive | 23 (30) | 100 s (134 s) | 5.1 min (6.3 min) | 8.4 min (10.4 min) |
| Plausible | 30 (42) | 126 s (175 s) | 6.4 min (7.9 min) | 10.6 min (12.9 min) |

The rooms alone take longer than the 3 and 7 minutes the product promises. This spec changes no timing and says so in Q3.

## Error handling

| Situation | Behaviour |
|---|---|
| A seed that is not a whole number from 0 to 2³² − 1 | `createVisitFlow` throws a `RangeError` |
| An action in a stage that does not accept it, or while a pause holds | Ignored; nothing changes (R3.6, R12.5) |
| `activate` refused for want of a gesture | `activationRefused` in the snapshot; the next action that needs sound tries again |
| `activate` or the shell reports an unsupported device | `unsupported`, for the life of the page |
| `keepCalibration` refused | The reason in `keepRefusal`, the controller's line; the stage stays |
| `playHeadphoneCheck` refused | The reason in `playRefusal`; the visitor may press again |
| A trial's sound refused (`busy`, `peakBoundNotMet`, `renderFailed`, a preparation refusal) | Logged; the same trial again after its gap; after three in a row, `exit` with `soundRefused` (D25) |
| A trial's sound refused `notRunning` | A pause with the shell's stop reason (R21.3) |
| A clamped trial sound (should never happen: CP6) | Played and scored; logged with both levels and the limit; that floor's ears are `unreliable` with `levelNotAsAsked` (D23) |
| A `pressedAtMs` that is missing, not finite or in the future | The timer's time is used (D33) |
| A timer callback or an activation of a dropped visit | Does nothing: the visit token no longer matches (D35) |
| A listener throws | Every other listener is still called; the first error is thrown afterwards; the flow's state is already consistent (R11.7) |
| The threshold search throws (a bug) | The error is not caught: a broken search must show in tests, not be hidden |

## Correctness properties

"Universal" properties use fast-check with a new random seed on every run. They run whole visits through the Visit_Harness (D26). "Statistical" properties use the fixed seeds and limits stated. The brief's two properties are CP1 with CP2, and CP3.

A **visitor script** (`visit-flow-arbitraries.ts`) is drawn as: a flow seed; a visit type; a calibration target on the control's grid from the Keep_Minimum (−40) to the top (−4); a first headphone check answer (any of the four; anything but `left` is followed by `left`); a listener: Psychometric_Listener parameters from the Plausible or the Attentive range, one of the five Extreme_Listeners, or a `fc.func` of the trial's kind, ear, level and position; an answer delay for each trial from 0 to `responseWindowMs + 500` ms after its Window_Start, so that some answers fall after the window; a time stamp mode for each answer (the timer's time, 0 to 300 ms earlier, missing, NaN, or 1000 ms in the future); extra presses at random times and sides; up to four disturbances at random times, each one of `pause()`, a shell `hidden`, `interrupted` or `deviceChanged` event, each followed by `resume()` after 0 to 10 s; at most one ending disturbance, `stop()` or a `pageLeft` event; and a rest from 0 to 30 s before each `proceed`. The Simulated_Visitor answers each presented trial from the listener, as the Visit_Harness reports it through `onTrialPresented`.

**CP1. Every visit ends** (Universal, 50 runs; R22.4, R6, R10.3 of threshold-search; brief property 1). For any visitor script, the visit reaches `result`, or `exit` when the script has an ending disturbance before the result, and it does so within the time budget `T = Σ visitor rests and pause durations + calibrations × 60 × (1500 + calibrationRepeatGapMs) + attempts × roomTrialLimitCount × (gapBetweenTrialsMaxMs + scheduleLeadMs + responseWindowMs)`, where `attempts` is the number of rooms plus the number of device changes. An `exit` is reached in the same step as its disturbance.

**CP2. The log holds exactly the played trials, in order** (Universal, 50 runs; R10.1, R10.2, R7.11, R12.3, R12.4; brief property 1). For any visitor script that reaches `result`:
- the trials of the log, in order, are the trials the harness saw presented, one for one, with the same room, attempt, trial number, kind, ear, requested level and Window_Start;
- `order` runs from 1 without a gap, and `presentedAtMs` never decreases;
- the sound trials of the log are, one for one and in order, the backend's `schedule` calls made in the `room` stage; in each, the channel of the trial's ear holds a sample that is not zero and every sample of the other channel is `+0`;
- no `schedule` call is made between a no-sound trial's presentation and its scoring or discarding;
- a trial is `discarded` exactly when a pause or a device change came after its presentation and before its scoring.

**CP3. Nothing about a trial before it is scored** (Universal, 50 runs; R9.1, R9.4, R9.5, R11.2, R11.3, R8.3; brief property 2). For any visitor script, with every snapshot notification and event recorded with its timer time and with whether it happened inside an action call or a shell stop report:
- every `trialScored` event is handed out at the timer time of its trial's `scoredAtMs`, which is at or after its Window_Start;
- between two consecutive scorings in a room run, and between a room run's start and its first scoring, no event is handed out and no subscriber is notified, except inside an action call or a stop report;
- in the same intervals, `snapshot()` read at the presentation time and at three random instants deep-equals `snapshot()` read just after the interval began, unless an action or a stop report came between;
- no event but `trialScored` holds a field of a trial, and no event holds a field of a trial that is not yet scored;
- answers that score nothing change neither the snapshot nor anything handed out.

**CP4. Answers count against their windows** (Universal, 50 runs; R7.6 to R7.8, R8.1, R8.2, R10.4). For any visitor script, with every answer the harness gave recorded with its time stamp and the time it was given: each scored trial with an answer has as its response the side of the first given answer whose answer time lies in `[windowStart, windowStart + responseWindowMs)`, and `responseTimeMs = answeredAtMs − windowStartMs`; each scored trial without one had no such answer and was scored at `windowStart + responseWindowMs`, as `missed` or `noResponse`; every other answer given in the `room` stage while no pause held is in `ignoredAnswers` with its time and side, and nothing else is.

**CP5. The log replays through the engine** (Universal, 50 runs; R7.9, R6.2, R13.3, R19.2). For any visitor script that reaches `result`, for every finished room attempt: a new threshold search created with the attempt's `engineSeed` and `hearingMethodConfig` with `capRelativeToAnchorDb = searchCapDb`, given the responses of the attempt's scored trials in order, asks for trials whose numbers, kinds, ears, levels and gaps equal those trials; each discarded trial equals the next scored trial of its attempt with the same trial number; and the search's room result, without its records, equals the attempt's `result`. For an abandoned attempt the same holds for its scored trials, and the search has not finished.

**CP6. Rooms start as the output stage requires** (Universal, 50 runs; R2.5, R3.2, R6.1, R6.2, R10.3, R13.2, R16.1; audio-output "What the visit-flow spec must do"). For any visitor script, with the harness's spy around the output shell:
- `activate` is called only inside actions;
- no ghost sound is played before a calibration is kept and a headphone check is answered `left` after it, and none after a `deviceChanged` stop until both have happened again;
- `beginRoom` is called after the last sound of the previous stage and before the first trial of every room attempt, and once more before `missedSoundReplay`;
- every play in a room has the Purpose `trial`, the room's sound, and the trial's ear and level; its outcome has no clamp limit and its played level equals the request;
- each attempt's `searchCapDb` equals `roomSearchCapDb` of the room's top in the calibration it used, and that calibration is the one kept last before the attempt began.

**CP7. Pauses discard and repeat** (Universal, 50 runs; R12.3 to R12.7, R13.1 to R13.3, R21.3). For any visitor script: while a pause holds, nothing is scheduled; after a pause in a room with the calibration still kept, the next presentation is the same trial (number, kind, ear, level) as the one waiting when the pause began; after a device change in a room, the attempt is `abandoned`, the next room trial is the first of a new attempt of the same room, and it comes only after a new calibration and a `correct` headphone check; the rules stage is shown once.

**CP8. Stop leaves nothing** (Universal, 100 runs; R14). For any visitor script with an ending disturbance before the result: right after it the stage is `exit` with reason `visitor` or `pageLeft`; `stopAll` was called (for `stop`); the exit snapshot holds no log and no summary; advancing the clocks by 10 minutes afterwards schedules nothing, hands out no event and notifies no subscriber; and `backToFrontDoor` shows `entry`, from which a new visit starts with a new visit seed. For `stop` in `missedSoundReplay` and `swappedRepeat` the stage becomes `result`.

**CP9. The summary follows the log, and the visit rule only adds** (Universal; 50 visit runs and 300 runs over arbitrary room results; R17, R18). For any visit that reaches `result`, the snapshot's summary equals `summarizeVisit` of its log. For any list of 1 to 5 logged room results with any states, reasons and counts (no-sound trials from 1 to 13, false alarms from 0 to that), and any limit from 0.05 to 0.30:
- `aboveLimit` holds exactly when the pooled count is not `atMostFraction` of the limit;
- when it holds, every ear is `unreliable` and its reasons end with `visitFalseAlarmRate`, after the search's reasons in their order; no room offers the swapped repeat;
- when it does not hold, every ear is the search's result unchanged (without `levelNotAsAsked`);
- no ear that was `unreliable` loses the state or a reason;
- a room offers the swapped repeat exactly when both ears are `found` and they differ by at least `swappedRepeatDifferenceDb`, and `rightMinusLeftDb` is right minus left.

**CP10. Same seed, same visit** (Universal, 50 runs; R19.3). For any visitor script played twice on fresh harnesses, the two runs give deep-equal logs, the same sequence of snapshots and the same sequence of events.

**CP11. What the visit rule removes and costs** (Statistical; R23.4). With the shipped Visit_Limit and the seeds of "Measurements": for the listener of regression 4 and the D43 set, over 2000 quick and 1200 full visits each, the share of Wrong ears with the rule is at most half the share without it; over 2000 Attentive quick visits and 2000 Attentive full visits, at most 0.5 percent of visits are marked. The measured values are 70 to 82 percent removed and 0 percent marked, so the limits have a wide margin. These limits describe the proposed value 0.2. If the owner chooses another value in Q1, CP11's limits are restated from the table in "Measurements" in the same commit.

The other checks are examples: each pure helper, the config values, the room runner's states with the manual timer, each row of the stage table, the pause table and the stop table in `create-visit-flow.test.ts`, the recorder's JSON round trip, and the done-when visits of R22.3.

## Testing strategy

### The Visit_Harness (`tests/properties/visit-flow-harness.ts`)

The harness builds a fake backend at 22050 Hz with `performanceOffsetMs` P, a manual timer starting at P, and a visit flow with `{ backend | output, timer, seed, onTrialPresented }`. P is drawn per run from 0 to 10⁶ ms so that no code may assume the two clocks are equal. `advance(ms)` moves the backend's audio clock and the timer together, as `output-shell-harness.ts` does, and after each step awaits a resolved promise so that activations settle. With `output` the harness wraps a real shell in a spy that records `activate`, `beginRoom`, `play` with its outcome, `playHeadphoneCheck`, `stopAll` and `keepCalibration`, in order, with timer times and the stage at the time.

The property files and the done-when test replace the synth's `soundRenderers` with the worst-case renderers of `tests/properties/worst-case-renderers.ts` through `vi.mock`, as the shell's own properties do (audio-output D43): constant buffers of 60 to 300 ms whose peak is at the Peak_Bound. They are the hardest buffers for "no clamp", and make a visit cost milliseconds instead of seconds.

The harness drives time by events: it keeps the visitor's next planned action and advances to whichever comes first, that action or the timer's next due callback, so that answers land at exact times inside or outside windows.

### The Simulated_Visitor (`tests/listeners/simulated-visitor.ts`)

It takes a visit flow driver (the harness's `advance`, `snapshot`, actions and presented-trial hook) and a visitor script, and plays the visit: at `entry` it chooses the visit type; at `calibration` it starts the hiss and presses `louder` after each repeat until the played setting reaches its target, then keeps; at `headphoneCheck` it plays the check and answers; at `rules`, `betweenRooms`, `missedSoundReplay` it proceeds after its rest; in a room it gives each presented trial to its listener as a `ListenerTrial` and, unless the listener answers `none`, calls `answer` at the planned delay; it applies the script's disturbances and resumes. It imports the listener types and listeners of `tests/listeners/`, and only the contract and test options of the flow. Its unit test plays one quick visit with a Step_Listener and checks that every caught trial is a sound at or above its threshold.

### The measurement (`tests/listeners/visit-rule-measurement.ts`)

`measureVisitFalseAlarmRule({ listener or range, visitType, visitCount, seed, limits })` plays whole visits room by room through `createThresholdSearch` with the shipped settings, as in "Measurements", judges every ear with `classifyAccuracy`, applies `judgeVisitFalseAlarms` from `src/session` at each limit, and returns the counts. `print-visit-rule-measurement.ts` runs it for the cases of R23.2 and prints the tables of "Measurements". It is run with `npx tsx tests/listeners/print-visit-rule-measurement.ts`, needs no `package.json` script (D30), and writes no file. CP11 calls the same function. Going through the engine and not the flow is enough here because CP5 shows that the flow gives the engine exactly the answers of the log, and CP9 that the summary applies the same rule to the same results.

### Run counts and time

Universal properties run 50 visits each (CP8 100, CP9 300 runs of the pure part). With worst-case renders a visit takes a few milliseconds per trial. The spec's property files must stay under 60 seconds together on the project machine; if they do not, their counts are halved and the times are recorded as a decision, as the audio-output spec did (its D28).

Note of 2026-11-15, the times of tasks 10 and 11. Task 10 asked for these in a commit message body, but commit messages here are one line, so they are written down here instead. Three runs of `npm test` on 2026-11-15, with every file of this spec present, gave these times per property file, in ms:

| File | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| CP1 | 2645 | 2710 | 2341 |
| CP2 | 4834 | 4959 | 5652 |
| CP3 | 3302 | 2709 | 2675 |
| CP4 | 3089 | 3039 | 2637 |
| CP5 | 4300 | 4510 | 4503 |
| CP6 | 2614 | 3240 | 3196 |
| CP7 | 2966 | 2606 | 2612 |
| CP8 | 7521 | 8754 | 8051 |
| CP9 | 4272 | 3958 | 4630 |
| CP10 | 6282 | 6274 | 6736 |
| CP11 | 1348 | 1506 | 1479 |
| Together | 43174 | 44264 | 44511 |

Each total is the one recorded for that run. It differs by 1 ms from the sum of the figures above, which are rounded. Every run was under the 60 second budget, so no count was halved.

### How the property files read the design

The property files of tasks 10 and 11 read the design in these particular ways.

- **The timeline helper.** `tests/properties/visit-flow-timeline.ts`, which "Files" does not list, holds `observeVisit`. It wraps the harness's driver and puts every action, stop report, snapshot notification, event and presented trial of a visit in one ordered list. Each entry has its timer time, its cause, and the lengths of the harness's output-call and schedule lists at that moment. An action or stop report also has the snapshot before and after it. CP1, CP2, CP3, CP4, CP6, CP7 and CP8 use it to ask what came before what. It changes nothing in the harness. It also gives `stopAt`, which stops the clocks at a chosen time on their way to a later one, for CP3's random readings.
- **CP1, the budget.** The visit runs from the first `chooseVisit` that leaves `entry` to the last snapshot notification. The visitor's waits are all the time during which the snapshot showed a pause or `canProceed`, which covers the rests before each `proceed` and the pauses. The calibrations are the `startCalibration` actions given in `calibration` while no pause held. Each calibration is allowed 60 repeats of `ghostSoundConfig.calibration.durationMs` (the 1500 of the formula) plus `calibrationRepeatGapMs`. The room attempts are the visit type's rooms plus every `deviceChanged` stop report, whether or not it came in a room. Each attempt is allowed `roomTrialLimitCount` from `roomLimits(hearingMethodConfig)` trials of `gapBetweenTrialsMaxMs + scheduleLeadMs + responseWindowMs`.
- **CP3, the snapshot readings.** A stretch begins at each `roomStarted` and `trialScored` event and ends at the next event. The snapshot is read at each presentation and at three instants drawn from 0 to one longest gap, lead and window after the stretch began. A reading is compared with the stretch's first snapshot unless an action other than `answer`, or a stop report, came in the stretch. Answers do not void the comparison, so answers that decide nothing are checked here as well.
- **CP4, the answers that count.** An answer is matched against a trial's window only if it was given while that trial waited for its decision, from its presentation to its decision, in `room` with no pause. An answer given after the window had closed, with a time stamp inside the window, comes too late to decide the trial, and CP4 expects it among the ignored answers. This reads "the trial waiting to be Scored" of R7.6 literally. The design's own sentence for CP4 does not say it.
- **CP6, what the spy sees.** The harness's spy records the flow's calls to the output shell, but not the calibration repeats, which the calibration controller plays. "`beginRoom` after the last sound of the previous stage" is therefore checked against trial plays and headphone check plays: among those calls and `beginRoom`, the last one before each `roomStarted` and before the first `missedSoundReplay` snapshot is a `beginRoom`. That is enough because every calibration is followed by a headphone check. A ghost sound counts as allowed after a kept calibration and a later `answerHeadphoneCheck` that was awaited and gave `correct`.
- **CP7, order and not time.** "While a pause holds, nothing is scheduled" is checked by order in the timeline: a `schedule` call falls in a pause if it comes after the snapshot that showed the pause and before the snapshot that ended it. For a visit that reaches the result, CP7 also checks by time that no `schedule` call lies strictly inside a logged pause. The trial after a pause in a room must have the same room, attempt and trial number as the one the search was waiting on. When that trial had been presented and not decided, its kind, ear and level must match too.
- **CP8, the endings and the new visit seed.** Every script in CP8 has an ending, the stop control or a left page, drawn from 0 to 15 minutes (`scriptSpanMs`) after the visit was chosen. An ending before the result must lead to `exit`. A stop that falls in `missedSoundReplay` must lead to `result`, and an ending drawn for a time after the visit has reached the result is never given, because the simulated visitor stops there. At the result, CP8 also checks that `stop` stays on `result`, and that `stop` in `swappedRepeat` returns to it when a room offers the repeat. After an exit, CP8 goes back to the front door and plays a short quick visit to the result. That visit's `visitSeed` must be the second draw `floor(u × 2³²)` from a source seeded with the flow's seed, and must differ from the first draw (D19).
- **CP10, more than the design names.** Besides the logs, the snapshot sequences and the event sequences, CP10 compares the two runs' presented trials, actions and `schedule` calls, and the simulated visitor's record of each run.

### Counterexamples

A counterexample becomes a named case in `tests/properties/visit-flow-regressions.test.ts`, `regression <n>: <what went wrong> (<property>, seed <s>)`, with the visitor script written out, first with `it.fails`, then turned into `it` by the commit that changes the code, as the earlier specs do. A case that could only be removed by changing a steering value or the visit limit (Q1) stays an expected break with a decision giving the numbers.

Regression 1 was found by CP7 in task 13, with fast-check seed -1594251289. In the third room of a quick visit a device change abandoned attempt 1. A second device change came 0.4 ms after attempt 2 started and before it presented a trial, so the flow abandoned attempt 2 as well and ran attempt 3, as R13.3 asks for every device change during a Room_Attempt. CP7's check kept the first device change's pause open until the next presented trial, so it did not count attempt 2 as stopped and expected the first trial of attempt 2. The fault was in the property file, not in the flow, and nothing under `src/` changed. The case `regression 1: a second device change after a new attempt of a room starts and before its first trial (CP7, seed -1594251289)` plays the visit without fast-check, with a fixed listener and the second device change at 288 000 ms, and checks that the two device changes fell in that order before it checks CP7's condition. Commit bc369e2 kept it as `it.fails` and moved CP7's check for one visit into `tests/properties/visit-flow-cp7-check.ts`, unchanged. Commit 0427136 corrected the check: when a pause begins in a new run of the room after a device change and before that run's first trial, the check makes sure that the run is the next attempt of the same room, and then treats the pause as one in that run, so a device change there counts that run as abandoned too.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | Task 1; `visit-flow-types.test.ts`; `npm run typecheck`; review of the contract against "Interface contract" |
| R2 | `create-visit-flow.test.ts` (creation, seed, entry, gesture call order, `activationRefused`); `visit-rooms.test.ts`; CP6 |
| R3 | `create-visit-flow.test.ts` (stage table); CP6; CP7 |
| R4, R5 | `create-visit-flow.test.ts`; CP6 |
| R6 | CP5, CP6; `create-visit-flow.test.ts` |
| R7 | `room-runner.test.ts`; `window-start.test.ts`; `answer-time.test.ts`; CP2, CP4, CP5 |
| R8 | CP3, CP4; `room-runner.test.ts` |
| R9 | CP3; `create-visit-flow.test.ts` (reactions) |
| R10 | CP2, CP4, CP5; `visit-log-recorder.test.ts` |
| R11 | CP3, CP10; `create-visit-flow.test.ts` (notification order, frozen values, throwing listener) |
| R12 | CP7; `room-runner.test.ts`; `create-visit-flow.test.ts` (pause table) |
| R13 | CP6, CP7 |
| R14 | CP8; `create-visit-flow.test.ts` (stop table) |
| R15 | `create-visit-flow.test.ts` with fake backends that are unsupported |
| R16 | `create-visit-flow.test.ts`; CP6 (`beginRoom` before the replay stage) |
| R17 | `judge-visit-false-alarms.test.ts`; CP9; CP11; `visit-flow-config.test.ts` |
| R18 | `summarize-visit.test.ts`; CP9 |
| R19 | `npm run lint`; CP10 |
| R20 | `visit-flow-config.test.ts`; review in the final task |
| R21 | `room-runner.test.ts` with an output that refuses |
| R22 | The property files; `visit-flow-simulated-visits.test.ts`; the regression file |
| R23 | `print-visit-rule-measurement.ts`; CP11; D36 |
| R24 | The final task's `git status` and search |

## How the design serves the steering

| Rule | How |
|---|---|
| audio-safety 1, one output path | The flow plays only through the output shell, by Sound_Id. It names no Web Audio type; the lint rules for `src/session` forbid sound APIs |
| audio-safety 2, the hard cap | Each room's search gets the room top on the level grid as its cap, so the shell never needs to clamp a trial (CP6). If it ever did, the played level is logged and the floor is not shown as a number (D23) |
| audio-safety 3, fades | All fades are the shell's. The flow never cuts a sound itself; a pause or a stop goes through `stopAll`, which fades |
| audio-safety 4, no jumps upward | `beginRoom` at every room attempt and before the replay. The search rises one step at most per ear. A trial repeated after a pause is the same level as the one discarded, so it cannot rise |
| audio-safety 5, silent means silent | Every trial sound is one ear (the shell refuses `both` for ghost sounds). Nothing is scheduled during a no-sound trial (CP2) |
| audio-safety 6, short sounds | The shell's |
| audio-safety 7, the visitor stays in control | `stop` acts in every stage and silences at once; `pause` in rooms; a hidden page, an interruption or a device change pauses the visit, and leaving the page leaves the house |
| audio-safety 8, the volume keys | The kept-calibration line is the calibration copy's, shown on the headphone check sheet by the interface. Nothing in the flow suggests raising the volume |
| audio-safety 9, no jump scares | The flow adds no sound and no visual |
| product, nothing reveals the sound before the answer | The room snapshot holds nothing about the trial; nothing is handed out between two scorings except on the visitor's own actions; the only trial event is created at scoring (CP3) |
| product, ripples labelled with pitch and level | `trialScored` with `ripple` carries the room's pitch and the played level |
| product, claims | The flow claims nothing. The summary keeps floors apart and adds a visit-level reason; the result page words it |
| hearing-method, false alarm rate above the limit marks the visit | The per-room rule stays; the visit rule pools the rooms, with a limit the owner chooses (Q1) |
| hearing-method, the four end states | Unchanged from the search; this spec only adds reasons to `unreliable` |
| structure | One exported function per file; `Db`, `Ms`, `Count`, `Fraction` endings; `left` and `right`; numbers in `src/config`; no strings added (D16) |
| tech | Static; no storage written (D15); gesture kept by synchronous `activate`; time and randomness injected |
| wording | No visitor-facing string is added. Commit messages and READMEs avoid the banned words (D30) |

No number or rule from a steering file is changed or loosened by this spec.

## Questions for the project owner

None of these was decided by this spec. The first is a new acceptance number that this spec proposed and did not treat as approved. All four were decided by the owner's coordinator on 2026-11-16, at the owner's request, and the owner may reverse each of them; the decision follows the heading of each question.

**Q1. The limit of the visit-level false alarm rule. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: 0.20, the value in the config.** The config holds `visitFalseAlarmRateUnreliableAboveFraction` at the proposed value 0.2. A visit whose false alarms over the no-sound trials of all its rooms are above it is marked unreliable as a whole: every ear of every floor is shown as unreliable and the visitor is invited to repeat the visit. The per-room limit of 30 percent stays as it is. The measurement to choose from is in "Measurements", and `npx tsx tests/listeners/print-visit-rule-measurement.ts` prints it again. The numbers of that script's run in task 5, and the four printed figures in which they differ from "Measurements", are in D36. In short:

| Visit limit | Wrong ears of the regression 4 listener removed (quick / full) | Attentive visits marked | Plausible visits marked, listeners with false alarm rate 0.05 to 0.10 (quick / full) |
|---|---|---|---|
| 0.30, the per-room value reused | 29 % / 35 % | 0 % | 1.1 % / 0.3 % |
| 0.25 | 48 % / 58 % | 0 % | 1.6 % / 0.3 % |
| **0.20, proposed** | **71 % / 79 %** | **0 %** | **5.5 % / 1.5 %** |
| 0.15 | 89 % / 94 % | 0.4 % / 0.1 % | 14.2 % / 9.7 % |

0.20 is proposed because it removes most of the case the brief names at no measured cost to attentive listeners, and it marks few visits of listeners who answer silence one time in ten or less. The owner may choose another value; then CP11's limits are restated from the table. Once chosen, adding a row to the initial values table of `hearing-method.md` is a steering change for the owner: "False alarm rate over a whole visit that marks the visit unreliable". The current row "False alarm rate that marks a visit unreliable | above 30 percent" is applied per room by the engine (threshold-search D7) and is called the per-room limit by the brief, and the owner may want to reword it to say so. Done on 2026-11-16 by the owner's coordinator, at the owner's request: the table has the row "False alarm rate over a whole visit that marks the visit unreliable | above 20 percent", and the per-room row now reads "False alarm rate that marks a visit unreliable, applied to each room | above 30 percent". No number changed.

**Q2. Constant pressing. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: no rule for ignored answers.** Reason: no measured case that the false alarm rules miss. Answers outside every window are counted, logged and given in the summary, but no rule uses them. A visitor who presses steadily, about once a second or faster, answers every no-sound window, so the per-room and the visit rule already mark the visit. A visitor who presses less often answers some windows and is caught by the false alarm rate in proportion. Should a count of ignored answers mark a visit as well? It would need a new limit, which this spec does not propose, because no measurement here shows a case the false alarm rules miss.

**Q3. The length of the visits. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: name the visits by what they take, and change no timing.** With the steering's gaps (1.5 to 4.0 s) and window (2.0 s) and the engine's rooms, the rooms alone take a median of 5.1 minutes in a quick visit and 8.4 minutes in a full visit for attentive simulated listeners, and 6.4 and 10.6 minutes over the plausible range ("Measurements"). The product and the front door promise 3 and 7 minutes. This spec changes no timing. Options for the owner: name the visits by what they take; shorten the gaps or the window (steering values); lower the trial limit (a steering value, with the threshold-search properties to run again); or keep everything and accept the gap.

How the two lengths were found, from figures this spec and the replay already print and with no new measurement:

- The rooms alone, median over the plausible range ("How long the rooms take", from `tests/listeners`): 6.4 minutes for a quick visit and 10.6 minutes for a full one.
- The missed-sound replay, median length with 20 sounds and a gap of 400 ms (missed-sound-replay design.md, "Measurements", plausible range): 30.2 seconds in a quick visit and 30.5 seconds in a full one, about half a minute.
- Quick: 6.4 + 0.50 = 6.9 minutes, rounded up to a whole minute: 7 minutes. Full: 10.6 + 0.51 = 11.1 minutes, rounded up: 12 minutes.

The front door's buttons say "Enter for about 7 minutes" and "Enter for about 12 minutes" (`src/copy/front-door-copy.ts`), and `product.md` and the comment of `VisitType` in `src/config/hearing-method-config.ts` call them the visit of about 7 minutes and the visit of about 12 minutes. No timing changed. The figures leave out calibration, the headphone check, the rules, the rests between rooms, the last door of the full visit and the swapped repeat, so a visit can take longer than its label.

**Q4. A device change mid-room. Decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it: D12 is kept as designed, so a device change calibrates again and starts the interrupted room again.** The design calibrates again and starts the interrupted room from its beginning, keeping the floors already finished, which were measured against the earlier calibration (D12). Floors are never compared, so each floor stays sound on its own. If the owner prefers that a device change ends the visit, the change is small: `deviceChanged` in a room would lead to `exit`.

## Decisions

Each point below was open in the brief, the steering, the earlier specs or the code, and was settled here without being able to ask.

**D1. The contract is one file of types, and it only grows.** The interface is built by hand while the flow is written, so it needs something fixed to build against. One file with every type the interface may call or read, written first and with no behaviour, gives that. Types the engine and the output stage already define are re-exported, not copied, so they cannot drift; types that change meaning in the visit (an ear result after the visit rule) are new types with new names. Later specs add fields, stages, event kinds and methods; they never remove or rename. The interface ignores an event kind or a stage it does not know. `VisitLog.formatVersion` rises only if a field changes meaning, which this rule forbids for the contract but which storage may still need someday.

**D2. One flow for the life of the page, one output shell, one visit at a time.** The output shell creates one `AudioContext` and the Web Audio backend registers page listeners for the life of the page. A flow per visit would leave contexts and listeners behind, and browsers limit how many contexts a page may hold. So the flow is created once, and `backToFrontDoor` starts the next visit inside it, with a new visit seed drawn from the flow's source.

**D3. An answer is scored by its own time stamp, against a half-open window.** The brief says to score the first answer inside the window. The interface passes `event.timeStamp`, which is on the page clock of `performance.now()` in every supported browser, so a key press that the main thread handles late still counts at the moment it was pressed. The window is `[start, start + 2000 ms)`: an answer at exactly 2000 ms is late, which matches a timer that ends the window at that moment. Once a trial is scored, later answers in its window are ignored answers. An answer is never applied to an earlier trial.

**D4. A no-sound window opens where a sound would have started.** A sound asked for at the end of its gap starts 50 ms later on the audio clock, and its start converted to the page clock includes the output delay the browser reports. If a no-sound window opened at the gap's end plus 50 ms only, a missed sound would be scored a few to a few hundred milliseconds later than a silence, and anything drawn at scoring time would differ by that much. The flow therefore adds the offset measured for the last sound of the visit. Before the first sound of a visit the offset is 0, so only no-sound trials that come before the visit's first sound can open earlier than a sound would, and by no more than the output delay.

**D5. The room snapshot holds no trial, not even a count.** A trial counter or a "listening" flag would change at moments that depend on the trial. Scoring changes nothing in the snapshot except at a room's end, so a missed sound or an answered silence notifies no snapshot listener. Progress is shown by rooms: `finishedRoomCount` and the current room.

**D6. One event per scored trial, with the reaction decided in the session.** The product shows a ripple for a catch and the house's line for an answer to silence, and nothing for the rest until the replay. Putting that rule in the session makes it testable and leaves the interface no choice to get wrong. A wrong side is shown as nothing, like a miss, because the hearing method counts it as a miss for the ear and the replay will show it. The event still carries the whole log entry, because the interface needs the side and the level for the ripple label and may keep a running list for the replay screen.

**D7. Answers outside any window are logged with time and side, and decide nothing.** The brief asks that they be ignored and counted, so that constant pressing can be detected. Releasing them at once would tell the visitor whether a window was open, so they appear only in the log and the summary. A steady presser is already caught by the false alarm rules (Q2), so no new limit is added.

**D8. The visitor may pause inside a room as well as between rooms.** The brief says the visitor can pause between rooms. The flow waits in `betweenRooms` until the visitor goes on, which is that pause. A hidden page must pause a room anyway, so a visitor's `pause()` inside a room reuses the same path at no extra cost: the trial under way is discarded and comes again later. Pausing calls `stopAll`, so any sound still playing fades out at once, and the moment of the pause is the visitor's own, so it reveals nothing.

**D9. "Repeated later" means the same trial after the pause.** The search's next trial depends on the answer to the current one, so a discarded trial cannot be put back into the room's sequence at a later place. The search keeps the waiting trial until it is answered (threshold-search, `createThresholdSearch`), so after the pause the flow presents it again with its own gap. Its ear and level are unchanged, so the rise limit cannot act, and the engine's no-sound schedule is unaffected.

**D10. A trial is in the log once it was played, and a discarded trial makes no event.** "Played" is the moment the shell scheduled the sound, or for a silence the end of its gap. A trial cancelled during its gap was never played and is not logged. A discarded trial is logged, so the log holds what the visitor heard. No event is made for it, because an event at the moment of a pause would tell the visitor whether a sound had been under way.

**D11. `chooseVisit` starts sound; `startCalibration` starts the hiss.** The front door press is the first gesture, so it activates the output shell. The hiss starts on a second press, after the visitor has read the calibration instructions, as the interface's calibration sheet expects. A kept calibration moves to the headphone check at once, where the kept line is shown, and the check must be answered `left` before the visit goes on.

**D12. A device change calibrates again and starts the interrupted room again.** The output stage forgets the calibration on a device change, and the room's cap depends on it, so the running search cannot go on. The interrupted attempt is kept in the log as `abandoned`, with its trials, and its results and false alarms are left out of the summary. The room starts again with a new engine seed and the new cap after a new calibration and headphone check. Finished floors keep their results: each was measured with one calibration throughout, and floors are never compared with each other. The rules are not shown again. Q4 asks whether the owner prefers to end the visit instead.

**D13. What stop does depends on how far the visit has come.** Before the result, stop leaves the house with nothing kept, as the brief says. In the replay it silences and shows the result, because the result is complete and is not a partial one. On the result page and in the swapped repeat it silences; the swapped repeat returns to the result. The stop control silences at once in every stage.

**D14. The exit screen leads back to the front door.** The interface's exit sheet has "Back to the front door". `backToFrontDoor` drops the visit and shows `entry`, with the same output shell (D2). It is also accepted on the result, so that a visitor can start again from there.

**D15. This spec writes nothing to local storage.** The result page spec saves a visit with the date, the visit type and a name the visitor may give the headphones, all of which are chosen on the result page. A stopped visit keeps nothing, and robot mode must save nothing. So the flow only hands the log to the result stage, and `src/storage` stays as it is. The log is plain data so that storage can save it as it is.

**D16. The snapshot gives reasons as codes, and the flow adds no copy.** The interface's own copy (`leaving-copy.ts`, `visit-copy.ts`, `room-copy.ts`, being written by the owner) chooses the lines for a pause, an exit and an answered silence. The flow gives only the lines it already gets from existing copy: the calibration controller's line, the headphone check judgement line and `roomsShortLine`. This keeps every string in `src/copy` and the flow free of strings, and avoids two lines for one thing.

**D17. The visit-level false alarm rule pools the finished rooms, marks the whole visit, and has its own proposed limit.** The brief asks for a rule on the pooled count, what it marks, and a measurement. Pooling three or five rooms gives 11 to about 40 no-sound trials instead of about 7, so a listener's false alarm rate is estimated two to three times more closely. What it marks follows `hearing-method.md` ("the result for that visit is marked unreliable and the visitor is invited to repeat it") and brief 06 (a notice that the whole visit is unreliable): every ear becomes unreliable with the reason `visitFalseAlarmRate`, which also removes the swapped repeat. Marking only some ears was considered and rejected: the guessed catches that produce too-quiet results are spread over every room of such a visitor. "Above" is strict and judged with the engine's `atMostFraction`, as for the room. The limit is a separate field because the measurement shows that reusing the per-room 0.30 removes only about a third of the case the brief names; 0.20 removes 70 to 82 percent at no measured cost to attentive listeners. It was proposed by this spec and decided by the owner's coordinator on 2026-11-16, at the owner's request; the owner may reverse it (Q1). Abandoned attempts are left out, so that the pooled counts come from the same room runs as the floors' results.

**D18. A room is its ghost sound, found from its frequency.** The config lists the visits as frequencies; the sounds have centre frequencies. Matching the two keeps one source for each, and the interface already names rooms by sound id. Rooms are visited in the config's order, which is up the house.

**D19. One seed makes every random choice of every visit.** The flow's seed starts a source from which each visit draws a visit seed. A visit's source then draws the seed of the sound renders first, and an engine seed for each room attempt as it starts. Draws are `floor(u × 2³²)`. The visit seed and every engine seed are in the log, so a visit can be replayed (R19.3) and brief 09's validator can check a log against the engine. The calibration controller is created once with a forwarding source that draws from the current visit's sound source, because a controller per visit would leave its stop listener on the shell.

**D20. The search gets the hearing method config with only its cap replaced.** `roomSearchCapDb` of the room's top at the kept calibration, as the output stage requires. Every other setting is the shipped one, and the engine validates and copies them.

**D21. The replay stage is reached and left empty.** The flow calls `beginRoom` on entering it, as the output stage requires, and shows the log. The missed-sound replay spec adds the sounds, with the Purpose `replay`, and its fields. Until then `proceed` goes on to the result.

**D22. The last door has a place, and no stage yet.** It goes between the last room and the replay, in the full visit only. A stage is not added before the last-door spec exists, because the interface cannot draw a stage whose fields are not known; adding it later follows D1.

**D23. A trial played at another level than asked for makes that floor unreliable.** CP6 shows that this cannot happen when the cap is the rounded room top. If it ever did, the search would have scored an answer for a level that was not played, so the floor's number would not mean what it says. The answer is still scored, to keep the search and the log in step, both levels are logged, and both ears of the floor are marked with `levelNotAsAsked`. No number decides this.

**D24. The swapped repeat is offered when both ears are found and differ by at least 15 dB.** That is the rule of `hearing-method.md`, with `swappedRepeatDifferenceDb`. A marked visit offers none, because its ears are not found. The stage is only reached here; the swapped-repeat spec adds the repeat and may narrow when it is offered.

**D25. A refused trial sound is tried again, and three refusals in a row end the visit.** With the cap at the rounded room top and gaps longer than any sound, the shell should never refuse a trial. If it does, scoring the trial would score a sound that was not played, so the same trial comes again after its gap. A device that keeps refusing would loop forever, so after three refusals in a row the visit ends with a plain reason. The count is `refusedPlaysInARowMaxCount`; it decides nothing about reliability.

**D26. Tests run on the fake backend, with worst-case renders and a test hook for presented trials.** A simulated listener needs to know when a trial is presented, which ear and which level, and the screen must not tell it. The flow's test options take `onTrialPresented`, called when a trial's window is set. It is not in the contract, the interface never passes it, and the robot-listener spec decides whether robot mode uses it. The house-interface spec's leak property can take its labels from it as well. The worst-case renderers keep the visits fast and are the hardest case for the cap.

**D27. "A visit ends" means that it reaches the result or the exit within a stated time.** A visit waits for the visitor between stages and during pauses, by design, so it cannot end without one. CP1 therefore drives a visitor who goes on after bounded rests and resumes after bounded pauses, and asks that the visit end within a budget made of those waits and the most time the rooms can take.

**D28. The log is assembled once, when the rooms are over.** The log is shown only from the replay stage on, so the recorder builds the frozen log once there and not after every trial. Times are relative to the visit's start, so a stored log carries no meaningless page-clock values.

**D29. The front door's third choice is not the flow's.** The 60 second replay needs no headphones and no output shell, and has its own spec. The entry snapshot lists only the two visits; the interface handles the third door.

**D30. What the tasks may touch.** The project owner is building the interface in the same working tree: `src/ui/`, several files in `src/copy/` and `src/config/`, `tests/properties/screen-leak/`, a temporary page `house-sketch.html` (since removed), and edits to `package.json`, `package-lock.json` and the READMEs of `src/config`, `src/copy` and `src/ui`, all uncommitted when this spec began. The owner's interface files were committed while this spec was implemented. The tasks never change or stage those files. They add no `package.json` script; the measurement is run with `npx tsx`. Commit messages and READMEs avoid the banned words of `wording.md`; code names such as `trialScored` are not matched by the check, but plain words such as "scored" are, so the prose says "answered" or "decided" instead.

**D31. The contract imports from the output stage and the engine, and the interface imports only the contract.** `src/ui` may import `src/session`, and `src/session` may import the engine and the output stage. Re-exporting their types through the contract gives the interface every type it needs without importing either module, which the structure steering forbids. `BrowserWindow` is `Window & typeof globalThis`, not a Web Audio type.

**D32. The visit lengths are reported and not changed.** The steering's timings make the rooms longer than the product promises (Q3). Changing them is a steering change, and the trial limit also bears on the threshold-search properties.

**D33. A time stamp that cannot be right is replaced by the time now.** A missing, non-finite or future `pressedAtMs` would put an answer at a moment that did not happen. The timer's time is the latest the press can have been. A very old time stamp is kept; it simply falls before the current window and becomes an ignored answer.

**D34. A no-sound trial needs no audio clock reading.** The output shell exposes only the timestamp pair, not its current audio time. The no-sound window is therefore computed on the page clock from the presentation time, the lead and the last measured offset (D4), which gives the same result as converting a would-be start.

**D35. Every visit has a token, and late callbacks check it.** An activation that resolves after the visitor stopped, or a timer of a dropped visit, must not act on the next visit. Each visit and each stage entry gets a new token; callbacks compare it and do nothing if it changed.

**D36. The measurement of task 5 gives the counts of "Measurements".** `npx tsx tests/listeners/print-visit-rule-measurement.ts` was run on the working tree of task 5, on top of commit 9e7d506, with the task's files not yet committed. It took 6.3 s and wrote no file. It plays the cases, seeds and visit counts of "Measurements" through `measureVisitFalseAlarmRule`, which applies `judgeVisitFalseAlarms` at each limit. A fixed listener's visits are drawn from `listenerSetSeed(parameters)` XOR the number of rooms (regression 4: 4040559323 quick, 4040559325 full; D43 set: 1113057959 quick, 1113057953 full); each room draws its engine seed and then its listener seed. A range listener draws its six parameters with `drawListenerParameters` per visit, from seed 20261201 (quick) or 20261202 (full), before the seeds of its rooms. Nothing here changes the proposed limit (Q1).

Every figure in "Measurements" came out the same except four. In each of the four the exact value lies half way between two printed digits and was rounded the other way, so the underlying count is the same:

| Cell | Count | Exact | Design | This run |
|---|---|---|---|---|
| D43 set, quick, 0.30, visits marked | 949 of 2000 | 47.45 % | 47.5 % | 47.4 % |
| D43 set, full, 0.20, Wrong | 123 of 12 000 ears | 1.025 % | 1.02 % | 1.03 % |
| D43 set, full, 0.15, Wrong | 33 of 12 000 ears | 0.275 % | 0.28 % | 0.27 % |
| Regression 4, quick, 0.15, Wrong removed | 77 of 668 left | 88.47 % | 89 % | 88 % |

The last one differs because the design computed the share removed from the rounded percentages (1 − 0.64 / 5.57). It also stands in Q1's table as 89 %; the measured value is 88 %.

The run, in full (A / F / W is Accurate / Flagged / Wrong; with a limit, every ear of a marked visit counts as Flagged):

| Listener, visit | Visit limit | Visits marked (count) | Accurate | Flagged | Wrong (count) | Wrong removed |
|---|---|---|---|---|---|---|
| Regression 4, quick | none | 0.0 % (0) | 15.3 % | 79.1 % | 5.57 % (668) | |
| | 0.30 | 46.9 % (937) | 11.0 % | 85.1 % | 3.94 % (473) | 29 % |
| | 0.25 | 64.2 % (1284) | 8.0 % | 89.1 % | 2.92 % (350) | 48 % |
| | 0.20, proposed | 82.2 % (1643) | 4.5 % | 93.9 % | 1.60 % (192) | 71 % |
| | 0.15 | 93.3 % (1865) | 2.0 % | 97.4 % | 0.64 % (77) | 88 % |
| Regression 4, full | none | 0.0 % (0) | 16.1 % | 78.7 % | 5.23 % (628) | |
| | 0.30 | 48.5 % (582) | 10.5 % | 86.1 % | 3.40 % (408) | 35 % |
| | 0.25 | 72.0 % (864) | 6.5 % | 91.3 % | 2.21 % (265) | 58 % |
| | 0.20, proposed | 88.5 % (1062) | 2.9 % | 96.0 % | 1.09 % (131) | 79 % |
| | 0.15 | 96.9 % (1163) | 0.9 % | 98.8 % | 0.32 % (38) | 94 % |
| D43 set, quick | none | 0.0 % (0) | 13.2 % | 80.8 % | 5.95 % (714) | |
| | 0.30 | 47.4 % (949) | 9.4 % | 86.3 % | 4.29 % (515) | 28 % |
| | 0.25 | 67.2 % (1343) | 6.7 % | 90.2 % | 3.14 % (377) | 47 % |
| | 0.20, proposed | 83.7 % (1674) | 3.6 % | 94.6 % | 1.78 % (214) | 70 % |
| | 0.15 | 93.2 % (1863) | 1.7 % | 97.5 % | 0.81 % (97) | 86 % |
| D43 set, full | none | 0.0 % (0) | 13.5 % | 80.7 % | 5.79 % (695) | |
| | 0.30 | 49.4 % (593) | 8.7 % | 87.6 % | 3.69 % (443) | 36 % |
| | 0.25 | 72.0 % (864) | 5.3 % | 92.4 % | 2.28 % (274) | 61 % |
| | 0.20, proposed | 89.1 % (1069) | 2.2 % | 96.7 % | 1.03 % (123) | 82 % |
| | 0.15 | 97.4 % (1169) | 0.6 % | 99.1 % | 0.27 % (33) | 95 % |

Pooled no-sound trials per visit (median, fewest, most): regression 4 quick 21, 11, 34; full 35, 25, 51; D43 set quick 22, 13, 35; full 36, 25, 50.

Attentive_Range, 2000 visits per type: no visit marked at 0.30, 0.25 or 0.20; at 0.15, 0.4 % of quick and 0.1 % of full visits. A / F / W: 97.6 / 2.4 / 0.01 % (quick) and 97.4 / 2.6 / 0.00 % (full) with no rule and at every limit from 0.20 up; 97.3 / 2.7 / 0.01 % and 97.3 / 2.7 / 0.00 % at 0.15. A room marked by the per-room rule: 2.5 % of quick and 4.0 % of full visits.

Plausible_Range, 6000 visits per type. Two kinds of figure are new here: the share of all visits marked, and the bins above 0.30 in steps of 0.05, which R23.2 asks for and the design's table merged.

| Visit limit | Visits marked (quick / full) | A / F / W (quick) | A / F / W (full) |
|---|---|---|---|
| none | 0.0 % / 0.0 % | 44.9 / 53.1 / 2.00 % | 44.2 / 53.7 / 2.15 % |
| 0.30 | 37.9 % / 39.1 % | 39.4 / 59.3 / 1.27 % | 38.2 / 60.7 / 1.16 % |
| 0.25 | 46.1 % / 48.1 % | 36.7 / 62.3 / 1.04 % | 35.2 / 64.0 / 0.83 % |
| 0.20, proposed | 55.8 % / 57.3 % | 32.4 / 66.9 / 0.72 % | 31.1 / 68.3 / 0.59 % |
| 0.15 | 66.2 % / 68.1 % | 26.4 / 73.1 / 0.49 % | 25.2 / 74.5 / 0.34 % |

A room marked by the per-room rule: 63.0 % of quick and 72.6 % of full visits.

| Listener's false alarm rate | Visits (quick) | A room marked | 0.30 | 0.25 | 0.20, proposed | 0.15 |
|---|---|---|---|---|---|---|
| 0.00 to 0.05 | 581 | 4.5 % | 0.0 % | 0.2 % | 0.2 % | 1.9 % |
| 0.05 to 0.10 | 613 | 18.3 % | 1.1 % | 1.6 % | 5.5 % | 14.2 % |
| 0.10 to 0.15 | 600 | 32.8 % | 2.8 % | 6.7 % | 15.8 % | 36.0 % |
| 0.15 to 0.20 | 647 | 53.8 % | 11.0 % | 19.8 % | 37.1 % | 60.0 % |
| 0.20 to 0.25 | 616 | 64.8 % | 19.2 % | 33.4 % | 53.4 % | 74.0 % |
| 0.25 to 0.30 | 567 | 77.6 % | 36.9 % | 54.3 % | 71.6 % | 86.9 % |
| 0.30 to 0.35 | 598 | 88.5 % | 59.4 % | 75.3 % | 88.3 % | 95.0 % |
| 0.35 to 0.40 | 578 | 95.3 % | 72.0 % | 84.3 % | 92.6 % | 97.1 % |
| 0.40 to 0.45 | 595 | 97.6 % | 85.5 % | 91.3 % | 97.3 % | 99.2 % |
| 0.45 to 0.50 | 605 | 99.0 % | 94.4 % | 97.5 % | 99.2 % | 99.8 % |
| 0.30 to 0.50 together | 2376 | 95.1 % | 77.9 % | 87.1 % | 94.4 % | 97.8 % |

| Listener's false alarm rate | Visits (full) | A room marked | 0.30 | 0.25 | 0.20, proposed | 0.15 |
|---|---|---|---|---|---|---|
| 0.00 to 0.05 | 583 | 5.8 % | 0.0 % | 0.0 % | 0.0 % | 0.5 % |
| 0.05 to 0.10 | 620 | 27.6 % | 0.3 % | 0.3 % | 1.5 % | 9.7 % |
| 0.10 to 0.15 | 595 | 48.4 % | 1.0 % | 3.5 % | 11.1 % | 35.5 % |
| 0.15 to 0.20 | 601 | 69.9 % | 6.8 % | 15.5 % | 32.8 % | 62.4 % |
| 0.20 to 0.25 | 623 | 83.3 % | 16.2 % | 34.8 % | 57.8 % | 81.1 % |
| 0.25 to 0.30 | 608 | 93.6 % | 38.0 % | 57.7 % | 80.3 % | 94.1 % |
| 0.30 to 0.35 | 610 | 97.7 % | 62.3 % | 82.0 % | 93.9 % | 99.0 % |
| 0.35 to 0.40 | 572 | 99.7 % | 80.4 % | 92.3 % | 98.1 % | 99.7 % |
| 0.40 to 0.45 | 595 | 100.0 % | 91.8 % | 97.8 % | 99.2 % | 100.0 % |
| 0.45 to 0.50 | 593 | 100.0 % | 97.5 % | 99.5 % | 99.8 % | 100.0 % |
| 0.30 to 0.50 together | 2370 | 99.3 % | 82.9 % | 92.8 % | 97.7 % | 99.7 % |

A bin holds the rates from its lower edge up to, not including, its upper edge; the last holds 0.50 as well.

The CP2 and CP3 listener sets of the threshold search, played as whole visits (134 quick or 80 full visits per set, from each set's own seed XOR the number of rooms). The full-visit rows are new here.

| Sets | Visit | none | 0.30 | 0.25 | 0.20, proposed | 0.15 |
|---|---|---|---|---|---|---|
| CP2, 100 Plausible sets (seed 20261116): lowest Accurate or Flagged; limit 93 % | quick | 94.3 % | 95.9 % | 96.5 % | 97.3 % | 97.3 % |
| | full | 93.3 % | 95.1 % | 95.5 % | 97.0 % | 97.0 % |
| CP3, 50 Attentive sets (seed 20261117): lowest Accurate; limit 88 %, Flagged at most 10 % | quick | 92.0 % | 92.0 % | 92.0 % | 92.0 % | 91.7 % |
| | full | 93.0 % | 93.0 % | 93.0 % | 93.0 % | 92.9 % |

No set is below its limit in any column.

CP11 holds at the value in config with the margin the design states: 71 and 79 percent of the regression 4 listener's Wrong ears removed and 70 and 82 percent of the D43 set's, against at least 50 percent; no Attentive visit marked, against at most 0.5 percent. These numbers describe the proposed value 0.2 and decide nothing about it (Q1).

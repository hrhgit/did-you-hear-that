// src/session/visit-flow-types.ts
//
// The interface contract of the visit flow (visit-flow design.md, "Interface contract"). Types
// only. src/ui reads every type it needs from here, and calls createVisitFlow from
// create-visit-flow.ts. Later specs may add to this file; they never remove, rename or change the
// meaning of what is here (D1).

import type { VisitType } from "../config/hearing-method-config";
import type { GhostSoundId } from "../config/sound-id";
import type { Timer } from "../config/timer";
import type {
  PlayRefusal,
  KeepRefusal,
} from "../audio/output/create-audio-output";
import type {
  ClampLimit,
  UnsupportedReason,
} from "../audio/output/output-types";
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
export type PauseReason =
  "visitor" | "hidden" | "interrupted" | "deviceChanged";

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
export type VisitEvent =
  RoomStartedEvent | TrialScoredEvent | RoomFinishedEvent;

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
  /** The visit limit the rate was judged against (proposed, Q1). */
  readonly visitFalseAlarmRateLimitFraction: number;
  /** Whether the rate is above it. Then every ear is unreliable and the visit should be repeated. */
  readonly visitFalseAlarmRateAboveLimit: boolean;
  /** Answers in rooms that scored nothing. */
  readonly ignoredAnswerCount: number;
}

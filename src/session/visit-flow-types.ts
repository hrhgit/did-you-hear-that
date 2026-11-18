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
  /** Calibration: starts the calibration sound at the bottom of the control: the music, looping, or the hiss repeats where the music cannot be loaded. While the music is still loading, it starts once it is ready. Also starts it again after a stop. */
  startCalibration(): void;
  /** Calibration: moves the control one step louder. The next hiss repeat plays the new setting, and the music reaches it in one ramp of 100 ms. */
  louder(): void;
  /** Calibration: moves the control one step quieter than the setting last played. */
  quieter(): void;
  /**
   * Calibration: puts the target of the control at `settingDb`, for a control that can be dragged
   * or moved by keys. The target is rounded down to the control's grid and held from the bottom of
   * the control to its top; NaN changes nothing. The sound still starts at the bottom of the control,
   * and the played setting follows the target: the next hiss repeat plays it, and the music reaches
   * it in one ramp of 100 ms. Ignored outside calibration and while a pause holds.
   */
  setCalibrationTarget(settingDb: number): void;
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
   * Also in the phase `room` of the swapped repeat, where the side is the visitor's own ear.
   */
  answer(side: Ear, pressedAtMs?: number): void;
  /**
   * In a room: pauses at once. A trial that was under way is played again later. Also in the
   * phase `room` of the swapped repeat.
   */
  pause(): void;
  /**
   * While paused: starts sound again and goes on. In the pause `practiceNotHeard`, plays the
   * practice again for each side that did not catch it. Call it from the visitor's press, because
   * it starts sound.
   */
  resume(): void;
  /**
   * While the pause `practiceNotHeard` holds in a room: goes on without the practice, and the
   * counting begins. Call it from the visitor's press, because it starts sound. Ignored otherwise.
   */
  goOnWithoutPractice(): void;
  /** The visible stop control. Stops all sound at once. Before the result it leaves the house with nothing kept. */
  stop(): void;
  /** Result: opens the swapped repeat for a room whose summary offers it. */
  chooseSwappedRepeat(roomIndex: number): void;
  /**
   * Missed-sound replay, phase `announcing`: starts the sounds. Call it from the visitor's press,
   * because it may start sound (it calls `activate` within the call). Does nothing in any other
   * phase or stage, or while a pause holds. In this stage `proceed` skips the replay, or goes on to
   * the result once it has finished, and `stop` silences at once and shows the result.
   */
  startReplay(): void;
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
  "visitor" | "hidden" | "interrupted" | "deviceChanged" | "practiceNotHeard";

/** A pause. The interface shows the line for its reason from `src/copy`. */
export interface VisitPause {
  /** `visitor`: the visitor paused. `hidden`: the page was hidden. `interrupted`: something else on the device took the sound. `deviceChanged`: the audio device changed, and the hiss will be matched again. `practiceNotHeard`: a practice sound was not caught on a side at the loudest the practice plays; nothing plays until the visitor tries again or goes on. */
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

/** Setting the calibration sound to a comfortable listening volume. */
export interface CalibrationSnapshot extends SnapshotBase<"calibration"> {
  /** True when this calibration follows a change of audio device during the visit. */
  readonly again: boolean;
  /** Whether the calibration sound is playing now: the music, or hiss repeats one after another. */
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
  /** What the room says about its practice and its counting. Always present in the snapshots the flow gives; optional only so that literals written before it still compile. */
  readonly practice?: RoomPractice;
  /**
   * The visitor's lantern, or null while the room practises. It changes only with the visitor's
   * own answers, with a caught sound in the moment it is scored, and with time. Always present in
   * the snapshots the flow gives; optional only so that literals written before it still compile.
   */
  readonly lantern?: RoomLantern | null;
  /** How the chase of this room stands, or null while the room practises. Optional as `lantern` is. */
  readonly chase?: RoomChase | null;
  /**
   * Every room of the visit that has begun a run, in visit order: where the rooms run together
   * (one-room spec), every sound that takes its turn in this one room. Always present in the
   * snapshots the flow gives; optional only so that literals written before it still compile.
   */
  readonly creatures?: readonly RoomCreature[];
  /**
   * Whether several rooms' searches take turns in this one room (one-room design.md, D1). Then the
   * practice is the roll call and the room has no place in an order of rooms. Always present in the
   * snapshots the flow gives; optional only so that literals written before it still compile.
   */
  readonly together?: boolean;
}

/**
 * One room's sound as the room's screen keeps it while several searches take turns in one room
 * (one-room spec): whether its search is still going, and how the chase of that sound alone stands.
 * Every field changes only when a room run begins, in the moment a trial is scored, and when its
 * search ends. It says nothing of a trial that is not scored yet.
 */
export interface RoomCreature {
  /** The room this sound is in the log and the result. */
  readonly room: VisitRoom;
  /** `about`: its search is under way or will begin again. `gone`: its search has finished. */
  readonly state: "about" | "gone";
  /** The sounds of it caught in its last run. */
  readonly caughtCount: number;
  /** The quietest level of it caught on each side in its last run, or null where nothing was caught yet. */
  readonly deepestCaughtDb: Readonly<Record<"left" | "right", number | null>>;
  /** The loudest level its search may ask for. */
  readonly topLevelDb: number;
  /** The quietest level its search may ask for. */
  readonly floorLevelDb: number;
}

/** The visitor's lantern inside a room (`lanternConfig`). */
export interface RoomLantern {
  /** The cells of light left. At 0 the lantern is dark: no answer is taken and the room waits. */
  readonly cells: number;
  /** The cells of a full lantern. */
  readonly cellCount: number;
}

/**
 * How the chase of one room stands. Every field changes only in the moment a trial is scored, and
 * says nothing of a trial that is not scored yet.
 */
export interface RoomChase {
  /** The sounds caught in this room so far. */
  readonly caughtCount: number;
  /** The sounds caught in a row up to now. A missed sound and an answer at nothing end it. */
  readonly streak: number;
  /** The longest such row in this room. */
  readonly bestStreak: number;
  /** The quietest level caught on each side, or null where nothing was caught yet. */
  readonly deepestCaughtDb: Readonly<Record<"left" | "right", number | null>>;
  /** The loudest level the room may play: the top of the depth scale. */
  readonly topLevelDb: number;
  /** The quietest level the room may play: the bottom of the depth scale. */
  readonly floorLevelDb: number;
}

/** The rest between two rooms. The visit waits here until `proceed`. */
export interface BetweenRoomsSnapshot extends SnapshotBase<"betweenRooms"> {
  /** The room just finished. */
  readonly finishedRoom: VisitRoom;
  /** The room that comes next. */
  readonly nextRoom: VisitRoom;
}

/** The replay of missed sounds (missed-sound-replay design.md). */
export interface MissedSoundReplaySnapshot extends SnapshotBase<"missedSoundReplay"> {
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
  /** What the replay shows and says now. Every string comes from `src/copy`. */
  readonly replay: MissedSoundReplay;
}

/** The result. The result page spec draws it. */
export interface ResultSnapshot extends SnapshotBase<"result"> {
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
  /** Each floor's result, with the visit-level rule applied. */
  readonly summary: VisitSummary;
  /** Every swapped repeat of this visit that ran to its end, in the order they ended. Pass the snapshot to `resultPicture`, which draws each beside its floor. */
  readonly swappedRepeats: readonly SwappedRepeatRun[];
  /** Once a swapped repeat has begun, the line that asks the visitor to turn the headphones back; otherwise null. Show it above the picture. */
  readonly turnBackLine: string | null;
}

/** The swapped repeat of one floor (swapped-repeat design.md). */
export interface SwappedRepeatSnapshot extends SnapshotBase<"swappedRepeat"> {
  /** The floor to repeat. */
  readonly room: VisitRoom;
  /** The record of the whole visit. */
  readonly visitLog: VisitLog;
  /** The result the repeat was offered from. */
  readonly summary: VisitSummary;
  /** What the repeat shows and says now. Every string comes from `src/copy`. */
  readonly repeat: SwappedRepeat;
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
 * `slipped`: the house says on which side a sound went by unanswered. Said only when the trial is
 * scored, which is when its time to answer is over (the game layer, 2026-11-16).
 * `otherSide`: the house says the sound was on the other side from the answer.
 * `nothingCame`: the house says nothing came, for a trial with no sound that went by unanswered.
 * Said only once it is scored (the game layer, 2026-11-17).
 * `none`: nothing now.
 */
export type TrialReaction =
  "ripple" | "noSoundLine" | "slipped" | "otherSide" | "nothingCame" | "none";

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
  | RoomStartedEvent
  | TrialScoredEvent
  | RoomFinishedEvent
  | ReplaySoundStartedEvent
  | SwappedTrialScoredEvent
  | PracticeSoundScoredEvent
  | ReminderSoundScoredEvent
  | CountingStartedEvent;

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
  /** Every practice sound, practice answer that scored nothing, and refused practice sound, kept apart from the trials. Absent in a visit with no practice, as before the audible-start spec. */
  readonly practice?: LoggedPractice;
  /**
   * Every reminder sound, kept apart from the trials: none of them counts (the game layer,
   * 2026-11-17). Absent in a visit with no reminder.
   */
  readonly reminders?: readonly ReminderSound[];
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
  /** How the anchor was set. Absent in a calibration recorded before the audible-start spec, which was matched to the visitor's hands. */
  readonly anchor?: CalibrationAnchor;
  /** The quietest level each room's sound could be played at with this calibration (the Playable_Floor). Absent before the audible-start spec. */
  readonly roomFloorLevelDb?: Readonly<Record<GhostSoundId, number>>;
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
  /** The quietest level this run's search could ask for: the room's playable floor on the level grid. Absent before the audible-start spec, when it was `hearingMethodConfig.floorDb` then. */
  readonly searchFloorDb?: number;
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
  /** The quietest level the search could ask for here. Always present for a visit recorded with the audible-start spec; absent before it. Never compared across floors. */
  readonly searchFloorDb?: number;
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

// ─── The missed-sound replay ─────────────────────────────────────────────────────────────
// missed-sound-replay design.md. Every level is in decibels relative to the visitor's calibration.

/**
 * `nothingMissed`: the visit has no missed sound. Nothing plays; one line says so.
 * `announcing`: the house says what is about to happen. Nothing plays until `startReplay`.
 * `playing`: the sounds play one after another, or the replay is paused.
 * `finished`: no more sound plays. A line says how the replay ended.
 */
export type ReplayPhase =
  "nothingMissed" | "announcing" | "playing" | "finished";

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
  ReplayNothingMissed | ReplayAnnouncing | ReplayPlaying | ReplayFinished;

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
export type SwappedRepeatUnavailableReason =
  "calibrationGone" | "calibrationChanged";

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
export type SwappedRepeatPauseReason = Extract<
  PauseReason,
  "visitor" | "hidden" | "interrupted"
>;

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
  readonly runs: readonly [
    SwappedRepeatComparisonRun,
    SwappedRepeatComparisonRun,
  ];
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
  readonly judgement: Extract<
    SwapCheckJudgement,
    "bothSides" | "notHeard"
  > | null;
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
  readonly answers: Readonly<
    Record<Ear, { readonly name: string; readonly hint: string }>
  >;
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

// ─── Calibration, practice and the playable floor ───────────────────────────────────────
// audible-start design.md.

/** What a calibration plays. `loading`: the music is not ready yet; `hiss`: the music could not be loaded. */
export type CalibrationSound = "loading" | "music" | "hiss";

/** How a calibration's anchor was set. `hands`: matched to rubbed hands, before the audible-start spec. */
export type CalibrationAnchor = "hands" | "music" | "hiss";

/**
 * `practice`: the room's sound plays to one ear at a time until each ear has caught it once;
 * nothing counts. `notHeard`: a side did not catch it; the pause `practiceNotHeard` holds.
 * `counting`: the search; the screen holds nothing about a trial.
 */
export type RoomPracticePhase = "practice" | "notHeard" | "counting";

/** What the room's screen says about its practice. Every string comes from `src/copy`. */
export interface RoomPractice {
  readonly phase: RoomPracticePhase;
  /** True from a practice sound's presentation until it is answered or its window closes. Never says which side. False outside `practice`. */
  readonly soundPlaying: boolean;
  /** The practice heading in `practice` and `notHeard`; null in `counting`. */
  readonly heading: string | null;
  /** In `practice` and `notHeard`: what practice is. In `counting`: the line that says the counting has begun. */
  readonly lines: readonly string[];
  /** While `soundPlaying`: the line that says a sound is playing now; otherwise null. */
  readonly soundPlayingLine: string | null;
  /** In `notHeard`: the sides that did not catch it; otherwise empty. */
  readonly notHeardEars: readonly Ear[];
  /** In `notHeard`: which side, what to check, and what each choice does; otherwise empty. */
  readonly notHeardLines: readonly string[];
  /** The label of the control that calls `resume` in `notHeard`. */
  readonly tryAgainLabel: string;
  /** The label of the control that calls `goOnWithoutPractice` in `notHeard`. */
  readonly goOnLabel: string;
  /**
   * In `practice`: the room whose sound is practised now, so that the screen can show who is making
   * it. Never which side. Null in `notHeard` and `counting`. Always present in the snapshots the
   * flow gives; optional only so that literals written before it still compile (one-room spec).
   */
  readonly practising?: VisitRoom | null;
  /** In `notHeard`: each room's side that did not catch its sound, in the order practised; otherwise empty. Optional as `practising` is. */
  readonly notHeard?: readonly PracticeMiss[];
}

/** A side on which a room's practice sound was not caught. */
export interface PracticeMiss {
  readonly room: VisitRoom;
  readonly ear: Ear;
}

/** The fields of every practice sound in the log. Times on the visit log's clock. */
export interface PracticeTrialCommon {
  /** Its position among the practice sounds of the visit, from 1. */
  readonly order: number;
  readonly roomIndex: number;
  readonly attempt: number;
  /** 1, then 2 and up after each try again. */
  readonly round: number;
  /** Its number within the round, from 1. A sound played again after a pause keeps its number. */
  readonly practiceNumber: number;
  /** The ear it was for. */
  readonly ear: Ear;
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

/**
 * The fields of every reminder sound in the log: a sound the room plays, louder than the creature
 * was last caught at, after a long time in which the visitor caught nothing (the game layer,
 * 2026-11-17). It counts for nothing and the search never hears of it. Times on the visit log's
 * clock.
 */
export interface ReminderSoundCommon {
  /** Its position among the reminder sounds of the visit, from 1. */
  readonly order: number;
  readonly roomIndex: number;
  readonly attempt: number;
  readonly ear: Ear;
  readonly requestedLevelDb: number;
  readonly playedLevelDb: number;
  readonly clampLimit: ClampLimit | null;
  readonly gapBeforeMs: number;
  readonly presentedAtMs: number;
  readonly windowStartMs: number;
}

export type ScoredReminderSound = ReminderSoundCommon & {
  readonly status: "scored";
  readonly response: VisitorResponse;
  readonly outcome: SoundOutcome;
  readonly answeredAtMs: number | null;
  readonly responseTimeMs: number | null;
  readonly scoredAtMs: number;
};

export type DiscardedReminderSound = ReminderSoundCommon & {
  readonly status: "discarded";
  readonly discardedAtMs: number;
};

export type ReminderSound = ScoredReminderSound | DiscardedReminderSound;

/** Released in the same moment a reminder sound is scored. */
export interface ReminderSoundScoredEvent {
  readonly kind: "reminderSoundScored";
  readonly room: VisitRoom;
  readonly trial: ScoredReminderSound;
  /** `ripple` for a caught reminder, drawn on `trial.ear`; `none` otherwise. */
  readonly reaction: Extract<TrialReaction, "ripple" | "none">;
  /** For `ripple`, the ripple's label; otherwise null. */
  readonly line: string | null;
}

/** Released in the same moment a practice sound is scored. */
export interface PracticeSoundScoredEvent {
  readonly kind: "practiceSoundScored";
  readonly room: VisitRoom;
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
}

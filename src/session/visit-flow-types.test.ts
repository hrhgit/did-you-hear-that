import { describe, expectTypeOf, it } from "vitest";
import type {
  EarResult,
  NoSoundOutcome,
  RoomResult,
  SoundOutcome,
} from "../engine/search-types";
import type {
  BetweenRoomsSnapshot,
  CalibrationSnapshot,
  EarpieceArrangement,
  EarpieceState,
  EntrySnapshot,
  ExitSnapshot,
  HeadphoneCheckAnswer,
  HeadphoneCheckSnapshot,
  LoggedEarResult,
  LoggedRoomResult,
  MissedSoundReplay,
  MissedSoundReplaySnapshot,
  PauseReason,
  ReplayAnnouncing,
  ReplayEnding,
  ReplayFinished,
  ReplayNothingMissed,
  ReplayPauseReason,
  ReplayPhase,
  ReplayPlaying,
  ReplaySoundStartedEvent,
  ResultSnapshot,
  RoomSnapshot,
  RulesSnapshot,
  ScoredVisitTrial,
  SwapCheckJudgement,
  SwappedRepeat,
  SwappedRepeatCheck,
  SwappedRepeatEnding,
  SwappedRepeatFinished,
  SwappedRepeatInstruction,
  SwappedRepeatOutcome,
  SwappedRepeatPauseReason,
  SwappedRepeatPhase,
  SwappedRepeatReady,
  SwappedRepeatRoom,
  SwappedRepeatRun,
  SwappedRepeatSnapshot,
  SwappedRepeatUnavailable,
  SwappedRepeatUnavailableReason,
  SwappedRepeatUnclearReason,
  SwappedTrialScoredEvent,
  UnsupportedSnapshot,
  VisitEvent,
  VisitFlow,
  VisitSnapshot,
  VisitStage,
} from "./visit-flow-types";

// Type-level checks of the interface contract (visit-flow design.md, "Interface contract"). They
// run when `npm run typecheck` compiles this file; at run time they do nothing.

/** The snapshot each stage must have, one for one. */
interface SnapshotOfStage {
  readonly entry: EntrySnapshot;
  readonly calibration: CalibrationSnapshot;
  readonly headphoneCheck: HeadphoneCheckSnapshot;
  readonly rules: RulesSnapshot;
  readonly room: RoomSnapshot;
  readonly betweenRooms: BetweenRoomsSnapshot;
  readonly missedSoundReplay: MissedSoundReplaySnapshot;
  readonly result: ResultSnapshot;
  readonly swappedRepeat: SwappedRepeatSnapshot;
  readonly exit: ExitSnapshot;
  readonly unsupported: UnsupportedSnapshot;
}

type SnapshotFor<Stage extends VisitStage> = Extract<
  VisitSnapshot,
  { readonly stage: Stage }
>;

type ReplayViewFor<Phase extends ReplayPhase> = Extract<
  MissedSoundReplay,
  { readonly phase: Phase }
>;

type RepeatViewFor<Phase extends SwappedRepeatPhase> = Extract<
  SwappedRepeat,
  { readonly phase: Phase }
>;

describe("visit-flow-types", () => {
  it("re-exports the engine's EarResult as LoggedEarResult", () => {
    expectTypeOf<LoggedEarResult>().toEqualTypeOf<EarResult>();
  });

  it("gives LoggedRoomResult as the engine's RoomResult without its trials", () => {
    expectTypeOf<LoggedRoomResult>().toEqualTypeOf<
      Omit<RoomResult, "trials">
    >();
  });

  it("gives a ScoredVisitTrial of kind sound a SoundOutcome", () => {
    expectTypeOf<
      Extract<ScoredVisitTrial, { readonly kind: "sound" }>["outcome"]
    >().toEqualTypeOf<SoundOutcome>();
  });

  it("gives a ScoredVisitTrial of kind noSound a NoSoundOutcome", () => {
    expectTypeOf<
      Extract<ScoredVisitTrial, { readonly kind: "noSound" }>["outcome"]
    >().toEqualTypeOf<NoSoundOutcome>();
  });

  it("has every stage in exactly one VisitSnapshot member", () => {
    expectTypeOf<VisitSnapshot["stage"]>().toEqualTypeOf<VisitStage>();
    expectTypeOf<keyof SnapshotOfStage>().toEqualTypeOf<VisitStage>();
    expectTypeOf<VisitSnapshot>().toEqualTypeOf<SnapshotOfStage[VisitStage]>();

    expectTypeOf<SnapshotFor<"entry">>().toEqualTypeOf<EntrySnapshot>();
    expectTypeOf<
      SnapshotFor<"calibration">
    >().toEqualTypeOf<CalibrationSnapshot>();
    expectTypeOf<
      SnapshotFor<"headphoneCheck">
    >().toEqualTypeOf<HeadphoneCheckSnapshot>();
    expectTypeOf<SnapshotFor<"rules">>().toEqualTypeOf<RulesSnapshot>();
    expectTypeOf<SnapshotFor<"room">>().toEqualTypeOf<RoomSnapshot>();
    expectTypeOf<
      SnapshotFor<"betweenRooms">
    >().toEqualTypeOf<BetweenRoomsSnapshot>();
    expectTypeOf<
      SnapshotFor<"missedSoundReplay">
    >().toEqualTypeOf<MissedSoundReplaySnapshot>();
    expectTypeOf<SnapshotFor<"result">>().toEqualTypeOf<ResultSnapshot>();
    expectTypeOf<
      SnapshotFor<"swappedRepeat">
    >().toEqualTypeOf<SwappedRepeatSnapshot>();
    expectTypeOf<SnapshotFor<"exit">>().toEqualTypeOf<ExitSnapshot>();
    expectTypeOf<
      SnapshotFor<"unsupported">
    >().toEqualTypeOf<UnsupportedSnapshot>();
  });
  // The additions of the missed-sound replay (missed-sound-replay design.md, "Interface contract").

  it("gives VisitFlow a startReplay that takes nothing and returns nothing", () => {
    expectTypeOf<VisitFlow["startReplay"]>().toEqualTypeOf<() => void>();
  });

  it("gives the replay snapshot its replay view", () => {
    expectTypeOf<
      MissedSoundReplaySnapshot["replay"]
    >().toEqualTypeOf<MissedSoundReplay>();
  });

  it("has every replay phase in exactly one MissedSoundReplay member", () => {
    expectTypeOf<MissedSoundReplay["phase"]>().toEqualTypeOf<ReplayPhase>();
    expectTypeOf<
      ReplayViewFor<"nothingMissed">
    >().toEqualTypeOf<ReplayNothingMissed>();
    expectTypeOf<
      ReplayViewFor<"announcing">
    >().toEqualTypeOf<ReplayAnnouncing>();
    expectTypeOf<ReplayViewFor<"playing">>().toEqualTypeOf<ReplayPlaying>();
    expectTypeOf<ReplayViewFor<"finished">>().toEqualTypeOf<ReplayFinished>();
  });

  it("adds replaySoundStarted to VisitEvent as ReplaySoundStartedEvent", () => {
    expectTypeOf<
      Extract<VisitEvent, { readonly kind: "replaySoundStarted" }>
    >().toEqualTypeOf<ReplaySoundStartedEvent>();
  });

  it("gives the replay's pause reasons as hidden and interrupted, both pause reasons", () => {
    expectTypeOf<ReplayPauseReason>().toEqualTypeOf<"hidden" | "interrupted">();
    expectTypeOf<ReplayPauseReason>().toExtend<PauseReason>();
  });

  it("lists the replay's phases and endings", () => {
    expectTypeOf<ReplayPhase>().toEqualTypeOf<
      "nothingMissed" | "announcing" | "playing" | "finished"
    >();
    expectTypeOf<ReplayEnding>().toEqualTypeOf<
      "allPlayed" | "deviceChanged" | "soundRefused"
    >();
  });

  // The additions of the swapped repeat (swapped-repeat design.md, "Interface contract").

  it("gives VisitFlow the four presses of the swapped repeat", () => {
    expectTypeOf<VisitFlow["confirmSwap"]>().toEqualTypeOf<() => void>();
    expectTypeOf<VisitFlow["playSwapCheck"]>().toEqualTypeOf<() => void>();
    expectTypeOf<VisitFlow["answerSwapCheck"]>().toEqualTypeOf<
      (answer: HeadphoneCheckAnswer) => void
    >();
    expectTypeOf<VisitFlow["startSwappedRoom"]>().toEqualTypeOf<() => void>();
  });

  it("gives the swapped repeat snapshot its repeat view", () => {
    expectTypeOf<
      SwappedRepeatSnapshot["repeat"]
    >().toEqualTypeOf<SwappedRepeat>();
  });

  it("gives the result snapshot its swapped repeats and its turn-back line", () => {
    expectTypeOf<ResultSnapshot["swappedRepeats"]>().toEqualTypeOf<
      readonly SwappedRepeatRun[]
    >();
    expectTypeOf<ResultSnapshot["turnBackLine"]>().toEqualTypeOf<
      string | null
    >();
  });

  it("has every repeat phase in exactly one SwappedRepeat member", () => {
    expectTypeOf<SwappedRepeat["phase"]>().toEqualTypeOf<SwappedRepeatPhase>();
    expectTypeOf<
      RepeatViewFor<"unavailable">
    >().toEqualTypeOf<SwappedRepeatUnavailable>();
    expectTypeOf<
      RepeatViewFor<"instruction">
    >().toEqualTypeOf<SwappedRepeatInstruction>();
    expectTypeOf<RepeatViewFor<"check">>().toEqualTypeOf<SwappedRepeatCheck>();
    expectTypeOf<RepeatViewFor<"ready">>().toEqualTypeOf<SwappedRepeatReady>();
    expectTypeOf<RepeatViewFor<"room">>().toEqualTypeOf<SwappedRepeatRoom>();
    expectTypeOf<
      RepeatViewFor<"finished">
    >().toEqualTypeOf<SwappedRepeatFinished>();
  });

  it("adds swappedTrialScored to VisitEvent as SwappedTrialScoredEvent", () => {
    expectTypeOf<
      Extract<VisitEvent, { readonly kind: "swappedTrialScored" }>
    >().toEqualTypeOf<SwappedTrialScoredEvent>();
  });

  it("gives the repeat's pause reasons as visitor, hidden and interrupted, all pause reasons", () => {
    expectTypeOf<SwappedRepeatPauseReason>().toEqualTypeOf<
      "visitor" | "hidden" | "interrupted"
    >();
    expectTypeOf<SwappedRepeatPauseReason>().toExtend<PauseReason>();
  });

  it("lists the swapped repeat's unions", () => {
    expectTypeOf<EarpieceState>().toEqualTypeOf<
      "asMarked" | "swapped" | "unknown"
    >();
    expectTypeOf<EarpieceArrangement>().toEqualTypeOf<"asMarked" | "swapped">();
    expectTypeOf<SwapCheckJudgement>().toEqualTypeOf<
      "confirmed" | "notSwapped" | "bothSides" | "notHeard"
    >();
    expectTypeOf<SwappedRepeatPhase>().toEqualTypeOf<
      "unavailable" | "instruction" | "check" | "ready" | "room" | "finished"
    >();
    expectTypeOf<SwappedRepeatUnavailableReason>().toEqualTypeOf<
      "calibrationGone" | "calibrationChanged"
    >();
    expectTypeOf<SwappedRepeatEnding>().toEqualTypeOf<
      "finished" | "deviceChanged" | "soundRefused"
    >();
    expectTypeOf<SwappedRepeatOutcome>().toEqualTypeOf<
      "followsEar" | "followsEarpiece" | "unclear"
    >();
    expectTypeOf<SwappedRepeatUnclearReason>().toEqualTypeOf<
      "noLevel" | "differenceShrank"
    >();
  });

  // The additions of audible start (audible-start design.md, "Interface contract").

  it("gives VisitFlow a setCalibrationTarget that takes a setting and returns nothing", () => {
    expectTypeOf<VisitFlow["setCalibrationTarget"]>().toEqualTypeOf<
      (settingDb: number) => void
    >();
  });

  it("gives CalibrationSnapshot an optional targetSettingDb, so that literals written before it still compile (D29)", () => {
    expectTypeOf<Pick<CalibrationSnapshot, "targetSettingDb">>().toEqualTypeOf<{
      readonly targetSettingDb?: number;
    }>();
    expectTypeOf<
      Omit<CalibrationSnapshot, "targetSettingDb">
    >().toExtend<CalibrationSnapshot>();
  });
});

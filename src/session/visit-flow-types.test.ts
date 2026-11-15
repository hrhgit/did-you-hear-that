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
  EntrySnapshot,
  ExitSnapshot,
  HeadphoneCheckSnapshot,
  LoggedEarResult,
  LoggedRoomResult,
  MissedSoundReplaySnapshot,
  ResultSnapshot,
  RoomSnapshot,
  RulesSnapshot,
  ScoredVisitTrial,
  SwappedRepeatSnapshot,
  UnsupportedSnapshot,
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
});

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { missedSoundReplayConfig } from "../config/missed-sound-replay-config";
import type { GhostSoundId } from "../config/sound-id";
import type { ClampLimit } from "../audio/output/output-types";
import type { SoundOutcome } from "../engine/search-types";
import { planMissedSoundReplay } from "./missed-sound-replay-plan";
import type {
  Ear,
  LoggedCalibration,
  LoggedRoomAttempt,
  VisitLog,
  VisitTrial,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Hand-built visit logs (missed-sound-replay design.md, "The replay plan"). Only the fields the
// plan reads carry meaning; the rest are filled with plausible values.

const { replayRaiseDb } = missedSoundReplayConfig;
const { capRelativeToAnchorDb } = hearingMethodConfig;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

function tops(
  levelDb: number,
  overrides: Partial<Record<GhostSoundId, number>> = {},
): Record<GhostSoundId, number> {
  return {
    cellar: levelDb,
    corridor: levelDb,
    nursery: levelDb,
    stairs: levelDb,
    attic: levelDb,
    ...overrides,
  };
}

function calibration(
  calibrationIndex: number,
  roomTopLevelDb: Record<GhostSoundId, number>,
): LoggedCalibration {
  return {
    calibrationIndex,
    settingDb: -20,
    roomTopLevelDb,
    keptAtMs: 1000 * calibrationIndex,
  };
}

function run(
  roomIndex: number,
  attempt = 1,
  ending: "finished" | "abandoned" = "finished",
): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt,
    engineSeed: 100 * roomIndex + attempt,
    calibrationIndex: 0,
    searchCapDb: 15,
    startedAtMs: 10_000 * roomIndex,
    endedAtMs: 10_000 * roomIndex + 9000,
    ending,
    result: null,
  };
}

interface SoundParts {
  readonly order: number;
  readonly roomIndex?: number;
  readonly attempt?: number;
  readonly ear?: Ear;
  readonly playedLevelDb?: number;
  readonly requestedLevelDb?: number;
  readonly clampLimit?: ClampLimit | null;
  readonly outcome?: SoundOutcome;
  readonly discarded?: boolean;
}

function sound(parts: SoundParts): VisitTrial {
  const ear = parts.ear ?? "left";
  const playedLevelDb = parts.playedLevelDb ?? -25;
  const common = {
    order: parts.order,
    roomIndex: parts.roomIndex ?? 0,
    attempt: parts.attempt ?? 1,
    trialNumber: parts.order,
    gapBeforeMs: 2000,
    presentedAtMs: 3000 * parts.order,
    windowStartMs: 3000 * parts.order + 50,
    kind: "sound" as const,
    ear,
    requestedLevelDb: parts.requestedLevelDb ?? playedLevelDb,
    playedLevelDb,
    clampLimit: parts.clampLimit ?? null,
  };
  if (parts.discarded === true) {
    return {
      ...common,
      status: "discarded",
      discardedAtMs: 3000 * parts.order + 500,
    };
  }
  const outcome = parts.outcome ?? "missed";
  const response =
    outcome === "missed"
      ? ("none" as const)
      : outcome === "caught"
        ? ear
        : ear === "left"
          ? ("right" as const)
          : ("left" as const);
  return {
    ...common,
    status: "scored",
    response,
    outcome,
    answeredAtMs: response === "none" ? null : 3000 * parts.order + 600,
    responseTimeMs: response === "none" ? null : 550,
    scoredAtMs: 3000 * parts.order + 600,
  };
}

function noSound(order: number, roomIndex = 0): VisitTrial {
  return {
    order,
    roomIndex,
    attempt: 1,
    trialNumber: order,
    gapBeforeMs: 2000,
    presentedAtMs: 3000 * order,
    windowStartMs: 3000 * order + 50,
    kind: "noSound",
    ear: null,
    requestedLevelDb: null,
    playedLevelDb: null,
    clampLimit: null,
    status: "scored",
    response: "left",
    outcome: "falseAlarm",
    answeredAtMs: 3000 * order + 600,
    responseTimeMs: 550,
    scoredAtMs: 3000 * order + 600,
  };
}

function makeLog(parts: {
  readonly calibrations?: readonly LoggedCalibration[];
  readonly roomAttempts?: readonly LoggedRoomAttempt[];
  readonly trials: readonly VisitTrial[];
}): VisitLog {
  return deepFreeze({
    formatVersion: 1,
    visitType: "quick",
    visitSeed: 42,
    rooms: visitRooms("quick"),
    calibrations: parts.calibrations ?? [calibration(0, tops(15))],
    headphoneChecks: [],
    roomAttempts: parts.roomAttempts ?? [run(0), run(1), run(2)],
    trials: parts.trials,
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  });
}

const orders = (log: VisitLog): number[] =>
  planMissedSoundReplay(log).missedSounds.map((planned) => planned.trialOrder);

describe("planMissedSoundReplay: which trials", () => {
  it("leaves out a caught trial", () => {
    const log = makeLog({
      trials: [sound({ order: 1, outcome: "caught" }), sound({ order: 2 })],
    });
    expect(orders(log)).toEqual([2]);
  });

  it("leaves out a trial answered on the wrong side (Q3)", () => {
    const log = makeLog({
      trials: [sound({ order: 1, outcome: "wrongSide" }), sound({ order: 2 })],
    });
    expect(orders(log)).toEqual([2]);
  });

  it("leaves out a discarded trial and keeps its scored copy", () => {
    const log = makeLog({
      trials: [sound({ order: 1, discarded: true }), sound({ order: 2 })],
    });
    expect(orders(log)).toEqual([2]);
  });

  it("leaves out a no-sound trial", () => {
    const log = makeLog({ trials: [noSound(1), sound({ order: 2 })] });
    expect(orders(log)).toEqual([2]);
  });

  it("leaves out the trials of an abandoned room run", () => {
    const log = makeLog({
      roomAttempts: [run(0, 1, "abandoned"), run(0, 2), run(1), run(2)],
      trials: [
        sound({ order: 1, attempt: 1 }),
        sound({ order: 2, attempt: 2 }),
      ],
    });
    expect(orders(log)).toEqual([2]);
  });

  it("keeps the order of the log", () => {
    const log = makeLog({
      trials: [
        sound({ order: 1, roomIndex: 0 }),
        sound({ order: 2, roomIndex: 0, outcome: "caught" }),
        sound({ order: 3, roomIndex: 1, ear: "right" }),
        noSound(4, 1),
        sound({ order: 5, roomIndex: 2 }),
        sound({ order: 6, roomIndex: 2, ear: "right" }),
      ],
    });
    expect(orders(log)).toEqual([1, 3, 5, 6]);
  });

  it("takes the room from log.rooms and the ear from the trial", () => {
    const log = makeLog({
      trials: [
        sound({ order: 1, roomIndex: 2, ear: "right" }),
        sound({ order: 2, roomIndex: 1, ear: "left" }),
      ],
    });
    const plan = planMissedSoundReplay(log);
    expect(plan.missedSounds.map((planned) => planned.room)).toEqual([
      log.rooms[2],
      log.rooms[1],
    ]);
    expect(plan.missedSounds.map((planned) => planned.ear)).toEqual([
      "right",
      "left",
    ]);
  });

  it("takes the missed level from the played level, also when a limit lowered it (D4)", () => {
    const log = makeLog({
      trials: [
        sound({
          order: 1,
          requestedLevelDb: 15,
          playedLevelDb: 12.5,
          clampLimit: "ceiling",
        }),
      ],
    });
    expect(planMissedSoundReplay(log).missedSounds[0]!.missedLevelDb).toBe(
      12.5,
    );
  });
});

describe("planMissedSoundReplay: levels and the cap", () => {
  it("raises the missed level and holds it at the room's top in the last calibration (R4.1 to R4.3)", () => {
    const log = makeLog({
      calibrations: [
        calibration(0, tops(15)),
        calibration(1, tops(10, { corridor: 2 })),
      ],
      trials: [
        // The corridor, top 2 in the last calibration: -10 + 20 = 10, held at 2.
        sound({ order: 1, roomIndex: 0, playedLevelDb: -10 }),
        // The stairs, top 10: -10 + 20 = 10, exactly at the cap and not held.
        sound({ order: 2, roomIndex: 1, playedLevelDb: -10 }),
        // The attic, top 10: -25 + 20 = -5, below the cap.
        sound({ order: 3, roomIndex: 2, playedLevelDb: -25 }),
      ],
    });
    expect(log.rooms.map((room) => room.roomId)).toEqual([
      "corridor",
      "stairs",
      "attic",
    ]);
    const plan = planMissedSoundReplay(log);
    expect(
      plan.missedSounds.map(
        ({
          missedLevelDb,
          raisedLevelDb,
          replayCapDb,
          askedLevelDb,
          heldByCap,
        }) => ({
          missedLevelDb,
          raisedLevelDb,
          replayCapDb,
          askedLevelDb,
          heldByCap,
        }),
      ),
    ).toEqual([
      {
        missedLevelDb: -10,
        raisedLevelDb: -10 + replayRaiseDb,
        replayCapDb: 2,
        askedLevelDb: 2,
        heldByCap: true,
      },
      {
        missedLevelDb: -10,
        raisedLevelDb: -10 + replayRaiseDb,
        replayCapDb: 10,
        askedLevelDb: 10,
        heldByCap: false,
      },
      {
        missedLevelDb: -25,
        raisedLevelDb: -25 + replayRaiseDb,
        replayCapDb: 10,
        askedLevelDb: -25 + replayRaiseDb,
        heldByCap: false,
      },
    ]);
  });

  it("holds a top above the anchor cap at the anchor cap (D5)", () => {
    const log = makeLog({
      calibrations: [calibration(0, tops(capRelativeToAnchorDb + 5))],
      trials: [
        sound({ order: 1, playedLevelDb: 0 }),
        sound({ order: 2, playedLevelDb: -30 }),
      ],
    });
    const [held, free] = planMissedSoundReplay(log).missedSounds;
    expect(held).toMatchObject({
      raisedLevelDb: replayRaiseDb,
      replayCapDb: capRelativeToAnchorDb,
      askedLevelDb: capRelativeToAnchorDb,
      heldByCap: true,
    });
    expect(free).toMatchObject({
      raisedLevelDb: -30 + replayRaiseDb,
      replayCapDb: capRelativeToAnchorDb,
      askedLevelDb: -30 + replayRaiseDb,
      heldByCap: false,
    });
  });
});

describe("planMissedSoundReplay: the selection", () => {
  const fiveMissed = makeLog({
    trials: [1, 2, 3, 4, 5].map((order) => sound({ order })),
  });

  it("plays every missed sound when there are at most the most count", () => {
    const plan = planMissedSoundReplay(fiveMissed);
    expect(plan.sounds).toEqual(plan.missedSounds);
    expect(plan.selected).toBe(false);
  });

  it("plays the even selection of the most count passed through the settings (R5.2)", () => {
    const plan = planMissedSoundReplay(fiveMissed, {
      capRelativeToAnchorDb,
      replayRaiseDb,
      replaySoundsMaxCount: 3,
    });
    expect(plan.missedSounds.map((planned) => planned.trialOrder)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(plan.sounds.map((planned) => planned.trialOrder)).toEqual([1, 3, 5]);
    expect(plan.selected).toBe(true);
  });

  it("gives an empty plan for a log with no miss and no calibration", () => {
    const log = makeLog({
      calibrations: [],
      trials: [sound({ order: 1, outcome: "caught" }), noSound(2)],
    });
    expect(planMissedSoundReplay(log)).toEqual({
      missedSounds: [],
      sounds: [],
      selected: false,
    });
  });
});

describe("planMissedSoundReplay: errors and purity", () => {
  it("throws a RangeError for a missed trial of a room the log does not have (R3.6)", () => {
    const log = makeLog({
      roomAttempts: [run(0), run(7)],
      trials: [sound({ order: 1, roomIndex: 7 })],
    });
    expect(() => planMissedSoundReplay(log)).toThrow(RangeError);
  });

  it("throws a RangeError for a missed trial and no calibration (R3.6)", () => {
    const log = makeLog({ calibrations: [], trials: [sound({ order: 1 })] });
    expect(() => planMissedSoundReplay(log)).toThrow(RangeError);
  });

  it("gives a deeply frozen plan, equal for a JSON copy of the log (R3.1)", () => {
    const log = makeLog({
      trials: [
        sound({ order: 1, roomIndex: 0 }),
        sound({ order: 2, roomIndex: 1, ear: "right", outcome: "caught" }),
        sound({ order: 3, roomIndex: 2, ear: "right", playedLevelDb: 5 }),
      ],
    });
    const plan = planMissedSoundReplay(log);
    expect(isDeeplyFrozen(plan)).toBe(true);
    const copy = JSON.parse(JSON.stringify(log)) as VisitLog;
    expect(planMissedSoundReplay(copy)).toEqual(plan);
  });
});

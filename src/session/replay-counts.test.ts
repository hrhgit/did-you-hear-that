import { describe, expect, it } from "vitest";
import type { GhostSoundId } from "../config/sound-id";
import type { SoundOutcome } from "../engine/search-types";
import { planMissedSoundReplay } from "./missed-sound-replay-plan";
import { replayCounts } from "./replay-counts";
import type {
  Ear,
  LoggedRoomAttempt,
  VisitLog,
  VisitTrial,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Hand-built visit logs (missed-sound-replay design.md, "The counts"). Only the fields the counts
// read carry meaning; the rest are filled with plausible values.

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

const roomTopLevelDb: Record<GhostSoundId, number> = {
  cellar: 15,
  corridor: 15,
  nursery: 15,
  stairs: 15,
  attic: 15,
};

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

function sound(
  order: number,
  ear: Ear,
  outcome: SoundOutcome,
  options: {
    readonly roomIndex?: number;
    readonly attempt?: number;
    readonly discarded?: boolean;
  } = {},
): VisitTrial {
  const common = {
    order,
    roomIndex: options.roomIndex ?? 0,
    attempt: options.attempt ?? 1,
    trialNumber: order,
    gapBeforeMs: 2000,
    presentedAtMs: 3000 * order,
    windowStartMs: 3000 * order + 50,
    kind: "sound" as const,
    ear,
    requestedLevelDb: -25,
    playedLevelDb: -25,
    clampLimit: null,
  };
  if (options.discarded === true) {
    return {
      ...common,
      status: "discarded",
      discardedAtMs: 3000 * order + 500,
    };
  }
  const other: Ear = ear === "left" ? "right" : "left";
  const response =
    outcome === "missed"
      ? ("none" as const)
      : outcome === "caught"
        ? ear
        : other;
  return {
    ...common,
    status: "scored",
    response,
    outcome,
    answeredAtMs: response === "none" ? null : 3000 * order + 600,
    responseTimeMs: response === "none" ? null : 550,
    scoredAtMs: 3000 * order + 600,
  };
}

function noSound(order: number): VisitTrial {
  return {
    order,
    roomIndex: 0,
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
    response: "right",
    outcome: "falseAlarm",
    answeredAtMs: 3000 * order + 600,
    responseTimeMs: 550,
    scoredAtMs: 3000 * order + 600,
  };
}

/**
 * Room 0 runs twice: its first run is abandoned. Orders 1 and 2 belong to that run. Then order 3
 * is discarded and order 4 is its scored copy; order 5 plays nothing.
 */
const log: VisitLog = deepFreeze({
  formatVersion: 1,
  visitType: "quick",
  visitSeed: 42,
  rooms: visitRooms("quick"),
  calibrations: [
    { calibrationIndex: 0, settingDb: -20, roomTopLevelDb, keptAtMs: 0 },
    { calibrationIndex: 1, settingDb: -22, roomTopLevelDb, keptAtMs: 5000 },
  ],
  headphoneChecks: [],
  roomAttempts: [run(0, 1, "abandoned"), run(0, 2), run(1), run(2)],
  trials: [
    sound(1, "left", "missed", { attempt: 1 }),
    sound(2, "right", "caught", { attempt: 1 }),
    sound(3, "left", "missed", { attempt: 2, discarded: true }),
    sound(4, "left", "missed", { attempt: 2 }),
    noSound(5),
    sound(6, "right", "caught", { attempt: 2 }),
    sound(7, "right", "wrongSide", { roomIndex: 1 }),
    sound(8, "left", "caught", { roomIndex: 1 }),
    sound(9, "right", "missed", { roomIndex: 2 }),
    sound(10, "left", "wrongSide", { roomIndex: 2 }),
    sound(11, "right", "missed", { roomIndex: 2 }),
  ],
  ignoredAnswers: [],
  pauses: [],
  refusedPlays: [],
});

const side = (
  madeCount: number,
  caughtCount: number,
  wrongSideCount: number,
  missedCount: number,
) => ({ madeCount, caughtCount, wrongSideCount, missedCount });

describe("replayCounts", () => {
  it("counts every scored sound trial of a finished run at null", () => {
    expect(replayCounts(log, null)).toEqual({
      left: side(3, 1, 1, 1),
      right: side(4, 1, 1, 2),
    });
  });

  it("counts nothing through order 0", () => {
    expect(replayCounts(log, 0)).toEqual({
      left: side(0, 0, 0, 0),
      right: side(0, 0, 0, 0),
    });
  });

  it("counts up to and including a middle order", () => {
    expect(replayCounts(log, 7)).toEqual({
      left: side(1, 0, 0, 1),
      right: side(2, 1, 1, 0),
    });
  });

  it("counts everything through one past the last order", () => {
    expect(replayCounts(log, 12)).toEqual(replayCounts(log, null));
  });

  it("leaves out no-sound, discarded and abandoned trials", () => {
    // Through order 5 only order 4 counts: 1 and 2 are of the abandoned run, 3 is discarded and 5
    // plays nothing.
    expect(replayCounts(log, 5)).toEqual({
      left: side(1, 0, 0, 1),
      right: side(0, 0, 0, 0),
    });
  });

  it("gives made as caught plus wrong side plus missed on each side, at every order", () => {
    for (const order of [null, 0, ...log.trials.map((trial) => trial.order)]) {
      const counts = replayCounts(log, order);
      for (const ear of ["left", "right"] as const) {
        const { madeCount, caughtCount, wrongSideCount, missedCount } =
          counts[ear];
        expect(madeCount).toBe(caughtCount + wrongSideCount + missedCount);
      }
    }
  });

  it("gives missed counts that add up to the plan's missed sounds at null (R8.5)", () => {
    const counts = replayCounts(log, null);
    expect(counts.left.missedCount + counts.right.missedCount).toBe(
      planMissedSoundReplay(log).missedSounds.length,
    );
  });

  it("gives a frozen result", () => {
    expect(isDeeplyFrozen(replayCounts(log, null))).toBe(true);
    expect(isDeeplyFrozen(replayCounts(log, 7))).toBe(true);
  });
});

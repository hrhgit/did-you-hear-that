import { describe, expect, it } from "vitest";
import { headphoneTraitsConfig as config } from "../config/headphone-traits-config";
import { headphoneTraitsOf } from "./headphone-traits";
import type { VisitLog } from "./visit-flow-types";

type Ear = "left" | "right";

const frequencies = [500, 1000, 2000, 4000, 8000];

/** A sound trial with only what the traits read. */
const sound = (
  roomIndex: number,
  ear: Ear,
  playedLevelDb: number,
  caught: boolean,
  responseTimeMs = 450,
) => ({
  status: "scored",
  kind: "sound",
  roomIndex,
  attempt: 1,
  ear,
  playedLevelDb,
  outcome: caught ? "caught" : "missed",
  responseTimeMs: caught ? responseTimeMs : null,
});

/**
 * A visit whose every ear caught at -10 and -20 and down to `quietestDb[ear]`, then missed 5 dB
 * below it. Practice catches answered `seenMs` after presentation.
 */
function logOf(
  quietestDb: (roomIndex: number, ear: Ear) => number,
  seenMs = 380,
): VisitLog {
  const trials: unknown[] = [];
  const roomAttempts: unknown[] = [];
  for (const [roomIndex] of frequencies.entries()) {
    const result: Record<Ear, unknown> = { left: null, right: null };
    for (const ear of ["left", "right"] as const) {
      const quietest = quietestDb(roomIndex, ear);
      trials.push(
        sound(roomIndex, ear, -10, true),
        sound(roomIndex, ear, -20, true),
      );
      trials.push(sound(roomIndex, ear, quietest, true, 500));
      trials.push(sound(roomIndex, ear, quietest - 5, false));
      result[ear] = { state: "found", thresholdDb: quietest - 2.5 };
    }
    roomAttempts.push({
      roomIndex,
      attempt: 1,
      ending: "finished",
      result,
      searchFloorDb: -60,
    });
  }
  return {
    rooms: frequencies.map((frequencyHz, roomIndex) => ({
      roomIndex,
      frequencyHz,
    })),
    trials,
    roomAttempts,
    reminders: [],
    practice: {
      trials: Array.from({ length: 5 }, (_, index) => ({
        status: "scored",
        outcome: "caught",
        presentedAtMs: index * 3000,
        answeredAtMs: index * 3000 + seenMs,
      })),
    },
  } as unknown as VisitLog;
}

describe("headphoneTraitsOf", () => {
  it("reads the delay against the seen answers", () => {
    const { delay } = headphoneTraitsOf(logOf(() => -35));
    // Heard q25 is 450, seen q25 is 380.
    expect(delay).toMatchObject({
      basis: "seen",
      delayMs: 450 - 380 + config.seenToHeardMs,
      roundedMs: 140,
      band: "noticeable",
      heardCount: 20,
    });
  });

  it("counts a caught easy turn as heard, and not a reminder after a quiet", () => {
    const reminder = (easy: boolean) => ({
      status: "scored",
      outcome: "caught",
      responseTimeMs: 2000,
      ...(easy ? { easy: true } : {}),
    });
    const log = (easy: boolean) =>
      ({
        ...logOf(() => -35),
        reminders: [reminder(easy), reminder(easy)],
      }) as unknown as VisitLog;
    expect(headphoneTraitsOf(log(true)).delay).toMatchObject({
      heardCount: 22,
    });
    expect(headphoneTraitsOf(log(false)).delay).toEqual(
      headphoneTraitsOf(logOf(() => -35)).delay,
    );
  });

  it("finds a quiet cut when every pitch stops at the same level", () => {
    const { quietCut } = headphoneTraitsOf(logOf(() => -35));
    expect(quietCut?.levelDb).toBeCloseTo(-37.5);
    expect(quietCut?.edges).toHaveLength(10);
  });

  it("finds no cut when the levels follow the pitch", () => {
    const { quietCut } = headphoneTraitsOf(
      logOf((roomIndex) => -25 - roomIndex * 8),
    );
    expect(quietCut).toBeNull();
  });

  it("names the quieter side", () => {
    const { balance } = headphoneTraitsOf(
      logOf((roomIndex, ear) => (ear === "left" ? -30 : -36) - roomIndex * 4),
    );
    expect(balance).toEqual({
      kind: "offset",
      quieterSide: "left",
      offsetDb: 6,
      pitchCount: 5,
    });
  });

  it("says the sides are even", () => {
    const { balance } = headphoneTraitsOf(
      logOf((roomIndex) => -30 - roomIndex * 4),
    );
    expect(balance).toEqual({ kind: "even", pitchCount: 5 });
  });

  it("shows no delay with too few loud catches", () => {
    const log = logOf(() => -35);
    const few = {
      ...log,
      trials: log.trials.filter(
        (trial) =>
          trial.status !== "scored" ||
          trial.kind !== "sound" ||
          trial.playedLevelDb < -20 ||
          trial.roomIndex === 0,
      ),
    } as VisitLog;
    expect(headphoneTraitsOf(few).delay).toBeNull();
  });
});

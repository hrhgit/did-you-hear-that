import { describe, expect, it } from "vitest";
import type { GhostSoundId } from "../config/sound-id";
import { createSeededRandom } from "../config/seeded-random";
import { replayRenderSeed } from "./replay-render-seed";
import { swappedRepeatEngineSeed } from "./swapped-repeat-engine-seed";
import type { LoggedRoomAttempt, VisitLog } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Hand-built visit logs (swapped-repeat design.md, "`swappedRepeatEngineSeed(log, runNumber)`").
// The check against a seed the flow actually drew is task 11's and CP4's.

/** The rule of visit-flow D19: seeds are drawn as `floor(u × 2³²)`. */
const draw = (source: { next(): number }): number =>
  Math.floor(source.next() * 2 ** 32);

const roomTopLevelDb: Record<GhostSoundId, number> = {
  cellar: 15,
  corridor: 15,
  nursery: 15,
  stairs: 15,
  attic: 15,
};

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

/** How many repeat runs each log draws seeds for in these tests. */
const repeatRunsDrawn = 4;

/**
 * A log of `visitSeed` with these room runs, whose seeds are drawn from the visit's source as the
 * flow draws them: the render seed of the visit's sounds, one engine seed per room run, the
 * replay's render seed, then one engine seed per repeat run.
 */
function makeLog(
  visitSeed: number,
  runs: readonly { roomIndex: number; ending: "finished" | "abandoned" }[],
): {
  readonly log: VisitLog;
  readonly replaySeed: number;
  readonly repeatSeeds: readonly number[];
} {
  const source = createSeededRandom(visitSeed);
  draw(source);
  const attempts = new Map<number, number>();
  const roomAttempts = runs.map(({ roomIndex, ending }): LoggedRoomAttempt => {
    const attempt = (attempts.get(roomIndex) ?? 0) + 1;
    attempts.set(roomIndex, attempt);
    return {
      roomIndex,
      attempt,
      engineSeed: draw(source),
      calibrationIndex: attempt - 1,
      searchCapDb: 15,
      startedAtMs: 0,
      endedAtMs: 1000,
      ending,
      result: null,
    };
  });
  const log = deepFreeze<VisitLog>({
    formatVersion: 1,
    visitType: "full",
    visitSeed,
    rooms: visitRooms("full"),
    calibrations: [
      { calibrationIndex: 0, settingDb: -20, roomTopLevelDb, keptAtMs: 0 },
    ],
    headphoneChecks: [],
    roomAttempts,
    trials: [],
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  });
  const replaySeed = draw(source);
  const repeatSeeds = Array.from({ length: repeatRunsDrawn }, () =>
    draw(source),
  );
  return { log, replaySeed, repeatSeeds };
}

const quickRuns = [0, 1, 2].map((roomIndex) => ({
  roomIndex,
  ending: "finished" as const,
}));
const runsWithDeviceChange = [
  { roomIndex: 0, ending: "finished" as const },
  { roomIndex: 1, ending: "abandoned" as const },
  { roomIndex: 1, ending: "finished" as const },
  { roomIndex: 2, ending: "finished" as const },
  { roomIndex: 3, ending: "finished" as const },
  { roomIndex: 4, ending: "finished" as const },
];

describe("swappedRepeatEngineSeed", () => {
  it.each([
    [0, quickRuns],
    [20261201, quickRuns],
    [2 ** 32 - 1, runsWithDeviceChange],
    [123456789, runsWithDeviceChange],
    [7, []],
  ])(
    "for the visit seed %i, is the draw after the render seed, the room runs' engine seeds, the replay's render seed and the earlier repeat runs",
    (visitSeed, runs) => {
      const { log, repeatSeeds } = makeLog(visitSeed, runs);
      for (let runNumber = 1; runNumber <= repeatRunsDrawn; runNumber += 1) {
        expect(swappedRepeatEngineSeed(log, runNumber)).toBe(
          repeatSeeds[runNumber - 1],
        );
      }
    },
  );

  it("for the first run, equals the draw that follows replayRenderSeed", () => {
    for (const runs of [quickRuns, runsWithDeviceChange, []]) {
      for (const visitSeed of [0, 1, 42, 20261115]) {
        const { log, replaySeed } = makeLog(visitSeed, runs);
        expect(replayRenderSeed(log)).toBe(replaySeed);
        // The visit's source drawn up to the replay's render seed, then once more.
        const source = createSeededRandom(log.visitSeed);
        const drawsUpToReplay = log.roomAttempts.length + 2;
        const drawn = Array.from({ length: drawsUpToReplay }, () =>
          draw(source),
        );
        expect(drawn.at(-1)).toBe(replayRenderSeed(log));
        expect(swappedRepeatEngineSeed(log, 1)).toBe(draw(source));
      }
    }
  });

  it("differs from one run number to the next", () => {
    const { log } = makeLog(99, runsWithDeviceChange);
    expect(swappedRepeatEngineSeed(log, 2)).not.toBe(
      swappedRepeatEngineSeed(log, 1),
    );
  });

  it("is a whole number from 0 to 2³² − 1", () => {
    for (let visitSeed = 0; visitSeed < 200; visitSeed += 1) {
      const { log } = makeLog(visitSeed, quickRuns);
      for (const runNumber of [1, 2, 3]) {
        const seed = swappedRepeatEngineSeed(log, runNumber);
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(2 ** 32 - 1);
        expect(() => createSeededRandom(seed)).not.toThrow();
      }
    }
  });

  it("is equal for a JSON copy of the log", () => {
    const { log } = makeLog(31337, runsWithDeviceChange);
    const copy = JSON.parse(JSON.stringify(log)) as VisitLog;
    for (const runNumber of [1, 2, 3]) {
      expect(swappedRepeatEngineSeed(copy, runNumber)).toBe(
        swappedRepeatEngineSeed(log, runNumber),
      );
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws a RangeError for the run number %d",
    (runNumber) => {
      const { log } = makeLog(5, quickRuns);
      expect(() => swappedRepeatEngineSeed(log, runNumber)).toThrow(RangeError);
    },
  );
});

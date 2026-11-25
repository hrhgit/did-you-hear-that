import { describe, expect, it } from "vitest";
import type { GhostSoundId } from "../config/sound-id";
import { createSeededRandom } from "../config/seeded-random";
import { replayRenderSeed } from "./replay-render-seed";
import type { LoggedRoomAttempt, VisitLog } from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// Hand-built visit logs (missed-sound-replay design.md, "The render seed"). The check against a
// seed the flow actually drew is task 12's.

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

/**
 * A log of `visitSeed` with these room runs, whose engine seeds are drawn from the visit's source
 * as the flow draws them: the render seed of the visit's sounds first, then one per run.
 */
function makeLog(
  visitSeed: number,
  runs: readonly { roomIndex: number; ending: "finished" | "abandoned" }[],
): { readonly log: VisitLog; readonly draws: readonly number[] } {
  const source = createSeededRandom(visitSeed);
  const soundRenderSeed = draw(source);
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
  return {
    log,
    draws: [
      soundRenderSeed,
      ...roomAttempts.map((attempt) => attempt.engineSeed),
      draw(source),
    ],
  };
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

describe("replayRenderSeed", () => {
  it.each([
    [0, quickRuns],
    [20261201, quickRuns],
    [2 ** 32 - 1, runsWithDeviceChange],
    [123456789, runsWithDeviceChange],
    [7, []],
  ])(
    "for the visit seed %i, is the draw after the render seed and one engine seed per room run",
    (visitSeed, runs) => {
      const { log, draws } = makeLog(visitSeed, runs);
      expect(replayRenderSeed(log)).toBe(draws.at(-1));
      expect(draws).toHaveLength(runs.length + 2);
    },
  );

  it("depends only on the visit seed and the number of room runs", () => {
    const { log } = makeLog(99, runsWithDeviceChange);
    const other = deepFreeze<VisitLog>({
      ...log,
      visitType: "full",
      rooms: visitRooms("full"),
      calibrations: [],
      roomAttempts: log.roomAttempts.map((attempt, index) => ({
        ...attempt,
        roomIndex: index % 3,
        engineSeed: index,
        ending: "finished",
      })),
    });
    expect(replayRenderSeed(other)).toBe(replayRenderSeed(log));
    const oneRunFewer = deepFreeze<VisitLog>({
      ...log,
      roomAttempts: log.roomAttempts.slice(1),
    });
    expect(replayRenderSeed(oneRunFewer)).not.toBe(replayRenderSeed(log));
    const otherSeed = deepFreeze<VisitLog>({ ...log, visitSeed: 100 });
    expect(replayRenderSeed(otherSeed)).not.toBe(replayRenderSeed(log));
  });

  it("is a whole number from 0 to 2³² − 1", () => {
    for (let visitSeed = 0; visitSeed < 200; visitSeed += 1) {
      const seed = replayRenderSeed(makeLog(visitSeed, quickRuns).log);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(2 ** 32 - 1);
      expect(() => createSeededRandom(seed)).not.toThrow();
    }
  });

  it("is equal for a JSON copy of the log", () => {
    const { log } = makeLog(31337, runsWithDeviceChange);
    const copy = JSON.parse(JSON.stringify(log)) as VisitLog;
    expect(replayRenderSeed(copy)).toBe(replayRenderSeed(log));
  });
});

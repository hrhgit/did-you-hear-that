import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ambientMotionConfig } from "../../config/ambient-motion-config";
import { createSeededRandom } from "../../config/seeded-random";
import { createDust, dustPosition } from "./dust";

describe("dust", () => {
  it("makes the configured number of motes, the same for the same seed", () => {
    const first = createDust(createSeededRandom(3));
    expect(first).toHaveLength(ambientMotionConfig.dustCount);
    expect(createDust(createSeededRandom(3))).toEqual(first);
    expect(createDust(createSeededRandom(4))).not.toEqual(first);
  });

  it("keeps every mote inside the room at every moment", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.double({ min: 0, max: 3_600_000, noNaN: true }),
        (seed, nowMs) => {
          for (const mote of createDust(createSeededRandom(seed))) {
            const place = dustPosition(mote, nowMs);
            expect(place.x).toBeGreaterThanOrEqual(0);
            expect(place.x).toBeLessThanOrEqual(1);
            expect(place.y).toBeGreaterThanOrEqual(0);
            expect(place.y).toBeLessThan(1);
          }
        },
      ),
    );
  });

  it("sinks slowly: a mote moves less than a hundredth of the room in a frame", () => {
    for (const mote of createDust(createSeededRandom(9))) {
      const before = dustPosition(mote, 10_000);
      const after = dustPosition(mote, 10_016);
      const fall = (after.y - before.y + 1) % 1;
      expect(fall).toBeGreaterThan(0);
      expect(fall).toBeLessThan(0.01);
      expect(Math.abs(after.x - before.x)).toBeLessThan(0.01);
    }
  });
});

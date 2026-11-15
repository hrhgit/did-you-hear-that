import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ambientMotionConfig } from "../../config/ambient-motion-config";
import { createSeededRandom } from "../../config/seeded-random";
import { createAmbientSchedule, type AmbientEvent } from "./ambient-schedule";

const seeds = fc.integer({ min: 0, max: 0xffffffff });

function eventsUntil(seed: number, steps: readonly number[]): AmbientEvent[] {
  const schedule = createAmbientSchedule(createSeededRandom(seed));
  return steps.flatMap((untilMs) => schedule.takeUntil(untilMs));
}

describe("createAmbientSchedule", () => {
  it("hands out nothing before the first event is due", () => {
    const schedule = createAmbientSchedule(createSeededRandom(1));
    expect(
      schedule.takeUntil(ambientMotionConfig.lampNudgeGapMinMs - 1),
    ).toEqual([]);
  });

  it("gives the same events for the same seed, however the time is cut up", () => {
    fc.assert(
      fc.property(
        seeds,
        fc.array(fc.integer({ min: 0, max: 600_000 }), { maxLength: 40 }),
        (seed, cuts) => {
          const sorted = [...cuts].sort((a, b) => a - b);
          expect(eventsUntil(seed, [...sorted, 600_000])).toEqual(
            eventsUntil(seed, [600_000]),
          );
        },
      ),
      { numRuns: 60 },
    );
  });

  it("hands out events in time order, each one once", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const events = eventsUntil(seed, [200_000, 400_000, 400_000, 900_000]);
        for (let index = 1; index < events.length; index += 1) {
          expect(events[index]?.atMs).toBeGreaterThanOrEqual(
            events[index - 1]?.atMs ?? 0,
          );
        }
        expect(new Set(events.map((event) => event.atMs)).size).toBe(
          events.length,
        );
      }),
      { numRuns: 60 },
    );
  });

  it("keeps every gap, swing and duration inside the configured range", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const c = ambientMotionConfig;
        const events = eventsUntil(seed, [900_000]);
        let lastNudgeMs = 0;
        let lastShadowEndMs = 0;
        for (const event of events) {
          if (event.kind === "lampNudge") {
            const gap = event.atMs - lastNudgeMs;
            expect(gap).toBeGreaterThanOrEqual(c.lampNudgeGapMinMs);
            expect(gap).toBeLessThanOrEqual(c.lampNudgeGapMaxMs);
            expect(Math.abs(event.degrees)).toBeGreaterThanOrEqual(
              c.lampNudgeMinDegrees,
            );
            expect(Math.abs(event.degrees)).toBeLessThanOrEqual(
              c.lampNudgeMaxDegrees,
            );
            lastNudgeMs = event.atMs;
          } else {
            const gap = event.atMs - lastShadowEndMs;
            expect(gap).toBeGreaterThanOrEqual(c.doorShadowGapMinMs);
            expect(gap).toBeLessThanOrEqual(c.doorShadowGapMaxMs);
            expect(event.durationMs).toBeGreaterThanOrEqual(c.doorShadowMinMs);
            expect(event.durationMs).toBeLessThanOrEqual(c.doorShadowMaxMs);
            lastShadowEndMs = event.atMs + event.durationMs;
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it("gives different schedules for different seeds", () => {
    expect(eventsUntil(1, [300_000])).not.toEqual(eventsUntil(2, [300_000]));
  });
});

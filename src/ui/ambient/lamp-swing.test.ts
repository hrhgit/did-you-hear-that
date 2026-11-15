import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ambientMotionConfig } from "../../config/ambient-motion-config";
import type { DoorShadow, LampNudge } from "./ambient-schedule";
import {
  doorShadowPosition,
  doorShadowStrength,
  lampAngleDegrees,
  nudgeStillSwings,
} from "./lamp-swing";

const nudge = (atMs: number, degrees: number): LampNudge => ({
  kind: "lampNudge",
  atMs,
  degrees,
});

const nudges = fc.array(
  fc.record({
    atMs: fc.double({ min: 0, max: 600_000, noNaN: true }),
    degrees: fc.double({ min: -2, max: 2, noNaN: true }),
  }),
  { maxLength: 30 },
);

describe("lampAngleDegrees", () => {
  it("hangs straight down with no nudges, and at the moment of a nudge", () => {
    expect(lampAngleDegrees([], 5000)).toBe(0);
    expect(lampAngleDegrees([nudge(1000, 2)], 1000)).toBe(0);
  });

  it("ignores a nudge that has not happened yet", () => {
    expect(lampAngleDegrees([nudge(9000, 2)], 5000)).toBe(0);
  });

  it("swings to the side of the nudge first", () => {
    const quarter = ambientMotionConfig.lampPeriodMs / 4;
    expect(lampAngleDegrees([nudge(0, 1.5)], quarter)).toBeGreaterThan(0);
    expect(lampAngleDegrees([nudge(0, -1.5)], quarter)).toBeLessThan(0);
  });

  it("never swings past the largest angle, whatever nudges add up", () => {
    fc.assert(
      fc.property(
        nudges,
        fc.double({ min: 0, max: 700_000, noNaN: true }),
        (list, nowMs) => {
          const angle = lampAngleDegrees(
            list.map((each) => nudge(each.atMs, each.degrees)),
            nowMs,
          );
          expect(Math.abs(angle)).toBeLessThanOrEqual(
            ambientMotionConfig.lampMaxDegrees,
          );
        },
      ),
    );
  });

  it("dies away", () => {
    const late = ambientMotionConfig.lampDecayMs * 12;
    expect(Math.abs(lampAngleDegrees([nudge(0, 2)], late))).toBeLessThan(0.001);
    expect(nudgeStillSwings(nudge(0, 2), 100)).toBe(true);
    expect(nudgeStillSwings(nudge(0, 2), late)).toBe(false);
  });
});

describe("the shadow under the door", () => {
  const shadow: DoorShadow = {
    kind: "doorShadow",
    atMs: 1000,
    durationMs: 4000,
  };

  it("is absent before it starts and after it has passed", () => {
    expect(doorShadowStrength(shadow, 999)).toBe(0);
    expect(doorShadowStrength(shadow, 1000)).toBe(0);
    expect(doorShadowStrength(shadow, 5000)).toBe(0);
    expect(doorShadowStrength(shadow, 9000)).toBe(0);
  });

  it("is darkest half way and never outside 0 to 1", () => {
    expect(doorShadowStrength(shadow, 3000)).toBeCloseTo(1, 10);
    for (let nowMs = 0; nowMs <= 6000; nowMs += 50) {
      const strength = doorShadowStrength(shadow, nowMs);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
    }
  });

  it("comes and goes without a jump", () => {
    for (let nowMs = 0; nowMs < 6000; nowMs += 16) {
      const change = Math.abs(
        doorShadowStrength(shadow, nowMs + 16) -
          doorShadowStrength(shadow, nowMs),
      );
      expect(change).toBeLessThan(0.02);
    }
  });

  it("crosses the gap once, from one end to the other", () => {
    expect(doorShadowPosition(shadow, 0)).toBe(0);
    expect(doorShadowPosition(shadow, 3000)).toBeCloseTo(0.5, 10);
    expect(doorShadowPosition(shadow, 9000)).toBe(1);
  });
});

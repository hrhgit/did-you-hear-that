import { describe, expect, it } from "vitest";
import { headphoneTraitsConfig as config } from "../config/headphone-traits-config";
import {
  createTimingOffsetTracker,
  estimateOutputDelay,
  quantile,
} from "./output-delay";

describe("quantile", () => {
  it("interpolates between neighbours and skips non-finite values", () => {
    expect(quantile([40, 10, 30, 20], 0.25)).toBeCloseTo(17.5);
    expect(quantile([5, Number.NaN], 0.5)).toBe(5);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("estimateOutputDelay", () => {
  it("is null without a heard catch", () => {
    expect(estimateOutputDelay([], [300, 300, 300])).toBeNull();
  });

  it("reads heard answers against seen answers when there are enough", () => {
    const heard = [500, 500, 500, 500];
    const seen = [400, 400, 400];
    expect(estimateOutputDelay(heard, seen)).toEqual({
      delayMs: 500 - 400 + config.seenToHeardMs,
      basis: "seen",
    });
  });

  it("falls back to the assumed quick answer with too few seen catches", () => {
    expect(estimateOutputDelay([450, 450, 450], [400])).toEqual({
      delayMs: 450 - config.quickHeardAnswerMs,
      basis: "assumed",
    });
  });

  it("never goes below 0", () => {
    expect(estimateOutputDelay([100], [])?.delayMs).toBe(0);
  });
});

describe("createTimingOffsetTracker", () => {
  it("stays at 0 until enough heard catches", () => {
    const tracker = createTimingOffsetTracker();
    for (let i = 0; i < config.liveHeardMinCount - 1; i += 1) {
      tracker.noteHeard(900);
    }
    expect(tracker.offsetMs()).toBe(0);
  });

  it("moves at most offsetSlewMs at a time and stops at offsetMaxMs", () => {
    const tracker = createTimingOffsetTracker();
    const seen: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      tracker.noteHeard(2000);
      seen.push(tracker.offsetMs());
    }
    for (const [index, value] of seen.entries()) {
      const before = index === 0 ? 0 : seen[index - 1]!;
      expect(Math.abs(value - before)).toBeLessThanOrEqual(config.offsetSlewMs);
    }
    expect(seen.at(-1)).toBe(config.offsetMaxMs);
  });

  it("leaves out the first seen catch and comes back down for a quick visitor", () => {
    const tracker = createTimingOffsetTracker();
    tracker.noteSeen(5000);
    for (let i = 0; i < 3; i += 1) tracker.noteSeen(400);
    for (let i = 0; i < 20; i += 1) tracker.noteHeard(330);
    // 330 - 400 + 70 = 0
    expect(tracker.offsetMs()).toBe(0);
  });
});

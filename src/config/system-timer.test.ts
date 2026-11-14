import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSystemTimer } from "./system-timer";
import type { TimerHandle } from "./timer";

describe("createSystemTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a callback after its delay and not before", () => {
    const timer = createSystemTimer();
    const callback = vi.fn();
    timer.setTimeout(callback, 100);

    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not run a cleared callback", () => {
    const timer = createSystemTimer();
    const cleared = vi.fn();
    const kept = vi.fn();
    const handle = timer.setTimeout(cleared, 50);
    timer.setTimeout(kept, 50);
    timer.clearTimeout(handle);

    vi.advanceTimersByTime(100);
    expect(cleared).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("follows performance.now() for now()", () => {
    const timer = createSystemTimer();
    const startMs = timer.now();
    expect(startMs).toBe(performance.now());

    vi.advanceTimersByTime(250);
    expect(timer.now()).toBe(performance.now());
    expect(timer.now() - startMs).toBe(250);
  });

  it("reports the callback time from now() while the callback runs", () => {
    const timer = createSystemTimer();
    const startMs = timer.now();
    let seenMs: number | undefined;
    timer.setTimeout(() => {
      seenMs = timer.now();
    }, 40);
    vi.advanceTimersByTime(40);
    expect(seenMs).toBe(startMs + 40);
  });

  it("does nothing for a handle that already ran, was cleared or is unknown", () => {
    const timer = createSystemTimer();
    const ran = timer.setTimeout(() => {}, 10);
    vi.advanceTimersByTime(10);
    const cleared = timer.setTimeout(() => {}, 10);
    timer.clearTimeout(cleared);

    const later = vi.fn();
    timer.setTimeout(later, 10);
    expect(() => {
      timer.clearTimeout(ran);
      timer.clearTimeout(cleared);
      timer.clearTimeout(999 as TimerHandle);
    }).not.toThrow();
    vi.advanceTimersByTime(10);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("hands out its own distinct handles", () => {
    const timer = createSystemTimer();
    const first = timer.setTimeout(() => {}, 10);
    const second = timer.setTimeout(() => {}, 10);
    expect(typeof first).toBe("number");
    expect(second).not.toBe(first);
  });

  it.each([
    -1,
    -0.001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])(
    "throws a RangeError for the delay %s and schedules nothing",
    (delayMs) => {
      const timer = createSystemTimer();
      expect(() => timer.setTimeout(() => {}, delayMs)).toThrow(RangeError);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

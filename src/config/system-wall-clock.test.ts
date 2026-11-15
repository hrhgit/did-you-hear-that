import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSystemWallClock } from "./system-wall-clock";

// The dates are built in the test's own time zone, so midnight here is the local midnight the
// wall clock reads, wherever the test runs.

describe("createSystemWallClock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives Date.now() as the epoch time", () => {
    const moment = new Date(2026, 10, 20, 14, 30, 5, 250);
    vi.setSystemTime(moment);
    expect(createSystemWallClock().now().epochMs).toBe(moment.getTime());
  });

  it("gives the local date just before midnight", () => {
    vi.setSystemTime(new Date(2026, 10, 19, 23, 59, 59, 999));
    expect(createSystemWallClock().now().localDate).toBe("2026-11-19");
  });

  it("gives the next local date at and just after midnight", () => {
    const wallClock = createSystemWallClock();
    vi.setSystemTime(new Date(2026, 10, 20, 0, 0, 0, 0));
    expect(wallClock.now().localDate).toBe("2026-11-20");
    vi.setSystemTime(new Date(2026, 10, 20, 0, 0, 0, 1));
    expect(wallClock.now().localDate).toBe("2026-11-20");
  });

  it("crosses the end of a year at local midnight", () => {
    const wallClock = createSystemWallClock();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59, 999));
    expect(wallClock.now().localDate).toBe("2026-12-31");
    vi.setSystemTime(new Date(2027, 0, 1, 0, 0, 0, 0));
    expect(wallClock.now().localDate).toBe("2027-01-01");
  });

  it("pads single-digit months and days with a zero", () => {
    const wallClock = createSystemWallClock();
    vi.setSystemTime(new Date(2027, 0, 5, 12, 0, 0, 0));
    expect(wallClock.now().localDate).toBe("2027-01-05");
    vi.setSystemTime(new Date(2027, 8, 9, 12, 0, 0, 0));
    expect(wallClock.now().localDate).toBe("2027-09-09");
    vi.setSystemTime(new Date(2027, 9, 10, 12, 0, 0, 0));
    expect(wallClock.now().localDate).toBe("2027-10-10");
  });

  it("reads the clock again on every call", () => {
    const wallClock = createSystemWallClock();
    vi.setSystemTime(new Date(2026, 10, 20, 9, 0, 0, 0));
    const first = wallClock.now();
    vi.setSystemTime(new Date(2026, 10, 20, 9, 0, 1, 500));
    const second = wallClock.now();
    expect(second.epochMs - first.epochMs).toBe(1500);
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0, 0, 0));
    expect(wallClock.now().localDate).toBe("2026-11-21");
    expect(first.localDate).toBe("2026-11-20");
  });
});

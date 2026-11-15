import { describe, expect, it } from "vitest";
import { answerTimeMs } from "./answer-time";

const nowMs = 10_000;

describe("answerTimeMs", () => {
  it("keeps a time stamp equal to now", () => {
    expect(answerTimeMs(nowMs, nowMs)).toBe(nowMs);
  });

  it("keeps an earlier time stamp (D33)", () => {
    expect(answerTimeMs(nowMs - 300, nowMs)).toBe(nowMs - 300);
  });

  it("keeps a very old time stamp, which then falls before the current window (D33)", () => {
    expect(answerTimeMs(0, nowMs)).toBe(0);
  });

  it("uses now for a missing time stamp (R7.8)", () => {
    expect(answerTimeMs(undefined, nowMs)).toBe(nowMs);
  });

  it("uses now for NaN (R7.8)", () => {
    expect(answerTimeMs(Number.NaN, nowMs)).toBe(nowMs);
  });

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "uses now for %d (R7.8)",
    (pressedAtMs) => {
      expect(answerTimeMs(pressedAtMs, nowMs)).toBe(nowMs);
    },
  );

  it("uses now for a time stamp in the future (R7.8)", () => {
    expect(answerTimeMs(nowMs + 1000, nowMs)).toBe(nowMs);
    expect(answerTimeMs(nowMs + 0.001, nowMs)).toBe(nowMs);
  });
});

import { describe, expect, it } from "vitest";
import { missedSoundReplayConfig } from "./missed-sound-replay-config";

describe("missedSoundReplayConfig", () => {
  it("holds the values of the design (R2.1)", () => {
    expect(missedSoundReplayConfig).toEqual({
      replayRaiseDb: 20,
      replaySoundsMaxCount: 20,
      replayGapMs: 400,
    });
  });

  it("ends every field name with its unit (R2.1)", () => {
    for (const fieldName of Object.keys(missedSoundReplayConfig)) {
      expect(fieldName).toMatch(/(Db|Count|Ms)$/);
    }
  });

  it("is deeply frozen (R2.1)", () => {
    expect(Object.isFrozen(missedSoundReplayConfig)).toBe(true);
    for (const value of Object.values(missedSoundReplayConfig)) {
      if (typeof value === "object" && value !== null) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
  });

  it("raises a replayed sound by more than 0 dB (R2.3)", () => {
    expect(missedSoundReplayConfig.replayRaiseDb).toBeGreaterThan(0);
  });

  it("plays at least 2 sounds, a whole number, so the selection keeps the first and the last (R2.3, D7)", () => {
    expect(Number.isInteger(missedSoundReplayConfig.replaySoundsMaxCount)).toBe(
      true,
    );
    expect(missedSoundReplayConfig.replaySoundsMaxCount).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("waits a whole number of milliseconds above 0 between sounds (R2.3)", () => {
    expect(Number.isInteger(missedSoundReplayConfig.replayGapMs)).toBe(true);
    expect(missedSoundReplayConfig.replayGapMs).toBeGreaterThan(0);
  });

  it("Q1 and Q2: keeps the most sounds at 20 and the gap at 400 ms, as decided", () => {
    const message =
      "replaySoundsMaxCount 20 (Q1) and replayGapMs 400 (Q2) were decided by the owner's " +
      "coordinator on 2026-11-16, at the owner's request, in Q1 and Q2 of " +
      ".kiro/specs/missed-sound-replay/design.md. The owner may reverse them.";
    expect(missedSoundReplayConfig.replaySoundsMaxCount, message).toBe(20);
    expect(missedSoundReplayConfig.replayGapMs, message).toBe(400);
  });
});

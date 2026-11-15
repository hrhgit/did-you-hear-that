import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../config/audio-output-config";
import { noSoundWindowStartMs, soundWindowStartMs } from "./window-start";

const { scheduleLeadMs } = audioOutputConfig;

/** A timestamp pair whose page clock is 1000 ms ahead of the audio clock. */
const pairAhead = { audioClockMs: 5000, performanceMs: 6000 };

describe("soundWindowStartMs", () => {
  it("uses a scheduling lead of 50 ms in the shipped config", () => {
    expect(scheduleLeadMs).toBe(50);
  });

  it("converts the audio clock start with a pair whose page clock is 1000 ms ahead (R7.3)", () => {
    expect(
      soundWindowStartMs({
        startMs: 5000 + scheduleLeadMs,
        pair: pairAhead,
        presentedAtMs: 6000,
      }),
    ).toBe(6000 + scheduleLeadMs);
  });

  it("keeps the output delay that the converted start includes (D4)", () => {
    expect(
      soundWindowStartMs({
        startMs: 5000 + scheduleLeadMs,
        pair: pairAhead,
        presentedAtMs: 5900,
      }),
    ).toBe(6000 + scheduleLeadMs);
  });

  it("gives the presentation plus the scheduling lead when there is no pair (R7.3)", () => {
    expect(
      soundWindowStartMs({ startMs: 123, pair: null, presentedAtMs: 6000 }),
    ).toBe(6000 + scheduleLeadMs);
  });

  it("never gives a start earlier than the presentation (R7.5)", () => {
    expect(
      soundWindowStartMs({
        startMs: 5000,
        pair: pairAhead,
        presentedAtMs: 7000,
      }),
    ).toBe(7000);
  });

  it("takes the scheduling lead from its settings", () => {
    expect(
      soundWindowStartMs(
        { startMs: 0, pair: null, presentedAtMs: 6000 },
        { scheduleLeadMs: 10 },
      ),
    ).toBe(6010);
  });
});

describe("noSoundWindowStartMs", () => {
  it("opens at the presentation plus the scheduling lead with an offset of 0 (R7.4)", () => {
    expect(
      noSoundWindowStartMs({ presentedAtMs: 6000, latestOffsetMs: 0 }),
    ).toBe(6000 + scheduleLeadMs);
  });

  it("adds an offset of 30 ms measured on the last sound (D4)", () => {
    expect(
      noSoundWindowStartMs({ presentedAtMs: 6000, latestOffsetMs: 30 }),
    ).toBe(6000 + scheduleLeadMs + 30);
  });

  it("never opens earlier than the presentation with an offset of −80 ms (R7.5)", () => {
    expect(
      noSoundWindowStartMs({ presentedAtMs: 6000, latestOffsetMs: -80 }),
    ).toBe(6000);
  });

  it("opens where a sound asked for at the same moment would have started (D4)", () => {
    const presentedAtMs = 6000;
    const soundStartMs = soundWindowStartMs({
      startMs: 5000 + scheduleLeadMs + 30,
      pair: pairAhead,
      presentedAtMs,
    });
    const latestOffsetMs = soundStartMs - (presentedAtMs + scheduleLeadMs);
    expect(noSoundWindowStartMs({ presentedAtMs, latestOffsetMs })).toBe(
      soundStartMs,
    );
  });
});

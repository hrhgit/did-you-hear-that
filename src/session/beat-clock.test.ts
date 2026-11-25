import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createBeatClock } from "./beat-clock";

describe("createBeatClock (the rhythm game, 2026-11-18)", () => {
  const clock = createBeatClock({
    startAudioMs: 2_000,
    beatMs: 600,
    beatsPerBar: 4,
    pair: { audioClockMs: 1_000, performanceMs: 51_000 },
    askedAtPageMs: 0,
    scheduleLeadMs: 50,
  });

  it("puts the first beat on the page clock by the timestamp pair", () => {
    expect(clock.firstBeatPageMs).toBe(52_000);
  });

  it("gives the off-beat half a beat after a beat, on both clocks", () => {
    expect(clock.slotNotBefore(0)).toEqual({ pageMs: 52_300, audioMs: 2_300 });
    expect(clock.slotNotBefore(52_300)).toEqual({
      pageMs: 52_300,
      audioMs: 2_300,
    });
    expect(clock.slotNotBefore(52_301)).toEqual({
      pageMs: 52_900,
      audioMs: 2_900,
    });
  });

  it("gives the first off-beat at or after any moment, never a beat", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e7, noNaN: true }), (pageMs) => {
        const slot = clock.slotNotBefore(pageMs);
        expect(slot.pageMs).toBeGreaterThanOrEqual(
          Math.min(pageMs, 52_300) - 1e-6,
        );
        expect(slot.pageMs - Math.max(pageMs, 52_300)).toBeLessThan(600 + 1e-6);
        const beatsIn = (slot.pageMs - clock.firstBeatPageMs) / 600;
        expect(beatsIn - Math.floor(beatsIn)).toBeCloseTo(0.5, 6);
        expect(slot.audioMs - slot.pageMs).toBeCloseTo(2_000 - 52_000, 6);
      }),
    );
  });

  it("starts the beat one scheduling lead after it was asked for, without a timestamp pair", () => {
    const plain = createBeatClock({
      startAudioMs: 0,
      beatMs: 500,
      beatsPerBar: 3,
      pair: null,
      askedAtPageMs: 1_000,
      scheduleLeadMs: 50,
    });
    expect(plain.firstBeatPageMs).toBe(1_050);
    expect(plain.slotNotBefore(0).pageMs).toBe(1_300);
  });

  it("refuses a beat of no length", () => {
    for (const beatMs of [0, -1, Number.NaN]) {
      expect(() =>
        createBeatClock({
          startAudioMs: 0,
          beatMs,
          beatsPerBar: 4,
          pair: null,
          askedAtPageMs: 0,
          scheduleLeadMs: 0,
        }),
      ).toThrow(RangeError);
    }
  });
});

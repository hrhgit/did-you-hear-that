import { describe, expect, it } from "vitest";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { renderBeatBar } from "./beat-bar";

describe("renderBeatBar (the rhythm game, 2026-11-18)", () => {
  const rateHz = 48_000;
  const bar = renderBeatBar(rateHz, 600, 4);
  const beatSamples = (600 * rateHz) / 1000;

  it("lasts exactly the bar, and joins its loop without a click", () => {
    expect(bar).toHaveLength(4 * beatSamples);
    expect(bar[0]).toBe(0);
    expect(bar[bar.length - 1]).toBe(0);
  });

  it("is as loud, in RMS, as a ghost sound at the anchor", () => {
    let sumOfSquares = 0;
    for (const sample of bar) {
      sumOfSquares += sample * sample;
    }
    expect(Math.sqrt(sumOfSquares / bar.length)).toBeCloseTo(
      soundRulesConfig.referenceRmsFraction,
      6,
    );
  });

  it("is silent on every off-beat, where the creatures' sounds come", () => {
    for (let beat = 0; beat < 4; beat += 1) {
      const offBeat = beat * beatSamples + beatSamples / 2;
      for (let n = offBeat - 2_400; n < offBeat + 2_400; n += 1) {
        expect(bar[n]).toBe(0);
      }
    }
  });

  it("makes the first beat of the bar the strongest", () => {
    const peakOf = (beat: number): number => {
      let peak = 0;
      for (let n = beat * beatSamples; n < (beat + 1) * beatSamples; n += 1) {
        peak = Math.max(peak, Math.abs(bar[n] ?? 0));
      }
      return peak;
    };
    for (const beat of [1, 2, 3]) {
      expect(peakOf(0)).toBeGreaterThan(peakOf(beat));
    }
  });

  it("refuses a beat shorter than its thump, and a bar of no whole beats", () => {
    expect(() => renderBeatBar(rateHz, 200, 4)).toThrow(RangeError);
    expect(() => renderBeatBar(rateHz, 600, 0)).toThrow(RangeError);
    expect(() => renderBeatBar(rateHz, 600, 2.5)).toThrow(RangeError);
  });
});

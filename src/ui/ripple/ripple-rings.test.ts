import { describe, expect, it } from "vitest";
import { rippleConfig } from "../../config/ripple-config";
import {
  rippleDurationMs,
  rippleGlowStrength,
  rippleRings,
} from "./ripple-rings";

const frameMs = 16;

describe("rippleRings", () => {
  it("draws nothing before a ripple starts and after it has ended", () => {
    expect(rippleRings(-1)).toEqual([]);
    expect(rippleRings(0)).toEqual([]);
    expect(rippleRings(rippleDurationMs(false))).toEqual([]);
    expect(rippleRings(rippleDurationMs(false) + 5000)).toEqual([]);
  });

  it("starts its rings one after another, up to the configured number", () => {
    expect(rippleRings(rippleConfig.ringGapMs / 2)).toHaveLength(1);
    expect(rippleRings(rippleConfig.ringGapMs * 1.5)).toHaveLength(2);
    const mostAtOnce = Math.max(
      ...Array.from(
        { length: 400 },
        (_, index) => rippleRings(index * 10).length,
      ),
    );
    expect(mostAtOnce).toBe(rippleConfig.ringCount);
  });

  it("keeps every ring's spread and strength between 0 and 1", () => {
    for (let ageMs = 0; ageMs <= rippleDurationMs(false); ageMs += frameMs) {
      for (const ring of rippleRings(ageMs)) {
        expect(ring.spread).toBeGreaterThanOrEqual(0);
        expect(ring.spread).toBeLessThanOrEqual(1);
        expect(ring.strength).toBeGreaterThanOrEqual(0);
        expect(ring.strength).toBeLessThanOrEqual(1);
      }
    }
  });

  it("spreads outward and never back", () => {
    let last = 0;
    for (let ageMs = frameMs; ageMs < rippleConfig.ringMs; ageMs += frameMs) {
      const first = rippleRings(ageMs)[0];
      expect(first).toBeDefined();
      expect(first?.spread ?? 0).toBeGreaterThan(last);
      last = first?.spread ?? 0;
    }
  });

  it("never flashes: the total strength changes a little from frame to frame", () => {
    const total = (ageMs: number): number =>
      rippleRings(ageMs).reduce((sum, ring) => sum + ring.strength, 0);
    for (
      let ageMs = -frameMs;
      ageMs <= rippleDurationMs(false);
      ageMs += frameMs
    ) {
      expect(Math.abs(total(ageMs + frameMs) - total(ageMs))).toBeLessThan(
        0.12,
      );
    }
  });
});

describe("rippleGlowStrength", () => {
  it("is absent before the glow starts and after it has ended", () => {
    expect(rippleGlowStrength(0)).toBe(0);
    expect(rippleGlowStrength(rippleDurationMs(true))).toBe(0);
  });

  it("stays between 0 and 1 and changes a little from frame to frame", () => {
    for (
      let ageMs = -frameMs;
      ageMs <= rippleDurationMs(true);
      ageMs += frameMs
    ) {
      const strength = rippleGlowStrength(ageMs);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
      expect(
        Math.abs(rippleGlowStrength(ageMs + frameMs) - strength),
      ).toBeLessThan(0.08);
    }
  });

  it("lasts as long as the reduced-motion glow is configured to", () => {
    expect(rippleDurationMs(true)).toBe(rippleConfig.reducedMotionGlowMs);
    expect(rippleDurationMs(false)).toBe(
      rippleConfig.ringMs +
        (rippleConfig.ringCount - 1) * rippleConfig.ringGapMs,
    );
  });
});

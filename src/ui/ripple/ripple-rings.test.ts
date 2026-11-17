import { describe, expect, it } from "vitest";
import { rippleConfig } from "../../config/ripple-config";
import {
  rippleDurationMs,
  rippleGlowStrength,
  rippleRings,
  sightingAt,
  sightingDurationMs,
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

describe("sightingAt", () => {
  const kinds = ["caught", "slipped"] as const;

  it("shows nothing before it starts and after it ends", () => {
    for (const kind of kinds) {
      expect(sightingAt(kind, 0)).toBeNull();
      expect(sightingAt(kind, -5)).toBeNull();
      expect(sightingAt(kind, Number.NaN)).toBeNull();
      expect(sightingAt(kind, sightingDurationMs(kind))).toBeNull();
    }
  });

  it("keeps its strength and its drift from 0 to 1, and drifts only onwards", () => {
    for (const kind of kinds) {
      let lastDrift = 0;
      for (let ageMs = 1; ageMs < sightingDurationMs(kind); ageMs += 7) {
        const sighting = sightingAt(kind, ageMs);
        expect(sighting).not.toBeNull();
        if (sighting === null) {
          continue;
        }
        expect(sighting.strength).toBeGreaterThanOrEqual(0);
        expect(sighting.strength).toBeLessThanOrEqual(1);
        expect(sighting.drift).toBeGreaterThanOrEqual(lastDrift);
        expect(sighting.drift).toBeLessThanOrEqual(1);
        lastDrift = sighting.drift;
      }
    }
  });

  it("never reaches its brightest sooner than a ripple may, so it does not flash", () => {
    for (const kind of kinds) {
      for (let ageMs = 1; ageMs < rippleConfig.fadeInMinMs; ageMs += 3) {
        expect(sightingAt(kind, ageMs)?.strength).toBeLessThan(1);
      }
      // A fifth of a second in, it is still well short of full (audio-safety rule 9).
      expect(sightingAt(kind, 100)?.strength).toBeLessThan(0.35);
    }
  });

  it("shows a caught sound longer than one that went by", () => {
    expect(sightingDurationMs("caught")).toBeGreaterThan(
      sightingDurationMs("slipped"),
    );
  });
});

import { describe, expect, it } from "vitest";
import { resultPageConfig } from "../config/result-page-config";
import type { LightDepthSettings } from "./light-depth-fraction";
import { lightDepthFraction } from "./light-depth-fraction";
import type { VisitEarResult } from "./visit-flow-types";

const counts = {
  presentationCount: 12,
  catchCount: 6,
  wrongSideCount: 0,
  missCount: 6,
};

function found(thresholdDb: number): VisitEarResult {
  return { ...counts, state: "found", thresholdDb };
}

const betterThanFloor: VisitEarResult = { ...counts, state: "betterThanFloor" };
const worseThanCap: VisitEarResult = { ...counts, state: "worseThanCap" };
const unreliable: VisitEarResult = {
  ...counts,
  state: "unreliable",
  reasons: ["trialLimit"],
};

const fullScale = { searchCapDb: 15, floorDb: -70 };

describe("lightDepthFraction", () => {
  it("gives the design's table with the proposed values (Q1, proposed, not approved)", () => {
    const depths = [15, 0, -25, -50, -70].map((thresholdDb) =>
      lightDepthFraction(found(thresholdDb), fullScale),
    );
    expect(depths.map((depth) => Number(depth?.toFixed(2)))).toEqual([
      0.1, 0.24, 0.48, 0.71, 0.9,
    ]);
    expect(depths[0]).toBe(resultPageConfig.foundLightDepthAtCapFraction);
    expect(depths[4]).toBe(resultPageConfig.foundLightDepthAtFloorFraction);
  });

  it("puts −25 dB at 0.39 on a floor whose loudest is 0 dB", () => {
    expect(
      lightDepthFraction(found(-25), { searchCapDb: 0, floorDb: -70 }),
    ).toBeCloseTo(0.1 + (0.8 * 25) / 70, 10);
    expect(
      Number(
        lightDepthFraction(found(-25), {
          searchCapDb: 0,
          floorDb: -70,
        })?.toFixed(2),
      ),
    ).toBe(0.39);
  });

  it("gives the far wall for better than floor, dark for worse than cap and none for unreliable", () => {
    expect(lightDepthFraction(betterThanFloor, fullScale)).toBe(1);
    expect(lightDepthFraction(worseThanCap, fullScale)).toBe(0);
    expect(lightDepthFraction(unreliable, fullScale)).toBeNull();
  });

  it("does not depend on the scale for the three states without a threshold", () => {
    for (const scale of [fullScale, { searchCapDb: -60, floorDb: -70 }]) {
      expect(lightDepthFraction(betterThanFloor, scale)).toBe(
        resultPageConfig.betterThanFloorLightDepthFraction,
      );
      expect(lightDepthFraction(worseThanCap, scale)).toBe(
        resultPageConfig.worseThanCapLightDepthFraction,
      );
      expect(lightDepthFraction(unreliable, scale)).toBeNull();
    }
  });

  it("holds thresholds outside the scale at its ends", () => {
    expect(lightDepthFraction(found(30), fullScale)).toBe(0.1);
    expect(lightDepthFraction(found(-90), fullScale)).toBe(0.9);
  });

  it("gives the quietest end for a scale whose span is 0 or less", () => {
    expect(
      lightDepthFraction(found(-70), { searchCapDb: -70, floorDb: -70 }),
    ).toBe(0.9);
    expect(
      lightDepthFraction(found(-75), { searchCapDb: -75, floorDb: -70 }),
    ).toBe(0.9);
  });

  it("is deeper for a quieter threshold on the same scale", () => {
    let previous = -1;
    for (let thresholdDb = 15; thresholdDb >= -70; thresholdDb -= 5) {
      const depth = lightDepthFraction(found(thresholdDb), fullScale) as number;
      expect(depth).toBeGreaterThan(previous);
      previous = depth;
    }
  });

  it("takes its settings as a parameter, with resultPageConfig as the default", () => {
    const settings: LightDepthSettings = {
      foundLightDepthAtCapFraction: 0.2,
      foundLightDepthAtFloorFraction: 0.6,
      betterThanFloorLightDepthFraction: 0.95,
      worseThanCapLightDepthFraction: 0.05,
    };
    const scale = { searchCapDb: 10, floorDb: -70 };
    expect(lightDepthFraction(found(10), scale, settings)).toBe(0.2);
    expect(lightDepthFraction(found(-30), scale, settings)).toBeCloseTo(
      0.4,
      10,
    );
    expect(lightDepthFraction(found(-70), scale, settings)).toBe(0.6);
    expect(lightDepthFraction(betterThanFloor, scale, settings)).toBe(0.95);
    expect(lightDepthFraction(worseThanCap, scale, settings)).toBe(0.05);
    expect(lightDepthFraction(found(-30), scale)).toBe(
      lightDepthFraction(found(-30), scale, resultPageConfig),
    );
  });

  it("throws a RangeError for a threshold or scale that is not finite", () => {
    expect(() => lightDepthFraction(found(Number.NaN), fullScale)).toThrow(
      RangeError,
    );
    expect(() =>
      lightDepthFraction(found(-20), {
        searchCapDb: Number.POSITIVE_INFINITY,
        floorDb: -70,
      }),
    ).toThrow(RangeError);
    expect(() =>
      lightDepthFraction(found(-20), { searchCapDb: 15, floorDb: Number.NaN }),
    ).toThrow(RangeError);
  });
});

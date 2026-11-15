import { describe, expect, it } from "vitest";
import { resultPageConfig } from "./result-page-config";

describe("resultPageConfig", () => {
  it("holds the values of the design (R2.1)", () => {
    expect(resultPageConfig).toEqual({
      foundLightDepthAtCapFraction: 0.1,
      foundLightDepthAtFloorFraction: 0.9,
      betterThanFloorLightDepthFraction: 1,
      worseThanCapLightDepthFraction: 0,
      savedVisitsMaxCount: 20,
      headphoneNameMaxCharacterCount: 40,
    });
  });

  it("ends every field name with its unit (R2.1)", () => {
    for (const fieldName of Object.keys(resultPageConfig)) {
      expect(fieldName).toMatch(/(Fraction|Count)$/);
    }
  });

  it("is deeply frozen (R2.1)", () => {
    expect(Object.isFrozen(resultPageConfig)).toBe(true);
    for (const value of Object.values(resultPageConfig)) {
      if (typeof value === "object" && value !== null) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
  });

  it("orders the depths from dark to the far wall (R2.3)", () => {
    expect(resultPageConfig.worseThanCapLightDepthFraction).toBe(0);
    expect(resultPageConfig.worseThanCapLightDepthFraction).toBeLessThan(
      resultPageConfig.foundLightDepthAtCapFraction,
    );
    expect(resultPageConfig.foundLightDepthAtCapFraction).toBeLessThan(
      resultPageConfig.foundLightDepthAtFloorFraction,
    );
    expect(resultPageConfig.foundLightDepthAtFloorFraction).toBeLessThan(
      resultPageConfig.betterThanFloorLightDepthFraction,
    );
    expect(resultPageConfig.betterThanFloorLightDepthFraction).toBe(1);
  });

  it("makes both counts positive whole numbers (R2.3)", () => {
    for (const count of [
      resultPageConfig.savedVisitsMaxCount,
      resultPageConfig.headphoneNameMaxCharacterCount,
    ]) {
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("Q1, Q4 and Q5: keeps the four proposed values", () => {
    const message =
      "These four values are proposals of the result-page spec, not approved values. Changing " +
      "them is the project owner's choice, recorded in Q1, Q4 and Q5 of " +
      ".kiro/specs/result-page/design.md.";
    expect(
      {
        foundLightDepthAtCapFraction:
          resultPageConfig.foundLightDepthAtCapFraction,
        foundLightDepthAtFloorFraction:
          resultPageConfig.foundLightDepthAtFloorFraction,
        savedVisitsMaxCount: resultPageConfig.savedVisitsMaxCount,
        headphoneNameMaxCharacterCount:
          resultPageConfig.headphoneNameMaxCharacterCount,
      },
      message,
    ).toEqual({
      foundLightDepthAtCapFraction: 0.1,
      foundLightDepthAtFloorFraction: 0.9,
      savedVisitsMaxCount: 20,
      headphoneNameMaxCharacterCount: 40,
    });
  });
});

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "./hearing-method-config";
import { visitFlowConfig } from "./visit-flow-config";

describe("visitFlowConfig", () => {
  it("holds the values of the design (R20.1)", () => {
    expect(visitFlowConfig).toEqual({
      visitFalseAlarmRateUnreliableAboveFraction: 0.2,
      refusedPlaysInARowMaxCount: 3,
    });
  });

  it("ends every field name with its unit (R20.1)", () => {
    for (const fieldName of Object.keys(visitFlowConfig)) {
      expect(fieldName).toMatch(/(Db|Ms|Hz|Fraction|Count)$/);
    }
  });

  it("is deeply frozen (R20.1)", () => {
    expect(Object.isFrozen(visitFlowConfig)).toBe(true);
    for (const value of Object.values(visitFlowConfig)) {
      if (typeof value === "object" && value !== null) {
        expect(Object.isFrozen(value)).toBe(true);
      }
    }
  });

  it("puts the visit limit above 0 and at most the per-room limit (R20.2)", () => {
    expect(
      visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction,
    ).toBeGreaterThan(0);
    expect(
      visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction,
    ).toBeLessThanOrEqual(
      hearingMethodConfig.falseAlarmRateUnreliableAboveFraction,
    );
  });

  it("makes the refusal count a positive integer (R20.2)", () => {
    expect(Number.isInteger(visitFlowConfig.refusedPlaysInARowMaxCount)).toBe(
      true,
    );
    expect(visitFlowConfig.refusedPlaysInARowMaxCount).toBeGreaterThan(0);
  });

  it("Q1: keeps the visit limit at its proposed value 0.2", () => {
    expect(
      visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction,
      "0.2 is a proposal of the visit-flow spec, not an approved value. Changing it is the " +
        "project owner's choice, recorded in Q1 of .kiro/specs/visit-flow/design.md, and then " +
        "the limits of CP11 are restated from its Measurements table.",
    ).toBe(0.2);
  });
});

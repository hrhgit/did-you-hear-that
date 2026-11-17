import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "./hearing-method-config";
import { lanternConfig } from "./lantern-config";

describe("lanternConfig", () => {
  it("is frozen and holds only finite positive numbers", () => {
    expect(Object.isFrozen(lanternConfig)).toBe(true);
    for (const [name, value] of Object.entries(lanternConfig)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
  });

  it("has a whole number of cells, and more than one", () => {
    expect(Number.isInteger(lanternConfig.cellCount)).toBe(true);
    expect(lanternConfig.cellCount).toBeGreaterThan(1);
  });

  it("gives a cell back more slowly than the rooms present their trials", () => {
    const { gapBetweenTrialsMinMs, gapBetweenTrialsMaxMs, responseWindowMs } =
      hearingMethodConfig;
    const meanTrialMs =
      (gapBetweenTrialsMinMs + gapBetweenTrialsMaxMs) / 2 + responseWindowMs;
    expect(lanternConfig.rechargeMs).toBeGreaterThan(meanTrialMs);
    expect(lanternConfig.rechargeMs).toBeGreaterThanOrEqual(6000);
  });
});

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { cp11EarsMixedCheck as check } from "./checks/cp11-ears-mixed-check";

describe("CP11. Ears are mixed at random (Statistical; R3.7, R3.8)", () => {
  it(
    "sends 47 to 53 percent of both-ear trials left, independently of the previous ear, and only the searching ear afterwards (seed 20261118)",
    () => {
      const verdict = check.evaluate(hearingMethodConfig);
      expect(verdict.firstCounterexample ?? null).toBeNull();
      expect(verdict.holds).toBe(true);
    },
    check.parameters.timeoutMs,
  );
});

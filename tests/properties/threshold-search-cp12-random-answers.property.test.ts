import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { cp12RandomAnswersFlaggedCheck as check } from "./checks/cp12-random-answers-flagged-check";

describe("CP12. Extreme listeners, answers at random (Statistical; R8, R13.5)", () => {
  it(
    "leaves both ears unreliable in at least 95 percent of 500 rooms (seed 20261119)",
    () => {
      const verdict = check.evaluate(hearingMethodConfig);
      expect(verdict.firstCounterexample ?? null).toBeNull();
      expect(verdict.holds).toBe(true);
    },
    check.parameters.timeoutMs,
  );
});

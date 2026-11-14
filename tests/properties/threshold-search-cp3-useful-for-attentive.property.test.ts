import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp3UsefulForAttentiveCheck as check } from "./checks/cp3-useful-for-attentive-check";

describe("CP3. Useful for attentive listeners (Statistical; brief property 1)", () => {
  it(
    "gives at least 88 percent Accurate and at most 10 percent Flagged ear results for each of 50 Attentive_Range listeners (seed 20261117)",
    () => {
      const verdict = check.evaluate(specSearchUnderTest, hearingMethodConfig);
      expect(verdict.firstCounterexample ?? null).toBeNull();
      expect(verdict.holds).toBe(true);
    },
    check.parameters.timeoutMs,
  );
});

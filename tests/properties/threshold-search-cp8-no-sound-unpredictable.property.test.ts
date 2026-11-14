import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp8NoSoundUnpredictableCheck as check } from "./checks/cp8-no-sound-unpredictable-check";

describe("CP8. No-sound positions cannot be predicted (Statistical; R9.1, R9.5; brief property 4)", () => {
  it(
    "keeps the no-sound share within 0.10 of the overall share for every feature value seen on 400 trials (seed 20261118)",
    () => {
      const verdict = check.evaluate(specSearchUnderTest, hearingMethodConfig);
      expect(verdict.firstCounterexample ?? null).toBeNull();
      expect(verdict.holds).toBe(true);
    },
    check.parameters.timeoutMs,
  );
});

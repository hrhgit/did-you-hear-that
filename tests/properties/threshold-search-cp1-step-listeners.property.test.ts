import fc from "fast-check";
import { describe, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { specSearchUnderTest } from "../listeners/spec-search-under-test";
import { cp1StepListenersExactCheck as check } from "./checks/cp1-step-listeners-exact-check";

describe("CP1. Exact listeners get the exact answer (Universal; R5, R6, R7, R8.2, R8.3; brief property 1)", () => {
  it("gives every Step_Listener the exact answer with the shipped settings", () => {
    fc.assert(
      check.property(specSearchUnderTest, fc.constant(hearingMethodConfig)),
      check.parameters,
    );
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import type { VisitType } from "../../src/config/hearing-method-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import { atMostFraction } from "../../src/engine/fraction-comparisons";
import { attentiveListenerRange } from "../listeners/listener-parameter-arbitraries";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import {
  fixedListenerVisitSeed,
  measureVisitFalseAlarmRule,
} from "../listeners/visit-rule-measurement";

// CP11. What the visit rule removes and costs (Statistical; R23.4; visit-flow design.md, CP11 and
// "Measurements"). The limits below describe the visit limit in visitFlowConfig, which is a
// proposal awaiting the project owner's choice (Q1). If the owner chooses another value, these
// limits are restated from the table in "Measurements" in the same commit.

const timeoutMs = 120_000;

/** The shipped visit limit: proposed, not approved (Q1). */
const visitLimitFraction =
  visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction;

/** With the rule, at most this share of the Wrong ears without it may remain. */
const wrongRemainingMaxFraction = 0.5;

/** At most this share of Attentive visits may be marked. */
const attentiveMarkedMaxFraction = 0.005;

/** The listener of threshold-search regression 4 (seed 4040559320). */
const regressionFourListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: 4.2, right: 14.7 }),
  widthDb: 4.3,
  lapseFraction: 0.062,
  falseAlarmFraction: 0.299,
  wrongSideFraction: 0.006,
});

/** The listener set of threshold-search D43 (set seed 1113057956). */
const d43Listener: PsychometricListenerParameters = Object.freeze({
  ...regressionFourListener,
  trueThresholdDb: Object.freeze({ left: 11.2, right: 14.7 }),
});

const fixedListenerVisitCount: Readonly<Record<VisitType, number>> =
  Object.freeze({ quick: 2000, full: 1200 });

const attentiveVisitCount = 2000;

const attentiveSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  quick: 20261201,
  full: 20261202,
});

const visitTypes: readonly VisitType[] = ["quick", "full"];

describe("visit flow CP11. What the visit rule removes and costs (Statistical; R23.4)", () => {
  describe.each([
    {
      name: "the listener of regression 4",
      parameters: regressionFourListener,
    },
    { name: "the D43 set", parameters: d43Listener },
  ])("$name", ({ parameters }) => {
    it.each(visitTypes)(
      "leaves at most half of the Wrong ears in %s visits at the visit limit in config",
      (visitType) => {
        const measurement = measureVisitFalseAlarmRule({
          listener: { kind: "fixed", parameters },
          visitType,
          visitCount: fixedListenerVisitCount[visitType],
          seed: fixedListenerVisitSeed(parameters, visitType),
          limits: [visitLimitFraction],
        });
        const [withoutRule, withRule] = measurement.rows;
        expect(withoutRule.wrongCount).toBeGreaterThan(0);
        expect(
          atMostFraction(
            withRule.wrongCount,
            withoutRule.wrongCount,
            wrongRemainingMaxFraction,
          ),
          `${String(withRule.wrongCount)} Wrong ears with the rule against ${String(withoutRule.wrongCount)} without it`,
        ).toBe(true);
      },
      timeoutMs,
    );
  });

  it.each(visitTypes)(
    "marks at most 0.5 percent of 2000 Attentive_Range %s visits at the visit limit in config",
    (visitType) => {
      const measurement = measureVisitFalseAlarmRule({
        listener: { kind: "range", range: attentiveListenerRange },
        visitType,
        visitCount: attentiveVisitCount,
        seed: attentiveSeed[visitType],
        limits: [visitLimitFraction],
      });
      const withRule = measurement.rows[1];
      expect(
        atMostFraction(
          withRule.visitsMarkedCount,
          withRule.visitCount,
          attentiveMarkedMaxFraction,
        ),
        `${String(withRule.visitsMarkedCount)} of ${String(withRule.visitCount)} visits marked`,
      ).toBe(true);
    },
    timeoutMs,
  );
});

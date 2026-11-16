import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { swappedRepeatConfig } from "../config/swapped-repeat-config";
import {
  swappedRepeatOutcome,
  type SwappedRepeatOutcomeInput,
} from "./swapped-repeat-outcome";
import type { VisitEarResult } from "./visit-flow-types";

// The rule of "The outcome" in swapped-repeat design.md, on hand-built ear results. Its property
// is CP2.

const counts = {
  presentationCount: 12,
  catchCount: 6,
  wrongSideCount: 0,
  missCount: 6,
};

const found = (thresholdDb: number): VisitEarResult =>
  Object.freeze({ ...counts, state: "found", thresholdDb });

const withoutLevel: readonly VisitEarResult[] = [
  Object.freeze({ ...counts, state: "betterThanFloor" }),
  Object.freeze({ ...counts, state: "worseThanCap" }),
  Object.freeze({
    ...counts,
    state: "unreliable",
    reasons: Object.freeze(["levelNotAsAsked"] as const),
  }),
  Object.freeze({
    ...counts,
    state: "unreliable",
    reasons: Object.freeze(["trialLimit"] as const),
  }),
];

/** A first run of −40 on the left and −20 on the right: 20 dB quieter on the left. */
const first = Object.freeze({ left: found(-40), right: found(-20) });

const input = (
  left: VisitEarResult,
  right: VisitEarResult,
  firstRun: SwappedRepeatOutcomeInput["first"] = first,
): SwappedRepeatOutcomeInput =>
  Object.freeze({
    first: firstRun,
    repeat: Object.freeze({ left, right }),
  });

describe("swappedRepeatOutcome", () => {
  it("uses the shipped limit and half of it", () => {
    expect(hearingMethodConfig.swappedRepeatDifferenceDb).toBe(15);
    expect(swappedRepeatConfig.unclearBelowLimitFraction).toBe(0.5);
    const judgement = swappedRepeatOutcome(input(found(-40), found(-20)));
    expect(judgement.differenceLimitDb).toBe(15);
    expect(judgement.unclearBelowDb).toBe(7.5);
  });

  it("gives followsEar when the same ear needed the louder sound both times", () => {
    expect(swappedRepeatOutcome(input(found(-40), found(-20)))).toEqual({
      outcome: "followsEar",
      unclearReason: null,
      firstRightMinusLeftDb: 20,
      rightMinusLeftDb: 20,
      differenceLimitDb: 15,
      unclearBelowDb: 7.5,
    });
  });

  it("gives followsEarpiece when the other ear needed the louder sound in the repeat", () => {
    expect(swappedRepeatOutcome(input(found(-20), found(-40)))).toEqual({
      outcome: "followsEarpiece",
      unclearReason: null,
      firstRightMinusLeftDb: 20,
      rightMinusLeftDb: -20,
      differenceLimitDb: 15,
      unclearBelowDb: 7.5,
    });
  });

  it.each(withoutLevel)(
    "gives unclear with noLevel and no difference when a repeat ear is $state",
    (ear) => {
      for (const [left, right] of [
        [ear, found(-20)],
        [found(-40), ear],
        [ear, ear],
      ] as const) {
        expect(swappedRepeatOutcome(input(left, right))).toEqual({
          outcome: "unclear",
          unclearReason: "noLevel",
          firstRightMinusLeftDb: 20,
          rightMinusLeftDb: null,
          differenceLimitDb: 15,
          unclearBelowDb: 7.5,
        });
      }
    },
  );

  it("counts a difference of 5 dB as shrunk and one of 10 dB not", () => {
    const five = swappedRepeatOutcome(input(found(-30), found(-25)));
    expect(five.outcome).toBe("unclear");
    expect(five.unclearReason).toBe("differenceShrank");
    expect(five.rightMinusLeftDb).toBe(5);
    const minusFive = swappedRepeatOutcome(input(found(-25), found(-30)));
    expect(minusFive.unclearReason).toBe("differenceShrank");
    expect(swappedRepeatOutcome(input(found(-30), found(-20))).outcome).toBe(
      "followsEar",
    );
    expect(swappedRepeatOutcome(input(found(-20), found(-30))).outcome).toBe(
      "followsEarpiece",
    );
  });

  it("gives unclear with differenceShrank for a repeat difference of 0", () => {
    expect(swappedRepeatOutcome(input(found(-25), found(-25)))).toEqual({
      outcome: "unclear",
      unclearReason: "differenceShrank",
      firstRightMinusLeftDb: 20,
      rightMinusLeftDb: 0,
      differenceLimitDb: 15,
      unclearBelowDb: 7.5,
    });
  });

  it("gives the same outcome when both runs are mirrored left for right", () => {
    const pairs: readonly (readonly [number, number, number, number])[] = [
      [-40, -20, -40, -20],
      [-40, -20, -20, -40],
      [-40, -20, -30, -25],
      [-40, -20, -25, -25],
      [-10, -30, -35, -20],
      [-50, -35, -50, -40],
    ];
    for (const [firstLeft, firstRight, repeatLeft, repeatRight] of pairs) {
      const judgement = swappedRepeatOutcome(
        input(found(repeatLeft), found(repeatRight), {
          left: found(firstLeft),
          right: found(firstRight),
        }),
      );
      const mirrored = swappedRepeatOutcome(
        input(found(repeatRight), found(repeatLeft), {
          left: found(firstRight),
          right: found(firstLeft),
        }),
      );
      expect(mirrored.outcome).toBe(judgement.outcome);
      expect(mirrored.unclearReason).toBe(judgement.unclearReason);
    }
    for (const ear of withoutLevel) {
      expect(
        swappedRepeatOutcome(
          input(found(-20), ear, { left: found(-20), right: found(-40) }),
        ).outcome,
      ).toBe(swappedRepeatOutcome(input(ear, found(-20))).outcome);
    }
  });

  it("throws a RangeError for a first run that does not offer the repeat", () => {
    for (const ear of withoutLevel) {
      expect(() =>
        swappedRepeatOutcome(
          input(found(-40), found(-20), { left: ear, right: found(-20) }),
        ),
      ).toThrow(RangeError);
      expect(() =>
        swappedRepeatOutcome(
          input(found(-40), found(-20), { left: found(-40), right: ear }),
        ),
      ).toThrow(RangeError);
    }
    expect(() =>
      swappedRepeatOutcome(
        input(found(-40), found(-20), { left: found(-40), right: found(-30) }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      swappedRepeatOutcome(
        input(found(-40), found(-20), { left: found(-40), right: found(-40) }),
      ),
    ).toThrow(RangeError);
    // Exactly the limit offers the repeat.
    expect(
      swappedRepeatOutcome(
        input(found(-40), found(-20), { left: found(-40), right: found(-25) }),
      ).firstRightMinusLeftDb,
    ).toBe(15);
  });

  it("throws a RangeError for settings outside 0 < unclearBelowDb ≤ differenceLimitDb", () => {
    const bad = [
      { differenceLimitDb: 15, unclearBelowDb: 0 },
      { differenceLimitDb: 15, unclearBelowDb: -1 },
      { differenceLimitDb: 15, unclearBelowDb: 16 },
      { differenceLimitDb: 15, unclearBelowDb: Number.NaN },
      { differenceLimitDb: Number.POSITIVE_INFINITY, unclearBelowDb: 7.5 },
      { differenceLimitDb: Number.NaN, unclearBelowDb: 7.5 },
    ];
    for (const settings of bad) {
      expect(() =>
        swappedRepeatOutcome(input(found(-40), found(-20)), settings),
      ).toThrow(RangeError);
    }
    expect(
      swappedRepeatOutcome(input(found(-40), found(-20)), {
        differenceLimitDb: 15,
        unclearBelowDb: 15,
      }).outcome,
    ).toBe("followsEar");
  });

  it("gives a frozen result and leaves its input unchanged", () => {
    const given = input(found(-40), found(-20));
    const before = structuredClone(given);
    const judgement = swappedRepeatOutcome(given);
    expect(Object.isFrozen(judgement)).toBe(true);
    expect(given).toEqual(before);
  });
});

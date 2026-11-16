import { hearingMethodConfig } from "../config/hearing-method-config";
import { swappedRepeatConfig } from "../config/swapped-repeat-config";
import type {
  SwappedRepeatOutcome,
  SwappedRepeatUnclearReason,
  VisitEarResult,
} from "./visit-flow-types";

/** What `swappedRepeatOutcome` judges (swapped-repeat design.md, "The outcome"). */
export interface SwappedRepeatOutcomeInput {
  /** The floor's first run, as the summary gives it. Both ears found, at least the limit apart. */
  readonly first: {
    readonly left: VisitEarResult;
    readonly right: VisitEarResult;
  };
  /** The repeat's ears, after `levelNotAsAsked`. */
  readonly repeat: {
    readonly left: VisitEarResult;
    readonly right: VisitEarResult;
  };
}

/** The two sizes the rule compares with. */
export interface SwappedRepeatOutcomeSettings {
  /** `hearingMethodConfig.swappedRepeatDifferenceDb`. */
  readonly differenceLimitDb: number;
  /** That times `swappedRepeatConfig.unclearBelowLimitFraction`. */
  readonly unclearBelowDb: number;
}

/** The outcome with the numbers it was judged from. Frozen plain data. */
export interface SwappedRepeatJudgement {
  readonly outcome: SwappedRepeatOutcome;
  readonly unclearReason: SwappedRepeatUnclearReason | null;
  readonly firstRightMinusLeftDb: number;
  readonly rightMinusLeftDb: number | null;
  readonly differenceLimitDb: number;
  readonly unclearBelowDb: number;
}

const shippedOutcomeSettings: SwappedRepeatOutcomeSettings = Object.freeze({
  differenceLimitDb: hearingMethodConfig.swappedRepeatDifferenceDb,
  unclearBelowDb:
    hearingMethodConfig.swappedRepeatDifferenceDb *
    swappedRepeatConfig.unclearBelowLimitFraction,
});

/**
 * Where the difference of a repeated floor seems to belong, by the brief's rule (swapped-repeat
 * design.md, "The outcome", D10, R10). Both differences are right minus left, by ear. A repeat
 * ear without a level gives `unclear` with `noLevel`; a repeat difference smaller than
 * `unclearBelowDb` gives `unclear` with `differenceShrank`; otherwise the same sign as the first
 * run gives `followsEar` (the same ear needed the louder sound both times) and the other sign
 * `followsEarpiece` (the same earpiece did). Throws a `RangeError` when the first run's ears are
 * not both found or less than the limit apart, and for settings outside
 * `0 < unclearBelowDb ≤ differenceLimitDb`. The rule of the brief is kept as it is (Q1, decided by
 * the owner on 2026-11-15). A pure function; the result is frozen.
 */
export function swappedRepeatOutcome(
  input: SwappedRepeatOutcomeInput,
  settings: SwappedRepeatOutcomeSettings = shippedOutcomeSettings,
): SwappedRepeatJudgement {
  const { differenceLimitDb, unclearBelowDb } = settings;
  if (
    !Number.isFinite(differenceLimitDb) ||
    !Number.isFinite(unclearBelowDb) ||
    unclearBelowDb <= 0 ||
    unclearBelowDb > differenceLimitDb
  ) {
    throw new RangeError(
      `The outcome's settings must be finite with 0 < unclearBelowDb ≤ differenceLimitDb, but got ${String(unclearBelowDb)} and ${String(differenceLimitDb)}.`,
    );
  }
  const { first, repeat } = input;
  if (first.left.state !== "found" || first.right.state !== "found") {
    throw new RangeError(
      `A repeated floor's first run has both ears found, but got ${first.left.state} and ${first.right.state}.`,
    );
  }
  const firstRightMinusLeftDb =
    first.right.thresholdDb - first.left.thresholdDb;
  if (
    !Number.isFinite(firstRightMinusLeftDb) ||
    Math.abs(firstRightMinusLeftDb) < differenceLimitDb
  ) {
    throw new RangeError(
      `A repeated floor's first run is at least ${String(differenceLimitDb)} dB apart, but got ${String(firstRightMinusLeftDb)}.`,
    );
  }
  const judgement = (
    outcome: SwappedRepeatOutcome,
    unclearReason: SwappedRepeatUnclearReason | null,
    rightMinusLeftDb: number | null,
  ): SwappedRepeatJudgement =>
    Object.freeze({
      outcome,
      unclearReason,
      firstRightMinusLeftDb,
      rightMinusLeftDb,
      differenceLimitDb,
      unclearBelowDb,
    });
  if (repeat.left.state !== "found" || repeat.right.state !== "found") {
    return judgement("unclear", "noLevel", null);
  }
  const rightMinusLeftDb = repeat.right.thresholdDb - repeat.left.thresholdDb;
  if (Math.abs(rightMinusLeftDb) < unclearBelowDb) {
    return judgement("unclear", "differenceShrank", rightMinusLeftDb);
  }
  return Math.sign(rightMinusLeftDb) === Math.sign(firstRightMinusLeftDb)
    ? judgement("followsEar", null, rightMinusLeftDb)
    : judgement("followsEarpiece", null, rightMinusLeftDb);
}

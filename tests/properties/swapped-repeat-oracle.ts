import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { swappedRepeatConfig } from "../../src/config/swapped-repeat-config";
import type { SwappedRepeatOutcome } from "../../src/session/visit-flow-types";

// The oracle of "Correct attribution" (swapped-repeat design.md, "Correctness properties", "The
// oracle"; CP1). It is written from R10 and the rule of "The outcome", applied to the true
// differences, not from the code of swappedRepeatOutcome. With an Ear_Difference E and a
// Headphone_Imbalance H, the first run, as marked, measures about D1 = E + H and the repeat,
// swapped, about D2 = E − H, each within one upward step for a Step_Listener (threshold-search
// CP1). So the rule's own answer for D1 and D2 is expected, and within one step of a boundary of
// the rule (|D1| = the limit, |D2| = half the limit) the neighbouring answer is accepted too. This
// is the owner's decision of 2026-11-15 (Q1, option (a)); the rule of the brief is kept as it is.

/** What a floor gives: no offer, or the outcome of its repeat. */
export type AttributionAnswer = "notOffered" | SwappedRepeatOutcome;

/** What the oracle needs of one run: whether each ear has a level. */
export interface OracleRun {
  readonly left: { readonly state: string };
  readonly right: { readonly state: string };
}

export interface OracleInput {
  /** E: the true right threshold minus the true left threshold, by ear. */
  readonly earDifferenceDb: number;
  /** H: how much quieter the right earpiece plays than the left. */
  readonly imbalanceDb: number;
  /** The first run's ear results, as marked. */
  readonly first: OracleRun;
  /** The repeat's ear results, swapped. */
  readonly repeat: OracleRun;
}

const stepDb = hearingMethodConfig.upwardStepDb;
const limitDb = hearingMethodConfig.swappedRepeatDifferenceDb;
const halfLimitDb = limitDb * swappedRepeatConfig.unclearBelowLimitFraction;

const hasLevel = (run: OracleRun): boolean =>
  run.left.state === "found" && run.right.state === "found";

/** The attribution of a repeat difference of this sign, against a first difference of that sign. */
const attributionOf = (d1: number, d2: number): SwappedRepeatOutcome =>
  Math.sign(d2) === Math.sign(d1) ? "followsEar" : "followsEarpiece";

/**
 * The answers accepted for one case:
 *
 * ```
 * D1 = E + H, D2 = E − H, s = upwardStepDb, L = swappedRepeatDifferenceDb, h = L × unclearBelowLimitFraction
 * first run has an ear without a level   → { notOffered }               (the summary offers nothing)
 * |D1| < L − s                           → { notOffered }
 * L − s ≤ |D1| < L + s                   → notOffered is accepted too
 * repeat has an ear without a level      → unclear                     (noLevel)
 * otherwise: expected = |D2| < h ? unclear : sign(D2) = sign(D1) ? followsEar : followsEarpiece
 *            | |D2| − h | < s            → unclear and the attribution of D2's sign are accepted too
 * ```
 *
 * The offer is tested before the repeat's ears, as the design's pseudo-code now gives it: a floor
 * whose first run is found on both ears but too close to offer the repeat offers nothing, whatever
 * a repeat run of it would give, and `unclear` (R10.3) is the outcome of an offered floor only.
 * (Task 6 found that the order first written in the design, the repeat's ears before the offer,
 * would accept only `unclear` for such a floor, and the design was corrected to this order.)
 */
export function acceptedAnswers(
  input: OracleInput,
): ReadonlySet<AttributionAnswer> {
  if (!hasLevel(input.first)) {
    return new Set<AttributionAnswer>(["notOffered"]);
  }
  const d1 = input.earDifferenceDb + input.imbalanceDb;
  const d2 = input.earDifferenceDb - input.imbalanceDb;
  if (Math.abs(d1) < limitDb - stepDb) {
    return new Set<AttributionAnswer>(["notOffered"]);
  }
  const accepted = new Set<AttributionAnswer>();
  if (Math.abs(d1) < limitDb + stepDb) {
    accepted.add("notOffered");
  }
  if (!hasLevel(input.repeat)) {
    accepted.add("unclear");
    return accepted;
  }
  accepted.add(Math.abs(d2) < halfLimitDb ? "unclear" : attributionOf(d1, d2));
  if (Math.abs(Math.abs(d2) - halfLimitDb) < stepDb) {
    accepted.add("unclear");
    accepted.add(attributionOf(d1, d2));
  }
  return accepted;
}

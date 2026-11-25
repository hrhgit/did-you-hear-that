import type { HeadphoneTraitsConfig } from "../config/headphone-traits-config";
import { headphoneTraitsConfig } from "../config/headphone-traits-config";
import type { Ear } from "../engine/search-types";
import { quantile } from "./output-delay";

export type BalanceSettings = Pick<
  HeadphoneTraitsConfig,
  | "balancePitchesMinCount"
  | "balanceOffsetMinDb"
  | "balanceEvenBelowDb"
  | "balanceSpreadMaxDb"
>;

/** The levels both ears found at one pitch. */
export interface PitchPair {
  readonly frequencyHz: number;
  readonly leftDb: number;
  readonly rightDb: number;
}

export type Balance =
  | { readonly kind: "even"; readonly pitchCount: number }
  | {
      readonly kind: "offset";
      /** The side that needed louder sounds at every pitch. */
      readonly quieterSide: Ear;
      /** How much louder, the median over the pitches, 0 and up. */
      readonly offsetDb: number;
      readonly pitchCount: number;
    };

/**
 * One side quieter than the other by about the same at every pitch, or the two even
 * (headphone-traits design.md "The balance"). Null when one visit cannot say. A pure function.
 */
export function estimateBalance(
  pairs: readonly PitchPair[],
  settings: BalanceSettings = headphoneTraitsConfig,
): Balance | null {
  if (pairs.length < settings.balancePitchesMinCount) {
    return null;
  }
  const differences = pairs.map(({ leftDb, rightDb }) => leftDb - rightDb);
  const offset = quantile(differences, 0.5);
  const spread = quantile(
    differences.map((difference) => Math.abs(difference - offset)),
    0.5,
  );
  if (spread > settings.balanceSpreadMaxDb) {
    return null;
  }
  if (Math.abs(offset) < settings.balanceEvenBelowDb) {
    return Object.freeze({ kind: "even" as const, pitchCount: pairs.length });
  }
  const sameSide = differences.filter(
    (difference) => Math.sign(difference) === Math.sign(offset),
  ).length;
  if (
    Math.abs(offset) < settings.balanceOffsetMinDb ||
    sameSide < pairs.length - 1
  ) {
    return null;
  }
  return Object.freeze({
    kind: "offset" as const,
    quieterSide: offset > 0 ? ("left" as const) : ("right" as const),
    offsetDb: Math.abs(offset),
    pitchCount: pairs.length,
  });
}

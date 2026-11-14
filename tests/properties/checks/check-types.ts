// The shape of a check module (design.md, `SearchUnderTest` and the checks). Each module in this
// directory exports one check object. The Vitest files and the property CLI both read it, so the
// same property runs in both with the same parameters.

import type fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { SearchUnderTest } from "../../listeners/search-under-test";

/** The five properties of `docs/briefs/01-threshold-search.md`. */
export type BriefPropertyNumber = 1 | 2 | 3 | 4 | 5;

export interface CheckIdentity {
  /** The correctness property in design.md, for example "CP5". */
  readonly id: string;
  /** Names the part when one property is split over several checks, for example "room total". */
  readonly part?: string;
  readonly title: string;
  /** The brief property this check is part of, if any (design.md, Correctness properties). */
  readonly briefProperty?: BriefPropertyNumber;
  /** The requirements the check covers, for example ["R5.4", "R5.5"]. */
  readonly requirements: readonly string[];
}

/** How fast-check runs a universal check. The seed is left random on purpose (D19). */
export interface UniversalCheckParameters {
  readonly numRuns: number;
}

/** A universal check that runs against any `SearchUnderTest` (D21). */
export interface HarnessNeutralUniversalCheck extends CheckIdentity {
  readonly kind: "universal";
  readonly harnessNeutral: true;
  /** Why the check cannot be run against `search` at all, or undefined when it can (R16.5). */
  notCheckableReason(search: SearchUnderTest): string | undefined;
  property(
    search: SearchUnderTest,
    settings: fc.Arbitrary<ThresholdSearchSettings>,
  ): fc.IProperty<unknown>;
  readonly parameters: UniversalCheckParameters;
}

/** A universal check of this spec's own design, run against the spec engine only (D21). */
export interface SpecOnlyUniversalCheck extends CheckIdentity {
  readonly kind: "universal";
  readonly harnessNeutral: false;
  property(
    settings: fc.Arbitrary<ThresholdSearchSettings>,
  ): fc.IProperty<unknown>;
  readonly parameters: UniversalCheckParameters;
}

export type UniversalCheck =
  HarnessNeutralUniversalCheck | SpecOnlyUniversalCheck;

/**
 * What a statistical check found: whether it holds, the first counterexample when it does not,
 * and the numbers it measured. The property CLI writes all three to its JSON summary.
 */
export interface StatisticalVerdict {
  readonly holds: boolean;
  /** A description of the first case that does not hold, when there is one. */
  readonly firstCounterexample?: unknown;
  readonly metrics: Readonly<Record<string, unknown>>;
}

/** How a statistical check runs: its fixed seed, its run counts and its Vitest timeout (D19). */
export interface StatisticalCheckParameters {
  readonly seed: number;
  readonly timeoutMs: number;
  readonly [name: string]: number;
}

/**
 * A statistical check that runs against any `SearchUnderTest` (D21). `evaluate` throws a
 * `NotCheckableError` when a run lacks what the check needs (R16.5).
 */
export interface HarnessNeutralStatisticalCheck extends CheckIdentity {
  readonly kind: "statistical";
  readonly harnessNeutral: true;
  notCheckableReason(search: SearchUnderTest): string | undefined;
  evaluate(
    search: SearchUnderTest,
    settings: ThresholdSearchSettings,
  ): StatisticalVerdict;
  readonly parameters: StatisticalCheckParameters;
}

/** A statistical check of this spec's own design, run against the spec engine only (D21). */
export interface SpecOnlyStatisticalCheck extends CheckIdentity {
  readonly kind: "statistical";
  readonly harnessNeutral: false;
  evaluate(settings: ThresholdSearchSettings): StatisticalVerdict;
  readonly parameters: StatisticalCheckParameters;
}

export type StatisticalCheck =
  HarnessNeutralStatisticalCheck | SpecOnlyStatisticalCheck;

export type HarnessNeutralCheck =
  HarnessNeutralUniversalCheck | HarnessNeutralStatisticalCheck;

export type SpecOnlyCheck = SpecOnlyUniversalCheck | SpecOnlyStatisticalCheck;

import { atMostFraction } from "../engine/fraction-comparisons";
import type { LoggedRoomResult } from "./visit-flow-types";

/** The pooled counts of a visit and whether their rate is above the visit limit. */
export interface VisitFalseAlarmJudgement {
  /** No-sound trials summed over the room results given. */
  readonly pooledNoSoundTrialCount: number;
  /** Answers to them, summed over the same room results. */
  readonly pooledFalseAlarmCount: number;
  /** `pooledFalseAlarmCount / pooledNoSoundTrialCount`, or 0 without no-sound trials. */
  readonly pooledFalseAlarmRateFraction: number;
  /** Whether the pooled rate is above the limit. A rate exactly at the limit is not above it. */
  readonly aboveLimit: boolean;
}

/**
 * The visit-level false alarm rule (R17, D17). Sums the no-sound trials and the false alarms of
 * the room results it is given and judges the pooled rate against `limitFraction` with the
 * engine's `atMostFraction`, as the engine judges its per-room limit. Without no-sound trials the
 * rate is 0 and not above the limit. A pure function, called by the visit summary and by the
 * measurement of the rule. The limit the flow passes was decided by the owner's coordinator on
 * 2026-11-16, at the owner's request (Q1).
 */
export function judgeVisitFalseAlarms(
  roomResults: readonly Pick<
    LoggedRoomResult,
    "noSoundTrialCount" | "falseAlarmCount"
  >[],
  limitFraction: number,
): VisitFalseAlarmJudgement {
  let pooledNoSoundTrialCount = 0;
  let pooledFalseAlarmCount = 0;
  for (const roomResult of roomResults) {
    pooledNoSoundTrialCount += roomResult.noSoundTrialCount;
    pooledFalseAlarmCount += roomResult.falseAlarmCount;
  }
  const hasNoSoundTrials = pooledNoSoundTrialCount > 0;
  return Object.freeze({
    pooledNoSoundTrialCount,
    pooledFalseAlarmCount,
    pooledFalseAlarmRateFraction: hasNoSoundTrials
      ? pooledFalseAlarmCount / pooledNoSoundTrialCount
      : 0,
    aboveLimit:
      hasNoSoundTrials &&
      !atMostFraction(
        pooledFalseAlarmCount,
        pooledNoSoundTrialCount,
        limitFraction,
      ),
  });
}

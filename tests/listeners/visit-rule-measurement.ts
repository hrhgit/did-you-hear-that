// The measurement of the visit-level false alarm rule (visit-flow design.md, "The measurement" and
// "Measurements"; R23). It plays whole visits room by room through the shipped engine, judges
// every ear with `classifyAccuracy`, and applies the session's `judgeVisitFalseAlarms` at each
// candidate limit. It reports counts and decides nothing: the limit is the project owner's
// choice (Q1).

import {
  hearingMethodConfig,
  type HearingMethodConfig,
  type VisitType,
} from "../../src/config/hearing-method-config";
import {
  createSeededRandom,
  type RandomSource,
} from "../../src/config/seeded-random";
import type {
  RoomResult,
  ThresholdSearchSettings,
} from "../../src/engine/search-types";
import { judgeVisitFalseAlarms } from "../../src/session/judge-visit-false-alarms";
import { listenerSetSeed } from "../properties/checks/measure-listener-set";
import { classifyAccuracy, type AccuracyClass } from "./classify-accuracy";
import {
  drawListenerParameters,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import { drawSeed } from "./play-population-rooms";
import {
  createPsychometricListener,
  type PsychometricListenerParameters,
} from "./psychometric-listener";
import { generousTrialBudgetCount } from "./search-under-test";
import { runSpecRoom } from "./spec-search-under-test";

/** Who plays the visits: one parameter set in every visit, or a new set per visit from a range. */
export type VisitRuleListener =
  | {
      readonly kind: "fixed";
      readonly parameters: PsychometricListenerParameters;
    }
  | { readonly kind: "range"; readonly range: ListenerParameterRange };

/** One measured visit. */
export interface MeasuredVisit {
  /** The listener's parameters, the same in every room of the visit. */
  readonly parameters: PsychometricListenerParameters;
  /** No-sound trials summed over the visit's rooms. */
  readonly pooledNoSoundTrialCount: number;
  /** Answers to them. */
  readonly pooledFalseAlarmCount: number;
  /** Whether the engine's per-room rule marked at least one room of the visit. */
  readonly roomMarkedByRoomRule: boolean;
  /** The class of every ear without a visit rule: left then right, room by room. */
  readonly earAccuracies: readonly AccuracyClass[];
  /** Whether the visit rule marks the visit, one entry per limit of the measurement. */
  readonly markedAtLimit: readonly boolean[];
}

/** The ears and visits of a group of visits, with no visit rule or at one limit. */
export interface VisitRuleRow {
  /** The visit limit, or null for no visit rule. */
  readonly limitFraction: number | null;
  readonly visitCount: number;
  readonly visitsMarkedCount: number;
  readonly visitsMarkedFraction: number;
  readonly earCount: number;
  readonly accurateCount: number;
  readonly flaggedCount: number;
  readonly wrongCount: number;
  readonly accurateFraction: number;
  readonly flaggedFraction: number;
  readonly wrongFraction: number;
  /** `1 − wrong with the rule / wrong without it`, or null for no rule or no Wrong ear without it. */
  readonly wrongRemovedFraction: number | null;
}

export interface VisitRuleMeasurement {
  readonly listener: VisitRuleListener;
  readonly visitType: VisitType;
  readonly roomCount: number;
  readonly visitCount: number;
  readonly seed: number;
  readonly limits: readonly number[];
  readonly visits: readonly MeasuredVisit[];
  /** The whole measurement: first with no visit rule, then one row per limit in order. */
  readonly rows: readonly VisitRuleRow[];
}

/** The settings the measurement plays and judges with: the engine's part of the shipped config. */
export type VisitRuleSettings = ThresholdSearchSettings &
  Pick<HearingMethodConfig, "roomFrequenciesHz">;

/**
 * The seed of the visits of one fixed parameter set: the set's own seed (threshold-search D39)
 * XOR the number of rooms of the visit type, so that a quick and a full measurement of the same
 * set draw different rooms ("Measurements", "What the rule removes from the D43 case").
 */
export function fixedListenerVisitSeed(
  parameters: PsychometricListenerParameters,
  visitType: VisitType,
  settings: VisitRuleSettings = hearingMethodConfig,
): number {
  return (
    (listenerSetSeed(parameters) ^
      settings.roomFrequenciesHz[visitType].length) >>>
    0
  );
}

function playVisit(
  parameters: PsychometricListenerParameters,
  roomCount: number,
  limits: readonly number[],
  seeds: RandomSource,
  settings: VisitRuleSettings,
): MeasuredVisit {
  const roomResults: RoomResult[] = [];
  const earAccuracies: AccuracyClass[] = [];
  let roomMarkedByRoomRule = false;
  for (let room = 0; room < roomCount; room += 1) {
    const engineSeed = drawSeed(seeds);
    const listenerSeed = drawSeed(seeds);
    const result = runSpecRoom({
      seed: engineSeed,
      settings,
      listener: createPsychometricListener(
        parameters,
        createSeededRandom(listenerSeed),
      ),
      trialBudget: generousTrialBudgetCount,
    });
    roomResults.push(result);
    roomMarkedByRoomRule ||= result.falseAlarmRateAboveLimit;
    for (const ear of ["left", "right"] as const) {
      const earResult = result[ear];
      earAccuracies.push(
        classifyAccuracy(
          earResult.state === "found"
            ? { state: "found", thresholdDb: earResult.thresholdDb }
            : { state: earResult.state },
          parameters.trueThresholdDb[ear],
          settings,
        ),
      );
    }
  }
  const pooled = judgeVisitFalseAlarms(roomResults, 0);
  return Object.freeze({
    parameters,
    pooledNoSoundTrialCount: pooled.pooledNoSoundTrialCount,
    pooledFalseAlarmCount: pooled.pooledFalseAlarmCount,
    roomMarkedByRoomRule,
    earAccuracies: Object.freeze(earAccuracies),
    markedAtLimit: Object.freeze(
      limits.map(
        (limitFraction) =>
          judgeVisitFalseAlarms(roomResults, limitFraction).aboveLimit,
      ),
    ),
  });
}

const shareOf = (count: number, total: number): number =>
  total > 0 ? count / total : 0;

/**
 * Counts the ears and visits of `visits`: first with no visit rule, then at each limit of the
 * measurement they came from. With a rule, every ear of a marked visit counts as Flagged
 * ("Measurements").
 */
export function summarizeMeasuredVisits(
  visits: readonly MeasuredVisit[],
  limits: readonly number[],
): readonly VisitRuleRow[] {
  const row = (limitIndex: number | null): VisitRuleRow => {
    const counts: Record<AccuracyClass, number> = {
      accurate: 0,
      flagged: 0,
      wrong: 0,
    };
    let visitsMarkedCount = 0;
    for (const visit of visits) {
      const marked =
        limitIndex !== null && visit.markedAtLimit[limitIndex] === true;
      if (marked) {
        visitsMarkedCount += 1;
      }
      for (const accuracy of visit.earAccuracies) {
        counts[marked ? "flagged" : accuracy] += 1;
      }
    }
    const earCount = counts.accurate + counts.flagged + counts.wrong;
    return Object.freeze({
      limitFraction: limitIndex === null ? null : limits[limitIndex],
      visitCount: visits.length,
      visitsMarkedCount,
      visitsMarkedFraction: shareOf(visitsMarkedCount, visits.length),
      earCount,
      accurateCount: counts.accurate,
      flaggedCount: counts.flagged,
      wrongCount: counts.wrong,
      accurateFraction: shareOf(counts.accurate, earCount),
      flaggedFraction: shareOf(counts.flagged, earCount),
      wrongFraction: shareOf(counts.wrong, earCount),
      wrongRemovedFraction: null,
    });
  };
  const withoutRule = row(null);
  const withRule = limits.map((_, index) => {
    const limited = row(index);
    return Object.freeze({
      ...limited,
      wrongRemovedFraction:
        withoutRule.wrongCount > 0
          ? 1 - limited.wrongCount / withoutRule.wrongCount
          : null,
    });
  });
  return Object.freeze([withoutRule, ...withRule]);
}

/**
 * Plays `visitCount` visits of `visitType` (R23.1). Every number comes from one source made from
 * `seed`. For each visit in turn it draws, for a range listener, the six parameters with
 * `drawListenerParameters`; then, for each room, the engine seed and the listener seed. A fixed
 * listener draws no parameters. The listener keeps its parameters in every room of its visit and
 * gets a new listener source per room. Every room plays the shipped engine with `settings` until
 * it finishes, and its ears are judged with `classifyAccuracy` against the same settings.
 */
export function measureVisitFalseAlarmRule(options: {
  readonly listener: VisitRuleListener;
  readonly visitType: VisitType;
  readonly visitCount: number;
  readonly seed: number;
  readonly limits: readonly number[];
  readonly settings?: VisitRuleSettings;
}): VisitRuleMeasurement {
  const {
    listener,
    visitType,
    visitCount,
    seed,
    limits,
    settings = hearingMethodConfig,
  } = options;
  const roomCount = settings.roomFrequenciesHz[visitType].length;
  const seeds = createSeededRandom(seed);
  const visits: MeasuredVisit[] = [];
  for (let visit = 0; visit < visitCount; visit += 1) {
    const parameters =
      listener.kind === "fixed"
        ? listener.parameters
        : drawListenerParameters(listener.range, settings, seeds);
    visits.push(playVisit(parameters, roomCount, limits, seeds, settings));
  }
  return Object.freeze({
    listener,
    visitType,
    roomCount,
    visitCount,
    seed,
    limits: Object.freeze([...limits]),
    visits: Object.freeze(visits),
    rows: summarizeMeasuredVisits(visits, limits),
  });
}

// The measurement of "Correct attribution" (swapped-repeat design.md, "Measurements", D27; R21.4).
// For each pair of an Ear_Difference E and a Headphone_Imbalance H it plays a floor twice through
// the shipped engine, once with the earpieces as marked and once swapped, with a listener in
// Worn_Headphones, and gives the answer the house would give: not offered, or the outcome of
// `swappedRepeatOutcome`. It then counts the answers against the brief's sentences read as written
// ("literal") and against the rule applied to the true differences D1 = E + H and D2 = E − H
// ("rule oracle"), with one and with two upward steps of tolerance. It decides nothing: the
// property's statement is the owner's (Q1, decided by the owner on 2026-11-15) and the choice of
// listeners is Q2, decided by the owner's coordinator on 2026-11-16, at the owner's request. It
// changes no config value. The figures come from the engine alone and say nothing about real
// visitors.

import type { HearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { RandomSource } from "../../src/config/seeded-random";
import { earpieceOnEar } from "../../src/session/earpiece-on-ear";
import { swappedRepeatOutcome } from "../../src/session/swapped-repeat-outcome";
import type {
  EarpieceArrangement,
  SwappedRepeatOutcome,
  VisitEarResult,
} from "../../src/session/visit-flow-types";
import {
  attentiveListenerRange,
  drawListenerParameters,
  plausibleListenerRange,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import type { SimulatedListener } from "./listener-types";
import { drawSeed } from "./play-population-rooms";
import {
  createPsychometricListener,
  type PsychometricListenerParameters,
} from "./psychometric-listener";
import {
  generousTrialBudgetCount,
  type RunEarResult,
} from "./search-under-test";
import { specSearchUnderTest } from "./spec-search-under-test";
import { wornHeadphones } from "./worn-headphones";

/** What a floor gives: no offer, or the outcome of its repeat. */
export type AttributionAnswer = "notOffered" | SwappedRepeatOutcome;

/** The three kinds of listener: Step_Listeners, and psychometric listeners of the Attentive and the Plausible ranges. */
export type AttributionListenerKind = "step" | "attentive" | "plausible";

/** The four cases of the brief's property, by E and H against the limit. */
export type AttributionCaseName =
  "both" | "neither" | "onlyEar" | "onlyEarpiece";

/** One pair played once: both runs and the answer. */
export interface AttributionRun {
  readonly earDifferenceDb: number;
  readonly imbalanceDb: number;
  readonly baseDb: number;
  /** The first run's right minus left, by ear, when both are found; otherwise null. */
  readonly firstRightMinusLeftDb: number | null;
  /** The repeat's right minus left, by ear, when both are found; otherwise null. */
  readonly repeatRightMinusLeftDb: number | null;
  /**
   * Whether the answer comes from an ear without a level: the first run's, which gives no offer,
   * or, on a floor the first run offers, the repeat's, which gives `unclear`.
   */
  readonly answerWithoutLevel: boolean;
  readonly answer: AttributionAnswer;
}

/** The counts of one kind of listener over the grid. */
export interface AttributionKindCounts {
  readonly kind: AttributionListenerKind;
  readonly runCount: number;
  readonly notOfferedCount: number;
  readonly followsEarCount: number;
  readonly followsEarpieceCount: number;
  readonly unclearCount: number;
  /** Of the `unclear` answers, those whose repeat had an ear without a level. */
  readonly unclearWithoutLevelCount: number;
  readonly literalFailureCount: number;
  readonly ruleFailureOneStepCount: number;
  readonly ruleFailureTwoStepsCount: number;
}

/** The literal failures of one case, one run per pair, leaving out the pairs where a run had no level. */
export interface LiteralCaseCounts {
  readonly caseName: AttributionCaseName;
  readonly step: { readonly failureCount: number; readonly pairCount: number };
  readonly attentive: {
    readonly failureCount: number;
    readonly pairCount: number;
  };
  /** The first failing pair of the Step_Listeners in grid order (E, then H, from −40 up), or null. */
  readonly firstStepFailure: AttributionRun | null;
}

/** The measurement where one of E and H is zero. */
export interface OneSidedCounts {
  readonly kind: AttributionListenerKind;
  readonly runCount: number;
  /** Runs that gave the brief's answer: `followsEar` for H = 0, `followsEarpiece` for E = 0. */
  readonly briefAnswerCount: number;
  /** Runs that did not, with an ear without a level. */
  readonly withoutLevelCount: number;
  /** Runs that did not, with levels on both sides, within one step of the limit. */
  readonly withinOneStepCount: number;
  /** Every other run. */
  readonly otherCount: number;
}

export interface AttributionMeasurement {
  readonly gridSeed: number;
  readonly oneSidedSeed: number;
  readonly pairCount: number;
  readonly kinds: readonly AttributionKindCounts[];
  readonly literalCases: readonly LiteralCaseCounts[];
  readonly oneSided: readonly OneSidedCounts[];
  /** The rooms the engine played, for the print script's time per room. */
  readonly roomCount: number;
}

export interface AttributionMeasurementOptions {
  /** `hearingMethodConfig`: the search's settings, the limit and the step. */
  readonly settings: HearingMethodConfig;
  /** Half the limit, below which a repeat's difference counts as shrunk. */
  readonly unclearBelowLimitFraction: number;
  /** "Measurements": 20261120. */
  readonly gridSeed: number;
  /** "Measurements": 20261121. */
  readonly oneSidedSeed: number;
  /** "Measurements": −40 to 40 dB in 2 dB steps. */
  readonly gridMinDb: number;
  readonly gridMaxDb: number;
  readonly gridStepDb: number;
  /** "Measurements": a base level from −35 to −25 dB. */
  readonly baseMinDb: number;
  readonly baseMaxDb: number;
  /** "Measurements": one run per pair for Step_Listeners, three for the others. */
  readonly stepRunsPerPair: number;
  readonly psychometricRunsPerPair: number;
  /** "Measurements": E or H from 15 to 40 dB in 1 dB steps, each sign, ten runs each. */
  readonly oneSidedMinDb: number;
  readonly oneSidedMaxDb: number;
  readonly oneSidedRunsPerValue: number;
}

const kinds: readonly AttributionListenerKind[] = Object.freeze([
  "step",
  "attentive",
  "plausible",
]);

const rangeOf: Readonly<
  Record<Exclude<AttributionListenerKind, "step">, ListenerParameterRange>
> = Object.freeze({
  attentive: attentiveListenerRange,
  plausible: plausibleListenerRange,
});

/** The ear results the outcome reads: a state and, when found, a threshold. Counts are not read. */
const noCounts = Object.freeze({
  presentationCount: 0,
  catchCount: 0,
  wrongSideCount: 0,
  missCount: 0,
});

const visitEarResultOf = (ear: RunEarResult): VisitEarResult =>
  ear.state === "found"
    ? { ...noCounts, state: "found", thresholdDb: ear.thresholdDb }
    : // Every state without a level is unclear alike (`hearing-method.md`); the outcome reads only
      // whether the ear was found.
      { ...noCounts, state: "worseThanCap" };

const differenceOf = (run: {
  readonly left: RunEarResult;
  readonly right: RunEarResult;
}): number | null =>
  run.left.state === "found" && run.right.state === "found"
    ? run.right.thresholdDb - run.left.thresholdDb
    : null;

/** The parameters of one listener: a Step_Listener, or one drawn from a range, with the true thresholds of the pair. */
function listenerParameters(
  kind: AttributionListenerKind,
  earDifferenceDb: number,
  baseDb: number,
  settings: HearingMethodConfig,
  random: RandomSource,
): PsychometricListenerParameters {
  const trueThresholdDb = {
    left: baseDb - earDifferenceDb / 2,
    right: baseDb + earDifferenceDb / 2,
  };
  if (kind === "step") {
    return {
      trueThresholdDb,
      widthDb: 0,
      lapseFraction: 0,
      falseAlarmFraction: 0,
      wrongSideFraction: 0,
    };
  }
  // The range's own thresholds are drawn and replaced by the pair's, so that every kind draws
  // its other parameters as the population measurements do.
  return {
    ...drawListenerParameters(rangeOf[kind], settings, random),
    trueThresholdDb,
  };
}

/** One run of the floor in an arrangement, by a listener wearing headphones of imbalance H. */
function playRun(
  parameters: PsychometricListenerParameters,
  imbalanceDb: number,
  arrangement: EarpieceArrangement,
  engineSeed: number,
  listenerSeed: number,
  settings: HearingMethodConfig,
): { readonly left: RunEarResult; readonly right: RunEarResult } {
  const earpieces = earpieceOnEar(arrangement);
  const hear = wornHeadphones(
    createPsychometricListener(parameters, createSeededRandom(listenerSeed)),
    { imbalanceDb, earpieceOnEar: earpieces },
  );
  // The search asks for an ear; the output is asked for the earpiece on that ear.
  const listener: SimulatedListener = {
    respond: (trial) =>
      trial.kind === "sound"
        ? hear({
            kind: "sound",
            earpiece: earpieces[trial.ear],
            levelDb: trial.levelDb,
          })
        : hear({ kind: "noSound" }),
  };
  const run = specSearchUnderTest.runRoom({
    seed: engineSeed,
    settings,
    listener,
    trialBudget: generousTrialBudgetCount,
  });
  return run.ears;
}

/**
 * Plays one pair: draws the base level, the listener's other parameters, and an engine seed and a
 * listener seed for each run, in that order, from `random`; then the first run as marked and the
 * repeat swapped; and gives the answer the house would give.
 */
function playPair(
  kind: AttributionListenerKind,
  earDifferenceDb: number,
  imbalanceDb: number,
  options: AttributionMeasurementOptions,
  random: RandomSource,
): AttributionRun {
  const { settings } = options;
  const baseDb =
    options.baseMinDb + random.next() * (options.baseMaxDb - options.baseMinDb);
  const parameters = listenerParameters(
    kind,
    earDifferenceDb,
    baseDb,
    settings,
    random,
  );
  const firstEngineSeed = drawSeed(random);
  const firstListenerSeed = drawSeed(random);
  const repeatEngineSeed = drawSeed(random);
  const repeatListenerSeed = drawSeed(random);
  const first = playRun(
    parameters,
    imbalanceDb,
    "asMarked",
    firstEngineSeed,
    firstListenerSeed,
    settings,
  );
  const repeat = playRun(
    parameters,
    imbalanceDb,
    "swapped",
    repeatEngineSeed,
    repeatListenerSeed,
    settings,
  );
  const firstRightMinusLeftDb = differenceOf(first);
  const repeatRightMinusLeftDb = differenceOf(repeat);
  const limitDb = settings.swappedRepeatDifferenceDb;
  const offered =
    firstRightMinusLeftDb !== null &&
    Math.abs(firstRightMinusLeftDb) >= limitDb;
  const answerWithoutLevel =
    firstRightMinusLeftDb === null ||
    (offered && repeatRightMinusLeftDb === null);
  let answer: AttributionAnswer;
  if (!offered) {
    answer = "notOffered";
  } else {
    answer = swappedRepeatOutcome(
      {
        first: {
          left: visitEarResultOf(first.left),
          right: visitEarResultOf(first.right),
        },
        repeat: {
          left: visitEarResultOf(repeat.left),
          right: visitEarResultOf(repeat.right),
        },
      },
      {
        differenceLimitDb: limitDb,
        unclearBelowDb: limitDb * options.unclearBelowLimitFraction,
      },
    ).outcome;
  }
  return Object.freeze({
    earDifferenceDb,
    imbalanceDb,
    baseDb,
    firstRightMinusLeftDb,
    repeatRightMinusLeftDb,
    answerWithoutLevel,
    answer,
  });
}

/** The case of a pair: E and H each against the limit. */
export function attributionCaseOf(
  earDifferenceDb: number,
  imbalanceDb: number,
  limitDb: number,
): AttributionCaseName {
  const ear = Math.abs(earDifferenceDb) >= limitDb;
  const earpiece = Math.abs(imbalanceDb) >= limitDb;
  return ear && earpiece
    ? "both"
    : ear
      ? "onlyEar"
      : earpiece
        ? "onlyEarpiece"
        : "neither";
}

/**
 * The brief's sentences read as written: only the ear at or above the limit gives `followsEar`,
 * only the earpiece gives `followsEarpiece`, neither gives no offer, and for both no attribution is
 * stated (`unclear` or no offer). Within one upward step of the limit for E or H, that is with
 * | |E| − limit | or | |H| − limit | below the step, `unclear` and no offer are also accepted.
 */
export function literalAccepted(
  earDifferenceDb: number,
  imbalanceDb: number,
  settings: Pick<
    HearingMethodConfig,
    "swappedRepeatDifferenceDb" | "upwardStepDb"
  >,
): ReadonlySet<AttributionAnswer> {
  const limitDb = settings.swappedRepeatDifferenceDb;
  const stepDb = settings.upwardStepDb;
  const accepted = new Set<AttributionAnswer>();
  switch (attributionCaseOf(earDifferenceDb, imbalanceDb, limitDb)) {
    case "onlyEar":
      accepted.add("followsEar");
      break;
    case "onlyEarpiece":
      accepted.add("followsEarpiece");
      break;
    case "neither":
      accepted.add("notOffered");
      break;
    case "both":
      accepted.add("unclear");
      accepted.add("notOffered");
      break;
  }
  const near = (valueDb: number): boolean =>
    Math.abs(Math.abs(valueDb) - limitDb) < stepDb;
  if (near(earDifferenceDb) || near(imbalanceDb)) {
    accepted.add("unclear");
    accepted.add("notOffered");
  }
  return accepted;
}

/**
 * The rule applied to the true D1 = E + H and D2 = E − H, with `toleranceSteps` upward steps of
 * tolerance at each boundary of the rule (|D1| = the limit, |D2| = half the limit): within it the
 * neighbouring answer is also accepted. As the oracle of CP1 does it, with that tolerance: a first
 * run with an ear without a level offers nothing, which is accepted; and on a floor the rule may
 * offer, a repeat with an ear without a level gives `unclear`, which is accepted.
 */
export function ruleAccepted(
  run: Pick<
    AttributionRun,
    | "earDifferenceDb"
    | "imbalanceDb"
    | "firstRightMinusLeftDb"
    | "repeatRightMinusLeftDb"
  >,
  toleranceSteps: number,
  settings: Pick<
    HearingMethodConfig,
    "swappedRepeatDifferenceDb" | "upwardStepDb"
  >,
  unclearBelowLimitFraction: number,
): ReadonlySet<AttributionAnswer> {
  const limitDb = settings.swappedRepeatDifferenceDb;
  const halfLimitDb = limitDb * unclearBelowLimitFraction;
  const toleranceDb = toleranceSteps * settings.upwardStepDb;
  const d1 = run.earDifferenceDb + run.imbalanceDb;
  const d2 = run.earDifferenceDb - run.imbalanceDb;
  if (
    run.firstRightMinusLeftDb === null ||
    Math.abs(d1) < limitDb - toleranceDb
  ) {
    return new Set<AttributionAnswer>(["notOffered"]);
  }
  const accepted = new Set<AttributionAnswer>();
  if (Math.abs(d1) < limitDb + toleranceDb) {
    accepted.add("notOffered");
  }
  if (run.repeatRightMinusLeftDb === null) {
    accepted.add("unclear");
    return accepted;
  }
  const attribution: SwappedRepeatOutcome =
    Math.sign(d2) === Math.sign(d1) ? "followsEar" : "followsEarpiece";
  accepted.add(Math.abs(d2) < halfLimitDb ? "unclear" : attribution);
  if (Math.abs(Math.abs(d2) - halfLimitDb) < toleranceDb) {
    accepted.add("unclear");
    accepted.add(attribution);
  }
  return accepted;
}

/** Whether a run's answer is in the rule oracle's accepted set. */
const passesRule = (
  run: AttributionRun,
  toleranceSteps: number,
  options: AttributionMeasurementOptions,
): boolean =>
  ruleAccepted(
    run,
    toleranceSteps,
    options.settings,
    options.unclearBelowLimitFraction,
  ).has(run.answer);

/** The grid of values from `minDb` to `maxDb` in steps of `stepDb`. */
function gridOf(minDb: number, maxDb: number, stepDb: number): number[] {
  const values: number[] = [];
  for (let valueDb = minDb; valueDb <= maxDb; valueDb += stepDb) {
    values.push(valueDb);
  }
  return values;
}

/**
 * Plays the measurement of "Measurements". On the grid, for each kind in the order Step,
 * Attentive, Plausible, for each E from the lowest up and for each H from the lowest up, it plays
 * the kind's runs per pair, every draw from one source made from `gridSeed`. Where one of E and H
 * is zero, for each kind, for E and then H, for each size from the smallest up and each sign,
 * minus first, it plays `oneSidedRunsPerValue` runs, every draw from one source made from
 * `oneSidedSeed`. The same options give equal measurements.
 */
export function measureAttribution(
  options: AttributionMeasurementOptions,
): AttributionMeasurement {
  const { settings } = options;
  const limitDb = settings.swappedRepeatDifferenceDb;
  const grid = gridOf(options.gridMinDb, options.gridMaxDb, options.gridStepDb);
  let roomCount = 0;

  const gridRandom = createSeededRandom(options.gridSeed);
  const runsByKind = new Map<
    AttributionListenerKind,
    { readonly all: AttributionRun[]; readonly firstOfPair: AttributionRun[] }
  >();
  for (const kind of kinds) {
    const runsPerPair =
      kind === "step"
        ? options.stepRunsPerPair
        : options.psychometricRunsPerPair;
    const all: AttributionRun[] = [];
    const firstOfPair: AttributionRun[] = [];
    for (const earDifferenceDb of grid) {
      for (const imbalanceDb of grid) {
        for (let count = 0; count < runsPerPair; count += 1) {
          const run = playPair(
            kind,
            earDifferenceDb,
            imbalanceDb,
            options,
            gridRandom,
          );
          roomCount += 2;
          all.push(run);
          if (count === 0) {
            firstOfPair.push(run);
          }
        }
      }
    }
    runsByKind.set(kind, { all, firstOfPair });
  }

  const passesLiteral = (run: AttributionRun): boolean =>
    literalAccepted(run.earDifferenceDb, run.imbalanceDb, settings).has(
      run.answer,
    );

  const kindCounts = kinds.map((kind): AttributionKindCounts => {
    const { all } = runsByKind.get(kind)!;
    const count = (test: (run: AttributionRun) => boolean): number =>
      all.filter(test).length;
    return Object.freeze({
      kind,
      runCount: all.length,
      notOfferedCount: count((run) => run.answer === "notOffered"),
      followsEarCount: count((run) => run.answer === "followsEar"),
      followsEarpieceCount: count((run) => run.answer === "followsEarpiece"),
      unclearCount: count((run) => run.answer === "unclear"),
      unclearWithoutLevelCount: count(
        (run) =>
          run.answer === "unclear" && run.repeatRightMinusLeftDb === null,
      ),
      literalFailureCount: count((run) => !passesLiteral(run)),
      ruleFailureOneStepCount: count((run) => !passesRule(run, 1, options)),
      ruleFailureTwoStepsCount: count((run) => !passesRule(run, 2, options)),
    });
  });

  const caseNames: readonly AttributionCaseName[] = [
    "both",
    "neither",
    "onlyEar",
    "onlyEarpiece",
  ];
  const literalCases = caseNames.map((caseName): LiteralCaseCounts => {
    const counted = (kind: AttributionListenerKind) => {
      const pairs = runsByKind
        .get(kind)!
        .firstOfPair.filter(
          (run) =>
            !run.answerWithoutLevel &&
            attributionCaseOf(run.earDifferenceDb, run.imbalanceDb, limitDb) ===
              caseName,
        );
      return {
        pairs,
        failures: pairs.filter((run) => !passesLiteral(run)),
      };
    };
    const step = counted("step");
    const attentive = counted("attentive");
    return Object.freeze({
      caseName,
      step: Object.freeze({
        failureCount: step.failures.length,
        pairCount: step.pairs.length,
      }),
      attentive: Object.freeze({
        failureCount: attentive.failures.length,
        pairCount: attentive.pairs.length,
      }),
      firstStepFailure: step.failures[0] ?? null,
    });
  });

  const oneSidedRandom = createSeededRandom(options.oneSidedSeed);
  const sizes = gridOf(options.oneSidedMinDb, options.oneSidedMaxDb, 1);
  const oneSided = kinds.map((kind): OneSidedCounts => {
    let runCount = 0;
    let briefAnswerCount = 0;
    let withoutLevelCount = 0;
    let withinOneStepCount = 0;
    let otherCount = 0;
    for (const side of ["ear", "earpiece"] as const) {
      for (const sizeDb of sizes) {
        for (const sign of [-1, 1]) {
          const valueDb = sign * sizeDb;
          for (
            let count = 0;
            count < options.oneSidedRunsPerValue;
            count += 1
          ) {
            const run = playPair(
              kind,
              side === "ear" ? valueDb : 0,
              side === "earpiece" ? valueDb : 0,
              options,
              oneSidedRandom,
            );
            roomCount += 2;
            runCount += 1;
            const brief = side === "ear" ? "followsEar" : "followsEarpiece";
            if (run.answer === brief) {
              briefAnswerCount += 1;
            } else if (run.answerWithoutLevel) {
              withoutLevelCount += 1;
            } else if (sizeDb < limitDb + settings.upwardStepDb) {
              withinOneStepCount += 1;
            } else {
              otherCount += 1;
            }
          }
        }
      }
    }
    return Object.freeze({
      kind,
      runCount,
      briefAnswerCount,
      withoutLevelCount,
      withinOneStepCount,
      otherCount,
    });
  });

  return Object.freeze({
    gridSeed: options.gridSeed,
    oneSidedSeed: options.oneSidedSeed,
    pairCount: grid.length * grid.length,
    kinds: Object.freeze(kindCounts),
    literalCases: Object.freeze(literalCases),
    oneSided: Object.freeze(oneSided),
    roomCount,
  });
}

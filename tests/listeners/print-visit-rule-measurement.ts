// Prints the measurement of the visit-level false alarm rule (visit-flow design.md, "The
// measurement" and "Measurements"; R23.2, R23.3).
//
//   npx tsx tests/listeners/print-visit-rule-measurement.ts
//
// Plays whole full visits through the shipped engine with the cases, seeds and visit
// counts of "Measurements", and prints the tables as Markdown. It writes no file and needs no
// package.json script (D30). The numbers are for the project owner to choose the visit limit
// from (Q1). The script chooses nothing.

import fc from "fast-check";
import {
  hearingMethodConfig,
  type VisitType,
} from "../../src/config/hearing-method-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import {
  atLeastFraction,
  atMostFraction,
} from "../../src/engine/fraction-comparisons";
import {
  attentiveListenerParameters,
  attentiveListenerRange,
  plausibleListenerParameters,
  plausibleListenerRange,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import type { PsychometricListenerParameters } from "./psychometric-listener";
import {
  fixedListenerVisitSeed,
  measureVisitFalseAlarmRule,
  summarizeMeasuredVisits,
  type MeasuredVisit,
  type VisitRuleMeasurement,
  type VisitRuleRow,
} from "./visit-rule-measurement";

/** The candidate limits of R23.2, from loose to strict. */
const candidateLimits = Object.freeze([0.3, 0.25, 0.2, 0.15]);

const visitTypes: readonly VisitType[] = ["full"];

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

/** Visits per fixed listener ("What the rule removes from the D43 case"). */
const fixedListenerVisitCount: Readonly<Record<VisitType, number>> =
  Object.freeze({ full: 1200 });

/** Seeds and visit counts of the ranges ("What the rule costs"). */
const rangeSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  full: 20261202,
});
const rangeVisitCount: Readonly<
  Record<ListenerParameterRange["name"], number>
> = Object.freeze({ attentive: 2000, plausible: 6000 });

/** The bins of the listener's false alarm rate, in steps of 0.05 (R23.2). */
const falseAlarmBinWidthFraction = 0.05;
const falseAlarmBinCount = Math.round(
  plausibleListenerRange.falseAlarmFraction.max / falseAlarmBinWidthFraction,
);
/**
 * The lower edge of bin `bin`, written as a decimal and read back, so that an edge such as 0.15
 * is the same number as a false alarm rate of 150 thousandths and not 3 × 0.05.
 */
const binEdgeFraction = (bin: number): number =>
  Number((bin * falseAlarmBinWidthFraction).toFixed(2));
/** The lower edge of the bin the design's table merged up to the top of the range. */
const mergedBinFromFraction = 0.3;

/** The threshold-search CP2 and CP3 listener sets, played as whole visits. */
const listenerSetMeasures = Object.freeze({
  plausible: {
    seed: 20261116,
    setCount: 100,
    accurateOrFlaggedMinFraction: 0.93,
  },
  attentive: {
    seed: 20261117,
    setCount: 50,
    accurateMinFraction: 0.88,
    flaggedMaxFraction: 0.1,
  },
  visitsPerSet: { full: 80 } as Readonly<Record<VisitType, number>>,
});

const percent = (fraction: number, decimals = 1): string =>
  `${(fraction * 100).toFixed(decimals)} %`;

const limitLabel = (limitFraction: number | null): string => {
  if (limitFraction === null) {
    return "none";
  }
  const label = limitFraction.toFixed(2);
  return limitFraction ===
    visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction
    ? `${label} (in config, proposed)`
    : label;
};

const table = (header: readonly string[], rows: readonly string[][]): void => {
  console.log(`| ${header.join(" | ")} |`);
  console.log(`|${header.map(() => "---").join("|")}|`);
  for (const row of rows) {
    console.log(`| ${row.join(" | ")} |`);
  }
  console.log("");
};

const afw = (row: VisitRuleRow): string =>
  `${percent(row.accurateFraction)} / ${percent(row.flaggedFraction)} / ${percent(row.wrongFraction, 2)}`;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function printFixedListeners(): void {
  console.log("## What the rule removes from the D43 case\n");
  const cases = [
    { name: "Regression 4", parameters: regressionFourListener },
    { name: "D43 set", parameters: d43Listener },
  ];
  const rows: string[][] = [];
  const pooledLines: string[] = [];
  for (const { name, parameters } of cases) {
    for (const visitType of visitTypes) {
      const seed = fixedListenerVisitSeed(parameters, visitType);
      const measurement = measureVisitFalseAlarmRule({
        listener: { kind: "fixed", parameters },
        visitType,
        visitCount: fixedListenerVisitCount[visitType],
        seed,
        limits: candidateLimits,
      });
      measurement.rows.forEach((row, index) => {
        rows.push([
          index === 0 ? `${name}, ${visitType}` : "",
          limitLabel(row.limitFraction),
          `${percent(row.visitsMarkedFraction)} (${String(row.visitsMarkedCount)})`,
          percent(row.accurateFraction),
          percent(row.flaggedFraction),
          `${percent(row.wrongFraction, 2)} (${String(row.wrongCount)})`,
          row.wrongRemovedFraction === null
            ? ""
            : percent(row.wrongRemovedFraction, 0),
        ]);
      });
      const pooled = measurement.visits.map(
        (visit) => visit.pooledNoSoundTrialCount,
      );
      pooledLines.push(
        `- ${name}, ${visitType}: ${String(measurement.visitCount)} visits from seed ${String(seed)}; pooled no-sound trials per visit: median ${String(median(pooled))}, fewest ${String(Math.min(...pooled))}, most ${String(Math.max(...pooled))}.`,
      );
    }
  }
  table(
    [
      "Listener, visit",
      "Visit limit",
      "Visits marked (count)",
      "Accurate",
      "Flagged",
      "Wrong (count)",
      "Wrong removed",
    ],
    rows,
  );
  console.log(pooledLines.join("\n"));
  console.log("");
}

/** The visits of `visits` whose listener's false alarm rate lies in [from, to), or [from, to] for the last bin. */
const visitsInBin = (
  visits: readonly MeasuredVisit[],
  fromFraction: number,
  toFraction: number,
  last: boolean,
): readonly MeasuredVisit[] =>
  visits.filter((visit) => {
    const rate = visit.parameters.falseAlarmFraction;
    return (
      rate >= fromFraction && (last ? rate <= toFraction : rate < toFraction)
    );
  });

const roomMarkedShare = (visits: readonly MeasuredVisit[]): number =>
  visits.length > 0
    ? visits.filter((visit) => visit.roomMarkedByRoomRule).length /
      visits.length
    : 0;

function printBins(measurement: VisitRuleMeasurement): void {
  const rows: string[][] = [];
  const binRow = (label: string, visits: readonly MeasuredVisit[]) => {
    const summary = summarizeMeasuredVisits(visits, measurement.limits);
    rows.push([
      label,
      String(visits.length),
      percent(roomMarkedShare(visits)),
      ...summary.slice(1).map((row) => percent(row.visitsMarkedFraction)),
    ]);
  };
  for (let bin = 0; bin < falseAlarmBinCount; bin += 1) {
    const fromFraction = binEdgeFraction(bin);
    const toFraction = binEdgeFraction(bin + 1);
    binRow(
      `${fromFraction.toFixed(2)} to ${toFraction.toFixed(2)}`,
      visitsInBin(
        measurement.visits,
        fromFraction,
        toFraction,
        bin === falseAlarmBinCount - 1,
      ),
    );
  }
  binRow(
    `${mergedBinFromFraction.toFixed(2)} to ${plausibleListenerRange.falseAlarmFraction.max.toFixed(2)} (together)`,
    visitsInBin(
      measurement.visits,
      mergedBinFromFraction,
      plausibleListenerRange.falseAlarmFraction.max,
      true,
    ),
  );
  table(
    [
      "Listener's false alarm rate",
      `Visits (${measurement.visitType})`,
      "A room marked",
      ...measurement.limits.map((limitFraction) => limitLabel(limitFraction)),
    ],
    rows,
  );
}

function printRanges(): void {
  console.log("## What the rule costs\n");
  const ranges = [attentiveListenerRange, plausibleListenerRange];
  const measurements = new Map<string, VisitRuleMeasurement>();
  for (const range of ranges) {
    for (const visitType of visitTypes) {
      measurements.set(
        `${range.name} ${visitType}`,
        measureVisitFalseAlarmRule({
          listener: { kind: "range", range },
          visitType,
          visitCount: rangeVisitCount[range.name],
          seed: rangeSeed[visitType],
          limits: candidateLimits,
        }),
      );
    }
  }
  const of = (range: ListenerParameterRange, visitType: VisitType) => {
    const measurement = measurements.get(`${range.name} ${visitType}`);
    if (measurement === undefined) {
      throw new Error(`No measurement of ${range.name} ${visitType}.`);
    }
    return measurement;
  };

  for (const range of ranges) {
    console.log(
      `### ${range.name === "attentive" ? "Attentive_Range" : "Plausible_Range"}: ${String(rangeVisitCount[range.name])} visits per visit type, seed ${String(rangeSeed.full)}\n`,
    );
    const rows: string[][] = [];
    for (let index = 0; index <= candidateLimits.length; index += 1) {
      const full = of(range, "full").rows[index];
      rows.push([
        limitLabel(full.limitFraction),
        percent(full.visitsMarkedFraction),
        afw(full),
      ]);
    }
    table(
      [
        "Visit limit",
        "Visits marked (full)",
        "Accurate / Flagged / Wrong (full)",
      ],
      rows,
    );
    console.log(
      `A room marked by the per-room rule: ${percent(roomMarkedShare(of(range, "full").visits))} of full visits.\n`,
    );
    if (range.name === "plausible") {
      for (const visitType of visitTypes) {
        printBins(of(range, visitType));
      }
    }
  }
}

function printListenerSets(): void {
  console.log(
    "## The CP2 and CP3 listener sets of the threshold search, played as whole visits\n",
  );
  const settings = hearingMethodConfig;
  const groups = [
    {
      name: "CP2, Plausible",
      sets: fc.sample(plausibleListenerParameters(settings), {
        seed: listenerSetMeasures.plausible.seed,
        numRuns: listenerSetMeasures.plausible.setCount,
      }),
      seed: listenerSetMeasures.plausible.seed,
      limitText: `Accurate or Flagged at least ${percent(listenerSetMeasures.plausible.accurateOrFlaggedMinFraction, 0)}`,
      share: (row: VisitRuleRow) => row.accurateFraction + row.flaggedFraction,
      meets: (row: VisitRuleRow) =>
        atLeastFraction(
          row.accurateCount + row.flaggedCount,
          row.earCount,
          listenerSetMeasures.plausible.accurateOrFlaggedMinFraction,
        ),
    },
    {
      name: "CP3, Attentive",
      sets: fc.sample(attentiveListenerParameters(settings), {
        seed: listenerSetMeasures.attentive.seed,
        numRuns: listenerSetMeasures.attentive.setCount,
      }),
      seed: listenerSetMeasures.attentive.seed,
      limitText: `Accurate at least ${percent(listenerSetMeasures.attentive.accurateMinFraction, 0)} and Flagged at most ${percent(listenerSetMeasures.attentive.flaggedMaxFraction, 0)}`,
      share: (row: VisitRuleRow) => row.accurateFraction,
      meets: (row: VisitRuleRow) =>
        atLeastFraction(
          row.accurateCount,
          row.earCount,
          listenerSetMeasures.attentive.accurateMinFraction,
        ) &&
        atMostFraction(
          row.flaggedCount,
          row.earCount,
          listenerSetMeasures.attentive.flaggedMaxFraction,
        ),
    },
  ];
  for (const group of groups) {
    const rows: string[][] = [];
    for (const visitType of visitTypes) {
      const perSet = group.sets.map(
        (parameters) =>
          measureVisitFalseAlarmRule({
            listener: { kind: "fixed", parameters },
            visitType,
            visitCount: listenerSetMeasures.visitsPerSet[visitType],
            seed: fixedListenerVisitSeed(parameters, visitType),
            limits: candidateLimits,
          }).rows,
      );
      for (let index = 0; index <= candidateLimits.length; index += 1) {
        const setRows = perSet.map((rowsOfSet) => rowsOfSet[index]);
        const lowest = Math.min(...setRows.map(group.share));
        const belowCount = setRows.filter((row) => !group.meets(row)).length;
        rows.push([
          index === 0 ? visitType : "",
          limitLabel(setRows[0].limitFraction),
          String(belowCount),
          percent(lowest),
        ]);
      }
    }
    console.log(
      `### ${group.name}: ${String(group.sets.length)} sets from fast-check seed ${String(group.seed)}, ${String(listenerSetMeasures.visitsPerSet.full)} full visits per set; limit: ${group.limitText}\n`,
    );
    table(["Visit", "Visit limit", "Sets below the limit", "Lowest set"], rows);
  }
}

const startedAtMs = performance.now();
console.log("# Measurement of the visit-level false alarm rule\n");
console.log(
  `Candidate visit limits: ${candidateLimits.map((limitFraction) => limitFraction.toFixed(2)).join(", ")}, and none. The value in visitFlowConfig is ${visitFlowConfig.visitFalseAlarmRateUnreliableAboveFraction.toFixed(2)}, decided by the owner's coordinator on 2026-11-16, at the owner's request (Q1). With a visit limit, every ear of a marked visit counts as Flagged.\n`,
);
printFixedListeners();
printRanges();
printListenerSets();
console.log(`Took ${((performance.now() - startedAtMs) / 1000).toFixed(1)} s.`);

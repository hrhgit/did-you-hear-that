// Prints the measurement of "Correct attribution" (swapped-repeat design.md, "Measurements", D27;
// R21.4).
//
//   npx tsx tests/listeners/print-attribution-measurement.ts
//
// Plays the grid of ear differences and imbalances through the shipped engine with the listeners,
// seeds and run counts of "Measurements", and prints its tables as Markdown, with the method. It
// writes no file and needs no package.json script. The numbers bear on Q1 (decided by the owner on
// 2026-11-15) and Q2 (PROPOSED, NOT APPROVED). The script chooses nothing and changes no config
// value. The figures come from the engine alone and say nothing about real visitors.

import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { swappedRepeatConfig } from "../../src/config/swapped-repeat-config";
import {
  measureAttribution,
  type AttributionCaseName,
  type AttributionListenerKind,
  type AttributionMeasurementOptions,
  type AttributionRun,
} from "./attribution-measurement";

/** The settings and seeds of "Measurements". */
const options: AttributionMeasurementOptions = Object.freeze({
  settings: hearingMethodConfig,
  unclearBelowLimitFraction: swappedRepeatConfig.unclearBelowLimitFraction,
  gridSeed: 20261120,
  oneSidedSeed: 20261121,
  gridMinDb: -40,
  gridMaxDb: 40,
  gridStepDb: 2,
  baseMinDb: -35,
  baseMaxDb: -25,
  stepRunsPerPair: 1,
  psychometricRunsPerPair: 3,
  oneSidedMinDb: 15,
  oneSidedMaxDb: 40,
  oneSidedRunsPerValue: 10,
});

const kindLabels: Readonly<Record<AttributionListenerKind, string>> =
  Object.freeze({
    step: "Step",
    attentive: "Attentive",
    plausible: "Plausible",
  });

const caseLabels: Readonly<Record<AttributionCaseName, string>> = Object.freeze(
  {
    both: "Both at or above 15",
    neither: "Neither",
    onlyEar: "Only the ear",
    onlyEarpiece: "Only the earpiece",
  },
);

const signed = (valueDb: number | null): string =>
  valueDb === null ? "no level" : valueDb.toString().replace("-", "−");

const exampleOf = (run: AttributionRun | null): string =>
  run === null
    ? "none"
    : `E = ${signed(run.earDifferenceDb)}, H = ${signed(run.imbalanceDb)}: first run ${signed(
        run.firstRightMinusLeftDb,
      )}, repeat ${signed(run.repeatRightMinusLeftDb)}, ${
        run.answer === "notOffered" ? "not offered" : `\`${run.answer}\``
      }`;

const row = (cells: readonly (string | number)[]): string =>
  `| ${cells.join(" | ")} |`;

const startedAtMs = performance.now();
const measurement = measureAttribution(options);
const tookMs = performance.now() - startedAtMs;

const lines: string[] = [];
lines.push(
  "Method: the shipped engine through `specSearchUnderTest`, with `hearingMethodConfig` " +
    `(search cap ${String(hearingMethodConfig.capRelativeToAnchorDb)} dB). For each pair of E and H on the grid ` +
    `${signed(options.gridMinDb)}, ${signed(options.gridMinDb + options.gridStepDb)}, …, ${String(options.gridMaxDb)} dB ` +
    `(${String(measurement.pairCount)} pairs), a base level drawn from ${signed(options.baseMinDb)} to ${signed(options.baseMaxDb)} dB, ` +
    "true thresholds base − E/2 (left ear) and base + E/2 (right ear), and earpiece offsets −H/2 (left) and +H/2 (right). " +
    "The first run plays each ear's sound through its own earpiece, the repeat through the other one, each with its own " +
    `engine seed and listener seed, every draw from seed ${String(options.gridSeed)} in the order Step, Attentive, Plausible, ` +
    "E from the lowest up, H from the lowest up. The outcome is `swappedRepeatOutcome`; not offered when the first run's ears " +
    `are not both found or less than ${String(hearingMethodConfig.swappedRepeatDifferenceDb)} dB apart. ` +
    `Step_Listeners ${String(options.stepRunsPerPair)} run per pair; Attentive and Plausible listeners ` +
    `${String(options.psychometricRunsPerPair)} runs per pair. "Literal": the brief's sentences as written, with \`unclear\` ` +
    'and not offered also accepted where | |E| − 15 | or | |H| − 15 | is below one step. "Rule oracle": the rule for the ' +
    "true D1 = E + H and D2 = E − H, with the neighbouring answer also accepted within one or two steps of a boundary " +
    "(|D1| = 15, |D2| = 7.5), as CP1's oracle gives it: a first run without a level is not offered, and a repeat without a " +
    'level is `unclear` where the floor may be offered. "Without a level": the answer came from an ear without a level, ' +
    "the first run's or, on an offered floor, the repeat's.",
);
lines.push("");
lines.push(
  row(["", ...measurement.kinds.map((kind) => kindLabels[kind.kind])]),
);
lines.push(row(["---", ...measurement.kinds.map(() => "---")]));
const kindRow = (
  label: string,
  value: (kind: (typeof measurement.kinds)[number]) => string | number,
): void => {
  lines.push(row([label, ...measurement.kinds.map(value)]));
};
kindRow("Runs", (kind) => kind.runCount);
kindRow("Not offered", (kind) => kind.notOfferedCount);
kindRow("`followsEar`", (kind) => kind.followsEarCount);
kindRow("`followsEarpiece`", (kind) => kind.followsEarpieceCount);
kindRow(
  "`unclear` (of them, a repeat ear without a level)",
  (kind) =>
    `${String(kind.unclearCount)} (${String(kind.unclearWithoutLevelCount)})`,
);
kindRow("Failing the literal reading", (kind) => kind.literalFailureCount);
kindRow(
  "Failing the rule oracle, one step",
  (kind) => kind.ruleFailureOneStepCount,
);
kindRow(
  "Failing the rule oracle, two steps",
  (kind) => kind.ruleFailureTwoStepsCount,
);
lines.push("");
lines.push(
  "The literal failures by case, one run per pair, leaving out the pairs where a run had no level:",
);
lines.push("");
lines.push(
  row([
    "Case",
    "Step: failures of pairs",
    "Attentive: failures of pairs",
    "First failing example (step)",
  ]),
);
lines.push(row(["---", "---", "---", "---"]));
for (const counted of measurement.literalCases) {
  lines.push(
    row([
      caseLabels[counted.caseName],
      `${String(counted.step.failureCount)} of ${String(counted.step.pairCount)}`,
      `${String(counted.attentive.failureCount)} of ${String(counted.attentive.pairCount)}`,
      exampleOf(counted.firstStepFailure),
    ]),
  );
}
lines.push("");
lines.push(
  `With one of E and H zero: E or H from ${String(options.oneSidedMinDb)} to ${String(options.oneSidedMaxDb)} dB in each sign, ` +
    `the other 0, ${String(options.oneSidedRunsPerValue)} runs each, seed ${String(options.oneSidedSeed)}.`,
);
lines.push("");
lines.push(
  row([
    "",
    "Runs",
    "The brief's answer",
    "Other, a run without a level",
    "Other, within one step of the limit",
    "Other",
  ]),
);
lines.push(row(["---", "---", "---", "---", "---", "---"]));
for (const counted of measurement.oneSided) {
  lines.push(
    row([
      kindLabels[counted.kind],
      counted.runCount,
      counted.briefAnswerCount,
      counted.withoutLevelCount,
      counted.withinOneStepCount,
      counted.otherCount,
    ]),
  );
}
lines.push("");
lines.push(
  `${String(measurement.roomCount)} rooms took ${(tookMs / 1000).toFixed(1)} s in all, about ${(
    tookMs / measurement.roomCount
  ).toFixed(
    3,
  )} ms a room with the listeners and the outcome, on this machine under whatever load it had.`,
);

console.log(lines.join("\n"));

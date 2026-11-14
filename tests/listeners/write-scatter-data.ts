// The scatter data CLI (design.md, Scatter data; R15, D22, D42).
//
//   npm run experiment:scatter [-- --search <name>]
//
// Runs one room for each of 3000 Plausible_Range listeners with the shipped settings and writes
// docs/experiments/threshold-search-scatter-<name>.csv, one row per ear. The search defaults to
// "spec". Numbers have a fixed number of decimals and rows are in listener order, so two runs on
// the same code write byte-identical files (R15.3). It prints the count and share of Accurate,
// Flagged and Wrong ears, and of ears within the original 5 dB. A usage error exits with 2.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { measurePopulation, type PopulationRow } from "./measure-population";
import { searchesUnderTest } from "./searches-under-test";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

/** The population of the scatter data, shared with the property CLI (design.md, Scatter data). */
const populationOptions = Object.freeze({
  listenerCount: 3000,
  seed: 20261120,
});

const levelDecimals = 1;
const fractionDecimals = 3;

const columns = [
  "listener",
  "ear",
  "trueThresholdDb",
  "widthDb",
  "lapseFraction",
  "falseAlarmFraction",
  "wrongSideFraction",
  "state",
  "estimateDb",
  "accuracy",
  "withinFiveDb",
  "trialCount",
] as const;

const level = (valueDb: number): string => valueDb.toFixed(levelDecimals);
const fraction = (value: number): string => value.toFixed(fractionDecimals);

function csvLine(row: PopulationRow): string {
  return [
    String(row.listener),
    row.ear,
    level(row.trueThresholdDb),
    level(row.widthDb),
    fraction(row.lapseFraction),
    fraction(row.falseAlarmFraction),
    fraction(row.wrongSideFraction),
    row.state,
    row.estimateDb === undefined ? "" : level(row.estimateDb),
    row.accuracy,
    String(row.withinFiveDb),
    String(row.trialCount),
  ].join(",");
}

function main(): number {
  const { values } = parseArgs({
    options: { search: { type: "string", default: "spec" } },
    strict: true,
  });
  const name = values.search;
  const search = searchesUnderTest[name];
  if (search === undefined) {
    console.error(
      `Usage: npm run experiment:scatter -- --search <name>, where <name> is one of: ${Object.keys(searchesUnderTest).join(", ")}.`,
    );
    return 2;
  }

  const population = measurePopulation(search, {
    ...populationOptions,
    settings: hearingMethodConfig,
  });
  const text = `${[columns.join(","), ...population.rows.map(csvLine)].join("\n")}\n`;
  const outputPath = path.join(
    repositoryRoot,
    "docs",
    "experiments",
    `threshold-search-scatter-${search.name}.csv`,
  );
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, text);

  const { summary } = population;
  const share = (count: number) =>
    `${String(count)} (${((count / summary.earCount) * 100).toFixed(1)}%)`;
  console.log(
    `Search: ${search.name}, ${String(summary.listenerCount)} listeners, ${String(summary.earCount)} ears`,
  );
  console.log(`Accurate: ${share(summary.accurateCount)}`);
  console.log(`Flagged: ${share(summary.flaggedCount)}`);
  console.log(`Wrong: ${share(summary.wrongCount)}`);
  console.log(`Within the original 5 dB: ${share(summary.withinFiveDbCount)}`);
  console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}`);
  return 0;
}

process.exitCode = main();

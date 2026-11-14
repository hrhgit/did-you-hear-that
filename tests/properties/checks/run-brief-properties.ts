// The property CLI (design.md, `SearchUnderTest` and the checks; D21, D30, D39).
//
//   npm run experiment:properties -- --search <name>
//
// Runs every harness-neutral check against the named search with the shipped settings and writes
// docs/experiments/brief-properties-<name>.json. For the search named "spec" it also runs the
// spec-only checks and the no-sound schedule report, in a section the comparison does not count.
// It reports and does not judge, so it exits 0 whatever the checks find. Only a usage error,
// such as an unknown search name, exits with 2.

import fc from "fast-check";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { hearingMethodConfig } from "../../../src/config/hearing-method-config";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { measurePopulation } from "../../listeners/measure-population";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import { searchesUnderTest } from "../../listeners/searches-under-test";
import type {
  BriefPropertyNumber,
  CheckIdentity,
  HarnessNeutralCheck,
  SpecOnlyCheck,
  StatisticalVerdict,
} from "./check-types";
import { harnessNeutralChecks } from "./harness-neutral-checks";
import { NotCheckableError } from "./not-checkable-error";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");

/** The brief's five properties, as `docs/briefs/01-threshold-search.md` states them. */
const briefPropertyStatements: Readonly<Record<BriefPropertyNumber, string>> =
  Object.freeze({
    1: 'Accurate or flagged: for a listener whose true threshold is inside the playable range, the estimate is within one step of the grid or the result is unreliable. "Within one step of the grid" means: take the lowest level of the 5 dB grid at or above the listener\'s true threshold; the estimate is that level, or one 5 dB step either side of it. (Amended 2026-11-14; the share within the original 5 dB is reported as withinFiveDbFraction.)',
    2: "Always ends within the trial limit.",
    3: "Levels requested never leave the range between floor and cap, and never rise by more than one upward step between consecutive trials for an ear.",
    4: "No-sound trials: share within range, positions not predictable.",
    5: "Same seed and same outcomes give the same trials.",
  });

/** The population measured for the summary: the scatter data's listeners (design.md, Scatter data). */
const populationOptions = Object.freeze({
  listenerCount: 3000,
  seed: 20261120,
});

interface PartReport {
  readonly id: string;
  readonly part?: string;
  readonly title: string;
  readonly kind: "universal" | "statistical";
  readonly requirements: readonly string[];
  readonly holds: boolean;
  readonly checkable: boolean;
  readonly notCheckableReason?: string;
  readonly firstCounterexample?: unknown;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function identityOf(check: CheckIdentity & { kind: PartReport["kind"] }) {
  return {
    id: check.id,
    ...(check.part === undefined ? {} : { part: check.part }),
    title: check.title,
    kind: check.kind,
    requirements: check.requirements,
  };
}

function runUniversal(
  property: fc.IProperty<unknown>,
  numRuns: number,
): Omit<PartReport, keyof ReturnType<typeof identityOf> | "durationMs"> {
  const details = fc.check(property, { numRuns });
  const metrics = { numRuns: details.numRuns, fastCheckSeed: details.seed };
  if (!details.failed) {
    return { holds: true, checkable: true, metrics };
  }
  const error = details.errorInstance;
  if (error instanceof NotCheckableError) {
    return {
      holds: false,
      checkable: false,
      notCheckableReason: error.message,
      metrics,
    };
  }
  return {
    holds: false,
    checkable: true,
    firstCounterexample: {
      message: errorMessage(error),
      counterexample:
        details.counterexample === null
          ? null
          : fc.stringify(details.counterexample),
      seed: details.seed,
      path: details.counterexamplePath,
      numShrinks: details.numShrinks,
    },
    metrics,
  };
}

function runStatistical(
  evaluate: () => StatisticalVerdict,
): Omit<PartReport, keyof ReturnType<typeof identityOf> | "durationMs"> {
  try {
    const verdict = evaluate();
    return {
      holds: verdict.holds,
      checkable: true,
      ...(verdict.firstCounterexample === undefined
        ? {}
        : { firstCounterexample: verdict.firstCounterexample }),
      metrics: verdict.metrics,
    };
  } catch (error) {
    if (error instanceof NotCheckableError) {
      return {
        holds: false,
        checkable: false,
        notCheckableReason: error.message,
        metrics: {},
      };
    }
    return {
      holds: false,
      checkable: true,
      firstCounterexample: { error: errorMessage(error) },
      metrics: {},
    };
  }
}

function timed(
  identity: ReturnType<typeof identityOf>,
  run: () => Omit<
    PartReport,
    keyof ReturnType<typeof identityOf> | "durationMs"
  >,
): PartReport {
  const start = performance.now();
  const outcome = run();
  return {
    ...identity,
    ...outcome,
    durationMs: Math.round(performance.now() - start),
  };
}

function runHarnessNeutral(
  check: HarnessNeutralCheck,
  search: SearchUnderTest,
  settings: ThresholdSearchSettings,
): PartReport {
  const identity = identityOf(check);
  const reason = check.notCheckableReason(search);
  if (reason !== undefined) {
    return {
      ...identity,
      holds: false,
      checkable: false,
      notCheckableReason: reason,
      metrics: {},
      durationMs: 0,
    };
  }
  return timed(identity, () =>
    check.kind === "universal"
      ? runUniversal(
          check.property(search, fc.constant(settings)),
          check.parameters.numRuns,
        )
      : runStatistical(() => check.evaluate(search, settings)),
  );
}

function runSpecOnly(
  check: SpecOnlyCheck,
  settings: ThresholdSearchSettings,
): PartReport {
  return timed(identityOf(check), () =>
    check.kind === "universal"
      ? runUniversal(
          check.property(fc.constant(settings)),
          check.parameters.numRuns,
        )
      : runStatistical(() => check.evaluate(settings)),
  );
}

function git(args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

const verdictText = (part: { holds: boolean; checkable: boolean }): string =>
  !part.checkable ? "not checkable" : part.holds ? "holds" : "does not hold";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { search: { type: "string" } },
    strict: true,
  });
  const name = values.search;
  const search = name === undefined ? undefined : searchesUnderTest[name];
  if (name === undefined || search === undefined) {
    console.error(
      `Usage: npm run experiment:properties -- --search <name>, where <name> is one of: ${Object.keys(searchesUnderTest).join(", ")}.`,
    );
    return 2;
  }

  const settings: ThresholdSearchSettings = hearingMethodConfig;
  const commit = git(["rev-parse", "HEAD"]) ?? "unknown";
  const status = git(["status", "--porcelain"]);
  const workingTreeClean = status === undefined ? null : status === "";

  const parts = harnessNeutralChecks.map((check) => ({
    briefProperty: check.briefProperty,
    report: runHarnessNeutral(check, search, settings),
  }));
  const briefProperties = (
    Object.keys(briefPropertyStatements).map(Number) as BriefPropertyNumber[]
  ).map((number) => {
    const ofProperty = parts
      .filter((part) => part.briefProperty === number)
      .map((part) => part.report);
    const checkable =
      ofProperty.length > 0 && ofProperty.every((part) => part.checkable);
    return {
      number,
      statement: briefPropertyStatements[number],
      holds: checkable && ofProperty.every((part) => part.holds),
      checkable,
      parts: ofProperty,
    };
  });
  const otherChecks = parts
    .filter((part) => part.briefProperty === undefined)
    .map((part) => part.report);

  const population = measurePopulation(search, {
    ...populationOptions,
    settings,
  });

  let specOnly: Record<string, unknown> | undefined;
  if (search.name === "spec") {
    // Loaded only here, so the CLI runs where the spec engine does not exist (D39).
    const { specOnlyChecks, noSoundScheduleReport } =
      await import("./spec-only-checks");
    specOnly = {
      note: "Checks of this spec's own design. The comparison does not count them (D21).",
      checks: specOnlyChecks.map((check) => runSpecOnly(check, settings)),
      noSoundScheduleReport: noSoundScheduleReport(settings),
    };
  }

  const summary = {
    search: search.name,
    commit,
    workingTreeClean,
    command: `npm run experiment:properties -- --search ${search.name}`,
    takesSettings: search.takesSettings,
    takesSeed: search.takesSeed,
    settings,
    briefProperties,
    otherChecks,
    population: {
      ...populationOptions,
      range: population.range,
      ...population.summary,
    },
    ...(specOnly === undefined ? {} : { specOnly }),
  };

  const outputPath = path.join(
    repositoryRoot,
    "docs",
    "experiments",
    `brief-properties-${search.name}.json`,
  );
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

  const describePart = (part: PartReport) =>
    `${part.id}${part.part === undefined ? "" : ` (${part.part})`} ${verdictText(part)}`;
  console.log(
    `Search: ${search.name} at ${commit}${workingTreeClean === false ? " (uncommitted changes)" : ""}`,
  );
  for (const property of briefProperties) {
    console.log(
      `Brief property ${String(property.number)}: ${verdictText(property).padEnd(13)} ${property.parts.map(describePart).join(", ")}`,
    );
  }
  for (const part of otherChecks) {
    console.log(`Other: ${describePart(part)}`);
  }
  if (specOnly !== undefined) {
    for (const part of specOnly.checks as PartReport[]) {
      console.log(`Spec-only: ${describePart(part)}`);
    }
  }
  const share = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;
  const { summary: p } = population;
  console.log(
    `Population of ${String(p.listenerCount)} listeners: accurate ${share(p.accurateFraction)}, flagged ${share(p.flaggedFraction)}, wrong ${share(p.wrongFraction)}, within the original 5 dB ${share(p.withinFiveDbFraction)}, median ${String(p.medianTrialCount)} and largest ${String(p.largestTrialCount)} trials per room`,
  );
  console.log(`Wrote ${path.relative(repositoryRoot, outputPath)}`);
  return 0;
}

process.exitCode = await main();

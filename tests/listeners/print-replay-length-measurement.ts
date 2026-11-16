// Prints the measurement of the replay's length (missed-sound-replay design.md, "Measurements",
// D28).
//
//   npx tsx tests/listeners/print-replay-length-measurement.ts
//
// Plays quick and full visits through the shipped engine with the ranges, seeds and visit counts
// of "Measurements", and prints the tables as Markdown. It writes no file and needs no
// package.json script. The numbers are for the project owner to choose the most count and the gap
// from (Q1, Q2). The script chooses nothing and changes no config value. The figures come from the
// engine alone, with one listener per room, and say nothing about real visitors.

import { audioOutputConfig } from "../../src/config/audio-output-config";
import {
  hearingMethodConfig,
  type VisitType,
} from "../../src/config/hearing-method-config";
import { visitRooms } from "../../src/session/visit-rooms";
import {
  attentiveListenerRange,
  plausibleListenerRange,
  type ListenerParameterRange,
} from "./listener-parameter-arbitraries";
import { playPopulationRooms } from "./play-population-rooms";
import {
  measureReplayLength,
  type ReplayLengthMeasurement,
  type ReplayLengthRow,
} from "./replay-length-measurement";
import { specSearchUnderTest } from "./spec-search-under-test";

/** Visits per column ("Measurements": 1000 visits per row). */
const visitCount = 1000;

/** The seed of each visit type ("Measurements"). */
const visitSeed: Readonly<Record<VisitType, number>> = Object.freeze({
  quick: 20261117,
  full: 20261118,
});

/** The first run of the same measurement: 3000 rooms, taken three or five at a time. */
const firstRunSeed = 20261116;
const firstRunRoomCount = 3000;

/** The candidate most counts, null for no limit, and the gaps of "Measurements". */
const maxCounts: readonly (number | null)[] = Object.freeze([
  20,
  30,
  45,
  60,
  null,
]);
const gapsMs: readonly number[] = Object.freeze([300, 400, 600]);
/**
 * The gap the length table is printed for: the proposed `replayGapMs` (Q2, decided by the owner's
 * coordinator on 2026-11-16, at the owner's request).
 */
const lengthTableGapMs = 400;
/** The most counts of the gap table's first two columns. */
const gapTableMaxCounts: readonly number[] = Object.freeze([20, 30]);
/**
 * The most count marked as proposed: `replaySoundsMaxCount` (Q1, decided by the owner's
 * coordinator on 2026-11-16, at the owner's request).
 */
const proposedMaxCount = 20;

const ranges: readonly ListenerParameterRange[] = Object.freeze([
  attentiveListenerRange,
  plausibleListenerRange,
]);
const visitTypes: readonly VisitType[] = Object.freeze(["quick", "full"]);

/** The median as the nearest-rank 50th percentile, so that it is a value of the list, as every percentile here is. */
const median = (sorted: readonly number[]): number => percentile(sorted, 0.5);

/** The nearest-rank percentile of a sorted list: the smallest value with at least `fraction` of the list at or below it. */
function percentile(sorted: readonly number[], fraction: number): number {
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1]!;
}

const sortedOf = (values: readonly number[]): number[] =>
  [...values].sort((first, second) => first - second);

const seconds = (durationMs: number): string =>
  `${(durationMs / 1000).toFixed(1)} s`;

const secondsBare = (durationMs: number): string =>
  (durationMs / 1000).toFixed(1);

/** A share as a percentage: one decimal below 10 %, whole from there up. */
function percent(fraction: number): string {
  const value = fraction * 100;
  if (value === 0 || value >= 10) {
    return `${String(Math.round(value))} %`;
  }
  return `${String(Math.round(value * 10) / 10)} %`;
}

const capitalised = (text: string): string =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const columnName = (measurement: ReplayLengthMeasurement): string =>
  `${capitalised(measurement.rangeName)}, ${measurement.visitType}`;

function rowOf(
  measurement: ReplayLengthMeasurement,
  maxCount: number | null,
  gapMs: number,
): ReplayLengthRow {
  const row = measurement.rows.find(
    (candidate) => candidate.maxCount === maxCount && candidate.gapMs === gapMs,
  );
  if (row === undefined) {
    throw new Error(
      `No row for ${String(maxCount)} sounds and ${String(gapMs)} ms.`,
    );
  }
  return row;
}

function printCounts(measurements: readonly ReplayLengthMeasurement[]): void {
  console.log("Missed sounds and wrong sides per visit:");
  console.log("");
  console.log(`| | ${measurements.map(columnName).join(" | ")} |`);
  console.log(`|---|${measurements.map(() => "---|").join("")}`);
  const missed = measurements.map((measurement) =>
    sortedOf(measurement.visits.map((visit) => visit.missedCount)),
  );
  const wrong = measurements.map((measurement) =>
    sortedOf(measurement.visits.map((visit) => visit.wrongSideCount)),
  );
  console.log(
    `| Missed sounds, median (10th to 90th percentile) | ${missed
      .map(
        (values) =>
          `${String(median(values))} (${String(percentile(values, 0.1))} to ${String(percentile(values, 0.9))})`,
      )
      .join(" | ")} |`,
  );
  console.log(
    `| Missed sounds, most | ${missed.map((values) => String(values.at(-1))).join(" | ")} |`,
  );
  console.log(
    `| Wrong sides, median (90th percentile) | ${wrong
      .map(
        (values) =>
          `${String(median(values))} (${String(percentile(values, 0.9))})`,
      )
      .join(" | ")} |`,
  );
  console.log("");
}

function printLengths(measurements: readonly ReplayLengthMeasurement[]): void {
  console.log(
    `Share of visits that get a selection, and the replay's length (median, 90th percentile, longest), with a gap of ${String(lengthTableGapMs)} ms:`,
  );
  console.log("");
  console.log(
    `| Most sounds played | ${measurements.map(columnName).join(" | ")} |`,
  );
  console.log(`|---|${measurements.map(() => "---|").join("")}`);
  for (const maxCount of maxCounts) {
    const name =
      maxCount === null
        ? "No limit"
        : maxCount === proposedMaxCount
          ? `**${String(maxCount)}, proposed**`
          : String(maxCount);
    const cells = measurements.map((measurement) => {
      const row = rowOf(measurement, maxCount, lengthTableGapMs);
      const lengths = row.lengthsMs;
      return `${percent(row.selectionFraction)}; ${secondsBare(median(lengths))}, ${secondsBare(percentile(lengths, 0.9))}, ${seconds(lengths.at(-1) ?? 0)}`;
    });
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
  console.log("");
}

/** The smallest and largest median length over some columns, as "28.3 to 28.6 s". */
function medianSpan(
  measurements: readonly ReplayLengthMeasurement[],
  maxCount: number | null,
  gapMs: number,
): string {
  const medians = measurements.map((measurement) =>
    median(rowOf(measurement, maxCount, gapMs).lengthsMs),
  );
  return `${secondsBare(Math.min(...medians))} to ${seconds(Math.max(...medians))}`;
}

function printGaps(measurements: readonly ReplayLengthMeasurement[]): void {
  const ofType = (visitType: VisitType) =>
    measurements.filter((measurement) => measurement.visitType === visitType);
  console.log("The gap's effect, as the median length over the four columns:");
  console.log("");
  console.log(
    `| Gap | ${gapTableMaxCounts.map((maxCount) => `Most ${String(maxCount)}`).join(" | ")} | No limit, quick | No limit, full |`,
  );
  console.log(`|---|${gapTableMaxCounts.map(() => "---|").join("")}---|---|`);
  for (const gapMs of gapsMs) {
    const name =
      gapMs === lengthTableGapMs
        ? `**${String(gapMs)} ms, proposed**`
        : `${String(gapMs)} ms`;
    const cells = [
      ...gapTableMaxCounts.map((maxCount) =>
        medianSpan(measurements, maxCount, gapMs),
      ),
      medianSpan(ofType("quick"), null, gapMs),
      medianSpan(ofType("full"), null, gapMs),
    ];
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
  console.log("");
}

/** The first run's figure: attentive rooms from one seed, taken three or five at a time. */
function printFirstRun(): void {
  const rooms = playPopulationRooms(specSearchUnderTest, {
    listenerCount: firstRunRoomCount,
    seed: firstRunSeed,
    settings: hearingMethodConfig,
    range: attentiveListenerRange,
  });
  console.log(
    `First run: ${String(firstRunRoomCount)} attentive rooms from seed ${String(firstRunSeed)}.`,
  );
  console.log("");
  for (const visitType of visitTypes) {
    const roomCount = visitRooms(visitType).length;
    const soundTrials: number[] = [];
    const missed: number[] = [];
    for (let start = 0; start + roomCount <= rooms.length; start += roomCount) {
      const trials = rooms
        .slice(start, start + roomCount)
        .flatMap((room) => room.run.trials)
        .filter((trial) => trial.kind === "sound");
      soundTrials.push(trials.length);
      missed.push(trials.filter((trial) => trial.response === "none").length);
    }
    console.log(
      `- Attentive ${visitType} visits (${String(roomCount)} rooms at a time, ${String(soundTrials.length)} visits): median ${String(median(sortedOf(soundTrials)))} sound trials and ${String(median(sortedOf(missed)))} missed sounds.`,
    );
  }
  console.log("");
}

function main(): void {
  const measurements: ReplayLengthMeasurement[] = [];
  for (const range of ranges) {
    for (const visitType of visitTypes) {
      measurements.push(
        measureReplayLength({
          visitType,
          range,
          visitCount,
          seed: visitSeed[visitType],
          settings: hearingMethodConfig,
          maxCounts,
          gapsMs,
          scheduleLeadMs: audioOutputConfig.scheduleLeadMs,
        }),
      );
    }
  }
  console.log(
    `Method: playPopulationRooms with specSearchUnderTest and hearingMethodConfig, ${String(visitCount)} visits per column, one listener per room, seed ${String(visitSeed.quick)} for quick visits and ${String(visitSeed.full)} for full ones. The proposed most count (${String(proposedMaxCount)}) and gap (${String(lengthTableGapMs)} ms) were decided by the owner's coordinator on 2026-11-16, at the owner's request (Q1, Q2).`,
  );
  console.log("");
  printCounts(measurements);
  printLengths(measurements);
  printGaps(measurements);
  printFirstRun();
}

main();

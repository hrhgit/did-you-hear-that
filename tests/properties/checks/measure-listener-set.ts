import { createSeededRandom } from "../../../src/config/seeded-random";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import {
  classifyAccuracy,
  type AccuracyClass,
} from "../../listeners/classify-accuracy";
import type { ListenerEar } from "../../listeners/listener-types";
import { drawSeed } from "../../listeners/play-population-rooms";
import {
  createPsychometricListener,
  type PsychometricListenerParameters,
} from "../../listeners/psychometric-listener";
import {
  generousTrialBudgetCount,
  type RunEarResult,
  type SearchUnderTest,
} from "../../listeners/search-under-test";

/** One ear result of a parameter set that was neither Accurate nor Flagged. */
export interface WrongEarExample {
  readonly room: number;
  readonly engineSeed: number;
  readonly listenerSeed: number;
  readonly ear: ListenerEar;
  readonly trueThresholdDb: number;
  readonly result: RunEarResult;
}

/** What `roomCount` rooms of one listener parameter set gave (design.md, CP2 and CP3). */
export interface ListenerSetMeasurement {
  readonly parameters: PsychometricListenerParameters;
  /** The seed the rooms' engine and listener seeds were drawn from. */
  readonly setSeed: number;
  readonly roomCount: number;
  readonly earCount: number;
  readonly accurateCount: number;
  readonly flaggedCount: number;
  readonly wrongCount: number;
  readonly accurateFraction: number;
  readonly flaggedFraction: number;
  readonly wrongFraction: number;
  /** Rooms that did not finish within the generous budget, or threw. */
  readonly unfinishedRoomCount: number;
  /** The first few wrong ears, so that a counterexample can be replayed room by room. */
  readonly wrongExamples: readonly WrongEarExample[];
}

const fnvOffsetBasis = 0x811c9dc5;
const fnvPrime = 0x01000193;
const wrongExampleCount = 5;

/**
 * The seed of a parameter set: FNV-1a over its six values in a fixed order. Deriving the room
 * seeds from the set itself means a counterexample is replayed from its parameters alone, and
 * a regression test needs no other number (D39).
 */
export function listenerSetSeed(
  parameters: PsychometricListenerParameters,
): number {
  const text = [
    parameters.trueThresholdDb.left,
    parameters.trueThresholdDb.right,
    parameters.widthDb,
    parameters.lapseFraction,
    parameters.falseAlarmFraction,
    parameters.wrongSideFraction,
  ]
    .map(String)
    .join(",");
  let hash = fnvOffsetBasis;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), fnvPrime);
  }
  return hash >>> 0;
}

/**
 * Runs `roomCount` rooms of `search` with one Psychometric_Listener parameter set and counts its
 * ear results as Accurate, Flagged or Wrong (D18). The engine and listener seed of each room are
 * drawn in turn from a source made from `listenerSetSeed(parameters)`.
 */
export function measureListenerSet(
  search: SearchUnderTest,
  settings: ThresholdSearchSettings,
  parameters: PsychometricListenerParameters,
  roomCount: number,
): ListenerSetMeasurement {
  const setSeed = listenerSetSeed(parameters);
  const seeds = createSeededRandom(setSeed);
  const counts: Record<AccuracyClass, number> = {
    accurate: 0,
    flagged: 0,
    wrong: 0,
  };
  const wrongExamples: WrongEarExample[] = [];
  let unfinishedRoomCount = 0;
  for (let room = 1; room <= roomCount; room += 1) {
    const engineSeed = drawSeed(seeds);
    const listenerSeed = drawSeed(seeds);
    const run = search.runRoom({
      seed: engineSeed,
      settings,
      listener: createPsychometricListener(
        parameters,
        createSeededRandom(listenerSeed),
      ),
      trialBudget: generousTrialBudgetCount,
    });
    if (run.ending !== "finished") {
      unfinishedRoomCount += 1;
    }
    for (const ear of ["left", "right"] as const) {
      const trueThresholdDb = parameters.trueThresholdDb[ear];
      const accuracy = classifyAccuracy(
        run.ears[ear],
        trueThresholdDb,
        settings,
      );
      counts[accuracy] += 1;
      if (accuracy === "wrong" && wrongExamples.length < wrongExampleCount) {
        wrongExamples.push(
          Object.freeze({
            room,
            engineSeed,
            listenerSeed,
            ear,
            trueThresholdDb,
            result: run.ears[ear],
          }),
        );
      }
    }
  }
  const earCount = counts.accurate + counts.flagged + counts.wrong;
  return Object.freeze({
    parameters,
    setSeed,
    roomCount,
    earCount,
    accurateCount: counts.accurate,
    flaggedCount: counts.flagged,
    wrongCount: counts.wrong,
    accurateFraction: counts.accurate / earCount,
    flaggedFraction: counts.flagged / earCount,
    wrongFraction: counts.wrong / earCount,
    unfinishedRoomCount,
    wrongExamples: Object.freeze(wrongExamples),
  });
}

/** The parts of a measurement that a summary needs, without the room-by-room examples. */
export const summarizeListenerSet = (
  measurement: ListenerSetMeasurement,
): Readonly<Record<string, unknown>> => ({
  parameters: measurement.parameters,
  setSeed: measurement.setSeed,
  accurateFraction: measurement.accurateFraction,
  flaggedFraction: measurement.flaggedFraction,
  wrongFraction: measurement.wrongFraction,
  unfinishedRoomCount: measurement.unfinishedRoomCount,
});

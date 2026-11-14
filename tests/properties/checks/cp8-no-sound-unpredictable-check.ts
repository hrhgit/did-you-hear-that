import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type {
  RunTrial,
  SearchUnderTest,
} from "../../listeners/search-under-test";
import type { HarnessNeutralStatisticalCheck } from "./check-types";
import { NotCheckableError } from "./not-checkable-error";
import {
  patternPopulation,
  patternPopulationParameters,
} from "./pattern-population";

const parameters = Object.freeze({
  ...patternPopulationParameters,
  minimumTrialsPerValueCount: 400,
  allowedDeviationFraction: 0.1,
  timeoutMs: 60_000,
});

/** Feature values are capped here: "8 or more" trials since the last silence, "11 or more" positions. */
const sinceLastNoSoundCapCount = 8;
const positionCapCount = 11;

/** Absorbs rounding in the deviation, so a share exactly 0.10 from r counts as inside (D29). */
const toleranceFraction = 1e-9;

type FeatureName =
  | "trialsSinceLastNoSound"
  | "positionInRoom"
  | "previousTrialOutcome"
  | "previousSoundTrialEar";

interface Tally {
  trialCount: number;
  noSoundCount: number;
}

/** The outcome of an answered trial, worked out from the run alone (R4). */
function outcomeOf(trial: RunTrial, where: string): string {
  if (trial.kind === "noSound") {
    return trial.response === "none" ? "noResponse" : "falseAlarm";
  }
  if (trial.ear === undefined) {
    throw new NotCheckableError(
      `${where}: the search does not report the ear of a sound trial`,
    );
  }
  if (trial.response === "none") {
    return "missed";
  }
  return trial.response === trial.ear ? "caught" : "wrongSide";
}

const capped = (value: number, cap: number): string =>
  value >= cap ? `${String(cap)} or more` : String(value);

/** The value of every feature for each trial of one room (design.md, CP8). */
function featuresOfRoom(
  trials: readonly RunTrial[],
  room: number,
): {
  readonly features: Record<FeatureName, string>;
  readonly noSound: boolean;
}[] {
  let lastNoSoundIndex: number | undefined;
  let previousSoundEar: string | undefined;
  return trials.map((trial, index) => {
    const previous = index > 0 ? trials[index - 1] : undefined;
    const features: Record<FeatureName, string> = {
      trialsSinceLastNoSound:
        lastNoSoundIndex === undefined
          ? "none yet"
          : capped(index - lastNoSoundIndex, sinceLastNoSoundCapCount),
      positionInRoom: capped(index + 1, positionCapCount),
      previousTrialOutcome:
        previous === undefined
          ? "none"
          : outcomeOf(previous, `room ${String(room)}, trial ${String(index)}`),
      previousSoundTrialEar: previousSoundEar ?? "none",
    };
    if (trial.kind === "noSound") {
      lastNoSoundIndex = index;
    } else {
      if (trial.ear === undefined) {
        throw new NotCheckableError(
          `room ${String(room)}, trial ${String(index + 1)}: the search does not report the ear of a sound trial`,
        );
      }
      previousSoundEar = trial.ear;
    }
    return { features, noSound: trial.kind === "noSound" };
  });
}

/**
 * CP8. No-sound positions cannot be predicted (Statistical; R9.1, R9.5, brief property 4; D9).
 * Over the 2000 rooms of seed 20261118, let r be the share of all trials that are no-sound
 * trials. For each value of each feature that occurs on at least 400 trials, the share of those
 * trials that are no-sound trials lies within r ± 0.10. The features are the trials since the
 * last no-sound trial, the position in the room, the kind and outcome of the previous trial, and
 * the ear of the previous sound trial.
 *
 * It also reports, without a limit, the share of rooms that end with no-sound trials after their
 * last sound trial. For the spec engine those are exactly the rooms that needed closing trials.
 */
export const cp8NoSoundUnpredictableCheck: HarnessNeutralStatisticalCheck =
  Object.freeze({
    id: "CP8",
    title: "No-sound positions cannot be predicted",
    briefProperty: 4,
    requirements: ["R9.1", "R9.5"],
    kind: "statistical",
    harnessNeutral: true,
    notCheckableReason: () => undefined,
    parameters,
    evaluate: (search: SearchUnderTest, settings: ThresholdSearchSettings) => {
      const rooms = patternPopulation(search, settings);
      const tallies = new Map<FeatureName, Map<string, Tally>>();
      let trialCount = 0;
      let noSoundCount = 0;
      let roomsEndingWithNoSoundCount = 0;
      let unfinishedRoomCount = 0;
      for (const { listener, run } of rooms) {
        if (run.ending !== "finished") {
          unfinishedRoomCount += 1;
        }
        const last = run.trials[run.trials.length - 1];
        if (last?.kind === "noSound") {
          roomsEndingWithNoSoundCount += 1;
        }
        for (const { features, noSound } of featuresOfRoom(
          run.trials,
          listener,
        )) {
          trialCount += 1;
          noSoundCount += noSound ? 1 : 0;
          for (const [name, value] of Object.entries(features) as [
            FeatureName,
            string,
          ][]) {
            let byValue = tallies.get(name);
            if (byValue === undefined) {
              byValue = new Map();
              tallies.set(name, byValue);
            }
            const tally = byValue.get(value) ?? {
              trialCount: 0,
              noSoundCount: 0,
            };
            tally.trialCount += 1;
            tally.noSoundCount += noSound ? 1 : 0;
            byValue.set(value, tally);
          }
        }
      }
      const overallShare = noSoundCount / trialCount;
      const outside: Record<string, unknown>[] = [];
      let largestDeviation = 0;
      const features = Object.fromEntries(
        [...tallies].map(([name, byValue]) => [
          name,
          [...byValue].map(([value, tally]) => {
            const share = tally.noSoundCount / tally.trialCount;
            const checked =
              tally.trialCount >= parameters.minimumTrialsPerValueCount;
            const deviation = share - overallShare;
            if (checked) {
              largestDeviation = Math.max(
                largestDeviation,
                Math.abs(deviation),
              );
              if (
                Math.abs(deviation) >
                parameters.allowedDeviationFraction + toleranceFraction
              ) {
                outside.push({
                  feature: name,
                  value,
                  trialCount: tally.trialCount,
                  noSoundShare: share,
                  overallShare,
                  deviation,
                });
              }
            }
            return {
              value,
              trialCount: tally.trialCount,
              noSoundShare: share,
              checked,
            };
          }),
        ]),
      );
      return Object.freeze({
        holds: outside.length === 0,
        ...(outside.length === 0 ? {} : { firstCounterexample: outside[0] }),
        metrics: {
          seed: parameters.seed,
          roomCount: parameters.roomCount,
          minimumTrialsPerValueCount: parameters.minimumTrialsPerValueCount,
          allowedDeviationFraction: parameters.allowedDeviationFraction,
          trialCount,
          noSoundShare: overallShare,
          largestDeviation,
          valuesOutsideCount: outside.length,
          valuesOutside: outside,
          roomsEndingWithNoSoundFraction:
            roomsEndingWithNoSoundCount / rooms.length,
          unfinishedRoomCount,
          features,
        },
      });
    },
  });

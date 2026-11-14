import { createSeededRandom } from "../../../src/config/seeded-random";
import { roomLimits } from "../../../src/engine/room-limits";
import type {
  EarResult,
  RoomResult,
  ThresholdSearchSettings,
} from "../../../src/engine/search-types";
import {
  extremeListeners,
  type ExtremeListenerName,
} from "../../listeners/extreme-listeners";
import { drawSeed } from "../../listeners/play-population-rooms";
import { runSpecRoom } from "../../listeners/spec-search-under-test";
import type { SpecOnlyStatisticalCheck } from "./check-types";

const parameters = Object.freeze({
  seed: 20261119,
  roomsPerListenerCount: 20,
  neverAnswersPresentationCount: 10,
  timeoutMs: 30_000,
});

/** One CP12 example: an extreme listener and what every one of its rooms must show. */
export interface ExtremeListenerExample {
  readonly listener: Exclude<ExtremeListenerName, "answersAtRandom">;
  readonly expectation: string;
  /** Returns what is wrong with the room, or undefined when it shows the expectation. */
  problemWith(result: RoomResult): string | undefined;
}

const describeEar = (earResult: EarResult): string => JSON.stringify(earResult);

const unreliableForFalseAlarms = (result: RoomResult): string | undefined => {
  for (const ear of ["left", "right"] as const) {
    const earResult = result[ear];
    if (
      earResult.state !== "unreliable" ||
      !earResult.reasons.includes("falseAlarmRate")
    ) {
      return `the ${ear} ear is ${describeEar(earResult)}, not unreliable for the false alarm rate`;
    }
  }
  return undefined;
};

/** The examples of CP12 (design.md, CP12; R8, R10, R13.5). */
export const extremeListenerExamples: readonly ExtremeListenerExample[] =
  Object.freeze([
    {
      listener: "neverAnswers",
      expectation:
        "both ears worse than cap after exactly 10 presentations, and no false alarm",
      problemWith: (result: RoomResult) => {
        for (const ear of ["left", "right"] as const) {
          const earResult = result[ear];
          if (
            earResult.state !== "worseThanCap" ||
            earResult.presentationCount !==
              parameters.neverAnswersPresentationCount
          ) {
            return `the ${ear} ear is ${describeEar(earResult)}`;
          }
        }
        return result.falseAlarmCount === 0
          ? undefined
          : `${String(result.falseAlarmCount)} false alarms`;
      },
    },
    {
      listener: "alwaysAnswers",
      expectation: "both ears unreliable for the false alarm rate",
      problemWith: unreliableForFalseAlarms,
    },
    {
      listener: "alwaysAnswersWrongSide",
      expectation: "both ears unreliable for the false alarm rate",
      problemWith: unreliableForFalseAlarms,
    },
    {
      listener: "alwaysPressesLeft",
      expectation: "both ears unreliable for the false alarm rate",
      problemWith: unreliableForFalseAlarms,
    },
  ]);

/** The engine and listener seeds of the example rooms, the same for every listener. */
export const exampleRoomSeeds = (): readonly {
  readonly engineSeed: number;
  readonly listenerSeed: number;
}[] => {
  const seeds = createSeededRandom(parameters.seed);
  return Array.from({ length: parameters.roomsPerListenerCount }, () => ({
    engineSeed: drawSeed(seeds),
    listenerSeed: drawSeed(seeds),
  }));
};

/**
 * Plays one example room. `runSpecRoom` throws when the room asks for a trial after
 * Room_Trial_Limit answered trials, so a returned result means the room ended.
 */
export const playExampleRoom = (
  example: ExtremeListenerExample,
  seeds: { readonly engineSeed: number; readonly listenerSeed: number },
  settings: ThresholdSearchSettings,
): RoomResult =>
  runSpecRoom({
    seed: seeds.engineSeed,
    settings,
    listener: extremeListeners[example.listener](
      createSeededRandom(seeds.listenerSeed),
    ),
    trialBudget: roomLimits(settings).roomTrialLimitCount,
  });

/**
 * CP12. Extreme listeners, the examples (R8, R10, R13.5). Each of never answers, always
 * answers, always answers on the wrong side and always presses left plays 20 rooms with seeds
 * drawn from 20261119. Never answers ends both ears worse than cap after exactly 10
 * presentations with no false alarm. The other three end with both ears unreliable for the
 * false alarm rate. Every room ends within Room_Trial_Limit.
 */
export const cp12ExtremeListenerExamplesCheck: SpecOnlyStatisticalCheck =
  Object.freeze({
    id: "CP12",
    part: "examples",
    title: "Extreme listeners",
    requirements: ["R8", "R10", "R13.5"],
    kind: "statistical",
    harnessNeutral: false,
    parameters,
    evaluate: (settings: ThresholdSearchSettings) => {
      const problems: Record<string, unknown>[] = [];
      const seedList = exampleRoomSeeds();
      for (const example of extremeListenerExamples) {
        for (const seeds of seedList) {
          let problem: string | undefined;
          try {
            problem = example.problemWith(
              playExampleRoom(example, seeds, settings),
            );
          } catch (error) {
            problem = String(error);
          }
          if (problem !== undefined) {
            problems.push({ listener: example.listener, ...seeds, problem });
          }
        }
      }
      return Object.freeze({
        holds: problems.length === 0,
        ...(problems.length === 0 ? {} : { firstCounterexample: problems[0] }),
        metrics: {
          seed: parameters.seed,
          roomsPerListenerCount: parameters.roomsPerListenerCount,
          listeners: extremeListenerExamples.map((example) => example.listener),
          roomsNotShowingExpectationCount: problems.length,
        },
      });
    },
  });

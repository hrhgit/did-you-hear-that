import { createSeededRandom } from "../../src/config/seeded-random";
import type {
  EarResult,
  RoomResult,
  Trial,
} from "../../src/engine/search-types";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import type { ListenerTrial } from "./listener-types";
import type {
  RoomRun,
  RunEarResult,
  RunTrial,
  SearchUnderTest,
} from "./search-under-test";

type RunInput = Parameters<SearchUnderTest["runRoom"]>[0];

type SpecPlay =
  | {
      readonly ending: "finished";
      readonly trials: readonly RunTrial[];
      readonly result: RoomResult;
    }
  | {
      readonly ending: "budgetExceeded";
      readonly trials: readonly RunTrial[];
    }
  | {
      readonly ending: "threw";
      readonly trials: readonly RunTrial[];
      readonly error: unknown;
    };

/** What the listener may know about a trial: its kind, and for a sound its ear and level (R13.7). */
function toListenerTrial(trial: Trial): ListenerTrial {
  return trial.kind === "sound"
    ? { kind: "sound", ear: trial.ear, levelDb: trial.levelDb }
    : { kind: "noSound" };
}

function toRunTrial(trial: Trial, response: RunTrial["response"]): RunTrial {
  return trial.kind === "sound"
    ? Object.freeze({
        kind: "sound",
        ear: trial.ear,
        levelDb: trial.levelDb,
        gapBeforeMs: trial.gapBeforeMs,
        response,
      })
    : Object.freeze({
        kind: "noSound",
        gapBeforeMs: trial.gapBeforeMs,
        response,
      });
}

function toRunEarResult(earResult: EarResult): RunEarResult {
  return earResult.state === "found"
    ? Object.freeze({ state: "found", thresholdDb: earResult.thresholdDb })
    : Object.freeze({ state: earResult.state });
}

/** Plays one room of the spec engine until it finishes, exceeds the budget or throws. */
function playSpecRoom(input: RunInput): SpecPlay {
  const trials: RunTrial[] = [];
  try {
    const search = createThresholdSearch({
      settings: input.settings,
      random: createSeededRandom(input.seed),
    });
    let step = search.current();
    while (step.kind === "trial") {
      if (trials.length >= input.trialBudget) {
        return { ending: "budgetExceeded", trials };
      }
      const response = input.listener.respond(toListenerTrial(step.trial));
      trials.push(toRunTrial(step.trial, response));
      step = search.respond(response);
    }
    return { ending: "finished", trials, result: step.result };
  } catch (error) {
    return { ending: "threw", trials, error };
  }
}

const unreported: RunEarResult = Object.freeze({ state: "unreported" });

/**
 * The spec engine behind the `SearchUnderTest` interface (D21). It maps one to one: each trial
 * and each ear result is translated, and nothing is decided here. A run that asks for more
 * trials than its budget is stopped and reported as `"budgetExceeded"`.
 */
export const specSearchUnderTest: SearchUnderTest = Object.freeze({
  name: "spec",
  takesSettings: true,
  takesSeed: true,
  runRoom: (input: RunInput): RoomRun => {
    const play = playSpecRoom(input);
    const trials = Object.freeze([...play.trials]);
    switch (play.ending) {
      case "finished":
        return Object.freeze({
          ending: "finished",
          trials,
          ears: Object.freeze({
            left: toRunEarResult(play.result.left),
            right: toRunEarResult(play.result.right),
          }),
          falseAlarmRateFraction: play.result.falseAlarmRateFraction,
        });
      case "budgetExceeded":
        return Object.freeze({
          ending: "budgetExceeded",
          trials,
          ears: Object.freeze({ left: unreported, right: unreported }),
        });
      case "threw":
        return Object.freeze({
          ending: "threw",
          error: String(play.error),
          trials,
          ears: Object.freeze({ left: unreported, right: unreported }),
        });
    }
  },
});

/**
 * Plays one room of the spec engine like `specSearchUnderTest.runRoom` and returns the engine's
 * full `RoomResult`, for the spec-only checks. Throws an `Error` when the room asks for more
 * trials than its budget, and passes on anything the engine throws.
 */
export function runSpecRoom(input: RunInput): RoomResult {
  const play = playSpecRoom(input);
  switch (play.ending) {
    case "finished":
      return play.result;
    case "budgetExceeded":
      throw new Error(
        `The room asked for more than ${String(input.trialBudget)} trials.`,
      );
    case "threw":
      throw play.error;
  }
}

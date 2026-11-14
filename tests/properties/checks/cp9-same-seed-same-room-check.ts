import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type {
  ListenerResponse,
  SimulatedListener,
} from "../../listeners/listener-types";
import {
  generousTrialBudgetCount,
  type SearchUnderTest,
} from "../../listeners/search-under-test";
import { checkThat } from "./check-that";
import type { HarnessNeutralUniversalCheck } from "./check-types";
import { roomInputArbitrary, runInputRoom } from "./room-input-arbitrary";

/** Answers with a recorded list of responses, in order, and "none" once the list is used up. */
const replayListener = (
  responses: readonly ListenerResponse[],
): SimulatedListener => {
  let index = 0;
  return {
    respond: (): ListenerResponse => {
      const response = responses[index] ?? "none";
      index += 1;
      return response;
    },
  };
};

/**
 * CP9. Same seed, same responses, same room (Universal; R1.5, brief property 5). A room is run
 * once with the input's responder, and then again from the same seed with a listener that
 * replays the first run's responses. The two runs must be deep-equal: every trial with its ear,
 * level and gap, the ending and the ear results. A search that takes no seed cannot be checked.
 */
export const cp9SameSeedSameRoomCheck: HarnessNeutralUniversalCheck =
  Object.freeze({
    id: "CP9",
    title: "Same seed, same responses, same room",
    briefProperty: 5,
    requirements: ["R1.5"],
    kind: "universal",
    harnessNeutral: true,
    notCheckableReason: (search: SearchUnderTest) =>
      search.takesSeed ? undefined : "the search does not take a seed",
    parameters: { numRuns: 200 },
    property: (
      search: SearchUnderTest,
      settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>,
    ) =>
      fc.property(roomInputArbitrary(settingsArbitrary), (input) => {
        const first = runInputRoom(search, input);
        const second = search.runRoom({
          seed: input.seed,
          settings: input.settings,
          listener: replayListener(first.trials.map((trial) => trial.response)),
          trialBudget: generousTrialBudgetCount,
        });
        checkThat(isDeepStrictEqual(first, second), () => {
          const firstDifference = first.trials.findIndex(
            (trial, index) => !isDeepStrictEqual(trial, second.trials[index]),
          );
          return firstDifference >= 0
            ? `the runs differ at trial ${String(firstDifference + 1)}: ${JSON.stringify(first.trials[firstDifference])} and ${JSON.stringify(second.trials[firstDifference])}`
            : `the runs differ: ${JSON.stringify({ ...first, trials: first.trials.length })} and ${JSON.stringify({ ...second, trials: second.trials.length })}`;
        });
      }),
  });

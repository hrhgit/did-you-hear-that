import fc from "fast-check";
import {
  atLeastFraction,
  atMostFraction,
} from "../../../src/engine/fraction-comparisons";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import { checkThat } from "./check-that";
import type { HarnessNeutralUniversalCheck } from "./check-types";
import { roomInputArbitrary, runInputRoom } from "./room-input-arbitrary";

/**
 * CP7. The no-sound share is always in range (Universal; R9.3, R9.4, brief property 4). Every
 * finished room's share of no-sound trials lies from the minimum to the maximum, inclusive, as
 * judged by `atLeastFraction` and `atMostFraction` (D29). A room that did not finish has no final
 * share. CP4 reports it.
 */
export const cp7NoSoundShareCheck: HarnessNeutralUniversalCheck = Object.freeze(
  {
    id: "CP7",
    title: "The no-sound share is always in range",
    briefProperty: 4,
    requirements: ["R9.3", "R9.4"],
    kind: "universal",
    harnessNeutral: true,
    notCheckableReason: () => undefined,
    parameters: { numRuns: 200 },
    property: (
      search: SearchUnderTest,
      settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>,
    ) =>
      fc.property(roomInputArbitrary(settingsArbitrary), (input) => {
        const run = runInputRoom(search, input);
        if (run.ending !== "finished") {
          return;
        }
        const { noSoundTrialShareMinFraction, noSoundTrialShareMaxFraction } =
          input.settings;
        const trialCount = run.trials.length;
        const noSoundTrialCount = run.trials.filter(
          (trial) => trial.kind === "noSound",
        ).length;
        checkThat(
          atLeastFraction(
            noSoundTrialCount,
            trialCount,
            noSoundTrialShareMinFraction,
          ) &&
            atMostFraction(
              noSoundTrialCount,
              trialCount,
              noSoundTrialShareMaxFraction,
            ),
          () =>
            `${String(noSoundTrialCount)} no-sound trials in ${String(trialCount)} is outside ${String(noSoundTrialShareMinFraction)} to ${String(noSoundTrialShareMaxFraction)}`,
        );
      }),
  },
);

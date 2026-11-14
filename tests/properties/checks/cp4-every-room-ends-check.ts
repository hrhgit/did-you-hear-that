import fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import { checkThat } from "./check-that";
import type { HarnessNeutralUniversalCheck } from "./check-types";
import { roomInputArbitrary, runInputRoom } from "./room-input-arbitrary";

/**
 * CP4. Every room ends (Universal; R10.1, brief property 2), the harness-neutral part: for any
 * settings, seed and responder, the room finishes, and each ear has at most
 * `trialLimitPerEarPerRoomCount` presentations. The room total of R10.2 is the spec-only part in
 * `cp4-room-trial-limit-check.ts` (D38).
 */
export const cp4EveryRoomEndsCheck: HarnessNeutralUniversalCheck =
  Object.freeze({
    id: "CP4",
    part: "ending and per-ear limit",
    title: "Every room ends",
    briefProperty: 2,
    requirements: ["R10.1"],
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
        checkThat(
          run.ending === "finished",
          () =>
            `the room did not finish: ${run.ending} after ${String(run.trials.length)} trials${run.error === undefined ? "" : ` (${run.error})`}`,
        );
        for (const ear of ["left", "right"] as const) {
          const presentationCount = run.trials.filter(
            (trial) => trial.kind === "sound" && trial.ear === ear,
          ).length;
          checkThat(
            presentationCount <= input.settings.trialLimitPerEarPerRoomCount,
            () =>
              `the ${ear} ear had ${String(presentationCount)} presentations, above the limit of ${String(input.settings.trialLimitPerEarPerRoomCount)}`,
          );
        }
      }),
  });

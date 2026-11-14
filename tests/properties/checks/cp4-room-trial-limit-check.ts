import fc from "fast-check";
import { roomLimits } from "../../../src/engine/room-limits";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { runSpecRoom } from "../../listeners/spec-search-under-test";
import { checkThat } from "./check-that";
import type { SpecOnlyUniversalCheck } from "./check-types";
import { roomInputArbitrary } from "./room-input-arbitrary";

/**
 * CP4. Every room ends (Universal; R10.2, R10.3, brief property 2), the spec-only part: the room
 * finishes after at most Room_Trial_Limit responses, so the harness never has to answer more,
 * and its result agrees with its own records about the counts (D38).
 */
export const cp4RoomTrialLimitCheck: SpecOnlyUniversalCheck = Object.freeze({
  id: "CP4",
  part: "room total",
  title: "Every room ends within Room_Trial_Limit",
  briefProperty: 2,
  requirements: ["R10.1", "R10.2", "R10.3"],
  kind: "universal",
  harnessNeutral: false,
  parameters: { numRuns: 200 },
  property: (settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>) =>
    fc.property(roomInputArbitrary(settingsArbitrary), (input) => {
      const { roomTrialLimitCount } = roomLimits(input.settings);
      // Throws when the room asks for a trial after Room_Trial_Limit answered trials.
      const result = runSpecRoom({
        seed: input.seed,
        settings: input.settings,
        listener: input.responder.createListener(),
        trialBudget: roomTrialLimitCount,
      });
      checkThat(
        result.trials.length <= roomTrialLimitCount,
        () =>
          `the room had ${String(result.trials.length)} trials, above Room_Trial_Limit ${String(roomTrialLimitCount)}`,
      );
      for (const ear of ["left", "right"] as const) {
        checkThat(
          result[ear].presentationCount <=
            input.settings.trialLimitPerEarPerRoomCount,
          () =>
            `the ${ear} ear reports ${String(result[ear].presentationCount)} presentations, above the limit`,
        );
      }
    }),
});

import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { roomLimits } from "../../../src/engine/room-limits";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { runSpecRoom } from "../../listeners/spec-search-under-test";
import { checkThat } from "./check-that";
import type { SpecOnlyUniversalCheck } from "./check-types";
import { replayRoom } from "./ear-oracle";
import { roomInputArbitrary } from "./room-input-arbitrary";

/**
 * CP6. The result agrees with its own record (Universal; R4, R5, R6, R7, R8, R11). The oracle in
 * `ear-oracle.ts` replays the room from its trial records and must find no mismatch, and the
 * engine's ear results and false alarm figures must equal the oracle's.
 */
export const cp6ResultMatchesRecordCheck: SpecOnlyUniversalCheck =
  Object.freeze({
    id: "CP6",
    title: "The result agrees with its own record",
    requirements: ["R4", "R5", "R6", "R7", "R8", "R11"],
    kind: "universal",
    harnessNeutral: false,
    parameters: { numRuns: 200 },
    property: (settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>) =>
      fc.property(roomInputArbitrary(settingsArbitrary), (input) => {
        const result = runSpecRoom({
          seed: input.seed,
          settings: input.settings,
          listener: input.responder.createListener(),
          trialBudget: roomLimits(input.settings).roomTrialLimitCount,
        });
        const oracle = replayRoom(result.trials, input.settings);
        checkThat(
          oracle.mismatches.length === 0,
          () =>
            `the records differ from the requirements:\n${oracle.mismatches.join("\n")}`,
        );
        const pairs = [
          ["left", result.left, oracle.left],
          ["right", result.right, oracle.right],
          [
            "noSoundTrialCount",
            result.noSoundTrialCount,
            oracle.noSoundTrialCount,
          ],
          ["falseAlarmCount", result.falseAlarmCount, oracle.falseAlarmCount],
          [
            "falseAlarmRateFraction",
            result.falseAlarmRateFraction,
            oracle.falseAlarmRateFraction,
          ],
          [
            "falseAlarmRateAboveLimit",
            result.falseAlarmRateAboveLimit,
            oracle.falseAlarmRateAboveLimit,
          ],
        ] as const;
        for (const [field, engine, expected] of pairs) {
          checkThat(
            isDeepStrictEqual(engine, expected),
            () =>
              `${field}: the engine reports ${JSON.stringify(engine)}, the oracle ${JSON.stringify(expected)}`,
          );
        }
      }),
  });

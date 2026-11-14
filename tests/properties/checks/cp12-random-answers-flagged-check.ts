import { createSeededRandom } from "../../../src/config/seeded-random";
import { atLeastFraction } from "../../../src/engine/fraction-comparisons";
import { roomLimits } from "../../../src/engine/room-limits";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { extremeListeners } from "../../listeners/extreme-listeners";
import { drawSeed } from "../../listeners/play-population-rooms";
import { runSpecRoom } from "../../listeners/spec-search-under-test";
import type { SpecOnlyStatisticalCheck } from "./check-types";

const parameters = Object.freeze({
  seed: 20261119,
  roomCount: 500,
  bothUnreliableMinFraction: 0.95,
  timeoutMs: 30_000,
});

/**
 * CP12. Extreme listeners, the statistical part (R8, R13.5): over 500 rooms with seeds drawn
 * from 20261119, a listener that answers at random leaves both ears unreliable in at least 95
 * percent of rooms.
 */
export const cp12RandomAnswersFlaggedCheck: SpecOnlyStatisticalCheck =
  Object.freeze({
    id: "CP12",
    part: "answers at random",
    title: "Extreme listeners",
    requirements: ["R8", "R13.5"],
    kind: "statistical",
    harnessNeutral: false,
    parameters,
    evaluate: (settings: ThresholdSearchSettings) => {
      const seeds = createSeededRandom(parameters.seed);
      const { roomTrialLimitCount } = roomLimits(settings);
      let bothUnreliableCount = 0;
      const reasonCounts: Record<string, number> = {};
      const notFlagged: Record<string, unknown>[] = [];
      for (let room = 1; room <= parameters.roomCount; room += 1) {
        const engineSeed = drawSeed(seeds);
        const listenerSeed = drawSeed(seeds);
        const result = runSpecRoom({
          seed: engineSeed,
          settings,
          listener: extremeListeners.answersAtRandom(
            createSeededRandom(listenerSeed),
          ),
          trialBudget: roomTrialLimitCount,
        });
        const states = [result.left, result.right];
        for (const earResult of states) {
          if (earResult.state === "unreliable") {
            for (const reason of earResult.reasons) {
              reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
            }
          }
        }
        if (states.every((earResult) => earResult.state === "unreliable")) {
          bothUnreliableCount += 1;
        } else if (notFlagged.length < 5) {
          notFlagged.push({
            room,
            engineSeed,
            listenerSeed,
            left: result.left,
            right: result.right,
            falseAlarmCount: result.falseAlarmCount,
            noSoundTrialCount: result.noSoundTrialCount,
          });
        }
      }
      const holds = atLeastFraction(
        bothUnreliableCount,
        parameters.roomCount,
        parameters.bothUnreliableMinFraction,
      );
      return Object.freeze({
        holds,
        ...(holds ? {} : { firstCounterexample: notFlagged[0] }),
        metrics: {
          seed: parameters.seed,
          roomCount: parameters.roomCount,
          bothUnreliableMinFraction: parameters.bothUnreliableMinFraction,
          bothUnreliableFraction: bothUnreliableCount / parameters.roomCount,
          reasonCountsOverEars: reasonCounts,
          roomsNotFlagged: notFlagged,
        },
      });
    },
  });

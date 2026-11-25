import type { EarEnding, EarSearch, Presentation } from "./ear-search";
import type { Ear, ThresholdSearchSettings } from "./search-types";

interface Catch {
  readonly levelDb: number;
  readonly perfect: boolean;
}

/** Finds one heard level next to a missed level, with at most one confirmation. */
export function createQuickEarSearch(
  ear: Ear,
  settings: ThresholdSearchSettings,
): EarSearch {
  const {
    capRelativeToAnchorDb: capDb,
    floorDb,
    upwardStepDb,
    downwardStepDb,
    capMissesForWorseThanCapCount,
    trialLimitPerEarPerRoomCount,
  } = settings;
  const recorded: Presentation[] = [];
  let levelDb = settings.startingLevelDb;
  let direction: Presentation["direction"] = "first";
  let ending: EarEnding | undefined;
  let lastCatch: Catch | undefined;
  let confirming = false;
  let capMisses = 0;

  const heardAt = (heardDb: number): EarEnding =>
    heardDb === floorDb
      ? Object.freeze({ kind: "betterThanFloor" })
      : Object.freeze({ kind: "found", thresholdDb: heardDb });

  const settle = (candidate: Catch): void => {
    if (candidate.perfect) {
      ending = heardAt(candidate.levelDb);
      return;
    }
    confirming = true;
    direction = candidate.levelDb > levelDb ? "ascending" : "descending";
    levelDb = candidate.levelDb;
  };

  const requireSearching = (): void => {
    if (ending !== undefined) {
      throw new Error(`The ${ear} ear search has ended.`);
    }
  };

  return Object.freeze<EarSearch>({
    ear,
    isSearching: () => ending === undefined,
    next() {
      requireSearching();
      return Object.freeze({ levelDb, direction });
    },
    record(outcome, grade) {
      requireSearching();
      recorded.push(Object.freeze({ levelDb, direction, outcome }));
      if (confirming) {
        ending =
          outcome === "caught"
            ? heardAt(levelDb)
            : Object.freeze({ kind: "unconfirmed" });
      } else if (outcome === "caught") {
        const caught = { levelDb, perfect: grade === "perfect" };
        if (direction === "ascending" || levelDb === floorDb) {
          settle(caught);
        } else {
          lastCatch = caught;
          levelDb = Math.max(floorDb, levelDb - downwardStepDb);
          direction = "descending";
        }
      } else if (lastCatch !== undefined) {
        settle(lastCatch);
      } else {
        if (levelDb === capDb) {
          capMisses += 1;
        }
        if (capMisses >= capMissesForWorseThanCapCount) {
          ending = Object.freeze({ kind: "worseThanCap" });
        } else {
          levelDb = Math.min(capDb, levelDb + upwardStepDb);
          direction = "ascending";
        }
      }

      if (recorded.length >= trialLimitPerEarPerRoomCount) {
        ending ??= Object.freeze({ kind: "trialLimit" });
      }
    },
    ending: () => ending,
    cutOff() {
      ending ??= Object.freeze({ kind: "trialLimit" });
    },
    remainingPresentationsLowerBound: () => (ending === undefined ? 1 : 0),
    presentations: () => Object.freeze([...recorded]),
  });
}

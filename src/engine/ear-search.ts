import { atLeastFraction } from "./fraction-comparisons";
import type {
  Direction,
  Ear,
  SoundOutcome,
  ThresholdSearchSettings,
} from "./search-types";

export type EarEnding =
  | { readonly kind: "found"; readonly thresholdDb: number }
  | { readonly kind: "betterThanFloor" }
  | { readonly kind: "worseThanCap" }
  | { readonly kind: "trialLimit" };

export interface Presentation {
  readonly levelDb: number;
  readonly direction: Direction;
  readonly outcome: SoundOutcome;
}

export interface EarSearch {
  readonly ear: Ear;
  isSearching(): boolean;
  /** Throws an Error once the search has ended. */
  next(): { readonly levelDb: number; readonly direction: Direction };
  /** Throws an Error once the search has ended. */
  record(outcome: SoundOutcome): void;
  ending(): EarEnding | undefined;
  /** 0 once ended; otherwise at least 1. See D6. */
  remainingPresentationsLowerBound(): number;
  presentations(): readonly Presentation[];
}

interface AscendingTally {
  presentationCount: number;
  catchCount: number;
  nonCatchCount: number;
}

/**
 * The search for one ear in one room (design.md, `createEarSearch`). A deterministic state
 * machine with no randomness: it holds the next level and direction and the tallies the ending
 * rules need. Levels are integers (R2.3), so they are exact map keys. A wrong-side answer is a
 * non-catch everywhere here (R4.3).
 *
 * Expects settings that `validateSearchSettings` has accepted.
 */
export function createEarSearch(
  ear: Ear,
  settings: ThresholdSearchSettings,
): EarSearch {
  const {
    downwardStepDb,
    upwardStepDb,
    floorDb,
    capRelativeToAnchorDb: capDb,
    trialLimitPerEarPerRoomCount,
    thresholdCatchesMinCount,
    thresholdCatchShareMinFraction,
    floorCatchesForBetterThanFloorCount,
    capMissesForWorseThanCapCount,
  } = settings;

  let nextLevelDb = settings.startingLevelDb;
  let nextDirection: Direction = "first";
  let currentEnding: EarEnding | undefined;
  const recorded: Presentation[] = [];
  const ascendingTallies = new Map<number, AscendingTally>();
  let mostAscendingCatchesAtOneLevelCount = 0;
  let floorPresentationCount = 0;
  let floorCatchCount = 0;

  const ascendingTallyAt = (levelDb: number): AscendingTally => {
    let tally = ascendingTallies.get(levelDb);
    if (tally === undefined) {
      tally = { presentationCount: 0, catchCount: 0, nonCatchCount: 0 };
      ascendingTallies.set(levelDb, tally);
    }
    return tally;
  };

  const foundAt = (levelDb: number): boolean => {
    const tally = ascendingTallyAt(levelDb);
    return (
      tally.catchCount >= thresholdCatchesMinCount &&
      atLeastFraction(
        tally.catchCount,
        tally.presentationCount,
        thresholdCatchShareMinFraction,
      )
    );
  };

  /**
   * Could the level one upward step below `levelDb` still meet the found rule on its next
   * ascending presentation? While it could, a level that meets the rule is not yet the quietest
   * one (D40). The floor never has ascending presentations (D2), so it is never open. The cap is
   * never held back, so the loudest level is still played at most three times (D4).
   */
  const quieterLevelStillOpen = (levelDb: number): boolean => {
    const quieterDb = levelDb - upwardStepDb;
    if (levelDb >= capDb || quieterDb <= floorDb) {
      return false;
    }
    const tally = ascendingTallies.get(quieterDb);
    const catchCount = (tally?.catchCount ?? 0) + 1;
    const presentationCount = (tally?.presentationCount ?? 0) + 1;
    return (
      catchCount >= thresholdCatchesMinCount &&
      atLeastFraction(
        catchCount,
        presentationCount,
        thresholdCatchShareMinFraction,
      )
    );
  };

  const betterThanFloorReached = (): boolean =>
    floorCatchCount >= floorCatchesForBetterThanFloorCount &&
    atLeastFraction(
      floorCatchCount,
      floorPresentationCount,
      thresholdCatchShareMinFraction,
    );

  const ascendingNonCatchesAtCapCount = (): number =>
    ascendingTallies.get(capDb)?.nonCatchCount ?? 0;

  const requireSearching = (method: string): void => {
    if (currentEnding !== undefined) {
      throw new Error(
        `The ${ear} ear search has ended, so ${method} may not be called.`,
      );
    }
  };

  return Object.freeze({
    ear,

    isSearching: (): boolean => currentEnding === undefined,

    next: () => {
      requireSearching("next");
      return Object.freeze({ levelDb: nextLevelDb, direction: nextDirection });
    },

    record: (outcome: SoundOutcome): void => {
      requireSearching("record");
      const presentation: Presentation = Object.freeze({
        levelDb: nextLevelDb,
        direction: nextDirection,
        outcome,
      });
      const caught = outcome === "caught";
      recorded.push(presentation);
      if (presentation.direction === "ascending") {
        const tally = ascendingTallyAt(presentation.levelDb);
        tally.presentationCount += 1;
        if (caught) {
          tally.catchCount += 1;
          mostAscendingCatchesAtOneLevelCount = Math.max(
            mostAscendingCatchesAtOneLevelCount,
            tally.catchCount,
          );
        } else {
          tally.nonCatchCount += 1;
        }
      }
      if (presentation.levelDb === floorDb) {
        floorPresentationCount += 1;
        if (caught) {
          floorCatchCount += 1;
        }
      }

      // Only the first rule that applies counts (R7.3: found before worse than cap).
      if (
        presentation.direction === "ascending" &&
        foundAt(presentation.levelDb) &&
        !quieterLevelStillOpen(presentation.levelDb)
      ) {
        currentEnding = Object.freeze({
          kind: "found",
          thresholdDb: presentation.levelDb,
        });
      } else if (presentation.levelDb === floorDb && betterThanFloorReached()) {
        currentEnding = Object.freeze({ kind: "betterThanFloor" });
      } else if (
        presentation.direction === "ascending" &&
        presentation.levelDb === capDb &&
        ascendingNonCatchesAtCapCount() >= capMissesForWorseThanCapCount
      ) {
        currentEnding = Object.freeze({ kind: "worseThanCap" });
      } else if (recorded.length === trialLimitPerEarPerRoomCount) {
        currentEnding = Object.freeze({ kind: "trialLimit" });
      } else {
        // D2: the direction comes from the outcome, so clamped levels need no special rule.
        nextLevelDb = caught
          ? Math.max(floorDb, presentation.levelDb - downwardStepDb)
          : Math.min(capDb, presentation.levelDb + upwardStepDb);
        nextDirection = caught ? "descending" : "ascending";
      }
    },

    ending: (): EarEnding | undefined => currentEnding,

    remainingPresentationsLowerBound: (): number => {
      if (currentEnding !== undefined) {
        return 0;
      }
      // Each ending needs its count to reach its limit, and one presentation raises any one
      // count by at most 1 (D6).
      return Math.max(
        1,
        Math.min(
          thresholdCatchesMinCount - mostAscendingCatchesAtOneLevelCount,
          floorCatchesForBetterThanFloorCount - floorCatchCount,
          capMissesForWorseThanCapCount - ascendingNonCatchesAtCapCount(),
          trialLimitPerEarPerRoomCount - recorded.length,
        ),
      );
    },

    presentations: (): readonly Presentation[] => Object.freeze([...recorded]),
  });
}

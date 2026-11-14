import type { EarEnding, Presentation } from "./ear-search";
import type {
  EarCounts,
  EarResult,
  ThresholdSearchSettings,
  UnreliableReason,
} from "./search-types";

function countPresentations(presentations: readonly Presentation[]): EarCounts {
  const countOf = (outcome: Presentation["outcome"]): number =>
    presentations.filter((presentation) => presentation.outcome === outcome)
      .length;
  return {
    presentationCount: presentations.length,
    catchCount: countOf("caught"),
    wrongSideCount: countOf("wrongSide"),
    missCount: countOf("missed"),
  };
}

/**
 * Turns an ear's ending into its final result (R8, R11.2). Reasons are listed in the order
 * `trialLimit`, `inconsistentCatch`, `falseAlarmRate` (R8.5). The reference for an inconsistent
 * catch is the threshold for found and the cap for worse than cap (D5). Better than floor and
 * the trial limit have no reference, so they are never marked inconsistent.
 */
export function finalizeEarResult(input: {
  ending: EarEnding;
  presentations: readonly Presentation[];
  falseAlarmRateAboveLimit: boolean;
  settings: ThresholdSearchSettings;
}): EarResult {
  const { ending, presentations, falseAlarmRateAboveLimit, settings } = input;
  const counts = countPresentations(presentations);
  const reasons: UnreliableReason[] = [];

  if (ending.kind === "trialLimit") {
    reasons.push("trialLimit");
  }
  const referenceDb =
    ending.kind === "found"
      ? ending.thresholdDb
      : ending.kind === "worseThanCap"
        ? settings.capRelativeToAnchorDb
        : undefined;
  if (
    referenceDb !== undefined &&
    presentations.some(
      (presentation) =>
        presentation.outcome === "caught" &&
        presentation.levelDb <=
          referenceDb - settings.inconsistentCatchMarginDb,
    )
  ) {
    reasons.push("inconsistentCatch");
  }
  if (falseAlarmRateAboveLimit) {
    reasons.push("falseAlarmRate");
  }

  if (ending.kind === "trialLimit" || reasons.length > 0) {
    return Object.freeze({
      ...counts,
      state: "unreliable",
      reasons: Object.freeze(reasons),
    });
  }
  switch (ending.kind) {
    case "found":
      return Object.freeze({
        ...counts,
        state: "found",
        thresholdDb: ending.thresholdDb,
      });
    case "betterThanFloor":
      return Object.freeze({ ...counts, state: "betterThanFloor" });
    case "worseThanCap":
      return Object.freeze({ ...counts, state: "worseThanCap" });
  }
}

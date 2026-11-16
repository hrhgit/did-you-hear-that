import type { WingWords } from "../copy/result-lines";
import {
  differenceLabel,
  unreliableReasonLine,
  wingLine,
} from "../copy/result-lines";
import { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import type { ComparisonRunWords } from "../copy/swapped-repeat-lines";
import {
  comparisonDescription,
  outcomeLines,
} from "../copy/swapped-repeat-lines";
import { earpieceOnEar } from "./earpiece-on-ear";
import type { FloorScale } from "./light-depth-fraction";
import { lightDepthFraction } from "./light-depth-fraction";
import type {
  Ear,
  EarpieceArrangement,
  RoomSummary,
  SwappedRepeatComparison,
  SwappedRepeatComparisonRun,
  SwappedRepeatComparisonWing,
  SwappedRepeatRun,
  VisitEarResult,
} from "./visit-flow-types";

/** Freezes a value and every object reachable from it. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/** What the copy needs about one ear's result. */
function words(result: VisitEarResult): WingWords {
  return {
    state: result.state,
    thresholdDb: result.state === "found" ? result.thresholdDb : null,
    reasons: result.state === "unreliable" ? [...result.reasons] : [],
  };
}

/** One ear of one run, as the picture draws a wing, with the earpiece on that ear. */
function wing(
  result: VisitEarResult,
  ear: Ear,
  earpiece: Ear,
  scale: FloorScale,
): SwappedRepeatComparisonWing {
  return {
    ear,
    earpiece,
    earpieceLabel: swappedRepeatCopy.earpieceLabels[earpiece],
    state: result.state,
    thresholdDb: result.state === "found" ? result.thresholdDb : null,
    lightDepthFraction: lightDepthFraction(result, scale),
    line: wingLine(words(result)),
    reasonLine:
      result.state === "unreliable" && result.reasons.length > 0
        ? unreliableReasonLine(result.reasons[0])
        : null,
  };
}

/** One run of the floor: both ears, each with the earpiece on it, and the run's difference. */
function run(
  arrangement: EarpieceArrangement,
  left: VisitEarResult,
  right: VisitEarResult,
  earpieceOnEar: Readonly<Record<Ear, Ear>>,
  rightMinusLeftDb: number | null,
  scale: FloorScale,
): SwappedRepeatComparisonRun {
  return {
    arrangement,
    label: swappedRepeatCopy.runLabels[arrangement],
    left: wing(left, "left", earpieceOnEar.left, scale),
    right: wing(right, "right", earpieceOnEar.right, scale),
    rightMinusLeftDb,
    differenceLabel: differenceLabel(rightMinusLeftDb),
  };
}

/** What the copy needs about one run. */
function runWords(
  left: VisitEarResult,
  right: VisitEarResult,
  comparisonRun: SwappedRepeatComparisonRun,
): ComparisonRunWords {
  return {
    left: { ...words(left), earpiece: comparisonRun.left.earpiece },
    right: { ...words(right), earpiece: comparisonRun.right.earpiece },
    rightMinusLeftDb: comparisonRun.rightMinusLeftDb,
  };
}

/**
 * A floor's first run and its swapped repeat side by side (swapped-repeat design.md, "The
 * Comparison", D16, R11.2). Both runs are on the floor's own scale, from the first run's
 * `searchCapDb` to `floorDb`, so a depth in the repeat means what a depth in the first run means
 * on that floor and nothing across floors. Each ear is labelled with the earpiece on it in that
 * run: as marked its own, in the repeat the record's `earpieceOnEar`. The outcome is the record's.
 * Every string comes from `src/copy`. Throws a `RangeError` when the record is not of the summary's
 * floor. A pure function; the result is deeply frozen.
 */
export function swappedRepeatComparison(
  firstRun: RoomSummary,
  repeatRun: SwappedRepeatRun,
  floorDb: number,
): SwappedRepeatComparison {
  const { room } = firstRun;
  if (repeatRun.roomIndex !== room.roomIndex) {
    throw new RangeError(
      `A repeat of floor ${String(repeatRun.roomIndex)} cannot be set beside floor ${String(room.roomIndex)}.`,
    );
  }
  const scale: FloorScale = { searchCapDb: firstRun.searchCapDb, floorDb };
  const first = run(
    "asMarked",
    firstRun.left,
    firstRun.right,
    earpieceOnEar("asMarked"),
    firstRun.rightMinusLeftDb,
    scale,
  );
  const repeat = run(
    "swapped",
    repeatRun.left,
    repeatRun.right,
    repeatRun.earpieceOnEar,
    repeatRun.rightMinusLeftDb,
    scale,
  );
  return deepFreeze<SwappedRepeatComparison>({
    roomIndex: room.roomIndex,
    runNumber: repeatRun.runNumber,
    heading: swappedRepeatCopy.comparisonHeading,
    runs: [first, repeat],
    outcome: repeatRun.outcome,
    unclearReason: repeatRun.unclearReason,
    outcomeLabel: swappedRepeatCopy.outcomeLabels[repeatRun.outcome],
    outcomeLines: [...outcomeLines(repeatRun.outcome, repeatRun.unclearReason)],
    description: comparisonDescription({
      roomId: room.roomId,
      frequencyHz: room.frequencyHz,
      runs: [
        runWords(firstRun.left, firstRun.right, first),
        runWords(repeatRun.left, repeatRun.right, repeat),
      ],
      outcome: repeatRun.outcome,
      unclearReason: repeatRun.unclearReason,
    }),
  });
}

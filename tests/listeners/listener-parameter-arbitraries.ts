import fc from "fast-check";
import type { RandomSource } from "../../src/config/seeded-random";
import type { ThresholdSearchSettings } from "../../src/engine/search-types";
import type { PsychometricListenerParameters } from "./psychometric-listener";

/** The levels the true thresholds are drawn between: from the floor to the cap (D17). */
export type ListenerLevelRange = Pick<
  ThresholdSearchSettings,
  "floorDb" | "capRelativeToAnchorDb"
>;

/**
 * A closed range of values on a grid of `1 / unitsPerValue`. Values are drawn as whole numbers
 * of grid units and divided, so 0.3 prints as 0.3 and counterexamples stay short.
 */
interface GridRange {
  readonly min: number;
  readonly max: number;
  readonly unitsPerValue: number;
}

/** The parameter ranges of D17 apart from the true threshold, which depends on the levels. */
export interface ListenerParameterRange {
  readonly name: "plausible" | "attentive";
  readonly widthDb: GridRange;
  readonly lapseFraction: GridRange;
  readonly falseAlarmFraction: GridRange;
  readonly wrongSideFraction: GridRange;
}

const tenthsOfADb = 10;
const thousandths = 1000;

const levelGrid = (levels: ListenerLevelRange): GridRange => ({
  min: levels.floorDb,
  max: levels.capRelativeToAnchorDb,
  unitsPerValue: tenthsOfADb,
});

/** Plausible_Range (D17): floor to cap, width 1 to 8 dB, lapse to 0.10, false alarm to 0.50, wrong side to 0.10. */
export const plausibleListenerRange: ListenerParameterRange = Object.freeze({
  name: "plausible",
  widthDb: { min: 1, max: 8, unitsPerValue: tenthsOfADb },
  lapseFraction: { min: 0, max: 0.1, unitsPerValue: thousandths },
  falseAlarmFraction: { min: 0, max: 0.5, unitsPerValue: thousandths },
  wrongSideFraction: { min: 0, max: 0.1, unitsPerValue: thousandths },
});

/** Attentive_Range (D17): floor to cap, width 1 to 4 dB, lapse, false alarm and wrong side to 0.02. */
export const attentiveListenerRange: ListenerParameterRange = Object.freeze({
  name: "attentive",
  widthDb: { min: 1, max: 4, unitsPerValue: tenthsOfADb },
  lapseFraction: { min: 0, max: 0.02, unitsPerValue: thousandths },
  falseAlarmFraction: { min: 0, max: 0.02, unitsPerValue: thousandths },
  wrongSideFraction: { min: 0, max: 0.02, unitsPerValue: thousandths },
});

const unitBounds = (grid: GridRange): { min: number; max: number } => ({
  min: Math.round(grid.min * grid.unitsPerValue),
  max: Math.round(grid.max * grid.unitsPerValue),
});

const gridArbitrary = (grid: GridRange): fc.Arbitrary<number> =>
  fc.integer(unitBounds(grid)).map((units) => units / grid.unitsPerValue);

/** A value drawn uniformly from the grid with one draw from `random`. */
const drawOnGrid = (grid: GridRange, random: RandomSource): number => {
  const { min, max } = unitBounds(grid);
  return (
    (min + Math.floor(random.next() * (max - min + 1))) / grid.unitsPerValue
  );
};

function rangeArbitrary(
  range: ListenerParameterRange,
  levels: ListenerLevelRange,
): fc.Arbitrary<PsychometricListenerParameters> {
  return fc.record({
    trueThresholdDb: fc.record({
      left: gridArbitrary(levelGrid(levels)),
      right: gridArbitrary(levelGrid(levels)),
    }),
    widthDb: gridArbitrary(range.widthDb),
    lapseFraction: gridArbitrary(range.lapseFraction),
    falseAlarmFraction: gridArbitrary(range.falseAlarmFraction),
    wrongSideFraction: gridArbitrary(range.wrongSideFraction),
  });
}

/** Psychometric_Listener parameters from the Plausible_Range (R13.8, D17). */
export const plausibleListenerParameters = (
  levels: ListenerLevelRange,
): fc.Arbitrary<PsychometricListenerParameters> =>
  rangeArbitrary(plausibleListenerRange, levels);

/** Psychometric_Listener parameters from the Attentive_Range (R13.8, D17). */
export const attentiveListenerParameters = (
  levels: ListenerLevelRange,
): fc.Arbitrary<PsychometricListenerParameters> =>
  rangeArbitrary(attentiveListenerRange, levels);

/**
 * Draws one parameter set uniformly from the grid of a range, with six draws from `random` in
 * the order left threshold, right threshold, width, lapse, false alarm, wrong side. Population
 * measurements use this instead of fast-check, whose generation leans towards the ends of each
 * range (D36).
 */
export function drawListenerParameters(
  range: ListenerParameterRange,
  levels: ListenerLevelRange,
  random: RandomSource,
): PsychometricListenerParameters {
  const left = drawOnGrid(levelGrid(levels), random);
  const right = drawOnGrid(levelGrid(levels), random);
  return Object.freeze({
    trueThresholdDb: Object.freeze({ left, right }),
    widthDb: drawOnGrid(range.widthDb, random),
    lapseFraction: drawOnGrid(range.lapseFraction, random),
    falseAlarmFraction: drawOnGrid(range.falseAlarmFraction, random),
    wrongSideFraction: drawOnGrid(range.wrongSideFraction, random),
  });
}

import fc from "fast-check";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";

// The arbitraries of the swapped repeat's properties (swapped-repeat design.md, "Correctness
// properties"). Task 6 adds the first: an ear difference and a headphone imbalance with a base
// level, a search cap and two engine seeds, for CP1. Later tasks add the visit logs at the
// result, the repeat scripts, the refusal scripts and the saved visits.

const {
  floorDb,
  upwardStepDb: stepDb,
  capRelativeToAnchorDb,
  swappedRepeatDifferenceDb,
} = hearingMethodConfig;

/** E and H are drawn from −40 to 40 dB (design.md, "Correctness properties"). */
const differenceRangeDb = 40;

/** One run in ten puts the base level where a threshold may lie beyond the floor or the cap. */
const insideWeight = 9;
const beyondWeight = 1;

/** How far beyond the floor and the cap a base level of a run "beyond" may reach. */
const beyondRangeDb = 20;

const seedMax = 2 ** 32 - 1;

/** One case of "Correct attribution". */
export interface AttributionCase {
  /** Ear_Difference E: the true right threshold minus the true left threshold, by ear. */
  readonly earDifferenceDb: number;
  /** Headphone_Imbalance H: how much quieter the right earpiece plays than the left. */
  readonly imbalanceDb: number;
  /** The middle of the two true thresholds: left at base − E/2, right at base + E/2. */
  readonly baseDb: number;
  /** The search's cap, on the level grid. */
  readonly searchCapDb: number;
  /** Whether every threshold heard through an earpiece lies at least one step inside the floor and the cap. */
  readonly inside: boolean;
  /** The engine seed of the first run, as marked. */
  readonly firstEngineSeed: number;
  /** The engine seed of the repeat, swapped. */
  readonly repeatEngineSeed: number;
}

/** A whole number of decibels from −40 to 40. */
const anyDifferenceArbitrary = fc.integer({
  min: -differenceRangeDb,
  max: differenceRangeDb,
});

/** A whole number of decibels within one step of the limit, of either sign. */
const nearLimitArbitrary = fc
  .tuple(
    fc.integer({
      min: swappedRepeatDifferenceDb - stepDb,
      max: swappedRepeatDifferenceDb + stepDb,
    }),
    fc.boolean(),
  )
  .map(([size, negative]) => (negative ? -size : size));

/**
 * E and H: one run in four with E = 0, one in four with H = 0, one in four with |E| or |H| within
 * one step of 15, and the rest with both anywhere from −40 to 40.
 */
const differencesArbitrary: fc.Arbitrary<{
  readonly earDifferenceDb: number;
  readonly imbalanceDb: number;
}> = fc.oneof(
  anyDifferenceArbitrary.map((imbalanceDb) => ({
    earDifferenceDb: 0,
    imbalanceDb,
  })),
  anyDifferenceArbitrary.map((earDifferenceDb) => ({
    earDifferenceDb,
    imbalanceDb: 0,
  })),
  fc
    .tuple(nearLimitArbitrary, anyDifferenceArbitrary, fc.boolean())
    .map(([near, other, earNear]) =>
      earNear
        ? { earDifferenceDb: near, imbalanceDb: other }
        : { earDifferenceDb: other, imbalanceDb: near },
    ),
  fc.record({
    earDifferenceDb: anyDifferenceArbitrary,
    imbalanceDb: anyDifferenceArbitrary,
  }),
);

/** A search cap on the level grid from the lowest room top to the anchor cap: 0, 5, 10 or 15 dB. */
const searchCapArbitrary = fc
  .integer({
    min: 0,
    max: (capRelativeToAnchorDb - audioOutputConfig.roomTopMinDb) / stepDb,
  })
  .map((steps) => audioOutputConfig.roomTopMinDb + steps * stepDb);

/**
 * The base levels, as whole numbers, that put the four thresholds heard through an earpiece,
 * base ± E/2 ± H/2, at least one step inside the floor and the cap; null when none does.
 */
function insideBaseRange(
  earDifferenceDb: number,
  imbalanceDb: number,
  searchCapDb: number,
): { readonly min: number; readonly max: number } | null {
  const halfSpreadDb = (Math.abs(earDifferenceDb) + Math.abs(imbalanceDb)) / 2;
  const min = Math.ceil(floorDb + stepDb + halfSpreadDb);
  const max = Math.floor(searchCapDb - stepDb - halfSpreadDb);
  return min <= max ? { min, max } : null;
}

/** Every threshold heard through an earpiece, for a base level. */
export function earpieceThresholdsDb(
  earDifferenceDb: number,
  imbalanceDb: number,
  baseDb: number,
): readonly number[] {
  const left = baseDb - earDifferenceDb / 2;
  const right = baseDb + earDifferenceDb / 2;
  const half = imbalanceDb / 2;
  // Through the left earpiece a sound plays H/2 louder, so its threshold is H/2 lower; through
  // the right earpiece H/2 higher.
  return [left - half, left + half, right - half, right + half];
}

/**
 * An ear difference and an imbalance, a base level, a search cap and two engine seeds (CP1). Nine
 * runs in ten whose differences fit put every threshold heard through an earpiece at least one
 * step inside the floor and the cap; the others, and every run whose differences do not fit,
 * draw the base level from 20 dB beyond the floor to 20 dB beyond the cap, so that ears without a
 * level occur.
 */
export const attributionCaseArbitrary: fc.Arbitrary<AttributionCase> = fc
  .tuple(differencesArbitrary, searchCapArbitrary)
  .chain(([{ earDifferenceDb, imbalanceDb }, searchCapDb]) => {
    const inside = insideBaseRange(earDifferenceDb, imbalanceDb, searchCapDb);
    const beyond = fc.integer({
      min: floorDb - beyondRangeDb,
      max: searchCapDb + beyondRangeDb,
    });
    const base: fc.Arbitrary<number> =
      inside === null
        ? beyond
        : fc.oneof(
            { weight: insideWeight, arbitrary: fc.integer(inside) },
            { weight: beyondWeight, arbitrary: beyond },
          );
    return fc.record({
      earDifferenceDb: fc.constant(earDifferenceDb),
      imbalanceDb: fc.constant(imbalanceDb),
      baseDb: base,
      searchCapDb: fc.constant(searchCapDb),
      firstEngineSeed: fc.integer({ min: 0, max: seedMax }),
      repeatEngineSeed: fc.integer({ min: 0, max: seedMax }),
    });
  })
  .map((drawn) => ({
    ...drawn,
    inside: earpieceThresholdsDb(
      drawn.earDifferenceDb,
      drawn.imbalanceDb,
      drawn.baseDb,
    ).every(
      (thresholdDb) =>
        thresholdDb >= floorDb + stepDb &&
        thresholdDb <= drawn.searchCapDb - stepDb,
    ),
  }));

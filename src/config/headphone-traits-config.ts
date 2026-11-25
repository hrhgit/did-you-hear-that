/**
 * The numbers of the headphone traits (`.kiro/specs/headphone-traits/design.md`): the delay, the
 * easy turns, the quiet cut and the balance. Every field name ends in its unit. Levels are relative
 * to the calibration anchor, as everywhere in the visit. Starting values, to be settled by
 * listening tests; the design lists the ones it is least sure of.
 */
export interface HeadphoneTraitsConfig {
  /** A counted catch at or above this level is plainly audible (a Loud_Catch). */
  readonly loudLevelMinDb: number;
  /** The share of the quickest answers that sums up a set of answer times. */
  readonly quickFraction: number;
  /** Fewest seen catches (practice) for the delay to be read against them. */
  readonly seenCatchesMinCount: number;
  /** A screen's own delay plus how much slower seeing is than hearing. */
  readonly seenToHeardMs: number;
  /** How quickly a visitor answers a plain sound on a known beat, when no seen catch is there. */
  readonly quickHeardAnswerMs: number;
  /** Fewest heard catches before the live offset moves. */
  readonly liveHeardMinCount: number;
  /** The most the live offset moves at one update. */
  readonly offsetSlewMs: number;
  /** The largest live offset. */
  readonly offsetMaxMs: number;
  /** Fewest heard catches for the result to show a delay. */
  readonly delayLoudCatchesMinCount: number;
  /** A delay under this is quick. */
  readonly quickBelowMs: number;
  /** A delay from this up is long; between the two, noticeable. */
  readonly longFromMs: number;
  /** The result rounds the delay to this. */
  readonly delayRoundingMs: number;

  /** Of the last this many counted sound turns ... */
  readonly easyTurnWindowCount: number;
  /** ... at least this many not caught make the next turn an easy one. */
  readonly easyTurnMissesMinCount: number;
  /** No easy turn within this many turns after the last one. */
  readonly easyTurnSpacingCount: number;
  /** Easy turns are at most this share of the turns so far, easy turns included. */
  readonly easyTurnShareMax: number;
  /** How far above the creature's last catch on that ear an easy turn plays. */
  readonly easyAboveCaughtDb: number;

  /** The width of the window in which the edges of a quiet cut pile up. */
  readonly cutWindowDb: number;
  /** Fewest edges in that window. */
  readonly cutEdgesMinCount: number;
  /** Fewest pitches among them. */
  readonly cutPitchesMinCount: number;
  /** Least share of sharp edges among them. */
  readonly cutSharpShareMin: number;

  /** Fewest pitches with a level for both ears. */
  readonly balancePitchesMinCount: number;
  /** A plain offset is at least this. */
  readonly balanceOffsetMinDb: number;
  /** Below this the two sides are even. */
  readonly balanceEvenBelowDb: number;
  /** The most the pitches may spread around the offset. */
  readonly balanceSpreadMaxDb: number;
}

export const headphoneTraitsConfig: HeadphoneTraitsConfig = Object.freeze({
  // Ten below the starting level of −10 dB: the first sounds of every search.
  loudLevelMinDb: -20,
  quickFraction: 0.25,
  seenCatchesMinCount: 3,
  // About 30 ms for a screen to show a change and about 40 ms more to see than to hear.
  seenToHeardMs: 70,
  quickHeardAnswerMs: 300,
  liveHeardMinCount: 3,
  offsetSlewMs: 40,
  offsetMaxMs: 300,
  delayLoudCatchesMinCount: 6,
  quickBelowMs: 60,
  longFromMs: 150,
  delayRoundingMs: 10,

  easyTurnWindowCount: 3,
  easyTurnMissesMinCount: 2,
  easyTurnSpacingCount: 3,
  easyTurnShareMax: 0.25,
  easyAboveCaughtDb: 15,

  cutWindowDb: 6,
  cutEdgesMinCount: 4,
  cutPitchesMinCount: 3,
  cutSharpShareMin: 0.75,

  balancePitchesMinCount: 3,
  balanceOffsetMinDb: 4,
  balanceEvenBelowDb: 2.5,
  balanceSpreadMaxDb: 4,
});

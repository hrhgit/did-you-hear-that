import type { RhythmJudgement } from "../config/rhythm-config";

/**
 * The words of the rhythm game (2026-11-18): the creatures creep in on the beat to snuff Jack's
 * candle and take his candy, and a catch kicks them away.
 */
export const rhythmCopy = Object.freeze({
  /** Jack, the jack-o'-lantern in the middle of the room. */
  jackName: "Jack",
  /** The word over the count of turns in a row. */
  comboWord: "Combo",
  /** The word over the points. Never "score" (wording.md). */
  scoreWord: "Points",
  /** What pops up on a side for each judgement. */
  judgementWords: Object.freeze({
    perfect: "Perfect!",
    great: "Great",
    good: "Good",
    miss: "Miss",
    wrong: "Wrong side",
    trick: "Nothing there",
    steady: "Steady",
  } satisfies Record<RhythmJudgement, string>),
  /** What pops up for a kick that met no turn at all. */
  kickAtNothingWord: "Off beat",
  /** Said while the room practises: nothing counts yet. */
  warmUpWord: "Warm-up",
});

function requireCount(count: number, what: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `${what} must be a whole number from 0 up, but got ${String(count)}.`,
    );
  }
}

/** Jack's flame for a visitor who cannot see it: "Jack's flame: 70 of 100". */
export function flameLabel(flame: number, flameMax: number): string {
  requireCount(flame, "Jack's flame");
  requireCount(flameMax, "Jack's full flame");
  if (flameMax === 0 || flame > flameMax) {
    throw new RangeError(
      `Jack's flame must lie from 0 to a full flame above 0, but got ${String(flame)} of ${String(flameMax)}.`,
    );
  }
  return `${rhythmCopy.jackName}'s flame: ${String(flame)} of ${String(flameMax)}`;
}

/** The points and combo in one sentence, for a visitor who cannot see them: "4200 points, combo 12". */
export function standingLabel(score: number, combo: number): string {
  requireCount(score, "A score");
  requireCount(combo, "A combo");
  return `${String(score)} points, combo ${String(combo)}`;
}

/**
 * The whole game for a visitor who cannot see it, as the box of the points is named: "4200
 * points, combo 12. Jack's flame: 70 of 100". The flame is rounded to a whole number.
 */
export function rhythmHudLabel(
  score: number,
  combo: number,
  flame: number,
  flameMax: number,
): string {
  return `${standingLabel(score, combo)}. ${flameLabel(Math.round(flame), flameMax)}`;
}

/** Said once Jack's candle has gone out and been lit again: "Jack was lit again (2)." */
export function relitLine(relights: number): string | null {
  requireCount(relights, "The relights");
  if (relights === 0) {
    return null;
  }
  return relights === 1
    ? `${rhythmCopy.jackName}'s candle went out once and was lit again.`
    : `${rhythmCopy.jackName}'s candle went out ${String(relights)} times and was lit again.`;
}

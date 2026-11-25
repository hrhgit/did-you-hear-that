import type { RhythmConfig, RhythmJudgement } from "../config/rhythm-config";
import { rhythmConfig } from "../config/rhythm-config";
import type { ScoredVisitTrial } from "./visit-flow-types";

/**
 * How one turn of the room is judged (the rhythm game, 2026-11-18).
 *
 * - `perfect`, `great`, `good`: the creature was caught, quickly, in good time or late in the
 *   window, and kicked away from Jack.
 * - `miss`: the sound went by unanswered, and its creature reached Jack.
 * - `wrong`: the sound was answered on the other side; the kick met nothing and the creature
 *   reached Jack.
 * - `trick`: a kick at a turn with no creature.
 * - `steady`: a turn with no creature, left alone.
 */
export type { RhythmJudgement };

/** How the night stands. Plain data. */
export interface RhythmStanding {
  readonly score: number;
  /** Turns judged in a row without a miss, a wrong side, a trick or a kick at nothing. */
  readonly combo: number;
  readonly maxCombo: number;
  /** Jack's flame, from 0 to `flameMax`. */
  readonly flame: number;
  readonly flameMax: number;
  /** How many times the flame went out and was lit again. */
  readonly relights: number;
  /** How many turns got each judgement. */
  readonly counts: Readonly<Record<RhythmJudgement, number>>;
}

/** The score of one room run. It changes only when a turn is judged or a kick meets nothing. */
export interface RhythmScore {
  /** Judges a scored trial or easy turn, counts it in, and gives the judgement. */
  judge(entry: JudgedTurn): RhythmJudgement;
  /** A kick between turns: it breaks the combo and costs nothing else. */
  kickAtNothing(): void;
  standing(): RhythmStanding;
}

/** What a judgement reads of a scored turn: a trial, or a practice sound (which has no `kind`). */
export type JudgedTurn =
  | ScoredVisitTrial
  | {
      readonly kind?: "sound";
      readonly outcome: "caught" | "wrongSide" | "missed";
      readonly responseTimeMs: number | null;
      readonly timingOffsetMs?: number;
    };

/** The judgement of a scored trial. A pure function. */
export function judgementOf(
  entry: JudgedTurn,
  settings: Pick<
    RhythmConfig,
    "perfectWithinMs" | "greatWithinMs"
  > = rhythmConfig,
): RhythmJudgement {
  if (entry.kind === "noSound") {
    return entry.outcome === "falseAlarm" ? "trick" : "steady";
  }
  if (entry.outcome === "missed") {
    return "miss";
  }
  if (entry.outcome === "wrongSide") {
    return "wrong";
  }
  // On slow headphones the sound reached the ear late; the offset gives that time back
  // (headphone-traits R1.4).
  const timeMs =
    (entry.responseTimeMs ?? Number.POSITIVE_INFINITY) -
    (entry.timingOffsetMs ?? 0);
  if (timeMs <= settings.perfectWithinMs) {
    return "perfect";
  }
  return timeMs <= settings.greatWithinMs ? "great" : "good";
}

export function createRhythmScore(
  settings: RhythmConfig = rhythmConfig,
): RhythmScore {
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let flame = settings.flameMax;
  let relights = 0;
  const counts: Record<RhythmJudgement, number> = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    wrong: 0,
    trick: 0,
    steady: 0,
  };

  const burn = (amount: number): void => {
    flame -= amount;
    if (flame <= 0) {
      // The night goes on: Jack is lit again, and the visitor keeps listening.
      relights += 1;
      flame = settings.flameRelitAt;
    }
  };

  const bonus = (): number =>
    Math.min(
      settings.comboBonusMaxFraction,
      Math.floor(combo / settings.comboStepCount) *
        settings.comboBonusStepFraction,
    );

  return Object.freeze({
    judge(entry: JudgedTurn): RhythmJudgement {
      const judgement = judgementOf(entry, settings);
      counts[judgement] += 1;
      switch (judgement) {
        case "perfect":
        case "great":
        case "good":
          combo += 1;
          score += Math.round(settings.points[judgement] * (1 + bonus()));
          flame = Math.min(
            settings.flameMax,
            flame + settings.flameGainedByCatch,
          );
          break;
        case "steady":
          combo += 1;
          score += Math.round(settings.points.steady * (1 + bonus()));
          break;
        case "miss":
        case "wrong":
          combo = 0;
          burn(settings.flameLostToCreature);
          break;
        case "trick":
          combo = 0;
          burn(settings.flameLostToTrick);
          break;
      }
      maxCombo = Math.max(maxCombo, combo);
      return judgement;
    },
    kickAtNothing() {
      combo = 0;
    },
    standing(): RhythmStanding {
      return Object.freeze({
        score,
        combo,
        maxCombo,
        flame,
        flameMax: settings.flameMax,
        relights,
        counts: Object.freeze({ ...counts }),
      });
    },
  });
}

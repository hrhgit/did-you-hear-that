import type { HeadphoneTraitsConfig } from "../config/headphone-traits-config";
import { headphoneTraitsConfig } from "../config/headphone-traits-config";

export type EasyTurnPacerSettings = Pick<
  HeadphoneTraitsConfig,
  | "easyTurnWindowCount"
  | "easyTurnMissesMinCount"
  | "easyTurnSpacingCount"
  | "easyTurnShareMax"
>;

/** What the pacer is told of each turn of a room run. */
export type PacedTurn =
  | {
      readonly kind: "counted";
      readonly sound: boolean;
      readonly caught: boolean;
    }
  | { readonly kind: "easy" };

/** Decides when the next turn is an easy one (headphone-traits R2, design.md "Easy turns"). */
export interface EasyTurnPacer {
  note(turn: PacedTurn): void;
  /** Whether the next turn should be an easy one. Has no effect. */
  wantsEasyTurn(): boolean;
}

export function createEasyTurnPacer(
  settings: EasyTurnPacerSettings = headphoneTraitsConfig,
): EasyTurnPacer {
  const soundCaught: boolean[] = [];
  let turns = 0;
  let easyTurns = 0;
  let turnsSinceEasy = Number.POSITIVE_INFINITY;

  return Object.freeze({
    note(turn: PacedTurn) {
      turns += 1;
      if (turn.kind === "easy") {
        easyTurns += 1;
        turnsSinceEasy = 0;
        return;
      }
      turnsSinceEasy += 1;
      if (turn.sound) {
        soundCaught.push(turn.caught);
      }
    },
    wantsEasyTurn() {
      if (turnsSinceEasy < settings.easyTurnSpacingCount) {
        return false;
      }
      if ((easyTurns + 1) / (turns + 1) > settings.easyTurnShareMax) {
        return false;
      }
      const recent = soundCaught.slice(-settings.easyTurnWindowCount);
      const misses = recent.filter((caught) => !caught).length;
      return misses >= settings.easyTurnMissesMinCount;
    },
  });
}

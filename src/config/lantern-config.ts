/**
 * The visitor's lantern: what an answer costs inside a room. Every answer spends one cell of
 * light, a caught sound gives its cell back, and a spent cell comes back by itself after a wait.
 * With no cell left the lantern is dark, no answer is taken and the room makes no sound until
 * one cell is back. So an answer given at nothing costs something, and a visitor who only
 * answers what they hear never runs short. Every field name ends in its unit.
 *
 * Decided with the owner on 2026-11-16 (the game layer).
 */
export interface LanternConfig {
  /** The cells of a full lantern, and the answers a visitor can give at nothing in a row. */
  readonly cellCount: number;
  /**
   * How long one spent cell takes to come back. A room presents a trial about every 4.75 s, so
   * a wait well below that would let a visitor answer blindly at every trial for nothing. Do not
   * set it below 6000 without the owner.
   */
  readonly rechargeMs: number;
}

export const lanternConfig: LanternConfig = Object.freeze({
  cellCount: 3,
  rechargeMs: 8000,
});

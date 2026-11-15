/**
 * The numbers the missed-sound replay adds (missed-sound-replay design.md, "Config"). Every field
 * name ends in its unit. The most refusals in a row of one sound are not here: the replay reads
 * `visitFlowConfig.refusedPlaysInARowMaxCount` (D16).
 */
export interface MissedSoundReplayConfig {
  /** Brief 07: "Each sound is played 20 dB above the level at which it was missed, clamped to the cap." */
  readonly replayRaiseDb: number;
  /**
   * PROPOSED, NOT APPROVED (missed-sound-replay design.md, D7 and Q1). The most sounds one replay
   * plays. With more missed sounds than this, the replay plays an evenly spread selection of this
   * many and says how many there were in all. A whole number of at least 2.
   */
  readonly replaySoundsMaxCount: number;
  /**
   * PROPOSED, NOT APPROVED (D9, Q2). The wait from the end of one replayed sound to the request
   * for the next, on the timer's clock. The sound then starts after the output stage's scheduling
   * lead. Also the wait from the start press, and from the end of a pause, to the next request.
   */
  readonly replayGapMs: number;
}

/** Freezes a value and everything reachable from it, so no field can change at run time. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export const missedSoundReplayConfig: MissedSoundReplayConfig = deepFreeze({
  // Brief 07
  replayRaiseDb: 20,
  // D7, Q1: PROPOSED, NOT APPROVED. Awaits the owner's choice.
  replaySoundsMaxCount: 20,
  // D9, Q2: PROPOSED, NOT APPROVED. Awaits the owner's choice.
  replayGapMs: 400,
});

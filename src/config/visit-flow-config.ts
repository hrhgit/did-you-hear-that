/**
 * The numbers the visit flow adds (visit-flow design.md, "Config"). Everything else the flow needs
 * comes from `hearingMethodConfig`, `audioOutputConfig` and `ghostSoundConfig`. Every field name
 * ends in its unit.
 */
export interface VisitFlowConfig {
  /**
   * Decided by the owner's coordinator on 2026-11-16, at the owner's request (visit-flow
   * design.md, D17 and Q1). A visit whose false alarm rate over the no-sound trials of all its
   * rooms is above this is marked unreliable as a whole. A strict limit: a rate exactly at it is
   * not above it.
   */
  readonly visitFalseAlarmRateUnreliableAboveFraction: number;
  /** After this many refusals in a row of one trial's sound, the visit ends (D25). */
  readonly refusedPlaysInARowMaxCount: number;
  /**
   * The level of each ear's first practice sound, relative to the anchor (audible-start, light
   * plan of 2026-11-16). Never above the room's search cap: the practice plays the lower of the two.
   */
  readonly practiceStartLevelDb: number;
  /** The wait before each practice sound. */
  readonly practiceGapMs: number;
  /**
   * How many sounds an ear hears in one practice round before the round gives up on it: the start,
   * then one upward step louder each time, never above the room's search cap.
   */
  readonly practiceSoundsPerEarMaxCount: number;
  /**
   * How many rooms' searches take turns in one room run at most (one-room design.md, D1). At 1 the
   * rooms run one after another, each with its own practice and a rest before the next, as they did
   * before the one-room spec. From the room count of the longest visit up, every sound of a visit
   * is searched in one room: one practice for all of them, then their trials in no order.
   */
  readonly roomsTogetherMaxCount: number;
  /**
   * After this long with no catch, the room plays a reminder sound before the next trial: louder
   * than its creature was last caught at, and counting for nothing (the game layer, 2026-11-17).
   * Measured from the start of the counting, the last catch or the last reminder.
   */
  readonly reminderAfterQuietMs: number;
  /** How far above the last catch of its creature on its ear a reminder plays. */
  readonly reminderAboveCaughtDb: number;
  /** How far above the caught sound the chime after a catch plays (the game layer, 2026-11-17). */
  readonly chimeAboveCaughtDb: number;
  /** The loudest the chime ever plays, relative to the anchor. */
  readonly chimeMaxLevelDb: number;
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

export const visitFlowConfig: VisitFlowConfig = deepFreeze({
  // D17, Q1: proposed by this spec from the measurement in design.md; decided by the owner's
  // coordinator on 2026-11-16, at the owner's request.
  visitFalseAlarmRateUnreliableAboveFraction: 0.2,
  // D25
  refusedPlaysInARowMaxCount: 3,
  // Light plan of 2026-11-16: the anchor, the comfortable level the visitor set.
  practiceStartLevelDb: 0,
  practiceGapMs: 2000,
  // The anchor, then one step louder (+5 dB, the rise limit), then the not-heard notice.
  practiceSoundsPerEarMaxCount: 2,
  // One room for the whole visit: the five sounds of the full visit (one-room design.md, D1).
  roomsTogetherMaxCount: 5,
  // The game layer of 2026-11-17, decided by the owner after playing: long silences with nothing
  // to answer made the visitor lose patience.
  reminderAfterQuietMs: 12000,
  reminderAboveCaughtDb: 10,
  // The owner chose "follow the caught sound": 10 dB above it, never above 20 dB below the anchor.
  chimeAboveCaughtDb: 10,
  chimeMaxLevelDb: -20,
});

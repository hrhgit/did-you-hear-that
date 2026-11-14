import type { SoundId } from "./sound-id";

/**
 * The values of the output stage, from the Config section and the Decisions of
 * `.kiro/specs/audio-output/design.md`. The ceiling, the shortest fade and the longest sound are
 * not here: they come from the steering and live in `audio-safety-config.ts`. The anchor cap, the
 * floor, the starting level and the upward step live in `hearing-method-config.ts` (D2). Every
 * field name ends in its unit.
 *
 * The bottom of the calibration control, the Keep_Minimum, the rise between repeats, the output
 * fade, the stop fade and the headphone check level are guarded against loosening by the config
 * test (D32). Making one stricter is always allowed. Loosening one needs the project owner's
 * approval first.
 */
export interface AudioOutputConfig {
  /** The raised-cosine fade the output stage multiplies into each end of every buffer. */
  readonly outputFadeMs: number;
  /** The raised-cosine fade to exact zero on every stop. */
  readonly stopFadeMs: number;
  /** Time between scheduling a sound and its start on the audio clock. */
  readonly scheduleLeadMs: number;
  /** Largest peak of a playable buffer, in decibels above the reference RMS, per sound. */
  readonly peakBoundDb: Readonly<Record<SoundId, number>>;
  /** Most renders tried for one playable buffer before the request is refused. */
  readonly renderAttemptsMaxCount: number;
  /** Bottom of the calibration control, where every calibration begins. */
  readonly calibrationSettingMinDb: number;
  /** Step of the calibration control. */
  readonly calibrationSettingStepDb: number;
  /** Largest rise from one calibration repeat to the next. */
  readonly calibrationRiseMaxDb: number;
  /** Lowest calibration setting that can be kept. */
  readonly calibrationSettingKeepMinDb: number;
  /** Silence between the end of one calibration repeat and the start of the next. */
  readonly calibrationRepeatGapMs: number;
  /** Level of the headphone check, relative to the anchor. */
  readonly headphoneCheckLevelDb: number;
  /** Every room must reach at least this level at the top of the calibration control. */
  readonly roomTopMinDb: number;
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

export const audioOutputConfig: AudioOutputConfig = deepFreeze({
  // D13: 25 ms, a margin above the 20 ms shortest fade. Guarded (D32)
  outputFadeMs: 25,
  // D14: the shortest fade the rule allows. Guarded (D32)
  stopFadeMs: 20,
  // D17: long enough for a busy main thread, short enough not to be noticed
  scheduleLeadMs: 50,
  // D6: each bound sits above every measured peak, except stairs, which rejects about 5 percent
  peakBoundDb: {
    cellar: 13.5,
    corridor: 5.5,
    nursery: 10,
    stairs: 17,
    attic: 4.5,
    calibration: 15.5,
  },
  // D6: eight stairs renders in a row above the bound happen about once in 10^10
  renderAttemptsMaxCount: 8,
  // D8: about 86 dB below full scale for the hiss. Guarded (D32)
  calibrationSettingMinDb: -60,
  // D8
  calibrationSettingStepDb: 1,
  // D8: audio-safety rule 4 applied to the calibration noise. Guarded (D32)
  calibrationRiseMaxDb: 5,
  // D10: a lower setting means a very high system volume. Guarded (D32)
  calibrationSettingKeepMinDb: -40,
  // D8: keeps the repeats distinct
  calibrationRepeatGapMs: 400,
  // D20: the level the visitor just matched to their hands. Guarded (D32)
  headphoneCheckLevelDb: 0,
  // D8: every room can reach at least the anchor at the top of the control
  roomTopMinDb: 0,
});

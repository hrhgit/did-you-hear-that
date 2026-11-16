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
 * approval first. The rise period of the calibration music is guarded the same way
 * (`.kiro/specs/audible-start/design.md`, Config).
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
  /**
   * The fewest decibels of settings a calibration sound must leave to keep, from the Keep_Minimum
   * up to the top of the control. A calibration music whose top would leave fewer is not used.
   */
  readonly calibrationSettingSpanMinDb: number;
  /**
   * The calibration music rises by at most `calibrationRiseMaxDb` in this long, the limit of the
   * exception to audio-safety rule 6 for the calibration music.
   */
  readonly calibrationMusicRisePeriodMs: number;
  /** One step of the calibration music's level: an exponential ramp over this long. */
  readonly calibrationMusicGainStepMs: number;
  /** Longest wait for the calibration music to load before the hiss is used instead. */
  readonly calibrationMusicLoadMaxMs: number;
  /**
   * The quietest RMS, as a fraction of full scale, that counts as playable (the Playable_RMS). The
   * house plays and counts on no ghost sound whose RMS would be lower.
   */
  readonly playableRmsMinFraction: number;
  /**
   * The least playable range a kept calibration must leave below the anchor in every room: every
   * room's Search_Floor lies at least this far below 0 dB.
   */
  readonly playableRangeBelowAnchorMinDb: number;
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
  // D8: about 86 dB below full scale for the calibration sound. Guarded (D32)
  calibrationSettingMinDb: -60,
  // D8
  calibrationSettingStepDb: 1,
  // D8: audio-safety rule 4 applied to the calibration noise. Guarded (D32)
  calibrationRiseMaxDb: 5,
  // D10: a lower setting means a very high system volume. Guarded (D32). Raised from -40 by
  // audible-start D25: at -27 every room keeps 30 dB of playable range below the anchor
  calibrationSettingKeepMinDb: -27,
  // D8: keeps the repeats distinct
  calibrationRepeatGapMs: 400,
  // D20: the anchor: the level the visitor just set. Guarded (D32)
  headphoneCheckLevelDb: 0,
  // D8: every room can reach at least the anchor at the top of the control
  roomTopMinDb: 0,
  // audible-start D9: the fewest dB of settings that can be kept, the brief's own figure
  calibrationSettingSpanMinDb: 10,
  // audible-start brief: "5 dB per 2 seconds", the exception to rule 6 approved by the owner on
  // 2026-11-16. Guarded: a shorter period is a faster rise
  calibrationMusicRisePeriodMs: 2000,
  // audible-start D6: steps of 100 ms, each at most 0.25 dB
  calibrationMusicGainStepMs: 100,
  // audible-start D4: after 10 s without the music, the hiss
  calibrationMusicLoadMaxMs: 10000,
  // audible-start brief: "starting value 84 dB below full scale", about 6.31e-5: one bit above one
  // step of a 16-bit output path (D24). Not a safety value; raising it is a method change
  // (audio-output Q1), and the value on real Bluetooth headphones is for the owner (Q39)
  playableRmsMinFraction: 10 ** (-84 / 20),
  // audible-start brief: "at least 30 dB of playable range below the anchor". The Keep_Minimum is
  // set so that every room keeps it
  playableRangeBelowAnchorMinDb: 30,
});

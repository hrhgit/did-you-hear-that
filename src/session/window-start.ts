import type { AudioOutputConfig } from "../config/audio-output-config";
import { audioOutputConfig } from "../config/audio-output-config";
import type { TimestampPair } from "../audio/output/audio-backend";

/** What the window starts read from the config. */
export type WindowStartSettings = Pick<AudioOutputConfig, "scheduleLeadMs">;

/** What `soundWindowStartMs` needs about one scheduled sound. */
export interface SoundWindowStartInput {
  /** The start the output shell gave, on the audio clock. */
  readonly startMs: number;
  /** The output shell's timestamp pair, or null when it has none. */
  readonly pair: TimestampPair | null;
  /** When the sound was asked for, on the page clock. */
  readonly presentedAtMs: number;
}

/** What `noSoundWindowStartMs` needs about one no-sound trial. */
export interface NoSoundWindowStartInput {
  /** When the trial was presented, on the page clock. */
  readonly presentedAtMs: number;
  /**
   * `soundWindowStart − (presentedAt + scheduleLeadMs)` of the last scheduled sound of the visit,
   * or 0 before the first (D4).
   */
  readonly latestOffsetMs: number;
}

/**
 * The window start of a scheduled sound, on the page clock (R7.3, R7.5, D3): its audio clock start
 * converted with the timestamp pair, or the presentation plus the scheduling lead when there is
 * no pair, and never earlier than the presentation. A pure function.
 */
export function soundWindowStartMs(
  input: SoundWindowStartInput,
  settings: WindowStartSettings = audioOutputConfig,
): number {
  const { startMs, pair, presentedAtMs } = input;
  const convertedMs =
    pair === null
      ? presentedAtMs + settings.scheduleLeadMs
      : pair.performanceMs + (startMs - pair.audioClockMs);
  return Math.max(presentedAtMs, convertedMs);
}

/**
 * The window start of a no-sound trial, on the page clock (R7.4, R7.5, D4, D34): where a sound
 * asked for at the same moment would have started, with the offset measured for the last sound,
 * and never earlier than the presentation. A pure function.
 */
export function noSoundWindowStartMs(
  input: NoSoundWindowStartInput,
  settings: WindowStartSettings = audioOutputConfig,
): number {
  const { presentedAtMs, latestOffsetMs } = input;
  return presentedAtMs + Math.max(0, settings.scheduleLeadMs + latestOffsetMs);
}

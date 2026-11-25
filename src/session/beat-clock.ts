import type { TimestampPair } from "../audio/output/audio-backend";

/** One off-beat of the room's beat, on both clocks. */
export interface BeatSlot {
  /** On the page clock (the timer's). */
  readonly pageMs: number;
  /** On the audio clock, for the output stage. */
  readonly audioMs: number;
}

/**
 * The grid of the room's beat (the rhythm game, 2026-11-18). Beat `k` sounds at
 * `firstBeatPageMs + k × beatMs`; the off-beat after it half a beat later. Every sound of the
 * room lands on an off-beat.
 */
export interface BeatClock {
  readonly beatMs: number;
  readonly beatsPerBar: number;
  /** When the first beat sounds, on the page clock. */
  readonly firstBeatPageMs: number;
  /** The first off-beat at or after `pageMs`. */
  slotNotBefore(pageMs: number): BeatSlot;
}

/**
 * The beat clock of a beat the output stage started at `startAudioMs`. `pair` converts the audio
 * clock to the page clock; without one the beat is taken to start `scheduleLeadMs` after
 * `askedAtPageMs`, as a sound does (window-start.ts). A pure function.
 */
export function createBeatClock(input: {
  readonly startAudioMs: number;
  readonly beatMs: number;
  readonly beatsPerBar: number;
  readonly pair: TimestampPair | null;
  readonly askedAtPageMs: number;
  readonly scheduleLeadMs: number;
}): BeatClock {
  const { startAudioMs, beatMs, beatsPerBar, pair } = input;
  if (!(beatMs > 0)) {
    throw new RangeError(
      `A beat must last longer than 0 ms, not ${String(beatMs)}.`,
    );
  }
  const firstBeatPageMs =
    pair === null
      ? input.askedAtPageMs + input.scheduleLeadMs
      : pair.performanceMs + (startAudioMs - pair.audioClockMs);
  const offsetMs = startAudioMs - firstBeatPageMs;
  return Object.freeze({
    beatMs,
    beatsPerBar,
    firstBeatPageMs,
    slotNotBefore(pageMs: number): BeatSlot {
      const firstSlotMs = firstBeatPageMs + beatMs / 2;
      const index = Math.max(0, Math.ceil((pageMs - firstSlotMs) / beatMs));
      const slotPageMs = firstSlotMs + index * beatMs;
      return Object.freeze({
        pageMs: slotPageMs,
        audioMs: slotPageMs + offsetMs,
      });
    },
  });
}

/**
 * How a runner puts its turns on the beat. With it, a runner waits each trial's gap and then the
 * next off-beat, and tells `cued` that a turn is coming at that off-beat: the same for a sound and
 * for a turn with no sound, and without the side. Without it (or while `clock` gives null), a
 * runner waits the gap alone, as before the rhythm game.
 */
export interface BeatTiming {
  /** The beat now, or null while none plays. */
  clock(): BeatClock | null;
  /** The shortest wait from the decision of a turn to the off-beat of the next. */
  readonly cueLeadMs: number;
  /** Called once for every turn put on an off-beat, with that off-beat on the page clock. */
  cued(atMs: number): void;
}

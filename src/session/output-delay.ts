import type { HeadphoneTraitsConfig } from "../config/headphone-traits-config";
import { headphoneTraitsConfig } from "../config/headphone-traits-config";

/** What the delay estimate reads from the config. */
export type OutputDelaySettings = Pick<
  HeadphoneTraitsConfig,
  | "quickFraction"
  | "seenCatchesMinCount"
  | "seenToHeardMs"
  | "quickHeardAnswerMs"
  | "liveHeardMinCount"
  | "offsetSlewMs"
  | "offsetMaxMs"
>;

/**
 * The value at `fraction` of the sorted values, with straight lines between neighbours, or NaN
 * for none. A pure function.
 */
export function quantile(values: readonly number[], fraction: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const position = Math.min(1, Math.max(0, fraction)) * (sorted.length - 1);
  const below = Math.floor(position);
  const above = Math.min(sorted.length - 1, below + 1);
  return (
    sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below)
  );
}

/** How a delay estimate was made. */
export type OutputDelayBasis = "seen" | "assumed";

export interface OutputDelayEstimate {
  /** The Extra_Delay, in ms, 0 and up. */
  readonly delayMs: number;
  /** `seen`: read against the visitor's seen answers. `assumed`: against `quickHeardAnswerMs`. */
  readonly basis: OutputDelayBasis;
}

/**
 * The Extra_Delay from the answer times of heard catches (from the sound's start) and of seen
 * catches (from the presentation), by headphone-traits design.md "The estimate". Null with no
 * heard catch. A pure function.
 */
export function estimateOutputDelay(
  heardMs: readonly number[],
  seenMs: readonly number[],
  settings: OutputDelaySettings = headphoneTraitsConfig,
): OutputDelayEstimate | null {
  const heard = quantile(heardMs, settings.quickFraction);
  if (!Number.isFinite(heard)) {
    return null;
  }
  const seenCount = seenMs.filter(Number.isFinite).length;
  if (seenCount >= settings.seenCatchesMinCount) {
    const seen = quantile(seenMs, settings.quickFraction);
    return Object.freeze({
      delayMs: Math.max(0, heard - seen + settings.seenToHeardMs),
      basis: "seen" as const,
    });
  }
  return Object.freeze({
    delayMs: Math.max(0, heard - settings.quickHeardAnswerMs),
    basis: "assumed" as const,
  });
}

/** The Timing_Offset of a visit as it goes (headphone-traits R1, design.md "During the room"). */
export interface TimingOffsetTracker {
  /** A caught practice sound: its answer time from its presentation. The first is left out. */
  noteSeen(answerFromPresentedMs: number): void;
  /** A Loud_Catch: its answer time from the sound's start, as logged. */
  noteHeard(answerFromStartMs: number): void;
  /** The offset now, in whole ms. */
  offsetMs(): number;
}

/** Creates the tracker of one visit, at an offset of 0. */
export function createTimingOffsetTracker(
  settings: OutputDelaySettings = headphoneTraitsConfig,
): TimingOffsetTracker {
  const heard: number[] = [];
  const seen: number[] = [];
  let seenSkipped = false;
  let offset = 0;

  const update = (): void => {
    if (heard.length < settings.liveHeardMinCount) {
      return;
    }
    const estimate = estimateOutputDelay(heard, seen, settings);
    if (estimate === null) {
      return;
    }
    const target = Math.min(settings.offsetMaxMs, estimate.delayMs);
    const step = Math.max(
      -settings.offsetSlewMs,
      Math.min(settings.offsetSlewMs, target - offset),
    );
    offset = Math.round(
      Math.max(0, Math.min(settings.offsetMaxMs, offset + step)),
    );
  };

  return Object.freeze({
    noteSeen(ms: number) {
      if (Number.isFinite(ms) && ms >= 0) {
        // The first catch of the visit is the visitor learning the keys, as in the result.
        if (!seenSkipped) {
          seenSkipped = true;
          return;
        }
        seen.push(ms);
        update();
      }
    },
    noteHeard(ms: number) {
      if (Number.isFinite(ms) && ms >= 0) {
        heard.push(ms);
        update();
      }
    },
    offsetMs: () => offset,
  });
}

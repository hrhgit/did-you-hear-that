import { audioOutputConfig } from "../../config/audio-output-config";
import type { RandomSource } from "../../config/seeded-random";
import type { SoundId } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import type { RenderFunction } from "../synth/sound-renderers";
import { soundRenderers } from "../synth/sound-renderers";

/** Why no playable buffer could be rendered. */
export type RenderRefusal = "peakBoundNotMet" | "renderFailed";

export type PlayableBufferResult =
  | {
      readonly kind: "ready";
      readonly samples: Float32Array;
      /** How many renders it took, from 1 to `renderAttemptsMaxCount`. */
      readonly attemptCount: number;
    }
  | { readonly kind: "refused"; readonly reason: RenderRefusal };

/**
 * Renders a sound whose peak lies within its Peak_Bound (D6). A render above the bound is
 * replaced by another one from the same `random`, which has moved on, up to
 * `renderAttemptsMaxCount` renders in all. A peak equal to the bound is accepted.
 *
 * A render function that throws (an unsupported sample rate) gives `renderFailed`. The
 * `renderers` parameter exists for tests.
 */
export function renderPlayableBuffer(
  soundId: SoundId,
  sampleRateHz: number,
  random: RandomSource,
  renderers: Readonly<Record<SoundId, RenderFunction>> = soundRenderers,
): PlayableBufferResult {
  const peakBoundFraction =
    soundRulesConfig.referenceRmsFraction *
    decibelsToGain(audioOutputConfig.peakBoundDb[soundId]);
  for (
    let attemptCount = 1;
    attemptCount <= audioOutputConfig.renderAttemptsMaxCount;
    attemptCount += 1
  ) {
    let samples: Float32Array;
    try {
      samples = renderers[soundId](sampleRateHz, random);
    } catch {
      return Object.freeze({ kind: "refused", reason: "renderFailed" });
    }
    let peak = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak <= peakBoundFraction) {
      return Object.freeze({ kind: "ready", samples, attemptCount });
    }
  }
  return Object.freeze({ kind: "refused", reason: "peakBoundNotMet" });
}

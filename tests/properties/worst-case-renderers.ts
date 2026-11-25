import { audioOutputConfig } from "../../src/config/audio-output-config";
import type { RandomSource } from "../../src/config/seeded-random";
import type { SoundId } from "../../src/config/sound-id";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import type { RenderFunction } from "../../src/audio/synth/sound-renderers";

// Stand-ins for the synth's render functions in the properties of the shell (CP7 to CP10, CP13),
// which replace `soundRenderers` with these through `vi.mock` (design.md, D43). This file must not
// import `sound-renderers` itself, except for its type, because it is loaded while that module is
// being mocked.

/** Shortest and longest buffer, in milliseconds. Longer than two Output_Fades, so never refused. */
const shortestMs = 60;
const longestMs = 300;

/**
 * The largest 32-bit value that is not above the sound's Peak_Bound, the loudest peak a playable
 * buffer may have.
 */
export function worstCasePeakFraction(soundId: SoundId): number {
  const bound =
    soundRulesConfig.referenceRmsFraction *
    decibelsToGain(audioOutputConfig.peakBoundDb[soundId]);
  const view = new Float32Array([bound]);
  if (view[0] > bound) {
    new Uint32Array(view.buffer)[0] -= 1;
  }
  return view[0];
}

function worstCaseRenderer(soundId: SoundId): RenderFunction {
  const peak = worstCasePeakFraction(soundId);
  return (sampleRateHz: number, random: RandomSource): Float32Array => {
    if (
      !Number.isFinite(sampleRateHz) ||
      sampleRateHz < soundRulesConfig.sampleRateMinHz
    ) {
      throw new RangeError(
        `Unsupported sample rate ${String(sampleRateHz)} Hz.`,
      );
    }
    const durationMs = shortestMs + random.next() * (longestMs - shortestMs);
    const sign = random.next() < 0.5 ? -1 : 1;
    // A constant at the Peak_Bound: after the Output_Fade its peak is still the bound, the worst
    // case for the ceiling, and its fades measure the Output_Fade's 25 ms.
    return new Float32Array(
      Math.floor((durationMs * sampleRateHz) / 1000),
    ).fill(sign * peak);
  };
}

/**
 * Renderers that give every sound a short constant buffer whose peak is exactly its Peak_Bound.
 * They are much quicker than the real ones, and for the ceiling they are the worst playable
 * buffers there are.
 */
export const worstCaseRenderers: Readonly<Record<SoundId, RenderFunction>> =
  Object.freeze({
    cellar: worstCaseRenderer("cellar"),
    corridor: worstCaseRenderer("corridor"),
    nursery: worstCaseRenderer("nursery"),
    stairs: worstCaseRenderer("stairs"),
    attic: worstCaseRenderer("attic"),
    calibration: worstCaseRenderer("calibration"),
    chime: worstCaseRenderer("chime"),
    snuff: worstCaseRenderer("snuff"),
  });

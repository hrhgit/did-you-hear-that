import { soundRulesConfig } from "../../config/sound-rules-config";
import { raisedCosineRamp } from "./raised-cosine-ramp";

/**
 * The last step of every sound:
 *
 * 1. Multiplies sample n by `raisedCosineRamp(n / F) × raisedCosineRamp((N − 1 − n) / F)`, where F
 *    is `outerFadeMs × sampleRate / 1000`, not rounded, and N the sample count. The first and last
 *    samples become exactly zero.
 * 2. Computes the RMS over all N samples, and throws an `Error` if it is zero, because a silent
 *    sound is a bug.
 * 3. Scales every sample to the reference RMS (D7).
 * 4. Copies the result into a new `Float32Array` (D14).
 *
 * The input is not modified.
 */
export function finishSound(
  samples: Float64Array,
  sampleRateHz: number,
  outerFadeMs: number,
): Float32Array {
  const sampleCount = samples.length;
  const fadeSamples = (outerFadeMs * sampleRateHz) / 1000;
  const faded = new Float64Array(sampleCount);
  let sumOfSquares = 0;
  for (let n = 0; n < sampleCount; n += 1) {
    const fadeGain =
      raisedCosineRamp(n / fadeSamples) *
      raisedCosineRamp((sampleCount - 1 - n) / fadeSamples);
    faded[n] = samples[n] * fadeGain;
    sumOfSquares += faded[n] * faded[n];
  }
  const rms = sampleCount > 0 ? Math.sqrt(sumOfSquares / sampleCount) : 0;
  if (!(rms > 0)) {
    throw new Error(
      `A sound rendered to silence or to values that are not numbers (RMS ${String(rms)}). This is a bug in its render function.`,
    );
  }
  const scaleGain = soundRulesConfig.referenceRmsFraction / rms;
  const finished = new Float32Array(sampleCount);
  for (let n = 0; n < sampleCount; n += 1) {
    // Adding 0 turns a negative zero at the ends into an exact positive zero.
    finished[n] = faded[n] * scaleGain + 0;
  }
  return finished;
}

import { audioOutputConfig } from "../../config/audio-output-config";
import { raisedCosineRamp } from "../synth/raised-cosine-ramp";

/**
 * Multiplies a buffer by the Output_Fade (D13) and returns the result as a new 64-bit buffer. The
 * input is not modified.
 *
 * Sample n of N is multiplied by `raisedCosineRamp(n / F) × raisedCosineRamp((N − 1 − n) / F)`,
 * with `F = outputFadeMs × sampleRateHz / 1000` samples, not rounded. Where that weight is zero,
 * as at the first and last samples, the result is exactly `+0` whatever the input sample. Every
 * other `-0` also becomes `+0`.
 */
export function applyOutputFade(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
): Float64Array {
  const length = samples.length;
  const fadeSampleCount =
    (audioOutputConfig.outputFadeMs * sampleRateHz) / 1000;
  const faded = new Float64Array(length);
  for (let n = 0; n < length; n += 1) {
    const weight =
      raisedCosineRamp(n / fadeSampleCount) *
      raisedCosineRamp((length - 1 - n) / fadeSampleCount);
    // Adding +0 turns -0 into +0 and leaves every other value as it is.
    faded[n] = weight === 0 ? 0 : samples[n] * weight + 0;
  }
  return faded;
}

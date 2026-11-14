import { soundRulesConfig } from "../../config/sound-rules-config";

/**
 * Throws a `RangeError` when the sample rate is not a finite number or is below
 * `sampleRateMinHz` (D12). Every render function calls it first, before drawing any random number.
 */
export function validateSampleRate(sampleRateHz: number): void {
  const lowestHz = soundRulesConfig.sampleRateMinHz;
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < lowestHz) {
    throw new RangeError(
      `The sample rate must be a finite number of at least ${lowestHz} Hz, the lowest supported rate, but got ${String(sampleRateHz)}.`,
    );
  }
}

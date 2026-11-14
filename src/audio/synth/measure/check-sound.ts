import { audioSafetyConfig } from "../../../config/audio-safety-config";
import { soundRulesConfig } from "../../../config/sound-rules-config";
import type {
  BrokenRule,
  RuleName,
  SoundMeasurement,
} from "./measurement-types";

/** A number with a fixed count of decimals, or a word for the values that have none. */
function formatValue(value: number, decimals: number): string {
  if (Number.isNaN(value)) {
    return "not a number";
  }
  if (value === Number.POSITIVE_INFINITY) {
    return "+infinity";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "-infinity";
  }
  return value.toFixed(decimals);
}

function broken(
  rule: RuleName,
  measured: number,
  limit: number,
  description: string,
): BrokenRule {
  return Object.freeze({ rule, measured, limit, description });
}

/**
 * A sample at one end of the buffer that is not exactly zero breaks that end's fade rule, with
 * the sample as the measured value (R7.1). Otherwise a fade shorter than the shortest fade does.
 */
function fadeRule(
  rule: "fadeIn" | "fadeOut",
  endSample: number,
  fadeMs: number,
): BrokenRule | null {
  const end = rule === "fadeIn" ? "first" : "last";
  const name = rule === "fadeIn" ? "fade in" : "fade out";
  if (!(endSample === 0)) {
    return broken(
      rule,
      endSample,
      0,
      `${end} sample ${formatValue(endSample, 6)}, limit exactly 0`,
    );
  }
  const limit = audioSafetyConfig.fadeMinMs;
  if (!(fadeMs >= limit)) {
    return broken(
      rule,
      fadeMs,
      limit,
      `${name} ${formatValue(fadeMs, 1)} ms, limit at least ${limit} ms`,
    );
  }
  return null;
}

/**
 * Returns the sound rules a measurement breaks, in the order band, fadeIn, fadeOut, duration,
 * level, peak, calibrationShape, each with its measured value and its limit (R11.2). The list is
 * empty when every rule is met.
 *
 * Every comparison is written so that a NaN measurement breaks its rule (D33).
 */
export function checkSound(measurement: SoundMeasurement): BrokenRule[] {
  const rules: (BrokenRule | null)[] = [];

  if (measurement.outOfBandRatioDb !== null) {
    const limit = -soundRulesConfig.outOfBandBelowInBandMinDb;
    const ratio = measurement.outOfBandRatioDb;
    if (!(ratio <= limit)) {
      rules.push(
        broken(
          "band",
          ratio,
          limit,
          ratio === Number.POSITIVE_INFINITY
            ? `no in-band energy, limit out-of-band energy ${limit} dB`
            : `out-of-band energy ${formatValue(ratio, 1)} dB, limit ${limit} dB`,
        ),
      );
    }
  }

  rules.push(
    fadeRule("fadeIn", measurement.firstSample, measurement.fadeInMs),
    fadeRule("fadeOut", measurement.lastSample, measurement.fadeOutMs),
  );

  const durationLimit = audioSafetyConfig.ghostSoundMaxDurationMs;
  if (!(measurement.durationMs <= durationLimit)) {
    rules.push(
      broken(
        "duration",
        measurement.durationMs,
        durationLimit,
        `duration ${formatValue(measurement.durationMs, 1)} ms, limit at most ${durationLimit} ms`,
      ),
    );
  }

  const levelLimit = soundRulesConfig.levelToleranceDb;
  const deviation = measurement.levelDeviationDb;
  if (!(measurement.rmsFraction > 0) || !(Math.abs(deviation) <= levelLimit)) {
    rules.push(
      broken(
        "level",
        deviation,
        levelLimit,
        measurement.rmsFraction === 0
          ? `the buffer is silent, limit RMS within ${levelLimit} dB of ${soundRulesConfig.referenceRmsFraction} of full scale`
          : `RMS ${formatValue(deviation, 3)} dB from the reference, limit within ${levelLimit} dB`,
      ),
    );
  }

  if (!(measurement.peakFraction < 1)) {
    rules.push(
      broken(
        "peak",
        measurement.peakFraction,
        1,
        `peak ${formatValue(measurement.peakFraction, 3)} of full scale, limit below 1`,
      ),
    );
  }

  if (measurement.calibrationShapeDistanceMaxDb !== null) {
    const limit = soundRulesConfig.calibrationShapeToleranceDb;
    const distance = measurement.calibrationShapeDistanceMaxDb;
    if (!(distance <= limit)) {
      rules.push(
        broken(
          "calibrationShape",
          distance,
          limit,
          `calibration shape off by ${formatValue(distance, 1)} dB in a room band, limit ${limit} dB`,
        ),
      );
    }
  }

  return rules.filter((rule): rule is BrokenRule => rule !== null);
}

import { audioSafetyConfig } from "../../config/audio-safety-config";
import { ghostSoundIds } from "../../config/sound-id";
import { hearingMethodConfig } from "../../config/hearing-method-config";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { measureFadeLengths } from "../synth/measure/fade-lengths";
import { applyOutputFade } from "./apply-output-fade";
import { gainToDecibels } from "./gain-to-decibels";
import type {
  ClampLimit,
  Ear,
  PlaybackRequest,
  PreparationRefusal,
  PreparedPlayback,
} from "./output-types";

/**
 * Rounding tolerances. They absorb floating-point error only and set no level, so they live here
 * next to the arithmetic they protect, as the engine's `fraction-comparisons.ts` does (design.md,
 * D33).
 */
/** A rise this far above one upward step is still one step (D15). */
const riseToleranceDb = 1e-9;
/** Factor by which the ceiling gain is lowered when rounding still puts a sample beyond it (D5). */
const ceilingRoundingFactor = 1 - 2 ** -40;
/** Most such reductions (D5). */
const ceilingRoundingAttemptsMaxCount = 4;

function refuse(reason: PreparationRefusal): PreparedPlayback {
  return Object.freeze({ kind: "refused", reason });
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function peakOf(samples: Float32Array | Float64Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function fadesAreLongEnough(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
): boolean {
  const { fadeInMs, fadeOutMs } = measureFadeLengths(samples, sampleRateHz);
  return (
    fadeInMs >= audioSafetyConfig.fadeMinMs &&
    fadeOutMs >= audioSafetyConfig.fadeMinMs
  );
}

/** The output, rounded once to 32 bits, with every `-0` as `+0`. */
function toPlayedChannel(output: Float64Array): Float32Array {
  const channel = Float32Array.from(output);
  for (let n = 0; n < channel.length; n += 1) {
    if (channel[n] === 0) {
      channel[n] = 0;
    }
  }
  return channel;
}

/**
 * Turns a request into the two channel buffers that will be played, or a refusal with a reason
 * (design.md, "The pure core"). It applies the Output_Fade, the anchor cap, the rise limit and
 * the ceiling, and routes the sound to one channel with exact zeros on the other.
 *
 * Never throws and never modifies `request.samples`. Returns the first refusal it meets, in the
 * order of the steps below.
 */
export function preparePlayback(request: PlaybackRequest): PreparedPlayback {
  const {
    samples,
    sampleRateHz,
    soundId,
    earChoice,
    requestedLevelDb,
    calibrationGain,
    previousAppliedGain,
  } = request;
  const { ceilingFraction, ghostSoundMaxDurationMs } = audioSafetyConfig;
  const { capRelativeToAnchorDb, upwardStepDb } = hearingMethodConfig;

  // 1. Sample rate (R10.5).
  if (
    !Number.isFinite(sampleRateHz) ||
    sampleRateHz < soundRulesConfig.sampleRateMinHz
  ) {
    return refuse("unsupportedSampleRate");
  }

  // 2. Buffer (R10.3, R10.4).
  if (samples.length === 0) {
    return refuse("emptyBuffer");
  }
  if (
    samples.length > Math.floor((ghostSoundMaxDurationMs * sampleRateHz) / 1000)
  ) {
    return refuse("tooLong");
  }
  if (!samples.every((sample) => Number.isFinite(sample))) {
    return refuse("notFinite");
  }

  // 3. Numbers (R7.6).
  if (!Number.isFinite(requestedLevelDb)) {
    return refuse("invalidLevel");
  }
  if (!isPositiveFinite(calibrationGain)) {
    return refuse("invalidCalibrationGain");
  }
  if (previousAppliedGain !== null) {
    for (const previous of [
      previousAppliedGain.left,
      previousAppliedGain.right,
    ]) {
      if (previous !== null && !isPositiveFinite(previous)) {
        return refuse("invalidCalibrationGain");
      }
    }
  }

  // 4. Routing (R6.3, D21).
  const isGhostSound = (ghostSoundIds as readonly string[]).includes(soundId);
  if (earChoice === "both" && isGhostSound) {
    return refuse("bothEarsForGhostSound");
  }

  // 5. Fade (R10.1, R10.2, D13).
  const faded = applyOutputFade(samples, sampleRateHz);
  const fadedPeak = peakOf(faded);
  if (fadedPeak === 0) {
    return refuse("silentBuffer");
  }
  if (!fadesAreLongEnough(faded, sampleRateHz)) {
    return refuse("fadeTooShort");
  }

  // 6. Anchor cap (R7.3).
  let clampLimit: ClampLimit | null = null;
  const cappedLevelDb = Math.min(requestedLevelDb, capRelativeToAnchorDb);
  if (cappedLevelDb < requestedLevelDb) {
    clampLimit = "anchorCap";
  }
  let gain = calibrationGain * decibelsToGain(cappedLevelDb);

  // 7. Rise limit, per ear played on; for both ears the lower limit holds (R11.2, R11.3, D15).
  const earsPlayed: readonly Ear[] =
    earChoice === "both" ? ["left", "right"] : [earChoice];
  if (previousAppliedGain !== null) {
    for (const ear of earsPlayed) {
      const previous = previousAppliedGain[ear];
      if (
        previous !== null &&
        gainToDecibels(gain) - gainToDecibels(previous) >
          upwardStepDb + riseToleranceDb
      ) {
        gain = Math.min(gain, previous * decibelsToGain(upwardStepDb));
        clampLimit = "rise";
      }
    }
  }

  // 8. Ceiling: the whole sound is turned down, never clipped (R7.4, R7.5, D5).
  if (fadedPeak * gain > ceilingFraction) {
    gain = ceilingFraction / fadedPeak;
    clampLimit = "ceiling";
  }
  const scale = (appliedGain: number): Float64Array =>
    faded.map((sample) => sample * appliedGain);
  let output = scale(gain);
  for (
    let attempt = 0;
    attempt < ceilingRoundingAttemptsMaxCount &&
    peakOf(output) > ceilingFraction;
    attempt += 1
  ) {
    gain *= ceilingRoundingFactor;
    output = scale(gain);
  }

  // 9. Level (R8.1, R8.2). With no limit the gain above is exactly
  // `calibrationGain × decibelsToGain(requestedLevelDb)`. With a limit, the level is the one the
  // gain gives, kept at or below the capped level against rounding (D34).
  const playedLevelDb =
    clampLimit === null
      ? requestedLevelDb
      : Math.min(gainToDecibels(gain / calibrationGain), cappedLevelDb);

  // 10. Channels (R6.1, R6.2, R6.4).
  const played = toPlayedChannel(output);
  const silent = new Float32Array(played.length);
  const left = earChoice === "right" ? silent : played;
  const right =
    earChoice === "left"
      ? silent
      : earChoice === "both"
        ? Float32Array.from(played)
        : played;

  // 11. Last check: the ceiling on every sample of both channels (R7.7), and the fades again on
  // the rounded channel, which 32-bit rounding can shorten at levels near the smallest 32-bit
  // values (D35).
  const peakFraction = Math.max(peakOf(left), peakOf(right));
  if (!(peakFraction <= ceilingFraction)) {
    return refuse("beyondCeiling");
  }
  if (peakFraction > 0 && !fadesAreLongEnough(played, sampleRateHz)) {
    return refuse("fadeTooShort");
  }

  return Object.freeze({
    kind: "ready",
    left,
    right,
    requestedLevelDb,
    playedLevelDb,
    appliedGain: gain,
    clampLimit,
    peakFraction,
  });
}

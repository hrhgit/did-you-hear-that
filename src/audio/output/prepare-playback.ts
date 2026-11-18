import { audioSafetyConfig } from "../../config/audio-safety-config";
import { ghostSoundIds } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import { applyOutputFade } from "./apply-output-fade";
import { gainToDecibels } from "./gain-to-decibels";
import type {
  ClampLimit,
  PlaybackRequest,
  PreparationRefusal,
  PreparedPlayback,
} from "./output-types";

/**
 * Rounding tolerances. They absorb floating-point error only and set no level, so they live here
 * next to the arithmetic they protect, as the engine's `fraction-comparisons.ts` does (design.md,
 * D33).
 */
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
 * (design.md, "The pure core"). It applies the Output_Fade and the ceiling, and routes the sound to
 * one channel with exact zeros on the other. The ceiling is the top of the level scale, not a
 * safety rule. The length limit, the fade-length check, the anchor cap and the rise limit were
 * dropped by the project owner on 2026-11-17: a sound of any length, and any requested level up
 * to the ceiling, is played as asked.
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
  } = request;
  const { ceilingFraction } = audioSafetyConfig;

  // 1. Sample rate (R10.5).
  if (
    !Number.isFinite(sampleRateHz) ||
    sampleRateHz < soundRulesConfig.sampleRateMinHz
  ) {
    return refuse("unsupportedSampleRate");
  }

  // 2. Buffer (R10.4).
  if (samples.length === 0) {
    return refuse("emptyBuffer");
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

  // 4. Routing (R6.3, D21).
  const isGhostSound = (ghostSoundIds as readonly string[]).includes(soundId);
  if (earChoice === "both" && isGhostSound) {
    return refuse("bothEarsForGhostSound");
  }

  // 5. Fade (R10.1, D13).
  const faded = applyOutputFade(samples, sampleRateHz);
  const fadedPeak = peakOf(faded);
  if (fadedPeak === 0) {
    return refuse("silentBuffer");
  }
  let clampLimit: ClampLimit | null = null;
  let gain = calibrationGain * decibelsToGain(requestedLevelDb);

  // 6. Ceiling: the whole sound is turned down, never clipped (R7.4, R7.5, D5).
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

  // 7. Level (R8.1, R8.2). With no limit the gain above is exactly
  // `calibrationGain × decibelsToGain(requestedLevelDb)`. With the ceiling, the level is the one
  // the gain gives, kept at or below the requested level against rounding (D34).
  const playedLevelDb =
    clampLimit === null
      ? requestedLevelDb
      : Math.min(gainToDecibels(gain / calibrationGain), requestedLevelDb);

  // 8. Channels (R6.1, R6.2, R6.4).
  const played = toPlayedChannel(output);
  const silent = new Float32Array(played.length);
  const left = earChoice === "right" ? silent : played;
  const right =
    earChoice === "left"
      ? silent
      : earChoice === "both"
        ? Float32Array.from(played)
        : played;

  // 9. Last check: the ceiling on every sample of both channels (R7.7).
  const peakFraction = Math.max(peakOf(left), peakOf(right));
  if (!(peakFraction <= ceilingFraction)) {
    return refuse("beyondCeiling");
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

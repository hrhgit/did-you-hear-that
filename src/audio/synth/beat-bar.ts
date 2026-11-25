import { soundRulesConfig } from "../../config/sound-rules-config";
import { raisedCosineRamp } from "./raised-cosine-ramp";
import { validateSampleRate } from "./validate-sample-rate";

/** How one beat of the bar sounds. */
const kick = Object.freeze({
  /** The thump starts at this pitch and falls towards `endHz`. */
  startHz: 120,
  endHz: 48,
  /** How fast the pitch falls. */
  sweepTimeConstantMs: 28,
  attackMs: 3,
  /** How fast the thump dies away. Gone well before the off-beat, 300 ms later at 100 BPM. */
  decayTimeConstantMs: 55,
  /** Every beat stops here at the latest, with a short fade. */
  lengthMs: 240,
  /** The first beat of a bar, a little stronger than the rest. */
  accentGain: 1,
  otherGain: 0.62,
  /** A soft low knock under the thump, so that the beat can be heard on small earphones too. */
  knockHz: 180,
  knockGain: 0.35,
  knockDecayTimeConstantMs: 22,
});

/**
 * The tune over the beat (2026-11-19): one short plucked note on every beat, a falling phrase in A minor
 * (A4, G4, E4, F4) that the loop plays over and over. Each note has a few overtones, so that the
 * tune is heard on a laptop or small earphones, which give out hardly anything under 150 Hz and
 * left the thump alone inaudible. Every fundamental lies below 500 Hz, the lowest pitch of any
 * room, and every note has died away before the off-beat.
 */
const tune = Object.freeze({
  noteHz: Object.freeze([440, 392, 329.63, 349.23]),
  /** The loudness of the 2nd and 3rd overtones against the fundamental. */
  overtoneGains: Object.freeze([0.5, 0.25]),
  /** The pluck against the thump under it. */
  gain: 1.4,
  attackMs: 4,
  decayTimeConstantMs: 100,
});

/**
 * One bar of the room's beat, to be looped without a break (the rhythm game, 2026-11-18): a soft
 * thump and a plucked note of a small tune (`tune`, 2026-11-19) on every beat, a little stronger
 * on the first, and nothing at all on the off-beats, where the creatures' sounds come. The pitch
 * of every note lies below the lowest pitch of any room (500 Hz), and everything of a beat has
 * died away before the next off-beat.
 *
 * Scaled so that the bar's RMS is the reference RMS of every ghost sound: at 0 dB it is as loud,
 * in that sense, as a ghost sound at the anchor. The first and last samples are exactly zero, so
 * the loop joins without a click. A pure function of its arguments.
 */
export function renderBeatBar(
  sampleRateHz: number,
  beatMs: number,
  beatsPerBar: number,
): Float32Array {
  validateSampleRate(sampleRateHz);
  if (
    !(beatMs > kick.lengthMs) ||
    !Number.isInteger(beatsPerBar) ||
    beatsPerBar < 1
  ) {
    throw new RangeError(
      `A bar needs whole beats longer than ${String(kick.lengthMs)} ms, but got ${String(beatsPerBar)} beats of ${String(beatMs)} ms.`,
    );
  }
  const beatSampleCount = Math.round((beatMs * sampleRateHz) / 1000);
  const sampleCount = beatSampleCount * beatsPerBar;
  const samples = new Float64Array(sampleCount);
  const kickSampleCount = Math.floor((kick.lengthMs * sampleRateHz) / 1000);
  const tailFadeMs = 30;
  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    const gain = beat === 0 ? kick.accentGain : kick.otherGain;
    const offset = beat * beatSampleCount;
    let phase = 0;
    for (let n = 0; n < kickSampleCount; n += 1) {
      const timeMs = (n / sampleRateHz) * 1000;
      const frequencyHz =
        kick.endHz +
        (kick.startHz - kick.endHz) *
          Math.exp(-timeMs / kick.sweepTimeConstantMs);
      phase += (2 * Math.PI * frequencyHz) / sampleRateHz;
      const envelope =
        raisedCosineRamp(timeMs / kick.attackMs) *
        Math.exp(-timeMs / kick.decayTimeConstantMs) *
        raisedCosineRamp((kick.lengthMs - timeMs) / tailFadeMs);
      const knock =
        kick.knockGain *
        Math.exp(-timeMs / kick.knockDecayTimeConstantMs) *
        Math.sin((2 * Math.PI * kick.knockHz * n) / sampleRateHz);
      const noteHz =
        tune.noteHz[beat % tune.noteHz.length] ?? tune.noteHz[0] ?? 220;
      const noteEnvelope =
        raisedCosineRamp(timeMs / tune.attackMs) *
        Math.exp(-timeMs / tune.decayTimeConstantMs) *
        raisedCosineRamp((kick.lengthMs - timeMs) / tailFadeMs);
      let pluck = Math.sin((2 * Math.PI * noteHz * n) / sampleRateHz);
      tune.overtoneGains.forEach((overtoneGain, index) => {
        pluck +=
          overtoneGain *
          Math.sin((2 * Math.PI * noteHz * (index + 2) * n) / sampleRateHz);
      });
      samples[offset + n] =
        gain *
        (envelope * (Math.sin(phase) + knock) +
          tune.gain * noteEnvelope * pluck);
    }
  }
  let sumOfSquares = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
  }
  const rms = Math.sqrt(sumOfSquares / sampleCount);
  const scaleGain = soundRulesConfig.referenceRmsFraction / rms;
  const bar = new Float32Array(sampleCount);
  for (let n = 0; n < sampleCount; n += 1) {
    bar[n] = samples[n] * scaleGain + 0;
  }
  return bar;
}

import { raisedCosineRamp } from "../synth/raised-cosine-ramp";
import { channelIndex } from "./channel-index";

/**
 * Points of the stop fade's curve (design.md, "The graph"). Web Audio interpolates linearly
 * between them, so the fall stays between 1 and 0 and ends exactly at 0. It shapes the fade and
 * sets neither its length nor any level (D33, D46).
 */
const stopCurvePointCount = 64;

/** The stop fade: a raised-cosine fall from exactly 1 to exactly 0. */
const stopCurve: Float32Array<ArrayBuffer> = (() => {
  const curve = new Float32Array(stopCurvePointCount);
  for (let point = 0; point < stopCurvePointCount; point += 1) {
    curve[point] = 1 - raisedCosineRamp(point / (stopCurvePointCount - 1));
  }
  return curve;
})();

/** The output graph of one context (design.md, "The Web Audio backend"). */
export interface OutputGraph {
  /**
   * Plays the two channels as they are, as the two channels of one stereo buffer at the
   * context's rate, from `startS` on the context's clock. Throws a `RangeError`, and plays
   * nothing, if the channels differ in length or are empty, if their rate is not the context's,
   * or if `startS` falls before the end of a stop fade.
   */
  play(
    left: Float32Array,
    right: Float32Array,
    sampleRateHz: number,
    startS: number,
  ): void;
  /**
   * Fades every channel to exact zero over `durationS` with a raised cosine, from now, and stops
   * every source at the end of the fade (R10.6, D14). A fade already under way, or finished, is
   * left as it is, because no source can have started since.
   */
  fadeToSilence(durationS: number): void;
  /** How many sources are scheduled or playing. 0 between sounds (R6.6). */
  liveSourceCount(): number;
}

/** A stop gain and the sources connected to it. */
interface Stage {
  readonly gain: GainNode;
  readonly sources: Set<AudioBufferSourceNode>;
  /** The end of this stage's stop fade on the context's clock, or null before any stop. */
  fadeEndS: number | null;
}

/**
 * Builds the output graph on any `BaseAudioContext`, so that the Browser_Suite can build the same
 * graph in an `OfflineAudioContext` (design.md, "The graph").
 *
 * Every source goes to one stop gain, and the stop gain to the destination. Nothing else is
 * connected, and between sounds there is no source at all (R3.4, R6.6). The graph never scales,
 * pans, mixes or resamples a sound: the stop gain is 1 until a stop, and its fade can only lower
 * a sample (R6.5).
 *
 * The stop fade is the only automation a stop gain ever carries. After a stop, the first sound
 * goes to a new stop gain at 1, and the old one is disconnected once its sources have ended
 * (D46). Bringing the old gain back to 1 would need its automation cancelled, which in Web Audio
 * can put back the value from before the fade at once, while a source may still be playing.
 */
export function createOutputGraph(context: BaseAudioContext): OutputGraph {
  const destination = context.destination;
  // A destination with fewer than two channels cannot be set to two. The shell refuses it as
  // `monoOutput` and closes the context before anything is scheduled (R5.3).
  if (destination.channelCount !== 2 && destination.maxChannelCount >= 2) {
    destination.channelCount = 2;
  }
  destination.channelInterpretation = "discrete";

  const createStage = (): Stage => {
    const gain = context.createGain();
    gain.channelCount = 2;
    gain.channelCountMode = "explicit";
    gain.channelInterpretation = "discrete";
    gain.connect(destination);
    return { gain, sources: new Set(), fadeEndS: null };
  };

  let stage = createStage();
  /** Faded stop gains that still have a source that has not ended. */
  const retiredStages = new Set<Stage>();

  const retire = (faded: Stage): void => {
    if (faded.sources.size === 0) {
      faded.gain.disconnect();
    } else {
      retiredStages.add(faded);
    }
  };

  const graph: OutputGraph = {
    play(left, right, sampleRateHz, startS) {
      if (left.length === 0 || left.length !== right.length) {
        throw new RangeError(
          `The two channels must have the same length of at least one sample, but have ${left.length} and ${right.length}.`,
        );
      }
      if (sampleRateHz !== context.sampleRate) {
        throw new RangeError(
          `The channels are at ${sampleRateHz} Hz, but the context runs at ${context.sampleRate} Hz.`,
        );
      }
      if (stage.fadeEndS !== null) {
        if (!(startS >= stage.fadeEndS)) {
          throw new RangeError(
            `A sound cannot start at ${startS} s, before the stop fade ends at ${stage.fadeEndS} s.`,
          );
        }
        retire(stage);
        stage = createStage();
      }

      const buffer = context.createBuffer(2, left.length, context.sampleRate);
      buffer.copyToChannel(new Float32Array(left), channelIndex.left);
      buffer.copyToChannel(new Float32Array(right), channelIndex.right);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(stage.gain);
      const owner = stage;
      owner.sources.add(source);
      source.onended = () => {
        source.disconnect();
        owner.sources.delete(source);
        if (retiredStages.has(owner) && owner.sources.size === 0) {
          owner.gain.disconnect();
          retiredStages.delete(owner);
        }
      };
      source.start(startS);
    },

    fadeToSilence(durationS) {
      if (!(Number.isFinite(durationS) && durationS > 0)) {
        throw new RangeError(
          `A stop fade must last a finite time above 0 s, but got ${String(durationS)}.`,
        );
      }
      if (stage.fadeEndS !== null) {
        return;
      }
      const nowS = context.currentTime;
      const fadeEndS = nowS + durationS;
      stage.gain.gain.setValueCurveAtTime(stopCurve, nowS, durationS);
      stage.fadeEndS = fadeEndS;
      for (const source of stage.sources) {
        source.stop(fadeEndS);
      }
    },

    liveSourceCount() {
      let count = stage.sources.size;
      for (const retired of retiredStages) {
        count += retired.sources.size;
      }
      return count;
    },
  };
  return Object.freeze(graph);
}

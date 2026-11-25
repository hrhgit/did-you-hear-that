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

/** Points of the calibration music's fade in: the raised-cosine rise of the output fade. */
const fadeInCurve: Float32Array<ArrayBuffer> = (() => {
  const curve = new Float32Array(stopCurvePointCount);
  for (let point = 0; point < stopCurvePointCount; point += 1) {
    curve[point] = raisedCosineRamp(point / (stopCurvePointCount - 1));
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
  /**
   * Starts the calibration music's loop (audible-start design.md, "Playing"): one stereo buffer of
   * the two channels, starting at `startS`, through its level gain at `levelGain`, a fade-in gain
   * that rises from exact zero to 1 over `fadeInS`, and a fade-out gain at 1 until `stopLoop`,
   * into the stop gain. Throws a `RangeError`, and plays nothing, as `play` does, and also if a
   * music source is already playing or `levelGain` is not a finite number above 0.
   * Music loops unless `repeat` is false.
   */
  startLoop(
    left: Float32Array,
    right: Float32Array,
    sampleRateHz: number,
    startS: number,
    levelGain: number,
    fadeInS: number,
    repeat?: boolean,
  ): void;
  /**
   * Ramps the loop's level gain exponentially from its value at `startS` to `levelGain` at `endS`.
   * Does nothing without a loop.
   */
  rampLoopLevel(levelGain: number, startS: number, endS: number): void;
  /**
   * Fades the loop to exact zero over `durationS`, from now, with the raised cosine of the stop
   * fade, and stops its source at the end. Does nothing without a loop.
   */
  stopLoop(durationS: number): void;
  /**
   * Starts the room's beat (the rhythm game, 2026-11-18): one stereo buffer looping from `startS`
   * at `levelGain`, on a path of its own straight to the destination. `fadeToSilence` does not
   * touch it, so cutting a caught sound short leaves the beat going; `stopBeat` ends it. A beat
   * already playing is stopped at once first.
   */
  startBeat(
    left: Float32Array,
    right: Float32Array,
    sampleRateHz: number,
    startS: number,
    levelGain: number,
  ): void;
  /**
   * Lets the beat sink to `duckGain` times its level from just before `fromS` until `toS`, and rise
   * again after (the sound of a creature has the room to itself). Does nothing without a beat.
   */
  duckBeat(fromS: number, toS: number, duckGain: number): void;
  /** Fades the beat to exact zero over `durationS` and stops it. Does nothing without a beat. */
  stopBeat(durationS: number): void;
  /** How many sources are scheduled or playing. 0 between sounds (R6.6). */
  liveSourceCount(): number;
}

/** The calibration music's loop and its gains. */
interface Loop {
  readonly source: AudioBufferSourceNode;
  readonly levelGain: GainNode;
  readonly fadeInGain: GainNode;
  readonly fadeOutGain: GainNode;
  /** The level gain's value at the end of its last automation event. */
  lastLevelGain: number;
  /** Whether `stopLoop` has begun its fade. */
  stopping: boolean;
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
 * pans, mixes or resamples a sound given to `play`: the stop gain is 1 until a stop, and its fade
 * can only lower a sample (R6.5).
 *
 * The stop fade is the only automation a stop gain ever carries. After a stop, the first sound
 * goes to a new stop gain at 1, and the old one is disconnected once its sources have ended
 * (D46). Bringing the old gain back to 1 would need its automation cancelled, which in Web Audio
 * can put back the value from before the fade at once, while a source may still be playing.
 *
 * The calibration music's loop is the one source with gains of its own, before the stop gain
 * (audible-start design.md, "Playing"): its level gain, ramped exponentially between values the
 * shell keeps within the ceiling, its fade-in gain from exact zero to 1, and its fade-out gain
 * from 1 to exact zero. The two fades are separate gains, so a stop during the fade in never
 * cancels an automation and never raises a gain. Every automation on the loop's path is added
 * after the last, and none is cancelled.
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
  let loop: Loop | null = null;
  /** How fast the beat sinks under a creature's sound, and how fast it comes back. */
  const duckSinkS = 0.04;
  const duckRiseS = 0.2;
  let beat: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    levelGain: number;
  } | null = null;

  const checkChannels = (
    left: Float32Array,
    right: Float32Array,
    sampleRateHz: number,
  ): void => {
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
  };

  /** The stop gain a sound starting at `startS` goes to: a new one after a stop fade. */
  const stageForStart = (startS: number): Stage => {
    if (stage.fadeEndS !== null) {
      if (!(startS >= stage.fadeEndS)) {
        throw new RangeError(
          `A sound cannot start at ${startS} s, before the stop fade ends at ${stage.fadeEndS} s.`,
        );
      }
      retire(stage);
      stage = createStage();
    }
    return stage;
  };

  const stereoBuffer = (left: Float32Array, right: Float32Array) => {
    const buffer = context.createBuffer(2, left.length, context.sampleRate);
    buffer.copyToChannel(new Float32Array(left), channelIndex.left);
    buffer.copyToChannel(new Float32Array(right), channelIndex.right);
    return buffer;
  };

  const stereoGain = (value: number): GainNode => {
    const gain = context.createGain();
    gain.channelCount = 2;
    gain.channelCountMode = "explicit";
    gain.channelInterpretation = "discrete";
    gain.gain.value = value;
    return gain;
  };

  const retire = (faded: Stage): void => {
    if (faded.sources.size === 0) {
      faded.gain.disconnect();
    } else {
      retiredStages.add(faded);
    }
  };

  const graph: OutputGraph = {
    play(left, right, sampleRateHz, startS) {
      checkChannels(left, right, sampleRateHz);
      const owner = stageForStart(startS);

      const source = context.createBufferSource();
      source.buffer = stereoBuffer(left, right);
      source.connect(owner.gain);
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

    startLoop(
      left,
      right,
      sampleRateHz,
      startS,
      levelGain,
      fadeInS,
      repeat = true,
    ) {
      checkChannels(left, right, sampleRateHz);
      if (!(Number.isFinite(levelGain) && levelGain > 0)) {
        throw new RangeError(
          `A loop's level gain must be a finite number above 0, but got ${String(levelGain)}.`,
        );
      }
      if (!(Number.isFinite(fadeInS) && fadeInS > 0)) {
        throw new RangeError(
          `A fade in must last a finite time above 0 s, but got ${String(fadeInS)}.`,
        );
      }
      if (loop !== null && !loop.stopping) {
        throw new RangeError("A loop is already playing.");
      }
      const owner = stageForStart(startS);

      const source = context.createBufferSource();
      source.buffer = stereoBuffer(left, right);
      source.loop = repeat;
      const level = stereoGain(levelGain);
      // Exact zero until the fade in begins at the loop's start.
      const fadeIn = stereoGain(0);
      const fadeOut = stereoGain(1);
      source.connect(level);
      level.connect(fadeIn);
      fadeIn.connect(fadeOut);
      fadeOut.connect(owner.gain);
      fadeIn.gain.setValueCurveAtTime(fadeInCurve, startS, fadeInS);

      const started: Loop = {
        source,
        levelGain: level,
        fadeInGain: fadeIn,
        fadeOutGain: fadeOut,
        lastLevelGain: levelGain,
        stopping: false,
      };
      loop = started;
      owner.sources.add(source);
      source.onended = () => {
        source.disconnect();
        level.disconnect();
        fadeIn.disconnect();
        fadeOut.disconnect();
        owner.sources.delete(source);
        if (loop === started) {
          loop = null;
        }
        if (retiredStages.has(owner) && owner.sources.size === 0) {
          owner.gain.disconnect();
          retiredStages.delete(owner);
        }
      };
      source.start(startS);
    },

    rampLoopLevel(levelGain, startS, endS) {
      if (loop === null || loop.stopping) {
        return;
      }
      if (!(Number.isFinite(levelGain) && levelGain > 0) || !(endS > startS)) {
        throw new RangeError(
          `A level ramp needs a finite gain above 0 and an end after its start, but got ${String(levelGain)} from ${startS} s to ${endS} s.`,
        );
      }
      loop.levelGain.gain.setValueAtTime(loop.lastLevelGain, startS);
      loop.levelGain.gain.exponentialRampToValueAtTime(levelGain, endS);
      loop.lastLevelGain = levelGain;
    },

    stopLoop(durationS) {
      if (!(Number.isFinite(durationS) && durationS > 0)) {
        throw new RangeError(
          `A stop fade must last a finite time above 0 s, but got ${String(durationS)}.`,
        );
      }
      if (loop === null || loop.stopping) {
        return;
      }
      const nowS = context.currentTime;
      loop.stopping = true;
      loop.fadeOutGain.gain.setValueCurveAtTime(stopCurve, nowS, durationS);
      loop.source.stop(nowS + durationS);
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
      if (loop !== null) {
        // Its source is one of the stage's and stops with them; no further ramp is wanted.
        loop.stopping = true;
      }
    },

    startBeat(left, right, sampleRateHz, startS, levelGain) {
      checkChannels(left, right, sampleRateHz);
      if (!(Number.isFinite(levelGain) && levelGain > 0)) {
        throw new RangeError(
          `A beat's level gain must be a finite number above 0, but got ${String(levelGain)}.`,
        );
      }
      if (beat !== null) {
        beat.source.stop();
        beat = null;
      }
      const source = context.createBufferSource();
      source.buffer = stereoBuffer(left, right);
      source.loop = true;
      const gain = stereoGain(levelGain);
      source.connect(gain);
      gain.connect(destination);
      const started = { source, gain, levelGain };
      beat = started;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (beat === started) {
          beat = null;
        }
      };
      source.start(startS);
    },

    duckBeat(fromS, toS, duckGain) {
      if (beat === null) {
        return;
      }
      const param = beat.gain.gain;
      const downS = Math.max(context.currentTime, fromS - duckSinkS);
      const upS = Math.max(downS + duckSinkS, toS);
      const low = beat.levelGain * duckGain;
      param.setValueAtTime(beat.levelGain, downS);
      param.linearRampToValueAtTime(low, downS + duckSinkS);
      param.setValueAtTime(low, upS);
      param.linearRampToValueAtTime(beat.levelGain, upS + duckRiseS);
    },

    stopBeat(durationS) {
      if (beat === null) {
        return;
      }
      const nowS = context.currentTime;
      const stopping = beat;
      beat = null;
      stopping.gain.gain.cancelScheduledValues(nowS);
      stopping.gain.gain.setValueCurveAtTime(stopCurve, nowS, durationS);
      stopping.source.stop(nowS + durationS);
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

import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { calibrationMusicConfig } from "../../config/calibration-music-config";
import type { RandomSource } from "../../config/seeded-random";
import type { SoundId } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import type { Timer, TimerHandle } from "../../config/timer";
import { decibelsToGain } from "../synth/decibels-to-gain";
import type {
  AudioBackend,
  DecodedCalibrationMusic,
  TimestampPair,
} from "./audio-backend";
import { calibrationControlTopDb as musicControlTopDb } from "./calibration-music-top";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { gainToDecibels } from "./gain-to-decibels";
import { measureCalibrationMusic } from "./measure-calibration-music";
import { nextCalibrationMusicSettingDb } from "./next-calibration-music-setting";
import { nextCalibrationSettingDb } from "./next-calibration-setting";
import type {
  ClampLimit,
  Ear,
  EarChoice,
  OutputState,
  PreparationRefusal,
  Purpose,
  StopReason,
  UnsupportedReason,
} from "./output-types";
import { preparePlayback } from "./prepare-playback";
import type { RangeReport } from "./range-report";
import { rangeReport } from "./range-report";
import type { RenderRefusal } from "./render-playable-buffer";
import { renderPlayableBuffer } from "./render-playable-buffer";

/** Why the shell did not schedule a sound. */
export type PlayRefusal =
  | PreparationRefusal
  | RenderRefusal
  | "notRunning"
  | "notCalibrated"
  | "notCalibrating"
  | "busy"
  | "unsupported";

/** What `play` and `playHeadphoneCheck` return (R8.4, R13.1). Times are on the audio clock. */
export type PlayOutcome =
  | { readonly kind: "refused"; readonly reason: PlayRefusal }
  | {
      readonly kind: "scheduled";
      readonly startMs: number;
      readonly endMs: number;
      readonly requestedLevelDb: number;
      readonly playedLevelDb: number;
      readonly clampLimit: ClampLimit | null;
    };

/** What `playCalibrationRepeat` returns (R16.2). */
export type CalibrationRepeatOutcome =
  | { readonly kind: "refused"; readonly reason: PlayRefusal }
  | {
      readonly kind: "scheduled";
      /** The Calibration_Setting played, which may differ from the one asked for. */
      readonly settingDb: number;
      /** Whether that setting is the Calibration_Setting_Top. */
      readonly atTop: boolean;
      readonly startMs: number;
      readonly endMs: number;
      readonly clampLimit: ClampLimit | null;
    };

/**
 * What a calibration plays (audible-start design.md). `loading`: the music is not ready yet;
 * `music`: the calibration music; `hiss`: the music could not be loaded. The session has the same
 * type; the output stage may not import it, so it is declared again here, and a type-level test in
 * `src/session/` checks that the two are the same.
 */
export type CalibrationSound = "loading" | "music" | "hiss";

/** Why the calibration music did not start (audible-start design.md, "Playing"). */
export type CalibrationMusicRefusal =
  "notRunning" | "notCalibrating" | "notReady" | "busy" | "unsupported";

/** What `startCalibrationMusic` returns. Times are on the audio clock. */
export type CalibrationMusicOutcome =
  | { readonly kind: "refused"; readonly reason: CalibrationMusicRefusal }
  | {
      readonly kind: "started";
      /** When the fade in begins. */
      readonly startMs: number;
      /** The Played_Setting it starts at: the bottom of the control. */
      readonly settingDb: number;
    };

/** Why a calibration could not be kept (R16.5, R16.6). */
export type KeepRefusal =
  "notCalibrating" | "noRepeatPlayed" | "systemVolumeHigh";

export type KeepOutcome =
  | { readonly kind: "refused"; readonly reason: KeepRefusal }
  | {
      readonly kind: "kept";
      readonly settingDb: number;
      readonly rangeReport: RangeReport;
    };

/** What `activate` resolves to. */
export type ActivateResult =
  | { readonly kind: "running"; readonly sampleRateHz: number }
  | { readonly kind: "refused"; readonly reason: "noGesture" }
  | {
      readonly kind: "unsupported";
      readonly reason: UnsupportedReason;
      readonly sampleRateHz: number | null;
    }
  | { readonly kind: "stopped"; readonly reason: StopReason };

/** One clamped sound the shell scheduled (R7.8, D22). */
export interface ClampLogEntry {
  readonly startMs: number;
  readonly soundId: SoundId;
  readonly earChoice: EarChoice;
  readonly purpose: Purpose;
  readonly requestedLevelDb: number;
  readonly playedLevelDb: number;
  readonly clampLimit: ClampLimit;
}

export interface StopEvent {
  readonly reason: StopReason;
}

export interface UnsupportedEvent {
  readonly reason: UnsupportedReason;
  readonly sampleRateHz: number | null;
}

export interface PlayRequest {
  readonly soundId: SoundId;
  readonly ear: Ear;
  readonly levelDb: number;
  readonly purpose: Extract<Purpose, "trial" | "replay" | "listening">;
  readonly random: RandomSource;
}

/** The Output_Shell (design.md, "The output shell"). */
export interface AudioOutput {
  state(): OutputState;
  /** Call from inside a user gesture. Its backend calls happen before it first awaits (D23). */
  activate(): Promise<ActivateResult>;
  /** The Visible_Stop_Control: stops all sound with the reason `control`. */
  stopAll(): void;
  /** Called on every stop, a repeated one included. Returns the function that removes it. */
  onStop(listener: (event: StopEvent) => void): () => void;
  onUnsupported(listener: (event: UnsupportedEvent) => void): () => void;
  /** The context's rate once `activate` found it supported, otherwise null. */
  sampleRateHz(): number | null;

  beginCalibration(): void;
  playCalibrationRepeat(request: {
    readonly requestedSettingDb: number;
    readonly random: RandomSource;
  }): CalibrationRepeatOutcome;
  keepCalibration(): KeepOutcome;
  /** The Range_Report of the kept calibration, or null while none is kept (R9.3). */
  rangeReport(): RangeReport | null;
  playHeadphoneCheck(random: RandomSource): PlayOutcome;

  beginRoom(): void;
  play(request: PlayRequest): PlayOutcome;

  clampLog(): readonly ClampLogEntry[];
  timestampPair(): TimestampPair | null;
}

/**
 * The calibration music's calls of the Output_Shell (audible-start design.md, "Playing"). Apart
 * from `AudioOutput`, so that a view of the shell that plays no calibration, as the swapped
 * repeat's room runner has, need not offer them. `createAudioOutput` gives both.
 */
export interface CalibrationMusicOutput {
  /**
   * The calibration music (audible-start design.md, "Playing"). `loading` until the music loaded
   * in the first `activate` that created the context has arrived; then `music`, or `hiss` for the
   * life of the shell if it could not be loaded or used.
   */
  calibrationSound(): CalibrationSound;
  /** Called on every change of the Calibration_Sound. Returns the function that removes it. */
  onCalibrationSoundChange(
    listener: (sound: CalibrationSound) => void,
  ): () => void;
  /** The Control_Top of the sound in use: the music's once it is `music`, the hiss's otherwise. */
  calibrationControlTopDb(): number;
  /**
   * Starts the music looping in both ears at the bottom of the control, fading in from exact
   * zero. While it plays, every other sound is refused `busy`.
   */
  startCalibrationMusic(): CalibrationMusicOutcome;
  /** Where the music's level moves to, a step at a time. NaN changes nothing. */
  setCalibrationMusicTarget(settingDb: number): void;
  /** The Played_Setting the music has reached, or null when the music is not playing. */
  calibrationMusicSettingDb(): number | null;
  /**
   * Called with the setting the music has reached, once each step's ramp has ended, at the next
   * step. Returns the function that removes it.
   */
  onCalibrationMusicStep(listener: (settingDb: number) => void): () => void;
  /** Fades the music to exact zero over the stop fade. Does nothing when it is not playing. */
  stopCalibrationMusic(): void;
}

interface SoundToSchedule {
  readonly soundId: SoundId;
  readonly earChoice: EarChoice;
  readonly levelDb: number;
  readonly calibrationGain: number;
  readonly purpose: Purpose;
  readonly random: RandomSource;
}

type ScheduleResult =
  | { readonly kind: "refused"; readonly reason: PlayRefusal }
  | {
      readonly kind: "scheduled";
      readonly startMs: number;
      readonly endMs: number;
      readonly requestedLevelDb: number;
      readonly playedLevelDb: number;
      readonly clampLimit: ClampLimit | null;
    };

/** A setting this close above a grid setting still counts as that setting (as D36 of audio-output). */
const gridToleranceSteps = 1e-9;

/** The calibration music once it has been measured and found usable. */
interface ReadyMusic {
  readonly samples: Float32Array;
  readonly sampleRateHz: number;
  readonly rmsFraction: number;
  readonly peakFraction: number;
  /** The Control_Top with this music. */
  readonly controlTopDb: number;
  /** The largest level gain at which the music's peak stays within the ceiling. */
  readonly ceilingGain: number;
}

const refused = <Reason extends string>(
  reason: Reason,
): { readonly kind: "refused"; readonly reason: Reason } =>
  Object.freeze({ kind: "refused", reason });

/**
 * Creates the Output_Shell: the state that `preparePlayback` does not hold, and the only way a
 * sound reaches the backend (design.md, "The output shell").
 *
 * It renders every sound itself from a Sound_Id (D4), prepares it with `preparePlayback`, and
 * schedules the two channels it returns, one sound at a time (D16). It stops all sound on
 * `stopAll` and on every backend event, and suspends or closes the context after the stop fade
 * by the injected timer (D14, D18).
 *
 * It also loads, measures and loops the calibration music, the one sound that takes no Sound_Id
 * and is not limited to the longest-sound duration (audible-start design.md, "The calibration
 * music"; the exception to audio-safety rule 6). The music is loaded once, in the first
 * `activate` that creates the context, and the hiss is used for the life of the shell if it
 * cannot be. It starts at the bottom of the control with the output fade, rises by at most
 * `calibrationRiseMaxDb` per `calibrationMusicRisePeriodMs` in steps of the injected timer that
 * never overlap on the audio clock, stays within the ceiling on its measured peak, and stops with
 * the stop fade. While it plays, and until its stop fade ends, every other sound is `busy`.
 */
export function createAudioOutput(options: {
  backend: AudioBackend;
  timer: Timer;
}): AudioOutput & CalibrationMusicOutput {
  const { backend, timer } = options;
  const {
    scheduleLeadMs,
    stopFadeMs,
    outputFadeMs,
    headphoneCheckLevelDb,
    calibrationSettingKeepMinDb,
    calibrationSettingMinDb,
    calibrationSettingStepDb,
    calibrationSettingSpanMinDb,
    calibrationMusicGainStepMs,
    calibrationMusicLoadMaxMs,
  } = audioOutputConfig;
  const topSettingDb = calibrationSettingTopDb();

  let state: OutputState = Object.freeze({ kind: "inactive" });
  let rateHz: number | null = null;
  let keptSettingDb: number | null = null;
  let calibrating = false;
  let lastRepeatSettingDb: number | null = null;
  let previousGain: Record<Ear, number | null> = { left: null, right: null };
  let busyEndMs: number | null = null;
  const clampEntries: ClampLogEntry[] = [];
  const stopListeners = new Set<(event: StopEvent) => void>();
  const unsupportedListeners = new Set<(event: UnsupportedEvent) => void>();
  let suspendHandle: TimerHandle | null = null;
  let closeAfterStop = false;
  let activationCount = 0;
  let latestActivation: Promise<ActivateResult> | null = null;

  // The calibration music (audible-start design.md, "Loading" and "Playing").
  let sound: CalibrationSound = "loading";
  let music: ReadyMusic | null = null;
  let musicLoadBegun = false;
  let musicLoadTimeoutHandle: TimerHandle | null = null;
  const soundListeners = new Set<(sound: CalibrationSound) => void>();
  const stepListeners = new Set<(settingDb: number) => void>();
  let musicPlaying = false;
  let musicTargetDb = calibrationSettingMinDb;
  /** The setting the last level ramp ends at, or the start's while no ramp has run. */
  let musicPlayedDb = calibrationSettingMinDb;
  /** The setting the last level ramp began at, and when it ends on the audio clock. */
  let musicRampFromDb = calibrationSettingMinDb;
  let musicRampEndMs: number | null = null;
  let musicStepHandle: TimerHandle | null = null;
  /** The last setting the step listeners heard of. */
  let musicNotifiedDb = calibrationSettingMinDb;
  /** The Played_Setting the music last reached in this calibration, or null. */
  let lastMusicSettingDb: number | null = null;

  const notifyAll = <Event>(
    listeners: ReadonlySet<(event: Event) => void>,
    event: Event,
  ): void => {
    // Every listener hears every event, even if an earlier one throws (R14.7).
    let firstError: unknown = null;
    let threw = false;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        if (!threw) {
          firstError = error;
          threw = true;
        }
      }
    }
    if (threw) {
      throw firstError;
    }
  };

  const cancelPendingSuspend = (): void => {
    if (suspendHandle !== null) {
      timer.clearTimeout(suspendHandle);
      suspendHandle = null;
    }
  };

  const forgetCalibration = (): void => {
    keptSettingDb = null;
    lastRepeatSettingDb = null;
    lastMusicSettingDb = null;
    previousGain = { left: null, right: null };
  };

  const setSound = (next: CalibrationSound): void => {
    if (sound === next) {
      return;
    }
    sound = next;
    if (next === "hiss") {
      music = null;
    }
    notifyAll(soundListeners, next);
  };

  const clearMusicLoadTimeout = (): void => {
    if (musicLoadTimeoutHandle !== null) {
      timer.clearTimeout(musicLoadTimeoutHandle);
      musicLoadTimeoutHandle = null;
    }
  };

  /** The music measured and checked, or null when it cannot be used (R4.3, R4.4, D9). */
  const readyMusicOf = (
    decoded: DecodedCalibrationMusic,
  ): ReadyMusic | null => {
    if (
      !(decoded.samples instanceof Float32Array) ||
      !Number.isFinite(decoded.sampleRateHz) ||
      decoded.sampleRateHz <= 0
    ) {
      return null;
    }
    const measure = measureCalibrationMusic(decoded.samples);
    if (measure === null) {
      return null;
    }
    const controlTopDb = musicControlTopDb(measure.crestDb);
    if (
      controlTopDb <
      calibrationSettingKeepMinDb + calibrationSettingSpanMinDb
    ) {
      return null;
    }
    let ceilingGain = audioSafetyConfig.ceilingFraction / measure.peakFraction;
    // Rounding may put the product a hair above the ceiling; never by any margin.
    while (
      ceilingGain * measure.peakFraction >
      audioSafetyConfig.ceilingFraction
    ) {
      ceilingGain *= 1 - Number.EPSILON;
    }
    return Object.freeze({
      samples: decoded.samples,
      sampleRateHz: decoded.sampleRateHz,
      rmsFraction: measure.rmsFraction,
      peakFraction: measure.peakFraction,
      controlTopDb,
      ceilingGain,
    });
  };

  /** Loads the music once, in the first `activate` that creates the context (R4.1, D4, D10). */
  const beginMusicLoad = (): void => {
    if (musicLoadBegun) {
      return;
    }
    musicLoadBegun = true;
    musicLoadTimeoutHandle = timer.setTimeout(() => {
      musicLoadTimeoutHandle = null;
      if (sound === "loading") {
        setSound("hiss");
      }
    }, calibrationMusicLoadMaxMs);
    let loading: Promise<DecodedCalibrationMusic>;
    try {
      loading = backend.loadCalibrationMusic(calibrationMusicConfig.filePath);
    } catch {
      clearMusicLoadTimeout();
      setSound("hiss");
      return;
    }
    loading.then(
      (decoded) => {
        // A result after the time-out is dropped (R4.4).
        if (sound !== "loading") {
          return;
        }
        clearMusicLoadTimeout();
        const ready = readyMusicOf(decoded);
        if (ready === null) {
          setSound("hiss");
          return;
        }
        music = ready;
        setSound("music");
      },
      () => {
        if (sound !== "loading") {
          return;
        }
        clearMusicLoadTimeout();
        setSound("hiss");
      },
    );
  };

  /** Music_Level_Gain within the ceiling, logging the ceiling if it ever acts (R5.5). */
  const musicLevelGain = (ready: ReadyMusic, settingDb: number): number => {
    const levelGain =
      (decibelsToGain(settingDb) * soundRulesConfig.referenceRmsFraction) /
      ready.rmsFraction;
    if (levelGain <= ready.ceilingGain) {
      return levelGain;
    }
    clampEntries.push(
      Object.freeze({
        startMs: backend.currentTimeMs(),
        soundId: "calibration",
        earChoice: "both",
        purpose: "calibration",
        requestedLevelDb: 0,
        playedLevelDb: gainToDecibels(ready.ceilingGain / levelGain),
        clampLimit: "ceiling",
      }),
    );
    return ready.ceilingGain;
  };

  const musicTopDb = (): number =>
    sound === "music" && music !== null ? music.controlTopDb : topSettingDb;

  /** The Played_Setting reached: during a level ramp, the lower of its two ends. */
  const reachedMusicSettingDb = (): number =>
    musicRampEndMs !== null && backend.currentTimeMs() < musicRampEndMs
      ? Math.min(musicRampFromDb, musicPlayedDb)
      : musicPlayedDb;

  const clearMusicStep = (): void => {
    if (musicStepHandle !== null) {
      timer.clearTimeout(musicStepHandle);
      musicStepHandle = null;
    }
  };

  /** Ends the music's own state; the caller fades it out. */
  const endMusic = (): void => {
    if (!musicPlaying) {
      return;
    }
    lastMusicSettingDb = reachedMusicSettingDb();
    musicPlaying = false;
    musicRampEndMs = null;
    clearMusicStep();
  };

  /**
   * One step of the music's level (R5.3, R5.4, D6). It reads the audio clock first; while the last
   * ramp has not ended there, it waits for the remainder and does nothing else, so that ramps
   * never overlap.
   */
  const musicStep = (): void => {
    musicStepHandle = null;
    const ready = music;
    if (!musicPlaying || ready === null) {
      return;
    }
    const nowMs = backend.currentTimeMs();
    if (musicRampEndMs !== null && nowMs < musicRampEndMs) {
      musicStepHandle = timer.setTimeout(musicStep, musicRampEndMs - nowMs);
      return;
    }
    // The last ramp has ended: its setting is reached, and the listeners hear of it now.
    if (musicNotifiedDb !== musicPlayedDb) {
      musicNotifiedDb = musicPlayedDb;
      notifyAll(stepListeners, musicPlayedDb);
      if (!musicPlaying || musicStepHandle !== null) {
        // A listener stopped the music or started it again.
        return;
      }
    }
    const nextDb = nextCalibrationMusicSettingDb(
      musicPlayedDb,
      musicTargetDb,
      ready.controlTopDb,
    );
    if (nextDb !== musicPlayedDb) {
      const endMs = nowMs + calibrationMusicGainStepMs;
      backend.rampLoopLevel(musicLevelGain(ready, nextDb), nowMs, endMs);
      musicRampFromDb = musicPlayedDb;
      musicPlayedDb = nextDb;
      musicRampEndMs = endMs;
      lastMusicSettingDb = reachedMusicSettingDb();
    }
    musicStepHandle = timer.setTimeout(musicStep, calibrationMusicGainStepMs);
  };

  /** A setting rounded down to the control's grid. */
  const onGridDb = (settingDb: number): number =>
    calibrationSettingMinDb +
    Math.floor(
      (settingDb - calibrationSettingMinDb) / calibrationSettingStepDb +
        gridToleranceSteps,
    ) *
      calibrationSettingStepDb;

  const resultOfState = (): ActivateResult => {
    switch (state.kind) {
      case "running":
        return Object.freeze({ kind: "running", sampleRateHz: rateHz ?? 0 });
      case "stopped":
        return Object.freeze({ kind: "stopped", reason: state.reason });
      case "unsupported":
        return Object.freeze({
          kind: "unsupported",
          reason: state.reason,
          sampleRateHz: state.sampleRateHz,
        });
      default:
        // Not reached: an activation settles only after leaving starting.
        return Object.freeze({ kind: "stopped", reason: "interrupted" });
    }
  };

  const becomeUnsupported = (
    reason: UnsupportedReason,
    sampleRateHz: number | null,
  ): ActivateResult => {
    cancelPendingSuspend();
    endMusic();
    forgetCalibration();
    calibrating = false;
    rateHz = null;
    busyEndMs = null;
    state = Object.freeze({ kind: "unsupported", reason, sampleRateHz });
    notifyAll(unsupportedListeners, Object.freeze({ reason, sampleRateHz }));
    return resultOfState();
  };

  /**
   * Every stop does the same, whatever its reason (design.md, Stopping). Before the first
   * `activate` there is no context and nothing that could sound, and an unsupported shell has
   * closed its context, so a stop then does nothing (D42).
   */
  const stop = (reason: StopReason): void => {
    if (state.kind === "inactive" || state.kind === "unsupported") {
      return;
    }
    // The fade stops the music's loop too (R5.6).
    backend.fadeToSilence(stopFadeMs);
    endMusic();
    if (busyEndMs !== null) {
      busyEndMs = Math.min(busyEndMs, backend.currentTimeMs() + stopFadeMs);
    }
    if (state.kind !== "stopped") {
      state = Object.freeze({ kind: "stopped", reason });
    }
    if (reason === "deviceChanged") {
      forgetCalibration();
    }
    if (reason === "pageLeft") {
      closeAfterStop = true;
    }
    // Scheduled before the listeners run, so that an `activate` from a listener cancels it.
    cancelPendingSuspend();
    suspendHandle = timer.setTimeout(() => {
      suspendHandle = null;
      if (state.kind !== "stopped") {
        return;
      }
      if (closeAfterStop) {
        backend.close();
      } else {
        backend.suspend();
      }
    }, stopFadeMs + scheduleLeadMs);
    notifyAll(stopListeners, Object.freeze({ reason }));
  };

  backend.onEvent((event) => stop(event));

  const activate = (): Promise<ActivateResult> => {
    // Every backend call below happens before this function returns (R4.2, D23).
    if (state.kind === "unsupported") {
      return Promise.resolve(resultOfState());
    }
    if (!backend.hasWebAudio()) {
      return Promise.resolve(becomeUnsupported("noWebAudio", null));
    }
    if (backend.userActivationActive() === false) {
      return Promise.resolve(
        Object.freeze({ kind: "refused", reason: "noGesture" } as const),
      );
    }
    if (state.kind === "running") {
      return Promise.resolve(resultOfState());
    }
    if (state.kind === "starting" && latestActivation !== null) {
      return latestActivation;
    }
    cancelPendingSuspend();
    closeAfterStop = false;
    backend.createOrResume();
    const sampleRateHz = backend.sampleRateHz();
    if (
      !Number.isFinite(sampleRateHz) ||
      sampleRateHz < soundRulesConfig.sampleRateMinHz
    ) {
      backend.close();
      return Promise.resolve(
        becomeUnsupported("sampleRateTooLow", sampleRateHz),
      );
    }
    if (!(backend.outputChannelCountMax() >= 2)) {
      backend.close();
      return Promise.resolve(becomeUnsupported("monoOutput", sampleRateHz));
    }
    rateHz = sampleRateHz;
    state = Object.freeze({ kind: "starting" });
    beginMusicLoad();
    activationCount += 1;
    const thisActivation = activationCount;
    const settle = (
      running: boolean,
    ): ActivateResult | Promise<ActivateResult> => {
      if (thisActivation !== activationCount && latestActivation !== null) {
        return latestActivation;
      }
      if (state.kind === "starting") {
        if (running) {
          state = Object.freeze({ kind: "running" });
        } else {
          stop("interrupted");
        }
      }
      return resultOfState();
    };
    latestActivation = backend.whenRunning().then(
      () => settle(true),
      () => settle(false),
    );
    return latestActivation;
  };

  const refusalForState = (): PlayRefusal | null => {
    if (state.kind === "unsupported") {
      return "unsupported";
    }
    if (state.kind !== "running" || rateHz === null) {
      return "notRunning";
    }
    return null;
  };

  /** Steps 2 to 7 of "Playing a sound", shared by every kind of sound. */
  const schedule = (sound: SoundToSchedule): ScheduleResult => {
    const sampleRateHz = rateHz;
    if (sampleRateHz === null) {
      return refused("notRunning");
    }
    if (
      busyEndMs !== null &&
      backend.currentTimeMs() + scheduleLeadMs < busyEndMs
    ) {
      return refused("busy");
    }
    const buffer = renderPlayableBuffer(
      sound.soundId,
      sampleRateHz,
      sound.random,
    );
    if (buffer.kind === "refused") {
      return refused(buffer.reason);
    }
    const prepared = preparePlayback({
      samples: buffer.samples,
      sampleRateHz,
      soundId: sound.soundId,
      earChoice: sound.earChoice,
      requestedLevelDb: sound.levelDb,
      calibrationGain: sound.calibrationGain,
      previousAppliedGain:
        sound.purpose === "replay" ? null : { ...previousGain },
    });
    if (prepared.kind === "refused") {
      return refused(prepared.reason);
    }
    // Read again: rendering took time, and a later start can only end the busy interval later.
    const startMs = backend.currentTimeMs() + scheduleLeadMs;
    const endMs = startMs + (prepared.left.length / sampleRateHz) * 1000;
    backend.schedule(
      { left: prepared.left, right: prepared.right, sampleRateHz },
      startMs,
    );
    busyEndMs = endMs;
    const earsPlayed: readonly Ear[] =
      sound.earChoice === "both" ? ["left", "right"] : [sound.earChoice];
    for (const ear of earsPlayed) {
      previousGain[ear] = prepared.appliedGain;
    }
    if (prepared.clampLimit !== null) {
      clampEntries.push(
        Object.freeze({
          startMs,
          soundId: sound.soundId,
          earChoice: sound.earChoice,
          purpose: sound.purpose,
          requestedLevelDb: prepared.requestedLevelDb,
          playedLevelDb: prepared.playedLevelDb,
          clampLimit: prepared.clampLimit,
        }),
      );
    }
    return Object.freeze({
      kind: "scheduled",
      startMs,
      endMs,
      requestedLevelDb: prepared.requestedLevelDb,
      playedLevelDb: prepared.playedLevelDb,
      clampLimit: prepared.clampLimit,
    });
  };

  const output: AudioOutput & CalibrationMusicOutput = {
    state: () => state,
    activate,
    stopAll: () => stop("control"),
    onStop(listener) {
      stopListeners.add(listener);
      return () => {
        stopListeners.delete(listener);
      };
    },
    onUnsupported(listener) {
      unsupportedListeners.add(listener);
      return () => {
        unsupportedListeners.delete(listener);
      };
    },
    sampleRateHz: () => rateHz,

    beginCalibration() {
      if (musicPlaying) {
        backend.stopLoop(stopFadeMs);
        endMusic();
        busyEndMs = backend.currentTimeMs() + stopFadeMs;
      }
      forgetCalibration();
      calibrating = true;
    },

    playCalibrationRepeat(request): CalibrationRepeatOutcome {
      const stateRefusal = refusalForState();
      if (stateRefusal !== null) {
        return refused(stateRefusal);
      }
      if (!calibrating) {
        return refused("notCalibrating");
      }
      const settingDb = nextCalibrationSettingDb(
        request.requestedSettingDb,
        lastRepeatSettingDb,
      );
      const result = schedule({
        soundId: "calibration",
        earChoice: "both",
        levelDb: 0,
        calibrationGain: decibelsToGain(settingDb),
        purpose: "calibration",
        random: request.random,
      });
      if (result.kind === "refused") {
        return result;
      }
      lastRepeatSettingDb = settingDb;
      lastMusicSettingDb = null;
      return Object.freeze({
        kind: "scheduled",
        settingDb,
        atTop: settingDb >= topSettingDb,
        startMs: result.startMs,
        endMs: result.endMs,
        clampLimit: result.clampLimit,
      });
    },

    keepCalibration(): KeepOutcome {
      if (!calibrating) {
        return refused("notCalibrating");
      }
      // With the music, the Played_Setting reached, rounded down to the grid (R5.8).
      const musicSettingDb = musicPlaying
        ? reachedMusicSettingDb()
        : lastMusicSettingDb;
      const settingDb =
        musicSettingDb !== null
          ? onGridDb(musicSettingDb)
          : lastRepeatSettingDb;
      if (settingDb === null) {
        return refused("noRepeatPlayed");
      }
      if (settingDb < calibrationSettingKeepMinDb) {
        return refused("systemVolumeHigh");
      }
      if (musicPlaying) {
        backend.stopLoop(stopFadeMs);
        endMusic();
        busyEndMs = backend.currentTimeMs() + stopFadeMs;
      }
      keptSettingDb = settingDb;
      calibrating = false;
      lastRepeatSettingDb = null;
      lastMusicSettingDb = null;
      return Object.freeze({
        kind: "kept",
        settingDb: keptSettingDb,
        rangeReport: rangeReport(decibelsToGain(keptSettingDb)),
      });
    },

    rangeReport: () =>
      keptSettingDb === null
        ? null
        : rangeReport(decibelsToGain(keptSettingDb)),

    playHeadphoneCheck(random): PlayOutcome {
      const stateRefusal = refusalForState();
      if (stateRefusal !== null) {
        return refused(stateRefusal);
      }
      if (keptSettingDb === null) {
        return refused("notCalibrated");
      }
      return schedule({
        soundId: "calibration",
        earChoice: "left",
        levelDb: headphoneCheckLevelDb,
        calibrationGain: decibelsToGain(keptSettingDb),
        purpose: "headphoneCheck",
        random,
      });
    },

    calibrationSound: () => sound,

    onCalibrationSoundChange(listener) {
      soundListeners.add(listener);
      return () => {
        soundListeners.delete(listener);
      };
    },

    calibrationControlTopDb: musicTopDb,

    startCalibrationMusic(): CalibrationMusicOutcome {
      const stateRefusal = refusalForState();
      if (stateRefusal !== null) {
        return refused(
          stateRefusal === "unsupported" ? "unsupported" : "notRunning",
        );
      }
      if (!calibrating) {
        return refused("notCalibrating");
      }
      const ready = music;
      if (sound !== "music" || ready === null) {
        return refused("notReady");
      }
      if (ready.sampleRateHz !== rateHz) {
        // Decoded for a context at another rate, which cannot play it: the hiss from now on.
        setSound("hiss");
        return refused("notReady");
      }
      if (
        musicPlaying ||
        (busyEndMs !== null &&
          backend.currentTimeMs() + scheduleLeadMs < busyEndMs)
      ) {
        return refused("busy");
      }
      const startMs = backend.currentTimeMs() + scheduleLeadMs;
      const settingDb = calibrationSettingMinDb;
      backend.startLoop(
        {
          left: ready.samples,
          right: ready.samples,
          sampleRateHz: ready.sampleRateHz,
        },
        startMs,
        musicLevelGain(ready, settingDb),
        outputFadeMs,
      );
      musicPlaying = true;
      musicTargetDb = settingDb;
      musicPlayedDb = settingDb;
      musicRampFromDb = settingDb;
      musicRampEndMs = null;
      musicNotifiedDb = settingDb;
      lastMusicSettingDb = settingDb;
      lastRepeatSettingDb = null;
      // Every other sound is refused until the music's stop fade has ended (R5.7).
      busyEndMs = Number.POSITIVE_INFINITY;
      clearMusicStep();
      musicStepHandle = timer.setTimeout(musicStep, calibrationMusicGainStepMs);
      return Object.freeze({ kind: "started", startMs, settingDb });
    },

    setCalibrationMusicTarget(settingDb) {
      if (typeof settingDb !== "number" || Number.isNaN(settingDb)) {
        return;
      }
      musicTargetDb = Math.min(
        Math.max(settingDb, calibrationSettingMinDb),
        musicTopDb(),
      );
    },

    calibrationMusicSettingDb: () =>
      musicPlaying ? reachedMusicSettingDb() : null,

    onCalibrationMusicStep(listener) {
      stepListeners.add(listener);
      return () => {
        stepListeners.delete(listener);
      };
    },

    stopCalibrationMusic() {
      if (!musicPlaying) {
        return;
      }
      backend.stopLoop(stopFadeMs);
      endMusic();
      busyEndMs = backend.currentTimeMs() + stopFadeMs;
    },

    beginRoom() {
      previousGain = { left: null, right: null };
    },

    play(request): PlayOutcome {
      const stateRefusal = refusalForState();
      if (stateRefusal !== null) {
        return refused(stateRefusal);
      }
      if (keptSettingDb === null) {
        return refused("notCalibrated");
      }
      return schedule({
        soundId: request.soundId,
        earChoice: request.ear,
        levelDb: request.levelDb,
        calibrationGain: decibelsToGain(keptSettingDb),
        purpose: request.purpose,
        random: request.random,
      });
    },

    clampLog: () => Object.freeze([...clampEntries]),

    timestampPair: () =>
      state.kind === "inactive" || state.kind === "unsupported"
        ? null
        : backend.timestampPair(),
  };
  return Object.freeze(output);
}

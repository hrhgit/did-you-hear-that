import { audioOutputConfig } from "../../config/audio-output-config";
import type { RandomSource } from "../../config/seeded-random";
import type { SoundId } from "../../config/sound-id";
import { soundRulesConfig } from "../../config/sound-rules-config";
import type { Timer, TimerHandle } from "../../config/timer";
import { decibelsToGain } from "../synth/decibels-to-gain";
import type { AudioBackend, TimestampPair } from "./audio-backend";
import { calibrationSettingTopDb } from "./calibration-setting-top";
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
 */
export function createAudioOutput(options: {
  backend: AudioBackend;
  timer: Timer;
}): AudioOutput {
  const { backend, timer } = options;
  const {
    scheduleLeadMs,
    stopFadeMs,
    headphoneCheckLevelDb,
    calibrationSettingKeepMinDb,
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
    previousGain = { left: null, right: null };
  };

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
    backend.fadeToSilence(stopFadeMs);
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

  const output: AudioOutput = {
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
      if (lastRepeatSettingDb === null) {
        return refused("noRepeatPlayed");
      }
      if (lastRepeatSettingDb < calibrationSettingKeepMinDb) {
        return refused("systemVolumeHigh");
      }
      keptSettingDb = lastRepeatSettingDb;
      calibrating = false;
      lastRepeatSettingDb = null;
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

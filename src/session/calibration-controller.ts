import { audioOutputConfig } from "../config/audio-output-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import { calibrationCopy } from "../copy/calibration-copy";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import type {
  AudioOutput,
  CalibrationRepeatOutcome,
  KeepOutcome,
  KeepRefusal,
  PlayRefusal,
} from "../audio/output/create-audio-output";
import type { RangeReport } from "../audio/output/range-report";

/** What the calibration screen shows (design.md, "The calibration controller"). */
export interface CalibrationSnapshot {
  /** Whether repeats are being played one after another. */
  readonly playing: boolean;
  /** The setting the next repeat asks for. The shell may play a lower one. */
  readonly targetSettingDb: number;
  /**
   * The setting of the last repeat played, or null before the first. The visible control shows
   * this, so it never shows a setting that was not played (R16.11).
   */
  readonly playedSettingDb: number | null;
  /** Whether the last repeat played at the Calibration_Setting_Top (R16.7). */
  readonly atTop: boolean;
  /** The calibration line to show now. */
  readonly line: string;
  /** Why the last repeat was not played, or null. */
  readonly repeatRefusal: PlayRefusal | null;
  /** Why the last keep was refused, or null. */
  readonly keepRefusal: KeepRefusal | null;
  /** The kept calibration, or null while none is kept by this controller. */
  readonly kept: {
    readonly settingDb: number;
    readonly rangeReport: RangeReport;
  } | null;
}

export interface CalibrationController {
  /**
   * Begins a calibration in the shell and plays its first repeat at once, at the bottom of the
   * control (R16.1). Call it from the visitor's press. A calibration under way starts again.
   */
  open(): void;
  /** Moves the target one step up from the higher of the target and the played setting. */
  louder(): void;
  /** Moves the target one step down from the setting last played. */
  quieter(): void;
  /** Keeps the setting last played, if the shell allows it (R16.4 to R16.6). */
  keep(): KeepOutcome;
  /** Stops playing repeats. The calibration stays open in the shell. */
  close(): void;
  snapshot(): CalibrationSnapshot;
  /** Called after every change of the snapshot. Returns the function that removes it. */
  onChange(listener: () => void): () => void;
}

/**
 * Plays calibration repeats one after another while the calibration screen is open and the shell
 * is running, with `calibrationRepeatGapMs` of silence between the end of one and the start of
 * the next, by the injected timer (R16.11).
 *
 * The end of each repeat is on the audio clock. The controller relates it to the timer through
 * the shell's timestamp pair, whose page time is on the same clock as the system timer. Any stop
 * ends the loop, and only a new `open` starts it again, from the bottom of the control (D47).
 */
export function createCalibrationController(options: {
  output: AudioOutput;
  timer: Timer;
  random: RandomSource;
}): CalibrationController {
  const { output, timer, random } = options;
  const {
    calibrationSettingMinDb,
    calibrationSettingStepDb,
    calibrationSettingKeepMinDb,
    calibrationRepeatGapMs,
    scheduleLeadMs,
  } = audioOutputConfig;
  const topSettingDb = calibrationSettingTopDb();
  const listeners = new Set<() => void>();

  let playing = false;
  let handle: TimerHandle | null = null;
  let targetSettingDb = calibrationSettingMinDb;
  let playedSettingDb: number | null = null;
  let atTop = false;
  let repeatRefusal: PlayRefusal | null = null;
  let keepRefusal: KeepRefusal | null = null;
  let volumeHighShown = false;
  let kept: CalibrationSnapshot["kept"] = null;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const cancelNext = (): void => {
    if (handle !== null) {
      timer.clearTimeout(handle);
      handle = null;
    }
  };

  /**
   * How long to wait from now before asking for the next repeat, so that it starts
   * `calibrationRepeatGapMs` after this one ends. The shell starts every sound `scheduleLeadMs`
   * after it is asked for.
   */
  const delayAfter = (
    outcome: Extract<CalibrationRepeatOutcome, { kind: "scheduled" }>,
  ): number => {
    const pair = output.timestampPair();
    if (pair === null) {
      // The repeat was asked for `scheduleLeadMs` before its start, which is about now.
      return outcome.endMs - outcome.startMs + calibrationRepeatGapMs;
    }
    const audioClockNowMs =
      pair.audioClockMs + (timer.now() - pair.performanceMs);
    return Math.max(
      0,
      outcome.endMs + calibrationRepeatGapMs - scheduleLeadMs - audioClockNowMs,
    );
  };

  const playNext = (): void => {
    handle = null;
    if (!playing) {
      return;
    }
    const outcome = output.playCalibrationRepeat({
      requestedSettingDb: targetSettingDb,
      random,
    });
    if (outcome.kind === "refused") {
      repeatRefusal = outcome.reason;
      if (outcome.reason === "busy") {
        handle = timer.setTimeout(playNext, calibrationRepeatGapMs);
      } else {
        playing = false;
      }
      notify();
      return;
    }
    repeatRefusal = null;
    playedSettingDb = outcome.settingDb;
    atTop = outcome.atTop;
    if (outcome.settingDb >= calibrationSettingKeepMinDb) {
      volumeHighShown = false;
    }
    handle = timer.setTimeout(playNext, delayAfter(outcome));
    notify();
  };

  output.onStop((event) => {
    cancelNext();
    // A device change forgets the kept calibration in the shell, so it is forgotten here too (D18).
    const forgetKept = event.reason === "deviceChanged" && kept !== null;
    if (forgetKept) {
      kept = null;
    }
    if (playing || forgetKept) {
      playing = false;
      notify();
    }
  });

  const limitTarget = (settingDb: number): number =>
    Math.min(topSettingDb, Math.max(calibrationSettingMinDb, settingDb));

  const line = (): string => {
    if (kept !== null) {
      return calibrationCopy.keptLine;
    }
    if (volumeHighShown) {
      return calibrationCopy.systemVolumeHighLine;
    }
    if (atTop) {
      return calibrationCopy.atTopLine;
    }
    return calibrationCopy.openLine;
  };

  const controller: CalibrationController = {
    open() {
      cancelNext();
      output.beginCalibration();
      playing = true;
      targetSettingDb = calibrationSettingMinDb;
      playedSettingDb = null;
      atTop = false;
      repeatRefusal = null;
      keepRefusal = null;
      volumeHighShown = false;
      kept = null;
      playNext();
    },

    louder() {
      targetSettingDb = limitTarget(
        Math.max(targetSettingDb, playedSettingDb ?? targetSettingDb) +
          calibrationSettingStepDb,
      );
      notify();
    },

    quieter() {
      targetSettingDb = limitTarget(
        (playedSettingDb ?? targetSettingDb) - calibrationSettingStepDb,
      );
      notify();
    },

    keep(): KeepOutcome {
      const outcome = output.keepCalibration();
      if (outcome.kind === "kept") {
        cancelNext();
        playing = false;
        keepRefusal = null;
        volumeHighShown = false;
        kept = Object.freeze({
          settingDb: outcome.settingDb,
          rangeReport: outcome.rangeReport,
        });
      } else {
        keepRefusal = outcome.reason;
        if (outcome.reason === "systemVolumeHigh") {
          volumeHighShown = true;
        }
      }
      notify();
      return outcome;
    },

    close() {
      cancelNext();
      if (playing) {
        playing = false;
        notify();
      }
    },

    snapshot: (): CalibrationSnapshot =>
      Object.freeze({
        playing,
        targetSettingDb,
        playedSettingDb,
        atTop,
        line: line(),
        repeatRefusal,
        keepRefusal,
        kept,
      }),

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return Object.freeze(controller);
}

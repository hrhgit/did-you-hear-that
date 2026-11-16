import { audioOutputConfig } from "../config/audio-output-config";
import type { RandomSource } from "../config/seeded-random";
import type { Timer, TimerHandle } from "../config/timer";
import { calibrationCopy } from "../copy/calibration-copy";
import { calibrationSettingTopDb } from "../audio/output/calibration-setting-top";
import type {
  AudioOutput,
  CalibrationMusicOutput,
  CalibrationRepeatOutcome,
  CalibrationSound,
  KeepOutcome,
  KeepRefusal,
  PlayRefusal,
} from "../audio/output/create-audio-output";
import type { RangeReport } from "../audio/output/range-report";
import { calibrationTargetSettingDb } from "./calibration-target-setting";

/** What the calibration screen shows (design.md, "The calibration controller"). */
export interface CalibrationSnapshot {
  /** Whether the calibration sound is playing: the music, or repeats one after another. */
  readonly playing: boolean;
  /** The setting the next repeat asks for, or the music moves to. The shell may play a lower one. */
  readonly targetSettingDb: number;
  /**
   * The setting of the last repeat played, or the setting the music has reached, or null before
   * the first. The visible control shows this, so it never shows a setting that was not played
   * (R16.11). The music's steps lie between grid settings.
   */
  readonly playedSettingDb: number | null;
  /** Whether the last repeat or step played at the top of the control (R16.7). */
  readonly atTop: boolean;
  /** What this calibration plays: the shell's Calibration_Sound (audible-start R4.5). */
  readonly calibrationSound: CalibrationSound;
  /** The top of the control for that sound: −5 dB with the music, −4 dB with the hiss (D7). */
  readonly controlTopDb: number;
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
    /** The sound it was set with (audible-start R8.4). */
    readonly anchor: "music" | "hiss";
  } | null;
}

export interface CalibrationController {
  /**
   * Begins a calibration in the shell and starts its sound at once, at the bottom of the control
   * (R16.1): the music while the shell's Calibration_Sound is `music`, the repeats while it is
   * `hiss`. While it is `loading`, the start is remembered and the sound starts when loading ends,
   * if the calibration is still open (audible-start R4.6). Call it from the visitor's press. A
   * calibration under way starts again.
   */
  open(): void;
  /** Moves the target one step up from the higher of the target and the played setting. */
  louder(): void;
  /** Moves the target one step down from the setting last played. */
  quieter(): void;
  /**
   * Puts the target at `settingDb`, rounded down to the control's grid and held within the
   * control (audible-start R3.2 to R3.4, D1). NaN or a value that is not a number changes
   * nothing. The repeats still start at the bottom and rise by at most `calibrationRiseMaxDb` per
   * repeat towards the target. Before `open`, the target changes, and `open` puts it at the
   * bottom (D3).
   */
  setTarget(settingDb: number): void;
  /** Keeps the setting last played, if the shell allows it (R16.4 to R16.6). Stops the music. */
  keep(): KeepOutcome;
  /** Stops playing repeats or the music. The calibration stays open in the shell. */
  close(): void;
  snapshot(): CalibrationSnapshot;
  /** Called after every change of the snapshot. Returns the function that removes it. */
  onChange(listener: () => void): () => void;
}

/**
 * Plays the calibration sound while the calibration screen is open and the shell is running
 * (audible-start design.md, "The calibration music"). With the music, it starts the shell's loop
 * and hands it every target; the shell moves the level a step at a time and reports each step.
 * With the hiss, it plays calibration repeats one after another, with `calibrationRepeatGapMs` of
 * silence between the end of one and the start of the next, by the injected timer (R16.11).
 *
 * The end of each repeat is on the audio clock. The controller relates it to the timer through
 * the shell's timestamp pair, whose page time is on the same clock as the system timer. Any stop
 * ends the sound, and only a new `open` starts it again, from the bottom of the control (D47).
 *
 * An output without the music's calls, as a test's stand-in may be, has the hiss as its only
 * calibration sound.
 */
export function createCalibrationController(options: {
  output: AudioOutput & Partial<CalibrationMusicOutput>;
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
  const listeners = new Set<() => void>();

  let playing = false;
  /** Whether the music is the sound playing now. */
  let musicPlaying = false;
  /** Whether `open` came while the music was loading, and the sound waits for it. */
  let waitingForSound = false;
  let handle: TimerHandle | null = null;
  let targetSettingDb = calibrationSettingMinDb;
  let playedSettingDb: number | null = null;
  let playedSound: "music" | "hiss" | null = null;
  let atTop = false;
  let repeatRefusal: PlayRefusal | null = null;
  let keepRefusal: KeepRefusal | null = null;
  let volumeHighShown = false;
  let kept: CalibrationSnapshot["kept"] = null;

  /** The shell's Calibration_Sound; the hiss for an output without the music's calls. */
  const sound = (): CalibrationSound =>
    output.calibrationSound === undefined ? "hiss" : output.calibrationSound();
  /** The top of the control for the sound in use (D7). */
  const topDb = (): number =>
    output.calibrationControlTopDb === undefined
      ? calibrationSettingTopDb()
      : output.calibrationControlTopDb();

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

  const stopMusic = (): void => {
    if (musicPlaying) {
      musicPlaying = false;
      output.stopCalibrationMusic?.();
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
    playedSound = "hiss";
    atTop = outcome.atTop;
    if (outcome.settingDb >= calibrationSettingKeepMinDb) {
      volumeHighShown = false;
    }
    handle = timer.setTimeout(playNext, delayAfter(outcome));
    notify();
  };

  /** Starts the music's loop; on `busy`, tries again after `calibrationRepeatGapMs`, as repeats do. */
  const startMusic = (): void => {
    handle = null;
    if (!playing || output.startCalibrationMusic === undefined) {
      return;
    }
    const outcome = output.startCalibrationMusic();
    if (outcome.kind === "refused") {
      if (outcome.reason === "notReady") {
        // The music cannot be played after all: the shell has turned to the hiss.
        playNext();
        return;
      }
      repeatRefusal = outcome.reason;
      if (outcome.reason === "busy") {
        handle = timer.setTimeout(startMusic, calibrationRepeatGapMs);
      } else {
        playing = false;
      }
      notify();
      return;
    }
    repeatRefusal = null;
    musicPlaying = true;
    playedSettingDb = outcome.settingDb;
    playedSound = "music";
    atTop = outcome.settingDb >= topDb();
    output.setCalibrationMusicTarget?.(targetSettingDb);
    notify();
  };

  /**
   * Starts the sound of the calibration, or waits for the music while it loads. A shell that does
   * not run refuses the repeat, as it did before the music, whatever its Calibration_Sound.
   */
  const startSound = (): void => {
    const current = sound();
    if (current === "loading" && output.state().kind === "running") {
      waitingForSound = true;
      playing = false;
      return;
    }
    waitingForSound = false;
    playing = true;
    if (current === "music") {
      startMusic();
    } else {
      playNext();
    }
  };

  output.onStop((event) => {
    cancelNext();
    waitingForSound = false;
    musicPlaying = false;
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

  output.onCalibrationMusicStep?.((settingDb) => {
    if (!musicPlaying) {
      return;
    }
    playedSettingDb = settingDb;
    atTop = settingDb >= topDb();
    if (settingDb >= calibrationSettingKeepMinDb) {
      volumeHighShown = false;
    }
    notify();
  });

  /** The control's grid, up to the top of the sound in use. */
  const control = () =>
    Object.freeze({
      bottomDb: calibrationSettingMinDb,
      topDb: topDb(),
      stepDb: calibrationSettingStepDb,
    });
  /**
   * Puts the target at a setting through `calibrationTargetSettingDb`, the one rule for every way
   * the target moves (audible-start D2), and says whether it was taken. The music follows it.
   */
  const moveTarget = (settingDb: number): boolean => {
    const nextDb = calibrationTargetSettingDb(settingDb, control());
    if (nextDb === null) {
      return false;
    }
    targetSettingDb = nextDb;
    if (musicPlaying) {
      output.setCalibrationMusicTarget?.(targetSettingDb);
    }
    return true;
  };

  output.onCalibrationSoundChange?.(() => {
    // The top may have moved, from the hiss's to the music's: the target stays within it.
    moveTarget(targetSettingDb);
    if (waitingForSound) {
      waitingForSound = false;
      if (output.state().kind === "running") {
        startSound();
      }
    }
    notify();
  });

  const line = (): string => {
    const lines = sound() === "hiss" ? calibrationCopy.hiss : calibrationCopy;
    if (kept !== null) {
      return calibrationCopy.keptLine;
    }
    if (volumeHighShown) {
      return lines.systemVolumeHighLine;
    }
    if (sound() === "loading") {
      return calibrationCopy.loadingLine;
    }
    if (atTop) {
      return lines.atTopLine;
    }
    return lines.openLine;
  };

  const controller: CalibrationController = {
    open() {
      cancelNext();
      stopMusic();
      output.beginCalibration();
      targetSettingDb = calibrationSettingMinDb;
      playedSettingDb = null;
      playedSound = null;
      atTop = false;
      repeatRefusal = null;
      keepRefusal = null;
      volumeHighShown = false;
      kept = null;
      startSound();
      if (waitingForSound) {
        notify();
      }
    },

    louder() {
      moveTarget(
        Math.max(targetSettingDb, playedSettingDb ?? targetSettingDb) +
          calibrationSettingStepDb,
      );
      notify();
    },

    quieter() {
      moveTarget(
        (playedSettingDb ?? targetSettingDb) - calibrationSettingStepDb,
      );
      notify();
    },

    setTarget(settingDb) {
      if (moveTarget(settingDb)) {
        notify();
      }
    },

    keep(): KeepOutcome {
      const outcome = output.keepCalibration();
      if (outcome.kind === "kept") {
        cancelNext();
        // The shell has stopped the music on keeping; this makes sure of it.
        stopMusic();
        playing = false;
        waitingForSound = false;
        keepRefusal = null;
        volumeHighShown = false;
        kept = Object.freeze({
          settingDb: outcome.settingDb,
          rangeReport: outcome.rangeReport,
          anchor: playedSound ?? (sound() === "music" ? "music" : "hiss"),
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
      stopMusic();
      waitingForSound = false;
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
        calibrationSound: sound(),
        controlTopDb: topDb(),
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

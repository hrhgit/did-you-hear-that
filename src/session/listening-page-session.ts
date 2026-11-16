import { hearingMethodConfig } from "../config/hearing-method-config";
import type { RandomSource } from "../config/seeded-random";
import type { GhostSoundId, SoundId } from "../config/sound-id";
import { ghostSoundIds, soundIds } from "../config/sound-id";
import type { Timer } from "../config/timer";
import { roomsShortLine } from "../copy/calibration-copy";
import { headphoneCheckCopy } from "../copy/headphone-check-copy";
import { outputStateCopy } from "../copy/output-state-copy";
import type { AudioBackend } from "../audio/output/audio-backend";
import type {
  ActivateResult,
  ClampLogEntry,
  PlayOutcome,
} from "../audio/output/create-audio-output";
import { createAudioOutput } from "../audio/output/create-audio-output";
import type { Ear, OutputState } from "../audio/output/output-types";
import type { RangeReport } from "../audio/output/range-report";
import type { BrowserWindow } from "../audio/output/web-audio-backend";
import { createWebAudioBackend } from "../audio/output/web-audio-backend";
import type { CalibrationSnapshot } from "./calibration-controller";
import { createCalibrationController } from "./calibration-controller";
import type { HeadphoneCheckAnswer } from "./judge-headphone-check";
import { judgeHeadphoneCheck } from "./judge-headphone-check";
import { roomSearchCapDb } from "./room-search-cap";

export type { CalibrationSnapshot } from "./calibration-controller";
export type { HeadphoneCheckAnswer } from "./judge-headphone-check";
export type { Ear } from "../audio/output/output-types";

/** The last sound a row played, or tried to. */
export interface RowPlay {
  readonly ear: Ear;
  readonly outcome: PlayOutcome;
}

/** One row of the Sounds section (R19.4, R19.6). */
export interface SoundRowSnapshot {
  readonly soundId: SoundId;
  /** The level the next play of this row asks for. */
  readonly levelDb: number;
  /** The lowest level of the row's control: `floorDb`. */
  readonly lowestLevelDb: number;
  /** The highest level of the row's control: the room top rounded down to the Level_Grid. */
  readonly highestLevelDb: number;
  /** The room top, exactly as the Range_Report gives it. */
  readonly roomTopLevelDb: number;
  /**
   * The Playable_Floor, exactly as the Range_Report gives it (audible-start D23). The row's control
   * still goes down to `floorDb`, below it, so that a listening session can find where the
   * headphones stop playing (audible-start Q39).
   */
  readonly playableFloorLevelDb: number;
  readonly lastPlay: RowPlay | null;
}

/** Everything the listening page draws (design.md, "The listening page"). */
export interface ListeningPageSnapshot {
  /** The seed of the page's random source (R19.7). */
  readonly seed: number;
  readonly outputState: OutputState;
  readonly sampleRateHz: number | null;
  /** The line for a stopped or unsupported state, or null. */
  readonly stateLine: string | null;
  /** Whether the last press of Start was refused because no gesture was active. */
  readonly activationRefused: boolean;
  readonly calibration: CalibrationSnapshot;
  /** The Range_Report of the kept calibration, or null while none is kept. */
  readonly rangeReport: RangeReport | null;
  /** The line of R16.9 for the five ghost rooms, or null while no calibration is kept. */
  readonly roomsLine: string | null;
  readonly headphoneCheck: {
    readonly lastPlay: PlayOutcome | null;
    /** The line for the last answer, or null before one. */
    readonly answerLine: string | null;
  };
  /** One row per sound, in floor order, then the calibration noise. Empty until a keep. */
  readonly rows: readonly SoundRowSnapshot[];
  readonly clampLog: readonly ClampLogEntry[];
}

/** The listening page's state and actions. The page's drawing lives in `src/ui` (D26). */
export interface ListeningPageSession {
  snapshot(): ListeningPageSnapshot;
  /** Called after every change. Returns the function that removes it. */
  subscribe(listener: (snapshot: ListeningPageSnapshot) => void): () => void;
  /**
   * Starts sound, or starts it again after a stop. Call it from inside the click handler, with no
   * `await` before it: the shell makes its backend calls before this returns (R4.2, D23).
   */
  start(): Promise<ActivateResult>;
  /** The Visible_Stop_Control. */
  stopAll(): void;
  startCalibration(): void;
  quieter(): void;
  louder(): void;
  keepCalibration(): void;
  playHeadphoneCheck(): void;
  answerHeadphoneCheck(answer: HeadphoneCheckAnswer): void;
  levelDown(soundId: SoundId): void;
  levelUp(soundId: SoundId): void;
  play(soundId: SoundId, ear: Ear): void;
}

export type ListeningPageSessionOptions = {
  readonly timer: Timer;
  readonly random: RandomSource;
} & (
  | { readonly window: BrowserWindow }
  /** For tests: a backend used in place of the one built from a window. */
  | { readonly backend: AudioBackend }
);

interface RowState {
  levelDb: number;
  lastPlay: RowPlay | null;
}

/**
 * Creates the listening page's session (R19.4 to R19.9, D26, D27). It builds the Web Audio
 * backend from the window it is given, the output shell and the calibration controller, and
 * gives the page a snapshot and actions. Every sound goes through the shell.
 *
 * The page is one Room_Span: it never calls `beginRoom`, so every sound on an ear is limited by
 * the last one on that ear, across rows (D27).
 *
 * It calibrates as the visit does (audible-start Q34): the controller plays the calibration music
 * the shell loads in the first `start`, or the hiss repeats where the music cannot be loaded, and
 * the snapshot's calibration gives which.
 */
export function createListeningPageSession(
  options: ListeningPageSessionOptions,
): ListeningPageSession {
  const { timer, random } = options;
  const { floorDb, startingLevelDb, upwardStepDb, capRelativeToAnchorDb } =
    hearingMethodConfig;
  const backend =
    "backend" in options
      ? options.backend
      : createWebAudioBackend(options.window);
  const output = createAudioOutput({ backend, timer });
  const calibration = createCalibrationController({ output, timer, random });
  const listeners = new Set<(snapshot: ListeningPageSnapshot) => void>();

  let activationRefused = false;
  let headphoneCheckPlay: PlayOutcome | null = null;
  let headphoneCheckAnswerLine: string | null = null;
  /** Row levels and last plays, started afresh by every keep. Null while none is kept. */
  let rows: Map<SoundId, RowState> | null = null;

  const highestLevelOf = (report: RangeReport, soundId: SoundId): number =>
    roomSearchCapDb(report.rooms[soundId].topLevelDb, hearingMethodConfig);

  const freshRows = (report: RangeReport): Map<SoundId, RowState> =>
    new Map(
      soundIds.map((soundId) => [
        soundId,
        {
          levelDb: Math.min(startingLevelDb, highestLevelOf(report, soundId)),
          lastPlay: null,
        },
      ]),
    );

  /** The rows of the kept calibration, or null, and forgotten with it. */
  const currentRows = (
    report: RangeReport | null,
  ): Map<SoundId, RowState> | null => {
    if (report === null) {
      rows = null;
    } else if (rows === null) {
      rows = freshRows(report);
    }
    return rows;
  };

  const roomsLineOf = (report: RangeReport): string => {
    const shortCount = ghostSoundIds.filter(
      (soundId: GhostSoundId) =>
        highestLevelOf(report, soundId) < capRelativeToAnchorDb,
    ).length;
    return roomsShortLine(shortCount, ghostSoundIds.length);
  };

  const stateLineOf = (state: OutputState): string | null => {
    switch (state.kind) {
      case "stopped":
        return outputStateCopy.stoppedLines[state.reason];
      case "unsupported":
        return outputStateCopy.unsupportedLines[state.reason];
      default:
        return null;
    }
  };

  const snapshot = (): ListeningPageSnapshot => {
    const report = output.rangeReport();
    const rowStates = currentRows(report);
    const outputState = output.state();
    return Object.freeze({
      seed: random.seed,
      outputState,
      sampleRateHz: output.sampleRateHz(),
      stateLine: stateLineOf(outputState),
      activationRefused,
      calibration: calibration.snapshot(),
      rangeReport: report,
      roomsLine: report === null ? null : roomsLineOf(report),
      headphoneCheck: Object.freeze({
        lastPlay: report === null ? null : headphoneCheckPlay,
        answerLine: report === null ? null : headphoneCheckAnswerLine,
      }),
      rows:
        report === null || rowStates === null
          ? Object.freeze([])
          : Object.freeze(
              soundIds.map((soundId): SoundRowSnapshot => {
                const row = rowStates.get(soundId) as RowState;
                return Object.freeze({
                  soundId,
                  levelDb: row.levelDb,
                  lowestLevelDb: floorDb,
                  highestLevelDb: highestLevelOf(report, soundId),
                  roomTopLevelDb: report.rooms[soundId].topLevelDb,
                  playableFloorLevelDb: report.rooms[soundId].floorLevelDb,
                  lastPlay: row.lastPlay,
                });
              }),
            ),
      clampLog: output.clampLog(),
    });
  };

  const notify = (): void => {
    const current = snapshot();
    for (const listener of [...listeners]) {
      listener(current);
    }
  };

  calibration.onChange(notify);
  output.onStop(notify);
  output.onUnsupported(notify);

  const rowOf = (soundId: SoundId): RowState | null => {
    const rowStates = currentRows(output.rangeReport());
    return rowStates?.get(soundId) ?? null;
  };

  const moveLevel = (soundId: SoundId, steps: 1 | -1): void => {
    const report = output.rangeReport();
    const row = rowOf(soundId);
    if (report === null || row === null) {
      return;
    }
    row.levelDb = Math.min(
      highestLevelOf(report, soundId),
      Math.max(floorDb, row.levelDb + steps * upwardStepDb),
    );
    notify();
  };

  const session: ListeningPageSession = {
    snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start() {
      // The shell's backend calls happen inside this call, before anything is awaited (D23).
      const activation = output.activate();
      notify();
      return activation.then((result) => {
        activationRefused = result.kind === "refused";
        notify();
        return result;
      });
    },

    stopAll() {
      output.stopAll();
      notify();
    },

    startCalibration() {
      headphoneCheckPlay = null;
      headphoneCheckAnswerLine = null;
      calibration.open();
      notify();
    },

    quieter: () => calibration.quieter(),
    louder: () => calibration.louder(),

    keepCalibration() {
      const outcome = calibration.keep();
      if (outcome.kind === "kept") {
        rows = freshRows(outcome.rangeReport);
      }
      notify();
    },

    playHeadphoneCheck() {
      headphoneCheckPlay = output.playHeadphoneCheck(random);
      headphoneCheckAnswerLine = null;
      notify();
    },

    answerHeadphoneCheck(answer) {
      headphoneCheckAnswerLine =
        headphoneCheckCopy.judgementLines[judgeHeadphoneCheck(answer)];
      notify();
    },

    levelDown: (soundId) => moveLevel(soundId, -1),
    levelUp: (soundId) => moveLevel(soundId, 1),

    play(soundId, ear) {
      const row = rowOf(soundId);
      if (row === null) {
        return;
      }
      row.lastPlay = Object.freeze({
        ear,
        outcome: output.play({
          soundId,
          ear,
          levelDb: row.levelDb,
          purpose: "listening",
          random,
        }),
      });
      notify();
    },
  };
  return Object.freeze(session);
}

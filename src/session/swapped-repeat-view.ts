import { differenceLabel } from "../copy/result-lines";
import { pitchLabel, roomCopy, roomNames } from "../copy/room-copy";
import { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import { readyLines } from "../copy/swapped-repeat-lines";
import { swappedRepeatComparison } from "./swapped-repeat-comparison";
import type {
  EarpieceState,
  PlayRefusal,
  RoomSummary,
  SwapCheckJudgement,
  SwappedRepeat,
  SwappedRepeatEnding,
  SwappedRepeatPauseReason,
  SwappedRepeatPhase,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
} from "./visit-flow-types";

/** The state of one visit to the swapped repeat that its view is made from. */
export interface SwappedRepeatViewInput {
  /** The floor's first run, as the summary gives it. */
  readonly roomSummary: RoomSummary;
  readonly phase: SwappedRepeatPhase;
  /** What the flow knows of the earpieces now. */
  readonly earpieces: EarpieceState;
  /** Why the repeat cannot run. Read only in `unavailable`, where it is required. */
  readonly unavailable: SwappedRepeatUnavailableReason | null;
  /** The instruction is shown again after a check heard on the left. Read only in `instruction`. */
  readonly again: boolean;
  /** A played check waits for its answer. Read only in `check`. */
  readonly awaitingAnswer: boolean;
  /** Why the last press of play did not play the check, or null. Read only in `check`. */
  readonly playRefusal: PlayRefusal | null;
  /** The judgement of the last answered check, or null. Read only in `check`. */
  readonly judgement: SwapCheckJudgement | null;
  /** The last check was cut off by a hidden page or an interruption. Read only in `check`. */
  readonly cut: boolean;
  /** The number of this repeat's room run. Read only in `room`. */
  readonly runNumber: number;
  /** The reason of the pause that holds, or null. Read only in `room`. */
  readonly pauseReason: SwappedRepeatPauseReason | null;
  /** How the repeat ended. Read only in `finished`, where it is required. */
  readonly ending: SwappedRepeatEnding | null;
  /** The record of the run. Read only in `finished` with the ending `finished`, where it is required. */
  readonly record: SwappedRepeatRun | null;
  /** The quietest level of the floor's scale, for the depths of the Comparison. */
  readonly floorDb: number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

/**
 * The view of one moment of the swapped repeat: everything the screen shows and says in the stage
 * `swappedRepeat` (swapped-repeat design.md, "`swappedRepeatView(input)`", R3 to R6, R11, R14,
 * D18, D19). Every string comes from `src/copy`: the fixed strings from `swappedRepeatCopy`, the
 * ready lines from `swapped-repeat-lines.ts`, the room's name, pitch and the two answers from
 * `room-copy.ts` (the answers are `roomCopy.answers` itself, the labels of every room), the first
 * run's difference from `differenceLabel`, and in `finished` the Comparison of
 * `swappedRepeatComparison`. Each phase reads only its own fields of the input; in `room` the view
 * depends on the floor, the earpieces, the run number and the pause alone, so it cannot change
 * while a trial waits to be scored. Throws a `RangeError` for `unavailable` without a reason,
 * `finished` without an ending, or the ending `finished` without a record. A pure function: the
 * view is deeply frozen plain data, and equal inputs give equal views.
 */
export function swappedRepeatView(
  input: SwappedRepeatViewInput,
): SwappedRepeat {
  const { roomSummary, phase } = input;
  const { room } = roomSummary;
  const base = {
    heading: swappedRepeatCopy.heading,
    roomName: roomNames[room.roomId],
    pitchLabel: pitchLabel(room.frequencyHz),
    firstDifferenceLabel: differenceLabel(roomSummary.rightMinusLeftDb),
    earpieces: input.earpieces,
    stopLabel: swappedRepeatCopy.stopButton,
    backLabel: swappedRepeatCopy.backButton,
  };
  switch (phase) {
    case "unavailable": {
      const reason = input.unavailable;
      if (reason === null) {
        throw new RangeError("An unavailable repeat needs its reason.");
      }
      return deepFreeze({
        ...base,
        phase,
        reason,
        line: swappedRepeatCopy.unavailableLines[reason],
      });
    }
    case "instruction":
      return deepFreeze({
        ...base,
        phase,
        lines: swappedRepeatCopy.instructionLines,
        againLine: input.again ? swappedRepeatCopy.againLine : null,
        confirmLabel: swappedRepeatCopy.confirmButton,
      });
    case "check": {
      const judgement =
        input.judgement === "bothSides" || input.judgement === "notHeard"
          ? input.judgement
          : null;
      return deepFreeze({
        ...base,
        phase,
        question: swappedRepeatCopy.question,
        answers: swappedRepeatCopy.answers,
        playLabel: swappedRepeatCopy.playCheckButton,
        awaitingAnswer: input.awaitingAnswer,
        playRefusal: input.playRefusal,
        playRefusalLine:
          input.playRefusal === null ? null : swappedRepeatCopy.playRefusedLine,
        judgement,
        judgementLine:
          judgement === null
            ? null
            : swappedRepeatCopy.judgementLines[judgement],
        cutLine: input.cut ? swappedRepeatCopy.cutLine : null,
      });
    }
    case "ready":
      return deepFreeze({
        ...base,
        phase,
        judgementLine: swappedRepeatCopy.judgementLines.confirmed,
        lines: readyLines(room.roomId, room.frequencyHz),
        startLabel: swappedRepeatCopy.startButton,
      });
    case "room":
      return deepFreeze({
        ...base,
        phase,
        runNumber: input.runNumber,
        answers: roomCopy.answers,
        pauseLabel: swappedRepeatCopy.pauseButton,
        pauseLine:
          input.pauseReason === null
            ? null
            : swappedRepeatCopy.pauseLines[input.pauseReason],
        resumeLabel: swappedRepeatCopy.resumeButton,
      });
    case "finished": {
      const { ending, record } = input;
      if (ending === null) {
        throw new RangeError("A finished repeat needs its ending.");
      }
      if (ending === "finished" && record === null) {
        throw new RangeError(
          "A repeat that ran to its end needs its record for the comparison.",
        );
      }
      return deepFreeze({
        ...base,
        phase,
        ending,
        endLine: swappedRepeatCopy.endLines[ending],
        comparison:
          ending === "finished" && record !== null
            ? swappedRepeatComparison(roomSummary, record, input.floorDb)
            : null,
        turnBackLine: swappedRepeatCopy.turnBackLine,
      });
    }
    default:
      throw new RangeError(`Unknown repeat phase ${String(phase)}.`);
  }
}

import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import type {
  SwappedRepeat,
  SwappedRepeatComparison,
  SwappedRepeatComparisonWing,
  SwappedRepeatSnapshot,
  VisitLog,
  VisitRoom,
  VisitSummary,
} from "../../src/session/visit-flow-types";

// Moments of a swapped repeat, written out by hand. The page draws a snapshot from the words and
// numbers it holds and from nothing else, so a browser test can hand it any moment without
// walking a visit. The words are the fixed copy where there is one, and plain stand-ins where the
// visit flow would compose a line. Nothing here says what the visit flow does.

const rooms: readonly VisitRoom[] = [
  { roomIndex: 0, roomId: "corridor", frequencyHz: 1000 },
  { roomIndex: 1, roomId: "nursery", frequencyHz: 2000 },
  { roomIndex: 2, roomId: "stairs", frequencyHz: 4000 },
];
const stairs = rooms[2] as VisitRoom;

const viewBase = {
  heading: swappedRepeatCopy.heading,
  roomName: "Stairs",
  pitchLabel: "4 kHz",
  firstDifferenceLabel: "20 dB quieter on the left",
  stopLabel: swappedRepeatCopy.stopButton,
  backLabel: swappedRepeatCopy.backButton,
} as const;

function snapshotOf(
  repeat: SwappedRepeat,
  pause: SwappedRepeatSnapshot["pause"] = null,
): SwappedRepeatSnapshot {
  return {
    stage: "swappedRepeat",
    visitType: "quick",
    rooms,
    finishedRoomCount: rooms.length,
    canProceed: true,
    pause,
    activationRefused: false,
    room: stairs,
    visitLog: {} as VisitLog,
    summary: {} as VisitSummary,
    repeat,
  };
}

function wing(
  ear: "left" | "right",
  earpiece: "left" | "right",
  thresholdDb: number | null,
  lightDepthFraction: number | null,
): SwappedRepeatComparisonWing {
  return {
    ear,
    earpiece,
    earpieceLabel: swappedRepeatCopy.earpieceLabels[earpiece],
    state: thresholdDb === null ? "unreliable" : "found",
    thresholdDb,
    lightDepthFraction,
    line:
      thresholdDb === null
        ? "The house could not find a level here."
        : `Caught down to ${String(thresholdDb)} dB below your setting.`,
    reasonLine:
      thresholdDb === null
        ? "The answers on this side did not agree with each other."
        : null,
  };
}

/** The same ear needed the louder sound both times. */
export const followsEarComparison: SwappedRepeatComparison = {
  roomIndex: 2,
  runNumber: 1,
  heading: swappedRepeatCopy.comparisonHeading,
  runs: [
    {
      arrangement: "asMarked",
      label: swappedRepeatCopy.runLabels.asMarked,
      left: wing("left", "left", -40, 0.82),
      right: wing("right", "right", -20, 0.36),
      rightMinusLeftDb: 20,
      differenceLabel: "20 dB quieter on the left",
    },
    {
      arrangement: "swapped",
      label: swappedRepeatCopy.runLabels.swapped,
      left: wing("left", "right", -40, 0.82),
      right: wing("right", "left", -25, 0.48),
      rightMinusLeftDb: 15,
      differenceLabel: "15 dB quieter on the left",
    },
  ],
  outcome: "followsEar",
  unclearReason: null,
  outcomeLabel: swappedRepeatCopy.outcomeLabels.followsEar,
  outcomeLines: [
    "Both times your right ear needed the louder sound, whichever earpiece was on it.",
    "That points at the ear and not at the headphones. This house is not a hearing test. If the difference worries you, see a hearing professional.",
  ],
  description:
    "Stairs, 4 kHz, both ways round. Headphones as marked: left ear 40 dB below your setting, right ear 20 dB below. Headphones swapped: left ear 40 dB below, right ear 25 dB below. The difference stayed with your ears.",
};

/** The same earpiece needed the louder sound both times. */
export const followsEarpieceComparison: SwappedRepeatComparison = {
  ...followsEarComparison,
  runs: [
    followsEarComparison.runs[0],
    {
      arrangement: "swapped",
      label: swappedRepeatCopy.runLabels.swapped,
      left: wing("left", "right", -20, 0.36),
      right: wing("right", "left", -40, 0.82),
      rightMinusLeftDb: -20,
      differenceLabel: "20 dB quieter on the right",
    },
  ],
  outcome: "followsEarpiece",
  outcomeLabel: swappedRepeatCopy.outcomeLabels.followsEarpiece,
  outcomeLines: [
    "Both times the right earpiece needed the louder sound, whichever ear it was on.",
    "That points at the headphones and not at your ears.",
  ],
  description:
    "Stairs, 4 kHz, both ways round. The difference moved with the headphones.",
};

/** An ear of the repeat has no level. */
export const unclearComparison: SwappedRepeatComparison = {
  ...followsEarComparison,
  runs: [
    followsEarComparison.runs[0],
    {
      arrangement: "swapped",
      label: swappedRepeatCopy.runLabels.swapped,
      left: wing("left", "right", -40, 0.82),
      right: wing("right", "left", null, null),
      rightMinusLeftDb: null,
      differenceLabel: "–",
    },
  ],
  outcome: "unclear",
  unclearReason: "noLevel",
  outcomeLabel: swappedRepeatCopy.outcomeLabels.unclear,
  outcomeLines: [
    "The second time the house found no level for one ear, so the two runs cannot be set against each other.",
  ],
  description:
    "Stairs, 4 kHz, both ways round. The second run has no level for the right ear. Not clear.",
};

const checkBase = {
  ...viewBase,
  phase: "check",
  earpieces: "unknown",
  question: swappedRepeatCopy.question,
  answers: headphoneCheckCopy.answers,
  playLabel: swappedRepeatCopy.playCheckButton,
  awaitingAnswer: false,
  playRefusal: null,
  playRefusalLine: null,
  judgement: null,
  judgementLine: null,
  cutLine: null,
} as const;

const roomView = {
  ...viewBase,
  phase: "room",
  earpieces: "swapped",
  runNumber: 1,
  answers: {
    left: { name: "Left", hint: "Left" },
    right: { name: "Right", hint: "Right" },
  },
  pauseLabel: swappedRepeatCopy.pauseButton,
  pauseLine: null,
  resumeLabel: swappedRepeatCopy.resumeButton,
} as const;

function finished(
  comparison: SwappedRepeatComparison | null,
  ending: "finished" | "deviceChanged" | "soundRefused" = "finished",
): SwappedRepeatSnapshot {
  return snapshotOf({
    ...viewBase,
    phase: "finished",
    earpieces: "unknown",
    ending,
    endLine: swappedRepeatCopy.endLines[ending],
    comparison,
    turnBackLine: swappedRepeatCopy.turnBackLine,
  });
}

/** One snapshot for every moment of a swapped repeat the page draws differently. */
export const swappedRepeatMoments = {
  unavailable: snapshotOf({
    ...viewBase,
    phase: "unavailable",
    earpieces: "asMarked",
    reason: "calibrationGone",
    line: swappedRepeatCopy.unavailableLines.calibrationGone,
  }),
  instruction: snapshotOf({
    ...viewBase,
    phase: "instruction",
    earpieces: "unknown",
    lines: swappedRepeatCopy.instructionLines,
    againLine: null,
    confirmLabel: swappedRepeatCopy.confirmButton,
  }),
  instructionAgain: snapshotOf({
    ...viewBase,
    phase: "instruction",
    earpieces: "unknown",
    lines: swappedRepeatCopy.instructionLines,
    againLine: swappedRepeatCopy.againLine,
    confirmLabel: swappedRepeatCopy.confirmButton,
  }),
  check: snapshotOf(checkBase),
  checkAwaiting: snapshotOf({ ...checkBase, awaitingAnswer: true }),
  checkBothSides: snapshotOf({
    ...checkBase,
    judgement: "bothSides",
    judgementLine: swappedRepeatCopy.judgementLines.bothSides,
  }),
  checkRefused: snapshotOf({
    ...checkBase,
    playRefusal: "busy",
    playRefusalLine: swappedRepeatCopy.playRefusedLine,
  }),
  checkCut: snapshotOf({ ...checkBase, cutLine: swappedRepeatCopy.cutLine }),
  ready: snapshotOf({
    ...viewBase,
    phase: "ready",
    earpieces: "swapped",
    judgementLine: swappedRepeatCopy.judgementLines.confirmed,
    lines: [
      "The house plays this room once more, at the levels it used the first time. Answer with the side you hear, as before.",
    ],
    startLabel: swappedRepeatCopy.startButton,
  }),
  room: snapshotOf(roomView),
  roomPaused: snapshotOf(
    { ...roomView, pauseLine: swappedRepeatCopy.pauseLines.visitor },
    { reason: "visitor" } as SwappedRepeatSnapshot["pause"],
  ),
  finishedFollowsEar: finished(followsEarComparison),
  finishedFollowsEarpiece: finished(followsEarpieceComparison),
  finishedUnclear: finished(unclearComparison),
  finishedDeviceChanged: finished(null, "deviceChanged"),
} as const;

export type SwappedRepeatMoment = keyof typeof swappedRepeatMoments;

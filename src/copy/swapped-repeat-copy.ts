import { calibrationCopy } from "./calibration-copy";
import { headphoneCheckCopy } from "./headphone-check-copy";
import { leavingCopy } from "./leaving-copy";
import { roomCopy } from "./room-copy";

/** Every fixed string of the swapped repeat (swapped-repeat design.md, "The copy"). */
export const swappedRepeatCopy = Object.freeze({
  heading: "This room again, with the headphones swapped",
  backButton: "Back to the picture",
  stopButton: "Stop the sounds",
  instructionLines: Object.freeze([
    "Take the headphones off and put them on the other way round: the left earpiece on your right ear, and the right earpiece on your left ear.",
    calibrationCopy.keptLine,
    "When they are on, the house plays a hiss in one earpiece, so that you can check the swap.",
  ]),
  againLine:
    "The hiss was on your left, so the headphones are still the way they were. Put the left earpiece on your right ear and the right earpiece on your left ear, then check again.",
  confirmButton: "They are swapped",
  // "Play the check"
  playCheckButton: headphoneCheckCopy.playButton,
  // "Which side was the hiss on?"
  question: headphoneCheckCopy.question,
  answers: headphoneCheckCopy.answers,
  /** The keys are the swap check's judgements that keep the visitor in the check, and `confirmed`. */
  judgementLines: Object.freeze({
    confirmed:
      "The hiss came from the left earpiece and you heard it on your right. The headphones are swapped.",
    bothSides: headphoneCheckCopy.judgementLines.bothSides,
    notHeard: headphoneCheckCopy.judgementLines.notHeard,
  }),
  cutLine: "The hiss was cut off. Play the check again.",
  playRefusedLine:
    "The house could not play the hiss just now. Try again in a moment.",
  startButton: "Go into the room",
  // "Pause"
  pauseButton: roomCopy.pauseButton,
  // "Go on"
  resumeButton: roomCopy.goOnButton,
  /** The keys are the repeat's pause reasons. */
  pauseLines: Object.freeze({
    visitor: leavingCopy.pauseLines.visitor,
    hidden: leavingCopy.pauseLines.hidden,
    interrupted: leavingCopy.pauseLines.interrupted,
  }),
  /** The keys are the unavailable reasons. */
  unavailableLines: Object.freeze({
    calibrationGone:
      "Your audio device changed after the rooms, so the house no longer has your calibration. This room cannot be visited again on this visit. Your picture has not changed.",
    calibrationChanged:
      "Your audio device changed after this room, so the house would play it with another calibration. This room cannot be visited again on this visit. Your picture has not changed.",
  }),
  /** The keys are the endings. */
  endLines: Object.freeze({
    finished: "That was this room again, with the headphones swapped.",
    deviceChanged:
      "Your audio device changed, so the house stopped the room. Your picture has not changed.",
    soundRefused:
      "The house could not play its sounds on this device, so it stopped the room. Your picture has not changed.",
  }),
  turnBackLine:
    "If the headphones are still swapped, turn them back now, so that the left earpiece is on your left ear.",
  comparisonHeading: "This room both ways round",
  /** The keys are the arrangements. */
  runLabels: Object.freeze({
    asMarked: "Headphones as marked",
    swapped: "Headphones swapped",
  }),
  /** The keys are the earpieces. */
  earpieceLabels: Object.freeze({
    left: "Left earpiece",
    right: "Right earpiece",
  }),
  /**
   * The letters printed on headphones, which the page draws on a small sketch of the swapped
   * headphones. The keys are the earpieces.
   */
  earpieceMarks: Object.freeze({ left: "L", right: "R" }),
  /** The keys are the outcomes. */
  outcomeLabels: Object.freeze({
    followsEar: "The difference stayed with your ears",
    followsEarpiece: "The difference moved with the headphones",
    unclear: "Not clear",
  }),
  /** What `save` says when it replaced a saved copy that lacked repeats (Q5, decided by the owner on 2026-11-15). */
  savedAgainLine: "The saved visit now holds the room you visited again.",
  /**
   * Shown beside the save control while `archive.savedCopyLacksRepeats` is true (the sub-question
   * of Q5, chosen by the owner's coordinator on 2026-11-15; the owner may reverse it).
   */
  savedCopyLacksLine:
    "The saved visit does not hold the room you visited again yet. Save again to add it.",
});

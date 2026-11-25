import { referenceVolumeCopy } from "./calibration-copy";

/**
 * Headings of the screens before the first room, and what the page says when the house cannot
 * play at all.
 */
export const visitCopy = Object.freeze({
  calibrationHeading: referenceVolumeCopy.heading,
  headphoneCheckHeading: "Left and right",
  recalibrateHeading: referenceVolumeCopy.againHeading,
  cannotPlayHeading: "The house cannot play here",
  /** Shown when the browser did not take a press as permission to start sound. */
  soundNotStartedLine:
    "The browser did not let the sound start. Press the button again.",
  /** Shown on the headphone check when the hiss could not be played. */
  checkNotPlayedLine: "The hiss could not be played just now. Press again.",
  goOnButton: "Go on",
  /** The name of the row of steps before the room, for a visitor who cannot see it. */
  stepsLabel: "Getting ready",
  steps: Object.freeze(["Left and right", "The rules", "The room"]),
});

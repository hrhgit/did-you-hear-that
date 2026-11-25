/**
 * Headings of the screens before the first room, and what the page says when the house cannot
 * play at all.
 */
export const visitCopy = Object.freeze({
  /** The same string as `calibrationCopy.heading` (audible-start design.md, "The calibration copy"). */
  calibrationHeading: "Set the music to a comfortable volume",
  headphoneCheckHeading: "Left and right",
  /** The same string as `calibrationCopy.againHeading`. */
  recalibrateHeading: "Set the music again",
  cannotPlayHeading: "The house cannot play here",
  /** Shown when the browser did not take a press as permission to start sound. */
  soundNotStartedLine:
    "The browser did not let the sound start. Press the button again.",
  /** Shown on the headphone check when the hiss could not be played. */
  checkNotPlayedLine: "The hiss could not be played just now. Press again.",
  goOnButton: "Go on",
  /** The name of the row of steps before the room, for a visitor who cannot see it. */
  stepsLabel: "Getting ready",
  /** The steps before the room, in order: the volume, the two sides, the rules, the room. */
  steps: Object.freeze(["Volume", "Left and right", "The rules", "The room"]),
});

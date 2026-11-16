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
});

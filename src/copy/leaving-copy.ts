/**
 * What the visitor reads when a visit pauses, stops or reaches its last room. Stopping leads to a
 * short exit screen and never to part of a result (brief for the visit flow). The keys of
 * `pauseLines` and `exitLines` are the visit flow's pause and exit reasons.
 */
export const leavingCopy = Object.freeze({
  pauseHeading: "The house is waiting",
  /** Why the visit is waiting, and what happens to the sound that was under way. */
  pauseLines: Object.freeze({
    visitor:
      "The visit is paused. The sound you were waiting for will come again later.",
    hidden:
      "The visit paused while this page was out of sight. The sound you were waiting for will come again later.",
    interrupted:
      "Something else on this device took over the sound, so the visit paused. The sound you were waiting for will come again later.",
    deviceChanged:
      "Your audio device changed, so the visit paused. You will match the hiss again, and then this room starts over.",
  }),
  goOnButton: "Go on",
  exitHeading: "You left the house",
  /** Why the visitor is outside. Every line says that nothing was kept. */
  exitLines: Object.freeze({
    visitor: "Every sound has stopped. Nothing from this visit was kept.",
    pageLeft:
      "The visit ended when you left the page. Nothing from this visit was kept.",
    soundRefused:
      "The house could not play its sounds on this device, so the visit ended. Nothing from this visit was kept.",
  }),
  backButton: "Back to the front door",
  /** A stand-in for the result, until the result has been built. */
  ended: Object.freeze({
    heading: "That was the last room",
    line: "You have been through every room of this visit. The picture of what you caught is still being built.",
  }),
});

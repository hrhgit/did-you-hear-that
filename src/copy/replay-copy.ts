/** Every fixed string of the missed-sound replay (missed-sound-replay design.md, "The copy"). */
export const replayCopy = Object.freeze({
  heading: "The sounds you did not catch",
  startButton: "Play them",
  skipButton: "Skip them",
  skipRestButton: "Skip the rest",
  goOnButton: "See the picture",
  resumeButton: "Go on",
  stopButton: "Stop the sounds",
  nothingMissedLine:
    "You answered every sound I made, so I have nothing to play again.",
  /** Why the sounds paused. The keys are the replay's pause reasons. */
  pauseLines: Object.freeze({
    hidden:
      "The sounds paused while this page was out of sight. When you go on, they carry on where they stopped.",
    interrupted:
      "Something else on this device took over the sound, so the sounds paused. When you go on, they carry on where they stopped.",
  }),
});

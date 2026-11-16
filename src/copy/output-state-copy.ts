/**
 * The stop control, and what the page says when sound has stopped or the device cannot carry the
 * house (R5.5, R14.8, D45). The keys of `stoppedLines` and `unsupportedLines` are the output
 * stage's stop and unsupported reasons. Each unsupported line is one plain sentence.
 */
export const outputStateCopy = Object.freeze({
  stopButton: "Stop all sound",
  startAgainButton: "Start sound again",
  stoppedLines: Object.freeze({
    control:
      "All sound is stopped. Press Start sound again when you are ready.",
    hidden:
      "All sound stopped when the page was hidden. Press Start sound again when you are ready.",
    pageLeft: "All sound stopped when you left the page.",
    deviceChanged:
      "All sound stopped because your audio device changed. Calibrate again before the house plays anything else.",
    interrupted:
      "All sound stopped because something else on this device took over the sound. Press Start sound again when you are ready.",
  }),
  unsupportedLines: Object.freeze({
    noWebAudio:
      "This browser cannot play the sounds of the house, so try another current browser.",
    sampleRateTooLow:
      "Your headphones are playing in a reduced mode that cuts off high sounds, so close any app that uses the microphone or reconnect the headphones, then reload the page.",
    monoOutput:
      "Your audio device has only one channel, so the house cannot play a sound to one ear alone.",
  }),
});

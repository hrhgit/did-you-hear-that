/**
 * What the headphone check says (design.md, "The headphone check"). The hiss always plays in the
 * left ear (D20). The keys of `answers` and `judgementLines` are the session's answer and
 * judgement names.
 */
export const headphoneCheckCopy = Object.freeze({
  playButton: "Play the check",
  question: "Which side was the hiss on?",
  answers: Object.freeze({
    left: "Left",
    right: "Right",
    bothSides: "Both sides",
    nothingHeard: "I heard nothing",
  }),
  judgementLines: Object.freeze({
    correct: "That was your left ear. The headphones are the right way round.",
    swapped:
      "The hiss was on your left. Turn the headphones around and try again.",
    bothSides:
      "The hiss came from one side only. Your device may be set to play the same sound in both ears. Turn that setting off and try again.",
    notHeard: "Check that both earpieces are on and connected, then try again.",
  }),
});

/**
 * The rules, in the house's voice: a few short sentences, then how to answer on a keyboard and
 * on a touch screen (brief for the house interface). Since the one room of 2026-11-16 they speak
 * of the creatures, which take turns in one room.
 */
export const rulesCopy = Object.freeze({
  heading: "Before you go in",
  sentences: Object.freeze([
    "A creature makes a sound on your left or your right, and you press that side.",
    "Each catch makes it quieter.",
    "When I make no sound, press nothing.",
    "Keep to the beat, and keep them away from Jack.",
  ]),
  keyboardLine: "Press the left or right arrow key, or A and L.",
  touchLine: "Touch the left or right half of the screen.",
  enterButton: "Enter the room",
  /** The heading of the box that shows how to answer. */
  answerHeading: "How to answer",
  /** The keys drawn as key caps beside each side: the keyboard line says the same in words. */
  keyCaps: Object.freeze({
    left: Object.freeze(["←", "A"]),
    right: Object.freeze(["→", "L"]),
  }),
});

/**
 * The rules, in the house's voice: a few short sentences, then how to answer on a keyboard and
 * on a touch screen (brief for the house interface). Since the one room of 2026-11-16 they speak
 * of the creatures, which take turns in one room.
 */
export const rulesCopy = Object.freeze({
  heading: "Before you go in",
  sentences: Object.freeze([
    "The creatures of this house take turns making a sound, on your left or on your right, and you tell me which side.",
    "Each time you catch one it comes back quieter, and after a while it goes home.",
    "Sometimes I make no sound at all, and then you do nothing.",
    "You carry a lantern of three lights: each answer costs one, a catch gives it back, and in the dark you wait for one to return.",
  ]),
  keyboardLine:
    "On a keyboard, press the left or right arrow key, or A for left and L for right.",
  touchLine: "On a touch screen, touch the left or right half of the screen.",
  enterButton: "Enter the room",
});

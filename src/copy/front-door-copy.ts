/**
 * What the front door says. The first line is fixed by the brief for the house interface. The
 * product is described as a self-check and a first listen (wording.md).
 */
export const frontDoorCopy = Object.freeze({
  /** A few words over the title, the way the cover of a game names its kind. */
  eyebrow: "A haunted house for headphones",
  headphonesLine: "Put on headphones. Turn off noise cancelling.",
  aboutLine:
    "A house whose creatures get quieter each time you catch them. A first listen to the quietest sound you can catch, on your left and on your right.",
  choicesLabel: "Ways in",
  choices: Object.freeze({
    full: Object.freeze({
      button: "Enter the house",
      note: "Five creatures. The counting closes after 5 minutes at the latest.",
    }),
    replay: Object.freeze({
      button: "Watch a 60 second replay",
      note: "No headphones needed. This door is not open yet.",
    }),
  }),
  privacyLine: "Nothing you do here leaves this browser.",
  /** The name of the row of the five creatures, for a visitor who cannot see them. */
  rosterLabel: "The five creatures of the house",
});

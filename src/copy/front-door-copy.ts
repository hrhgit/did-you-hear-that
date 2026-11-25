/**
 * What the front door says. The first line is fixed by the brief for the house interface. The
 * product is described as a self-check and a first listen (wording.md).
 */
export const frontDoorCopy = Object.freeze({
  /** A few words over the title, the way the cover of a game names its kind. */
  eyebrow: "A haunted house for headphones",
  headphonesLine: "Put on headphones. Turn off noise cancelling.",
  aboutLine: "Catch each creature by ear. Every catch makes it quieter.",
  choicesLabel: "Ways in",
  choices: Object.freeze({
    full: Object.freeze({
      button: "Enter the house",
      note: "About 5 minutes",
    }),
    replay: Object.freeze({
      button: "Watch a 60 second replay",
      note: "Not open yet",
    }),
  }),
  privacyLine: "Nothing leaves this browser.",
  /** The name of the row of the five creatures, for a visitor who cannot see them. */
  rosterLabel: "The five creatures of the house",
});

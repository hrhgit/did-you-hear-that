/**
 * What the front door says. The first line is fixed by the brief for the house interface. The
 * product is described as a self-check and a first listen (wording.md).
 */
export const frontDoorCopy = Object.freeze({
  headphonesLine: "Put on headphones. Turn off noise cancelling.",
  aboutLine:
    "A house that gets quieter each time you catch it. A first listen to the quietest sound you can catch, on your left and on your right.",
  choicesLabel: "Ways in",
  choices: Object.freeze({
    quick: Object.freeze({
      button: "Enter for about 7 minutes",
      note: "Three rooms.",
    }),
    full: Object.freeze({
      button: "Enter for about 12 minutes",
      note: "Five rooms.",
    }),
    replay: Object.freeze({
      button: "Watch a 60 second replay",
      note: "No headphones needed. This door is not open yet.",
    }),
  }),
  privacyLine: "Nothing you do here leaves this browser.",
});

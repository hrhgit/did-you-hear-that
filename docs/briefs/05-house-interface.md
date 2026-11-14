# Brief 05: house interface

## Goal

What the visitor sees and touches during a visit. This is the "haunting interface" the contest category judges, and it must never give away the sound.

## Screens

- **Front door.** Black. One line: "Put on headphones. Turn off noise cancelling." Three choices: enter for 3 minutes, enter for 7 minutes, watch a 60 second replay without headphones.
- **Headphone check and calibration.** Plain and calm. Clear instructions, one control.
- **Rules.** Three short sentences in the house's voice, then the first room.
- **Rooms.** A cross-section of a five-storey house fills the screen for the whole visit. The current room is lit and the others are dark. The visitor's progress up the house is visible.
- **Between rooms.** A short pause the visitor ends when ready.

## Behaviour to specify

- Answers: left and right arrow keys, or `A` and `L`, on a keyboard. The left and right halves of the screen on touch. Both are explained on the rules screen.
- Ambient motion in the lit room (dust, a swinging lamp, a shadow under a door) runs on its own seeded schedule. The interface code that draws it has no access to the trial schedule.
- After a trial is scored as caught, a ripple spreads from the side the sound came from, labelled with pitch and level relative to the anchor. Missed sounds show nothing until the replay.
- After a response on a no-sound trial, the line "I made no sound that time." appears.
- A stop control is always visible and reachable by keyboard.
- The page works from 360 px wide up to a large desktop, in portrait and landscape.
- Motion respects the reduced-motion preference: ambient motion slows to near stillness and ripples become a brief highlight.
- Text contrast meets WCAG AA. Every control has a visible focus state and an accessible name.
- No flashes, no sudden full-screen changes.

## Look

Dark, quiet and old rather than gory. A hand-drawn cross-section, like an architect's section of a house at night. One warm light colour against cold darks. The look is a starting direction and will be tuned by eye in the IDE.

## Properties

- **The picture does not leak.** For any visit, the stream of screen events before each answer is statistically independent of whether a sound is playing and on which side. Tested by running many simulated visits with the robot module off, recording screen events, and checking that a predictor given only screen events does no better than chance at guessing sound timing or side.

## Out of scope

- The result page, the replay and the no-headphone replay mode.

## Done when

A person can finish a quick visit by keyboard on a laptop and by touch on a phone, the no-leak property passes, and an automated accessibility check reports no serious problems.

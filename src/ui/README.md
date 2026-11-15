# src/ui

Drawing and input: the house cross-section, ambient motion, ripples, the result page and replay mode, plus the page styles. It draws snapshots of the session state and forwards the visitor's answers. It never calls `engine` or `audio` directly.

May import from: `session`, `copy`, `config`.

## The listening page

`listening-page/` holds the development page on which the project owner first hears the sounds. It starts with a very quiet hiss whatever the system volume. `listen.html` at the repository root loads `start-listening-page.ts`, which draws a seed with `crypto.getRandomValues` and calls `renderListeningPage`. That draws the page from the snapshots of the listening page session in `src/session` and sends every press to it. `listening-page.css` holds its styles. Every string comes from `src/copy`.

The page is for development only. The development server serves it; the build does not include it and nothing links to it. To open it, run `npm run dev` and open `http://localhost:5173/listen.html` in a desktop browser, or the address with `/listen.html` that the server prints if it chose another port. Nothing plays until you press Start. Calibrate first: the hiss starts very quietly and rises by at most 5 dB per repeat. The six sounds appear after a calibration is kept. "Stop all sound" stays at the top of the window and stops everything at once. The checklist to follow is "Manual checks" in `.kiro/specs/audio-output/design.md`.

## The house

`house/` draws the cross-section and everything that moves in it. `ambient/` and `ripple/`, beside it, hold the motion as pure functions of time.

- `draw-house-section.ts` builds the drawing as one SVG: five rooms, the cut walls and floors, the ground, the room names at the right and the measuring line at the left. `sketch-pen.ts` draws each line a little past its ends, the way a draughtsman's pencil does, from a seeded random source, so the same seed gives the same drawing. `house-geometry.ts` holds where everything sits and `room-furniture.ts` what stands in each room. A room is `dark`, `lit`, `visited` or `closed`, and `house.css` turns that into light.
- `motion-layer.ts` is a canvas laid over the drawing. It moves the dust, the lamp of the lit room and the shadow under the corridor door, and draws the ripple of a caught sound. It is told which room is lit and when to draw a ripple, and nothing else. `fit-view-box.ts` lines the canvas up with the drawing.
- `ambient/` holds the schedule of ambient motion and the motion itself as pure functions of time: `ambient-schedule.ts`, `lamp-swing.ts` and `dust.ts`. The schedule is drawn from a random source of its own and takes no other input, so it cannot depend on when a sound plays or on which side.
- `ripple/ripple-rings.ts` gives the rings of a ripple at a moment, and the still glow that stands in for it when the visitor has asked for reduced motion.

## The visit

`visit/` holds the page of a visit. It is built in four layers, and only the last two touch the page.

- `screen-of-snapshot.ts` turns a snapshot of the visit flow into a `Screen`: which sheet of text is up, which room is lit, which controls can be used and what each line says. `reaction-of-event.ts` turns an event of the flow into what the house does about an answered sound: a ripple with its line, the line about no sound, or nothing. Both are pure functions and take nothing else, so the page can show only what the flow has released. A snapshot of a room holds nothing about the sound being waited for, and the one event that names a sound is created at the moment its answer is decided. `tests/properties/screen-leak/` runs whole visits through these two functions and checks that nothing they draw before an answer tells whether a sound came or from which side.
- `build-visit-page.ts` makes every element once: the bar with the stop and pause controls and the room, the two halves of the screen that answer left and right, the line under the drawing, the rest between two rooms, and one sheet of text for each screen outside a room. Drawing a screen only changes text, `hidden` and `disabled`, so no control moves away from under a press.
- `show-screen.ts` draws a `Screen` onto those elements, tells the house which rooms are lit, visited or closed, and moves the keyboard focus when the screen changes. `show-caption.ts` shows what the house says about a sound that has been answered.
- `start-visit.ts` opens the house: it draws two seeds, one for the visit and one for the ambient motion, creates the visit flow, and sends every press to it from inside the press. `listen-for-answers.ts` takes the arrow keys, `A` and `L`, and touches on the two halves, with the time of each press. `answer-for-key.ts` decides which key presses are answers.

`visit.css` holds the styles. Italic text is the house speaking, and upright text says how to use the page.

The stop control is on every screen of a visit and takes one press. The pause control is shown in a room. Every change of brightness is a fade. With reduced motion the fades are shorter, ambient motion runs at a small fraction of its speed and a ripple is a still glow.

Three things are not built yet and are stand-ins: the replay door at the front is shut, and after the last room the page says that the picture of the visit is still being built and leads back to the front door, in place of the replay of missed sounds and the result page.

A few timings live here and not in `src/config`, because they change nothing about a sound, a wait or a decision: how long a line stays under the drawing, how long a pressed half stays bright, and how long the button of a rest ignores presses after it appears.

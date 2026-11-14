# src/ui

Drawing and input: the house cross-section, ambient motion, ripples, the result page and replay mode, plus the page styles. It draws snapshots of the session state and forwards the visitor's answers. It never calls `engine` or `audio` directly.

May import from: `session`, `copy`, `config`.

## The listening page

`listening-page/` holds the development page on which the project owner first hears the sounds. It starts with a very quiet hiss whatever the system volume. `listen.html` at the repository root loads `start-listening-page.ts`, which draws a seed with `crypto.getRandomValues` and calls `renderListeningPage`. That draws the page from the snapshots of the listening page session in `src/session` and sends every press to it. `listening-page.css` holds its styles. Every string comes from `src/copy`.

The page is for development only. The development server serves it; the build does not include it and nothing links to it. To open it, run `npm run dev` and open `http://localhost:5173/listen.html` in a desktop browser, or the address with `/listen.html` that the server prints if it chose another port. Nothing plays until you press Start. Calibrate first: the hiss starts very quietly and rises by at most 5 dB per repeat. The six sounds appear after a calibration is kept. "Stop all sound" stays at the top of the window and stops everything at once. The checklist to follow is "Manual checks" in `.kiro/specs/audio-output/design.md`.

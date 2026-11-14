---
inclusion: always
---

# Technology

## Stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript, `strict` on | The engine and the sound code are pure logic that benefits from types |
| Build | Vite | Static output, fast, no server |
| Interface | No UI framework. SVG for the house, Canvas 2D for ripples and ambient motion, plain CSS with custom properties | Few screens, heavy custom drawing, fewer dependencies to keep alive through the judging period |
| Audio | Web Audio API, used only through one output module | One place to enforce the level cap and channel routing |
| Unit and property tests | Vitest with fast-check | Property-based tests over simulated listeners are central to this project |
| End-to-end tests | Playwright | Also drives the robot listener |
| Lint and format | ESLint and Prettier | |
| Package manager | npm | |
| Hosting | GitHub Pages, deployed by GitHub Actions, plus one mirror on a second static host | The URL must stay free and open until 29 January 2027 |

## Hard constraints

- The site is fully static. No backend, no login, no cookies, no analytics, no network requests at run time other than loading its own files.
- Results are stored only in the browser's local storage.
- No runtime dependencies for audio or for the engine. Dev dependencies are fine.
- Every font, image and sound is made for this project or carries an open licence that is recorded in `docs/licences.md`. No third-party trademarks, no copyrighted music.
- All ghost sounds are synthesised in code. No audio files are shipped.
- It must work in current Chrome, Safari and Firefox on desktop, in Safari on iOS and in Chrome on Android.
- An `AudioContext` may only be created or resumed inside a user gesture.
- The sample rate comes from the `AudioContext`. Synthesis functions take the sample rate as a parameter and never assume 44100 or 48000.

## Commands

The scaffold spec creates these. Until it has run they do not exist.

| Command | Does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Unit and property tests, run once |
| `npm run test:e2e` | Playwright tests against a local build |
| `npm run lint` | ESLint and Prettier check |
| `npm run render:sounds` | Render every ghost sound offline and write a spectrum report |
| `npm run check:copy` | Scan user-facing text for banned words |

## Testing rules

- Engine and synthesis code is tested without a browser. It must run under Node in Vitest.
- Randomness is always injected. Any function that needs random numbers takes a seeded generator, so a failing case can be replayed.
- Time is always injected. No engine or session code reads the clock directly.
- A property test that finds a counterexample is kept. The counterexample becomes a named regression test and the fix goes in a separate commit.

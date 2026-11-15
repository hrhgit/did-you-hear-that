# tests/e2e

Playwright tests, named `*.spec.ts`. `npm run test:e2e` builds the site, serves `dist/` locally and runs them at a desktop size and a phone size. Vitest does not collect files from this directory. `preview-servers.ts` lists the two addresses the built page is served at, the server root and `/did-you-hear-that/`, and both `playwright.config.ts` and the tests read it.

`listening-page.spec.ts` checks the development listening page of the audio-output spec in headless Chromium. The build does not hold that page, so `playwright.config.ts` also starts the development server at the port in `dev-server.ts`, for this file only. The tests install probes before the page's scripts that keep a copy of every buffer the page hands to Web Audio, render the output graph in an `OfflineAudioContext`, and check that the built `dist/` holds none of the page's strings. The browser runs muted.

`front-door.spec.ts` checks the page a visitor lands on, at both addresses: the title, the line about headphones, the three ways in, the door that is not open yet, the dark background and the contrast of its text, that nothing is ready to sound before a press, that nothing scrolls sideways down to 360 by 640, keyboard focus, and the accessibility rules of axe-core.

`visit.spec.ts` walks a visit in the built page: from the front door through the calibration, the headphone check and the rules into the first room, answers by keyboard at the desktop size and by touch at the phone size until the house says something, pauses and goes on, stops and comes back to the front door. The browser runs muted, so these tests check what the page shows and that its controls work. They do not check what anything sounds like.

`page-checks.ts` holds what both files share: opening a page with probes that count the page's sound sources and with a record of requests to other origins and of uncaught errors, the contrast arithmetic and the check for sideways scrolling.

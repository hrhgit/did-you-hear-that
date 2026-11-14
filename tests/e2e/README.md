# tests/e2e

Playwright tests, named `*.spec.ts`. `npm run test:e2e` builds the site, serves `dist/` locally and runs them at a desktop size and a phone size. Vitest does not collect files from this directory. `preview-servers.ts` lists the two addresses the built page is served at, the server root and `/did-you-hear-that/`, and both `playwright.config.ts` and the tests read it.

`listening-page.spec.ts` checks the development listening page of the audio-output spec in headless Chromium. The build does not hold that page, so `playwright.config.ts` also starts the development server at the port in `dev-server.ts`, for this file only. The tests install probes before the page's scripts that keep a copy of every buffer the page hands to Web Audio, render the output graph in an `OfflineAudioContext`, and check that the built `dist/` holds none of the page's strings. The browser runs muted.

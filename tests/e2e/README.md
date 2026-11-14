# tests/e2e

Playwright tests against the built page, named `*.spec.ts`. `npm run test:e2e` builds the site, serves `dist/` locally and runs them at a desktop size and a phone size. Vitest does not collect files from this directory. `preview-servers.ts` lists the two addresses the page is served at, the server root and `/did-you-hear-that/`, and both `playwright.config.ts` and the tests read it.

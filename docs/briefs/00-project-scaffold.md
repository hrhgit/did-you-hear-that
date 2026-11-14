# Brief 00: project scaffold

## Goal

An empty project in which every later spec can start writing code and tests at once. No product behaviour is built here.

## Must deliver

- A Vite and TypeScript project with `strict` on, following the layout in `.kiro/steering/structure.md`. Each directory exists and holds a short `README.md` saying what belongs there.
- All commands listed in `.kiro/steering/tech.md`. Commands whose subject does not exist yet (`render:sounds`, `check:copy`) are real scripts that succeed on an empty input and say so.
- Vitest with fast-check, with one trivial property test that passes, to prove the setup.
- Playwright with one test that loads the built page and finds its heading, at a desktop size and a phone size.
- ESLint and Prettier. The import rules in `structure.md` are enforced by lint, and there is a test fixture or a documented manual check showing a forbidden import fails.
- `src/config` with the initial values table from `.kiro/steering/hearing-method.md`, typed, with units in the names.
- A seeded random number generator utility and an injectable timer interface, since every later module needs them.
- A placeholder page: dark background, the title, one line saying the house is not open yet. No sound.
- A GitHub Actions workflow that runs lint, type-check, unit tests and the build on every push, and a second workflow that deploys `dist/` to GitHub Pages from `main`.
- `docs/licences.md`, empty apart from its heading and a table header.

## Out of scope

- Any audio, any engine logic, any real interface.
- The mirror host. That is added by hand later.

## Constraints

- No runtime dependencies. Dev dependencies only.
- Do not add anything under `.kiro` to `.gitignore`.
- The Vite `base` setting must work both at a domain root and under a repository path on GitHub Pages.

## Done when

`npm ci && npm run lint && npm test && npm run build && npm run test:e2e` passes on a clean checkout.

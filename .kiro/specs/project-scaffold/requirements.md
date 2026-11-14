# Requirements: project scaffold

## Introduction

This spec turns the empty repository into a project in which every later spec can start writing code and tests at once. It delivers the toolchain, the directory layout from `.kiro/steering/structure.md`, the commands from `.kiro/steering/tech.md`, the initial values from `.kiro/steering/hearing-method.md`, two shared primitives (a seeded random generator and an injectable timer), a placeholder page, and the CI and deploy workflows.

No product behaviour is built here. There is no audio, no engine logic and no real interface. The mirror host is out of scope.

The input is `docs/briefs/00-project-scaffold.md`, the steering files in `.kiro/steering/` and `docs/architecture.md`. Open points in those documents are resolved in the Decisions section of `design.md`.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Repository**: the git repository `did-you-hear-that` as committed.
- **Module**: one of the source directories named in the dependency rules of `structure.md`: `config`, `engine`, `audio/synth`, `audio/output`, `session`, `ui`, `storage`, `copy`, `robot`. The page entry file `src/main.ts` is treated as its own module named `main`.
- **Build**: the `npm run build` command.
- **Type_Check**: the `npm run typecheck` command, also run by the Build.
- **Unit_Suite**: the Vitest run started by `npm test`.
- **E2E_Suite**: the Playwright run started by `npm run test:e2e`.
- **Lint_Command**: the `npm run lint` command, which runs ESLint and a Prettier check.
- **Import_Boundary_Rule**: the ESLint configuration that enforces which Module may import which.
- **Sound_API_Rule**: the ESLint configuration that confines sound-producing browser APIs to `src/audio/output`.
- **Injection_Rule**: the ESLint configuration that forbids direct use of randomness and of the clock where `tech.md` requires them to be injected.
- **Config**: the files in `src/config`.
- **Hearing_Method_Config**: the typed object in `src/config` that holds the initial values table from `hearing-method.md`.
- **Banned_Terms**: the list of words and phrases that `wording.md` forbids in visitor-facing text, held in `src/config`.
- **Seeded_Random**: the seeded random number generator in `src/config`.
- **Timer**: the injectable timer interface in `src/config`.
- **System_Timer**: the Timer implementation backed by the browser or Node clock.
- **Manual_Timer**: the Timer implementation whose clock moves only when a test advances it.
- **Placeholder_Page**: the page the Build produces from `index.html`.
- **Copy_Check**: the `npm run check:copy` command.
- **Sound_Render_Tool**: the `npm run render:sounds` command.
- **CI_Workflow**: the GitHub Actions workflow that checks every push.
- **Deploy_Workflow**: the GitHub Actions workflow that publishes `dist/` to GitHub Pages.
- **Repository_Test**: the Vitest test file that checks repository-wide rules (layout, dependencies, ignore rules).
- **Clean checkout**: a fresh `git clone` of the Repository with no `node_modules/`, no `dist/` and no other untracked files.

## Requirements

### Requirement 1: Directory layout

**User story:** As the author of a later spec, I want every directory from the layout to exist and explain itself, so that I know where new code and tests go without asking.

#### Acceptance criteria

1. THE Repository SHALL contain each of these directories: `src/`, `src/config/`, `src/engine/`, `src/audio/`, `src/audio/synth/`, `src/audio/output/`, `src/session/`, `src/ui/`, `src/storage/`, `src/copy/`, `src/robot/`, `tests/`, `tests/listeners/`, `tests/properties/`, `tests/e2e/`, `tools/`, `docs/`, `.kiro/`.
2. THE Repository SHALL contain a `README.md` in each directory listed in criterion 1 that says in a few sentences what belongs there.
3. WHERE a directory listed in criterion 1 is a Module, THE Repository SHALL state in that directory's `README.md` which Modules it may import from.
4. THE Repository SHALL contain no source file in `src/engine/`, `src/audio/synth/`, `src/audio/output/`, `src/session/`, `src/storage/` or `src/robot/` when this spec is complete.
5. IF a TypeScript file exists under `src/` outside every Module directory and is not `src/main.ts`, THEN THE Repository_Test SHALL fail and name the file.
6. IF a directory listed in criterion 1 has no `README.md`, THEN THE Repository_Test SHALL fail and name the directory.

### Requirement 2: TypeScript and build

**User story:** As a developer, I want a strict TypeScript project that builds to static files, so that type errors are caught early and the output can be hosted anywhere.

#### Acceptance criteria

1. THE Type_Check SHALL check every TypeScript file in `src/`, `tests/`, `tools/` and the root configuration files with the compiler option `strict` enabled.
2. THE Type_Check SHALL check production code under `src/` without Node.js type definitions, so that production code cannot rely on Node.js APIs.
3. WHEN `npm run build` runs, THE Build SHALL run the Type_Check and then write the static site to `dist/`.
4. IF the Type_Check reports an error, THEN THE Build SHALL exit with a non-zero status without running the bundler.
5. THE Build SHALL emit only relative references to its own assets, so that `dist/` works when served at a domain root and when served under a repository path such as `/did-you-hear-that/`.
6. THE Repository SHALL declare no runtime dependencies in `package.json`.
7. IF `package.json` declares an entry under `dependencies`, THEN THE Repository_Test SHALL fail.
8. THE Repository SHALL state the supported Node.js major version in `package.json` under `engines` and in `.nvmrc`.
9. THE Repository SHALL commit `package-lock.json` so that `npm ci` installs the same versions on every machine.

### Requirement 3: Commands

**User story:** As a developer or an automated agent, I want every command named in the technology steering file to exist and work, so that later specs can rely on them.

#### Acceptance criteria

1. THE Repository SHALL provide the npm scripts `dev`, `build`, `test`, `test:e2e`, `lint`, `render:sounds` and `check:copy`.
2. WHEN `npm run dev` runs, THE Repository SHALL start a local Vite development server that serves the Placeholder_Page.
3. WHEN `npm run render:sounds` runs and `src/audio/synth/` contains no TypeScript file other than tests, THE Sound_Render_Tool SHALL print that no ghost sounds are defined yet and that no report was written, and exit with status 0.
4. IF `npm run render:sounds` runs and `src/audio/synth/` contains a TypeScript file other than a test, THEN THE Sound_Render_Tool SHALL print that rendering is not implemented yet and exit with a non-zero status.
5. WHEN `npm run check:copy` runs and the files in `src/copy/` export no strings, THE Copy_Check SHALL print that there is no copy to check and exit with status 0.
6. WHEN `npm run check:copy` runs and the files in `src/copy/` export strings, THE Copy_Check SHALL test every exported string, including strings inside exported arrays and plain objects, against the Banned_Terms and print how many strings and files it checked.
7. IF an exported string in `src/copy/` contains a term from the Banned_Terms, THEN THE Copy_Check SHALL print the file, the export path and the term for every such match and exit with a non-zero status.
8. THE Copy_Check SHALL match a banned term regardless of letter case, only as a whole word or whole phrase, and also when it is followed by one of the endings `s`, `es`, `d`, `ed`, `ing` or `ly`.
9. WHEN an export in `src/copy/` is a function, THE Copy_Check SHALL not call it and SHALL report how many function exports it did not evaluate.

### Requirement 4: Unit and property tests

**User story:** As the author of the engine and synthesis specs, I want Vitest and fast-check ready under Node, so that I can write property tests over simulated listeners from the first task.

#### Acceptance criteria

1. WHEN `npm test` runs, THE Unit_Suite SHALL run every test once under Node.js, without a browser, and exit with status 0 only if every test passes.
2. THE Unit_Suite SHALL collect files named `*.test.ts` under `src/`, `tests/` and `tools/`, and SHALL not collect any file under `tests/e2e/`.
3. THE Unit_Suite SHALL contain one trivial fast-check property test under `tests/properties/` that passes, to prove the setup.
4. IF a fast-check property fails, THEN THE Unit_Suite SHALL print the seed and the shrunk counterexample, so that the case can be replayed.

### Requirement 5: End-to-end tests

**User story:** As a developer, I want a Playwright test against the built page at desktop and phone sizes, so that later interface specs have a working browser harness.

#### Acceptance criteria

1. WHEN `npm run test:e2e` runs, THE E2E_Suite SHALL run the Build and then run Playwright against `dist/` served by a local static server.
2. IF the Playwright Chromium browser is not installed, THEN THE E2E_Suite SHALL install it before running the tests.
3. THE E2E_Suite SHALL run every test in a desktop project with a 1280 by 800 viewport and in a phone project with the Playwright `Pixel 7` device profile, which has touch enabled.
4. THE E2E_Suite SHALL load the Placeholder_Page once served at the server root and once served under the path `/did-you-hear-that/`.
5. WHEN the Placeholder_Page has loaded, THE E2E_Suite SHALL find a level 1 heading whose text equals the site title exported by `src/copy`.
6. IF the Placeholder_Page requests a resource from any origin other than the one serving it, THEN THE E2E_Suite SHALL fail and list the requested addresses.
7. IF the Placeholder_Page raises an uncaught error, THEN THE E2E_Suite SHALL fail.

### Requirement 6: Lint and format

**User story:** As a reviewer, I want the dependency rules of `structure.md` and the injection rules of `tech.md` enforced by lint, so that a forbidden import or a hidden clock read fails before it is merged.

#### Acceptance criteria

1. WHEN `npm run lint` runs, THE Lint_Command SHALL run ESLint over every TypeScript and JavaScript file and a Prettier check over code and configuration files, and exit with a non-zero status if either reports a problem.
2. THE Lint_Command SHALL not check or rewrite Markdown files or any file under `.kiro/`.
3. THE Import_Boundary_Rule SHALL allow each Module to import only from itself and from these Modules:

   | Module | May import from |
   |---|---|
   | `config` | nothing else |
   | `engine` | `config` |
   | `audio/synth` | `config` |
   | `audio/output` | `config`, `audio/synth` |
   | `session` | `engine`, `audio/output`, `storage`, `copy`, `config` |
   | `ui` | `session`, `copy`, `config` |
   | `storage` | `config` |
   | `copy` | `config` |
   | `robot` | `session`, `config` |
   | `main` | `ui`, `config` |

4. IF a file in a Module imports from a Module not allowed by criterion 3, THEN THE Import_Boundary_Rule SHALL report an error, whether the import is a static import, a type-only import, a re-export or a dynamic `import()`.
5. IF a file outside `tests/` imports from `tests/`, or a file outside `tools/` imports from `tools/`, THEN THE Import_Boundary_Rule SHALL report an error.
6. IF a file outside `src/robot/` imports from `src/robot/`, THEN THE Import_Boundary_Rule SHALL report an error.
7. IF a file under `src/` outside `src/audio/output/` refers to a Web Audio constructor or type, to the `Audio` or `HTMLAudioElement` interfaces, to speech synthesis, or creates an `audio` or `video` element, THEN THE Sound_API_Rule SHALL report an error.
8. IF a file under `src/` calls `Math.random`, THEN THE Injection_Rule SHALL report an error.
9. IF a file under `src/engine/`, `src/audio/synth/` or `src/session/` reads the clock through `Date.now`, `performance.now` or `new Date()` without arguments, or calls `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` or `requestAnimationFrame`, THEN THE Injection_Rule SHALL report an error.
10. THE Unit_Suite SHALL include a test that lints a probe import for every ordered pair of Modules, `tests` and `tools` in a committed fixture tree, and asserts that ESLint reports an error exactly for the pairs that criteria 3 to 6 forbid.
11. THE Unit_Suite SHALL include a test that lints, with the Repository's own ESLint configuration, a file in the real `src/engine/` that imports from `src/ui/`, and asserts that ESLint reports an error.
12. THE Unit_Suite SHALL include a test that, for each API named in criteria 7 to 9, lints one use in a forbidden location and one use in an allowed location, and asserts an error only for the forbidden one.

### Requirement 7: Initial values in config

**User story:** As the author of the threshold search, I want the initial values from the hearing method in one typed place with units in the names, so that no tunable number appears anywhere else.

#### Acceptance criteria

1. THE Hearing_Method_Config SHALL hold these values:

   | Field | Value |
   |---|---|
   | `downwardStepDb` | 10 |
   | `upwardStepDb` | 5 |
   | `startingLevelDb` | -25 |
   | `capRelativeToAnchorDb` | 15 |
   | `floorDb` | -70 |
   | `responseWindowMs` | 2000 |
   | `gapBetweenTrialsMinMs` | 1500 |
   | `gapBetweenTrialsMaxMs` | 4000 |
   | `noSoundTrialShareMinFraction` | 0.15 |
   | `noSoundTrialShareMaxFraction` | 0.25 |
   | `falseAlarmRateUnreliableAboveFraction` | 0.30 |
   | `trialLimitPerEarPerRoomCount` | 20 |
   | `swappedRepeatDifferenceDb` | 15 |
   | `roomFrequenciesHz.quick` | 1000, 4000, 8000 |
   | `roomFrequenciesHz.full` | 500, 1000, 2000, 4000, 8000 |

2. THE Hearing_Method_Config SHALL end every field name with its unit: `Db`, `Ms`, `Hz`, `Fraction` or `Count`.
3. THE Hearing_Method_Config SHALL be declared with read-only types and frozen at run time, including its nested arrays.
4. IF code assigns to a field of the Hearing_Method_Config at run time, THEN THE Hearing_Method_Config SHALL throw a `TypeError` and keep its value.
5. THE Unit_Suite SHALL check that `floorDb` is below `startingLevelDb`, which is below `capRelativeToAnchorDb`; that both step sizes are positive; that `gapBetweenTrialsMinMs` is positive and not above `gapBetweenTrialsMaxMs`; that both no-sound shares and the false alarm limit lie between 0 and 1 with the minimum share not above the maximum; that `trialLimitPerEarPerRoomCount` is a positive integer; that each room list is strictly ascending; and that every quick visit room is also a full visit room.
6. THE Config SHALL hold the Banned_Terms as one read-only list containing exactly the words and phrases listed under "Words that never appear in visitor-facing text" in `wording.md`.
7. THE Config SHALL not yet contain the absolute digital ceiling, the maximum sound duration or the minimum fade length. The audio-output and ghost-sounds specs add those.

### Requirement 8: Seeded random generator

**User story:** As the author of any module that needs randomness, I want a seeded generator, so that every random choice can be replayed from its seed when a test fails.

#### Acceptance criteria

1. THE Seeded_Random SHALL provide a function `createSeededRandom(seed)` that returns a random source with a method `next()` and a read-only property `seed`.
2. WHEN `next()` is called, THE Seeded_Random SHALL return a number greater than or equal to 0 and less than 1.
3. WHEN two random sources are created with the same seed and `next()` is called the same number of times on each, THE Seeded_Random SHALL return the same sequence from both.
4. IF `createSeededRandom` receives a seed that is not an integer from 0 to 4294967295, THEN THE Seeded_Random SHALL throw a `RangeError`.
5. THE Seeded_Random SHALL not read `Math.random`, the clock or any state shared between random sources.
6. THE Unit_Suite SHALL pin the first outputs for seeds 0 and 1 as a known-answer test, so that a change to the algorithm fails a test.

### Requirement 9: Injectable timer

**User story:** As the author of the visit flow, I want an injected timer and a manual implementation for tests, so that a whole visit can run instantly and deterministically in the test suite.

#### Acceptance criteria

1. THE Timer SHALL define `now()`, returning milliseconds from a monotonic clock; `setTimeout(callback, delayMs)`, returning a handle; and `clearTimeout(handle)`.
2. THE System_Timer SHALL implement the Timer with `performance.now` and the global timer functions.
3. THE Manual_Timer SHALL implement the Timer with a clock that starts at a given time, 0 by default, and moves only when `advanceBy(durationMs)` is called.
4. WHEN `advanceBy(durationMs)` is called, THE Manual_Timer SHALL run every pending callback whose due time is at or before the current time plus `durationMs`, in order of due time and, for equal due times, in the order they were scheduled.
5. WHILE a Manual_Timer callback runs, THE Manual_Timer SHALL report that callback's due time from `now()`.
6. WHEN a callback scheduled during `advanceBy` falls due within the same advance, THE Manual_Timer SHALL run it within that advance.
7. WHEN `advanceBy(durationMs)` returns, THE Manual_Timer SHALL report from `now()` the time at which the advance started plus `durationMs`.
8. IF `clearTimeout` is called with the handle of a pending callback, THEN THE Timer SHALL not run that callback.
9. IF `clearTimeout` is called with a handle that has already run, has been cleared or is unknown, THEN THE Timer SHALL do nothing.
10. IF `setTimeout` or `advanceBy` receives a delay or duration that is negative or not finite, THEN THE Timer SHALL throw a `RangeError`.
11. THE Manual_Timer SHALL report how many callbacks are pending.

### Requirement 10: Placeholder page

**User story:** As a visitor who finds the address early, I want a calm page that says the house is not open yet, so that I know I am in the right place and nothing surprises me.

#### Acceptance criteria

1. WHEN the Placeholder_Page loads, THE Placeholder_Page SHALL show the title "Did You Hear That?" as its only level 1 heading and the line "The house is not open yet." and no other text.
2. THE Placeholder_Page SHALL set the document title to the same site title.
3. THE Placeholder_Page SHALL take every string a visitor can read from exports of `src/copy`, and `index.html` SHALL contain no visitor-readable text.
4. THE Placeholder_Page SHALL use a dark background whose relative luminance is at most 0.05, with text whose contrast ratio against it is at least 4.5 to 1.
5. THE Placeholder_Page SHALL declare the language `en`, a responsive viewport and a dark colour scheme before any script runs, so that no light background appears while it loads.
6. THE Placeholder_Page SHALL produce no sound: it SHALL create no `AudioContext` and no `audio` or `video` element.
7. THE Placeholder_Page SHALL contain no animation and no change of brightness after it first paints.
8. WHILE the viewport is 360 pixels wide or wider, THE Placeholder_Page SHALL show all its text without horizontal scrolling.
9. THE Placeholder_Page SHALL load no font, image or other file from outside the Repository's own build output.

### Requirement 11: Continuous integration

**User story:** As the author, I want every push checked, so that a broken commit is visible at once.

#### Acceptance criteria

1. WHEN a commit is pushed to any branch, THE CI_Workflow SHALL run `npm ci`, the Lint_Command, the Type_Check, the Unit_Suite and the Build on Ubuntu with the Node.js version from `.nvmrc`.
2. IF any step of the CI_Workflow fails, THEN THE CI_Workflow SHALL skip the remaining steps and mark the run as failed.
3. THE CI_Workflow SHALL run with read-only permission to the repository contents and no other permission.

### Requirement 12: Deployment

**User story:** As the author, I want `main` published to GitHub Pages automatically, so that the public address always shows the latest checked version.

#### Acceptance criteria

1. WHEN a commit is pushed to `main`, THE Deploy_Workflow SHALL run `npm ci`, the Lint_Command, the Type_Check, the Unit_Suite and the Build, and then publish `dist/` to GitHub Pages.
2. IF any check in the Deploy_Workflow fails, THEN THE Deploy_Workflow SHALL not publish.
3. WHERE the Deploy_Workflow is started by hand, THE Deploy_Workflow SHALL publish only when it runs on `main`.
4. THE Deploy_Workflow SHALL request only these permissions: read repository contents, write Pages and write the OpenID Connect token.
5. WHILE a deployment is running, THE Deploy_Workflow SHALL queue a newer deployment instead of cancelling the running one.
6. THE Repository SHALL document, in the root `README.md`, the one-time repository setting that selects GitHub Actions as the Pages source.

### Requirement 13: Licences record

**User story:** As a judge or a reuser, I want one place that lists the licence of every asset, so that the open-licence rule can be checked.

#### Acceptance criteria

1. THE Repository SHALL contain `docs/licences.md` with a level 1 heading and the header of a table with the columns Asset, Kind, Source and Licence, and no table rows.

### Requirement 14: Repository rules

**User story:** As the author, I want the constraints of the brief checked automatically, so that they keep holding after the scaffold is done.

#### Acceptance criteria

1. THE Repository SHALL not add any `.gitignore` pattern that matches a path under `.kiro/`.
2. IF `git check-ignore --no-index` reports any of `.kiro/steering/product.md`, `.kiro/specs/project-scaffold/tasks.md`, `.kiro/settings/cli.json`, `.kiro/hooks/example.kiro.hook` or `.kiro/agents/example.json` as ignored, THEN THE Repository_Test SHALL fail.
3. THE Repository SHALL ignore the generated directories `dist/`, `coverage/`, `playwright-report/` and `test-results/`.

### Requirement 15: Done

**User story:** As the author, I want one command chain that proves the scaffold works, so that "done" is not a matter of opinion.

#### Acceptance criteria

1. WHEN `npm ci && npm run lint && npm test && npm run build && npm run test:e2e` runs on a Clean checkout with the Node.js version from `.nvmrc`, THE Repository SHALL complete every command with status 0.
2. WHEN `npm run render:sounds` and `npm run check:copy` run on a Clean checkout after `npm ci`, THE Repository SHALL complete both with status 0.

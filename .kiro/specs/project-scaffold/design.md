# Design: project scaffold

## Overview

The scaffold sets up an empty project that follows `.kiro/steering/structure.md` and `.kiro/steering/tech.md`. Its parts:

- a Vite and TypeScript project with two type-check configurations, one for browser code and one for Node code
- Vitest with fast-check for unit and property tests, Playwright for one end-to-end test
- ESLint and Prettier, with lint rules that enforce the module dependency table, confine sound-producing APIs to `src/audio/output`, and forbid direct randomness and clock reads
- `src/config` holding the hearing method's initial values, the banned term list, the seeded random generator and the timer
- a placeholder page whose two strings come from `src/copy`
- `render:sounds` and `check:copy` as real Node scripts that handle the current, nearly empty input
- a CI workflow on every push and a deploy workflow for `main`

Nothing here plays sound, draws an interface or implements the threshold search. Every requirement number below refers to `requirements.md`.

## Files created

```
.github/workflows/ci.yml                    CI on every push (R11)
.github/workflows/deploy.yml                Pages deploy from main (R12)
.gitignore                                  existing file; adds coverage/, playwright-report/, test-results/ (R14.3)
.nvmrc                                      Node major version (R2.8)
.prettierignore                             excludes Markdown, .kiro/, generated output (R6.2)
.kiro/README.md                             what .kiro holds (R1.2)
README.md                                   existing file; gains a short "Development" section (R12.6)
docs/README.md                              what docs holds (R1.2)
docs/licences.md                            heading and table header (R13)
eslint.config.js                            flat config (R6)
index.html                                  page shell, no visible text (R10)
package.json, package-lock.json             scripts and dev dependencies (R2, R3)
playwright.config.ts                        two projects, two preview servers (R5)
tsconfig.json                               solution file that points at the two below, for editors
tsconfig.app.json                           production code under src/, browser types only (R2.2)
tsconfig.node.json                          tests, tools, src/**/*.test.ts and root configs, with Node types
vite.config.ts                              base './', Vitest settings (R2.5, R4)

src/README.md
src/main.ts                                 entry: calls renderPlaceholder
src/config/README.md
src/config/hearing-method-config.ts         hearingMethodConfig, HearingMethodConfig, VisitType (R7)
src/config/hearing-method-config.test.ts    invariants and freezing (R7.4, R7.5)
src/config/banned-terms.ts                  bannedTerms (R7.6)
src/config/banned-terms.test.ts
src/config/seeded-random.ts                 createSeededRandom, RandomSource (R8)
src/config/seeded-random.test.ts            known answers, validation, rough uniformity (R8.4, R8.6)
src/config/timer.ts                         Timer, TimerHandle (R9.1)
src/config/system-timer.ts                  createSystemTimer (R9.2)
src/config/system-timer.test.ts
src/config/manual-timer.ts                  createManualTimer, ManualTimer (R9.3 to R9.11)
src/config/manual-timer.test.ts
src/copy/README.md
src/copy/site-title.ts                      siteTitle = "Did You Hear That?"
src/copy/house-not-open-line.ts             houseNotOpenLine = "The house is not open yet."
src/copy/find-banned-terms.ts               findBannedTerms (R3.8)
src/copy/find-banned-terms.test.ts
src/ui/README.md
src/ui/base.css                             dark page, custom properties (R10.4)
src/ui/render-placeholder.ts                renderPlaceholder (R10.1, R10.2)
src/engine/README.md
src/audio/README.md
src/audio/synth/README.md
src/audio/output/README.md
src/session/README.md
src/storage/README.md
src/robot/README.md

tests/README.md
tests/repository.test.ts                    repository-wide rules (R1.5, R1.6, R2.7, R14.2)
tests/listeners/README.md
tests/properties/README.md
tests/properties/fast-check-setup.property.test.ts   trivial property (R4.3)
tests/properties/seeded-random.property.test.ts      (R8.2, R8.3)
tests/properties/manual-timer.property.test.ts       (R9.4 to R9.8)
tests/properties/find-banned-terms.property.test.ts  (R3.8)
tests/e2e/README.md
tests/e2e/placeholder-page.spec.ts          (R5, R10)

tools/README.md
tools/check-copy.ts                         CLI wrapper (R3.5 to R3.9)
tools/run-copy-check.ts                     testable core of the copy check
tools/run-copy-check.test.ts
tools/render-sounds.ts                      CLI wrapper (R3.3, R3.4)
tools/run-sound-render.ts                   testable core of the render tool
tools/run-sound-render.test.ts
tools/lint/module-dependencies.js           the dependency table as data (R6.3)
tools/lint/import-boundary-rule.js          builds the import-x rule from the table (R6.4 to R6.6)
tools/lint/source-restriction-configs.js    builds the sound API and injection rule blocks (R6.7 to R6.9)
tools/lint/import-boundary-rule.test.ts     pair matrix over the fixture, real-config check (R6.10, R6.11)
tools/lint/source-restriction-configs.test.ts   allowed and forbidden API uses (R6.12)
tools/lint/fixture/                         stub tree mirroring the modules (see "Lint fixture")
```

## Architecture

### Module dependency table

`structure.md` names the allowed imports for `engine`, `audio/synth`, `audio/output`, `session` and `ui`. It leaves `config`, `storage`, `copy`, `robot` and the entry file open. The table below closes them (see Decisions D6). It is stored once, in `tools/lint/module-dependencies.js`, and both the ESLint configuration and the fixture test read it.

| Module | Directory | May import from |
|---|---|---|
| `config` | `src/config` | itself only |
| `engine` | `src/engine` | `config` |
| `audio/synth` | `src/audio/synth` | `config` |
| `audio/output` | `src/audio/output` | `config`, `audio/synth` |
| `session` | `src/session` | `engine`, `audio/output`, `storage`, `copy`, `config` |
| `ui` | `src/ui` | `session`, `copy`, `config` |
| `storage` | `src/storage` | `config` |
| `copy` | `src/copy` | `config` |
| `robot` | `src/robot` | `session`, `config` |
| `main` | `src/main.ts` | `ui`, `config` |

Outside `src/`: `tests/` and `tools/` may import any module under `src/`. Neither may import the other, and nothing under `src/` may import either.

No module lists `robot`, so every import of `src/robot` is forbidden. The robot-listener spec adds the one dynamic import that loads it.

```js
// tools/lint/module-dependencies.js
/** @type {ReadonlyArray<{ name: string, path: string, mayImport: readonly string[] }>} */
export const moduleDependencies = Object.freeze([
  { name: 'config', path: 'src/config', mayImport: [] },
  { name: 'engine', path: 'src/engine', mayImport: ['config'] },
  // ... one entry per row above
  { name: 'main', path: 'src/main.ts', mayImport: ['ui', 'config'] },
]);
```

### Import boundary rule

The rule is `import-x/no-restricted-paths` from `eslint-plugin-import-x`, with `eslint-import-resolver-typescript` resolving relative `.ts` imports. That rule resolves each import to a real file and compares file paths, so it catches relative imports at any depth. It visits static imports, type-only imports, re-exports and dynamic `import()`.

`createImportBoundaryRule(basePath)` turns the table into zones. Each module gets one zone that forbids everything under `src/` except itself and its allowed modules:

```js
// for module m
{ target: `./${m.path}`, from: './src', except: [m.path, ...allowedPaths].map(toPathRelativeToSrc),
  message: `${m.name} may import only from: ${m.mayImport.join(', ') || 'itself'}` }
```

Four more zones cover `tests` and `tools`: `src` from `tests`, `src` from `tools`, `tests` from `tools`, `tools` from `tests`.

`basePath` is the repository root in `eslint.config.js` and the fixture root in the fixture test. Both use the same function, so the test checks the shipped rule and not a copy of it.

The project uses relative imports only. There are no path aliases, so no import can bypass the resolver.

### Sound API rule and injection rule

ESLint's `no-restricted-globals`, `no-restricted-properties`, `no-restricted-syntax` and `@typescript-eslint/no-restricted-types` each accept one option list per file. In flat config, a later block that sets the same rule for the same file replaces the earlier list instead of adding to it. `createSourceRestrictionConfigs()` in `tools/lint/source-restriction-configs.js` therefore builds one block per file group, with the lists already merged:

| File group | Math.random ban | Sound API ban | Clock and timer ban |
|---|---|---|---|
| `src/audio/output/**` | yes | no | no |
| `src/engine/**`, `src/audio/synth/**`, `src/session/**` | yes | yes | yes |
| every other file under `src/` | yes | yes | no |

`src/config` is in the last group. That is where `createSystemTimer` reads `performance.now` and calls the global timers, and it stays the only such place.

Restricted names:

- **Sound API ban.** Globals: `AudioContext`, `webkitAudioContext`, `OfflineAudioContext`, `AudioBuffer`, `AudioBufferSourceNode`, `AudioWorkletNode`, `OscillatorNode`, `GainNode`, `MediaElementAudioSourceNode`, `MediaStreamAudioSourceNode`, `Audio`, `speechSynthesis`, `SpeechSynthesisUtterance`. Properties on `window`, `globalThis` and `self`: `AudioContext`, `webkitAudioContext`, `OfflineAudioContext`, `Audio`, `speechSynthesis`. Types: `AudioContext`, `BaseAudioContext`, `OfflineAudioContext`, `AudioNode`, `AudioBuffer`, `AudioBufferSourceNode`, `AudioDestinationNode`, `AudioParam`, `AudioWorkletNode`, `GainNode`, `OscillatorNode`, `StereoPannerNode`, `PannerNode`, `ChannelMergerNode`, `ChannelSplitterNode`, `MediaElementAudioSourceNode`, `HTMLAudioElement`. Syntax: a `createElement` call whose first argument is the literal `audio` or `video`.
- **Math.random ban.** Property `Math.random`.
- **Clock and timer ban.** Properties `Date.now` and `performance.now`. Globals `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `requestAnimationFrame`. Syntax: `new Date()` and `Date()` with no arguments. `new Date(ms)` stays allowed, so later code can format a time it was given.

Every message names the rule it comes from, for example "Sound leaves the product only through src/audio/output (audio-safety rule 1)".

### ESLint configuration

```js
// eslint.config.js (shape, not final text)
export default defineConfig([
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', '.kiro/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { 'import-x': importX },
    settings: { 'import-x/resolver-next': [createTypeScriptImportResolver()] },
    rules: { 'import-x/no-restricted-paths': createImportBoundaryRule(repositoryRoot) },
  },
  ...createSourceRestrictionConfigs(),
  eslintConfigPrettier,
]);
```

The lint rules do not use type information (D22). That keeps linting fast and lets the tests lint virtual files with `ESLint#lintText` without a TypeScript project.

### Lint fixture

`tools/lint/fixture/` holds one stub per module and one each for `tests` and `tools`:

```
tools/lint/fixture/
  src/config/stub.ts  src/engine/stub.ts  src/audio/synth/stub.ts  src/audio/output/stub.ts
  src/session/stub.ts src/ui/stub.ts      src/storage/stub.ts      src/copy/stub.ts
  src/robot/stub.ts   src/main.ts
  tests/stub.ts       tools/stub.ts
```

Each stub is `export const stub = '<module name>';`. `import-boundary-rule.test.ts` builds an `ESLint` instance with `cwd` set to the fixture root, `overrideConfigFile: true` and a minimal configuration: the TypeScript parser, the import-x plugin with the resolver, and `createImportBoundaryRule(fixtureRoot)`. For every ordered pair (importer, target) of the 12 locations it calls `lintText` on `import { stub } from '<relative path>';` with a virtual `filePath` of `probe.ts` in the importer's directory. For `main` the virtual path is `src/main.ts` itself. It expects an error exactly when the table forbids the pair. A few extra cases check that the type-only form, the re-export form and the dynamic `import()` form of one forbidden pair are also reported.

A second test uses `new ESLint()` with the repository's own `eslint.config.js` and lints a virtual `src/engine/probe.ts` that imports `../ui/render-placeholder`, which exists in the real tree. It expects an error. That proves `eslint.config.js` really wires in the rule.

`source-restriction-configs.test.ts` uses the repository's own configuration and a virtual file per case. For each restricted name it lints one use in a forbidden directory and one in an allowed directory: `src/audio/output/probe.ts` for sound APIs, `src/ui/probe.ts` for clock reads. It does the same for `Math.random` in `src/config/probe.ts` (always forbidden) and `tests/probe.test.ts` (allowed).

## Components and interfaces

### Hearing method config

```ts
// src/config/hearing-method-config.ts
export type VisitType = 'quick' | 'full';

export interface HearingMethodConfig {
  readonly downwardStepDb: number;
  readonly upwardStepDb: number;
  readonly startingLevelDb: number;
  readonly capRelativeToAnchorDb: number;
  readonly floorDb: number;
  readonly responseWindowMs: number;
  readonly gapBetweenTrialsMinMs: number;
  readonly gapBetweenTrialsMaxMs: number;
  readonly noSoundTrialShareMinFraction: number;
  readonly noSoundTrialShareMaxFraction: number;
  readonly falseAlarmRateUnreliableAboveFraction: number;
  readonly trialLimitPerEarPerRoomCount: number;
  readonly swappedRepeatDifferenceDb: number;
  readonly roomFrequenciesHz: Readonly<Record<VisitType, readonly number[]>>;
}

export const hearingMethodConfig: HearingMethodConfig = deepFreeze({ /* values from R7.1 */ });
```

- Step sizes are positive magnitudes. The engine subtracts `downwardStepDb` after a catch and adds `upwardStepDb` after a miss.
- Levels are on the anchor scale: 0 is the calibration anchor, negative is quieter.
- `falseAlarmRateUnreliableAboveFraction` is a strict limit. A rate of exactly 0.30 is still reliable, matching "above 30 percent".
- `deepFreeze` is a private helper in the same file. Assigning to a frozen property throws a `TypeError` in ES module code, which is always strict (R7.4).
- Each field has a one-line comment quoting the row of the `hearing-method.md` table it comes from.

### Banned terms

```ts
// src/config/banned-terms.ts
export const bannedTerms: readonly string[] = Object.freeze([
  'normal', 'abnormal', 'healthy', 'impaired', 'damaged', 'loss', 'deaf',
  'diagnosis', 'diagnose', 'diagnostic', 'screening', 'clinical', 'medical',
  'audiogram', 'dB HL', 'hearing level',
  'average', 'typical', 'people your age', 'percentile',
  'test result', 'pass', 'fail', 'score',
]);
```

`banned-terms.test.ts` checks that the entries are unique, non-empty and free of leading or trailing spaces.

### findBannedTerms

```ts
// src/copy/find-banned-terms.ts
export function findBannedTerms(text: string, terms: readonly string[]): string[];
```

It returns the terms found in `text`, each once, in the order of `terms`. For each term it builds a regular expression with flags `iu`:

```
(?<![\p{L}\p{N}]) <term, regex-escaped, with each space replaced by \s+> (?:s|es|d|ed|ing|ly)? (?![\p{L}\p{N}])
```

So "Normal", "normally", "passed" and "non-clinical" match, while "passage", "lossless" and "scoreboard" do not. The function lives in `src/copy` because `copy` is where the wording rules are enforced (architecture.md) and because the copy property test in the result-page spec, which sits under `tests/`, needs it. Code in `tests/` may not import from `tools/`.

### Seeded random

```ts
// src/config/seeded-random.ts
export interface RandomSource {
  readonly seed: number;
  /** A number in [0, 1). */
  next(): number;
}
export function createSeededRandom(seed: number): RandomSource;
```

- Seeds are integers from 0 to 2^32 − 1. Anything else throws a `RangeError` whose message includes the value.
- The algorithm is sfc32. Its four 32-bit state words come from four outputs of splitmix32 run on the seed, and the first 12 sfc32 outputs are thrown away to mix the state. `next()` returns the 32-bit output divided by 2^32.
- Each source owns its own state in a closure. There is no module-level state.
- Later modules build helpers such as "integer in a range" or "shuffle" on top of `next()` in their own spec. This interface stays minimal.

```
splitmix32(state):  state = (state + 0x9e3779b9) | 0
                    z = Math.imul(state ^ (state >>> 16), 0x85ebca6b)
                    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
                    return (z ^ (z >>> 16)) >>> 0
sfc32 step:         t = (((a + b) | 0) + d) | 0
                    d = (d + 1) | 0
                    a = b ^ (b >>> 9)
                    b = (c + (c << 3)) | 0
                    c = (c << 21) | (c >>> 11)
                    c = (c + t) | 0
                    return t >>> 0
```

### Timer

```ts
// src/config/timer.ts
export type TimerHandle = number & { readonly __brand: 'TimerHandle' };

export interface Timer {
  /** Milliseconds from a monotonic clock. Only differences are meaningful. */
  now(): number;
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
```

```ts
// src/config/system-timer.ts
export function createSystemTimer(): Timer;
```

`createSystemTimer` uses `performance.now()` for `now()` and the global `setTimeout` and `clearTimeout` underneath. It hands out its own increasing integer handles and keeps a map from handle to native handle, so that the handle type is the same in the browser and in Node. It removes an entry when its callback runs or is cleared.

```ts
// src/config/manual-timer.ts
export interface ManualTimer extends Timer {
  advanceBy(durationMs: number): void;
  pendingCount(): number;
}
export function createManualTimer(options?: { startMs?: number }): ManualTimer;
```

How `advanceBy(d)` works:

1. Validate `d` (R9.10). Set `end = now + d`.
2. Repeat: take the pending entry with the smallest due time, breaking ties by sequence number. If none is left, or its due time is after `end`, stop. Otherwise set `now` to its due time, remove it and run it.
3. Set `now = end`.

Callbacks scheduled during step 2 go into the same queue, so they run in the same advance if they fall due in time (R9.6). A callback with delay 0 is due at the current `now` and runs on the next `advanceBy`, including `advanceBy(0)`. It never runs synchronously inside `setTimeout`. If a callback throws, the error propagates out of `advanceBy`, the entry is already removed, and the timer stays usable.

Both implementations validate delays the same way: a negative or non-finite value throws a `RangeError` (R9.10). This differs from the browser's `setTimeout`, which treats negative delays as 0. Throwing makes the bug visible and keeps the two implementations consistent.

`ManualTimer` lives in `src/config` and not under `tests/`, because unit tests next to `src/session` files need it and the property tests need it too. Production code never imports it, so the bundler drops it from `dist/`.

### Placeholder page

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="/src/ui/base.css" />
    <title></title>
  </head>
  <body>
    <main></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- The `color-scheme` meta tag gives a dark canvas before CSS arrives. The stylesheet is linked from the HTML rather than imported from script, so it blocks first paint in development as well as in the build. Together these prevent a white flash (audio-safety rule 9, R10.5).
- `href="data:,"` on the icon stops the browser asking for `/favicon.ico`, which would otherwise fail and show up in the same-origin request check.
- The `<title>` is empty in the HTML and set from `siteTitle` by script, so `index.html` holds no visitor-readable text (R10.3).

`src/ui/render-placeholder.ts`:

```ts
export function renderPlaceholder(doc: Document): void;
```

It sets `doc.title = siteTitle`, then fills the first `<main>` with an `<h1>` holding `siteTitle` and a `<p>` holding `houseNotOpenLine`, using `textContent`. If there is no `<main>` it throws an `Error`. `src/main.ts` is a single call: `renderPlaceholder(document)`.

`src/ui/base.css` defines `--color-night: #0b0c10` and `--color-moonlight: #e6e1d6` on `:root`, a contrast ratio of about 15 to 1. It uses a system serif font stack with no font files, centres the text with `min-height: 100dvh` and a fluid `clamp()` heading size, and has no transitions or animations.

### Vite and Vitest configuration

```ts
// vite.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tools/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'tools/lint/fixture/**', 'node_modules/**'],
  },
});
```

### TypeScript configuration

Shared compiler options: `strict`, `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `verbatimModuleSyntax`, `isolatedModules`, `noEmit`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `skipLibCheck`.

| File | Includes | `lib` | `types` |
|---|---|---|---|
| `tsconfig.app.json` | `src/**/*.ts`, excluding `src/**/*.test.ts` | ES2022, DOM, DOM.Iterable | `vite/client` |
| `tsconfig.node.json` | `src/**/*.test.ts`, `tests/**/*.ts`, `tools/**/*.ts`, `tools/**/*.js`, `*.config.ts` | ES2022, DOM, DOM.Iterable | `node` |

`tsconfig.node.json` sets `allowJs` and `checkJs` so the JSDoc-typed lint helpers are checked too. `typecheck` runs `tsc -p tsconfig.app.json && tsc -p tsconfig.node.json`.

### Scripts

| Script | Command |
|---|---|
| `dev` | `vite` |
| `typecheck` | `tsc -p tsconfig.app.json && tsc -p tsconfig.node.json` |
| `build` | `npm run typecheck && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:e2e` | `playwright install chromium && npm run build && playwright test` |
| `lint` | `eslint . && prettier --check .` |
| `format` | `prettier --write .` |
| `render:sounds` | `tsx tools/render-sounds.ts` |
| `check:copy` | `tsx tools/check-copy.ts` |

`playwright install chromium` does nothing when the browser is already in the cache.

### Copy check

`runCopyCheck({ copyDir, terms })` returns `{ exitCode: 0 | 1, lines: string[] }`. `tools/check-copy.ts` calls it with `src/copy` and `bannedTerms`, prints the lines and sets `process.exitCode`.

1. List every `.ts` file under `copyDir`, recursively, excluding `*.test.ts`. Sort the paths so output is stable.
2. Import each with `import(pathToFileURL(file).href)`.
3. Walk each export. A string is checked. An array or plain object is walked into, building a path such as `limitsStatement[2]` or `labels.left`. A function is counted and skipped. Anything else is ignored.
4. For each string, call `findBannedTerms`.

Output, exactly:

- No strings found: `check:copy: src/copy exports no strings yet. Nothing to check.` Exit 0.
- Strings found, no match: `check:copy: checked 2 strings in 2 files against 24 banned terms. No banned terms found.` If any functions were skipped, a second line follows: `check:copy: 1 function export was not evaluated. Generated text needs its own property test.` Exit 0.
- Matches: one line per match, `check:copy: src/copy/x.ts export "name" contains banned term "loss"`, then a summary line. Exit 1.

There are no exemptions yet. The limits statement constants that `wording.md` exempts are written in the result-page spec, which adds the exemption mechanism along with them.

### Sound render tool

`runSoundRender({ synthDir })` returns `{ exitCode, lines }`.

- No `.ts` files under `synthDir`, other than `*.test.ts`: `render:sounds: no ghost sounds are defined in src/audio/synth yet. Nothing to render. No report written.` Exit 0.
- Any such file: `render:sounds: found N synthesis files in src/audio/synth, but rendering is not implemented yet. The ghost-sounds spec adds it.` Exit 1.

Exiting 1 in the second case means a safety-relevant check cannot pass silently while it does nothing.

### Playwright

```ts
// playwright.config.ts (shape)
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
    { command: 'npx vite preview --port 4174 --strictPort --base /did-you-hear-that/',
      url: 'http://localhost:4174/did-you-hear-that/', reuseExistingServer: !process.env.CI },
  ],
});
```

The second server serves the same `dist/` under a repository path. Because the heading is written by script, finding it at that address proves that both the script and the stylesheet resolved there.

`tests/e2e/placeholder-page.spec.ts` runs these checks for each of the two addresses, in both projects:

- An init script replaces `window.AudioContext` and `window.webkitAudioContext` with wrappers that count constructions.
- It records every request whose origin differs from the page's origin. `data:` addresses are ignored. It also records every `pageerror` event.
- It finds `getByRole('heading', { level: 1, name: siteTitle })` and `getByText(houseNotOpenLine)`, both imported from `src/copy`.
- It checks that `document.title` equals `siteTitle`.
- It reads the computed body background and text colours and checks a relative luminance of at most 0.05 and a contrast ratio of at least 4.5.
- It checks that the page has no `audio` or `video` element and that the `AudioContext` count is 0.
- It checks that `document.documentElement.scrollWidth` is not larger than `window.innerWidth`.
- It checks that the lists of other-origin requests and page errors are empty.

The 360 pixel minimum width in R10.8 is checked by repeating the `scrollWidth` assertion after setting the viewport to 360 by 640, in both projects.

### CI workflow

```yaml
# .github/workflows/ci.yml
name: CI
on: push
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<major>
      - uses: actions/setup-node@<major>
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

### Deploy workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - checkout, setup-node (as in CI), npm ci, lint, typecheck, test, build
      - uses: actions/configure-pages@<major>
      - uses: actions/upload-pages-artifact@<major>
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@<major>
```

`<major>` is the current major version tag of each official `actions/*` action at the time of implementation (D30).

### Repository test

`tests/repository.test.ts` checks:

- every directory in R1.1 exists and contains `README.md` (R1.6)
- every `.ts` file under `src/` is inside a module directory or is `src/main.ts` (R1.5)
- `package.json` has no `dependencies` entry, or an empty one (R2.7)
- `git check-ignore --no-index -q <path>` exits with status 1, meaning "not ignored", for each `.kiro` path in R14.2
- `docs/licences.md` starts with a level 1 heading and contains the table header from R13. Rows added later do not break this check.

It runs `git` through `node:child_process` with arguments passed as an array, without a shell.

## Data flow

The page has one path: `index.html` loads `base.css` and `main.ts`. `main.ts` calls `renderPlaceholder`, which reads two strings from `src/copy`. Nothing is fetched, stored or played.

The tools have one path each: `check:copy` reads `src/config/banned-terms.ts` and the files in `src/copy`, and `render:sounds` lists `src/audio/synth`.

## Error handling

| Situation | Behaviour |
|---|---|
| Type error | `typecheck` fails, so `build` stops before `vite build` (R2.4) |
| Forbidden import or API | ESLint error whose message names the rule and the allowed modules |
| Banned term in copy | `check:copy` lists every match and exits 1 |
| Synthesis file exists before the render tool is written | `render:sounds` exits 1 with an explanation |
| Invalid seed | `RangeError` naming the value |
| Negative or non-finite delay | `RangeError` from either timer |
| Callback throws inside `advanceBy` | Error propagates; the timer stays consistent |
| No `<main>` element | `renderPlaceholder` throws; the end-to-end test catches it as a page error |
| Chromium missing | `test:e2e` installs it. On Linux, missing system libraries need `npx playwright install-deps chromium` once, which the README notes |

## Correctness properties

Property tests live under `tests/properties/` and use fast-check with its default 100 runs. fast-check prints the seed and shrunk path on failure (R4.4). Any counterexample found becomes a named regression test, and its fix goes in a separate commit (`tech.md`).

1. **Setup proof** (R4.3). For any array of integers, reversing it twice gives an equal array.
2. **Same seed, same sequence** (R8.3). For any seed from 0 to 2^32 − 1 and any count from 1 to 1000, two sources created with that seed return equal sequences of that length.
3. **Range** (R8.2). For any seed, the first 1000 outputs all lie in [0, 1).
4. **Seed validation** (R8.4). For any number that is not an integer from 0 to 2^32 − 1 (negative, too large, fractional, NaN, infinite), `createSeededRandom` throws a `RangeError`.
5. **Manual timer order** (R9.4 to R9.8). Take any list of operations: schedule with a delay from 0 to 10000, clear a random earlier handle, or advance by 0 to 5000. Applying them must satisfy all of these:
   - every callback that is not cleared runs exactly once, and only once its due time has been reached
   - cleared callbacks never run
   - callbacks run in non-decreasing due time, with ties in scheduling order
   - `now()` inside a callback equals its due time
   - after each advance, `now()` equals the start plus the duration
   - `pendingCount()` equals the number of callbacks scheduled but not yet run or cleared
6. **Nested scheduling** (R9.6). For any chain of callbacks where each schedules the next with a random delay, one advance covering the chain's total delay runs all of them.
7. **Banned terms are found** (R3.8). For any banned term, any upper and lower case mix of it, any allowed ending, and any surrounding text that ends and starts with a non-letter, `findBannedTerms` reports the term.

Other checks are examples, not properties: the exhaustive lint pair matrix (all 144 pairs, R6.10), the config invariants (R7.5), the known-answer seeds (R8.6) and the rough uniformity check (100 000 draws, mean within 0.01 of 0.5, each of 10 bins within 5 percent of 10 000).

## Testing strategy

| Requirement | Verified by |
|---|---|
| R1 | `tests/repository.test.ts`; R1.4 by inspection at the final task |
| R2 | `npm run typecheck`, `npm run build`, repository test, end-to-end test under the repository path |
| R3 | `tools/run-copy-check.test.ts` and `tools/run-sound-render.test.ts` with temporary directories under `os.tmpdir()`, removed after each test; running both commands on the real tree in the final task |
| R4 | `npm test` output; property 1 |
| R5, R10 | `tests/e2e/placeholder-page.spec.ts` |
| R6 | the fixture pair matrix, the real-config check, the API restriction test, `npm run lint` on the real tree |
| R7 | `hearing-method-config.test.ts`, `banned-terms.test.ts` |
| R8 | `seeded-random.test.ts`, properties 2 to 4 |
| R9 | `manual-timer.test.ts`, `system-timer.test.ts` (Vitest fake timers with `performance` faked), properties 5 and 6 |
| R11, R12 | reading the workflow files; one green CI run on a pushed branch; one Pages deployment from `main` once the Pages source is set |
| R13, R14 | repository test |
| R15 | the final task runs the whole chain in a fresh clone |

## How the scaffold supports the safety and wording rules

- Audio-safety rule 1 (one output path): the Sound API rule makes any sound-producing API outside `src/audio/output` a lint error from the first commit.
- Audio-safety rule 9 (no sudden flashes): the dark colour scheme is declared before any style or script loads.
- `tech.md` testing rules: the Injection rule forbids `Math.random` everywhere in `src/` and clock reads in `engine`, `audio/synth` and `session`. `createSeededRandom` and the timers are the sanctioned replacements.
- `wording.md`: the banned list lives in `src/config` and `check:copy` uses it. The placeholder's two strings pass it.
- `structure.md` naming: config fields carry unit suffixes, and levels end in `Db`.

The cap, fades, channel routing, maximum duration and stop control belong to the audio-output and ghost-sounds specs.

## Decisions

Each point below was open in the brief, the steering files or the architecture document, and was settled here without being able to ask.

**D1. Vite `base` is `'./'`.** Relative asset paths work at a domain root, under `/did-you-hear-that/` on GitHub Pages, and on the future mirror, all from one build. The alternative, a `BASE_PATH` variable set per host, needs one build per host and knowledge of the repository name. The product is a single page with no client-side routes, and the robot flag goes in the query string, so relative paths have no downside. The end-to-end test serves the build at both a root and a sub-path to prove it.

**D2. The seeded random generator and the timer live in `src/config`.** `engine` and `audio/synth` may import only from `config`, and the layout has no shared utilities directory. `config` is the one module every layer may import, so it is the only conforming place. Adding a `src/shared` directory would change the layout and the dependency rules, which are steering decisions and not this spec's to make. The `src/config/README.md` says why these two primitives are there. If more shared code builds up, a steering change to add a shared module is the cleaner fix.

**D3. sfc32 seeded through splitmix32, behind a one-method interface.** It is small, fast, has 128 bits of state and passes common statistical test batteries. That matters for property tests that draw millions of numbers. Mulberry32 is simpler but has only 32 bits of state. Seeds are limited to unsigned 32-bit integers, so production can seed from `crypto.getRandomValues(new Uint32Array(1))` and a seed is easy to copy into a regression test. Out-of-range seeds throw instead of being wrapped silently.

**D4. The timer has `now`, `setTimeout` and `clearTimeout` only.** These are what the visit flow needs to wait for gaps and response windows. Wall-clock dates for stored visits and animation frames for the interface are left to the specs that need them, which can extend the interface. The manual timer runs zero-delay callbacks only on an advance, never synchronously, so tests control exactly when anything happens. Both timers reject negative and non-finite delays.

**D5. Import rules use `import-x/no-restricted-paths` with an allow-list per module.** The rule resolves imports to files, so relative paths at any depth are caught. Built-in `no-restricted-imports` matches only the import text, which fails for relative paths. `eslint-plugin-boundaries` would also work but needs more configuration for the same result. Type-only imports are forbidden as well, because `structure.md` says what a module imports, not only what it calls. No path aliases are configured.

**D6. Rules for modules that `structure.md` leaves open.**
- `config` imports nothing. It is the base layer.
- `storage` imports `config` only. It stores what `session` hands it.
- `copy` imports `config` only. Its sentence-building functions will take plain data shapes declared in `copy`, not engine types, so that copy can be tested alone.
- `robot` may import `session` and `config`. Brief 10 has it observe trials and send answers, which is `session`'s surface.
- `main` (`src/main.ts`) may import `ui` and `config`.
- Nothing may import `robot` yet. Brief 10 adds the single dynamic import that loads it in robot mode.

Each of these is one line in `tools/lint/module-dependencies.js`. A later spec that needs a different rule changes `structure.md` first and that line second.

**D7. Sound-producing APIs are banned outside `src/audio/output` by name.** `structure.md` says nothing else may import the Web Audio types. These are browser globals, not modules, so an import rule cannot see them. The ban covers constructors, types, `window.` and `globalThis.` access, `new Audio()`, speech synthesis and creating `audio` or `video` elements, because each of these can make sound without the output stage. A later spec that needs a muted `video` element for the no-headphone replay asks for an explicit exception.

**D8. Randomness and clock reads are enforced by lint.** `tech.md` requires both to be injected. Lint makes this hold without relying on review. `Math.random` is banned in all of `src/`. Clock reads and timer calls are banned in `engine`, `audio/synth` and `session`, the modules the steering files name. `ui` is left free because animation will need `requestAnimationFrame`. `config` is left free because it holds the system timer. This goes beyond the brief's "import rules", so it is recorded here.

**D9. The forbidden-import proof is an automated test, not a manual check.** The brief allows either. An automated test cannot rot. The fixture and the lint helpers live in `tools/lint/`: they are Node code that serves the tooling, and putting them there avoids adding a directory under `tests/` that the layout does not list. Tests next to the helpers follow the "unit tests sit next to the file they test" convention.

**D10. Prettier uses its defaults and skips Markdown and `.kiro/`.** The steering files, briefs and docs are hand-written prose, and reformatting them would rewrite the author's tables and lists. `.kiro/settings/cli.json` has no trailing newline and is managed by Kiro, so a Prettier check over `.kiro/` would fail on a clean checkout. Default options avoid a style debate.

**D11. Two type-check configurations.** Production code is checked without Node types, so `process` or `Buffer` in `src/` is a type error. Tests and tools are checked with Node types. Test files next to source files belong to the Node configuration. `noUncheckedIndexedAccess` is off (D23).

**D12. Node.js 26.** Node 26 is the Active LTS line in November 2026 and is the version on the author's machine (26.10). `.nvmrc` holds `26`, `engines.node` is `>=26`, and both workflows read `.nvmrc`.

**D13. Node tools run TypeScript through `tsx`.** The tools import TypeScript from `src/config` and `src/copy`. `tsx` runs that with no build step and no change to how `src/` writes imports. Node's built-in type stripping would need `.ts` extensions in every import across the code base and only supports erasable syntax, which ties the whole project to a runtime feature for the sake of two scripts.

**D14. `check:copy` is a real check from the start.** The placeholder puts two strings in `src/copy`, because `structure.md` keeps every visitor-facing string there. So `src/copy` is not empty, and the brief's "succeed on an empty input" becomes "succeed on the current input and say what was checked". The banned list holds exactly the words in `wording.md`. "Hearing test" and "hearing check" are not added: they appear under "How to describe the product", not in the banned list, and can appear legitimately in a negative sentence. The result-page spec and the overclaim reviewer can revisit this. Matching ignores case, works on whole words and also catches the endings `s`, `es`, `d`, `ed`, `ing` and `ly`. That catches "normally" and "passed", at the cost of also flagging ordinary words such as "passing". A false alarm costs a rewording. A miss costs an overclaim. Function exports are counted but not called, because calling them needs arguments, and their output is covered by the copy property test in the result-page spec. Exemptions for the limits statement arrive with that statement in the same spec.

**D15. `render:sounds` succeeds only when there is nothing to render.** With no synthesis files it says so and exits 0. Once a synthesis file exists it exits 1 until the ghost-sounds spec replaces the stub. A spectrum check that passes while doing nothing would be worse than none.

**D16. Config holds only the hearing method table and the banned list.** The absolute digital ceiling, maximum sound duration and minimum fade length are safety numbers. No steering file gives values for the first two. Inventing them here would put unreviewed safety values in the code, so the audio-output and ghost-sounds specs add all three with their tests. The no-sound share and false alarm limit are stored as fractions (0.15, not 15) because the engine computes with fractions. The field names say `Fraction`. The trial limit ends in `Count` so that every field carries a unit, as the brief asks.

**D17. The placeholder writes its text from script.** `structure.md` forbids visitor-facing strings outside `src/copy`, so `index.html` carries no text and an empty `<title>`. The cost is a blank dark page for the few milliseconds before the script runs, and nothing for visitors without JavaScript. The product needs JavaScript anyway. The stylesheet is linked from `index.html` and the colour scheme is declared in a meta tag, so no light flash appears.

**D18. Playwright uses Chromium only, in two projects: desktop at 1280 by 800, and the `Pixel 7` profile.** The brief asks for a desktop size and a phone size, not several engines. WebKit and Firefox would add browser downloads and CI time for a page with two lines of text. The house-interface and robot-listener specs, which carry real cross-browser risk, can add WebKit for iOS Safari. `test:e2e` installs Chromium itself and builds first, so the done-when chain works on a clean checkout and the tests never run against a stale `dist/`. A 360 pixel case checks the minimum width from the house-interface brief.

**D19. The end-to-end test also checks the hard constraints it can see.** These are: no requests to other origins (`tech.md`), no audio context and no media elements (brief: "No sound"), no uncaught errors, dark background with sufficient contrast, and no horizontal scroll. Each is a few lines. They protect constraints that later specs would otherwise only check by eye.

**D20. CI runs on every push to any branch. Deploy runs on pushes to `main` and can be started by hand, but publishes only from `main`.** Deploy repeats lint, type-check and tests before building, so a broken commit is never published, even if the CI run has not finished. In-progress deployments are not cancelled, so a published site is never left half updated. Choosing "GitHub Actions" as the Pages source is a repository setting that no file can change. The README states it.

**D21. CI does not run the end-to-end tests.** The brief lists lint, type-check, unit tests and build. Running Playwright in CI needs browser downloads and system libraries, about a minute per run. It is a sensible follow-up once the interface exists. It is not added here.

**D22. No type-aware lint rules yet.** They would need a TypeScript project for every linted file, which makes the virtual-file lint tests awkward and slows linting. Rules such as `no-floating-promises` become valuable once the audio output code is asynchronous. The audio-output spec can turn them on.

**D23. `noUncheckedIndexedAccess` stays off.** It also applies to typed arrays, which would force a non-null assertion on every sample access in the synthesis and output code. `strict` and the other listed options stay on.

**D24. Repository-wide checks live in `tests/repository.test.ts`.** They check the layout, the absence of runtime dependencies and the `.kiro` ignore rule. They test no single file, so they have no "next to" location. A single file directly under `tests/` avoids adding a directory the layout does not list.

**D25. Test file naming.** Vitest collects `*.test.ts`. Property tests are named `*.property.test.ts` and live in `tests/properties/`. Playwright tests are named `*.spec.ts` and live in `tests/e2e/`, and Vitest excludes that directory. Neither runner picks up the other's files.

**D26. `docs/README.md` and `.kiro/README.md` are added.** The brief says each directory in the layout holds a README, and the layout lists both. Kiro reads only the steering, specs, hooks, agents and settings subdirectories, so a README at `.kiro/` affects nothing.

**D27. The root README gains a short Development section.** It lists the Node version, the commands, the one-time Pages setting and the Linux note for Playwright system libraries. It follows `wording.md` and does not call the product a hearing test.

**D28. Dependency versions are the current stable releases at implementation time, saved with exact versions, with the lockfile committed.** The site must stay up until 29 January 2027 with no surprise upgrades. Dev dependencies: `typescript`, `vite`, `vitest`, `fast-check`, `@playwright/test`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-import-x`, `eslint-import-resolver-typescript`, `eslint-config-prettier`, `prettier`, `tsx`, `@types/node`. There are no runtime dependencies.

**D29. A `format` script is added.** It runs `prettier --write .`. It is not in the `tech.md` command table, but without it every Prettier failure in `lint` has to be fixed by hand.

**D30. Workflow actions use official `actions/*` actions pinned to their major version tag.** All actions used are maintained by GitHub. Major tags get security fixes without manual updates. Pinning to commit hashes would be stricter, but it needs a dependency bot to stay current, which this project does not have. Each workflow requests only the permissions listed in R11.3 and R12.4.

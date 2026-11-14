# Tasks: project scaffold

Work through the tasks in order. Each task ends with its own checks passing and one small commit whose message says what changed, in the present tense. Requirement numbers refer to `requirements.md`. Decision numbers (D1 to D30) refer to the Decisions section of `design.md`.

If a property test finds a counterexample, keep it as a named regression test and put the fix in a separate commit (`tech.md`).

- [ ] 1. Set up the package, TypeScript, Vite and Vitest
  - Create `package.json`: name `did-you-hear-that`, `private: true`, `type: module`, version `0.0.0`, `engines.node` `>=26`, and every script from the Scripts table in `design.md`. Scripts whose files do not exist yet are added in their own tasks.
  - Create `.nvmrc` containing `26` (D12).
  - Install the dev dependencies listed in D28 with `npm install --save-dev --save-exact`. Add no runtime dependency. Commit `package-lock.json`.
  - Create `tsconfig.json` (solution file), `tsconfig.app.json` and `tsconfig.node.json` as in the TypeScript configuration section of `design.md` (D11).
  - Create `vite.config.ts` with `base: './'` and the Vitest settings from `design.md` (D1, D25).
  - Add `coverage/`, `playwright-report/` and `test-results/` to the existing `.gitignore`. Leave every existing line as it is, and add nothing that matches `.kiro/`.
  - Add `tests/properties/fast-check-setup.property.test.ts`: property 1, reversing any integer array twice gives an equal array.
  - Check: `npm run typecheck` and `npm test` pass, and the property test is the one test reported.
  - _Requirements: 2.1, 2.2, 2.6, 2.8, 2.9, 3.1, 4.1, 4.2, 4.3, 4.4, 14.1, 14.3_

- [ ] 2. Create the directory layout with a README in each directory
  - Create every directory in R1.1 that does not exist yet, each with a short `README.md` saying what belongs there. `docs/` gets one too, and `.kiro/README.md` explains the subdirectories without changing any of them (D26).
  - In each module README, state which modules it may import from, copying the module dependency table in `design.md` (D6). `src/config/README.md` also says why the seeded random generator and the timer live there (D2). `src/robot/README.md` says that production code never imports it. `tests/properties/README.md` states the counterexample rule and the `*.property.test.ts` naming (D25).
  - Add no source file to `src/engine/`, `src/audio/synth/`, `src/audio/output/`, `src/session/`, `src/storage/` or `src/robot/`.
  - Keep the READMEs within the wording rules: no banned words, and no "hearing test".
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 3. Add the hearing method config and the banned terms
  - Write `src/config/hearing-method-config.ts` with `VisitType`, `HearingMethodConfig` and `hearingMethodConfig`, holding the values in R7.1. Freeze it deeply with a private helper, and give each field a one-line comment naming its row in `hearing-method.md` (D16).
  - Write `src/config/hearing-method-config.test.ts`: every invariant in R7.5, plus a check that assigning to a field and to an element of a room list throws a `TypeError` and leaves the value unchanged.
  - Write `src/config/banned-terms.ts` with exactly the terms in `design.md`, which are the `wording.md` list (D14). Write `src/config/banned-terms.test.ts`: entries are unique, non-empty and trimmed.
  - Do not add the absolute ceiling, maximum duration or minimum fade (R7.7).
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 4. Add the seeded random generator
  - Write `src/config/seeded-random.ts`: `RandomSource` and `createSeededRandom`, using sfc32 seeded through splitmix32 with 12 warm-up outputs, as in `design.md` (D3). Keep all state in the closure.
  - Write `src/config/seeded-random.test.ts`:
    - known answers: the first five outputs for seeds 0 and 1. Compute them once from the implementation, check them against a hand trace of the pseudo-code in `design.md` for at least the first output, then pin them
    - `RangeError` for -1, 2^32, 0.5, `NaN` and `Infinity`
    - `seed` reports the given value
    - rough uniformity over 100 000 draws, with the limits from the Correctness properties section
  - Write `tests/properties/seeded-random.property.test.ts` with properties 2, 3 and 4.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 5. Add the timer interface and both implementations
  - Write `src/config/timer.ts` with `Timer` and the branded `TimerHandle` (D4).
  - Write `src/config/system-timer.ts`: `createSystemTimer`, with its own handle numbers mapped to native handles, and `RangeError` on negative or non-finite delays.
  - Write `src/config/manual-timer.ts`: `createManualTimer` and `ManualTimer`, with `advanceBy` following the algorithm in `design.md` and `pendingCount`.
  - Write `src/config/manual-timer.test.ts` with examples for every criterion of R9: start time, due order and ties, `now()` inside a callback, nested scheduling, zero delay not running synchronously, clearing pending, already-run and unknown handles, validation, and the timer staying usable after a callback throws.
  - Write `src/config/system-timer.test.ts` with Vitest fake timers, faking `setTimeout`, `clearTimeout` and `performance`: a callback runs after its delay, a cleared one does not, and `now()` follows `performance.now()`.
  - Write `tests/properties/manual-timer.property.test.ts` with properties 5 and 6.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11_

- [ ] 6. Build the placeholder page
  - Write `src/copy/site-title.ts` (`siteTitle = 'Did You Hear That?'`) and `src/copy/house-not-open-line.ts` (`houseNotOpenLine = 'The house is not open yet.'`).
  - Write `index.html` exactly as in `design.md`: `lang="en"`, viewport, `color-scheme` dark, `data:` icon, stylesheet link, empty `<title>`, empty `<main>`, module script (D17).
  - Write `src/ui/base.css`: the two colour custom properties, a system serif font stack, centred layout with `min-height: 100dvh`, a fluid heading size, and no transitions or animations.
  - Write `src/ui/render-placeholder.ts` (`renderPlaceholder(doc)`, using `textContent`, throwing if there is no `<main>`) and `src/main.ts`, which only calls it.
  - Check: `npm run build` writes `dist/` with only relative asset paths in `dist/index.html`. `npm run dev` shows the page with no light flash on reload.
  - _Requirements: 2.3, 2.4, 2.5, 3.2, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9_

- [ ] 7. Add ESLint and Prettier with the import, sound API and injection rules
  - Write `tools/lint/module-dependencies.js` with the module dependency table from `design.md`, frozen and JSDoc-typed.
  - Write `tools/lint/import-boundary-rule.js`: `createImportBoundaryRule(basePath)`, returning the `import-x/no-restricted-paths` setting with one allow-list zone per module plus the four `tests` and `tools` zones. Each message names the allowed modules (D5, D6).
  - Write `tools/lint/source-restriction-configs.js`: `createSourceRestrictionConfigs()`, returning one flat-config block per file group with the restriction lists already merged, so that no block overrides another (D7, D8). Messages name the steering rule they come from.
  - Write `eslint.config.js` in the shape shown in `design.md`: ignores, the recommended JavaScript and TypeScript sets without type information, import-x with the TypeScript resolver, the boundary rule, the restriction blocks, and `eslint-config-prettier` last (D22).
  - Write `.prettierignore` with `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `package-lock.json`, `*.md` and `.kiro/`. Use default Prettier options (D10).
  - Create the stub tree under `tools/lint/fixture/` as listed in `design.md`. If the TypeScript resolver needs a `tsconfig.json` to resolve relative imports there, add a minimal one inside the fixture.
  - Write `tools/lint/import-boundary-rule.test.ts`: the 12 by 12 pair matrix, the type-only, re-export and dynamic `import()` forms of one forbidden pair, and the real-config check that a virtual `src/engine/probe.ts` importing `../ui/render-placeholder` is reported (D9).
  - Write `tools/lint/source-restriction-configs.test.ts`: for every restricted name, one forbidden and one allowed use, as described in `design.md`.
  - If a form of import is not reported by `no-restricted-paths` in the installed version, add a targeted `no-restricted-syntax` selector for it and cover it in the test. Do not weaken the test.
  - Run `npm run format` once, then check that `npm run lint` and `npm test` pass and that `git diff` shows no change to any Markdown file or to anything under `.kiro/`.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

- [ ] 8. Add the banned term matcher and `check:copy`
  - Write `src/copy/find-banned-terms.ts` with the regular expression from `design.md`.
  - Write `src/copy/find-banned-terms.test.ts` with examples: "Normal", "normally", "passed", "non-clinical", "dB HL", "hearing\nlevel" and "people  your age" match. "passage", "lossless", "scoreboard" and "deafening" do not. Results come in list order without repeats.
  - Write `tests/properties/find-banned-terms.property.test.ts` with property 7.
  - Write `tools/run-copy-check.ts` (`runCopyCheck`) and `tools/check-copy.ts`, the CLI wrapper, producing the output lines in `design.md` exactly.
  - Write `tools/run-copy-check.test.ts` with temporary directories under `os.tmpdir()`, removed after each test. Cover: no files, files with no string exports, clean strings, a banned word inside a nested array and object with the export path reported, and a function export that is counted but not called.
  - Check: `npm run check:copy` on the real tree reports 2 strings in 2 files and exits 0. Function exports in `src/copy/find-banned-terms.ts` are reported as not evaluated.
  - _Requirements: 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 9. Add `render:sounds`
  - Write `tools/run-sound-render.ts` (`runSoundRender`) and `tools/render-sounds.ts`, the CLI wrapper, producing the output lines in `design.md` exactly (D15).
  - Write `tools/run-sound-render.test.ts` with temporary directories: an empty directory and a directory with only a `*.test.ts` file exit 0. A directory with one `.ts` file exits 1 and names the count.
  - Check: `npm run render:sounds` on the real tree exits 0 and writes nothing.
  - _Requirements: 3.3, 3.4_

- [ ] 10. Add Playwright and the placeholder page test
  - Write `playwright.config.ts` as in `design.md`: `tests/e2e` as the test directory, the `desktop` and `phone` projects, and two `vite preview` servers, one at the root and one with `--base /did-you-hear-that/` (D18).
  - Write `tests/e2e/placeholder-page.spec.ts` with the checks listed in `design.md`, run against both addresses: heading and line from `src/copy`, document title, luminance and contrast, no audio context and no media elements, no other-origin requests, no page errors, and no horizontal scroll at the project viewport and at 360 by 640 (D19).
  - Verify that `vite preview --base` really serves `dist/` under the sub-path. If it does not, serve the sub-path another way without adding a runtime dependency, and record the change in `design.md` under Decisions.
  - Check: `npm run test:e2e` passes from a state with no `dist/`. Temporarily break the build output path, for example by setting `base` to `'/'`, and confirm the sub-path test fails. Then restore it.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 10.1, 10.2, 10.4, 10.6, 10.8, 10.9_

- [ ] 11. Add the repository test
  - Write `tests/repository.test.ts` with the checks listed in `design.md`: READMEs in every layout directory, no TypeScript file outside a module, no runtime dependencies, the `.kiro` paths not ignored, and the licences heading and table header. Run `git` through `node:child_process` with an argument array and no shell (D24).
  - Write `docs/licences.md` first, so the test passes: a `# Licences` heading and the table header `| Asset | Kind | Source | Licence |` with its separator row, and no rows.
  - Check that each failure case is reported. Temporarily add a `.kiro/` line to `.gitignore`, a stray `src/stray.ts` and a `dependencies` entry, one at a time. Confirm each makes the test fail with a clear message, then revert.
  - _Requirements: 1.5, 1.6, 2.7, 13.1, 14.1, 14.2_

- [ ] 12. Add the CI and deploy workflows
  - Write `.github/workflows/ci.yml` as in `design.md`: on every push, read-only contents permission, Node from `.nvmrc` with the npm cache, then `npm ci`, lint, typecheck, test and build as separate steps.
  - Write `.github/workflows/deploy.yml` as in `design.md`: on pushes to `main` and by hand, the job guard on `refs/heads/main`, the three permissions only, concurrency group `pages` without cancelling, the same checks before the build, then `configure-pages`, `upload-pages-artifact` with `path: dist`, and `deploy-pages` in a separate job (D20, D30).
  - Use the current major tag of each `actions/*` action.
  - Check: `npm run lint` still passes, since Prettier formats the YAML. Pushing a branch is part of the final task.
  - _Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 13. Document development in the root README
  - Add a short "Development" section to `README.md`: the Node version from `.nvmrc`, the commands table from `tech.md` plus `typecheck` and `format`, the one-time setting "Settings, Pages, Source: GitHub Actions", and the Linux note `npx playwright install-deps chromium` (D27).
  - Keep the existing sections unchanged apart from the Status line, which may now say that the scaffold exists. Follow `wording.md`.
  - _Requirements: 12.6_

- [ ] 14. Verify the done-when chain on a clean checkout
  - Commit everything, then `git clone` the repository into a new temporary directory.
  - In that clone, with Node 26, run `npm ci && npm run lint && npm test && npm run build && npm run test:e2e`, then `npm run render:sounds` and `npm run check:copy`. All must exit 0.
  - Confirm R1.4 by listing `src/engine/`, `src/audio/synth/`, `src/audio/output/`, `src/session/`, `src/storage/` and `src/robot/`: each holds only `README.md`.
  - Confirm that `package.json` has no `dependencies`, and that `dist/` contains no audio file and no reference to another origin.
  - Delete the temporary clone.
  - Push a branch and confirm the CI run passes. After the Pages source has been set, merge to `main` and confirm that the deployed address shows the placeholder page, both at the Pages URL and when opened directly at its `index.html`.
  - _Requirements: 1.4, 2.6, 11.1, 12.1, 15.1, 15.2_

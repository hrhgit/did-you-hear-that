# tools

Node scripts that serve development: offline sound rendering with a spectrum report, the copy check, and the helpers behind the lint rules in `tools/lint/`. They run TypeScript through `tsx`. None of this code is part of the page.

Code here may import any module under `src/`. It may not import from `tests/`, and nothing outside `tools/` may import from here.

## The render tool

`npm run render:sounds` renders every sound in `src/audio/synth` at 44100 Hz and 48000 Hz with seeds 1 to 10, measures each buffer and checks it against the sound rules: the band, the fades, the duration, the level, the peak and, for the calibration noise, its shape. It plays nothing. `render-sounds.ts` is the command-line wrapper. `run-sound-render.ts` is its core, which reads and writes nothing, and `sound-render/` holds its parts.

It has three modes:

- **Full**, with no arguments. Checks every sound, writes `docs/reports/sounds.md` and prints one line per sound, or one line per broken rule. Exits 1 if any rule broke or a renderer threw.
- **Changed file**, with `-- --changed <path>`, repeatable. Checks only the sounds the paths can change: a sound's own files in `src/audio/synth/` select that sound, any other file under `src/audio/synth/` and the four sound config files in `src/config/` select every sound, and any other path selects nothing. Writes no file.
- **Hook**, with `-- --hook`. Reads the Kiro hook event from standard input, finds the changed paths anywhere in it and checks as in changed-file mode. If the event is missing, empty, not JSON or holds no such path, it checks every sound and says why. On success it prints one line on standard output. On a broken rule it writes every finding to standard error and exits 1, so Kiro sends the findings to the agent. It stops reading standard input after 2 seconds without data. The hook in `.kiro/hooks/render-check-on-synth-save.json` runs this mode when a synthesis or sound config file is saved.

The report holds the worst value of each measure over the seeds, with the seed that gave it, and no date, so it changes only when a sound changes.

Each hook-mode run appends one JSON line to the witness log, `did-you-hear-that-hook-runs.log` in the system's temporary directory (`os.tmpdir()`): the time, the raw hook event cut to 4000 characters, the paths found, the sounds checked and the exit code. The log is evidence that the hook's command ran, written by the command itself. It lives outside the repository and is never committed.

## The copy check

`npm run check:copy` scans every string exported from `src/copy` for the banned terms in `src/config/banned-terms.ts`. `check-copy.ts` is the command-line wrapper and `run-copy-check.ts` its core. It counts the function exports it meets and does not call them: the output of the copy functions is generated text, which `src/copy/result-copy.test.ts`, the other copy tests and the result page's property CP1 check under `npm test`.

- **The one exemption.** `runCopyCheck` takes an option `exemptions`: a file, one export of it, and terms allowed in that export's strings at any depth. `check-copy.ts` gives one, for the fixed limits statement: `src/copy/limits-statement.ts`, the export `limitsStatement`, and `limitsStatementAllowedTerms` from `src/config/banned-terms.ts` (`wording.md`, "One exception"). Every other banned term is still reported there, and the allowed terms are still reported in every other export, including another export of the same file. When an exemption applied, the summary line says to how many strings.
- **Hook mode.** With `-- --hook` the check runs the same way, and `copy-check-streams.ts` (`copyCheckStreams`) decides where its lines go. Without hook mode every line goes to standard output, as before. In hook mode, when the check finds a banned term, every line goes to standard error and the exit code is 1, as the render tool's hook mode does it; when it finds none, it prints its one summary line on standard output and exits with 0. It does not read standard input, because the whole check takes a few seconds and needs no changed path.
- **The copy hook.** `.kiro/hooks/copy-check-on-copy-save.json` runs `npm run --silent check:copy -- --hook` after a TypeScript file under `src/copy/` is saved, in the form of the render hook. Saving `src/config/banned-terms.ts` does not run it. `tests/copy-check-hook.test.ts` checks the hook file: its name, trigger, command and timeout, the paths its matcher takes and does not take, and that the matcher uses no feature the Rust `regex` crate lacks. Exit code 1 with the findings on standard error is how Kiro gives a hook's findings to the agent. Whether they reach the agent in a headless CLI session has not been seen: `docs/experiments/hook-catches.md` records that the render hook ran there and that its findings did not come back to the agent.

---
inclusion: always
---

# Structure

## Layout

```
src/
  config/     Every tunable number in one place (levels, step sizes, timings, rooms)
  engine/     The threshold search. Pure logic, no audio, no DOM, no clock
  audio/
    synth/    Pure functions that turn parameters into sample buffers
    output/   The only code that touches Web Audio. Level cap, channel routing, calibration gain
  session/    The visit as a state machine: entry, calibration, rooms, last door, replay, result, swap repeat
  ui/         Drawing and input. House cross-section, ambient motion, ripples, result page, replay mode
  storage/    Reading and writing past results in local storage
  copy/       Every string the visitor can read
  robot/      Test-only hooks that let an automated listener play the house
tests/
  listeners/  Simulated listeners used by property tests
  properties/ Property-based tests
  e2e/        Playwright tests
tools/        Node scripts: offline sound rendering, spectrum report, copy check
docs/         Architecture, roadmap, spec briefs, licences
.kiro/        Steering, specs, hooks, agents, settings
```

## Dependency rules

These are checked by lint rules once the scaffold exists.

- `engine` imports from `config` only.
- `audio/synth` imports from `config` only.
- `audio/output` imports from `config` and `audio/synth`. Nothing else may import the Web Audio types.
- `session` imports from `engine`, `audio/output`, `storage`, `copy` and `config`.
- `ui` imports from `session`, `copy` and `config`. It never calls `engine` or `audio` directly.
- `robot` is only loaded when the page is opened in robot mode. Production code never imports it.
- Nothing imports from `tests` or `tools`.

## Conventions

- One exported thing per file where practical. File names are kebab-case and match the main export.
- No number that affects sound level, timing or scoring appears outside `src/config`.
- No visitor-facing string appears outside `src/copy`. Strings that depend on results are built by functions in `src/copy` so they can be tested.
- Levels are always in decibels relative to the calibration anchor, in variables whose names end in `Db`. Linear gains have names ending in `Gain`. The two are never mixed in one expression without an explicit conversion function.
- The left and right channels are named `left` and `right` everywhere. No `0` and `1`, no `L` and `R`.
- Unit tests sit next to the file they test as `name.test.ts`. Property tests and simulated listeners live under `tests/`.
- Commits are small and say what changed in the present tense.

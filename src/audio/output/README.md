# src/audio/output

The only code that touches Web Audio. Every sound the product plays goes through this module (audio-safety rule 1). It renders each sound itself from a Sound_Id, applies the output fade, the cap and the rise limit, routes the sound to one ear with exact zeros on the other, and stops all sound on request or when the page is hidden or left. Sound-producing browser APIs are allowed here and nowhere else in `src/`. The design is `.kiro/specs/audio-output/design.md`.

May import from: `config`, `audio/synth`.

## The one entry point

`createAudioOutput({ backend, timer })` in `create-audio-output.ts` returns the output shell. Code outside this module plays sound only through it: `activate` from inside a click or key press, `beginCalibration`, `playCalibrationRepeat` and `keepCalibration` for the calibration, `playHeadphoneCheck`, `beginRoom` and `play` for the rooms, and `stopAll` for the stop control. A caller cannot hand it samples. Every outcome says the level asked for, the level played and the limit that lowered it, if any, and `clampLog` keeps every sound that was played lower than asked.

## Layers

- **The pure core.** `prepare-playback.ts` turns a request (samples, sample rate, ear, requested level, calibration gain, previous gains) into the two channels that will be played, or a refusal. It applies the output fade (`apply-output-fade.ts`), the anchor cap, the rise limit and the absolute ceiling, in that order, and never throws. `render-playable-buffer.ts` renders a sound and renders it again while its peak is above its bound. `room-top-level.ts` and `range-report.ts` give the highest level each room can be played at for a calibration. `calibration-setting-top.ts` and `next-calibration-setting.ts` define the calibration control. `gain-to-decibels.ts` converts a gain to decibels. All of these run under Node.
- **The shell.** `create-audio-output.ts` holds what the core cannot: whether sound may play, the kept calibration, the previous gain on each ear, one sound at a time, the clamp log, and every stop. It reaches the browser only through the `AudioBackend` interface in `audio-backend.ts`, which names no Web Audio type. `output-types.ts` holds the shared types.
- **The backends.** `web-audio-backend.ts` and `output-graph.ts` are the only files that name Web Audio types. The backend creates the `AudioContext` at the device's own rate and turns page events into stops. The graph plays the two channels as they are through one stop gain, whose 20 ms fade brings every channel to exact zero on a stop. `channel-index.ts` is the one place where `left` and `right` become channel 0 and 1. `fake-audio-backend.ts` records every call for the tests under Node. Production code never imports it.

## Where it is checked

Unit tests sit next to each file. The properties CP1 to CP13 are in `tests/properties/audio-output-cp*.property.test.ts`. `tests/e2e/listening-page.spec.ts` checks the Web Audio files in headless Chromium.

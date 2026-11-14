# src/audio/synth

Pure functions that turn parameters into sample buffers: the ghost sounds, the calibration noise and, later, the material for the last door. Each function takes the sample rate and a seeded random generator as parameters and never assumes a fixed sample rate. The same code runs in Node for offline rendering.

Nothing here plays sound. The only code that touches Web Audio is `src/audio/output`, and the lint rules keep it that way.

May import from: `config`.

## The sounds

| Sound id | Room pitch | Sound | Files |
| --- | --- | --- | --- |
| `cellar` | 500 Hz | a dull knock | `cellar-knock-plan.ts`, `cellar-knock.ts` |
| `corridor` | 1 kHz | a hummed note, slightly unsteady | `corridor-hum-plan.ts`, `corridor-hum.ts` |
| `nursery` | 2 kHz | a few notes of a music box | `nursery-music-box-plan.ts`, `nursery-music-box.ts` |
| `stairs` | 4 kHz | a dry scrape | `stairs-scrape-plan.ts`, `stairs-scrape.ts` |
| `attic` | 8 kHz | a thin whine | `attic-whine-plan.ts`, `attic-whine.ts` |
| `calibration` | all five room bands | a steady hiss that the visitor matches to rubbing their hands | `calibration-hiss.ts` |

Each ghost sound stays within one third of an octave around its room's pitch. `sound-renderers.ts` maps every sound id to its render function, `(sampleRate, random) => Float32Array`. Every parameter of every sound lives in `src/config/ghost-sound-config.ts`, and the rules the sounds must meet live in `src/config/audio-safety-config.ts` and `src/config/sound-rules-config.ts`.

## Plan and render

Each ghost sound is made in two steps. The plan function (`*-plan.ts`) draws every random choice from the random source in a fixed order: event times, note order, small changes of pitch and level, phases. It returns a frozen plain object, so the character of a sound can be tested on its plan. The render function checks the sample rate with `validateSampleRate`, calls the plan function, and turns the plan into samples. The calibration noise has no plan: its only random choice is the phases of its noise.

Every render function ends with `finishSound`. It applies the outer raised-cosine fade, so the first and last samples are exactly zero, scales the buffer to the reference RMS, and returns a new `Float32Array`. It throws for a silent buffer, because a silent sound is a bug.

The other helpers are `raised-cosine-ramp.ts`, `event-envelope.ts` (the rise and decay of one knock or note), `shaped-noise.ts` (noise with fixed magnitudes and random phases, made in the frequency domain), `fft.ts` and `dft-any-length.ts` (the transforms), `band-edges.ts`, `decibels-to-gain.ts` and `draw-uniform.ts`.

## measure/

`measure/` holds the code that judges the sounds: the energy inside and outside a band (`spectrum-energies.ts`), the fade lengths (`fade-lengths.ts`), `measureSound`, which fills one measurement of a buffer, and `checkSound`, which returns the rules a measurement breaks. It shares only `fft.ts` and `band-edges.ts` with the synthesis code and does not import the ramps, envelopes or `finishSound`, so the sounds are not judged by the code that made them.

The render tool in `tools/`, the property tests in `tests/properties/` and, later, the output stage in `src/audio/output` use it. The page does not import it.

See `.kiro/specs/ghost-sounds/design.md` for the reasons behind each choice.

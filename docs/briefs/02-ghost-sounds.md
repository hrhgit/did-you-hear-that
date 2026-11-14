# Brief 02: ghost sounds

## Goal

One synthesised sound per room, each confined to a narrow band around the room's pitch, plus the calibration noise. All as pure functions that also run in Node.

## Sounds

| Room | Centre | Character |
|---|---|---|
| Cellar | 500 Hz | A dull knock on wood |
| Corridor | 1 kHz | A hummed note, slightly unsteady |
| Nursery | 2 kHz | A few notes of a music box, all inside the band |
| Stairs | 4 kHz | A dry scrape |
| Attic | 8 kHz | A thin whine |
| Calibration | broadband, shaped like hands rubbing | Steady hiss |

The characters are a starting point. They will be tuned by ear in the IDE after the first version renders.

## Behaviour to specify

- Each function takes the sample rate and a seeded random generator and returns mono samples.
- Energy outside one third of an octave around the centre is at least 30 dB below the energy inside it.
- Every sound fades in and out over at least 20 ms and is no longer than the maximum duration in `src/config`.
- Every ghost sound has the same root-mean-square level, the reference loudness, so that the output stage can treat them alike.
- The same seed gives the same samples.
- Each sound may vary a little from one presentation to the next (timing of knocks, order of notes) so that it does not become a recognisable recording, while staying inside its band.

## Tools

- `npm run render:sounds` renders every sound at 44100 and 48000 Hz, measures band energy, out-of-band energy, fade lengths, duration and level, writes a report to `docs/reports/sounds.md`, and exits with an error if any sound breaks a rule above.
- A way to listen: the dev page gets a plain list of the sounds with play buttons, routed through the output stage once that exists, or through a clearly marked temporary player until then.

## Hook

A hook on saving any file under `src/audio/synth/` runs the render check for the changed sound and reports failures to the agent.

## Properties

- For any seed and either sample rate, each sound meets the band, fade, duration and level rules.

## Out of scope

- The digits and noise for the last door.
- Playback level, panning and the cap. Those belong to the output stage.

## Done when

The report shows all six sounds passing at both sample rates and the hook has been seen to fire on a deliberate bad change, with that run noted in `docs/experiments/hook-catches.md`.

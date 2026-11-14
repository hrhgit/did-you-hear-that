# Design: ghost sounds

## Overview

The house has six sounds. Five are ghost sounds, one per room, each confined to a third of an octave around the room's pitch. The sixth is the calibration noise. Every sound is a pure function from a sample rate and a seeded random source to a `Float32Array` of mono samples at one reference RMS level.

```
  src/config                                    src/config/seeded-random
  audio-safety-config  sound-rules-config            RandomSource
  ghost-sound-config   sound-id                          │
          │                                              │
          ▼                                              ▼
  ┌──────────────────────── src/audio/synth ─────────────────────────┐
  │  plan (random draws)  ──▶  render (samples)  ──▶  finish-sound   │
  │  cellar-knock-plan         cellar-knock          outer fade      │
  │  ...                       ...                   reference RMS   │
  │                                                  Float32Array    │
  │  sound-renderers: Sound_Id ──▶ Render_Function                   │
  │                                                                  │
  │  measure/   fft · band edges · energies · fade lengths ·         │
  │             measureSound · checkSound                            │
  └──────────────────────────────────────────────────────────────────┘
          │                         │                       │
          ▼                         ▼                       ▼
  tools/run-sound-render     tests/properties        (later) src/audio/output
  docs/reports/sounds.md     ghost-sounds-cp*        reuses the fade measurement
          ▲
          │ --hook
  .kiro/hooks/render-check-on-synth-save.json  (PostFileSave)
```

Each sound is built in two steps. A plan function draws every random choice (event times, note order, pitch offsets, phases) from the `RandomSource` and returns a plain frozen object. A render function turns the plan into samples for the given sample rate. Splitting them makes the character rules of R5 testable on the plan, without reading them back out of samples. The last step, `finishSound`, is the same for every sound: it applies the outer raised-cosine fade, scales the buffer to the reference RMS and converts it to `Float32Array`.

The rules are checked by measurement code that lives in `src/audio/synth/measure/`. The render tool, the property tests and, later, the output stage all use it. It shares only the FFT and the band edge function with the synthesis code (D13).

Nothing here plays a sound. The first time anyone hears these sounds is through the listening page of the audio-output spec, behind the level cap.

## Sources

- `docs/briefs/02-ghost-sounds.md`, including the project owner's uncommitted edits: no listening in this spec; the longest sound and the shortest fade come from the steering table and are added to `src/config` here.
- `docs/briefs/03-audio-output.md`, including its uncommitted edits, to see what the next spec needs from this one: the listening page, the absolute ceiling and its property that every rendered sound has fades of at least 20 ms.
- `.kiro/steering/audio-safety.md`, including its new Initial values table: shortest fade 20 ms, longest ghost sound 1.5 s, absolute ceiling 0.25 of full scale. The ceiling belongs to the audio-output spec (D1).
- `.kiro/steering/structure.md`, `tech.md`, `wording.md`, `product.md`, `hearing-method.md`.
- `docs/architecture.md`: the synth module's place, "one function per ghost sound, plus the calibration noise", the hook that renders on save, and the level scale.
- The code: `src/config/hearing-method-config.ts` (the room frequencies and the unit-suffix convention), `src/config/seeded-random.ts`, the lint rules in `tools/lint/`, the stub `tools/run-sound-render.ts` and its test, `tools/render-sounds.ts`, `src/copy/find-banned-terms.ts`, `tests/repository.test.ts` and `vite.config.ts`.
- Kiro documentation, read on 2026-11-14:
  - [Hooks](https://kiro.dev/docs/hooks/) (page dated 12 November 2026): the standalone `.kiro/hooks/<id>.json` format with `"version": "v1"`, the `PostFileSave` example, the field table, and the statements that a command action receives the saved file path and session context as JSON on standard input and that hooks activate when a session starts.
  - [Hook types](https://kiro.dev/docs/hooks/types/) (12 November 2026): the File Save trigger is available in the IDE and in CLI V3, and fires when the agent saves or modifies files matching the pattern.
  - [Hook actions](https://kiro.dev/docs/hooks/actions/) (10 October 2026): on exit code 0 standard output is added to the agent's context; on any other exit code standard error is sent to the agent with a notice that the hook returned an error. Default timeout 60 seconds.
  - [Headless mode](https://kiro.dev/docs/cli/headless/): from CLI 2.27.1, V3 non-interactive runs load hooks from the selected agent and the workspace. A headless run that does not name a harness runs V2, so `--v3` must be given.
  - [Hooks migration from CLI 2.x](https://kiro.dev/docs/cli/v3/hooks-migration/) (6 November 2026): PascalCase trigger names in standalone files, and the CLI 2.x trigger mapping, which has no file triggers.
- The installed CLI on the project machine reports `kiro-cli 3.3.0`.
- Feasibility sketches: before writing this design I ran throwaway Node computations (inline, no files kept) of rough versions of the six sounds and of the measurement in D3 and D4. Their numbers are in "Feasibility" below. They are estimates from sketches, not from the code this spec will write.

## Files

Created:

```
src/config/
  sound-id.ts                         SoundId, GhostSoundId, soundIds, ghostSoundIds
  audio-safety-config.ts              audioSafetyConfig (R1)
  audio-safety-config.test.ts
  sound-rules-config.ts               soundRulesConfig (R2.1)
  sound-rules-config.test.ts
  ghost-sound-config.ts               ghostSoundConfig (R2.2)
  ghost-sound-config.test.ts          R2.3 to R2.7

src/audio/synth/
  fft.ts                              fftInPlace
  fft.test.ts
  band-edges.ts                       bandEdges
  band-edges.test.ts
  validate-sample-rate.ts             validateSampleRate
  validate-sample-rate.test.ts
  raised-cosine-ramp.ts               raisedCosineRamp (synthesis side)
  raised-cosine-ramp.test.ts
  event-envelope.ts                   eventEnvelope
  event-envelope.test.ts
  shaped-noise.ts                     shapedNoise
  shaped-noise.test.ts
  finish-sound.ts                     finishSound
  finish-sound.test.ts
  cellar-knock-plan.ts                planCellarKnock
  cellar-knock.ts                     renderCellarKnock
  cellar-knock.test.ts
  corridor-hum-plan.ts                planCorridorHum
  corridor-hum.ts                     renderCorridorHum
  corridor-hum.test.ts
  nursery-music-box-plan.ts           planNurseryMusicBox
  nursery-music-box.ts                renderNurseryMusicBox
  nursery-music-box.test.ts
  stairs-scrape-plan.ts               planStairsScrape
  stairs-scrape.ts                    renderStairsScrape
  stairs-scrape.test.ts
  attic-whine-plan.ts                 planAtticWhine
  attic-whine.ts                      renderAtticWhine
  attic-whine.test.ts
  calibration-hiss.ts                 renderCalibrationHiss
  calibration-hiss.test.ts
  sound-renderers.ts                  soundRenderers
  sound-renderers.test.ts
  measure/
    measurement-types.ts              SoundMeasurement, BrokenRule, RuleName
    spectrum-energies.ts              spectrumEnergies
    spectrum-energies.test.ts
    fade-lengths.ts                   measureFadeLengths
    fade-lengths.test.ts
    measure-sound.ts                  measureSound
    measure-sound.test.ts
    check-sound.ts                    checkSound
    check-sound.test.ts

tools/sound-render/
  parse-render-arguments.ts           parseRenderArguments
  parse-render-arguments.test.ts
  sounds-for-changed-path.ts          soundsForChangedPath
  sounds-for-changed-path.test.ts
  hook-event-paths.ts                 hookEventPaths
  hook-event-paths.test.ts
  measure-sounds.ts                   measureSounds (render and measure over rates and seeds)
  measure-sounds.test.ts
  format-sound-report.ts              formatSoundReport
  format-sound-report.test.ts

tests/properties/
  sound-arbitraries.ts                seed, sample rate and sound arbitraries
  ghost-sounds-cp1-report-rates.property.test.ts
  ghost-sounds-cp2-other-rates.property.test.ts
  ghost-sounds-cp3-same-seed.property.test.ts
  ghost-sounds-cp4-different-seeds.property.test.ts
  ghost-sounds-cp5-rejected-rates.property.test.ts
  ghost-sounds-cp6-plans.property.test.ts
  ghost-sounds-cp7-measurement.property.test.ts
  ghost-sounds-cp8-changed-paths.property.test.ts
  ghost-sounds-regressions.test.ts    counterexamples, empty at first

tests/render-check-hook.test.ts       R14.5

.kiro/hooks/render-check-on-synth-save.json
docs/reports/sounds.md                written by the render tool
docs/experiments/hook-catches.md      written by hand in the hook demonstration
```

Replaced: `tools/run-sound-render.ts` and `tools/run-sound-render.test.ts` (the stub and its tests, D27), and the body of `tools/render-sounds.ts`.

Changed: `src/audio/synth/README.md`, `tools/README.md`, `docs/README.md`.

Not changed: every lint rule, `eslint.config.js`, `package.json` (the `render:sounds` script already runs `tsx tools/render-sounds.ts`), the CI workflow (D23), `.gitignore` (nothing new is written inside the repository except the tracked report), and every file the project owner edited.

## Config

### `src/config/sound-id.ts`

```ts
export type GhostSoundId = "cellar" | "corridor" | "nursery" | "stairs" | "attic";
export type SoundId = GhostSoundId | "calibration";
/** In floor order, from the cellar up. Matches hearingMethodConfig.roomFrequenciesHz.full. */
export const ghostSoundIds: readonly GhostSoundId[];
/** The ghost sounds in floor order, then "calibration". */
export const soundIds: readonly SoundId[];
```

The ids are code names. The room names a visitor reads live in `src/copy` and arrive with the house-interface spec.

### `src/config/audio-safety-config.ts`

```ts
export interface AudioSafetyConfig {
  /** Shortest fade in and fade out of any sound. */
  readonly fadeMinMs: number;
  /** Longest single ghost sound. Also applied to the calibration noise (D8). */
  readonly ghostSoundMaxDurationMs: number;
}
export const audioSafetyConfig: AudioSafetyConfig = deepFreeze({
  // "Shortest fade in and fade out | 20 ms"
  fadeMinMs: 20,
  // "Longest ghost sound | 1.5 s"
  ghostSoundMaxDurationMs: 1500,
});
```

The file's own comment says the values come from the Initial values table in `.kiro/steering/audio-safety.md`, that they may be made stricter at any time, and that loosening one needs the project owner's approval. The audio-output spec adds the absolute ceiling to this interface (D1). The unit test holds the exact values, the unit suffixes, and two loosening guards with the message of R1.5: `fadeMinMs >= 20` and `ghostSoundMaxDurationMs <= 1500`.

`deepFreeze` exists today as a private function in `hearing-method-config.ts`. Each new config file gets its own copy. Sharing it would need a new exported file in `src/config`, and three copies of a seven-line function are cheaper than another module to keep in step. If a fourth copy is needed, it moves into its own file.

### `src/config/sound-rules-config.ts`

| Field | Value | Source |
|---|---|---|
| `bandWidthOctaveFraction` | 1/3 | Brief: "one third of an octave around the centre" (D2) |
| `outOfBandBelowInBandMinDb` | 30 | Brief: "at least 30 dB below" |
| `referenceRmsFraction` | 0.05 | D7. RMS as a fraction of full scale, about 26 dB below it |
| `levelToleranceDb` | 0.01 | D7 |
| `spectrumBinWidthMaxHz` | 0.5 | D3 |
| `sampleRateMinHz` | 22050 | D12 |
| `bandEdgeMarginOctaveFraction` | 1/24 | D10. Design margin between any planned frequency and a band edge, checked in config tests only |
| `calibrationShapeDb` | cellar −9, corridor −6, nursery −3, stairs 0, attic −2 | D8. A starting guess with no source |
| `calibrationShapeToleranceDb` | 1 | D8 |

`calibrationShapeDb` is a record keyed by `GhostSoundId`. Its largest value is 0, and the test checks that.

### `src/config/ghost-sound-config.ts`

One entry per sound. All times in milliseconds, frequencies in hertz, level ranges in decibels, depths as fractions. Every value is a starting point to be tuned by ear once the audio-output listening page exists. The values below are the ones the feasibility sketches used, adjusted for D5 and D6.

| Sound | Field | Value |
|---|---|---|
| all ghost sounds | `centreHz` | cellar 500, corridor 1000, nursery 2000, stairs 4000, attic 8000 |
| cellar | `durationMs`, `outerFadeMs` | 900, 30 |
| | `knockCount` | 3 |
| | `firstKnockOnsetMinMs`, `firstKnockOnsetMaxMs` | 30, 70 |
| | `knockIntervalMinMs`, `knockIntervalMaxMs` | 220, 320 |
| | `knockAttackMs`, `knockDecayMs` | 25, 90 |
| | `knockCarrierDeviationMaxFraction` | 0.01 |
| | `knockLevelRangeDb` | 3 (each knock from −3 to 0 dB) |
| corridor | `durationMs`, `outerFadeMs` | 1200, 30 |
| | `bodyAttackMs`, `bodyReleaseMs` | 150, 200 |
| | `pitchWobbleSinusoidCount`, `pitchWobbleDepthFraction` | 2, 0.0075 for each of the two slow sinusoids (D30) |
| | `pitchWobbleRateMinHz`, `pitchWobbleRateMaxHz` | 2, 5 |
| | `levelWobbleDepthFraction` | 0.2 |
| | `levelWobbleRateMinHz`, `levelWobbleRateMaxHz` | 1.5, 3 |
| nursery | `durationMs`, `outerFadeMs` | 1400, 30 |
| | `noteCount` | 4 |
| | `noteFrequenciesHz` | 2000 × 2^(k/12) for k = −1, 0, 1 (1887.7, 2000, 2118.9) |
| | `firstNoteOnsetMinMs`, `firstNoteOnsetMaxMs` | 30, 50 |
| | `noteIntervalMinMs`, `noteIntervalMaxMs` | 240, 290 |
| | `noteAttackMs`, `noteDecayTimeConstantMs`, `noteLengthMs`, `noteReleaseMs` | 25, 120, 400, 60 |
| stairs | `durationMs`, `outerFadeMs` | 800, 80 (50 in the first version of this design, changed by D37) |
| | `noiseHalfWidthOctaveFraction`, `noiseTaperOctaveFraction` | 1/12, 1/24 |
| | `grainLengthMinMs`, `grainLengthMaxMs` | 40, 60 |
| | `grainSpacingMinMs`, `grainSpacingMaxMs` | 20, 40 |
| | `grainLevelRangeDb` | 8 |
| attic | `durationMs`, `outerFadeMs` | 1200, 30 |
| | `bodyAttackMs`, `bodyReleaseMs` | 200, 300 |
| | `carrierDeviationMaxFraction` | 0.005 |
| | `pitchWobbleDepthFraction` | 0.005 |
| | `pitchWobbleRateMinHz`, `pitchWobbleRateMaxHz` | 3, 6 |
| calibration | `durationMs`, `outerFadeMs` | 1500, 50 |
| | `lowCutStartHz`, `lowCutEndHz` | 250, 354 (raised-cosine rise in log frequency) |
| | `highCutStartHz`, `highCutEndHz` | 11314, 16000 (raised-cosine fall in log frequency). There are no bins above the Nyquist frequency, so at rates below 32000 Hz the noise simply stops there. The five room bands lie below 8980 Hz and are complete at every supported rate |

Config tests (R2.3 to R2.7):

- The five `centreHz` values in `ghostSoundIds` order equal `hearingMethodConfig.roomFrequenciesHz.full`.
- Every `durationMs` is at most `ghostSoundMaxDurationMs`. Every `outerFadeMs` is at least `fadeMinMs`.
- Every attack the parameters allow is at least `fadeMinMs`: `knockAttackMs`, `noteAttackMs`, `bodyAttackMs`, and half of `grainLengthMinMs` (a grain's sine-squared envelope peaks at its middle) (D5).
- The last event ends before the outer fade-out begins in the longest plan: cellar `firstKnockOnsetMaxMs + (knockCount − 1) × knockIntervalMaxMs + knockAttackMs + knockDecayMs ≤ durationMs − outerFadeMs`, and the same for the nursery notes.
- Every frequency a plan can produce lies inside the band by at least `bandEdgeMarginOctaveFraction` on both sides: cellar `centreHz × (1 ± knockCarrierDeviationMaxFraction)`; corridor `centreHz × (1 ± 2 × pitchWobbleDepthFraction)`; every nursery note; stairs `centreHz × 2^(±(noiseHalfWidthOctaveFraction + noiseTaperOctaveFraction))`; attic `centreHz × (1 ± carrierDeviationMaxFraction) × (1 ± pitchWobbleDepthFraction)`. Distances are compared in octaves with a tolerance of 10⁻⁹ octave, because the stairs taper ends exactly on the margin (1/12 + 1/24 = 1/6 − 1/24).
- `ghostSoundMaxDurationMs < hearingMethodConfig.responseWindowMs` (D24).
- The calibration cut frequencies are ordered, and `highCutStartHz` is above the upper band edge of the attic.
- Every field name ends in `Db`, `Ms`, `Hz`, `Fraction` or `Count`. Every object is frozen.

## Synthesis

### Shared helpers

`validateSampleRate(sampleRateHz: number): void` throws a `RangeError` when the value is not finite or is below `sampleRateMinHz`. The message names the value and the lowest supported rate. Every Render_Function calls it first, before drawing any random number.

`bandEdges(centreHz: number, widthOctaveFraction: number): { lowHz: number; highHz: number }` returns `centreHz × 2^(−w/2)` and `centreHz × 2^(w/2)`. For the shipped width: 500 Hz gives 445.4 to 561.2 Hz, 8000 Hz gives 7127.2 to 8979.7 Hz.

`raisedCosineRamp(u: number): number` returns 0 for u ≤ 0, `(1 − cos(πu)) / 2` for 0 < u < 1, and 1 for u ≥ 1.

`eventEnvelope(timeMs, attackMs, decay)` gives an event's own envelope: a raised-cosine rise over `attackMs`, then the decay. The cellar knock decays with a raised-cosine fall over `knockDecayMs`. The nursery note decays as `(1 + t/τ) exp(−t/τ)`, with τ = `noteDecayTimeConstantMs` (D35), multiplied by a raised-cosine release over its last `noteReleaseMs`, so it reaches exactly zero at `noteLengthMs`. Both shapes have zero slope where they meet, which keeps their spectra narrow.

`shapedNoise(sampleCount, sampleRateHz, gainAtHz, random): Float64Array` builds noise in the frequency domain (D11). It takes the transform length M as `sampleCount` itself, so the noise is exactly one buffer long (D36; the first version of this design used the smallest power of two at least `sampleCount` and kept the first `sampleCount` samples). For each bin k with 1 ≤ k < M/2 it sets the magnitude to `gainAtHz(k × sampleRate / M)` and draws a phase uniformly from 0 to 2π, sets the conjugate bin, and runs the inverse transform. Bin 0 and, for even M, bin M/2 stay zero. The magnitudes are fixed. Only the phases are random.

`finishSound(samples: Float64Array, sampleRateHz: number, outerFadeMs: number): Float32Array`:

1. Multiplies sample n by `raisedCosineRamp(n / F) × raisedCosineRamp((N − 1 − n) / F)`, where F is `outerFadeMs × sampleRate / 1000` (not rounded) and N the sample count. The first and last samples become exactly zero.
2. Computes the RMS over all N samples. If it is zero it throws an `Error`, because a silent sound is a bug.
3. Scales every sample by `referenceRmsFraction / rms`.
4. Copies into a new `Float32Array`.

### The sounds

Each Render_Function has the signature `(sampleRate: number, random: RandomSource) => Float32Array`. It validates the rate, calls its plan function with `random`, renders the plan into a `Float64Array` of `floor(durationMs × sampleRate / 1000)` samples (D9), and returns `finishSound(...)`. Parameters come from `ghostSoundConfig` and `soundRulesConfig` (D15).

Each plan function takes only `random` and returns a frozen object. All of its random draws happen in a fixed order, so a seed always produces the same plan.

**Cellar, a dull knock.** `planCellarKnock` draws the first onset uniformly from `firstKnockOnsetMinMs` to `firstKnockOnsetMaxMs`, then `knockCount − 1` intervals from `knockIntervalMinMs` to `knockIntervalMaxMs`. For each knock it draws a carrier `centreHz × (1 + d)` with d uniform within ±`knockCarrierDeviationMaxFraction`, a level from −`knockLevelRangeDb` to 0 dB, and a start phase. Each knock is a sine burst with `eventEnvelope` (25 ms rise, 90 ms raised-cosine fall). The knock cannot be sharp. At 500 Hz the band is 116 Hz wide, and the sketches show that a 10 ms rise already puts 23 dB out of band where the rule needs 30 (see Feasibility). The character is a soft, low thud.

**Corridor, a hummed note, slightly unsteady.** `planCorridorHum` draws the two pitch wobble rates and phases, the level wobble rate and phase, and the start phase. The render integrates the instantaneous frequency `centreHz × (1 + a sin(2π r₁ t + φ₁) + a sin(2π r₂ t + φ₂))` into a phase. It multiplies by a body envelope (raised-cosine rise over `bodyAttackMs`, fall over `bodyReleaseMs`) and by `1 − depth × (0.5 + 0.5 sin(2π r t + φ))` for the level wobble. There are no harmonics, because they would fall outside the band.

**Nursery, a few notes of a music box.** `planNurseryMusicBox` draws the first onset and `noteCount − 1` intervals. For each note it picks one of `noteFrequenciesHz`, choosing uniformly among those that differ from the previous note, and draws a start phase. Each note is a sine with the note envelope above. The three pitches a semitone apart give a small, slightly wrong-sounding chromatic tune.

**Stairs, a dry scrape.** `planStairsScrape` draws grain start times from 0, each one `grainSpacingMinMs` to `grainSpacingMaxMs` after the last, until the next start would be at or after `durationMs − grainLengthMinMs`. For each grain it draws a length from `grainLengthMinMs` to `grainLengthMaxMs` and a level from −`grainLevelRangeDb` to 0 dB. The random phases for the noise are drawn by `shapedNoise` after the plan. The noise gain is 1 within `noiseHalfWidthOctaveFraction` of the centre and falls with a raised-cosine taper to 0 over the next `noiseTaperOctaveFraction`, measured in octaves. The envelope is the sum of `level × sin²(π t / length)` over all grains, multiplied into the noise. The grain count depends on the spacings drawn, so this is the one sound whose event count varies (D10).

**Attic, a thin whine.** `planAtticWhine` draws a carrier deviation within ±`carrierDeviationMaxFraction`, a wobble rate and phase, and a start phase. The render is one sine whose frequency wobbles by ±`pitchWobbleDepthFraction`, with a body envelope of 200 ms rise and 300 ms fall.

**Calibration, a steady hiss.** No plan. `shapedNoise` with a gain that follows `calibrationShapeDb`. Between the five room centres, the gain in decibels is interpolated linearly in log frequency. Below 500 Hz and above 8 kHz it holds the end values. Because a third-octave band holds a number of bins proportional to its centre frequency, the per-bin amplitude is `10^(L(f)/20) / sqrt(f / 1000)`, so that the band energies follow the shape. The low cut and the high cut multiply this. There is no level change apart from the outer fade (R5.6).

`soundRenderers` is the frozen record `{ cellar: renderCellarKnock, corridor: renderCorridorHum, nursery: renderNurseryMusicBox, stairs: renderStairsScrape, attic: renderAtticWhine, calibration: renderCalibrationHiss }`.

## Measurement

All in `src/audio/synth/measure/`. Pure functions over a `Float32Array` or `Float64Array`. Inputs are not modified.

### Types

```ts
export type RuleName = "band" | "fadeIn" | "fadeOut" | "duration" | "level" | "peak" | "calibrationShape";

export interface SoundMeasurement {
  readonly soundId: SoundId;
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly firstSample: number;
  readonly lastSample: number;
  readonly durationMs: number;
  readonly rmsFraction: number;
  readonly levelDeviationDb: number;
  readonly peakFraction: number;
  readonly crestFactorDb: number;
  readonly fadeInMs: number;            // 0 when the buffer is all zeros
  readonly fadeOutMs: number;
  /** Ghost sounds only, otherwise null. */
  readonly inBandShareFraction: number | null;
  readonly outOfBandRatioDb: number | null;   // +Infinity when there is no in-band energy
  /** Calibration only, otherwise null. Band level of each room band, relative to the loudest. */
  readonly roomBandLevelsDb: Readonly<Record<GhostSoundId, number>> | null;
  readonly calibrationShapeDistanceMaxDb: number | null;
}

export interface BrokenRule {
  readonly rule: RuleName;
  readonly measured: number;
  readonly limit: number;
  readonly description: string;   // for example "out-of-band energy -27.4 dB, limit -30 dB"
}
```

The `peak` rule is R9.2 (below full scale). R7.1, exact zero at both ends, is part of the `fadeIn` and `fadeOut` rules: a first or last sample that is not zero breaks them, with the sample value as the measured value.

### `spectrumEnergies(samples, sampleRateHz, bands)` (D3)

Takes M as the smallest power of two at least `max(N, sampleRate / spectrumBinWidthMaxHz)`, zero-pads, and runs `fftInPlace`. One-sided energy per bin k from 0 to M/2 is `(re² + im²) / M`, doubled for every bin except 0 and M/2. That is Parseval's sum, so the total equals the sum of squared samples. A bin belongs to a band when `k × sampleRate / M` lies inside it, edges included. The function returns the total energy and the energy of each requested band.

### `measureFadeLengths(samples, sampleRateHz)` (D4)

```
P  = largest |x[n]|
n0 = first n with x[n] ≠ 0
for n from n0 while the running peak is below P, and once more at the first n where it reaches P:
    m(n)  = largest |x[k]| for k from n0 to n
    u(n)  = rampInverse(m(n) / P)        where rampInverse(y) = acos(1 − 2y) / π
    if u(n) > 0: candidate(n) = (n − n0 + 1) / u(n)     (in samples)
fadeIn = smallest candidate, converted to milliseconds
fadeOut = the same on the reversed buffer
```

It is the longest raised-cosine ramp, started at the first non-zero sample, that the running peak never rises above. A sound that reaches its peak at time t after its onset has a fade of at most t. A sound that jumps from exact silence to full level has a fade of one sample. The measurement keeps its own `rampInverse` and does not import `raisedCosineRamp` from the synthesis side (R11.3).

### `measureSound(samples, sampleRateHz, soundId)` and `checkSound(measurement)`

`measureSound` fills a `SoundMeasurement`. For a ghost sound it asks `spectrumEnergies` for its band. For the calibration noise it asks for the five room bands and gives each band level as `10 log10(energy / largest energy)`. `calibrationShapeDistanceMaxDb` is the largest `|level − calibrationShapeDb[id]|`.

`checkSound` returns the broken rules in this order:

| Rule | Broken when | Applies to |
|---|---|---|
| `band` | `outOfBandRatioDb > −outOfBandBelowInBandMinDb`, including +Infinity | ghost sounds |
| `fadeIn` | first sample not zero, or `fadeInMs < fadeMinMs` | all |
| `fadeOut` | last sample not zero, or `fadeOutMs < fadeMinMs` | all |
| `duration` | `durationMs > ghostSoundMaxDurationMs` | all |
| `level` | `|levelDeviationDb| > levelToleranceDb`, or the RMS is zero | all |
| `peak` | `peakFraction >= 1` | all |
| `calibrationShape` | `calibrationShapeDistanceMaxDb > calibrationShapeToleranceDb` | calibration |

An all-zero buffer breaks `fadeIn`, `fadeOut` and `level` and, for a ghost sound, `band` (R6.2, R7.4).

## The render tool

### Interface

`tools/render-sounds.ts` is the command-line wrapper. It parses `process.argv`, reads standard input in hook mode, calls `runSoundRender`, writes the files the result asks for, prints the lines, and sets `process.exitCode`.

`tools/run-sound-render.ts` is the testable core. It writes no file and reads nothing from the process:

```ts
export interface SoundRenderInput {
  readonly arguments: readonly string[];        // process.argv.slice(2)
  readonly hookInput: string | undefined;       // standard input in hook mode, undefined if it was a terminal
  readonly nowIso: string;                      // only used in the witness line
  readonly witnessLogPath: string;              // only printed and returned
  readonly renderers?: Readonly<Record<SoundId, RenderFunction>>;  // tests inject broken renderers
}

export interface SoundRenderResult {
  readonly exitCode: 0 | 1;
  readonly stdoutLines: readonly string[];
  readonly stderrLines: readonly string[];
  readonly report: string | undefined;          // full mode only
  readonly witnessLine: string | undefined;     // hook mode only
}
```

Arguments: none (full mode), `--changed <path>` (repeatable), or `--hook`. Anything else exits 1 with a usage line on standard error.

`measureSounds(soundIds, renderers)` renders each sound at 44100 and 48000 Hz with seeds 1 to 10 (`createSeededRandom(seed)` for each), measures and checks each buffer, and catches a throwing renderer as a finding. The seeds and rates are constants of the tool (D16).

### Full mode

Writes `docs/reports/sounds.md` (the wrapper creates `docs/reports/` if needed) whether or not a rule broke. Prints `render:sounds: <sound>: every rule met at 44100 and 48000 Hz over 10 seeds.` per sound, or one line per broken rule: `render:sounds: <sound> at <rate> Hz, seed <s>: <description>.` Exits 1 if any rule broke or any renderer threw.

The report:

```
# Ghost sounds report

Written by `npm run render:sounds`. Do not edit by hand. Each sound is rendered at 44100 Hz
and 48000 Hz with seeds 1 to 10, and each row shows the worst value over those seeds, with
the seed in brackets. The property tests check the same rules for random seeds.

## Rules
| Rule | Limit | Source |
| Band | out-of-band energy at least 30 dB below in-band energy, band one third of an octave | Brief 02 |
| Fade | at least 20 ms in and out, first and last sample zero | audio-safety.md, rule 3 |
| Duration | at most 1500 ms | audio-safety.md, rule 6 |
| Level | RMS within 0.01 dB of 0.05 of full scale | Brief 02, D7 |
| Peak | below full scale | D7 |
| Calibration shape | each room band within 1 dB of the configured shape | D8 |

## Results
| Sound | Rate | In-band share | Out-of-band | Fade in | Fade out | Duration | Level | Peak | Crest factor | Shape | Rules |
| cellar | 44100 | 99.99 % (3) | -46.2 dB (7) | 25.0 ms (2) | ... | ... | meets every rule |

## Notes
- The calibration shape is a starting guess with no measured source. It is tuned by ear later.
- Crest factor has no limit here. It decides how close a sound can come to the absolute
  ceiling, which the audio-output spec enforces.
- Nothing in this report says how loud a sound is at the ear. Levels are relative to full scale.
```

Numbers are formatted with a fixed number of decimals (one for dB and ms, two for percentages, three for peak), so the file changes only when a sound changes. The "Rules" column reads "meets every rule" or "breaks: band, fade out". The report and all printed lines avoid every banned term (D22).

### Changed-file mode

For each path, `soundsForChangedPath(path)` (D17) returns a set of Sound_Ids, or "every sound", or nothing. The path is normalised first: backslashes become slashes, and anything up to and including the last occurrence of `src/` that is followed by `audio/synth/` or `config/` is cut, so absolute and relative paths give the same answer.

- `audio/synth/<name>.ts` or `audio/synth/<name>.test.ts` where `<name>` starts with `<sound id>-`: that sound. `calibration-hiss.ts` maps to `calibration`.
- Any other `.ts` file under `audio/synth/`, including `measure/`: every sound.
- `config/audio-safety-config.ts`, `config/sound-rules-config.ts`, `config/ghost-sound-config.ts`, `config/sound-id.ts`: every sound.
- Anything else: nothing.

The union over all paths is checked with the same rates and seeds. No report is written. Output as in full mode. When nothing is selected: `render:sounds: <path> cannot change a sound. Nothing checked.` and exit 0.

### Hook mode

`hookEventPaths(hookInput)` parses the JSON and walks it, collecting every string value that contains `src/audio/synth/` or one of the four config paths (D18). If the input is undefined, empty, not JSON, or yields no path, every sound is checked, and the first output line says why, for example `render:sounds: the hook event held no synthesis path, so every sound is checked.`

Then it behaves as changed-file mode, with two differences:

- When a rule broke or a renderer threw, every finding goes to standard error and the exit code is 1. Kiro sends standard error to the agent with a notice that the hook returned an error. On success, the one summary line goes to standard output, which Kiro adds to the agent's context.
- `witnessLine` is one JSON object on one line: `{"time": nowIso, "hookInput": <first 4000 characters>, "paths": [...], "sounds": [...], "exitCode": n}`. The wrapper appends it to `witnessLogPath`, which is `path.join(os.tmpdir(), "did-you-hear-that-hook-runs.log")`, and the last output line names that path.

The wrapper reads standard input only in hook mode and only when `process.stdin.isTTY` is not true. It stops reading at the end of the stream or after 2 seconds without data, whichever comes first, so a hook runner that keeps standard input open cannot hang the check until its timeout.

### Running time

From the sketches, a 131072-point FFT takes about 4 ms in Node 26 and a 524288-point one about 17 ms. A full run is 120 renders and measurements, an estimated 2 to 5 seconds, plus about a second to start `tsx`. A hook run for one sound is 20 of them. The hook's timeout is 120 seconds.

## The hook

`.kiro/hooks/render-check-on-synth-save.json`:

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Render check on synthesis save",
      "description": "Renders the changed ghost sound at 44100 and 48000 Hz and checks the band, fade, duration and level rules. Findings go to the agent. See .kiro/specs/ghost-sounds/design.md.",
      "trigger": "PostFileSave",
      "matcher": "(^|/)src/(audio/synth/.+|config/(audio-safety-config|sound-rules-config|ghost-sound-config|sound-id))\\.ts$",
      "action": { "type": "command", "command": "npm run --silent render:sounds -- --hook" },
      "timeout": 120
    }
  ]
}
```

`tests/render-check-hook.test.ts` reads the file and checks the version, the single hook, the trigger, the action, the timeout, that there is no `confirm` and no `enabled: false`, and the matcher. Using JavaScript's `RegExp` on the matcher string, it must match `src/audio/synth/cellar-knock.ts`, `src/audio/synth/measure/fade-lengths.ts`, `src/audio/synth/cellar-knock.test.ts`, `/Users/someone/repo/src/audio/synth/attic-whine.ts`, `src/config/ghost-sound-config.ts`, and must not match `src/audio/output/play.ts`, `src/config/hearing-method-config.ts`, `src/audio/synth/README.md`, `docs/src/audio/synth.ts`, `src/audio/synthesis/x.ts`. A second check confirms that the matcher contains none of the features the Rust `regex` crate lacks: lookaround, backreferences, possessive quantifiers.

### The hook in a headless CLI session

The question is whether the hook can be shown to fire in a headless CLI session. According to the documentation it should, but this has not yet been observed in this repository.

What the documentation says, as read on 2026-11-14:

- The File Save trigger is available in the IDE and in CLI V3. In the CLI it does not exist under V2.
- From CLI 2.27.1, V3 non-interactive runs load hooks from the workspace. The installed CLI is 3.3.0.
- A headless run that does not name a harness runs V2. The roadmap's command already passes `--v3`.
- Hooks activate when a session starts.
- The trigger fires when the agent saves or modifies a matching file.
- A command action gets the saved path and session context as JSON on standard input. The exact field names for file events are not documented.

What follows for the demonstration (R15, D19):

1. The hook file must be committed, or at least present on disk, before the session that makes the bad change starts. The session that writes the hook cannot be the one that shows it firing.
2. The bad change must be made with the agent's file-writing tool, not with a shell command such as `sed`. The documentation ties the trigger to the agent saving a file. Whether a file changed by a shell command counts is not stated, and the demonstration should not depend on it.
3. The run must give `--v3` and must trust the file-writing tools. A write that is refused saves nothing, and then nothing fires. The hook itself asks for no confirmation, so `--trust-tools` is enough for it. Shell access is not needed and is not granted, so the write can only come from the file tools.
4. The agent's own account is not evidence that the hook fired. The witness line that Hook_Mode appends to the Hook_Witness_Log is. It is written by the hook's command, not by the agent, and it records the raw event, which also settles the undocumented field names.
5. The run's output is captured with `--output-format stream-json` as secondary evidence. The documentation does not say whether hook runs appear in that stream.

The command for the headless demonstration, run from the repository root with the hook file already present:

```bash
kiro-cli chat --v3 --no-interactive --model claude-opus-5.5 \
  --trust-tools=read_file,fs_write,str_replace \
  --output-format stream-json \
  "In src/audio/synth/attic-whine.ts, remove the call that applies the outer fade, so the sound starts at full level. Save the file. Report exactly what the render-check hook told you. Then restore the file exactly as it was and save it again. Do not run any shell command." \
  > "$TMPDIR/hook-demo-stream.jsonl"
```

The tool ids are those of CLI 3.3.0 as seen in this repository's sessions. If the CLI rejects one, the actual ids used go into the record. The deliberate change takes out a fade. It plays nothing, and it breaks the `fadeIn` and `fadeOut` rules so plainly that no tuning could be mistaken for it.

What `docs/experiments/hook-catches.md` records in every case:

- the date, the surface (CLI headless or IDE) and the version (`kiro-cli --version`, or the IDE version)
- the exact command line, or the IDE action taken
- the hook file's content hash (`git hash-object .kiro/hooks/render-check-on-synth-save.json`) and the commit it was in when the session started
- the deliberate change as a diff, and the tool that made it, taken from the stream
- the number of lines in the Hook_Witness_Log before and after the session, and the new lines in full
- the findings the agent reported, quoted from the stream
- confirmation that the file was restored (`git status` and `git diff` clean for that file)

If the witness log gains no line during the headless session, the record also says:

- in these words: "The hook was not seen to fire in a headless CLI session."
- the stream lines around the file write, and any lines that mention hooks
- the output and exit code of `npm run render:sounds -- --changed src/audio/synth/attic-whine.ts`, run by hand with the same bad change applied and then reverted. This shows the check catches the change, while the trigger is what is in question
- the output of `echo '{"path":"src/audio/synth/attic-whine.ts"}' | npm run --silent render:sounds -- --hook` with the bad change applied. This shows that the hook's command works when it is called
- what was tried next: the PostToolUse fallback of D20, then the IDE

The Done-when line of the brief is met only by a run in which the witness log shows the hook firing on the deliberate change. If no surface shows that, the record says so and the criterion stays open. It is not reported as met.

## Feasibility

The sketches rendered rough versions of the sounds at 22050, 44100, 48000 and 96000 Hz with six seeds each and measured them as in D3 and D4. The worst values over seeds and rates:

| Sketch | Out-of-band | Fade, shortest | Crest factor |
|---|---|---|---|
| Cellar, 3 knocks, 25 ms rise, 90 ms fall, 30 ms outer fade | −46.1 dB | 24.9 ms | 12.4 dB |
| Corridor, wobbling hum | −97.1 dB | 150 ms | 4.9 dB |
| Nursery, 4 notes a semitone apart, 20 ms rise | −60.5 dB | 21.1 ms | 10.9 dB |
| Stairs, noise ±1/12 octave, sine-squared grains 30 to 50 ms, 30 ms outer fade | −70.0 dB | **18.9 ms** | 17.6 dB |
| Attic, wobbling whine | −149.5 dB | 200 ms | 4.3 dB |
| Calibration, random-amplitude noise | shape within 0.95 dB | 31.4 ms | 20.5 dB |

Single-variable sketches at 500 Hz (a knock with a 60 ms decay) put the energy outside the band at −40.7 dB for a 20 ms rise, −23.2 dB for 10 ms, and −17.9 dB for 5 ms. The same sine-squared grain scrape that reaches −72 dB at 4 kHz only reaches −18 to −22 dB at 500 Hz. Every time feature has to be slower in the low rooms, because the band's width in hertz is proportional to its centre.

What changed in the design because of these numbers:

- The scrape's fade fell below 20 ms with a 30 ms outer fade. The noise sounds get a 50 ms outer fade (D6), and grains are at least 40 ms long so that each grain's rise is at least 20 ms (D5).
- Noise with random amplitudes had crest factors up to 20.5 dB. The design uses fixed magnitudes with random phases (D11).
- Every event's rise is at least the shortest fade (D5). At 500 Hz this is also what the band rule needs.

## Error handling

| Situation | Behaviour |
|---|---|
| Sample rate below 22050 Hz, NaN or infinite | `RangeError` before any random draw, naming the rate and the lowest supported rate |
| A render produces silence (a bug) | `finishSound` throws an `Error` |
| A renderer throws inside the tool | Reported as a finding with sound, rate, seed and message. Exit 1 |
| Unknown tool argument | Usage line on standard error. Exit 1 |
| Hook input missing, not JSON, or without a synthesis path | Every sound is checked. The reason is printed |
| Changed path that cannot affect a sound | One line, exit 0 |
| Standard input left open by the hook runner | Reading stops after 2 seconds without data |
| `docs/reports/` missing | The wrapper creates it |
| Witness log not writable | The wrapper prints a warning to standard error and keeps the exit code of the check |

## Correctness properties

"Universal" properties use fast-check with a new random seed on every run (R16.5). Run counts are per sound and chosen so that the whole suite stays near half a minute (D21). Seeds are drawn from 0 to 2³² − 1. The brief's one property, "for any seed and either sample rate, each sound meets the band, fade, duration and level rules", is CP1. CP2 to CP8 guard the parts of it that sampling alone would miss.

**CP1. Every sound meets its rules at 44100 and 48000 Hz** (Universal, 100 runs per sound; R6.1, R7.1, R7.2, R8.1, R9.1, R9.2, R10.1, R10.3, R16.1; brief property). For each Sound_Id, any seed and a sample rate of 44100 or 48000, `checkSound(measureSound(render(rate, createSeededRandom(seed)), rate, id))` is empty.

**CP2. Every sound meets its rules at other supported rates** (Universal, 25 runs per sound; R4.4, R16.2). The same, with the rate drawn from 22050, 32000, 88200, 96000 and 192000 and from the integers 22050 to 192000.

**CP3. Same seed, same samples** (Universal, 50 runs per sound; R4.5, R16.4). Two renders with equal rates and sources from the same seed are equal sample for sample, compared with `Object.is` on each sample.

**CP4. Different seeds, different samples** (Universal, 50 runs per sound; R4.6, R16.4). Two renders with equal rates and different seeds differ in at least one sample.

**CP5. Unsupported rates are rejected** (Universal, 200 runs; R4.3, R16.3). For any double below 22050 (including zero and negatives), NaN, +Infinity or −Infinity, every Render_Function throws a `RangeError`. The random source passed in counts its calls, and the count is zero.

**CP6. Plans keep their shape** (Universal, 200 runs per plan; R5.1 to R5.5, R5.7, R5.8, R7.3, R8.2). For any seed:
- cellar: exactly `knockCount` knocks, onsets within their configured ranges, each carrier and level within range, the last knock ending before the fade-out
- nursery: exactly `noteCount` notes, each a configured pitch, no note equal to the one before, the last note ending before the fade-out
- corridor and attic: rates, depths and deviations within range
- stairs: grain starts from 0, spacings, lengths and levels within range, every start before `durationMs − grainLengthMinMs`
- every sound: for any supported rate, the buffer length is `floor(durationMs × rate / 1000)`.

**CP7. The measurement is right on signals with known answers** (Universal and examples; R11.4 to R11.7).
- Universal, 100 runs: for random arrays of 1 to 4096 samples, `fftInPlace` matches a direct DFT to within 10⁻⁹ of the signal's energy. For random arrays up to 20000 samples, the total energy from `spectrumEnergies` equals the sum of squares to within 10⁻⁹ relative.
- Universal, 100 runs: a constant signal of any length from 2000 to 20000 samples, with raised-cosine fades of any length L from 10 to 500 samples at both ends, measures a fade in and a fade out within one sample of L.
- Universal, 100 runs: any number of exact zeros followed by a step to full level measures a fade in of at most one sample.
- Examples: a 500 Hz tone with long fades is more than 99.9 percent in band. A 700 Hz tone measured against the 500 Hz band is less than 0.1 percent in band. White noise measured against the 4 kHz band has an in-band share within 10 percent (relative) of the band's width divided by the Nyquist frequency. An all-zero buffer breaks `band`, `fadeIn`, `fadeOut` and `level`.

**CP8. Changed paths select the right sounds** (Universal, 200 runs; R13.2 to R13.6). For any Sound_Id and any file-name suffix made of lower-case letters, digits and `-`, with or without `.test`, and any absolute prefix: `soundsForChangedPath` returns exactly that sound for `.../src/audio/synth/<id>-<suffix>.ts`, every sound for any other synthesis file and for the four config files, and nothing for any path not under them. For any JSON value with such a path placed at a random depth, under a random key or inside an array, `hookEventPaths` returns that path.

Everything else is example tests: config values and invariants, each helper, each sound at seeds 1 to 3 (rules met, no `NaN`, exact zero at both ends), `finishSound` scaling, the tool's three modes with injected renderers (including a renderer that breaks the band rule, one that skips the fade, and one that throws), report formatting, the banned-term scan of the report and of all tool output, and the hook file.

## Testing strategy

- `npm test` runs every unit and property test under Node, as today. The property tests above run there and in CI, so the sound rules are checked on every push without adding `render:sounds` to the workflow (D23).
- Tool tests drive `runSoundRender` with injected renderers and inputs and never touch the disk. A separate test of `measureSounds` uses the real renderers for one sound, so the tool and the property tests are known to measure the same thing.
- The report test runs `findBannedTerms` from `src/copy/find-banned-terms.ts` with `bannedTerms` from `src/config` over a full report built from real measurements and over every line the tool can print, including every broken-rule description. It expects no match.
- Counterexamples follow the threshold-search convention: a case in `tests/properties/ghost-sounds-regressions.test.ts` named `regression <n>: <what went wrong> (<property>, <sound>, seed <s>, <rate> Hz)`, first committed with `it.fails`, then turned into `it` by the commit that fixes it. A case whose only remedy would loosen a steering value stays an expected break, with a decision here giving the numbers.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | `audio-safety-config.test.ts`; a search in the final task for the literals 20 and 1500 in synth, measure, tool and test code |
| R2 | `sound-rules-config.test.ts`, `ghost-sound-config.test.ts` |
| R3 | `npm run lint` (the import boundary and the sound, clock and random restrictions already cover `src/audio/synth/**`); CP3; a unit test that renders twice with the same seed in between other renders |
| R4 | `sound-renderers.test.ts`, CP2, CP3, CP4, CP5 |
| R5 | CP6; `calibration-hiss.test.ts` checks that the short-time RMS over 50 ms windows between the fades varies by less than 1.5 dB |
| R6 to R10 | CP1, CP2, `check-sound.test.ts` |
| R11 | CP7, `fft.test.ts`, `spectrum-energies.test.ts`, `fade-lengths.test.ts` |
| R12, R13 | `tools/run-sound-render.test.ts`, the `tools/sound-render/*.test.ts` files, CP8; the final task runs all three modes on the real tree |
| R14 | `tests/render-check-hook.test.ts` |
| R15 | The demonstration task and `docs/experiments/hook-catches.md` |
| R16 | The property test files |
| R17 | `npm run lint`; review of the diff in the final task; a check that no `.wav`, `.mp3`, `.ogg`, `.flac` or `.m4a` file is tracked |
| R18 | Review in the final task, and `findBannedTerms` over the changed READMEs |

## How the design serves the steering

- **Audio safety.** Rule 1: nothing here plays sound, and no lint rule changes (D23). Rule 3: every sound fades in and out over at least 20 ms by a measurement that fails a sudden onset. Every event inside a sound rises over at least 20 ms too (D5). Rule 6: every sound is at most 1.5 s. Rule 9: every knock and note rises gently. The fixed-magnitude noise keeps crest factors down, which keeps the noise sounds further from the ceiling (D11). Both steering values are added to `src/config` unchanged and are guarded against loosening (R1.5).
- **Product.** Each room tests one pitch. The sounds vary from one presentation to the next, but the event count and duration stay fixed, so how easy a sound is to catch does not change with the seed (D10).
- **Structure.** Synth imports only config. All numbers live in config. The measurement sits in synth so that tools, tests and the output stage can all reach it (D13). One exported thing per file, except `sound-id.ts`, which holds the id types and their two lists.
- **Tech.** No dependency is added. The FFT is written here. The sample rate is always a parameter, and the code is tested at rates other than 44100 and 48000. Randomness is injected. No clock in `src`.
- **Wording.** No visitor-facing text is written. The report, the tool output and commit messages avoid the banned terms (D22, D28). The report says that its levels are relative to full scale and say nothing about loudness at the ear.

## Decisions

Each point below was open in the brief, the steering files, the architecture or the code, and was settled here without being able to ask.

**D1. Three config files, and the ceiling is left to the audio-output spec.** The brief says this spec adds the longest sound and the shortest fade to `src/config`. Brief 03 says that spec adds the absolute ceiling. All three are rows of the same steering table, so they go into one file, `audio-safety-config.ts`, which this spec creates with two fields and the next spec extends. The rule numbers that come from brief 02 rather than from steering (band width, the 30 dB rule, the reference RMS and the measurement settings) go into `sound-rules-config.ts`. The character of each sound goes into `ghost-sound-config.ts`, so that tuning by ear touches one file. Adding the ceiling now would decide something brief 03 owns, and nothing here reads it.

**D2. "One third of an octave around the centre" is geometric and base 2: from `centre × 2^(−1/6)` to `centre × 2^(1/6)`, edges included.** Fractional-octave bands are centred geometrically by convention. Base 2 matches the brief's word "octave" exactly. Base 10 (as in IEC 61260) would move the edges by less than 0.1 percent. The rule is energy outside the band against energy inside it, over the whole spectrum from 0 Hz to the Nyquist frequency, as the brief states it.

**D3. Energy comes from one zero-padded FFT over the whole buffer, with bins at most 0.5 Hz wide, and a bin counts as in band when its centre frequency is.** The brief's rule is about energy, so the measurement uses Parseval's sum over a rectangular-window FFT of the entire buffer, which is exact for total energy and adds no window of its own. Zero-padding to at least two seconds of samples gives bins no wider than 0.5 Hz. At 500 Hz the band then holds about 230 bins, and assigning bins by their centre can misplace at most one bin's worth of energy at each edge. A short-time or windowed spectrum would mix the measuring window's own leakage into the result.

**D4. Fade length is measured from the first non-zero sample as the longest raised-cosine ramp the running peak stays under.** The steering says each sound fades in and out over at least 20 ms and nothing starts at full level, and the brief says the tool measures fade lengths. A useful measure has to fail a sound that starts at full level, a sound that is silent and then jumps, and a sound whose loudest moment comes within its first 20 ms. It must pass the shape the synthesis applies. Alternatives considered:
- Checking only that the first samples stay under a 20 ms ramp from sample 0. This passes a sound that is silent for 30 ms and then jumps.
- Rise time to the peak. This passes a sound that jumps to 90 percent and then creeps up.
- A short-time RMS envelope. This adds a window length that would itself need justifying.

The chosen measure handles all three cases with no extra parameter, and it gives one number in milliseconds that the report can show. The raised cosine is the reference shape because it is the shape the synthesis uses and the smoothest common one. A ramp of the same length that is linear would allow more level early and less late. A known limit: a sound whose leading samples are non-zero but inaudibly small, followed later by a sudden rise, would measure as a long fade. The synthesis never produces that, because the outer fade starts at sample 0, and the band rule limits how fast any envelope can rise. Brief 03's output stage adds its own fades as a second layer. The output spec can reuse `measureFadeLengths` for its property 3, which is one reason the measurement lives in synth (D13).

**D5. Every event inside a sound rises over at least `fadeMinMs` as well.** Rule 3 speaks of each sound, and the measurement in D4 checks the sound as a whole. A knock or note that starts sharply in the middle of a sound would still be a small startle, against the spirit of rules 3 and 9. Applying the same minimum to each event is stricter than the steering asks, which the steering allows. At 500 Hz it is also what the band rule needs (see Feasibility). It is enforced by construction and by the config tests, not by the report, because event boundaries cannot be read back reliably from the samples.

**D6. Outer fades are 30 ms for tone sounds and 50 ms for noise sounds.** The steering's 20 ms is a minimum. A fade of exactly 20 ms would put the measured length on the limit, where rounding decides. In the sketches, a noise sound with a 30 ms fade measured 18.9 ms, because one of its random peaks fell early. The margins are design values in config, and the rule stays at 20 ms.

**D7. The reference level is an RMS of 0.05 of full scale over the whole buffer, held to within 0.01 dB. Peak and crest factor are reported but not limited, apart from staying below full scale.** The brief asks for one RMS level for every ghost sound and gives no number. The value only fixes the scale of the buffers, because the calibration gain multiplies it. With crest factors up to about 18 dB, 0.05 keeps every peak below about 0.4 of full scale, so a buffer is never clipped on its own. RMS is taken over the whole buffer, fades and gaps included, because the brief says root-mean-square of the sound. The synthesis scales to the exact value, so the tolerance only absorbs rounding to 32-bit floats. Equal RMS does not mean equal loudness across pitches. That does not matter here, because the product never compares floors. Crest factor matters to the audio-output spec: a sound whose peak is high relative to its RMS reaches the absolute ceiling at a lower level. A limit on it would be a new rule that no steering file asks for, so the report shows it and brief 03 decides what to do with it.

**D8. The calibration noise meets the fade, duration and level rules. The band rule does not apply to it. It has the same reference RMS. It is checked against a configured shape in the five room bands, and that shape is a guess.** The brief's properties name "each sound" and its Done-when names "all six sounds", while the band rule needs a centre that the calibration noise does not have. So:
- Duration: the strict reading, at most 1.5 s, although rule 6 speaks of ghost sounds. The audio-output spec plays the noise repeatedly while the visitor moves the control, each repeat a separate sound with its own fades. Hand rubbing is itself a repeated gesture, so a pulsed hiss is a fair match. A loop that plays continuously would be a choice for brief 03 to make, and it would then have to explain how it meets rules 3 and 6.
- Level: the level scale defines 0 dB as the calibration noise at the visitor's chosen gain, and a ghost sound at 0 dB as the reference buffer at that same gain. That only holds if both buffers have the same RMS.
- Shape: "shaped like hands rubbing" cannot be measured without a recording of hands rubbing, which this spec does not have. I found no source for the spectrum of hand rubbing, and `hearing-method.md` already treats the 65 dB SPL figure as unverified. The shape in config (rising toward 4 kHz, then slightly lower at 8 kHz) is a starting guess, to be tuned by ear. The check only confirms that the synthesis produces the shape the config asks for, within 1 dB in each room band.
- "Steady hiss" means no level change apart from the fades.

**D9. A sound's length is its configured duration times the sample rate, rounded down.** Rounding down can never make a sound longer than its configured duration, so the duration rule follows from the config check at every rate.

**D10. The duration and the number of events are fixed per sound. Only timing, note order, small pitch and level changes, phases and the noise vary.** The brief wants variation "so that it does not become a recognisable recording". A sound whose number of events or duration changed with the seed would carry a different amount of energy per event at the same RMS, so it would be easier or harder to catch from one presentation to the next. That would add noise to the threshold search. The stairs grain count is the one exception. Its grains overlap so densely that the envelope's mean is about the same for any count. Every planned frequency also stays at least 1/24 octave inside the band edges, which leaves room for the spread caused by the envelopes.

**D11. Noise is made in the frequency domain with fixed magnitudes and random phases.** It is the most direct way to confine noise to a band. Fixed magnitudes give the exact spectral shape for every seed (the calibration check then has nothing random to tolerate). They also give a lower crest factor than random amplitudes: about 20 dB in the sketches with random amplitudes, against an expected 11 to 13 dB with fixed ones. The result is still noise, with no repeating pattern within the buffer and a different realisation for every seed. The FFT used for synthesis is the same one the measurement uses, which is why it is tested against a direct DFT (CP7).

**D12. The lowest supported sample rate is 22050 Hz.** The attic band's upper edge is 8980 Hz, so any rate below 17960 Hz cannot represent it. 22050 Hz is the lowest common rate above that, with about 2 kHz to spare between the attic band and the Nyquist frequency. Every room band of the calibration noise also fits below its Nyquist frequency. The noise loses only the part of its spectrum above 11 kHz, which the shape check does not measure. A consequence for later specs: some Bluetooth headsets switch to a 16000 Hz mode when a microphone is in use, and an `AudioContext` on such a device could report a rate the attic cannot use. The render functions throw a `RangeError`. What the visitor sees then belongs to the audio-output and visit-flow specs.

**D13. The measurement lives in `src/audio/synth/measure/`, shares only the FFT and the band edges with the synthesis, and is reached by tools, tests and the output stage.** The render tool lives in `tools/` and the property tests in `tests/`, and the lint rules forbid either from importing the other. Shared code must therefore be under `src/`, and of the modules there only `audio/synth` is an allowed import for `audio/output`, which needs the fade measurement for brief 03's property 3. Putting the measurement in `config` would stretch that module far more. Writing it twice, once for the tool and once for the tests, would let the two disagree. The measurement is kept independent of the code it judges, in the way the threshold search's ear oracle was: it does not import the ramps, envelopes or `finishSound`. The FFT and `bandEdges` are shared because a second copy adds no independence that their own tests do not already give. Nothing in the page imports the measurement, so it stays out of the bundle.

**D14. Render functions compute in 64-bit floats and return `Float32Array`.** Web Audio buffers hold 32-bit floats. Computing in 64 bits keeps the RMS scaling and the FFT accurate, and converting once at the end keeps exact zeros exact.

**D15. Render functions read their parameters from config. A plan function holds every random draw.** The brief fixes the signature: sample rate and random generator in, samples out. Passing parameters as well would add a second way to call each sound with nothing to use it. The plan and render split lets CP6 check the character rules directly on the plans.

**D16. The report uses seeds 1 to 10 at 44100 and 48000 Hz, shows the worst value per measure with its seed, and is the same on every run of the same code.** The brief asks for both rates. Ten seeds show the spread without making the hook slow. Random seeds are the property tests' job. Showing the worst case makes the margin to each limit visible. A report with no date or run time changes only when a sound changes, so its diff is meaningful. The seeds and rates are constants of the tool, not config values, because they change nothing that a visitor hears. The test seeds in `tests/` follow the same practice.

**D17. A changed file maps to sounds by its name. Shared synthesis files and the sound config files map to every sound.** The brief says the hook "runs the render check for the changed sound". Each sound's files start with its id (`cellar-knock.ts`, `cellar-knock-plan.ts`, `cellar-knock.test.ts`), so the name is enough. A shared helper or a measurement file can change any sound. The structure rule puts every number in `src/config`, so most tuning edits land in the config files rather than under `src/audio/synth/`. The brief names only the synth directory, but a hook that missed every tuning change would miss most bad changes. The matcher and the mapping therefore include the four config files that shape sounds. This is wider than the brief and serves its purpose.

**D18. The hook is a v1 standalone JSON file with one PostFileSave hook and a command action. Hook mode finds the path anywhere in the event, and writes a witness line outside the repository.**
- Format: the current documentation describes only `.kiro/hooks/<id>.json` with `"version": "v1"`. The older `.kiro.hook` format of IDE 0.x has been replaced.
- Command, not an agent prompt: the brief calls it an agent hook and asks that failures be reported to the agent. A command action does that by itself: standard error goes to the agent on a non-zero exit. A prompt action would ask the agent to run the check, which is the step a hook exists to make unnecessary.
- Matcher: the documentation says the matcher is a regular expression over the file path, but not whether the path is absolute or relative, nor which regular expression engine applies. The pattern `(^|/)src/...` matches both path forms. It uses only alternation, groups, `.+` and escapes, which behave the same in JavaScript and in the Rust `regex` crate, so the JavaScript test predicts Kiro's behaviour. Test files under `src/audio/synth/` match too. Excluding them would need a lookahead, which the Rust engine lacks, and checking a sound when its test changes costs a few seconds.
- Standard input: the documentation says the command receives the saved file path as JSON, but does not name the field. Collecting every string in the event that contains a synthesis or sound-config path works whatever the field is called. If nothing is found, every sound is checked, which is slower but never misses.
- Witness: a line appended by the hook's own command, in the system's temporary directory, is evidence that does not depend on the agent's account. It needs no `.gitignore` change and cannot be committed by accident. It also records the raw event, so the field names become known after the first run.
- Timeout 120 seconds: the default 60 would probably be enough, but a slow first `tsx` start on a cold machine should not turn into a missed check.

**D19. The hook should fire in a headless CLI V3 session, but that is to be shown, not assumed. What to record if it does not fire is fixed in advance.** See "The hook in a headless CLI session". In summary: the documentation lists File Save for CLI V3, V3 non-interactive runs load workspace hooks, and the installed CLI is 3.3.0. The conditions are a session started after the hook exists, `--v3`, trusted file-writing tools, and a change made by the agent's file tool rather than a shell command. Proof is a witness line, not the agent's word. If no line appears, the record says the hook was not seen to fire in headless CLI and keeps the evidence listed there, and the Done-when criterion is not claimed for that surface.

**D20. If PostFileSave is not seen to fire headless, a PostToolUse variant is tried once before moving to the IDE.** The Hook types page lists PostToolUse for every CLI harness, with the `write` category covering the built-in file-writing tools. A second hook in the same file with `"trigger": "PostToolUse"`, `"matcher": "write"` and the same command would run after every agent write. Hook mode already copes, because the event's `tool_input` holds the path and paths outside the sound files lead to "nothing checked". This is a fallback and not the first choice. The brief asks for a hook on saving, and in the IDE both hooks would fire for the same save and run the check twice. The variant is added only if the first headless run shows no witness line. It is recorded in the Hook_Catch_Record either way. If it is kept, R14.1's "one hook" becomes two, and this decision is updated with the measured outcome.

**D21. "For any seed" is checked by sampling. Run counts are set for a suite of about half a minute.** No test can render all 2³² seeds. Each property draws new seeds on every run, so coverage grows over time. The report shows the margin to every limit, which says how likely a rare failing seed is. Rendering and measuring a sound takes about 10 to 30 ms, so CP1 at 100 runs for each of six sounds is about 600 renders. That is fewer runs than the threshold search's 200, because each run costs a thousand times more. Measured running times are noted in the task that adds the properties. If CP1 and CP2 together exceed 60 seconds on the project machine, the run counts drop to 50 and 15, and the drop is recorded here.

Measured in task 8 on the project machine (Apple M2, 8 cores, Node 26.10.0), from Vitest's JSON report of three full `npm test` runs, where CP1 and CP2 share the worker pool with every other test file: CP1 35.0, 19.0 and 21.8 s; CP2 25.0, 11.9 and 14.0 s; together 59.999, 30.9 and 35.8 s. The whole suite took 37.7, 20.8 and 22.5 s from first file start to last file end. Run on their own, CP1 took 13.3 s and CP2 6.5 s. No run went above 60 seconds, so the counts stay at 100 and 25. The first run came within a millisecond of the limit, so the counts are the first thing to lower if the suite grows. CP3 and CP4 cost about as much as CP1, because they render twice at rates up to 192000 Hz. The buffer length part of CP6 renders too, and runs 25 times per sound instead of 200 (D38).

**D22. The report and the tool's output say "meets" and "breaks", never "pass" or "fail".** `wording.md` lists interface text, the README, the project page, the video script and commit messages. The report is none of those, but judges may read it. The brief's own "passing" can be met in other words. A test scans the report and every tool line for banned terms.

**D23. No listening code, no lint change, no CI change.** The brief and audio-safety rule 1 rule out a temporary player. `npm test` already runs in CI and includes the properties that check every rule, so adding `npm run render:sounds` to the workflow would repeat them and write a report on the runner that nobody reads.

**D24. A config test keeps the longest ghost sound shorter than the response window.** The window is 2.0 s and the sound 1.5 s. A sound longer than the window would still be playing when the window closed, so a late response could be scored as a miss. Nothing in the steering states this link. The test makes it visible if either value is tuned.

**D25. Rules that look unreachable: none. Four findings sit close to a rule.**
- The band rule versus the character "a dull knock" at 500 Hz. A sharp knock is impossible inside 116 Hz. The sketches show a 10 ms rise breaking the rule by 7 dB. The rule is reachable with rises of 20 ms or more, and the knock becomes a soft thud. The character gives way. The rule stays.
- The fade rule versus noise sounds. Random peaks early in a noise buffer shortened the measured fade below 20 ms in one sketch. The fix is a longer outer fade (D6), not a looser rule.
- The absolute ceiling (0.25 of full scale) versus crest factor, for brief 03. The output stage caps samples, but the engine's levels are RMS levels. For a noise sound with a crest factor of about 13 dB, the ceiling allows an RMS of at most about 25 dB below full scale. Whether +15 dB above the anchor can be played before the ceiling clamps depends on the visitor's calibration. When the ceiling clamps first, the level the engine recorded is higher than what was played. Brief 03 already requires that a clamp is reported to the caller. The visit-flow spec must decide what a clamped presentation means for "worse than cap". This spec only reports crest factors.
- The lowest sample rate. A 16000 Hz context cannot carry the attic room (D12).

No number from a steering file is changed by this spec.

**D26. The `.kiro.hook` path in `tests/repository.test.ts` is left as it is.** That test only checks that no ignore rule matches paths under `.kiro/`, using a sample hook name in the old format. The new hook file is covered by its own test. Changing the scaffold's test is outside this spec's purpose.

**D27. The stub and its tests are removed, not kept beside the real tool.** The scaffold's D15 made the stub fail as soon as a synthesis file exists, and said this spec replaces it. Its "found N synthesis files" behaviour has no use once rendering exists. `tools/run-sound-render.ts` keeps its name and becomes the real core, so the npm script and the wrapper's import stay as they are. From the first task that adds a file under `src/audio/synth/` until the tool task, `npm run render:sounds` exits 1 with the stub's message. That is the stub doing its job. Nothing runs the command automatically in that window: CI does not, the stub's own tests use temporary directories, and the hook is added only after the tool. The tasks note it so nobody mistakes it for a fault.

**D28. Commit messages follow `wording.md`.** As in the threshold search's D20: no "pass", "fail", "score", "test result" or other banned word. "Add the cellar knock" or "Keep the stairs scrape inside its band", not "Fix failing band test".

**D29. The brief's "tuned by ear in the IDE after the first version renders" happens after the audio-output listening page exists.** This spec cannot play anything, so the first listen comes with brief 03. The config values here are written to be changed then. A change to them is checked by the hook and by `npm test` like any other.

The decisions below were settled while implementing tasks 1 to 8, without being able to ask.

**D30. `ghostSoundConfig` is keyed by Sound_Id, and the unit rule applies to the fields of each entry. The corridor's two pitch sinusoids become a count in config. The config tests check a few more invariants than the list above.** The Sound parameters table groups fields by sound, so the object is `ghostSoundConfig.<sound id>.<field>`. The sound ids are code names, not quantities, so the unit-suffix check runs over each entry's fields. The table's "for each of two slow sinusoids" is a number that shapes a sound, so it becomes `pitchWobbleSinusoidCount: 2`, and the band check uses `count × depth`. The calibration entry has no `centreHz`. Added checks, each a precondition the render code relies on: every minimum is at most its maximum, counts are positive integers, the nursery pitches are distinct, a note's attack and release fit inside it, modulation depths lie in [0, 1), and the calibration noise's low cut ends below the cellar band's lower edge, so the low cut never touches a room band (stricter than the list, which only checks the high cut against the attic).

**D31. `fftInPlace(real, imag, direction)` scales nothing forward and divides by N inverse. "Agrees with a direct DFT to within 10⁻⁹ of the signal's energy" means that the energy of the difference between the two spectra, divided by N, is at most 10⁻⁹ times the signal's energy.** Dividing by N puts the spectrum error on the scale of the signal by Parseval's relation, so the tolerance does not grow with the length. The twiddle factors are computed directly with `cos` and `sin` for each index, not by repeated multiplication, which keeps the error near rounding level.

**D32. `spectrumEnergies` sums in-band and out-of-band bins separately.** Computing the out-of-band energy as the total minus the in-band energy cancels catastrophically when the ratio is far below the rule: the attic measures about −146 dB, which is below the relative rounding of a double-precision subtraction. Each band entry therefore holds `inBandEnergy` and `outOfBandEnergy`, both direct sums. The function also returns the FFT length and bin width so the 0.5 Hz bin rule can be tested.

**D33. Measurements that are not numbers break their rule, and silence is measured explicitly.** Every comparison in `checkSound` is written as "not within the limit" (`!(value <= limit)`), so a NaN anywhere in a buffer breaks the level and fade rules instead of slipping through as `false`. When the RMS is zero, the level deviation is −Infinity and the crest factor is reported as 0, since a silent buffer has neither. A calibration buffer with no energy in any room band gets a shape distance of +Infinity, so an all-zero calibration buffer breaks `fadeIn`, `fadeOut`, `level` and `calibrationShape`. `finishSound` turns the −0 that the outer fade can leave at the ends into +0, so "exactly zero" also holds under `Object.is`.

**D34. Two small helpers are added to `src/audio/synth/`: `decibelsToGain` and `drawUniform`.** The structure steering asks for an explicit conversion whenever a level in dB becomes a gain, and four sounds draw uniform values. One file each avoids five private copies. `drawUniform` makes exactly one draw even for an empty range, so the draw count never depends on a config value. Their names start with no sound id, so a change to either checks every sound (D17).

**D35. The nursery note decays as `(1 + t/τ) e^(−t/τ)` after its peak, not as `e^(−t/τ)`.** The design states that both event shapes have zero slope where the rise meets the decay, and task 4 tests it. A plain exponential starts with a slope of −1/τ, so the note would have a corner at its peak. `(1 + t/τ) e^(−t/τ)` starts at 1 with zero slope, falls monotonically, and has the same time constant in its tail, so τ keeps its meaning and no parameter is added. The nursery's measured out-of-band ratio is about −68 dB at seeds 1 to 10. The feasibility sketch, with a 20 ms rise and the plain exponential, measured −60.5 dB.

**D36. Shaped noise is exactly one buffer long. A transform of any length is added for it.** D11 chose fixed magnitudes so that "the calibration check then has nothing random to tolerate". With the FFT length rounded up to a power of two and the buffer cut from the start of that longer period, it does: cutting a random-phase signal to about half its period makes the band energies random again. Measured before the change, over 300 seeds per rate: the calibration shape distance reached a median of 0.40 dB and a maximum of 1.04 dB at 44100 Hz, with 3 of 300 seeds above the 1 dB limit (seeds 1082, 1140 and 1276, at 1.035, 1.023 and 1.040 dB). At 48000 Hz the maximum was 0.95 dB. CP1 at 100 runs per sound would have found such a seed on many runs. The tolerance stays at 1 dB. Instead, `shapedNoise` uses M = `sampleCount`, and `dft-any-length.ts` computes the inverse transform of any length with Bluestein's algorithm on top of `fftInPlace` (power-of-two lengths go straight to `fftInPlace`). Its test checks it against a direct DFT for lengths 1, 2, 3, 5, 12, 100, 1000, 1024 and 1323. After the change, over 300 seeds at 44100 Hz and 100 seeds at 48000 and 22050 Hz, the largest shape distance was 0.51 dB. The three seeds are kept as named regression tests in `calibration-hiss.test.ts`. What remains is mostly systematic: the shape is interpolated linearly in log frequency between room centres, and the stairs band sits at the peak of the shape, so its band energy is about 0.2 dB below its centre value and the other bands read 0.2 to 0.35 dB high relative to it. That is inside the tolerance, and the shape is a guess to be tuned by ear (D8), so the interpolation is left as designed. The change also makes the stairs noise exactly band-limited before its grain envelope. The cost is about 20 ms more per calibration render and measurement at 48000 Hz (about 50 ms instead of 30 ms). Bluestein's algorithm is used only for synthesis. The measurement still uses `fftInPlace` with zero-padding (D3).

**D37. The stairs scrape's outer fade is 80 ms, not 50 ms.** With 50 ms, a sweep of 1000 seeds (100000 to 100999) found the fade-out under 20 ms for 2 seeds at 44100 Hz and 4 seeds at 48000 Hz, measured at 19.2 to 19.9 ms: seeds 100349 and 100850 at 44100 Hz, and 100041, 100349, 100740 and 100850 at 48000 Hz. The cause is the fade measurement of D4 meeting a noise sound whose grains vary by 8 dB. When a loud grain and a high noise peak fall in the last 20 ms, and the rest of the scrape is quieter, the loudest instant of the whole buffer sits inside the fade-out. The 20 ms rule stays. A longer outer fade is stricter than the steering asks, which the steering allows, and it is a config value meant for tuning (D6). Measured over 2000 seeds at 44100 Hz, the shortest fade was 20.12 ms with a 60 ms outer fade, 23.0 ms with 70 ms and 25.55 ms with 80 ms. With 80 ms, a sweep of 500 seeds at 44100 and 48000 Hz and of 40 to 200 seeds at seven other rates found no seed under 25.5 ms. The six seeds are kept as named regression tests in `stairs-scrape.test.ts`. The fade-in did not need the change: the first grain starts at 0 ms and its own sine-squared rise multiplies the outer fade.

**D38. Smaller choices in the plans and the property tests.**
- Stairs draw order: for each grain, its length, its level, then the spacing to the next start. The spacing drawn after the last grain is the one that reaches the limit and is not used. CP6 checks that the last start plus the largest spacing reaches the limit.
- Nursery pitch choice: the first note takes `floor(next × count)` over all pitches, each later note the same over the pitches that differ from the note before. The plan keeps the index of each pitch as well as its frequency.
- Plans hold phases in radians from 0 to 2π. Events whose envelopes reach past the end of the buffer are cut there, and the outer fade covers them.
- CP3 and CP4 draw the rate from every supported rate, the report rates included, so the same-seed property also covers 192000 Hz and odd integer rates.
- The buffer length part of CP6 renders a buffer, so it runs 25 times per sound, the same as CP2, instead of the 200 runs of the plan checks (D21).
- `ghost-sounds-regressions.test.ts` holds one `it.todo` and no case. Vitest reports a file without any test as an error ("No test found in suite"), so an empty `describe` would break `npm test`. The cases that seed sweeps found before the properties existed (D36, D37) sit next to their sounds, because no property found them.
- `sound-arbitraries.ts` also holds the path arbitraries for CP8, as task 8 asks. CP8 itself arrives with task 9. The arbitraries generate only `.ts` files under `src/audio/synth/` as synthesis paths, following "The render tool" above. R13.3 says "any other file under `src/audio/synth/`", which would include a README. Task 9 has to settle that difference.

The decisions below were settled while implementing tasks 9 to 13, without being able to ask.

**D39. CP8 and its path arbitraries live in `tools/sound-render/`, and any file under `src/audio/synth/` that is not a sound's own file checks every sound.** The Files section puts CP8 in `tests/properties/`, but the code it tests is in `tools/sound-render/`, and the lint rules (and `structure.md`: "Nothing imports from `tests` or `tools`") forbid a file in `tests` from importing `tools`. The lint rules may not change. Moving `soundsForChangedPath` and `hookEventPaths` into `src/` would put tool logic about Kiro hook events into a product module. So CP8 is `tools/sound-render/ghost-sounds-cp8-changed-paths.property.test.ts`, next to the code it tests, as the scaffold's D9 did for the lint helpers, and the path arbitraries that task 8 wrote in `tests/properties/sound-arbitraries.ts` move to `tools/sound-render/changed-path-arbitraries.ts`, because `tools` may not import `tests` either. This is the one property test outside `tests/`. The difference D38 left open is settled in favour of R13.3: any file under `src/audio/synth/` that is not a sound's own file checks every sound, whatever its extension, so `--changed src/audio/synth/README.md` checks every sound. The hook matcher still matches only `.ts` files, so a README save never reaches the tool through the hook. A sound's own file is one directly in `src/audio/synth/` whose name starts with a sound id and "-". A file in a subdirectory such as `measure/` checks every sound even if its name starts with a sound id, because the subdirectories hold shared code. Both choices can only check more, never less. The `src/` that starts the repository path must be at the start of the path or after a slash, as in the hook matcher, so `mysrc/audio/synth/x.ts` selects nothing.

**D40. What hook mode prints, and what it does with a path that selects no sound.**
- On success, standard output holds exactly one line (R13.7). The reason for checking every sound (R13.6) and the witness log's path (R13.9) are sentences in that one line, for example `render:sounds: the hook event was empty, so every sound is checked. Every rule met for cellar, ... at 44100 Hz and 48000 Hz over 10 seeds. Witness log: <path>.`
- On a broken rule or a thrown error, standard output is empty. Standard error holds the reason line if there is one, then for each sound checked either its findings or its summary line, then `render:sounds: witness log: <path>.` as the last line.
- A hook event can hold a string that contains `src/audio/synth/` but selects no sound, such as `mysrc/audio/synth/x.ts`. That counts as "holds no matching path" in R13.6, so every sound is checked and the reason says "no path in the hook event can change a sound". D20 says that for the PostToolUse fallback "paths outside the sound files lead to 'nothing checked'". Under R13.6 they lead to every sound being checked instead, which costs a full check per unrelated write. Task 14 has to weigh that if it takes the fallback.
- `--hook` takes no other argument. `--changed` needs a path, and a following argument that starts with `--` does not count as one.
- The witness line's `hookInput` is `null` when standard input was a terminal, and is cut to its first 4000 code points, so a cut never splits a character.

**D41. Report details the design left open.**
- The level column shows the deviation from the reference RMS with three decimals, not one. The tolerance is 0.01 dB, so one decimal would show 0.0 for every sound and hide the margin. Every other dB value has one decimal, ms one, percentages two and peak three, as the design says. A value that rounds to zero is shown without a minus sign, so `-0.000` and `0.000` cannot alternate between runs.
- "Worst" is the lowest value for the in-band share and the fades, the value farthest from zero for the level, and the highest for the rest. On a tie the first seed is shown. A NaN counts as worst and is shown as "not a number" without a unit. A cell that does not apply, or a row whose renderer threw at every seed, shows "n/a". The report explains this under the table.
- When a rule breaks or a renderer throws, the report gets a "Broken rules" section with the same lines the tool prints, before the Notes. A report on a clean tree has no such section.
- The Rules table states the calibration shape values and names the decisions behind each rule.
- The tool also prints `render:sounds: wrote docs/reports/sounds.md.` after the wrapper writes the report.

**D42. The tool's tests use stand-in renderers, and the banned-term scan covers one ghost sound and the calibration noise for each broken rule.** `tools/sound-render/injected-renderers.ts` holds renderers built from steady sines with raised-cosine fades: one set that meets every rule, and sets that break the band rule, skip the fades, throw, leave non-zero end samples, run too long and too loud, peak above full scale, are silent, are NaN, and have a flat calibration shape. Their results are known in advance and they measure in milliseconds. Scanning every broken set across all six sounds and all three modes took about 17 seconds, so the scan runs each broken set in changed-file mode for the cellar and the calibration noise only. The lines of the other ghost sounds differ only in the sound id. The report built from the real sounds is scanned in full, as the Testing strategy asks.

**D43. The search for the literals 20 and 1500 counts values used in code, not names and comments.** Task 13's search found the shortest fade written as a number in two tests from tasks 3 and 4: `finish-sound.test.ts` passed 20 as the outer fade, and `check-sound.test.ts` expected the text "limit at least 20 ms". Both now read `audioSafetyConfig.fadeMinMs`, as do the expected strings in the tool's tests. The names of the stairs regression tests ("fade out under 20 ms") and the comment above them stay as they are. They record what the counterexamples were when they were found, and the check inside each test reads the limit from config through `checkSound`. Every other 20 in the searched files is a decibel conversion (`20 log10`), a count of runs (2 rates × 10 seeds), a range in a helper's test, or a date.

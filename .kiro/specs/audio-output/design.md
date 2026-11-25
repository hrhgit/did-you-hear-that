# Design: audio output

## Overview

Every sound the house makes leaves through `src/audio/output`. The module has three layers:

```
   session (visit flow, calibration controller, listening page session)
        │  play({ soundId, ear, levelDb, purpose, random })      ▲ results, clamps,
        │  playCalibrationRepeat, keepCalibration, stopAll, ...  │ stop events, range report
        ▼                                                        │
  ┌──────────────────────────── src/audio/output ─────────────────────────────┐
  │                                                                           │
  │  Output_Shell  createAudioOutput({ backend, timer })                      │
  │    state: inactive / starting / running / stopped / unsupported           │
  │    kept calibration, previous gain per ear, busy interval, clamp log      │
  │        │                         │                                        │
  │        │ renderPlayableBuffer    │ preparePlayback  (pure, runs in Node)  │
  │        │ (synth + peak bound)    │ fade · cap · rise limit · routing      │
  │        ▼                         ▼                                        │
  │   src/audio/synth           { left, right, playedLevelDb, clampLimit }    │
  │                                  │                                        │
  │  Audio_Backend (interface, no Web Audio types)                            │
  │    ├── Web_Audio_Backend + output graph   (the only Web Audio code)       │
  │    └── Fake_Audio_Backend                 (tests under Node)              │
  └───────────────────────────────────────────────────────────────────────────┘
                                   │ one stereo AudioBuffer per sound
                                   ▼
               AudioBufferSourceNode → stop gain → destination
```

The rule that matters most is in the middle. `preparePlayback` is a pure function from a request (samples, sample rate, ear, requested level, calibration gain, previous gains) to the two channel buffers that will be played. It applies the fade, the anchor cap, the rise limit and the ceiling, and routes the sound to one channel with exact zeros on the other. It runs under Node, so the brief's three properties are proved there over any buffer, any level and any calibration gain. The Web Audio code receives those two channels and plays them as they are. It never scales, pans or mixes them. The only gain it applies is the stop fade, which can only lower a sample.

The shell holds what the pure function cannot: whether sound may play at all, the kept calibration, the previous gain on each ear for the rise limit, the one-sound-at-a-time rule, the clamp log, and the reaction to stop, hidden page, page exit, device change and interruption. It talks to the browser only through an `AudioBackend` interface, so it is also tested under Node, with a fake backend that records every call.

The findings of the ghost-sounds spec shape the rest:

- **Peaks.** The shell renders each sound itself and accepts a buffer only if its peak lies within a per-sound Peak_Bound. From the bound and the calibration gain it computes, before a room starts, the highest level that room's sound can be played at without reaching the ceiling (the Room_Top_Level). The visit flow gives that, rounded down to the search's level grid, to the threshold search as its cap. Then no trial is ever clamped. If something asks for more anyway, the whole sound is turned down until its peak meets the ceiling, never clipped, and the level reported back is the level that was played.
- **Calibration range.** The calibration control starts at its bottom, rises by at most 5 dB per repeat, and stops at the highest setting at which every room can still be played at least as loud as the anchor. With the values in config that top is −4 dB. When the kept setting leaves some rooms short of the +15 dB cap, the screen says so, and says not to raise the volume. The house never advises raising the system volume (D9, Q2).
- **Sample rate.** The `AudioContext` is created at the device's own rate. Below 22050 Hz, the output stage plays nothing at all, closes the context and reports why (D11).

## Sources

- `docs/briefs/03-audio-output.md`, including the project owner's uncommitted section "Findings from the ghost-sounds spec to handle here". The file is left as it is.
- `.kiro/steering/audio-safety.md` and its Initial values table: shortest fade 20 ms, longest ghost sound 1.5 s, absolute digital ceiling 0.25 of full scale. Its nine rules are mapped one by one in "Rule by rule" below.
- `.kiro/steering/product.md`, `structure.md`, `tech.md`, `wording.md`, `hearing-method.md`.
- `docs/architecture.md`: the output module's place, the level scale, and its open question 1 (whether Bluetooth headphones play the quietest levels).
- `.kiro/specs/ghost-sounds/`: the sounds, `measureFadeLengths` (D4 there), the reference RMS of 0.05 (D7), the lowest sample rate (D12), the crest factor finding (D25), and its statement that the first listen comes with this spec (D29).
- The code: `src/config/audio-safety-config.ts`, `hearing-method-config.ts`, `sound-rules-config.ts`, `sound-id.ts`, `seeded-random.ts`, `timer.ts`; `src/audio/synth/sound-renderers.ts`, `decibels-to-gain.ts`, `raised-cosine-ramp.ts`, `measure/fade-lengths.ts`; `src/engine/validate-search-settings.ts` (the cap must lie on the level grid) and `search-types.ts`; the lint rules in `tools/lint/` (sound APIs are allowed only in `src/audio/output`, clock reads and timers are banned in `src/session`); `vite.config.ts`, `playwright.config.ts`, `tests/e2e/placeholder-page.spec.ts` and `tests/repository.test.ts`.
- Committed state only for `tools/`, `docs/reports/`, `.kiro/hooks/` and `package.json`, which another session is changing. This spec reads them as committed and changes none of them (D31).
- Measurements: before writing this design I ran throwaway Node computations (inline, nothing written to disk) of the shipped render functions, measuring the peak of each sound over thousands of seeds and the effect of a 25 ms output fade. Their numbers are in "Measurements" below and are the basis of D6 and D13.

## Files

Created:

```
listen.html                                  the Listening_Page, served by `npm run dev` only (D26)

src/config/
  audio-output-config.ts                     audioOutputConfig (R2)
  audio-output-config.test.ts

src/audio/output/
  output-types.ts                            Ear, EarChoice, Purpose, ClampLimit, refusal reasons,
                                             PreparedPlayback, PlayResult, StopReason, OutputState
  gain-to-decibels.ts                        gainToDecibels
  gain-to-decibels.test.ts
  apply-output-fade.ts                       applyOutputFade
  apply-output-fade.test.ts
  prepare-playback.ts                        preparePlayback (the pure core)
  prepare-playback.test.ts
  render-playable-buffer.ts                  renderPlayableBuffer (renders, checks the Peak_Bound)
  render-playable-buffer.test.ts
  room-top-level.ts                          roomTopLevelDb
  room-top-level.test.ts
  range-report.ts                            rangeReport
  range-report.test.ts
  calibration-setting-top.ts                 calibrationSettingTopDb
  calibration-setting-top.test.ts
  next-calibration-setting.ts                nextCalibrationSettingDb
  next-calibration-setting.test.ts
  audio-backend.ts                           AudioBackend interface, BackendEvent
  create-audio-output.ts                     createAudioOutput (the Output_Shell)
  create-audio-output.test.ts
  fake-audio-backend.ts                      createFakeAudioBackend (imported by tests only)
  channel-index.ts                           channelIndex: the one left/right to 0/1 mapping (D25)
  output-graph.ts                            createOutputGraph (Web Audio)
  web-audio-backend.ts                       createWebAudioBackend (Web Audio, page events)

src/session/
  room-search-cap.ts                         roomSearchCapDb
  room-search-cap.test.ts
  judge-headphone-check.ts                   judgeHeadphoneCheck
  judge-headphone-check.test.ts
  calibration-controller.ts                  createCalibrationController
  calibration-controller.test.ts
  listening-page-session.ts                  createListeningPageSession
  listening-page-session.test.ts

src/copy/
  calibration-copy.ts                        calibrationCopy, roomsShortLine
  headphone-check-copy.ts                    headphoneCheckCopy
  output-state-copy.ts                       outputStateCopy (stop, stopped and unsupported lines)
  listening-page-copy.ts                     listeningPageCopy, levelLabel, clampLine
  output-copy.test.ts                        banned terms over all of the above (R18.2)

src/ui/listening-page/
  render-listening-page.ts                   renderListeningPage
  start-listening-page.ts                    the entry that listen.html loads
  listening-page.css

tests/properties/
  output-arbitraries.ts                      buffers, levels, gains, requests, operation sequences
  audio-output-cp1-ceiling-and-cap.property.test.ts
  audio-output-cp2-silent-other-channel.property.test.ts
  audio-output-cp3-fades.property.test.ts
  audio-output-cp4-refusals.property.test.ts
  audio-output-cp5-reported-level.property.test.ts
  audio-output-cp6-room-top.property.test.ts
  audio-output-cp7-rise-limit.property.test.ts
  audio-output-cp8-search-room.property.test.ts
  audio-output-cp9-calibration-control.property.test.ts
  audio-output-cp10-stop-and-state.property.test.ts
  audio-output-cp11-range-report.property.test.ts
  audio-output-cp12-pure.property.test.ts
  audio-output-cp13-unsupported.property.test.ts
  audio-output-regressions.test.ts           counterexamples, one it.todo at first

tests/e2e/
  listening-page.spec.ts                     the Browser_Suite (R21)
  dev-server.ts                              the port of the development server for the suite

docs/experiments/audio-output-listening.md   written by the project owner after the Manual checks
```

Changed: `src/config/audio-safety-config.ts` and its test (add `ceilingFraction`), `playwright.config.ts` (a third web server, the development server, for `listening-page.spec.ts`), the READMEs of `src/audio/output/`, `src/session/`, `src/copy/`, `src/ui/` and `docs/`.

Not changed: every lint rule and `tools/lint/module-dependencies.js` (the entry lives inside `src/ui`, D26), `vite.config.ts` (the build input stays `index.html` alone), `package.json`, `tests/repository.test.ts`, everything under `tools/`, `docs/reports/` and `.kiro/hooks/`, every steering file, every brief, and every file under `src/audio/synth/` and `src/engine/`.

## Config

### `src/config/audio-safety-config.ts`

One field is added:

```ts
/** Largest absolute value of any output sample, as a fraction of full scale. Equal is allowed. */
readonly ceilingFraction: number;
...
// "Absolute digital ceiling | no output sample beyond 0.25 of full scale, about 12 dB below full scale"
ceilingFraction: 0.25,
```

The test's exact-value check gains the field, and a third loosening guard is added: `ceilingFraction <= 0.25`, with the same message style as the two existing guards. The file comment already says that this spec adds the ceiling; it is reworded to say it has been added.

### `src/config/audio-output-config.ts`

| Field | Value | Decision |
|---|---|---|
| `outputFadeMs` | 25 | D13. The Output_Fade, a raised cosine at each end |
| `stopFadeMs` | 20 | D14. The raised-cosine fade to silence on every stop |
| `scheduleLeadMs` | 50 | D17. Time between scheduling a sound and its start |
| `peakBoundDb` | cellar 13.5, corridor 5.5, nursery 10, stairs 17, attic 4.5, calibration 15.5 | D6. Largest peak of a playable buffer, in dB above the reference RMS |
| `renderAttemptsMaxCount` | 8 | D6 |
| `calibrationSettingMinDb` | −60 | D8. Bottom of the control, where every calibration begins |
| `calibrationSettingStepDb` | 1 | D8. The control's step |
| `calibrationRiseMaxDb` | 5 | D8. Largest rise from one Calibration_Repeat to the next |
| `calibrationSettingKeepMinDb` | −40 | D10. Lowest setting that can be kept |
| `calibrationRepeatGapMs` | 400 | D8. Silence between Calibration_Repeats |
| `headphoneCheckLevelDb` | 0 | D20 |
| `roomTopMinDb` | 0 | D8. Every room must reach at least the anchor at the top of the control |

The Calibration_Setting_Top is not a config value. It is computed from these numbers by `calibrationSettingTopDb()` (D8). With the values above it is −4 dB.

`src/config` may import nothing outside itself, so the two checks that need the computed top live in `calibration-setting-top.test.ts`: `calibrationSettingKeepMinDb <= calibrationSettingTopDb()`, and the Calibration_Noise at its Peak_Bound, at the top, at Level 0 and at `headphoneCheckLevelDb`, has a peak at most `ceilingFraction` (R2.4, R2.5). That test also checks that the top is −4 dB with the shipped values, so a change to a Peak_Bound that moves it is visible.

Config tests (R2.3, R2.4, R2.6):

- `outputFadeMs >= fadeMinMs` and `stopFadeMs >= fadeMinMs`.
- `calibrationRiseMaxDb <= upwardStepDb`, `headphoneCheckLevelDb <= capRelativeToAnchorDb`, `roomTopMinDb >= startingLevelDb`.
- `calibrationSettingMinDb < calibrationSettingKeepMinDb`, and the Keep_Minimum lies on the step grid that starts at the bottom.
- `peakBoundDb` has exactly the six Sound_Ids, and every value is positive.
- `renderAttemptsMaxCount` is a positive integer.
- Every field name ends in its unit, and the object is deeply frozen.
- Loosening guards (D32), each with a message naming this design and the project owner's approval: `outputFadeMs >= 25`, `stopFadeMs >= 20`, `calibrationSettingMinDb <= −60`, `calibrationSettingKeepMinDb >= −40`, `calibrationRiseMaxDb <= 5`, `headphoneCheckLevelDb <= 0`.

## The pure core: `preparePlayback`

### Types (`output-types.ts`)

```ts
export type Ear = "left" | "right";                 // the engine's Ear, redeclared (output may not import engine)
export type EarChoice = Ear | "both";
export type Purpose = "trial" | "replay" | "listening" | "headphoneCheck" | "calibration";
export type ClampLimit = "anchorCap" | "rise" | "ceiling";

export type PreparationRefusal =
  | "unsupportedSampleRate" | "emptyBuffer" | "tooLong" | "notFinite" | "silentBuffer"
  | "fadeTooShort" | "invalidLevel" | "invalidCalibrationGain" | "bothEarsForGhostSound"
  | "beyondCeiling";

export interface PlaybackRequest {
  readonly samples: Float32Array;
  readonly sampleRateHz: number;
  readonly soundId: SoundId;
  readonly earChoice: EarChoice;
  readonly requestedLevelDb: number;
  readonly calibrationGain: number;
  /** null when the Rise_Limit does not apply (a replay, or nothing played yet in the Room_Span). */
  readonly previousAppliedGain: Readonly<Record<Ear, number | null>> | null;
}

export type PreparedPlayback =
  | { readonly kind: "refused"; readonly reason: PreparationRefusal }
  | {
      readonly kind: "ready";
      readonly left: Float32Array;
      readonly right: Float32Array;
      readonly requestedLevelDb: number;
      readonly playedLevelDb: number;
      readonly appliedGain: number;
      readonly clampLimit: ClampLimit | null;
      readonly peakFraction: number;     // largest |sample| over both channels
    };
```

`Ear` uses the names `left` and `right`, as the structure steering asks. The engine has the same type. The output stage may not import the engine, so the type is declared again, and a type-level test in `src/session/` checks that the two are the same.

### Steps

`preparePlayback(request)` never throws for any input and never modifies `request.samples`. It returns the first refusal it meets, in this order:

1. **Sample rate.** Refuse `unsupportedSampleRate` unless the rate is finite and at least `sampleRateMinHz` (R10.5).
2. **Buffer.** Refuse `emptyBuffer` for zero samples, `tooLong` for more than `floor(ghostSoundMaxDurationMs × rate / 1000)` samples, `notFinite` if any sample is NaN or infinite (R10.3, R10.4).
3. **Numbers.** Refuse `invalidLevel` if `requestedLevelDb` is not finite, `invalidCalibrationGain` if the gain is not finite or not above zero (R7.6). Previous gains that are not finite or not above zero are treated as `invalidCalibrationGain` too.
4. **Routing.** Refuse `bothEarsForGhostSound` when `earChoice` is `both` and the sound is not the calibration noise (R6.3, D21).
5. **Fade.** `faded = applyOutputFade(samples, rate)`, in 64-bit floats: sample n is multiplied by `raisedCosineRamp(n / F) × raisedCosineRamp((N − 1 − n) / F)`, F = `outputFadeMs × rate / 1000`, not rounded. The first and last samples become zero. Refuse `silentBuffer` if every faded sample is zero. Refuse `fadeTooShort` if `measureFadeLengths(faded, rate)` gives a fade in or out below `fadeMinMs` (R10.1, R10.2, D13).
6. **Anchor cap.** `level = min(requestedLevelDb, capRelativeToAnchorDb)`. If that lowered it, the limit so far is `anchorCap`. `gain = calibrationGain × decibelsToGain(level)` (R7.3).
7. **Rise limit.** For each Ear the sound plays on whose previous gain is not null: if `gainToDecibels(gain) − gainToDecibels(previous) > upwardStepDb + 10⁻⁹`, then `gain = min(gain, previous × decibelsToGain(upwardStepDb))` and the limit is `rise`. For `both`, the lower of the two limits holds (R11.2, R11.3, D15).
8. **Ceiling.** `peak = max |faded|`. If `peak × gain > ceilingFraction`, then `gain = ceilingFraction / peak` and the limit is `ceiling`. The output in 64 bits is `faded × gain`. If any of its samples is still beyond the ceiling through rounding, the gain is multiplied by `1 − 2⁻⁴⁰` and the output recomputed, at most four times (R7.4, D5).
9. **Level.** If no limit applied, `playedLevelDb = requestedLevelDb` and `appliedGain = calibrationGain × decibelsToGain(requestedLevelDb)`, computed once and used for the samples. Otherwise `playedLevelDb = gainToDecibels(gain / calibrationGain)` (R8.1, R8.2).
10. **Channels.** The played channel is `Float32Array.from(output)`, rounded once. Every `-0` becomes `+0`. The other channel is a new `Float32Array` of the same length, all `+0`. For `both`, both channels hold copies of the same samples (R6.1, R6.2, R6.4).
11. **Last check.** Refuse `beyondCeiling` if any sample of either channel has an absolute value above `ceilingFraction`. Rounding to 32 bits cannot push a value past 0.25, which is exactly representable, so this refusal is a guard that should never fire. A test injects nothing to reach it; CP1 confirms it never fires (R7.7).

The limit reported is the last one that lowered the gain, so it names the limit that set the played level.

Two remarks:

- A very low requested level is not refused. A level of −10⁶ dB gives a gain that underflows to zero and an output of exact zeros, which is silence and harmless. The search never asks for anything below `floorDb`.
- The rise limit compares gains, not levels, so it also covers Calibration_Repeats, whose level is always 0 and whose gain changes (D15).

### `gainToDecibels`

`gainToDecibels(gain) = 20 × log10(gain)`, the inverse of the synth's `decibelsToGain`, which the output stage imports. The structure steering asks for an explicit conversion whenever a level and a gain meet. A unit test checks the round trip within 10⁻¹² dB over the range −200 to +60 dB.

## Playable buffers and the highest level of a room

### `renderPlayableBuffer(soundId, sampleRateHz, random, renderers = soundRenderers)`

Renders with `renderers[soundId](sampleRateHz, random)`. If the buffer's peak is above `referenceRmsFraction × decibelsToGain(peakBoundDb[soundId])`, it renders again from the same `random`, which has moved on, up to `renderAttemptsMaxCount` attempts in all. It returns `{ kind: "ready", samples, attemptCount }` or `{ kind: "refused", reason: "peakBoundNotMet" }`. A render function that throws (an unsupported rate) gives `{ kind: "refused", reason: "renderFailed" }`. The renderers parameter exists for tests.

With the bounds in config, the stairs scrape is rendered again in about 5 percent of cases, and every other sound in none of the cases measured (see Measurements). The chance that eight stairs renders in a row all exceed the bound is about 10⁻¹⁰.

### `roomTopLevelDb(soundId, calibrationGain)`

```
ceilingLimitedDb = gainToDecibels(ceilingFraction / (referenceRmsFraction × decibelsToGain(peakBoundDb[soundId]) × calibrationGain))
roomTopLevelDb   = min(capRelativeToAnchorDb, ceilingLimitedDb)
```

With the shipped numbers, `ceilingLimitedDb = 13.98 − peakBoundDb − Calibration_Setting`. A playable buffer at any level up to this one, faded (which only lowers samples), never reaches the ceiling, so step 8 above never fires (R9.4, CP6).

### `rangeReport(calibrationGain)`

```ts
export interface RoomRange {
  readonly topLevelDb: number;
  readonly setBy: "anchorCap" | "ceiling";
  readonly belowAnchorCapDb: number;       // capRelativeToAnchorDb − topLevelDb, 0 or more
}
export interface RangeReport {
  readonly calibrationSettingDb: number;
  readonly calibrationGain: number;
  readonly rooms: Readonly<Record<SoundId, RoomRange>>;
  /** RMS of any sound at floorDb, as a fraction of full scale. */
  readonly floorRmsFraction: number;
}
```

`floorRmsFraction = referenceRmsFraction × calibrationGain × decibelsToGain(floorDb)`. It is reported so that the listening page can show how close the quietest level comes to what a device can play (D7, Q1).

### What the visit flow does with it

`roomSearchCapDb(topLevelDb, settings)` in `src/session/room-search-cap.ts` returns the largest level on the Level_Grid that is at most `topLevelDb`: `startingLevelDb + floor((topLevelDb − startingLevelDb) / upwardStepDb + 10⁻⁹) × upwardStepDb`, then the lower of that and `capRelativeToAnchorDb`. The threshold search's validation requires its cap to lie on that grid (`validate-search-settings.ts`), which is why the rounding happens. The visit flow gives the result to the search as `capRelativeToAnchorDb` in the room's settings. "Worse than cap" then means that the visitor did not catch the loudest sound this house could play in that room with that calibration, which is true.

Because the top of the calibration control keeps every room's top at or above `roomTopMinDb` (0), the rounded cap is at least 0 and so above `startingLevelDb` (−25) and `floorDb` (−70), and the search's settings stay valid.

Room tops for some settings, with the shipped config (rounded to the grid in brackets):

| Calibration_Setting | cellar | corridor | nursery | stairs | attic | calibration noise | ghost rooms below +15 |
|---|---|---|---|---|---|---|---|
| −40 (Keep_Minimum) | 15 | 15 | 15 | 15 | 15 | 15 | 0 |
| −19 | 15 | 15 | 15 | 15 | 15 | 15 | 0 |
| −10 | 10.5 (10) | 15 | 14.0 (10) | 7.0 (5) | 15 | 8.5 (5) | 3 |
| −4 (top) | 4.5 (0) | 12.5 (10) | 8.0 (5) | 1.0 (0) | 13.5 (10) | 2.5 (0) | 5 |

Every room reaches +15 at settings of −19 dB and below. Above that, the stairs room loses range first.

## Calibration

### The control

`nextCalibrationSettingDb(requestedDb, previousDb | null)` is pure:

- If `previousDb` is null (the first repeat of a calibration), it returns `calibrationSettingMinDb`, whatever was requested (R16.1).
- Otherwise it takes `requestedDb` (NaN counts as the previous setting), rounds it down to the grid `calibrationSettingMinDb + k × calibrationSettingStepDb`, limits it to at most `previousDb + calibrationRiseMaxDb` and to the Control_Range, and returns it (R16.2).

`calibrationSettingTopDb()` is pure. It returns the highest grid setting S at which both hold:

- the calibration noise at its Peak_Bound, at Level `max(0, headphoneCheckLevelDb)`, with gain `decibelsToGain(S)`, has a peak at most `ceilingFraction`;
- every Ghost_Sound has `roomTopLevelDb(id, decibelsToGain(S)) >= roomTopMinDb`.

With the shipped values the first condition allows up to −1.5 dB and the second up to −3.02 dB (the stairs scrape: 13.98 − 17 − 0), so the top is −4 dB.

### The shell's calibration calls

- `beginCalibration()` forgets the kept calibration and the previous gains, and marks the shell as calibrating with no repeat played yet (R15.2).
- `playCalibrationRepeat({ requestedSettingDb, random })` is accepted only while calibrating and Running. It computes the setting with `nextCalibrationSettingDb`, renders a playable calibration noise, prepares it with `earChoice: "both"`, Level 0, gain `decibelsToGain(setting)`, and the previous gains (so the rise limit applies as well), schedules it, and returns `{ settingDb, atTop, startMs, endMs }` (R16.2, R16.3).
- `keepCalibration()` refuses `noRepeatPlayed` if no repeat has played, and `systemVolumeHigh` if the last played setting is below `calibrationSettingKeepMinDb`. Otherwise it keeps the last played setting, ends calibrating, and returns the Range_Report (R16.4 to R16.6, R9.3).

The Calibration_Gain lives only in the shell's memory (R15.3, D19).

### The calibration controller (`src/session/calibration-controller.ts`)

`createCalibrationController({ output, timer, random })` plays repeats one after another while it is open: it calls `playCalibrationRepeat` with the control's current target, and, using the injected timer, waits until `calibrationRepeatGapMs` after the returned end time (converted from the audio clock with the shell's timestamp pair) before the next one. It stops scheduling as soon as the shell reports a stop or the controller is closed. Its snapshot gives the target, the setting actually played, whether it is at the top, and the line to show. The UI moves the visible control to the played setting, so the control never shows a level that was not played (R16.11).

### What the visitor is told

All lines are in `src/copy/calibration-copy.ts`. Starting text, to be reviewed by the project owner:

| When | Line |
|---|---|
| Calibration opens | "Rub your hands together next to one ear. Move the control until the hiss sounds as loud as your hands. The hiss starts very quietly." |
| The setting is at the top | "This is as loud as the hiss goes. If your hands are still louder, keep this setting." |
| Keep refused, setting below −40 | "Your system volume is set very high. Turn it down, then match the hiss again." |
| Calibration kept (rule 8) | "Leave your system volume where it is now. The house keeps every sound below its limit only if you do not turn the volume up." |
| Kept, some rooms short | `roomsShortLine(count, total)`: "At this setting, 3 of the 5 rooms cannot get as loud as the house would like. The house will stop at the loudest it can play there. Do not turn the volume up to change this." |

`count` is the number of Ghost_Sounds whose `roomSearchCapDb` is below `capRelativeToAnchorDb`. For the quick visit the caller counts the three rooms of that visit. The listening page counts all five.

No line ever suggests raising the system volume, before or after calibration (D9, Q2).

## The headphone check

`playHeadphoneCheck(random)` needs a kept calibration (R17.2). It plays the calibration noise in the left ear only, at `headphoneCheckLevelDb` (0, the level the visitor just matched to their hands), with the Purpose `headphoneCheck` (R17.1, D20).

`judgeHeadphoneCheck(answer)` in `src/session/` maps the four answers (R17.3, R17.7):

| Answer | Judgement | Line (`headphone-check-copy.ts`) |
|---|---|---|
| left | `correct` | "That was your left ear. The headphones are the right way round." |
| right | `swapped` | "The hiss was on your left. Turn the headphones around and try again." |
| both sides | `bothSides` | "The hiss came from one side only. Your device may be set to play the same sound in both ears. Turn that setting off and try again." |
| nothing heard | `notHeard` | "Check that both earpieces are on and connected, then try again." |

The question is "Which side was the hiss on?" with the answers "Left", "Right", "Both sides" and "I heard nothing".

## The output shell (`create-audio-output.ts`)

```ts
export function createAudioOutput(options: { backend: AudioBackend; timer: Timer }): AudioOutput;

export interface AudioOutput {
  state(): OutputState;                     // { kind: "inactive" | "starting" | "running" } | { kind: "stopped", reason } | { kind: "unsupported", reason, sampleRateHz }
  activate(): Promise<ActivateResult>;      // its backend calls happen before the first await
  stopAll(): void;                          // the Visible_Stop_Control; reason "control"
  onStop(listener: (event: StopEvent) => void): () => void;
  onUnsupported(listener: (event: UnsupportedEvent) => void): () => void;
  sampleRateHz(): number | null;

  beginCalibration(): void;
  playCalibrationRepeat(request: { requestedSettingDb: number; random: RandomSource }): CalibrationRepeatOutcome;
  keepCalibration(): KeepOutcome;
  rangeReport(): RangeReport | null;        // null while no calibration is kept
  playHeadphoneCheck(random: RandomSource): PlayOutcome;

  beginRoom(): void;
  play(request: { soundId: SoundId; ear: Ear; levelDb: number; purpose: "trial" | "replay" | "listening"; random: RandomSource }): PlayOutcome;

  clampLog(): readonly ClampLogEntry[];
  timestampPair(): { audioClockMs: number; performanceMs: number } | null;
}

export type PlayOutcome =
  | { kind: "refused"; reason: PlayRefusal }
  | { kind: "scheduled"; startMs: number; endMs: number; requestedLevelDb: number; playedLevelDb: number; clampLimit: ClampLimit | null };
```

`PlayRefusal` is a `PreparationRefusal`, a `renderPlayableBuffer` refusal, or one of `notRunning`, `notCalibrated`, `notCalibrating`, `busy`, `unsupported`.

### States

| State | Entered when | Plays |
|---|---|---|
| inactive | created | nothing |
| starting | `activate` called, backend not yet running | nothing |
| running | the backend reports running and the device checks hold | sounds, as the calibration state allows |
| stopped | any stop: control, hidden, page left, device changed, interrupted | nothing until `activate` |
| unsupported | no Web Audio, rate below 22050 Hz, fewer than two output channels | nothing, for the life of the page |

### `activate`

Called by the session from inside a User_Gesture. In order, before any `await`:

1. If unsupported, return `{ kind: "unsupported" }`.
2. If `backend.hasWebAudio()` is false, become unsupported with `noWebAudio` (R5.4).
3. If `backend.userActivationActive()` is `false` (it is `null` where the browser cannot tell), return `{ kind: "refused", reason: "noGesture" }` and touch nothing (R4.3, D23).
4. Call `backend.createOrResume()`. This creates the `AudioContext` the first time and resumes it later, synchronously inside the gesture (R4.1, R4.2).
5. Read `backend.sampleRateHz()`. Below 22050 Hz or not finite: close the context and become unsupported with `sampleRateTooLow` (R5.2). Read `backend.outputChannelCountMax()`. Below 2: close and become unsupported with `monoOutput` (R5.3).
6. Become starting, then await `backend.whenRunning()` and become running.

### Playing a sound

`play` and `playHeadphoneCheck`:

1. Refuse `unsupported`, `notRunning` (any state but running), `notCalibrated` (no kept calibration) (R4.4, R15.1).
2. Refuse `busy` if `backend.currentTimeMs() + scheduleLeadMs` is before the end of the current Busy_Interval (R12.1, D16).
3. `renderPlayableBuffer(soundId, sampleRate, random)`. Refuse with its reason.
4. `preparePlayback` with the kept Calibration_Gain and, unless the Purpose is `replay`, the previous gains of the Room_Span (R11.1, R11.5). Refuse with its reason.
5. `startMs = backend.currentTimeMs() + scheduleLeadMs`; `backend.schedule({ left, right, sampleRateHz }, startMs)`; the Busy_Interval becomes `[startMs, startMs + samples / rate]` (R13.1).
6. Record the applied gain as the previous gain of each ear played on. If a limit applied, append a Clamp_Log entry (R7.8, D22).
7. Return the scheduled outcome.

`beginRoom()` forgets the previous gains (R11.4). The visit flow calls it at the start of every room and before the missed-sound replay. The listening page never calls it, so its whole session is one Room_Span (D27).

### Stopping

Every stop, whatever the reason, does the same in this order: `backend.fadeToSilence(stopFadeMs)`; end the Busy_Interval; become stopped with the reason; notify every `onStop` listener; and after `stopFadeMs` plus one scheduling lead, by the injected timer, `backend.suspend()`, or `backend.close()` for `pageLeft` (R14.1 to R14.7, R12.3). A stop while already stopped repeats the fade, which is harmless, and keeps the first reason.

The reasons come from the session (`stopAll`, reason `control`) or from the backend's events: `hidden`, `pageLeft`, `deviceChanged`, `interrupted`. `deviceChanged` also forgets the kept calibration, so no ghost sound plays until the visitor calibrates again (R14.6, D18).

The silence does not depend on the timer. The fade is scheduled on the audio thread and holds at exact zero after `stopFadeMs`, even if the page's timers are throttled because the tab is hidden. Suspending is only tidying up.

## The Web Audio backend (`web-audio-backend.ts`, `output-graph.ts`)

### The graph

`createOutputGraph(context)` takes any `BaseAudioContext`, so the Browser_Suite can build the same graph in an `OfflineAudioContext`. It creates one `GainNode`, the stop gain, with `channelCount = 2`, `channelCountMode = "explicit"`, `channelInterpretation = "discrete"` and gain 1, connected to the destination. It also sets the destination's `channelCount = 2` and `channelInterpretation = "discrete"`.

- `play(left, right, sampleRateHz, startS)`: creates an `AudioBuffer` with two channels, the sound's length and the context's rate, writes `left` with `copyToChannel(left, channelIndex.left)` and `right` with `copyToChannel(right, channelIndex.right)`, creates an `AudioBufferSourceNode` for it, connects it to the stop gain, and starts it at `startS`. When it ends, it disconnects. Before the first sound after a stop, the stop gain is set back to 1 at the current time, while no source is playing. The buffer's rate is the context's rate, so nothing is resampled (R6.5).
- `fadeToSilence(durationS)`: on the stop gain, `cancelScheduledValues(now)`, `setValueAtTime(1, now)`, then `setValueCurveAtTime(curve, now, durationS)` with a 64-point raised-cosine fall from 1 to exactly 0. Every live source is stopped at `now + durationS`. After the curve, the gain holds 0, so every sample is exactly zero (R10.6, R14.1).

There is no other node and no source between sounds (R3.4, R6.6). `channel-index.ts` holds `{ left: 0, right: 1 }` and is the only place the structure steering's ban on 0 and 1 for channels gives way, because Web Audio needs indices (D25).

### The backend

`createWebAudioBackend(window)` implements `AudioBackend`:

- `hasWebAudio()`: `typeof window.AudioContext === "function"`. Safari's prefixed constructor is not used: every supported browser has the unprefixed one.
- `userActivationActive()`: `window.navigator.userActivation?.isActive ?? null`.
- `createOrResume()`: the first time, `new window.AudioContext()` with no options (D11), then `createOutputGraph`, and, where `navigator.audioSession` exists, `navigator.audioSession.type = "playback"` (D24). Later, `context.resume()`.
- `sampleRateHz()`, `outputChannelCountMax()` (`destination.maxChannelCount`), `currentTimeMs()` (`currentTime × 1000`).
- `whenRunning()`: resolves when `context.state` is `running`.
- `timestampPair()`: from `context.getOutputTimestamp()` where it gives both times, which accounts for output latency, otherwise `currentTime` and `performance.now()` read together (D17).
- Events: `visibilitychange` with `document.visibilityState === "hidden"` gives `hidden`; `pagehide` gives `pageLeft`; `navigator.mediaDevices` `devicechange`, where it exists, gives `deviceChanged`; the context's `statechange` to any state other than `running`, while the shell did not ask for it, gives `interrupted` (R14.3 to R14.6).

### The fake backend

`createFakeAudioBackend(options)` implements `AudioBackend` with a settable sample rate, channel count, activation flag and clock. It records every call (`createOrResume`, `schedule` with the channels it received, `fadeToSilence`, `suspend`, `close`) and lets a test fire any backend event. Only tests import it; the final task checks that the bundle does not contain it.

## The listening page

`listen.html` sits next to `index.html`. `npm run dev` serves it at `/listen.html`. `vite build` builds only `index.html`, its default input, so the page is never deployed and nothing links to it (R19.1, D26). Its script is `src/ui/listening-page/start-listening-page.ts`, which draws a seed with `crypto.getRandomValues`, creates the `RandomSource` and the system timer, and calls `renderListeningPage(document, window, { random, seed, timer })`. That calls `createListeningPageSession({ window, timer, random })` in `src/session/`, which creates the Web Audio backend, the shell and the calibration controller. The UI never touches the output stage itself.

The page, top to bottom:

1. **Header.** "Development page: listening" and "This page is for development. It is not part of a visit. Levels are relative to your own calibration." (R19.2, R18.3)
2. **Stop.** A "Stop all sound" button, fixed at the top of the window and visible from the first paint (R14.8). After any stop, a line gives the reason and a "Start sound again" button calls `activate`.
3. **Start.** A "Start" button that calls `activate` inside its click handler. Before it is pressed, nothing has created an `AudioContext` (R19.3). After it, the page shows the sample rate, or the unsupported line.
4. **Calibration.** Up and down buttons that move the target by one step, the played setting, the lines of the calibration table above, and "Keep this setting". The first repeat is always at −60 (R19.5).
5. **Headphone check.** Shown after a calibration is kept: "Play the check", the question and its four answers.
6. **Sounds.** Shown after a calibration is kept. One row per Sound: name (the Sound_Id), a level control with − and + buttons that move one grid step between `floorDb` and the room's rounded top, starting at the lower of −25 and that top, "Play left", "Play right", the room's top, and for the last sound of the row the requested level, the played level and the clamp limit (R19.4, R19.6).
7. **Details.** The seed, the sample rate, the calibration setting, the Range_Report including the floor RMS, and the Clamp_Log (R19.7).

Pressing + several times and then playing asks for a rise of more than 5 dB. The shell lowers it to 5 dB above the last sound on that ear and the row shows "rise" as the clamp limit. That is how the page shows the rise limit working.

## What the visit-flow spec must do

The output stage enforces the rules on its own, but these obligations fall to the visit flow:

- Call `activate` only from a gesture handler, and show the stopped and unsupported lines from `output-state-copy.ts` when the shell reports them.
- Calibrate, then run the headphone check, before any room (product.md step 2). The architecture lists the headphone check before calibration; before calibration only the calibration noise may play, and its level would mean nothing, so the order of product.md is used (D20).
- Call `beginRoom` at the start of every room and before the missed-sound replay.
- Give each room's search `roomSearchCapDb(rangeReport.rooms[id].topLevelDb, settings)` as its `capRelativeToAnchorDb`, and record `playedLevelDb` from the play outcome in the visit log, not the level the engine asked for.
- Play replays with the Purpose `replay`.
- After a stop with reason `deviceChanged`, calibrate again before any further ghost sound.
- Judge answers against `startMs`, converted to the page clock with `timestampPair`.

## Measurements

Measured with the shipped render functions before this design was written. Peak is given in dB above the reference RMS (0.05 of full scale), which is the crest factor.

| Sound | Seeds per rate | Median | 99.9th percentile | Largest | Peak_Bound | Share above the bound |
|---|---|---|---|---|---|---|
| cellar | 6000 at 44100 and at 48000, 150 at 22050 and at 96000 | 12.1 | 13.0 | 13.1 | 13.5 | none |
| corridor | 2000 at 44100 and at 48000, 150 at 22050 and at 96000 | 4.8 | 5.0 | 5.0 | 5.5 | none |
| nursery | as corridor | 9.3 | 9.5 | 9.5 | 10.0 | none |
| stairs | 8000 at 44100 and at 48000, 150 at 22050 and at 96000 | 14.8 | 19.3 to 19.5 | 20.5 | 17.0 | 5.4 % at 44100, 5.1 % at 48000 (6000 seeds each) |
| attic | as corridor | 4.3 | 4.3 | 4.3 | 4.5 | none |
| calibration | 2600 at 44100 and at 48000, 150 at 22050 and at 96000 | 13.0 | 15.1 to 15.3 | 15.3 | 15.5 | none |

Seeds were consecutive integers from 500000 and from 900000. Values are in dB above the reference RMS.

At the reference level, the largest calibration noise peak was 0.29 of full scale and the largest stairs peak 0.48. Both are above the 0.25 ceiling, so neither can be played at Calibration_Setting 0 dB and Level 0 without the ceiling acting. This is why the control's top sits below 0 dB.

Effect of a 25 ms raised-cosine Output_Fade on top of each sound's own fade, over 50 seeds at each of the four rates: the RMS fell by at most 0.0011 dB (stairs) and 0.0020 dB (calibration noise), and by less than 0.0001 dB for the other four. The ghost-sounds level tolerance is 0.01 dB. The shortest fade measured after the Output_Fade was 24.6 ms (cellar, whose knocks rise over 25 ms), then 28.8 ms (nursery), 43.7 ms (stairs) and 44.8 ms (calibration).

The digital floor. At the top of the control (−4 dB), a sound at `floorDb` (−70) has an RMS of about 1.0 × 10⁻⁵ of full scale, about 100 dB below full scale. At −19 dB it is about 115 dB below. A 16-bit path, which many Bluetooth codecs use, resolves about 90 dB below full scale. So on such a path the quietest levels of the search are below one step of the output whatever the calibration. This is the cost the steering accepted for a low ceiling, and is the subject of Q1.

## Error handling

| Situation | Behaviour |
|---|---|
| Any `preparePlayback` input, however wrong | A refusal with a reason, never an exception |
| A render function throws | Refusal `renderFailed` |
| Eight renders above the Peak_Bound | Refusal `peakBoundNotMet` |
| Play before `activate`, while stopped or starting | Refusal `notRunning` |
| Ghost sound, calibration noise or headphone check before a kept calibration | Refusal `notCalibrated` |
| Calibration_Repeat outside a calibration | Refusal `notCalibrating` |
| A sound requested while another plays | Refusal `busy` |
| No `AudioContext` constructor | Unsupported, `noWebAudio` |
| Context rate below 22050 Hz | Unsupported, `sampleRateTooLow`, context closed |
| Destination has fewer than two channels | Unsupported, `monoOutput`, context closed |
| `activate` outside a user activation, where the browser tells | `noGesture`, nothing created or resumed |
| `resume()` rejects | Stopped with reason `interrupted` |
| Tab hidden, page left, device changed, context interrupted | Stop with that reason |
| A requested level above the anchor cap, too steep a rise, or a peak that would go beyond the ceiling | Played lower, reported, logged |

## Correctness properties

"Universal" properties use fast-check with a new random seed on every run (R20.5). The brief's three properties are CP1, CP2 and CP3.

Buffers come from `output-arbitraries.ts`. A buffer arbitrary draws a shape (uniform noise, a sine, a constant, a step from zero at a random position, a single impulse, all zeros, a raised-cosine-faded tone, or one of the shipped sounds at a random seed), a length from 1 to `floor(1.5 × rate)` samples, a scale from 10⁻³⁰ to 10³⁰ (log-uniform, plus exact 1), and a seed for its own content, and fills a `Float32Array` from a seeded source, so a case can be replayed without storing samples. A "wild" variant also puts NaN or ±Infinity at random positions. Levels are drawn from −200 to +200 dB, plus ±Infinity, NaN, the anchor cap and values just above it. Calibration gains are drawn log-uniform from 10⁻¹² to 10¹², plus 0, negatives, NaN and +Infinity. Sample rates come from the supported ones of the ghost-sounds arbitraries and from rejected ones.

**CP1. Nothing goes beyond the cap** (Universal, 300 runs; R7.1, R7.2, R7.7, R20.1; brief property 1). For any request, the result is a refusal, or every sample of both channels has `|s| <= ceilingFraction`, `playedLevelDb <= capRelativeToAnchorDb`, `playedLevelDb <= requestedLevelDb`, and the refusal `beyondCeiling` never occurs.

**CP2. The other ear is silent** (Universal, 300 runs; R6.1, R20.2; brief property 2). For any request for one ear that is not refused, `Object.is(s, 0)` holds for every sample of the other channel, and the other channel has the same length as the played one.

**CP3. Every sound fades in and out** (Universal, 300 runs over arbitrary buffers and 50 runs per shipped sound at any seed and any supported rate; R10.1, R10.2, R20.3; brief property 3). For any result that is not refused, the first and last samples of each channel are `+0`, and `measureFadeLengths` of each channel that is not all zero gives a fade in and a fade out of at least `fadeMinMs`. Every shipped sound at a level at or below its room top is not refused.

**CP4. Unsafe requests are refused** (Universal, 200 runs; R6.3, R7.6, R10.2 to R10.5). A request is refused with the stated reason when: the rate is not supported; the buffer is empty, too long, or holds a non-finite sample; the level or the gain is not finite, or the gain is not above zero; a ghost sound asks for both ears; or the buffer jumps from zeros to its peak at any position at least `outputFadeMs` from either end (`fadeTooShort`).

**CP5. The level reported is the level played** (Universal, 300 runs; R7.3, R7.4, R8.1, R8.2). For any result that is not refused: with no clamp limit, `playedLevelDb === requestedLevelDb`; always, `appliedGain` equals `calibrationGain × decibelsToGain(playedLevelDb)` within 10⁻⁹ relative, and the played channel equals `Math.fround(faded[n] × appliedGain)` for every n (with `-0` as `+0`). When the limit is `ceiling`, the peak is at least `ceilingFraction × (1 − 10⁻⁶)`. When the requested level is above the anchor cap, a limit is reported.

**CP6. A room at or below its top is never clamped** (Universal, 100 runs per Ghost_Sound and for the calibration noise; R8.3, R9.1, R9.4, R11.6). For any seed, any supported rate, any grid setting in the Control_Range from the Keep_Minimum to the top, and any grid level from `floorDb` to `roomSearchCapDb` of the room top: `renderPlayableBuffer` gives a buffer, `preparePlayback` with no previous gain is not refused, has no clamp limit, and the RMS of the played channel is within `levelToleranceDb` of `referenceRmsFraction × appliedGain`.

> **2026-11-17: the remaining audio safety rules were dropped.** The project owner dropped them as rules after playing (`.kiro/steering/audio-safety.md` now lists defaults only). `preparePlayback` no longer refuses `tooLong` or `fadeTooShort`, no longer clamps to the anchor cap, and no longer takes `previousAppliedGain`; `ClampLimit` is only `ceiling`. It still applies the Output_Fade, routes with exact zeros on the other channel, and turns a sound down to the ceiling, which is the top of the level scale. CP1 now checks the ceiling and the request only, CP3 checks the house's own sounds for fade lengths and any buffer for +0 ends, CP4 checks only broken requests, and CP5 no longer expects a clamp above the anchor cap. The loosening guards of D32 were removed from the config tests. The text below is kept as it was decided.

**CP7. No jump upward** (removed on 2026-11-17). The project owner dropped audio-safety rule 4 after playing: the shell no longer limits a rise, and `audio-output-cp7-rise-limit.property.test.ts` was deleted with it. `create-audio-output.test.ts` checks that a sound is played as asked above the one before it, within the cap and the ceiling. The text below is kept as it was decided.

**CP7. No jump upward** (Universal, 200 runs; R11.1 to R11.5). Any sequence of 1 to 40 operations on a shell with the fake backend, each a play on a random ear at a random level with a random Purpose, or a `beginRoom`: between two consecutive sounds on the same ear with no `beginRoom` in between, where the second's Purpose is not `replay`, the applied gain in dB rises by at most `upwardStepDb + 10⁻⁹`. A clamp by `rise` happens exactly when the requested gain would have risen more. Replays obey CP1.

**CP8. The threshold search plays a room without a clamp** (Universal, 100 runs; R11.6, R9.6). For any grid setting from the Keep_Minimum to the top, any Ghost_Sound, any seed, and a listener drawn from `tests/listeners` (the psychometric and the extreme listeners), the engine's search with `capRelativeToAnchorDb = roomSearchCapDb(top)`, after `beginRoom`, driven through the shell with the fake backend until it finishes: every trial is scheduled, none has a clamp limit, and each played level equals the level the engine asked for.

**CP9. The calibration control** (Universal, 200 runs; R16.1 to R16.6, R15.1). For any sequence of requested settings (any doubles), interleaved with keeps: the first repeat of each calibration is at `calibrationSettingMinDb`; every played setting lies on the step grid and in the Control_Range, and at most `calibrationRiseMaxDb` above the one before; no repeat is clamped by the ceiling; a keep refuses `noRepeatPlayed` before the first repeat and `systemVolumeHigh` below the Keep_Minimum, and otherwise keeps the last played setting; before a keep, every `play` and `playHeadphoneCheck` is refused `notCalibrated`.

**CP10. Stop holds, and one sound plays at a time** (Universal, 300 runs; R4.4, R12, R14.1 to R14.7). For any sequence of shell operations and backend events (activate, the backend becoming running, plays, repeats, keeps, `stopAll`, hidden, page left, device changed, interrupted, clock advances): after any stop, `fadeToSilence(stopFadeMs)` has been called, and no `schedule` call happens until the next `activate` and running; nothing is scheduled while the state is not running; the Busy_Intervals of scheduled sounds never overlap; after `deviceChanged`, every ghost sound is refused until a new calibration is kept; every stop is reported to every listener.

**CP11. The range report** (Universal, 300 runs; R9.2, R9.5, R9.6). For any calibration gain from 10⁻⁶ to 10², each `topLevelDb` equals the formula, is at most the anchor cap, `setBy` names the smaller of the two limits, and tops do not rise when the gain rises. `roomSearchCapDb` returns a grid level at most the top and more than `top − upwardStepDb`, and at most the anchor cap.

**CP12. The core is pure** (Universal, 100 runs; R3.5). Two calls of `preparePlayback` with equal requests give equal results sample for sample, and the input samples are unchanged afterwards. `renderPlayableBuffer` with sources from equal seeds gives equal buffers and equal attempt counts.

**CP13. Devices that cannot carry the house** (Universal, 100 runs; R5.2 to R5.4). For a fake backend reporting any rate below 22050 Hz or not finite, or fewer than two channels, or no Web Audio: after `activate` the state is unsupported with the right reason, the context is closed where one was created, and every later call, including `activate` and Calibration_Repeats, plays nothing.

Example tests cover the rest: config values and guards, each helper, the copy lines and the banned-term check, the shell's call order inside `activate` (the backend's `createOrResume` happens before the first `await`), the timer-driven suspend after a stop, the clamp log, and the calibration controller with the manual timer.

Run counts aim for a suite under about 30 seconds on the project machine. The heaviest are CP3 and CP6, which render shipped sounds (10 to 50 ms each). If CP3, CP6 and CP8 together take more than 30 seconds, their counts are halved and the change is recorded in D28.

## What is proved where

| Claim | Under Node | In Chromium, automated | Needs a person with headphones |
|---|---|---|---|
| No sample beyond the ceiling, no level above the anchor cap | CP1, CP5, CP6 | Every buffer handed to Web Audio checked (R21.2) | |
| The other channel is exact zero | CP2 | Recorded buffers and the offline graph render (R21.2, R21.3) | Lifting each earpiece in turn (item 6) |
| Left plays left, right plays right | The channel the samples are in (CP2) | Offline render: left buffer comes out on channel 0 (R21.3) | Items 5 and 6 in two browsers, because only a listener knows which earpiece is which |
| Fades of at least 20 ms | CP3 | | No click at start or end (items 3, 6) |
| No jump upward | CP7, CP8, CP9 | | |
| Stop silences everything | CP10 (calls made) | Offline render reaches exact zero within 20 ms; page stop and hidden page (R21.3, R21.4) | Items 8 to 10 |
| Sound only after a gesture | Call order unit test | No context before Start; one after (R21.1) | |
| First sound is the quietest calibration noise | CP9 | First recorded buffer (R21.2) | Item 3 |
| Device that cannot carry the house | CP13 | | Item 12, if a headset with a call mode is at hand |
| The quietest levels are actually produced by the device | | | Item 11 (feeds Q1) |
| The calibration range lets a visitor match their hands | | | Items 3 and 4 |

## Manual checks

The project owner follows this list on the Listening_Page, once in each of two desktop browsers (Chrome and one of Safari or Firefox), and writes the answers into `docs/experiments/audio-output-listening.md` (R22). Nothing in it is claimed until that file exists.

1. Set the system volume to where you usually listen, put the headphones on, run `npm run dev` and open `/listen.html`. The page says it is a development page. Nothing plays.
2. Press Start. The sample rate shown is 22050 Hz or more. Still nothing plays.
3. Start calibrating. The first hiss is very quiet or silent, in both ears. Step it up while rubbing your hands next to one ear until the two match. Each hiss starts and ends without a click. Note the setting.
4. Keep the setting. Read the volume line and, if shown, the rooms line. Note the room tops in the details.
5. Play the headphone check. The hiss is in your left ear only. Answer "Right" once on purpose and read the turn-around line.
6. For each of the six sounds, press Play left, then Play right, at the starting level. Each plays only in the named ear: lift the other earpiece and hear nothing from it. No sound starts or ends with a click.
7. Take one sound up one step at a time to its top. Each press is a little louder, never a leap, and the top sound has no crackle.
8. Start a hiss and press "Stop all sound" while it plays. It goes silent at once without a click. Play is refused until you press "Start sound again".
9. Start a hiss and switch to another tab. Come back. It went silent and stays silent until you press "Start sound again".
10. Start a hiss and close the tab. It goes silent.
11. Optional, for Q1: take each ghost sound down to the floor in steps and note the quietest level you can still hear, with the headphones used, wired or Bluetooth.
12. Optional: with a Bluetooth headset in call mode, or with the system's mono audio setting on, open the page and note what it says, or what the headphone check says.

## Testing strategy

- `npm test` runs every unit and property test of this spec under Node, with the fake backend standing in for Web Audio.
- `npm run test:e2e` runs the Browser_Suite against the development server in Chromium, next to the existing tests against the built site. The suite installs probes before the page's scripts, as `placeholder-page.spec.ts` does, that wrap `AudioContext`, `AudioBuffer.prototype.copyToChannel` and `AudioBufferSourceNode.prototype.start` and keep a copy of every channel handed to Web Audio. For the offline render it imports `/src/audio/output/output-graph.ts` from the development server inside the page and renders into an `OfflineAudioContext` at 48000 Hz. A hidden page is simulated by overriding `document.visibilityState` and dispatching `visibilitychange`.
- `npm run lint` keeps every Web Audio name inside `src/audio/output` and clock reads out of `src/session`, unchanged.
- The final task builds the site and searches `dist/` for the listening page's strings, for `createFakeAudioBackend` and for `listen.html` (R21.5).
- Counterexamples follow the convention of the earlier specs: a named case in `tests/properties/audio-output-regressions.test.ts`, first with `it.fails`, then turned into `it` by the commit that fixes it. A case that could only be removed by loosening a safety value stays an expected break, and a question is added for the project owner.

### Requirement coverage

| Requirement | Checked by |
|---|---|
| R1 | `audio-safety-config.test.ts`; a search in the final task for the literal 0.25 outside `src/config` |
| R2 | `audio-output-config.test.ts`, `calibration-setting-top.test.ts` |
| R3 | `npm run lint`; CP12; `create-audio-output.test.ts`; R21.5 |
| R4 | `create-audio-output.test.ts` (call order, `noGesture`); CP10; R21.1 |
| R5 | CP13; `output-copy.test.ts`; Manual item 12 |
| R6 | CP2; `prepare-playback.test.ts`; R21.2, R21.3; Manual items 5 and 6 |
| R7 | CP1, CP5; `create-audio-output.test.ts` (clamp log) |
| R8 | CP5, CP6 |
| R9 | CP6, CP11; `render-playable-buffer.test.ts`, `range-report.test.ts`, `room-search-cap.test.ts` |
| R10 | CP3, CP4; R21.3; Manual items 3, 6 and 8 |
| R11 | CP7, CP8 |
| R12 | CP10 |
| R13 | `create-audio-output.test.ts` |
| R14 | CP10; R21.3, R21.4; Manual items 8 to 10 |
| R15 | CP9 |
| R16 | CP9; `next-calibration-setting.test.ts`, `calibration-controller.test.ts` |
| R17 | `judge-headphone-check.test.ts`; `create-audio-output.test.ts`; Manual item 5 |
| R18 | `output-copy.test.ts` |
| R19 | `listening-page-session.test.ts`; R21; review in the final task |
| R20 | The property test files |
| R21 | `tests/e2e/listening-page.spec.ts` |
| R22 | This section; `docs/experiments/audio-output-listening.md` once written |
| R23 | Review in the final task, and `findBannedTerms` over the changed READMEs |

## Rule by rule

How each rule of `audio-safety.md` is enforced, and where a wish gave way to it.

| Rule | Mechanism | Where a wish gave way |
|---|---|---|
| 1. One output path | The shell renders every sound itself and accepts no samples from callers (D4). Web Audio is named only in two files of the module (D3). The graph has one stop gain and no source between sounds. Lint, unchanged, keeps sound APIs out of every other file | The architecture's "takes a sample buffer" becomes "takes a Sound_Id", so no caller can hand over unchecked samples |
| 2. A hard cap | Steps 6 to 8 and 11 of `preparePlayback`. The ceiling acts on every output sample after all gains, the anchor cap on the level. The lower wins. Every clamp is returned and logged (D22) | The brief asked that the control "cannot go above the absolute ceiling". It stops lower, at −4 dB, so that every room keeps some range (D8). The full +15 dB range in every room gives way to the ceiling: at most settings some rooms stop lower, and the house says so instead of raising the ceiling (D9) |
| 3. No sudden sounds | The Output_Fade on every buffer, the fade check with the ghost-sounds measurement, refusal of any buffer that still rises too fast (D13). A 20 ms raised-cosine fade on every stop (D14) | The brief's "stops all sound at once" becomes a 20 ms fade, the shortest the rule allows, because a hard cut is a sudden sound |
| 4. No jumps upward | The rise limit on applied gain per ear per Room_Span, for every Purpose but `replay` (D15). Calibration repeats rise by at most 5 dB (D8) | On the listening page, pressing + several times plays only one step louder |
| 5. Silent means silent | The other channel is a fresh array of zeros. Ghost sounds are refused in both ears (D21). Nothing plays between sounds. A device with one output channel is refused (D12). The headphone check catches a system mono setting | |
| 6. Short sounds | Buffers longer than 1.5 s are refused. One sound at a time (D16) | The calibration noise is a series of 1.5 s repeats, not a loop |
| 7. The visitor stays in control | `stopAll` and the backend's hidden, page-left, device-changed and interrupted events. Stopped holds until the visitor presses Start again (D14, D18). The listening page shows a stop control from the first paint | |
| 8. Calibration and the volume keys | The kept-calibration line. No line ever advises raising the volume (D9). A setting below −40 dB is refused with advice to turn the volume down (D10) | The wish for more range would be served by asking the visitor to raise the volume and calibrate again. That raises how loud the ceiling is at the ear, so it is not done, and is Q2 |
| 9. No jump scares | Nothing here plays anything but the six sounds, faded and capped | |

No number or rule from a steering file is changed by this spec.

## Questions for the project owner

These would need a looser safety value, or touch a value only the owner may loosen. None is decided here.

**Q1. The ceiling, the stairs peak and the floor.** With the ceiling at 0.25 and the stairs scrape's peaks up to 17 dB above its RMS (after the Peak_Bound), every room reaches the +15 dB cap only at Calibration_Settings of −19 dB and below. At the control's top (−4 dB) five of the five ghost rooms stop short, the stairs room at 0 dB. At the same time, the floor (−70 dB) lies about 100 to 115 dB below full scale, under one step of a 16-bit output path, at every allowed setting. The design does not raise the ceiling. Options after the first listening session, for the owner to choose from: keep everything and accept the range; raise the floor in `hearing-method.md` (a method change, not a safety one); ask the ghost-sounds spec for a stairs scrape with a lower crest factor; tighten the stairs Peak_Bound further (more renders rejected); or raise the ceiling, which needs the owner's approval under `audio-safety.md`. Manual item 11 gives the evidence.

**Q2. Advising a higher system volume.** A visitor whose hiss is still quieter than their hands at the top of the control could be told to raise the system volume and calibrate again. That would make every room's range larger, but it also makes the ceiling louder at the ear, and the steering keeps the ceiling low because the product cannot know the system volume. The design never gives that advice. Should it, before calibration only?

**Q3. New values that bear on safety.** This spec adds values that are not in the steering table but act like it: the control's bottom (−60 dB), the Keep_Minimum (−40 dB), the rise between repeats (5 dB), the Output_Fade (25 ms), the stop fade (20 ms) and the headphone check level (0 dB). Their config test guards them against loosening (D32). Should they be added to the Initial values table of `audio-safety.md`, so that the steering itself requires approval to loosen them?

**Q4. A stop without a fade.** If the owner wants the stop control to cut sound with no fade at all, that would loosen rule 3, and is not done. The design uses the shortest fade the rule allows.

## Decisions

Each point below was open in the brief, the steering, the architecture or the code, and was settled here without being able to ask.

**D1. The ceiling is `ceilingFraction: 0.25` in `audioSafetyConfig`, on absolute sample values, with equality allowed.** The steering says "no output sample beyond 0.25 of full scale". "Beyond" is read as strictly greater, so a sample of exactly 0.25 is allowed and `≤` is the test. It applies to every sample of both channels after every gain, the stop gain included (which only lowers). The steering's "about 12 dB below full scale" is a description, not a second number: 0.25 is 12.04 dB below. The field joins the two existing ones in the file the ghost-sounds spec created for this purpose (its D1), with a loosening guard like theirs.

**D2. The cap relative to the anchor is `hearingMethodConfig.capRelativeToAnchorDb`, read, not copied.** Rule 2 calls it "the cap set in `src/config`"; the hearing-method table holds it as "Loudest allowed level | 15 dB above the anchor". A second copy in `audioSafetyConfig` could drift from the one the engine uses. The output stage treats it as a hard cap. The engine may use a lower cap per room (D7), never a higher one, because the output stage would clamp it.

**D3. Web Audio is named in two files, `web-audio-backend.ts` and `output-graph.ts`. Everything else in the module is plain TypeScript behind the `AudioBackend` interface.** The structure steering says nothing outside `audio/output` may import the Web Audio types, and the brief asks that the safety properties be testable without a browser. With the browser behind an interface that uses only numbers, `Float32Array`s and callbacks, the shell's state machine (gesture, stop, busy, lifecycle, calibration) is tested under Node as thoroughly as the pure core. The two Web Audio files are kept thin enough to read in full, and are checked in Chromium by the Browser_Suite.

**D4. The shell renders sounds from a Sound_Id. Callers cannot hand it samples.** The structure steering does not let `session` import `audio/synth`, so the session cannot produce a buffer, and the architecture's "takes a sample buffer" would need one. Rendering inside the output stage also makes the Peak_Bound (D6) enforceable: the shell knows which sound a buffer is and that it came from the synth. The pure `preparePlayback` still takes any buffer, which is what the brief's properties are stated over. When the last door needs its digits and noise, they get Sound_Ids of their own in the synth.

**D5. When a level would push a sample past the ceiling, the whole sound is turned down until its peak meets the ceiling, and the level reported is the level played.** The brief's finding says the sound must never be clipped, because clipping spreads energy outside the room's band, and that the level played must be the level reported. A gain for the whole sound keeps its shape and band. Rule 2 says a request above the cap is clamped and logged, never played as asked; turning the gain down is that clamp. The level that results is generally not on the search's grid, which is why the visit flow must avoid it in the first place (D7), and why the shell reports `playedLevelDb` for the visit log. The four tiny reductions of step 8 only absorb rounding, so that the last check of step 11 holds by construction.

**D6. Each sound has a Peak_Bound. A render above it is replaced by another render, up to eight attempts.** The room's highest playable level has to be known before the room starts, but each presentation is a new random render with its own peak. A bound on the peak, enforced on every buffer before it plays, turns the unknown peak into a known one. The bounds come from the measurements: each one sits above every peak measured for the five tone and calibration sounds, by 0.2 to 0.5 dB. For the stairs scrape, whose peaks have a long tail (median 14.8 dB, largest 20.5 dB), the bound is 17 dB, which rejects about 5 percent of renders. Each dB lower gives the stairs room one dB more range and rejects more: 16 dB would reject about one render in six. 17 dB gives up the peakiest twentieth of the scrape's random realisations, which changes no quantity the ghost-sounds spec lets vary (its R5.7), at a cost of about 6 percent more stairs renders. If the synthesis changes, the bounds must be measured again; CP6 and CP3 break at once if a bound is too low for a sound, because renders start being refused.

**D7. The output stage reports the room's top exactly. A session helper rounds it down to the search's grid, and the visit flow gives that to the search as its cap.** The brief asks how the caller learns, before a room starts, the highest playable level for that room's sound with the current calibration, so that the search can use it as its cap. The engine's validation demands a cap on the grid from the starting level in upward steps, and an integer. The output stage cannot import the engine and should not know its grid, so the rounding is a pure function in `src/session/`, which may import both. With the cap at a grid level at or below the top, and every playable buffer within its Peak_Bound, no trial can reach the ceiling (CP6, CP8). The Range_Report also gives the RMS at the floor, so the owner can see how far down the digital level goes (Q1).

**D8. The calibration control runs from −60 dB in 1 dB steps, rises by at most 5 dB per repeat, and stops at the highest setting where every room can still reach the anchor. The first repeat of every calibration is at −60 dB.** The brief says the calibration starts quiet and the control cannot go above the absolute ceiling, and the listening page must be safe to open at any system volume. At −60 dB the hiss has an RMS about 86 dB below full scale, quiet even at the highest system volume of sensitive earphones. The 5 dB limit per repeat applies rule 4 to the calibration noise, so dragging the control to the top plays a series of steps, about a dozen repeats from bottom to top, instead of a leap. The 1 dB step lets the visitor match finely. For the top, the ceiling alone would allow about −1.5 dB (the calibration noise's own peak). But at that setting the stairs room could only be played up to about −1.5 dB, and if a room's top were below the starting level of the search, the search could not run there. `roomTopMinDb` = 0 sets the top so that every room can at least reach the anchor, the level the visitor matched to their hands. That is stricter than the ceiling, which the steering allows, and gives −4 dB. The setting that is kept is the last one played, so the stored gain is always one the visitor actually heard. The gap of 400 ms between repeats keeps them distinct.

> **Changed by the owner on 2026-11-16, after playing.** The bottom of the control is −40 dB, not −60, and the calibration sound follows the control: `calibrationRiseMaxDb` is 40, the whole control, and calibration repeats are not held to the per-ear rise limit of the ghost sounds. The guards are `calibrationSettingMinDb <= −40` and `calibrationRiseMaxDb <= 40`. The values in this design below are the ones it was written with. See `.kiro/specs/audible-start/tasks.md`, "The calibration control of 2026-11-16".

**D9. When the kept setting leaves rooms short of the cap, the house says how many, says it will stop at the loudest it can play, and says not to turn the volume up. It never advises raising the system volume.** The brief asks what the control tells the visitor when the setting leaves too little range upward, and says not to raise the ceiling to make room. "Too little" is read as "a room whose top, on the search's grid, is below +15 dB": that is when the search may end in "worse than cap" for a reason that is the house's, not the ear's. The only remedy the visitor has is to raise the system volume and calibrate lower. That would make the ceiling louder at the ear, which is the one protection that holds when everything else fails, and rule 8 exists because raising the volume undoes the cap. So the remedy is not offered (Q2). Rule 2 and rule 8 win over the wish for range.

**D10. A setting below −40 dB cannot be kept. The house asks the visitor to turn the system volume down and match again.** A visitor who matches their hands at a very low setting has a very high system volume. At setting S the ceiling lies about 14 − S dB above the anchor at the ear, so at −40 dB it is about 54 dB above the sound of their hands. That is the opposite end of the brief's trade: little range lost upward, but the worst case far louder, and the quietest levels pushed towards what the device cannot play. Lowering the system volume makes both better. Advice to turn the volume down is always safe. −40 dB is a starting value without a source. A rough estimate of where settings will fall: if hands rubbing reach the ear at about 65 dB SPL (the unverified figure in `hearing-method.md`) and the headphones, at the volume the visitor uses, play full scale at 90 to 115 dB SPL, the match lies between about −24 and +1 dB. Those above −4 dB meet the top of the control (D8). −40 dB is well below the bottom of that estimate, so it should only stop a visitor whose volume is far higher than usual.

**D11. The `AudioContext` is created without a sample rate, so it runs at the device's rate. Below 22050 Hz the output stage plays nothing, including the calibration noise, closes the context, and reports `sampleRateTooLow`.** Asking for 48000 Hz would hide the problem: a headset in call mode would still play at 16000 Hz after the operating system resamples, and the attic room, at 8 kHz with a band edge at 8980 Hz, would be silently removed by that resampling. The visitor would then miss every attic sound and be told so, which is a false finding about their ears. A context at the device's rate shows the problem where the browser exposes it. The calibration noise is refused too, because a calibration made in call mode would anchor every later level to the wrong device. The visitor is told to close apps using the microphone or reconnect the headphones. A device that switches to call mode after the context was created cannot be detected; the `devicechange` stop (D18) catches some of those cases. Manual item 12 checks what happens on a real headset.

**D12. A destination with fewer than two channels is refused. The operating system's mono audio setting, which the page cannot see, is caught by a "both sides" answer in the headphone check.** Rule 5 requires exact zero on the other channel, which a mono device cannot deliver. `destination.maxChannelCount` reports a mono device. An accessibility setting that mixes left and right for the listener happens after the browser and is invisible to it, so the check asks the visitor and explains the setting.

**D13. Every buffer is multiplied by a 25 ms raised-cosine fade at each end, and then refused if the ghost-sounds fade measurement still finds a fade shorter than 20 ms.** The brief says the output stage applies the fades, and its property 3 asks that every rendered sound starts and ends at zero with fades of at least 20 ms. A fade on top of the synth's own fade protects against a synth bug that removes it. It cannot fix a sound that jumps in the middle, so the measurement then refuses the buffer, and refusal means silence. 25 ms instead of 20 ms leaves a margin, so that a flat sound with no fade of its own measures at about 25 ms and is not refused by rounding (as the ghost-sounds spec found in its D6). The measured effect on the shipped sounds is a fall in RMS of at most 0.002 dB, well within the 0.01 dB level tolerance, so the level played is still the level reported (R8.3). The fade is applied in 64-bit floats before any gain, so the gain arithmetic sees the final shape.

**D14. Every stop is a 20 ms raised-cosine fade to exact zero on one stop gain, then every source stops, then the context is suspended. Stopped holds until the visitor starts sound again.** Rule 7 asks that the control stop all sound at once. Rule 3 says every sound fades out over at least 20 ms. A hard cut is itself a sudden sound, a click with energy at every pitch, so rule 3 wins and the stop uses the shortest fade the rule allows, 20 ms, which a listener hears as immediate. The fade runs on the audio thread, so it completes even when a hidden tab's timers are throttled. After a stop, nothing plays until the visitor presses something that calls `activate`, so a stop cannot be undone by a timer that fires later, by the visit flow's next trial, or by the tab coming back. On `pagehide` the context is closed after the fade; if the browser tears the page down first, the browser itself stops the audio.

**D15. The rise limit compares applied gains in decibels per ear, with a tolerance of 10⁻⁹ dB, within a Room_Span that `beginRoom` starts. Replays are exempt from the limit, not from the cap.** Rule 4 speaks of levels on the same ear within a room. Comparing applied gains rather than levels gives the same answer while the calibration is fixed and also covers Calibration_Repeats, whose level is always 0 and whose gain rises. The tolerance keeps rounding in the dB conversions from clamping the search's exact 5 dB steps. A sound in both ears counts for both ears. Every played sound, a replay included, becomes the previous sound of its ears, so a sound after a replay cannot rise above the replay's level plus a step. The output stage does not know when a room starts, so the visit flow tells it with `beginRoom`.

**D16. One sound at a time.** Two sounds that overlap add up, and their sum could go beyond the ceiling even though each one alone is within it. The visit never needs overlapping sounds: the search's sounds are 1.5 s at most, the response window is 2 s and the gap at least 1.5 s. A request while another sound plays is refused `busy`. The listening page shows that refusal.

**D17. A sound starts 50 ms after it is scheduled, at a time on the audio clock that is returned. A timestamp pair relates the audio clock to the page clock.** Scheduling ahead lets Web Audio start the buffer on an exact sample, so the returned time is the actual start, not an estimate. 50 ms is long enough for a busy main thread and short enough not to be noticed. `getOutputTimestamp()` relates the audio clock to the page clock at the point where sound leaves the device, so the visit flow can judge key presses, which carry page-clock times, against the moment the sound was played, including output latency where the browser reports it. Bluetooth latency the browser does not report remains unmeasured.

**D18. A hidden tab, leaving the page, a context that stops running on its own, and a change of audio devices all stop all sound. A device change also forgets the calibration.** Rule 7 names hiding the tab and leaving the page. A context can also be interrupted (iOS calls, other apps), in which case the house should be silent and stay so until the visitor acts. A device change can mean that the headphones were unplugged and sound now goes to speakers, or that a different headset is in use; the calibration then describes a device that is gone, so the anchor cap no longer protects at the ear. `devicechange` also fires for microphones and cameras, so it may ask for an unneeded calibration, a small cost for a safety check. It fires only where the browser offers it, which R14.6 states as optional.

**D19. The calibration is kept in memory only.** Nothing in the brief asks to store it. A stored gain would be applied to whatever device and system volume the visitor has next time, which is exactly the situation rule 8 warns about. Comparing visits relies on the visitor calibrating again each time with the same headphones. If the storage spec wants a stored calibration later, it is a decision for that spec and the owner.

**D20. The headphone check comes after calibration and plays the calibration noise in the left ear at the anchor. It takes four answers.** The brief says it plays a sound in the left ear only. Before calibration only the calibration noise may play, and its level would be unknown, so the check needs a kept calibration. The calibration noise at Level 0 is the sound and the loudness the visitor has just chosen as matching their hands, so it is known to be audible and comfortable. Product.md lists calibration and then the left and right check, in that order; the architecture's list has them the other way round, and product.md is followed. "Both sides" catches a mono setting (D12). "I heard nothing" catches an earpiece that is off or disconnected. The check always uses the left ear, as the brief says.

**D21. A ghost sound is never played in both ears.** Every ghost sound in the visit is a trial for one ear (rule 5), and the listening page plays one ear at a time. Allowing `both` for ghost sounds would only add a way to break rule 5. The calibration noise is the one sound played in both ears, during calibration.

**D22. "Logged" means the shell's in-memory Clamp_Log plus the clamp returned with every outcome.** The product has no server and no analytics, so a log can only be in the page. The visit flow copies the played level and the clamp into the visit log, which the result and the replay read. The listening page shows the Clamp_Log. Nothing is written to the console in production.

**D23. `activate` makes its backend calls before its first `await`, and refuses where the browser says that no user activation is active.** Browsers allow an `AudioContext` to start only during a user activation, and the activation is lost across an `await` in some browsers. The tech steering says the context may only be created or resumed inside a user gesture. The output stage cannot see the event that called it, so it relies on the call order and, where available, on `navigator.userActivation.isActive`. A unit test with the fake backend checks the order: `createOrResume` is recorded before the returned promise is first awaited.

**D24. Where Safari offers `navigator.audioSession`, its type is set to `playback`.** On iOS, Web Audio is otherwise muted by the ring/silent switch. A visitor who hears nothing during calibration could then step the control to its top, raise the system volume, and later flip the switch. Setting the type makes the house play regardless of the switch, so what the visitor hears during calibration is what the house plays afterwards.

**D25. `channel-index.ts` is the one place where `left` and `right` become 0 and 1.** The structure steering bans 0 and 1 for channels. Web Audio's `copyToChannel` needs an index. Keeping the mapping in one constant, used only by the graph, keeps the rule everywhere else, and the offline render in the Browser_Suite checks that the mapping is right.

**D26. The listening page is `listen.html` at the repository root, served by the development server only. Its entry lives in `src/ui/listening-page/`, its state in `src/session/`, its strings in `src/copy/`.** The brief asks that the page be kept out of the visitor's path and plainly labelled. A page that is never built is never deployed and cannot be found by a visitor. Vite's build takes only `index.html` unless told otherwise, so nothing needs to change in `vite.config.ts`. Putting the entry inside `src/ui` keeps the module table, the lint rules and the repository layout test unchanged: `ui` may import `session`, `copy` and `config`, and the session creates the output stage. The UI calls `activate` through the session from inside its click handler, which keeps the gesture. Its strings follow the copy rules like any visitor's, because the owner reads them and they may later move into the visit. The seed comes from `crypto.getRandomValues` in the entry, the only place that may choose one, and is shown on the page so that any sound heard can be rendered again. The project owner can open it on a phone with `npm run dev -- --host` on the local network.

**D27. The listening page is one Room_Span.** It never calls `beginRoom`, so every sound on an ear is limited by the last one on that ear, across rows. That is stricter than a visit, where each room starts afresh, and it means the first listen can never leap.

**D28. Run counts are chosen for a suite of about 30 seconds.** The pure core costs well under a millisecond per thousand samples, so CP1, CP2, CP4, CP5 and CP12 can run 100 to 300 times. CP3 and CP6 render shipped sounds and CP8 runs whole rooms. If those three together take more than 30 seconds on the project machine, their counts are halved, and the measured times are added here.

Measured in task 5, before CP8 exists, as the sum of the per-test times that `npm test -- --reporter=verbose` reports. With the counts above (CP3 50 runs per shipped sound, CP6 100 per sound), three runs of `npm test` took 35.0, 37.1 and 37.0 s. CP3 took 19.6, 20.5 and 21.3 s and CP6 32.4, 35.2 and 36.3 s, so these two alone took 52 to 58 s. Their render-bound counts were therefore halved: CP3 to 25 runs per shipped sound and CP6 to 50 runs per sound. CP3's 300 runs over arbitrary buffers stay as they are: they took about 2 s and render a shipped sound in only one case in eight. With the halved counts, three runs of `npm test` took 29.5, 28.7 and 28.5 s. CP3 took 10.2, 11.1 and 8.6 s and CP6 17.6, 15.7 and 16.9 s, 25.3 to 28.7 s together. The slowest single cases are the calibration noise in CP6 (7.6 to 9.4 s) and in CP3 (3.2 to 4.8 s), because it renders 1.5 s of shaped noise at rates up to 192000 Hz. Task 15 measures again with CP8 included and applies this rule again if the three together take more than 30 s. Its measurement and the counts it led to are in D50.

**D29. The manual record is `docs/experiments/audio-output-listening.md`.** The ghost-sounds spec keeps its hook evidence in `docs/experiments/`, and Prettier ignores that directory. The record is written by the project owner, not by an agent, because only a listener can answer the items.

**D30. Commit messages follow `wording.md`.** No "pass", "fail", "score", "test result" or other banned word, as in the earlier specs.

**D31. Files outside the module that change.** `playwright.config.ts` gets a third web server, `vite --port 5175 --strictPort`, used only by `listening-page.spec.ts`. The existing preview servers stay as they are. Nothing under `tools/`, no lint rule and not `package.json` changes, because another session is working there and none of them needs to.

**D32. The new safety-related values in `audioOutputConfig` are guarded against loosening like the steering values.** The bottom of the control, the Keep_Minimum, the rise between repeats, the Output_Fade, the stop fade and the headphone check level each protect the visitor in the same way as the steering's numbers. Their tests break if one is loosened, with a message that loosening needs the owner's approval. Making one stricter is always allowed. The Peak_Bounds are not guarded this way, because a bound that is too high only lowers a room's top, and one that is too low only makes renders get refused; the ceiling protects in both cases. Whether these values belong in the steering is Q3.

The decisions below were settled while carrying out tasks 1 to 5, where the design left a detail open.

**D33. The rounding constants of `preparePlayback` are named constants in that file, not config values.** The rise tolerance of 10⁻⁹ dB (D15), the factor `1 − 2⁻⁴⁰` and the limit of four reductions (D5, step 8) absorb floating-point error and set no level, so they do not tune anything a person would listen for. The engine keeps its own comparison tolerance the same way, in `src/engine/fraction-comparisons.ts`. The grid tolerance of `nextCalibrationSettingDb` (D36) follows the same rule.

**D34. With a limit, the played level is the level the gain gives, but never above the capped level.** Step 9 computes `gainToDecibels(gain / calibrationGain)`. For a sound limited by the anchor cap alone, that comes out at 15 dB plus or minus a rounding error, and can be a hair above the cap. The same can happen when the ceiling lowers a gain by only a few units in the last place. R7.2 requires the played level to be at most the anchor cap and at most the request. So the played level is the lower of that computed value and `min(requestedLevelDb, capRelativeToAnchorDb)`. The two differ by about 10⁻¹⁴ dB at most, well inside the 10⁻⁹ relative of R8.2.

**D35. The last check of step 11 also measures the fades of the rounded played channel and refuses `fadeTooShort` if one is below `fadeMinMs`.** Rounding to 32 bits keeps the shape of a sound at every level that matters. Close to the smallest 32-bit values, below about 10⁻⁴³ of full scale, it does not. A sound whose peak is about ten steps of the smallest value turns into a staircase that starts late, and its fade measures under 20 ms, although the 64-bit buffer measured 25 ms at step 5. `prepare-playback.test.ts` holds such a case, at about −877 dB. Such a sound is far below anything a device can play, and refusing it plays the same silence. Without this check, CP3 would not hold for every buffer, level and gain, as R20.3 asks. An output that rounds to all zeros is not refused, as the design's remark on very low levels says.

**D36. `nextCalibrationSettingDb` limits first, then rounds down to the grid, with a tolerance of 10⁻⁹ steps.** It takes the lowest of the request, the previous setting plus `calibrationRiseMaxDb` and the Calibration_Setting_Top, rounds that down to the grid, then raises it to the bottom of the control if it is lower. Rounding last keeps the result on the grid even if a later config made the rise not a whole number of steps. The tolerance makes a request of −58 − 10⁻¹² count as −58. ±Infinity is handled like any request: +Infinity gives the previous setting plus the rise, −Infinity gives the bottom.

**D37. The real renderers were measured at seeds 1 to 10 at 44100 and 48000 Hz.** All 120 renders met their Peak_Bound. Every one took a single render, except the stairs scrape at seed 2 and 44100 Hz, which took two. The test notes this in a comment and checks only that every attempt count lies between 1 and `renderAttemptsMaxCount`, so a later change to the synthesis does not break it for no safety reason.

**D38. In task 5, CP11 covers the Range_Report only, and CP6 draws its levels from the grid without `roomSearchCapDb`.** `roomSearchCapDb` is written in task 8 in `src/session/`. Before that, CP6 draws the grid levels from `floorDb` up to the highest one at or below the room top, which is the same set of levels that `roomSearchCapDb` of the top allows. Task 8 adds the `roomSearchCapDb` half of CP11 to `audio-output-cp11-range-report.property.test.ts`, and may switch CP6 to it.

**D39. `output-types.ts` holds the types of "Types" and also `StopReason`, `UnsupportedReason` and `OutputState`. The play outcome types go with the shell.** The three added types depend on nothing else and are spelled out in "The output shell". `PlayOutcome` and `PlayRefusal` depend on the refusals of `renderPlayableBuffer`, which that file exports as `RenderRefusal` together with its result type `PlayableBufferResult`. They are written with the shell in task 6, so no file of an earlier task changes then. `OutputState` gives `sampleRateHz: null` for an unsupported state reached without a context, such as `noWebAudio`.

**D40. Small choices in the pure helpers.** `applyOutputFade` writes exact `+0` wherever the fade weight is zero, whatever the input sample, and turns every other `-0` into `+0`. `rangeReport` names the anchor cap when the anchor cap and the ceiling give the same top. `calibrationSettingTopDb` throws a `RangeError` if even the bottom of the control breaks one of its two conditions, because only a broken config can cause that. The unit tests avoid the literal `0.25` where it is not the ceiling, so that the search of task 15 finds it only where the ceiling is meant.

**D41. Tests that go beyond the lists in this design.** `prepare-playback.test.ts` cannot reach `beyondCeiling`, as step 11 says. In its place it checks that the largest gains and peaks (up to 3 × 10³⁸ of full scale and a calibration gain of 10³⁰⁰) do not reach that refusal. CP4 also covers an all-zero buffer (`silentBuffer`) and an invalid previous gain (`invalidCalibrationGain`), and checks that the same requests without their fault are accepted. Arbitrary buffers drawn for a rejected sample rate are built at 44100 Hz, because their length is defined by the rate.

The decisions below were settled while carrying out tasks 6 to 9, where the design left a detail open.

**D42. Details of the shell's states and stops (task 6).** A stop before the first `activate` does nothing, because no context exists and nothing can sound; a stop while unsupported does nothing either, because the context is already closed. Every other stop runs the whole sequence of "Stopping", a stop while already stopped included: it fades again, keeps the first reason in the state, and reports its own reason to every listener, so that the visit flow hears a `deviceChanged` even while the house is stopped for another reason. `deviceChanged` forgets the kept calibration in every such state, and also the calibration in progress, so a keep after it is refused `noRepeatPlayed` and the next repeat starts at the bottom of the control. `pageLeft` turns the pending suspend into a close. The suspend timer is set before the listeners run, and `activate` cancels it, so a suspend cannot land on a context that has been started again. A stop ends the Busy_Interval at the end of the stop fade, the lower of its current end and the audio clock plus `stopFadeMs`. `activate` while running returns at once without calling the backend; while starting it returns the activation in progress; a stop that comes while starting wins over the context becoming running. `keepCalibration` has a third refusal, `notCalibrating`, outside a calibration, and does not need the shell to be running, because it plays nothing. Becoming unsupported forgets every calibration. Every listener is called even if an earlier one throws, and the first error is thrown again afterwards. The backend contract for "no context" is a NaN rate, 0 channels, a clock of 0 and no timestamp pair, with the other calls doing nothing. `create-audio-output.test.ts` runs at 22050 Hz, where the real renderers are quickest (the calibration noise takes about 27 ms there and 64 ms at 48000 Hz).

**D43. The properties of the shell render worst-case buffers (task 7).** The shell renders every sound itself and, under R3.3, offers no way to pass it samples or render functions. The real renderers take about 1 to 26 ms per sound at 48000 Hz, and 27 ms (22050 Hz) to 64 ms (48000 Hz) for the calibration noise, so CP7, CP9 and CP10, with hundreds of runs of up to 40 sounds plus a calibration each, would take minutes. Their files, and CP13's, therefore replace `soundRenderers` with `vi.mock` by the renderers of `tests/properties/worst-case-renderers.ts`: a constant buffer of 60 to 300 ms whose peak is the largest 32-bit value not above the sound's Peak_Bound. For the ceiling these are the loudest buffers a room can be handed, so the properties are at least as strict as with real renders; the real renderers are covered through the shell by `create-audio-output.test.ts` and through the pure core by CP3 and CP6. Two files beyond the design's list hold this: `worst-case-renderers.ts`, which may not import `sound-renderers` because it is loaded while that module is mocked, and `output-shell-harness.ts`, which builds a shell on the fake backend with the manual timer and calibrates it. CP7 checks the rise between played levels, which stand for applied gains to within 10⁻⁹ relative (R8.2), with 10⁻⁷ dB of room on top of the shell's 10⁻⁹ dB. CP10 checks the fade and the reports for every stop after the first `activate`, because a stop before it does nothing (D42). CP10 has a second case of 100 runs that starts calibrated and puts a device change, an `activate` and plays early in the sequence: with random sequences alone, a mutated shell that kept the calibration after a device change was not caught in 300 runs.

**D44. The session helpers and CP8 (task 8).** `roomSearchCapDb(topLevelDb, settings)` takes the starting level, the upward step and the anchor cap from the settings it is given, so the visit flow passes the same settings it gives the search. Its grid tolerance of 10⁻⁹ steps is a named constant in the file (D33): a top a rounding error below a grid level counts as that level. It can therefore return a level up to 5 × 10⁻⁹ dB above the exact top, so the `roomSearchCapDb` half of CP11 checks "at most the top" with that much room. With the shipped Peak_Bounds no room top at a grid setting lies within 0.02 dB of a grid level, so this does not reach the ceiling in practice; CP8 with worst-case buffers confirms it. CP6 keeps drawing its levels with `gridLevelsUpTo`, which gives the same levels apart from that tolerance (D38 allowed either). `judgeHeadphoneCheck` names the four answers `left`, `right`, `bothSides` and `nothingHeard`, and throws a `RangeError` for any other value. The type-level test is `src/session/ear-types-match.test.ts`, checked by `npm run typecheck`. `room-search-cap.test.ts` converts a setting to a gain with its own one-line function, because `src/session` may not import `decibelsToGain` from the synth. CP8 uses the worst-case renderers of D43, whose peaks sit at the Peak_Bound, the hardest case for "no clamp". Its listeners are Psychometric_Listeners from the Plausible_Range (three runs in four) and the five extreme listeners (one in four), with true thresholds from the floor to +15 dB, so some rooms end worse than cap. Each trial waits the engine's gap and the sound's end on both clocks.

**D45. The copy of the output stage (task 9).** The design gives the calibration and headphone check lines; the lines for the stop reasons, the unsupported reasons and the listening page's labels are written here, in short calm sentences. Each unsupported line is one sentence, as R5.5 asks, and names no browser, because `tech.md` allows no third-party trademarks. The stopped lines say how to go on, and the `deviceChanged` line says to match the hiss again (D18). Beyond `roomsShortLine`, `levelLabel` and `clampLine`, `listening-page-copy.ts` has functions for every other number the page shows (R18.1, R19.7): `clampLogLine`, `playRefusedLine`, `sampleRateLine`, `seedLine`, `calibrationSettingLine` and `floorRmsLine`. `levelLabel` gives one decimal with a minus sign (U+2212) or a plus sign, writes a value that rounds to zero as "0.0 dB", and throws for a value that is not finite. The calibration setting is labelled as a position of the control, not as a Level. `clampLine(null)` gives "Played as asked." `roomsShortLine(0, total)` says that every room can get as loud as the house would like, and the function throws a `RangeError` unless 0 ≤ count ≤ total, total ≥ 1 and both are whole numbers. `src/copy` may import only `src/config`, so the copy declares its own `ClampLimitName` and keys its objects by the output stage's reason names as plain strings; `output-copy.test.ts` checks those keys against literal lists. The labels of the calibration control (Start calibrating, Quieter, Louder, Keep this setting) are in `calibration-copy.ts`, because the visit will use them too. `output-copy.test.ts` matches "turn up", "turn the volume up" and "raise" in any letter case, and checks that the two lines exempt from that rule, the kept line and `roomsShortLine` with a count of 1 or more, say "do not turn the volume up".

The decisions below were settled while carrying out tasks 10 to 15, where the design left a detail open.

**D46. The Web Audio backend and the output graph (task 10).** The stop fade is the only automation a stop gain ever carries. After a stop, the first new sound goes to a new stop gain at 1, connected to the destination, and the faded one is disconnected once its last source has ended. The design's "the stop gain is set back to 1 at the current time" would need the fade's automation cancelled first, and Web Audio's `cancelScheduledValues` cancels an automation that is still running and puts back the value from before it at once; `cancelAndHoldAtTime`, which avoids that, is missing from one of the supported browsers. A new gain also removes any need for a `setValueAtTime` at the curve's start time, which some browsers refuse as an overlap. There is still one stop gain between the sources and the destination at any moment, because the graph refuses a sound that would start before the stop fade has ended (the shell never asks for one, as its Busy_Interval ends at the fade's end and every start lies `scheduleLeadMs` ahead). A second stop while a fade is under way, or after it, leaves that fade as it is. The 64 points of the stop curve are a named constant in `output-graph.ts`, by the rule of D33: they shape the fall and set neither its length nor a level. The graph sets the destination to two channels only where its `maxChannelCount` allows, so that a mono device reaches the shell's `monoOutput` check instead of an exception. The graph copies each channel before `copyToChannel`, so nothing that holds the shell's arrays can change what plays. The backend creates the context and, if the new context is not yet running, calls `resume()` on it inside the same call. `whenRunning` resolves on the context's `running` state and rejects if `resume()` rejects or the context closes. An `interrupted` event is fired for any `statechange` to a state that is neither `running` nor the state the backend last asked for. `timestampPair` uses `getOutputTimestamp()` only when it gives two finite times and a page time above zero, which some browsers report before any output. The page listeners are registered when the backend is created and stay for the life of the page; before the first `activate` the shell ignores their events (D42). The search of task 10 is over the `.ts` files of `src/`; the one comment outside the two files that named `AudioContext`, in `audio-backend.ts`, now says "Web Audio".

**D47. The calibration controller and the listening page session (task 11).** The controller asks for each next repeat `calibrationRepeatGapMs − scheduleLeadMs` after the end of the one before, on the audio clock as the shell's timestamp pair relates it to the timer, so that the gap from the end of one repeat to the start of the next is exactly `calibrationRepeatGapMs` (R16.11). Where no timestamp pair exists it waits the repeat's length plus the gap from when it asked. A repeat refused `busy` is asked for again after the gap; any other refusal ends the loop and is shown. "Louder" moves the target one step up from the higher of the target and the setting last played; "Quieter" moves it one step down from the setting last played, so pressing Quieter never plays louder than what the visitor last heard. The target stays within the Control_Range. Any stop ends the loop, and it starts again only when the visitor presses "Start calibrating", which begins a new calibration at the bottom of the control: "Start sound again" alone plays nothing, so manual items 8 and 9 hold literally, and a visitor who changed the system volume during a stop starts quiet again. The volume line of R16.6 stays shown until a repeat plays at or above the Keep_Minimum. A device change forgets the controller's kept calibration as it does the shell's. The session takes either a window, from which it builds the Web Audio backend, or, for tests, a backend. Its snapshot holds the output state and its stopped or unsupported line, whether the last Start was refused for want of a gesture, the controller's snapshot, the Range_Report, the rooms line over the five ghost rooms, the headphone check's last play and answer line, the six rows and the Clamp_Log. The rows exist only while the shell has a kept calibration, and every keep starts them afresh at the lower of `startingLevelDb` and the rounded top; a new calibration also clears the headphone check. The calibration noise row plays the calibration noise in one ear at the row's level with the Purpose `listening`. The session re-exports the types the page needs (`Ear`, `HeadphoneCheckAnswer`, `CalibrationSnapshot`), because `src/ui` may not import the output stage.

**D48. The listening page (task 12).** `listen.html` holds, before any script runs, an empty header and the stop bar with the stop button, the line for a stop and the "Start sound again" button. It holds no text of its own, so that every string comes from `src/copy` (R18.1): the entry's first act is to give the stop button its label and its handler, before it creates the Start button, the only control that can lead to a sound. Until the script has run, nothing on the page can make a sound, so the stop control is in place and labelled before the first sound can start (R14.8). The stop bar is `position: sticky` at the top of the window rather than `fixed`, so that the header stays the first thing on the page (R19.2) and the stop bar still stays at the top of the window at every scroll position. Every element is made once and each snapshot only changes text, `hidden` and `disabled`, so that a button never moves or is replaced under a press. The Start button is shown only before the first start; after a stop, "Start sound again" in the stop bar starts sound again. The calibration section is shown once sound has started, and its buttons are disabled while the shell is not running; the headphone check and the six rows are shown only while a calibration is kept. The level labels, outcomes and lines are built by the functions of `src/copy`; the Sound_Ids and the Range_Report's `setBy` are shown as their code names, as `clampLine` does for the limits. The Range_Report on the page shows each room's top with its `setBy` and the floor RMS; its distance below the anchor cap is not shown on a line of its own, because it is the anchor cap minus the top shown. A Start refused for want of a gesture is shown with `playRefusedLine("noGesture")`. The entry uses the system timer of `src/config` and draws its seed with `crypto.getRandomValues`.

**D49. The Browser_Suite (task 13).** `dev-server.ts` exports the port, 5175, and the page's path, `/listen.html`; `playwright.config.ts` starts `vite --port 5175 --strictPort` as a third web server and leaves the two preview servers as they were. The suite runs in both Playwright projects, like the placeholder tests. The headless browser is started with `--mute-audio`: every check reads what the page hands to Web Audio or what an offline render produces, which muting does not change, and nothing is heard from the machine that runs the suite. The probes wrap the `AudioContext` constructor (counting contexts and recording whether a user activation was active at each construction), `AudioBuffer.prototype.copyToChannel` (keeping a copy of every channel), the buffer source's `start` and `stop`, and `AudioParam.prototype.setValueCurveAtTime`; the page summarises each buffer before it is returned to the test, so that no samples cross into Node. The other channel of every one-ear sound must hold `+0` in every sample, as in CP2. The first buffer's RMS is compared with `referenceRmsFraction × decibelsToGain(calibrationSettingMinDb)` within 0.01 dB, the ghost-sounds level tolerance. For the offline render the test loads `output-graph.ts` from the development server with a module script tag and renders at 48000 Hz: a 0.2-amplitude tone sent to one channel must come out on that channel sample for sample and the other must be exactly 0; for the stop, `fadeToSilence` is called at an `OfflineAudioContext.suspend` point, the output must equal the input before it, fall without rising during the fade, and be exactly 0 on both channels from the first frame at or after the fade's end. The stop and hidden-page tests check, on the live page, one stop curve from 1 to exactly 0 over `stopFadeMs`, every source stopped at the fade's end, the context suspended, no new source three seconds later although the calibration loop would have played one, nothing new after "Start sound again" alone, and a first repeat at the bottom of the control after "Start calibrating" (D47). A hidden page is simulated by overriding `document.visibilityState` and `document.hidden` and dispatching `visibilitychange`. The test of R21.5 searches every file of `dist/` for `listen.html`, `createFakeAudioBackend`, `createListeningPageSession`, `renderListeningPage` and every string of `listeningPageCopy` of 12 characters or more; the shorter labels, such as "Start" and "Played", are common words that a later build of the visit may hold for its own reasons. The test of R21.2 also checks that the stop control is still at the top of the window when the page is scrolled to the bottom (R14.8). A run with `channelIndex` swapped made the tests of R21.2 and R21.3 break, as they should. `tests/e2e/README.md`, which said the directory only tests the built page, now describes the suite; it is not in the design's list of changed files.

**D50. The final run counts (task 15).** Three runs of `npm test -- --reporter=verbose` with CP8 included, summing the per-test times as in D28, gave CP3 9.9, 9.6 and 23.6 s, CP6 13.9, 19.1 and 32.5 s, and CP8 6.8, 14.8 and 14.0 s: 30.6, 43.5 and 70.1 s for the three together, above 30 s in every run. The machine was also running other work: its load average rose from about 7 to about 24 on 8 cores during these runs. By the rule of D28 the three render-bound counts were halved: CP3 from 25 to 12 runs per shipped sound (its 300 runs over arbitrary buffers stay), CP6 from 50 to 25 runs per sound, and CP8 from 100 to 50 runs. With those counts three more runs took CP3 6.1, 8.7 and 8.8 s, CP6 7.6, 12.4 and 13.7 s, and CP8 3.6, 6.6 and 5.6 s: 17.3, 27.8 and 28.1 s together, and 38.1, 48.4 and 51.1 s for the whole of `npm test`. No property found a counterexample in any run. The search for the literal `0.25` outside `src/config` found it only in tests of the engine and the synth, where it is a random draw, a share of no-sound trials or a sample value, never the ceiling; `1500` appears outside `src/config` only as a gap between trials in two engine tests, never as a fade or a sound's length; and no `20` stands for a fade or a duration outside `src/config`.

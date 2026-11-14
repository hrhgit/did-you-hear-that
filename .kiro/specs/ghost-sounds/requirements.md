# Requirements: ghost sounds

## Introduction

This spec builds the six sounds of the house as pure functions in `src/audio/synth`: one ghost sound per room, each confined to a narrow band around the room's pitch, and the calibration noise. Each function takes the sample rate and a seeded random source and returns mono samples at one reference level. The same code runs in Node, so every sound is rendered and measured offline.

The spec also delivers the measurement code that checks the sound rules, the `npm run render:sounds` tool that writes `docs/reports/sounds.md`, property tests over seeds and sample rates, and a Kiro hook that runs the render check when synthesis code is saved. It replaces the stub `tools/run-sound-render.ts` left by the project-scaffold spec (scaffold design D15).

Nothing in this spec plays a sound. A temporary player would be a second output path, which audio-safety rule 1 and the lint rules forbid. The listening page arrives with the audio-output spec. This spec is checked by measurement only.

The input is `docs/briefs/02-ghost-sounds.md`, the steering files in `.kiro/steering/` (above all `audio-safety.md` and its Initial values table), `docs/architecture.md`, and the existing code: `src/config`, the lint rules in `tools/lint/`, and `tools/run-sound-render.ts`. Open points are settled in the Decisions section of `design.md`, referred to here as D1, D2 and so on.

Out of scope: the digits and noise for the last door; playback level, panning, the absolute digital ceiling and the cap, which belong to the audio-output spec; any way to listen.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Synth_Module**: the code under `src/audio/synth/`, including its `measure/` subdirectory.
- **Sound_Id**: one of `cellar`, `corridor`, `nursery`, `stairs`, `attic` and `calibration`.
- **Ghost_Sound**: the sound of one room. Cellar (500 Hz, a dull knock), corridor (1 kHz, a hummed note), nursery (2 kHz, a few music box notes), stairs (4 kHz, a dry scrape), attic (8 kHz, a thin whine).
- **Calibration_Noise**: the broadband steady hiss, shaped like hands rubbing, that the visitor matches during calibration.
- **Sound**: a Ghost_Sound or the Calibration_Noise. There are six.
- **Render_Function**: the function for one Sound. It takes a Sample_Rate and a Random_Source and returns a Buffer.
- **Sound_Renderers**: the frozen record in `src/audio/synth/sound-renderers.ts` that maps every Sound_Id to its Render_Function.
- **Buffer**: the `Float32Array` of mono samples a Render_Function returns. Full scale is 1.
- **Sample_Rate**: samples per second, passed in by the caller. In the browser it comes from the `AudioContext`.
- **Report_Sample_Rates**: 44100 Hz and 48000 Hz.
- **Random_Source**: a `RandomSource` from `src/config/seeded-random.ts`.
- **Centre_Frequency**: the room pitch of a Ghost_Sound in hertz.
- **Band**: for a Ghost_Sound, the frequencies from `centre × 2^(−w/2)` to `centre × 2^(w/2)` inclusive, where `w` is `bandWidthOctaveFraction` (one third) (D2).
- **In_Band_Energy** and **Out_Of_Band_Energy**: the energy of a Buffer at frequencies inside and outside the Band, measured as in D3.
- **Out_Of_Band_Ratio**: `10 × log10(Out_Of_Band_Energy / In_Band_Energy)` in decibels.
- **Onset**: the first sample of a Buffer that is not exactly zero.
- **Fade_In_Length**: the largest length L such that, from the Onset on, the running peak of the Buffer never exceeds its overall peak multiplied by a raised-cosine ramp of length L that starts at the Onset (D4).
- **Fade_Out_Length**: the Fade_In_Length of the Buffer reversed in time.
- **Event**: one knock, one note, one grain, or the single body of a sustained sound, inside a Sound.
- **Event_Attack**: the time an Event's own envelope takes to rise from zero to its peak.
- **Duration**: the number of samples in a Buffer divided by the Sample_Rate.
- **RMS_Level**: the root-mean-square of every sample of a Buffer.
- **Reference_RMS**: the config field `referenceRmsFraction`, the RMS_Level every Sound must have.
- **Level_Deviation**: `20 × log10(RMS_Level / Reference_RMS)` in decibels.
- **Peak**: the largest absolute sample value of a Buffer.
- **Crest_Factor**: `20 × log10(Peak / RMS_Level)` in decibels.
- **Calibration_Shape**: the target band levels of the Calibration_Noise in the five room Bands, in decibels relative to its loudest room Band (D8).
- **Sound_Rules**: the band rule (R6), the fade rule (R7), the duration rule (R8), the level rule (R9) and the calibration shape rule (R10.3).
- **Sound_Measurement**: the measured values of one Buffer: In_Band_Energy, Out_Of_Band_Ratio, Fade_In_Length, Fade_Out_Length, Duration, RMS_Level, Level_Deviation, Peak, Crest_Factor and, for the Calibration_Noise, its room Band levels.
- **Rule_Check**: the function `checkSound` in `src/audio/synth/measure/`, which turns a Sound_Measurement into the list of Sound_Rules it breaks.
- **Audio_Safety_Config**: the frozen object `audioSafetyConfig` in `src/config/audio-safety-config.ts`.
- **Sound_Rules_Config**: the frozen object `soundRulesConfig` in `src/config/sound-rules-config.ts`.
- **Ghost_Sound_Config**: the frozen object `ghostSoundConfig` in `src/config/ghost-sound-config.ts`, which holds each Sound's parameters.
- **Render_Tool**: `npm run render:sounds`, which runs `tools/render-sounds.ts` and its core `tools/run-sound-render.ts`.
- **Sound_Report**: `docs/reports/sounds.md`.
- **Report_Seeds**: the fixed seeds 1 to 10 that the Render_Tool renders each Sound with (D16).
- **Changed_File_Mode**: the Render_Tool run with `--changed <path>`, which checks only the Sounds that a changed file can affect.
- **Hook_Mode**: the Render_Tool run with `--hook`, which reads a Kiro hook event from standard input and then behaves as Changed_File_Mode.
- **Render_Check_Hook**: the hook file `.kiro/hooks/render-check-on-synth-save.json`.
- **Hook_Witness_Log**: the file `did-you-hear-that-hook-runs.log` in the operating system's temporary directory, to which Hook_Mode appends one line per run (D18).
- **Hook_Catch_Record**: `docs/experiments/hook-catches.md`.
- **Property_Suite**: the property tests for the sounds under `tests/properties/`.

## Requirements

### Requirement 1: Steering values in config

**User story:** As the project owner, I want the shortest fade and the longest ghost sound in `src/config` with exactly the steering values, so that every check reads one source and nobody loosens them by accident.

#### Acceptance criteria

1. THE Audio_Safety_Config SHALL hold `fadeMinMs` with the value 20 and `ghostSoundMaxDurationMs` with the value 1500, each with a comment quoting its row of the Initial values table in `.kiro/steering/audio-safety.md`.
2. THE Audio_Safety_Config SHALL be deeply frozen, and every field name SHALL end in one of the units `Db`, `Ms`, `Hz`, `Fraction` or `Count`.
3. THE Audio_Safety_Config SHALL leave the absolute digital ceiling to the audio-output spec, which adds it to the same file (D1).
4. THE Synth_Module, the Rule_Check, the Render_Tool and the Property_Suite SHALL read the shortest fade and the longest ghost sound from the Audio_Safety_Config and from nowhere else.
5. IF a later change sets `fadeMinMs` below 20 or `ghostSoundMaxDurationMs` above 1500, THEN the config unit test SHALL break, with a message that names `audio-safety.md` and says that loosening needs the project owner's approval.

### Requirement 2: Sound rule values and sound parameters in config

**User story:** As the person who tunes the sounds by ear later, I want every number that shapes a sound or decides a rule to sit in config with its invariants tested, so that a tuning change that cannot work is caught before anything renders.

#### Acceptance criteria

1. THE Sound_Rules_Config SHALL hold the band width as a fraction of an octave (one third), the smallest distance of Out_Of_Band_Energy below In_Band_Energy (30 dB), the Reference_RMS, the tolerance for Level_Deviation, the widest allowed spectrum bin, the lowest supported Sample_Rate, the margin between planned frequencies and the band edges, the Calibration_Shape and its tolerance, each with a comment naming its source in the brief or its decision in `design.md`.
2. THE Ghost_Sound_Config SHALL hold, for each Sound, its Duration, its outer fade length and the parameters of its Events listed in the Sound parameters section of `design.md`.
3. THE config unit tests SHALL check that the five Centre_Frequencies, in the order cellar, corridor, nursery, stairs, attic, equal `hearingMethodConfig.roomFrequenciesHz.full`.
4. THE config unit tests SHALL check that every Sound's configured Duration is at most `ghostSoundMaxDurationMs`, every outer fade length is at least `fadeMinMs`, and every Event_Attack the parameters allow is at least `fadeMinMs` (D5).
5. THE config unit tests SHALL check that every frequency a Ghost_Sound's parameters allow, including its variation and modulation, lies inside its Band with the margin given in the Sound parameters section of `design.md`.
6. THE config unit tests SHALL check that `ghostSoundMaxDurationMs` is below `hearingMethodConfig.responseWindowMs` (D24).
7. THE Sound_Rules_Config and the Ghost_Sound_Config SHALL be deeply frozen, with field names ending in their unit.

### Requirement 3: Synthesis boundary

**User story:** As the author of the output stage, I want the sounds as pure functions with injected randomness, so that they can be measured in Node and every failing render can be replayed.

#### Acceptance criteria

1. THE Synth_Module SHALL import only from `src/config/`.
2. THE Synth_Module SHALL not read the clock, schedule callbacks, call `Math.random`, or use any Web Audio, media or DOM API.
3. THE Synth_Module SHALL run under Node.js in Vitest without a browser.
4. THE Synth_Module SHALL take every random number from the Random_Source passed to the Render_Function.
5. THE Synth_Module SHALL keep no state between calls that changes what a later call returns.
6. THE production page SHALL not import the Synth_Module through this spec. Only the audio-output spec connects it to the page.

### Requirement 4: Render functions

**User story:** As the author of the output stage, I want one call per sound with the same shape, so that every sound can be played the same way.

#### Acceptance criteria

1. THE Sound_Renderers SHALL map each of the six Sound_Ids to a Render_Function with the signature `(sampleRate: number, random: RandomSource) => Float32Array`.
2. WHEN a Render_Function is called, THE Render_Function SHALL return a new Buffer of mono samples that no other call shares.
3. IF the Sample_Rate is not a finite number, or is below `sampleRateMinHz` in the Sound_Rules_Config, THEN THE Render_Function SHALL throw a `RangeError` that names the Sample_Rate and the lowest supported rate (D12).
4. THE Render_Function SHALL derive every sample count from the Sample_Rate it is given and SHALL not assume 44100 Hz or 48000 Hz.
5. WHEN two calls of the same Render_Function are made with equal Sample_Rates and with Random_Sources created from the same seed, THE Render_Function SHALL return Buffers that are equal sample for sample.
6. WHEN two calls of the same Render_Function are made with equal Sample_Rates and with Random_Sources created from different seeds, THE Render_Function SHALL return Buffers that differ in at least one sample.

### Requirement 5: Character of each sound

**User story:** As the visitor, I want each room to have its own recognisable kind of sound that never becomes the same recording, so that the house feels alive and I listen for the thing, not for a pattern.

#### Acceptance criteria

1. THE cellar Render_Function SHALL produce a fixed number of knocks, each a tone burst inside the Band with its own smooth envelope.
2. THE corridor Render_Function SHALL produce one sustained tone with slow, small changes of pitch and level.
3. THE nursery Render_Function SHALL produce a fixed number of music box notes drawn from a configured set of pitches inside the Band, with no note repeated straight after itself.
4. THE stairs Render_Function SHALL produce noise confined to the middle of the Band, shaped by a configured pattern of overlapping grains.
5. THE attic Render_Function SHALL produce one sustained thin tone with a slow, small change of pitch.
6. THE Calibration_Noise Render_Function SHALL produce a steady noise with no change of level apart from its fades, whose spectrum follows the Calibration_Shape.
7. THE Render_Function SHALL vary, from one seed to another, only the quantities that the Ghost_Sound_Config lists as varying for that Sound, such as Event timing, the order of notes, small changes of pitch and level, phases and the noise itself, each within its configured range (D10).
8. THE Render_Function SHALL keep the Duration and the number of Events of a Sound the same for every seed, except the number of grains of the stairs scrape, which follows the grain spacings drawn (D10).

### Requirement 6: Band rule

**User story:** As the project owner, I want each ghost sound to stay inside the room's band, so that a room tests one pitch and nothing else.

#### Acceptance criteria

1. THE Ghost_Sound Render_Functions SHALL return, for every seed and every supported Sample_Rate, a Buffer whose Out_Of_Band_Ratio is at most minus `outOfBandBelowInBandMinDb` (−30 dB).
2. IF a Buffer has no In_Band_Energy, THEN THE Rule_Check SHALL report the band rule as broken.
3. THE band rule SHALL not apply to the Calibration_Noise, which has no Centre_Frequency (D8).

### Requirement 7: Fade rule

**User story:** As the visitor, I want every sound to arrive and leave gently, so that nothing in the house ever starts at full level.

#### Acceptance criteria

1. THE Render_Functions SHALL return Buffers whose first and last samples are exactly zero.
2. THE Render_Functions SHALL return, for every seed and every supported Sample_Rate, Buffers whose Fade_In_Length and Fade_Out_Length are each at least `fadeMinMs`.
3. THE Render_Functions SHALL give every Event an Event_Attack of at least `fadeMinMs` (D5).
4. IF a Buffer has no sample other than zero, THEN THE Rule_Check SHALL report the fade rule and the level rule as broken.

### Requirement 8: Duration rule

**User story:** As the visitor, I want every sound to be short, so that no sound in the house goes on and on.

#### Acceptance criteria

1. THE Render_Functions SHALL return Buffers whose Duration is at most `ghostSoundMaxDurationMs`, for every seed and every supported Sample_Rate. This applies to the Calibration_Noise too (D8).
2. THE Render_Functions SHALL return Buffers whose length is the configured Duration times the Sample_Rate, rounded down to a whole number of samples (D9).

### Requirement 9: Level rule

**User story:** As the author of the output stage, I want every sound at the same reference level, so that one calibration gain and one cap treat them alike.

#### Acceptance criteria

1. THE Render_Functions SHALL return Buffers whose Level_Deviation is within `levelToleranceDb` of zero, for every seed and every supported Sample_Rate (D7).
2. THE Render_Functions SHALL return Buffers whose Peak is below full scale (1).
3. THE Sound_Measurement SHALL include the Peak and the Crest_Factor, and THE Rule_Check SHALL set no limit on the Crest_Factor (D7).

### Requirement 10: Calibration noise

**User story:** As the visitor, I want a calibration noise that sounds like my own hands rubbing and keeps one level, so that matching it is possible.

#### Acceptance criteria

1. THE Calibration_Noise SHALL meet the fade, duration and level rules of R7, R8 and R9.
2. THE Calibration_Noise SHALL have the same Reference_RMS as every Ghost_Sound, so that a ghost sound at 0 dB on the level scale has the RMS of the calibration noise at the visitor's chosen gain (D8).
3. THE Calibration_Noise Render_Function SHALL return Buffers whose level in each of the five room Bands, relative to the loudest of those Bands, is within `calibrationShapeToleranceDb` of the Calibration_Shape.
4. THE Sound_Report and `design.md` SHALL state that the Calibration_Shape is a starting guess with no measured source, to be tuned by ear.

### Requirement 11: Measurement

**User story:** As the project owner, I want the measurement that judges the sounds to be pure, shared and checked against signals with known answers, so that a sound is not judged by a broken ruler.

#### Acceptance criteria

1. THE Synth_Module SHALL provide pure functions in `src/audio/synth/measure/` that compute a Sound_Measurement from a Buffer, a Sample_Rate and, for a Ghost_Sound, its Centre_Frequency.
2. THE Rule_Check SHALL return the list of Sound_Rules a Sound_Measurement breaks, each with the measured value and the limit, and an empty list when none is broken.
3. THE measurement functions SHALL not import the synthesis helpers that shape fades or envelopes. They may share only the FFT and the band edge function (D13).
4. THE measurement SHALL compute energy from a zero-padded FFT whose bin width is at most `spectrumBinWidthMaxHz`, and SHALL count a bin as inside the Band when its centre frequency is inside the Band (D3).
5. THE FFT SHALL agree with a direct discrete Fourier transform to within 10⁻⁹ of the signal's energy on test signals, and the total energy it reports SHALL equal the sum of squared samples to within the same tolerance.
6. WHEN a Buffer is a constant signal with a raised-cosine fade of length L at each end, THE measurement SHALL report a Fade_In_Length and a Fade_Out_Length within one sample of L.
7. WHEN a Buffer jumps to its Peak in one sample after a run of exact zeros, THE measurement SHALL report a Fade_In_Length of at most one sample.

### Requirement 12: The render tool, full run

**User story:** As the project owner, I want one command that renders every sound at both common rates and writes a report, so that the state of every sound is visible and a broken one stops the run.

#### Acceptance criteria

1. WHEN the Render_Tool is run without arguments, THE Render_Tool SHALL render every Sound at each Report_Sample_Rate with each Report_Seed and measure every Buffer.
2. WHEN the Render_Tool is run without arguments, THE Render_Tool SHALL write the Sound_Report with one row per Sound and Report_Sample_Rate giving the worst value across the Report_Seeds, and the seed that gave it, for: In_Band_Energy as a share of all energy, Out_Of_Band_Ratio, Fade_In_Length, Fade_Out_Length, Duration, Level_Deviation, Peak and Crest_Factor, and for the Calibration_Noise the largest distance from the Calibration_Shape.
3. THE Sound_Report SHALL state each rule and its limit, say for each row whether every rule is met or name the rules broken, and contain no date or other content that changes between runs on the same code.
4. IF any Buffer breaks a Sound_Rule, THEN THE Render_Tool SHALL still write the Sound_Report, print one line per broken rule naming the Sound, the Sample_Rate, the seed, the rule, the measured value and the limit, and exit with code 1.
5. IF every Buffer meets every Sound_Rule, THEN THE Render_Tool SHALL print one summary line per Sound and exit with code 0.
6. IF a Render_Function throws, THEN THE Render_Tool SHALL report the Sound, the Sample_Rate, the seed and the error message, and exit with code 1.
7. THE Sound_Report and the Render_Tool's output SHALL not contain any term listed in `src/config/banned-terms.ts` (D22).

### Requirement 13: The render tool, changed-file and hook runs

**User story:** As the agent changing a sound, I want the check for only the sound I touched, with failures handed straight back to me, so that a bad change is caught on save.

#### Acceptance criteria

1. WHEN the Render_Tool is run with `--changed <path>`, THE Render_Tool SHALL check only the Sounds that the path can affect, at each Report_Sample_Rate with each Report_Seed, and SHALL not write the Sound_Report.
2. WHEN the changed path is a file under `src/audio/synth/` whose name, without `.test`, starts with a Sound_Id followed by `-`, THE Render_Tool SHALL check that Sound only (D17).
3. WHEN the changed path is any other file under `src/audio/synth/`, or one of `src/config/audio-safety-config.ts`, `src/config/sound-rules-config.ts`, `src/config/ghost-sound-config.ts` and `src/config/sound-id.ts`, THE Render_Tool SHALL check every Sound (D17).
4. WHEN the changed path is outside those files, THE Render_Tool SHALL check nothing, say so in one line and exit with code 0.
5. WHEN the Render_Tool is run with `--hook`, THE Render_Tool SHALL read standard input as JSON, collect every string value in it that contains `src/audio/synth/` or one of the config paths of R13.3, and treat each as a changed path, accepting absolute and relative paths (D18).
6. IF standard input in Hook_Mode is empty, is a terminal, is not valid JSON, or holds no matching path, THEN THE Render_Tool SHALL check every Sound and say why in its output.
7. WHEN Hook_Mode finds no broken rule, THE Render_Tool SHALL write one summary line to standard output and exit with code 0.
8. WHEN Hook_Mode finds a broken rule or a Render_Function throws, THE Render_Tool SHALL write each finding to standard error and exit with code 1, so that Kiro passes the findings to the agent.
9. WHEN the Render_Tool runs in Hook_Mode, THE Render_Tool SHALL append one line to the Hook_Witness_Log with the time, the raw standard input (cut to 4000 characters), the changed paths found, the Sounds checked and the exit code, and SHALL print the log's path.
10. THE Render_Tool in Changed_File_Mode and Hook_Mode SHALL write no file inside the repository.

### Requirement 14: The hook

**User story:** As the project owner, I want saving a synthesis file to run the render check by itself, so that the agent cannot forget the check.

#### Acceptance criteria

1. THE Render_Check_Hook SHALL be a standalone hook file in the current Kiro format: a JSON document with `"version": "v1"` and one hook in its `hooks` array (D18). WHERE the PostToolUse fallback of D20 is taken, the array SHALL hold that second hook as well.
2. THE Render_Check_Hook SHALL use the trigger `PostFileSave`, a matcher that matches every `.ts` file under `src/audio/synth/` and the four config files of R13.3 whether the path is absolute or relative, and a `command` action that runs `npm run --silent render:sounds -- --hook`.
3. THE Render_Check_Hook SHALL set a timeout of 120 seconds and SHALL have no confirmation step.
4. THE Render_Check_Hook's matcher SHALL use only regular expression features shared by JavaScript and by the Rust `regex` crate, so that a JavaScript test of the matcher predicts how Kiro will apply it (D18).
5. A repository test SHALL check the Render_Check_Hook's fields and SHALL check its matcher against paths that must match and paths that must not.

### Requirement 15: Showing the hook fire

**User story:** As the project owner, I want a recorded case of the hook stopping a bad change, so that the claim that the hook works rests on evidence.

#### Acceptance criteria

1. THE hook demonstration SHALL run in a Kiro session started after the Render_Check_Hook was saved, because hooks load when a session starts (D19).
2. THE hook demonstration SHALL make one deliberate change that breaks a Sound_Rule in a file under `src/audio/synth/`, using the agent's file-writing tool and not a shell command (D19).
3. WHEN the Hook_Witness_Log gains a line for the deliberate change, THE Hook_Catch_Record SHALL note the date, the Kiro surface and version, the exact command line or IDE action, the change as a diff, the witness line, and the findings the agent received.
4. IF the Hook_Witness_Log gains no line for the deliberate change in a headless CLI session, THEN THE Hook_Catch_Record SHALL note that the hook was not seen to fire there, with the items listed in the design section "The hook in a headless CLI session", and the demonstration SHALL be repeated in the Kiro IDE and recorded in the same way.
5. THE deliberate change SHALL be reverted after the demonstration and SHALL never be committed.
6. THE Hook_Catch_Record SHALL not claim that the hook fired on any surface where the Hook_Witness_Log shows no line for the change.

### Requirement 16: Property tests

**User story:** As the project owner, I want the sound rules checked over many seeds and sample rates, so that a rare variation that breaks a rule is found before a visitor hears it.

#### Acceptance criteria

1. THE Property_Suite SHALL check, for any seed and each Report_Sample_Rate, that every Sound meets every Sound_Rule that applies to it.
2. THE Property_Suite SHALL check the same for other supported Sample_Rates, including 22050, 32000, 88200, 96000 and 192000 Hz and integers drawn from 22050 to 192000 Hz.
3. THE Property_Suite SHALL check that Sample_Rates below `sampleRateMinHz`, and values that are not finite, are rejected with a `RangeError` by every Render_Function.
4. THE Property_Suite SHALL check R4.5 and R4.6 for any seed or pair of seeds.
5. THE Property_Suite SHALL run under Node in `npm test` with a new random fast-check seed on every run.
6. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression test with its seed and Sample_Rate, and the fix SHALL go in a separate commit.

### Requirement 17: No way to listen in this spec

**User story:** As the visitor-to-be, I want the first sound anyone hears from this code to pass through the level cap, so that tuning by ear starts safely.

#### Acceptance criteria

1. THE spec SHALL add no code that plays sound, no page, no dev page and no player.
2. THE spec SHALL write no audio file to the repository, to `dist/` or to `docs/`.
3. THE lint rules SHALL stay as they are, so that sound-producing APIs remain confined to `src/audio/output`.

### Requirement 18: Documentation

**User story:** As someone reading the repository, I want the READMEs to say where the sounds, the measurement, the report and the hook live, so that I can find them.

#### Acceptance criteria

1. THE README files of `src/audio/synth/`, `tools/` and `docs/` SHALL describe the sounds and the measurement, the render tool's three modes, the Sound_Report and the Hook_Catch_Record.
2. THE documentation added by this spec SHALL follow `.kiro/steering/wording.md`.

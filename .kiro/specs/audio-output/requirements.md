# Requirements: audio output

## Introduction

This spec builds the single place where sound leaves the product, `src/audio/output`, and makes it the place where the rules of `.kiro/steering/audio-safety.md` are enforced. It covers the level arithmetic, the cap, the channel routing, the fades, the stop control, the page lifecycle, calibration, the headphone check, and a listening page for development, which is how a person first hears the ghost sounds.

The level arithmetic is a pure function from a request to the two channel buffers that will be played. It runs under Node, so the safety properties are proved there by property tests. Web Audio only plays the buffers that function returns. What only a browser or only a person with headphones can show is listed separately, and the person's part is a short checklist on the listening page.

The input is `docs/briefs/03-audio-output.md`, including the project owner's section "Findings from the ghost-sounds spec to handle here"; the steering files in `.kiro/steering/`, above all `audio-safety.md` and its Initial values table; `docs/architecture.md`; the ghost-sounds spec in `.kiro/specs/ghost-sounds/`; and the code in `src/config`, `src/audio/synth` and `src/engine`. Open points are settled in the Decisions section of `design.md`, referred to here as D1, D2 and so on. Points that would need a looser safety value are not settled. They are listed as questions for the project owner (Q1, Q2 and so on) in the same document.

Where a rule of `audio-safety.md` and a wish from the brief or the product conflict, the rule wins, and `design.md` says where that happened.

Out of scope: deciding what to play and when, the order of the visit and the look of the calibration screen (the visit-flow and house-interface specs); the digits and noise of the last door; storing anything in local storage.

Acceptance criteria use EARS notation: ubiquitous (`THE <system> SHALL`), event-driven (`WHEN`), state-driven (`WHILE`), unwanted behaviour (`IF ... THEN`) and optional feature (`WHERE`).

## Glossary

- **Output_Stage**: the code under `src/audio/output/`.
- **Playback_Preparation**: the pure function `preparePlayback` in the Output_Stage. It turns a Playback_Request into a Prepared_Playback.
- **Playback_Request**: a mono Buffer, its Sample_Rate, its Sound_Id, an Ear_Choice, a Requested_Level, a Calibration_Gain and, when the Rise_Limit applies, the Applied_Gain of the previous sound on each Ear.
- **Prepared_Playback**: either a refusal with a reason, or a left channel, a right channel, the Played_Level, the Applied_Gain and the Clamp_Limit that set the Played_Level, if any.
- **Output_Shell**: the object `createAudioOutput` returns. It holds the state that Playback_Preparation does not: whether sound may play, the Calibration_Gain, the previous Applied_Gain on each Ear, the Busy_Interval and the Clamp_Log. It schedules sound only through an Audio_Backend.
- **Audio_Backend**: the interface through which the Output_Shell creates and resumes the Audio_Context, schedules two channel buffers, fades all sound to silence and reads the Audio_Clock. It uses no Web Audio type in its signature.
- **Web_Audio_Backend**: the Audio_Backend for the browser. With the output graph it builds, it is the only code that touches Web Audio (D3).
- **Fake_Audio_Backend**: an Audio_Backend for tests under Node. It records every call.
- **Audio_Context**: the `AudioContext` the Web_Audio_Backend creates.
- **Sound_Id**, **Ghost_Sound**, **Calibration_Noise**, **Sound**, **Buffer**, **Render_Function**, **Sample_Rate**, **Reference_RMS**, **Peak**: as in the ghost-sounds requirements.
- **Supported_Sample_Rate**: a finite Sample_Rate of at least `soundRulesConfig.sampleRateMinHz` (22050 Hz).
- **Ear**: `left` or `right`. **Ear_Choice**: an Ear, or `both`.
- **Other_Channel**: for a Playback_Request with one Ear, the channel of the other Ear.
- **Level**: decibels relative to the calibration anchor, as in `hearing-method.md`. A Ghost_Sound at Level 0 has the RMS of the Calibration_Noise at the kept Calibration_Setting.
- **Requested_Level**: the Level a caller asks for. **Played_Level**: the Level that is actually played.
- **Calibration_Setting**: the position of the calibration control, in decibels. **Calibration_Gain**: the linear gain `decibelsToGain(Calibration_Setting)`.
- **Applied_Gain**: the linear gain multiplied into the faded Buffer: `Calibration_Gain × decibelsToGain(Played_Level)`.
- **Anchor_Cap**: `hearingMethodConfig.capRelativeToAnchorDb`, the highest Level anything may be played at (15 dB) (D2).
- **Ceiling**: `audioSafetyConfig.ceilingFraction`, the largest absolute sample value any output channel may hold (0.25 of full scale) (D1).
- **Cap**: the Anchor_Cap and the Ceiling together. Whichever is lower for a given Buffer and Calibration_Gain wins.
- **Clamp**: a Prepared_Playback whose Played_Level is below its Requested_Level. **Clamp_Limit**: the limit that set the Played_Level: `anchorCap`, `rise` or `ceiling`.
- **Clamp_Log**: the in-memory list of every Clamp the Output_Shell has scheduled (D22).
- **Output_Fade**: the raised-cosine fade over `outputFadeMs` at each end that Playback_Preparation multiplies into every Buffer (D13).
- **Fade_In_Length** and **Fade_Out_Length**: as measured by `measureFadeLengths` from the ghost-sounds spec.
- **Peak_Bound**: for each Sound, the largest Peak a Buffer may have, in decibels above the Reference_RMS, for the Output_Stage to play it (D6).
- **Playable_Buffer**: a Buffer the Output_Stage rendered itself whose Peak is within its Peak_Bound.
- **Room_Top_Level**: for a Sound and a Calibration_Gain, the lower of the Anchor_Cap and the Level at which a Buffer whose Peak equals the Peak_Bound would reach the Ceiling.
- **Range_Report**: the Room_Top_Level of every Sound for one Calibration_Gain, the limit that sets each one, its distance below the Anchor_Cap, and the RMS of a Sound at `hearingMethodConfig.floorDb`.
- **Level_Grid**: the Levels `startingLevelDb + k × upwardStepDb` for whole numbers k, the levels the threshold search uses.
- **Calibration_Repeat**: one play of the Calibration_Noise in both ears during calibration.
- **Control_Range**: the Calibration_Settings the control can reach, from `calibrationSettingMinDb` up to the Calibration_Setting_Top.
- **Calibration_Setting_Top**: the highest Calibration_Setting on the control's step grid at which the Calibration_Noise at its Peak_Bound stays within the Ceiling and every Ghost_Sound has a Room_Top_Level of at least `roomTopMinDb` (D8).
- **Keep_Minimum**: `calibrationSettingKeepMinDb`, the lowest Calibration_Setting that can be kept (D10).
- **Rise_Limit**: the rule that the Applied_Gain on an Ear, in decibels, rises by at most `hearingMethodConfig.upwardStepDb` from one sound on that Ear to the next within a Room_Span (audio-safety rule 4, D15).
- **Room_Span**: the sounds played between two calls of `beginRoom`, or since the Output_Shell was created.
- **Purpose**: why a sound is played: `trial`, `replay`, `listening`, `headphoneCheck` or `calibration`. Only Calibration_Repeats have the Purpose `calibration`, and they have their own call.
- **Busy_Interval**: from the scheduled start of a sound to its scheduled end.
- **Running**, **Stopped**, **Inactive**, **Unsupported**: the states of the Output_Shell (D14, D18).
- **Audio_Clock**: the Audio_Context's `currentTime`, given in milliseconds.
- **User_Gesture**: the synchronous part of an event handler run for a click, a tap or a key press by the visitor.
- **Headphone_Check**: the Calibration_Noise played in the left Ear only, followed by the visitor's answer.
- **Listening_Page**: the development page `listen.html`, served by the development server only (D26).
- **Visible_Stop_Control**: a control on screen that calls `stopAll`.
- **Visitor_Copy**: strings a visitor or the project owner can read on a page, kept in `src/copy/`.
- **Property_Suite**: the property tests of this spec under `tests/properties/`.
- **Browser_Suite**: the Playwright tests of this spec under `tests/e2e/`.
- **Manual_Checklist**: the numbered checklist in the design section "Manual checks", carried out by the project owner on the Listening_Page.

## Requirements

### Requirement 1: Steering values in config

**User story:** As the project owner, I want the absolute digital ceiling in `src/config` with exactly the steering value, so that every check reads one source and nobody loosens it by accident.

#### Acceptance criteria

1. THE `audioSafetyConfig` in `src/config/audio-safety-config.ts` SHALL hold `ceilingFraction` with the value 0.25, with a comment quoting its row of the Initial values table in `.kiro/steering/audio-safety.md`, next to the existing `fadeMinMs` (20) and `ghostSoundMaxDurationMs` (1500), which SHALL stay unchanged.
2. IF a later change sets `ceilingFraction` above 0.25, THEN the config unit test SHALL break with a message that names `audio-safety.md` and says that loosening needs the project owner's approval.
3. THE Output_Stage SHALL read the Ceiling, the shortest fade and the longest sound from `audioSafetyConfig`, and the Anchor_Cap, the floor, the starting level and the upward step from `hearingMethodConfig`, and from nowhere else (D2).
4. THE Output_Stage SHALL treat a sample whose absolute value equals the Ceiling as allowed and any larger absolute value as beyond the Ceiling (D1).

### Requirement 2: Output values in config

**User story:** As the person who tunes the output after the first listening session, I want every number of the output stage in config with its invariants tested, so that a tuning change that would break a safety rule is caught before anything plays.

#### Acceptance criteria

1. THE `audioOutputConfig` in `src/config/audio-output-config.ts` SHALL hold the Output_Fade length, the stop fade length, the scheduling lead, the Peak_Bound of every Sound, the most render attempts for a Playable_Buffer, the bottom, step and Keep_Minimum of the Control_Range, the largest rise between Calibration_Repeats, the gap between Calibration_Repeats, the Level of the Headphone_Check and `roomTopMinDb`, each with a comment naming its decision in `design.md`.
2. THE `audioOutputConfig` SHALL be deeply frozen, and every field name SHALL end in one of the units `Db`, `Ms`, `Hz`, `Fraction` or `Count`.
3. THE config unit tests SHALL check that `outputFadeMs` and `stopFadeMs` are each at least `fadeMinMs`, that the largest rise between Calibration_Repeats is at most `upwardStepDb`, that the Level of the Headphone_Check is at most the Anchor_Cap, and that `roomTopMinDb` is at least `startingLevelDb`.
4. THE config unit tests SHALL check that the bottom of the Control_Range is below the Keep_Minimum, and THE unit tests of `calibration-setting-top.ts` SHALL check that the Keep_Minimum is at most the Calibration_Setting_Top computed from the config, because `src/config` may not import the Output_Stage.
5. THE unit tests of `calibration-setting-top.ts` SHALL check that the Calibration_Noise at its Peak_Bound and at the Calibration_Setting_Top, played at Level 0 and at the Level of the Headphone_Check, stays within the Ceiling.
6. THE config unit tests SHALL hold the loosening guards of D32, each with a message that names this spec's design and says that loosening needs the project owner's approval.

### Requirement 3: One output path

**User story:** As the visitor, I want every sound to pass through one place that cannot be bypassed, so that the limits hold for every sound the house makes.

#### Acceptance criteria

1. THE Output_Stage SHALL import only from `src/config/` and `src/audio/synth/`.
2. THE Web_Audio_Backend and its output graph SHALL be the only code in the repository's `src/` that names a Web Audio type or calls a Web Audio constructor (D3).
3. THE Output_Shell SHALL play only Sounds it renders itself from a Sound_Id, and SHALL offer no way for a caller to hand it samples to play (D4).
4. THE Output_Stage SHALL connect nothing to the Audio_Context's destination except its one output graph, and the output graph SHALL hold a source only for a sound the Output_Shell scheduled.
5. THE Playback_Preparation, the Output_Shell and the Range_Report SHALL run under Node.js in Vitest without a browser, with the Fake_Audio_Backend standing in for the Web_Audio_Backend.
6. THE Output_Stage SHALL take every random number from a `RandomSource` passed in by its caller.
7. THE production page `index.html` SHALL create no Audio_Context through this spec. Only the visit-flow spec connects the Output_Stage to the visit.

### Requirement 4: Starting sound inside a user gesture

**User story:** As the visitor, I want sound to start only because I pressed something, so that a page never makes a sound on its own.

#### Acceptance criteria

1. THE Output_Shell SHALL create the Audio_Context only inside `activate`, and SHALL resume a suspended Audio_Context only inside `activate`.
2. THE Output_Shell's `activate` SHALL make its calls to the Audio_Backend synchronously, before it returns or awaits anything, so that a caller running inside a User_Gesture keeps the gesture (D23).
3. WHERE the browser reports whether a user activation is active, IF `activate` is called while no user activation is active, THEN THE Output_Shell SHALL neither create nor resume the Audio_Context and SHALL report that no gesture was active (D23).
4. WHILE the Output_Shell is not Running, THE Output_Shell SHALL refuse every play request and schedule nothing.
5. WHERE the browser offers `navigator.audioSession`, THE Web_Audio_Backend SHALL set its type to `playback` when it creates the Audio_Context (D24).

### Requirement 5: Devices that cannot carry the house

**User story:** As the visitor, I want to be told plainly when my device cannot play the house properly, so that I do not walk through rooms I cannot hear for reasons that have nothing to do with my ears.

#### Acceptance criteria

1. THE Web_Audio_Backend SHALL create the Audio_Context without asking for a sample rate, so that its Sample_Rate follows the output device (D11).
2. IF the Audio_Context's Sample_Rate is not a Supported_Sample_Rate, THEN THE Output_Shell SHALL become Unsupported with the reason `sampleRateTooLow`, close the Audio_Context, and refuse every later request, including Calibration_Repeats (D11).
3. IF the Audio_Context's destination reports fewer than two channels, THEN THE Output_Shell SHALL become Unsupported with the reason `monoOutput` and refuse every later request (D12).
4. IF the browser offers no `AudioContext`, THEN THE Output_Shell SHALL become Unsupported with the reason `noWebAudio`.
5. WHEN the Output_Shell becomes Unsupported, THE Output_Shell SHALL report the reason and the Sample_Rate to its caller, and the Visitor_Copy SHALL hold one plain sentence for each reason.

### Requirement 6: Channel routing and silence

**User story:** As the visitor, I want a sound for one ear to reach only that ear, and silence to be true silence, so that the side I name is the side the house chose.

#### Acceptance criteria

1. WHEN a Playback_Request names one Ear, THE Playback_Preparation SHALL return an Other_Channel in which every sample is exactly `+0`.
2. WHEN a Playback_Request names one Ear, THE Playback_Preparation SHALL return in that Ear's channel the faded Buffer multiplied by the Applied_Gain, rounded once to 32-bit floats.
3. IF a Playback_Request for a Ghost_Sound names `both`, THEN THE Playback_Preparation SHALL refuse it (D21).
4. WHEN a Playback_Request for the Calibration_Noise names `both`, THE Playback_Preparation SHALL return the same samples in both channels.
5. THE Web_Audio_Backend SHALL play the two channels of a Prepared_Playback as the two channels of one stereo buffer, without panning, mixing or resampling, and SHALL map `left` and `right` to channel indices in one place only (D25).
6. WHILE no sound is scheduled, THE Output_Stage SHALL have no source in its output graph, so that a no-sound trial carries exact digital zero on both channels.

### Requirement 7: The cap

**User story:** As the visitor, I want no sound ever louder than the cap, so that my ears are protected even when something upstream goes wrong.

#### Acceptance criteria

1. THE Playback_Preparation SHALL return channels in which no sample's absolute value exceeds the Ceiling, for any Buffer, any Requested_Level and any Calibration_Gain.
2. THE Playback_Preparation SHALL return a Played_Level that is at most the Anchor_Cap and at most the Requested_Level.
3. IF the Requested_Level is above the Anchor_Cap, THEN THE Playback_Preparation SHALL lower the Played_Level to the Anchor_Cap and report the Clamp_Limit `anchorCap`.
4. IF the faded Buffer at the Calibration_Gain and the Played_Level reached so far would put any sample beyond the Ceiling, THEN THE Playback_Preparation SHALL lower the Applied_Gain of the whole sound so that its largest output sample is at most the Ceiling and at least `Ceiling × (1 − 10⁻⁶)`, and report the Clamp_Limit `ceiling` (D5).
5. THE Playback_Preparation SHALL never clip, limit or compress a sample on its own (D5).
6. IF the Requested_Level or the Calibration_Gain is not a finite number, or the Calibration_Gain is not above zero, THEN THE Playback_Preparation SHALL refuse the request.
7. AS a last step, THE Playback_Preparation SHALL check every output sample against the Ceiling and SHALL refuse the request if any sample is beyond it.
8. WHEN the Output_Shell schedules a Clamp, THE Output_Shell SHALL add an entry to the Clamp_Log with the Audio_Clock start time, the Sound_Id, the Ear_Choice, the Purpose, the Requested_Level, the Played_Level and the Clamp_Limit, and SHALL return the same values to the caller (D22).

### Requirement 8: The level played is the level reported

**User story:** As the author of the visit flow, I want the level I am told was played to be the level that was played, so that the search never records a level that did not happen.

#### Acceptance criteria

1. WHEN a Prepared_Playback has no Clamp_Limit, THE Playback_Preparation SHALL report a Played_Level equal to the Requested_Level, and the Applied_Gain SHALL be `Calibration_Gain × decibelsToGain(Requested_Level)`.
2. WHEN a Prepared_Playback has a Clamp_Limit, THE Playback_Preparation SHALL report as Played_Level the Level that the Applied_Gain it used gives, so that `Applied_Gain = Calibration_Gain × decibelsToGain(Played_Level)` holds to within 10⁻⁹ relative.
3. THE RMS of the played channel of every Ghost_Sound and of the Calibration_Noise SHALL be within `levelToleranceDb` of `Reference_RMS × Applied_Gain`, for every seed and every Supported_Sample_Rate (D13).
4. THE Output_Shell SHALL return the Played_Level, the Requested_Level and the Clamp_Limit for every sound it schedules.

### Requirement 9: The highest playable level of a room

**User story:** As the author of the visit flow, I want to know before a room starts how loud its sound can be played with the current calibration, so that the search uses that as its cap and no trial is ever clamped.

#### Acceptance criteria

1. WHEN the Output_Shell renders a Sound for playing, THE Output_Shell SHALL render it again with the next draws of the same `RandomSource` while its Peak is above its Peak_Bound, at most `renderAttemptsMaxCount` times in all, and SHALL refuse the request if no attempt meets the Peak_Bound (D6).
2. THE Output_Stage SHALL compute the Range_Report as a pure function of the Calibration_Gain, with each Room_Top_Level equal to `min(Anchor_Cap, gainToDecibels(Ceiling / (Reference_RMS × decibelsToGain(Peak_Bound) × Calibration_Gain)))`.
3. WHEN a calibration is kept, THE Output_Shell SHALL return the Range_Report for the kept Calibration_Gain, and SHALL return it again on request for as long as that calibration is kept.
4. WHEN a Playable_Buffer of a Ghost_Sound is requested at a Level at or below its Room_Top_Level, without a Rise_Limit Clamp, THE Playback_Preparation SHALL play it at exactly the Requested_Level with no Clamp_Limit.
5. THE Range_Report SHALL give, for each Sound, the Room_Top_Level, whether the Anchor_Cap or the Ceiling sets it, and how far it lies below the Anchor_Cap, and SHALL give the RMS, as a fraction of full scale, of any Sound played at `floorDb` (D7).
6. THE Output_Stage SHALL report Room_Top_Levels exactly and leave rounding to its caller. A pure function `roomSearchCapDb` in `src/session/` SHALL round a Room_Top_Level down to the Level_Grid, for the visit flow to give the threshold search as its cap (D7).

### Requirement 10: Fades and length

**User story:** As the visitor, I want every sound to arrive and leave gently and to be short, so that nothing in the house startles me or drags on.

#### Acceptance criteria

1. THE Playback_Preparation SHALL multiply every Buffer by the Output_Fade before applying any gain, so that the first and last samples of every channel are exactly zero (D13).
2. IF the faded Buffer has a Fade_In_Length or a Fade_Out_Length below `fadeMinMs`, THEN THE Playback_Preparation SHALL refuse the request (D13).
3. IF the Buffer has more samples than `ghostSoundMaxDurationMs` times its Sample_Rate, rounded down, or has no samples, THEN THE Playback_Preparation SHALL refuse the request.
4. IF the Buffer holds a sample that is not a finite number, or every sample is zero, THEN THE Playback_Preparation SHALL refuse the request.
5. IF the Sample_Rate of a Playback_Request is not a Supported_Sample_Rate, THEN THE Playback_Preparation SHALL refuse the request.
6. WHEN the Output_Shell stops all sound, THE output graph SHALL bring every channel to exact zero over a raised-cosine fade of `stopFadeMs`, and SHALL then stop every source (D14).

### Requirement 11: No jumps upward

**User story:** As the visitor, I want the house never to leap from quiet to loud on the same ear, so that a missed sound is followed by one only a little louder.

#### Acceptance criteria

1. WHILE a Room_Span lasts, THE Output_Shell SHALL pass to the Playback_Preparation the Applied_Gain of the previous sound on each Ear, whatever its Purpose, for every request except one with the Purpose `replay`, and SHALL record the Applied_Gain of every sound it schedules, a replay included, as the previous Applied_Gain of each Ear it plays on.
2. IF a request's Applied_Gain on an Ear would be more than `upwardStepDb` plus 10⁻⁹ dB above the previous Applied_Gain on that Ear in the same Room_Span, THEN THE Playback_Preparation SHALL lower it to `upwardStepDb` above that previous Applied_Gain and report the Clamp_Limit `rise` (D15).
3. WHEN a request names `both`, THE Rise_Limit SHALL apply against the previous Applied_Gain of each Ear, and the lower of the two limits SHALL hold.
4. WHEN `beginRoom` is called, THE Output_Shell SHALL forget the previous Applied_Gains, so that the first sound of a room is not limited by the last room.
5. WHEN a request has the Purpose `replay`, THE Output_Shell SHALL not apply the Rise_Limit, and THE Cap SHALL still apply (audio-safety rule 4).
6. WHEN the threshold search drives a room after `beginRoom`, with its cap set to `roomSearchCapDb` of the room's Room_Top_Level, THE Output_Shell SHALL report no Clamp for any of its trials.

### Requirement 12: One sound at a time

**User story:** As the visitor, I want two sounds never to play over each other, so that their sum cannot pass the ceiling.

#### Acceptance criteria

1. IF a play request or a Calibration_Repeat would start before the end of the current Busy_Interval, THEN THE Output_Shell SHALL refuse it with the reason `busy` and schedule nothing (D16).
2. THE Output_Shell SHALL schedule sounds whose Busy_Intervals never overlap.
3. WHEN the Output_Shell stops all sound, THE Output_Shell SHALL end the current Busy_Interval.

### Requirement 13: Start time

**User story:** As the author of the visit flow, I want the exact moment each sound starts, so that answers are scored against when the sound was heard and not when it was asked for.

#### Acceptance criteria

1. WHEN the Output_Shell schedules a sound, THE Output_Shell SHALL start it at the Audio_Clock time `scheduleLeadMs` after the time it read when scheduling, and SHALL return that start time and the end time in milliseconds on the Audio_Clock (D17).
2. THE Output_Shell SHALL offer a pair of times read together, one on the Audio_Clock and one on the browser's performance clock, so that the caller can relate the two (D17).

### Requirement 14: Stopping all sound

**User story:** As the visitor, I want to silence the house at once at any moment, and to have it fall silent when I leave or hide the page, so that I am always in control.

#### Acceptance criteria

1. WHEN `stopAll` is called, THE Output_Shell SHALL fade all sound to exact zero over `stopFadeMs`, stop every source, suspend the Audio_Context, and become Stopped (D14).
2. WHILE the Output_Shell is Stopped, THE Output_Shell SHALL refuse every play request and every Calibration_Repeat until `activate` is called again.
3. WHEN the page becomes hidden, THE Output_Shell SHALL stop all sound with the reason `hidden`.
4. WHEN the page is left, THE Output_Shell SHALL stop all sound with the reason `pageLeft` and close the Audio_Context.
5. IF the Audio_Context leaves the running state for any reason the Output_Shell did not cause, THEN THE Output_Shell SHALL stop all sound with the reason `interrupted`.
6. WHERE the browser fires a `devicechange` event, WHEN it fires, THE Output_Shell SHALL stop all sound with the reason `deviceChanged` and forget the kept calibration (D18).
7. WHEN the Output_Shell stops all sound for any reason, THE Output_Shell SHALL report the reason to every listener registered with it.
8. THE Listening_Page SHALL show a Visible_Stop_Control at every moment, from before the first sound until the page is closed.

### Requirement 15: Calibration first

**User story:** As the visitor, I want the house to learn how loud my headphones are before it plays any ghost sound, so that the first ghost sound I hear is at a level that means something.

#### Acceptance criteria

1. WHILE no calibration is kept, THE Output_Shell SHALL refuse every play request, including a play request for the Calibration_Noise, and SHALL play only Calibration_Repeats.
2. WHEN `beginCalibration` is called, THE Output_Shell SHALL forget the kept calibration and the previous Applied_Gains.
3. THE Output_Shell SHALL keep the Calibration_Gain in memory only and SHALL never store it (D19).

### Requirement 16: The calibration control

**User story:** As the visitor, I want to match a hiss to the sound of my own hands, starting from quiet, so that the house knows where "as loud as my hands" is without ever startling me.

#### Acceptance criteria

1. WHEN a calibration begins, THE Output_Shell SHALL play the first Calibration_Repeat at the bottom of the Control_Range, whatever setting is asked for (D8).
2. WHEN a Calibration_Repeat is requested, THE Output_Shell SHALL round the requested Calibration_Setting down to the control's step grid, keep it within the Control_Range, and keep it at most `calibrationRiseMaxDb` above the previous Calibration_Repeat, and SHALL return the Calibration_Setting it played (D8).
3. THE Output_Shell SHALL play every Calibration_Repeat in both Ears, at Level 0 with the Calibration_Gain of the played Calibration_Setting, through the Playback_Preparation.
4. WHEN the visitor keeps a setting, THE Output_Shell SHALL keep the Calibration_Setting of the last Calibration_Repeat it played, not a value passed in (D8).
5. IF no Calibration_Repeat has been played since the calibration began, THEN THE Output_Shell SHALL refuse to keep a calibration.
6. IF the setting to be kept is below the Keep_Minimum, THEN THE Output_Shell SHALL refuse to keep it with the reason `systemVolumeHigh`, and the Visitor_Copy SHALL tell the visitor to turn the system volume down and match the hiss again (D10).
7. WHEN the setting reaches the Calibration_Setting_Top, THE calibration screen SHALL show the Visitor_Copy line saying that this is the loudest the hiss goes and that the visitor may keep it.
8. WHEN a calibration is kept, THE calibration screen SHALL show the Visitor_Copy line telling the visitor not to raise the system volume and saying that the limit holds only if they do not (audio-safety rule 8).
9. WHEN a calibration is kept and at least one Ghost_Sound's Room_Top_Level, rounded down to the Level_Grid, is below the Anchor_Cap, THE calibration screen SHALL show the Visitor_Copy line that says in how many rooms the house cannot get as loud as it would like and tells the visitor not to turn the volume up to change this (D9).
10. THE Visitor_Copy SHALL never advise the visitor to raise the system volume (D9, Q2).
11. THE calibration controller in `src/session/` SHALL play Calibration_Repeats one after another, with `calibrationRepeatGapMs` between the end of one and the start of the next, using an injected timer, for as long as the calibration screen is open and the Output_Shell is Running.

### Requirement 17: The headphone check

**User story:** As the visitor, I want the house to make sure left is left, so that the result does not swap my ears.

#### Acceptance criteria

1. WHEN the Headphone_Check is played, THE Output_Shell SHALL play the Calibration_Noise in the left Ear only, at the Level `headphoneCheckLevelDb`, with the Purpose `headphoneCheck` (D20).
2. IF no calibration is kept, THEN THE Output_Shell SHALL refuse the Headphone_Check.
3. THE Headphone_Check SHALL accept four answers: left, right, both sides, and nothing heard.
4. WHEN the answer is right, THE Visitor_Copy line shown SHALL tell the visitor to turn the headphones around and try again.
5. WHEN the answer is both sides, THE Visitor_Copy line shown SHALL say that the hiss came from one side only and that the device may be set to play the same sound in both ears (D12).
6. WHEN the answer is nothing heard, THE Visitor_Copy line shown SHALL ask the visitor to check that both earpieces are on and connected and to try again.
7. THE judgement of an answer SHALL be a pure function in `src/session/` from the answer to one of `correct`, `swapped`, `bothSides` and `notHeard`.

### Requirement 18: Visitor copy

**User story:** As the project owner, I want every line the output stage causes to be shown kept with the rest of the copy and held to the wording rules, so that nothing about sound overclaims or frightens.

#### Acceptance criteria

1. THE strings for calibration, the Headphone_Check, the Unsupported reasons, the Stopped state, the Visible_Stop_Control and the Listening_Page SHALL live in `src/copy/`, and strings that depend on numbers SHALL be built by functions there.
2. THE strings of R18.1 SHALL contain no term listed in `src/config/banned-terms.ts`, checked by a unit test with `findBannedTerms` over every string and over the output of every function for representative inputs.
3. WHEN the Listening_Page shows a Level, THE Visitor_Copy SHALL label it as relative to the visitor's own calibration.
4. THE strings of R18.1 SHALL be short, calm sentences in English, as `wording.md` asks.

### Requirement 19: The listening page

**User story:** As the project owner, I want a development page where I calibrate and then play each of the six sounds to each ear at a level I choose, so that I can hear the ghost sounds for the first time safely, with the system volume at any setting.

#### Acceptance criteria

1. THE Listening_Page SHALL be served by `npm run dev` at `listen.html`, SHALL not be an input of `npm run build`, and SHALL not be linked from `index.html` (D26).
2. THE Listening_Page SHALL say at the top, before anything else, that it is a development page and not part of a visit.
3. WHEN the Listening_Page opens, THE Listening_Page SHALL play nothing and create no Audio_Context until the visitor presses its start control.
4. THE Listening_Page SHALL let the visitor calibrate first, and SHALL show the six Sounds only after a calibration is kept, each with a play control for the left Ear, a play control for the right Ear, and a level control that moves one Level_Grid step at a time between `floorDb` and the Sound's Room_Top_Level rounded down to the Level_Grid, starting at `startingLevelDb` or that rounded top, whichever is lower.
5. THE first sound the Listening_Page can play SHALL be a Calibration_Repeat at the bottom of the Control_Range.
6. THE Listening_Page SHALL send every sound through the Output_Shell, and SHALL show, for the last sound of each row, the Requested_Level, the Played_Level and the Clamp_Limit, and for each row its Room_Top_Level.
7. THE Listening_Page SHALL show the Sample_Rate, the Calibration_Setting, the Range_Report, the Clamp_Log and the seed of its `RandomSource`.
8. THE Listening_Page SHALL hold the Headphone_Check.
9. THE Listening_Page's state and actions SHALL live in `src/session/`, its drawing and its entry in `src/ui/`, and its entry SHALL create the `RandomSource` from a seed drawn with `crypto.getRandomValues` (D26).

### Requirement 20: Properties proved under Node

**User story:** As the project owner, I want the safety rules checked by property tests over any buffer, level and calibration, so that a rare case that breaks a rule is found before anyone listens.

#### Acceptance criteria

1. THE Property_Suite SHALL check that, for any Buffer, any Requested_Level and any Calibration_Gain, no output sample exceeds the Ceiling and the Played_Level never exceeds the Anchor_Cap (brief property 1).
2. THE Property_Suite SHALL check that, for any Playback_Request for one Ear, every sample of the Other_Channel is exactly zero (brief property 2).
3. THE Property_Suite SHALL check that every Prepared_Playback that is not refused, including every shipped Sound at any seed and Supported_Sample_Rate, starts and ends at exactly zero with a Fade_In_Length and a Fade_Out_Length of at least `fadeMinMs` (brief property 3).
4. THE Property_Suite SHALL check the further properties CP4 to CP13 in `design.md`.
5. THE Property_Suite SHALL run under Node in `npm test` with a new random fast-check seed on every run.
6. WHEN a property finds a counterexample, THE counterexample SHALL be kept as a named regression test, and the fix SHALL go in a separate commit.

### Requirement 21: Checks in a real browser

**User story:** As the project owner, I want the parts that only a browser can run checked automatically in a browser, so that what I hear on the listening page is what the Node tests proved.

#### Acceptance criteria

1. THE Browser_Suite SHALL open the Listening_Page on the development server in Chromium and SHALL check that no Audio_Context exists before the start control is pressed, and that exactly one is created while it is pressed.
2. THE Browser_Suite SHALL record every buffer the page hands to Web Audio and SHALL check that the first is a Calibration_Repeat at the bottom of the Control_Range, that no sample of any of them is beyond the Ceiling, and that for every one-Ear sound the Other_Channel is exactly zero.
3. THE Browser_Suite SHALL render the output graph in an `OfflineAudioContext` and SHALL check that a left-only and a right-only buffer come out on their own channel with the other channel exactly zero, and that a stop brings both channels to exact zero within `stopFadeMs` and keeps them there.
4. THE Browser_Suite SHALL check that the Visible_Stop_Control and a hidden page stop all sound and that no sound starts afterwards until the start control is pressed again.
5. THE Browser_Suite SHALL check that `npm run build` puts no Listening_Page code or string into `dist/`, and that the existing check that `index.html` creates no Audio_Context still holds.

### Requirement 22: Checks that need a person

**User story:** As the project owner, I want a short list of what I must check with my own ears, so that the claims that need a listener rest on a listener.

#### Acceptance criteria

1. THE design SHALL hold the Manual_Checklist as a short numbered list that the project owner can follow on the Listening_Page.
2. THE Manual_Checklist SHALL confirm, in two desktop browsers, that left plays left, right plays right, the other ear is silent, and the Visible_Stop_Control silences everything.
3. WHEN the Manual_Checklist has been carried out, THE results SHALL be recorded in `docs/experiments/audio-output-listening.md`, with the date, the browsers and their versions, the operating system, the headphones, the kept Calibration_Setting and the answer to every item.
4. THE spec SHALL not claim any item of the Manual_Checklist as met until that record exists.

### Requirement 23: Documentation

**User story:** As someone reading the repository, I want the READMEs to say where the output stage, the calibration, the listening page and their checks live, so that I can find them.

#### Acceptance criteria

1. THE README files of `src/audio/output/`, `src/session/`, `src/copy/` and `docs/` SHALL describe the Output_Stage, the calibration controller, the Listening_Page and how to open it, and the record of R22.3.
2. THE documentation added by this spec SHALL follow `.kiro/steering/wording.md`.

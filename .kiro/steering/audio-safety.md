---
inclusion: always
---

# Audio defaults

This file used to hold the audio safety rules. The project owner dropped them on 2026-11-17, after playing: they held development back too much. Nothing here outranks anything else, nothing here needs the owner's approval to change, and a change that goes against a line here is made like any other change. What is left describes how the output stage behaves today, so that it can be changed on purpose.

The rule against jumps upward went first, earlier on 2026-11-17. The rest went the same day: the output stage no longer refuses a sound longer than 1.5 s or a sound whose fades are shorter than 20 ms, and no longer clamps a level above the search cap.

## How the output stage behaves today

1. **One output path.** Every sound the product plays goes through the single output stage in `src/audio/output`. This is architecture, not a rule: the stop control, the stop on hide or leave, and the clamp log only see sounds that go through it.
2. **The ceiling is the top of the level scale.** No output sample goes beyond `ceilingFraction` of full scale (0.25, about 12 dB below full scale). A sound asked for above it is turned down as a whole, never clipped, and logged with the limit `ceiling`. The room top levels, the calibration control's top and the range report are all measured against it, so changing it moves all of them.
3. **The search cap belongs to the search.** `capRelativeToAnchorDb` (+5 dB) is where the threshold search stops rising (`.kiro/steering/hearing-method.md`). The output stage no longer holds sounds to it: a reminder, a chime or any later sound asked for above it plays as asked, up to the ceiling.
4. **Fades.** The output stage puts its own short fade on both ends of every sound, and the house's sounds are built with fades of at least `fadeMinMs` (20 ms). The output stage no longer refuses a sound whose fades come out shorter.
5. **Silent means silent.** On a trial for one ear, the other channel carries exact digital zero. On a no-sound trial both channels carry exact digital zero. This is how the hearing method tells the ears apart, not a safety limit.
6. **Sound lengths.** The ghost sounds are built to last at most `ghostSoundMaxDurationMs` (1.5 s), and the timings of the visit flow are measured from it. The output stage no longer refuses a longer sound. The theme loops on the headphone check screen until the visitor starts the check. It plays once when the main visit reaches its result, and stops if the visitor leaves the result. The development listening page uses the same music for calibration.
7. **The stop control.** A visible control stops all sound at once. Leaving the page or hiding the tab stops all sound.
8. **The volume keys.** The headphone check asks the visitor to keep the system volume unchanged during the test.
9. **No jump scares.** The house has no loud stingers, screams or full-screen flashes. This is the product's tone (`.kiro/steering/product.md`), and can change with it.

## Current values

These numbers live in `src/config/audio-safety-config.ts`. They are defaults and may be changed freely.

| Quantity | Value |
|---|---|
| Shortest fade the house's sounds are built with | 20 ms |
| Longest ghost sound as built | 1.5 s |
| Absolute digital ceiling | no output sample beyond 0.25 of full scale, about 12 dB below full scale |

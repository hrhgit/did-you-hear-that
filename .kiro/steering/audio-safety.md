---
inclusion: always
---

# Audio safety

These rules protect the visitor's ears. They outrank every other requirement, including anything that would make the house scarier.

1. **One output path.** Every sound the product plays goes through the single output stage in `src/audio/output`. No other code creates an audio source connected to the destination.
2. **A hard cap.** The output stage refuses any level above the cap set in `src/config`. The cap is expressed relative to the calibration anchor and also as an absolute digital ceiling below full scale. Whichever is lower wins. A request above the cap is clamped and logged, never played as asked.
3. **No sudden sounds.** Every sound fades in and fades out over at least 20 ms. Nothing starts at full level.
4. **No jumps upward.** Within a room, the level rises by at most one upward step between consecutive sounds on the same ear. The replay of missed sounds is the one place a larger rise is allowed, and it is still limited by the cap.
5. **Silent means silent.** On a trial for one ear, the other channel carries exact digital zero. On a no-sound trial both channels carry exact digital zero.
6. **Short sounds.** No single ghost sound lasts longer than the maximum duration in `src/config`.
7. **The visitor stays in control.** A visible control stops all sound at once at any moment. Leaving the page or hiding the tab stops all sound.
8. **Calibration can be undone by the volume keys.** After calibration the page tells the visitor not to raise the system volume, and says the cap only holds if they do not.
9. **No jump scares.** No loud stingers, no screams, no sudden full-screen flashes. This applies to video and marketing material too.

When a requested change conflicts with a rule here, stop and say so instead of working around it.

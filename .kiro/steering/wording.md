---
inclusion: always
---

# Wording

This product touches health. Overclaiming is the easiest way for it to do harm, and the easiest way for an expert reader to dismiss it. These rules apply to interface text, the README, the project page, the video script and commit messages.

## Words that never appear in visitor-facing text

- normal, abnormal, healthy, impaired, damaged, loss, deaf
- diagnosis, diagnose, diagnostic, screening, clinical, medical
- audiogram, dB HL, hearing level
- any comparison with other people, such as average, typical, people your age, percentile
- test result, pass, fail, score

One exception: the fixed limits statement described below says what the product is not, so it may use "diagnosis" and "clinical" in the negative. Those sentences are written once in `src/copy` as constants and are the only strings exempt from the check.

`npm run check:copy` enforces this list. The list itself lives in `src/config` so the check and the copy share one source.

## How to describe the product

- It is a "self-check" or "a first listen". It is not a "hearing test" and not a "hearing check".
- It estimates a level from the sounds you caught during the game. It does not "measure your hearing".
- Levels are described as "quieter" and "louder" and drawn as depth of light. If a number is shown it is labelled as relative to the visitor's own calibration.

## What the result page must always say

In plain words, next to the picture and not hidden behind a link:

1. Headphones differ at every pitch, so pitches cannot be compared with each other.
2. What can be compared is left against right at one pitch, and this visit against the visitor's own later visits with the same headphones.
3. This is not a diagnosis and has not been checked against clinical equipment.
4. When to see a hearing professional: a left and right difference that is still there after swapping the headphones, a sudden change, or ringing that does not go away.

## Sources

- The figure for young people at risk comes from a 2022 review in BMJ Global Health. Cite it as that. It is not a World Health Organization study.
- No figure is given for how many people have never had their hearing checked. None was found.
- Nothing is said about how accurate this product is. It has not been measured against clinical equipment.

## Tone

The house speaks in short, calm sentences. It never mocks the visitor for missing a sound. The line for a response on a no-sound trial is "I made no sound that time."

A creature that got away may be pleased with itself in its own voice ("Knock, knock, and off it goes."), with no exclamation mark and nothing about the visitor: the glee is the creature's, never a judgement of the one who missed it (the game layer, 2026-11-17).

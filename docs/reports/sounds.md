# Ghost sounds report

Written by `npm run render:sounds`. Do not edit by hand. Each sound is rendered at 44100 Hz and 48000 Hz with seeds 1 to 10, and each row shows the worst value over those seeds, with the seed in brackets. The property tests check the same rules for random seeds.

## Rules

| Rule | Limit | Source |
| --- | --- | --- |
| Band | out-of-band energy at least 30 dB below in-band energy, band 1/3 of an octave around the room's pitch | Brief 02, D2, D3 |
| Fade | at least 20 ms in and out, first and last sample exactly zero | audio-safety.md, rule 3; D4 |
| Duration | at most 1500 ms, the calibration noise included | audio-safety.md, rule 6; D8 |
| Level | RMS within 0.01 dB of 0.05 of full scale | Brief 02, D7 |
| Peak | below full scale | D7 |
| Calibration shape | each room band within 1 dB of the configured shape (cellar -9, corridor -6, nursery -3, stairs 0, attic -2 dB, relative to the loudest room band) | D8 |

## Results

| Sound | Rate | In-band share | Out-of-band | Fade in | Fade out | Duration | Level | Peak | Crest factor | Shape | Rules |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cellar | 44100 | 100.00 % (8) | -45.7 dB (8) | 24.8 ms (8) | 89.3 ms (4) | 900.0 ms (1) | 0.000 dB (9) | 0.220 (10) | 12.9 dB (10) | n/a | meets every rule |
| cellar | 48000 | 100.00 % (8) | -45.5 dB (8) | 24.8 ms (8) | 89.1 ms (3) | 900.0 ms (1) | 0.000 dB (10) | 0.220 (10) | 12.9 dB (10) | n/a | meets every rule |
| corridor | 44100 | 100.00 % (5) | -97.0 dB (5) | 150.0 ms (5) | 199.9 ms (6) | 1200.0 ms (1) | 0.000 dB (8) | 0.088 (6) | 4.9 dB (6) | n/a | meets every rule |
| corridor | 48000 | 100.00 % (5) | -97.0 dB (5) | 150.0 ms (3) | 199.9 ms (6) | 1200.0 ms (1) | 0.000 dB (2) | 0.088 (6) | 4.9 dB (6) | n/a | meets every rule |
| nursery | 44100 | 100.00 % (9) | -68.6 dB (9) | 29.0 ms (4) | 158.5 ms (4) | 1400.0 ms (1) | 0.000 dB (6) | 0.149 (2) | 9.5 dB (2) | n/a | meets every rule |
| nursery | 48000 | 100.00 % (9) | -68.6 dB (9) | 29.1 ms (1) | 158.5 ms (4) | 1400.0 ms (1) | 0.000 dB (2) | 0.148 (2) | 9.4 dB (2) | n/a | meets every rule |
| stairs | 44100 | 100.00 % (10) | -76.6 dB (10) | 81.1 ms (9) | 57.1 ms (10) | 800.0 ms (1) | 0.000 dB (3) | 0.358 (2) | 17.1 dB (2) | n/a | meets every rule |
| stairs | 48000 | 100.00 % (10) | -76.6 dB (10) | 81.6 ms (9) | 57.4 ms (10) | 800.0 ms (1) | 0.000 dB (3) | 0.350 (2) | 16.9 dB (2) | n/a | meets every rule |
| attic | 44100 | 100.00 % (4) | -146.4 dB (4) | 200.0 ms (2) | 299.8 ms (6) | 1200.0 ms (1) | 0.000 dB (3) | 0.082 (1) | 4.3 dB (1) | n/a | meets every rule |
| attic | 48000 | 100.00 % (1) | -146.3 dB (4) | 200.0 ms (7) | 299.8 ms (9) | 1200.0 ms (1) | 0.000 dB (8) | 0.082 (1) | 4.3 dB (10) | n/a | meets every rule |
| calibration | 44100 | n/a | n/a | 52.8 ms (1) | 54.6 ms (7) | 1500.0 ms (1) | 0.000 dB (3) | 0.245 (4) | 13.8 dB (4) | 0.5 dB (9) | meets every rule |
| calibration | 48000 | n/a | n/a | 52.1 ms (1) | 55.2 ms (7) | 1500.0 ms (1) | 0.000 dB (5) | 0.248 (3) | 13.9 dB (3) | 0.4 dB (9) | meets every rule |

Worst means the lowest value for the in-band share and the fades, the value farthest from zero for the level, and the highest value for the others. The level is the RMS in dB relative to the reference RMS. The shape is the largest distance of a room band from the configured shape. n/a marks a measure that does not apply to the sound, or a row whose renderer threw at every seed.

## Notes

- The calibration shape is a starting guess with no measured source. It is tuned by ear later.
- Crest factor has no limit here. It decides how close a sound can come to the absolute ceiling, which the audio-output spec enforces.
- Nothing in this report says how loud a sound is at the ear. Levels are relative to full scale.

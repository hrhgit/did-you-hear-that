# src/audio/synth

Pure functions that turn parameters into sample buffers: the ghost sounds, the calibration noise and the material for the last door. Each function takes the sample rate and a seeded random generator as parameters and never assumes a fixed sample rate. The same code runs in Node for offline rendering.

May import from: `config`.

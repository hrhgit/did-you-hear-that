# src/audio/output

The only code that touches Web Audio. It owns the `AudioContext` and applies the calibration gain, the level cap, the fades and the channel routing, and it stops all sound on request. Every sound the product plays goes through this module (audio-safety rule 1). Sound-producing browser APIs are allowed here and nowhere else in `src/`.

May import from: `config`, `audio/synth`.

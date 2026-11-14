# src/config

Every tunable number in one place: levels, step sizes, timings and rooms. Field names end in their unit (`Db`, `Ms`, `Hz`, `Fraction` or `Count`). The list of words that visitor-facing text must not use also lives here, so the copy check and the copy share one source.

May import from: nothing outside `config`. It is the base layer that every other module may import.

The seeded random generator and the injectable timer live here too. `engine` and `audio/synth` may import only from `config`, and the layout has no shared utilities module, so `config` is the only place every layer can reach them. The system timer in this directory is the one place that reads the clock and calls the global timer functions. If more shared code builds up, a steering change that adds a shared module is the cleaner fix.

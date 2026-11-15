# src/config

Every tunable number in one place: levels, step sizes, timings and rooms. Field names end in their unit (`Db`, `Ms`, `Hz`, `Fraction` or `Count`). The list of words that visitor-facing text must not use also lives here, so the copy check and the copy share one source.

May import from: nothing outside `config`. It is the base layer that every other module may import.

The seeded random generator and the injectable timer live here too. `engine` and `audio/synth` may import only from `config`, and the layout has no shared utilities module, so `config` is the only place every layer can reach them. The system timer and the system wall clock in this directory are the only places that read the clock, and the system timer is the only one that calls the global timer functions. If more shared code builds up, a steering change that adds a shared module is the cleaner fix.

## Motion of the picture

- `ambient-motion-config.ts`: how often the lamp is nudged and how far it swings, how often a shadow crosses under the door, how many dust motes there are and how slowly they sink, and how much of this is left when the visitor has asked for reduced motion.
- `ripple-config.ts`: how many rings a ripple has, how long they take, and the shortest time a ripple may take to reach its brightest.

These values shape what is drawn. They change no sound and no decision about an answer, and the ambient schedule is drawn from a random source of its own.

## The result page

- `result-page-config.ts`: `resultPageConfig`, the numbers the result page adds. None of them changes a sound, a wait or a decision about an answer. `foundLightDepthAtCapFraction` (0.1) and `foundLightDepthAtFloorFraction` (0.9) set how far the light reaches into a wing for a threshold found at the floor's own loudest playable level and at the quietest playable level; they are proposed, not approved, and await the project owner's choice (question Q1 of `.kiro/specs/result-page/design.md`). `betterThanFloorLightDepthFraction` (1, the far wall) and `worseThanCapLightDepthFraction` (0, dark) come from the brief. `savedVisitsMaxCount` (20, Q4) is the most saved visits the house keeps in one browser, and `headphoneNameMaxCharacterCount` (40, Q5) the longest headphone name in code points after tidying; both are proposed, not approved, and await the owner's choice. The file comments say `PROPOSED, NOT APPROVED` beside each of the four.
- `system-wall-clock.ts`: `createSystemWallClock`, the page's wall clock. `now()` reads `Date.now()` once and gives it with the visitor's local calendar date at that moment, written `YYYY-MM-DD`. The visit archive in `src/session` reads the date only through it, because `src/session` may not read the clock.
- `banned-terms.ts` also holds `limitsStatementAllowedTerms`: the two banned terms that the fixed limits statement of `src/copy/limits-statement.ts` may use, only in the negative, and that the copy check allows there and nowhere else. Each of them is in `bannedTerms`.

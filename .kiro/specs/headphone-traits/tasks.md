# Tasks: headphone traits

Requirement numbers refer to `requirements.md`, decisions to `design.md`.

- [x] 1. Config: `src/config/headphone-traits-config.ts` (every number of the design).
- [x] 2. The delay estimate and the live tracker: `src/session/output-delay.ts` and its test (R1, R3).
- [x] 3. Easy turns: `src/session/easy-turn-pacer.ts` and its test; the room runner plays them as reminders on the beat (R2, D3).
- [x] 4. The quiet cut and the balance: `quiet-cut.ts`, `left-right-balance.ts` and their tests (R4, R5).
- [x] 5. The traits from a log: `headphone-traits.ts` and its test (D4).
- [x] 6. The offset in the flow: window, cue and grading; logged above 0 only (R1.4, D2). `fixedTimingOffset` test option for cases that answer on the edges of the grades.
- [x] 7. Copy and result rows: `src/copy/headphone-traits-copy.ts`, the rows in `src/ui/result/create-result-view.ts` (R6).
- [x] 8. Steering: `product.md` (what the result may claim), `hearing-method.md` (timing offset and easy turns).
- [ ] 9. Listening tests: settle the open questions of `design.md` (a wireless pair against a wired one, a pair with a quiet cut).

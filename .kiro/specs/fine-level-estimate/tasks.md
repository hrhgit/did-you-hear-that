# Tasks: fine level estimate

Work through the tasks in order. After every task `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint` and `npm run check:copy` pass, and the tests the task names pass; after the last task the whole `npx vitest run` passes. Requirement numbers refer to `requirements.md`.

**Boundaries.** No task commits, stashes, resets or checks out anything. The working tree already holds many uncommitted changes that are not this spec's; leave them as they are. Do not touch the staircase or quick searches beyond the new optional parameter, `.kiro/steering/`, or any audio-safety value. Do not lower a run count, timeout or tolerance. Visitor-facing text never uses the banned terms of `src/config/banned-terms.ts` and never compares pitches.

- [x] 1. Config: the new fields of `adaptiveHearingConfig` (design.md "Config"), with their doc comments.
- [x] 2. Types and plumbing: `SearchEvidence`, `respond`/`record` with `evidence`, `earEstimate`, optional `lowDb`/`highDb` on the found ending and the room result (design.md "The shape of the change"). Existing tests pass unchanged.
- [x] 3. The adaptive search: 0.5 dB candidate grid, `detectionLeadDb`, the answer-time likelihood, whole-decibel probe choice with `minDropDb`, the Steering_Prior inside the choice only, the interpolated median and range (R1 to R4). Update `adaptive-ear-search.test.ts`.
- [x] 4. The room runner and the visit flow: net answer time, the visit's baseline, the steering (design.md "The room runner"). Fix the visit-flow tests whose levels move, with dated comments.
- [x] 5. The range through the log, summary and saved payload, all optional; `levelRangeLabel` in `src/copy/result-lines.ts` with a test; the small range beside each found wing in `src/ui/result/create-result-view.ts` and its CSS, kept compact.
- [x] 6. `tests/properties/fine-level-estimate.property.test.ts` (design.md "Checks"). If an accuracy check fails, report by how much; do not loosen it.
- [x] 7. Run the whole suite, typecheck, lint and copy check. Note the measured R5.1 and R6 figures under a new "Measured" heading at the end of `design.md`. The three R6 checks failed at their specified limits.

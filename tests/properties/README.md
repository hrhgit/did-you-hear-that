# tests/properties

Property-based tests written with fast-check and run by Vitest under Node. Files are named `*.property.test.ts`.

When a property finds a counterexample, fast-check prints its seed and the shrunk case. Keep that case as a named regression test, and put the fix in a separate commit.

- **`checks/`** holds one module per correctness property of the threshold search, shared by the Vitest files and by `npm run experiment:properties`, which writes `docs/experiments/brief-properties-<search>.json`. Modules marked harness-neutral run against any search through `tests/listeners/search-under-test.ts`. The others check this repository's own engine only. `ear-oracle.ts` re-derives an ear's result from its trial records without calling the engine.
- **The regression file.** `threshold-search-regressions.test.ts` holds one case per counterexample, named `regression <n>: <what went wrong> (<property>, seed <s>)`, with hard-coded listener parameters and seeds. A case is first committed on its own with Vitest's `it.fails`, which marks an expected break and keeps the suite green. The commit that changes the code turns it into an ordinary `it`. A case whose only remedy would move a value that may not be moved silently stays an expected break, with a decision in `.kiro/specs/threshold-search/design.md` giving the measured numbers.
- **Seeds.** Universal properties run with a new random seed every time, so each run explores new cases. Statistical properties, which judge rates over many simulated rooms, run with fixed seeds and fixed limits, so a change in their verdict comes from the code and not from the draw.

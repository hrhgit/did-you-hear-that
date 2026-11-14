# tests/properties

Property-based tests written with fast-check and run by Vitest under Node. Files are named `*.property.test.ts`.

When a property finds a counterexample, fast-check prints its seed and the shrunk case. Keep that case as a named regression test, and put the fix in a separate commit.

# tests

Tests that do not belong next to a single source file. Unit tests sit next to the file they test as `name.test.ts`. This directory holds the simulated listeners, the property tests, the Playwright tests and the repository-wide checks.

Code here may import any module under `src/`. It may not import from `tools/`, and nothing outside `tests/` may import from here.

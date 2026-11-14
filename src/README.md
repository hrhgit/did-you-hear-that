# src

Production code for the page. Each subdirectory is one module with its own README that says what belongs there and which modules it may import from. `src/main.ts` is the page entry and the only TypeScript file allowed outside a module directory.

The entry, treated as the module `main`, may import from: `ui`, `config`.

Nothing under `src/` may import from `tests/` or `tools/`. Imports are relative. There are no path aliases.

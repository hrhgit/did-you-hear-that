# tools

Node scripts that serve development: offline sound rendering with a spectrum report, the copy check, and the helpers behind the lint rules in `tools/lint/`. They run TypeScript through `tsx`. None of this code is part of the page.

Code here may import any module under `src/`. It may not import from `tests/`, and nothing outside `tools/` may import from here.

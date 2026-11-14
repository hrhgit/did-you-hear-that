import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import { createImportBoundaryRule } from "./tools/lint/import-boundary-rule.js";
import { createSourceRestrictionConfigs } from "./tools/lint/source-restriction-configs.js";

const repositoryRoot = import.meta.dirname;

export default defineConfig([
  {
    ignores: [
      "dist/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      ".kiro/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // A timer handle is often declared before the callback that reads it and assigned from
      // the setTimeout call that schedules it (design.md, D38).
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
  {
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
    rules: {
      "import-x/no-restricted-paths": createImportBoundaryRule(repositoryRoot),
    },
  },
  ...createSourceRestrictionConfigs(),
  eslintConfigPrettier,
]);

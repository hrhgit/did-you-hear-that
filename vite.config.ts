import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tools/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tools/lint/fixture/**", "node_modules/**"],
  },
});

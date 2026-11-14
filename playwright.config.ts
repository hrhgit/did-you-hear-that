import { defineConfig, devices } from "@playwright/test";
import { previewServers } from "./tests/e2e/preview-servers";

/**
 * Runs the end-to-end tests against the built `dist/`, served twice by `vite preview`: once at
 * the server root and once under the repository path that GitHub Pages uses (design.md, D1 and
 * D18). `npm run test:e2e` installs Chromium and builds before this runs.
 */
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: previewServers.map(({ port, basePath }) => ({
    command:
      basePath === "/"
        ? `npx vite preview --port ${port} --strictPort`
        : `npx vite preview --port ${port} --strictPort --base ${basePath}`,
    url: `http://localhost:${port}${basePath}`,
    reuseExistingServer: !process.env.CI,
  })),
});

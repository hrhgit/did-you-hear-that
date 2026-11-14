import { defineConfig, devices } from "@playwright/test";
import { devServer } from "./tests/e2e/dev-server";
import { previewServers } from "./tests/e2e/preview-servers";

/**
 * Runs the end-to-end tests against the built `dist/`, served twice by `vite preview`: once at
 * the server root and once under the repository path that GitHub Pages uses (design.md, D1 and
 * D18). `npm run test:e2e` installs Chromium and builds before this runs.
 *
 * A third server, the development server, serves the listening page for `listening-page.spec.ts`
 * only, because the build does not hold it (audio-output design.md, D26 and D31).
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
  webServer: [
    ...previewServers.map(({ port, basePath }) => ({
      command:
        basePath === "/"
          ? `npx vite preview --port ${port} --strictPort`
          : `npx vite preview --port ${port} --strictPort --base ${basePath}`,
      url: `http://localhost:${port}${basePath}`,
      reuseExistingServer: !process.env.CI,
    })),
    {
      command: `npx vite --port ${devServer.port} --strictPort`,
      url: `http://localhost:${devServer.port}${devServer.listeningPagePath}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

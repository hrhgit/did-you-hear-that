import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const visitLogDir = join(import.meta.dirname, "logs", "visits");

/**
 * Development only: writes what `src/ui/visit/send-dev-visit-log.ts` sends into `logs/visits/`
 * (ignored by git). A finished visit gets its own file named by the time it arrived; each saved
 * visit is written as `saved-<id>.json`, so loading the page again only overwrites it.
 */
function devVisitLog(): Plugin {
  return {
    name: "dev-visit-log",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev-visit-log", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }
        const kind = new URL(request.url ?? "", "http://x").searchParams.get(
          "kind",
        );
        let text = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => (text += chunk));
        request.on("end", () => {
          void (async () => {
            try {
              const body: unknown = JSON.parse(text);
              await mkdir(visitLogDir, { recursive: true });
              if (kind === "saved" && Array.isArray(body)) {
                for (const visit of body as { savedVisitId: string }[]) {
                  const id = visit.savedVisitId.replace(/[^\w-]/g, "_");
                  await writeFile(
                    join(visitLogDir, `saved-${id}.json`),
                    JSON.stringify(visit, null, 1),
                  );
                }
              } else {
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                await writeFile(
                  join(visitLogDir, `visit-${stamp}.json`),
                  JSON.stringify(body, null, 1),
                );
              }
              response.statusCode = 204;
            } catch {
              response.statusCode = 400;
            }
            response.end();
          })();
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [devVisitLog()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tools/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tools/lint/fixture/**", "node_modules/**"],
  },
});

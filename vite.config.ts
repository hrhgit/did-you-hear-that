import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const visitLogDir = join(import.meta.dirname, "logs", "visits");
/** The largest body the dev visit log reads: a few hundred visits, far beyond a real archive. */
const visitLogBodyMaxBytes = 20 * 1024 * 1024;
const visitLogKinds = new Set(["finished", "saved"]);

/**
 * Development only: writes what `src/ui/visit/send-dev-visit-log.ts` sends into `logs/visits/`
 * (ignored by git, and never served: see `server.fs.deny`). A finished visit gets its own file
 * named by the time it arrived; each saved visit is written as `saved-<id>.json`, so loading the
 * page again only overwrites it. Only JSON from the dev server's own page is taken: another site
 * cannot send JSON without a preflight this endpoint never approves, and its Origin is refused.
 */
function devVisitLog(): Plugin {
  return {
    name: "dev-visit-log",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev-visit-log", (request, response) => {
        const refuse = (statusCode: number): void => {
          response.statusCode = statusCode;
          response.end();
        };
        if (request.method !== "POST") return refuse(405);
        const { origin, host } = request.headers;
        if (origin !== undefined && new URL(origin).host !== host) {
          return refuse(403);
        }
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          return refuse(415);
        }
        const kind = new URL(request.url ?? "", "http://x").searchParams.get(
          "kind",
        );
        if (kind === null || !visitLogKinds.has(kind)) return refuse(400);
        const chunks: Buffer[] = [];
        let byteCount = 0;
        request.on("data", (chunk: Buffer) => {
          byteCount += chunk.length;
          if (byteCount > visitLogBodyMaxBytes) {
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        request.on("end", () => {
          void (async () => {
            try {
              const body: unknown = JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
              );
              await mkdir(visitLogDir, { recursive: true });
              if (kind === "saved") {
                if (
                  !Array.isArray(body) ||
                  !body.every(
                    (visit: unknown) =>
                      typeof visit === "object" &&
                      visit !== null &&
                      typeof (visit as { savedVisitId?: unknown })
                        .savedVisitId === "string",
                  )
                ) {
                  return refuse(400);
                }
                for (const visit of body as { savedVisitId: string }[]) {
                  const id = visit.savedVisitId.replace(/[^\w-]/g, "_");
                  await writeFile(
                    join(visitLogDir, `saved-${id}.json`),
                    JSON.stringify(visit, null, 1),
                  );
                }
              } else {
                if (typeof body !== "object" || body === null) {
                  return refuse(400);
                }
                const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                // A unique name, created only if new, so two visits never share a file.
                await writeFile(
                  join(visitLogDir, `visit-${stamp}-${randomUUID()}.json`),
                  JSON.stringify(body, null, 1),
                  { flag: "wx" },
                );
              }
              refuse(204);
            } catch {
              refuse(400);
            }
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
  server: {
    // Vite's own defaults, and the visit logs, which hold hearing results.
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/logs/**",
      ],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tools/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tools/lint/fixture/**", "node_modules/**"],
  },
});

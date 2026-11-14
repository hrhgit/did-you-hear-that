import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

/** Every directory of the layout in `structure.md` (R1.1). */
const layoutDirectories = [
  "src",
  "src/config",
  "src/engine",
  "src/audio",
  "src/audio/synth",
  "src/audio/output",
  "src/session",
  "src/ui",
  "src/storage",
  "src/copy",
  "src/robot",
  "tests",
  "tests/listeners",
  "tests/properties",
  "tests/e2e",
  "tools",
  "docs",
  ".kiro",
];

/**
 * The module directories under `src/` (R1.5). `src/audio` is not one of them. Tests may not
 * import from `tools/`, so this repeats the paths of `tools/lint/module-dependencies.js`.
 */
const moduleDirectories = [
  "src/config",
  "src/engine",
  "src/audio/synth",
  "src/audio/output",
  "src/session",
  "src/ui",
  "src/storage",
  "src/copy",
  "src/robot",
];

/** The one TypeScript file allowed under `src/` outside every module. */
const entryFile = "src/main.ts";

/** Paths under `.kiro/` that no ignore rule may match (R14.2). */
const kiroPaths = [
  ".kiro/steering/product.md",
  ".kiro/specs/project-scaffold/tasks.md",
  ".kiro/settings/cli.json",
  ".kiro/hooks/example.kiro.hook",
  ".kiro/agents/example.json",
];

const licencesTableHeader = "| Asset | Kind | Source | Licence |";
const tableSeparatorRow = /^\|(\s*:?-+:?\s*\|){4}$/;

/** Lists every file under `directory`, as paths relative to the repository root with `/`. */
function listFiles(directory: string): string[] {
  return readdirSync(path.join(repositoryRoot, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(repositoryRoot, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();
}

describe("repository layout", () => {
  it("has every layout directory, each with a README.md", () => {
    const missing = layoutDirectories.filter((directory) => {
      const absolute = path.join(repositoryRoot, directory);
      return !(
        existsSync(absolute) &&
        statSync(absolute).isDirectory() &&
        existsSync(path.join(absolute, "README.md"))
      );
    });
    expect(missing, "layout directories without a README.md").toEqual([]);
  });

  it("has no TypeScript file under src/ outside a module, apart from src/main.ts", () => {
    const outside = listFiles("src").filter(
      (file) =>
        /\.[cm]?tsx?$/.test(file) &&
        file !== entryFile &&
        !moduleDirectories.some((directory) =>
          file.startsWith(`${directory}/`),
        ),
    );
    expect(outside, "TypeScript files outside every module").toEqual([]);
  });
});

describe("package.json", () => {
  it("declares no runtime dependencies", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(
      Object.keys(packageJson.dependencies ?? {}),
      "entries under dependencies in package.json (use devDependencies)",
    ).toEqual([]);
  });
});

describe("ignore rules", () => {
  it("ignores no path under .kiro/", () => {
    const ignored = kiroPaths.flatMap((kiroPath) => {
      const result = spawnSync(
        "git",
        ["check-ignore", "--no-index", "--verbose", kiroPath],
        { cwd: repositoryRoot, encoding: "utf8" },
      );
      if (result.error !== undefined) {
        throw result.error;
      }
      if (result.status === 1) {
        return [];
      }
      if (result.status === 0) {
        // --verbose prints "<source>:<line>:<pattern>\t<path>" for the rule that matched.
        return [`${kiroPath} is ignored by ${result.stdout.trim()}`];
      }
      throw new Error(
        `git check-ignore exited with ${String(result.status)} for ${kiroPath}: ${result.stderr.trim()}`,
      );
    });
    expect(ignored, ".kiro paths matched by an ignore rule").toEqual([]);
  });
});

describe("docs/licences.md", () => {
  const lines = readFileSync(
    path.join(repositoryRoot, "docs", "licences.md"),
    "utf8",
  )
    .split(/\r?\n/)
    .map((line) => line.trim());

  it("starts with a level 1 heading", () => {
    const firstLine = lines.find((line) => line !== "");
    expect(firstLine, "first line of docs/licences.md").toMatch(/^# \S/);
  });

  it("has the table header with its separator row", () => {
    const headerIndex = lines.indexOf(licencesTableHeader);
    expect(
      headerIndex,
      `line "${licencesTableHeader}" in docs/licences.md`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      lines[headerIndex + 1],
      "separator row under the table header in docs/licences.md",
    ).toMatch(tableSeparatorRow);
  });
});

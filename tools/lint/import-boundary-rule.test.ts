import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import { ESLint, type Linter } from "eslint";
import path from "node:path";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { createImportBoundaryRule } from "./import-boundary-rule.js";
import { moduleDependencies } from "./module-dependencies.js";

const fixtureRoot = path.join(import.meta.dirname, "fixture");
const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const ruleId = "import-x/no-restricted-paths";

interface Location {
  name: string;
  /** Directory of the location, relative to the root it lives in. */
  directory: string;
  /** The file a probe in this location is linted as. */
  probeFile: string;
  /** The file a probe imports to reach this location, without its extension. */
  importTarget: string;
}

const locations: Location[] = [
  ...moduleDependencies.map((entry) =>
    entry.path.endsWith(".ts")
      ? {
          name: entry.name,
          directory: path.posix.dirname(entry.path),
          probeFile: entry.path,
          importTarget: entry.path.slice(0, -".ts".length),
        }
      : {
          name: entry.name,
          directory: entry.path,
          probeFile: `${entry.path}/probe.ts`,
          importTarget: `${entry.path}/stub`,
        },
  ),
  {
    name: "tests",
    directory: "tests",
    probeFile: "tests/probe.ts",
    importTarget: "tests/stub",
  },
  {
    name: "tools",
    directory: "tools",
    probeFile: "tools/probe.ts",
    importTarget: "tools/stub",
  },
];

function locationNamed(name: string): Location {
  const location = locations.find((candidate) => candidate.name === name);
  if (location === undefined) {
    throw new Error(`No location named ${name}`);
  }
  return location;
}

function specifierFrom(importer: Location, target: Location): string {
  const relative = path.posix.relative(importer.directory, target.importTarget);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

const srcModuleNames = new Set(moduleDependencies.map((entry) => entry.name));

/**
 * The pairs that R6.3 to R6.6 forbid. It reads `mayImport` from the table, which the first test
 * pins against R6.3, and states the tests, tools and robot rules itself.
 */
function isForbidden(importer: string, target: string): boolean {
  if (importer === target) {
    return false;
  }
  // R6.6: nothing outside src/robot imports from it.
  if (target === "robot") {
    return true;
  }
  // R6.5: tests and tools stay apart, and nothing under src imports either.
  if (target === "tests" || target === "tools") {
    return true;
  }
  if (importer === "tests" || importer === "tools") {
    return false;
  }
  // R6.3 and R6.4.
  const entry = moduleDependencies.find(
    (candidate) => candidate.name === importer,
  );
  if (entry === undefined || !srcModuleNames.has(target)) {
    throw new Error(`Unexpected pair ${importer} -> ${target}`);
  }
  return !entry.mayImport.includes(target);
}

function createFixtureLinter(): ESLint {
  const config: Linter.Config[] = [
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser as Linter.Parser },
      plugins: { "import-x": importX as unknown as ESLint.Plugin },
      settings: {
        "import-x/resolver-next": [createTypeScriptImportResolver()],
      },
      rules: { [ruleId]: createImportBoundaryRule(fixtureRoot) },
    },
  ];
  return new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: config,
  });
}

async function boundaryMessages(
  linter: ESLint,
  root: string,
  probeFile: string,
  code: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await linter.lintText(code, {
    filePath: path.join(root, probeFile),
  });
  if (result === undefined) {
    throw new Error("ESLint returned no result");
  }
  const fatal = result.messages.filter((message) => message.fatal === true);
  expect(fatal).toEqual([]);
  return result.messages.filter((message) => message.ruleId === ruleId);
}

describe("module dependency table", () => {
  it("matches the table in R6.3", () => {
    expect(
      moduleDependencies.map((entry) => [
        entry.name,
        entry.path,
        [...entry.mayImport].sort(),
      ]),
    ).toEqual([
      ["config", "src/config", []],
      ["engine", "src/engine", ["config"]],
      ["audio/synth", "src/audio/synth", ["config"]],
      ["audio/output", "src/audio/output", ["audio/synth", "config"]],
      [
        "session",
        "src/session",
        ["audio/output", "config", "copy", "engine", "storage"],
      ],
      ["ui", "src/ui", ["config", "copy", "session"]],
      ["storage", "src/storage", ["config"]],
      ["copy", "src/copy", ["config"]],
      ["robot", "src/robot", ["config", "session"]],
      ["main", "src/main.ts", ["config", "ui"]],
    ]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(moduleDependencies)).toBe(true);
    for (const entry of moduleDependencies) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.mayImport)).toBe(true);
    }
  });
});

describe("import boundary rule on the fixture", () => {
  const linter = createFixtureLinter();
  const pairs = locations.flatMap((importer) =>
    locations.map((target) => ({
      importer,
      target,
      forbidden: isForbidden(importer.name, target.name),
    })),
  );

  it("covers all 144 ordered pairs of the 12 locations", () => {
    expect(locations).toHaveLength(12);
    expect(pairs).toHaveLength(144);
  });

  it.each(
    pairs.map((pair) => [
      pair.importer.name,
      pair.target.name,
      pair.forbidden,
      pair,
    ]),
  )(
    "%s importing %s is forbidden: %s",
    async (_importerName, _targetName, forbidden, { importer, target }) => {
      const messages = await boundaryMessages(
        linter,
        fixtureRoot,
        importer.probeFile,
        `import { stub } from "${specifierFrom(importer, target)}";\nexport const probe = stub;\n`,
      );
      if (forbidden) {
        expect(messages.length).toBeGreaterThan(0);
      } else {
        expect(messages).toEqual([]);
      }
    },
  );

  it("names the allowed modules in the message", async () => {
    const engine = locationNamed("engine");
    const messages = await boundaryMessages(
      linter,
      fixtureRoot,
      engine.probeFile,
      `import { stub } from "${specifierFrom(engine, locationNamed("ui"))}";\n`,
    );
    expect(messages.map((message) => message.message)).toEqual([
      expect.stringContaining("engine may import only from: itself, config"),
    ]);
  });

  describe("other forms of a forbidden import from engine to ui", () => {
    const engine = locationNamed("engine");
    const specifier = specifierFrom(engine, locationNamed("ui"));

    it.each([
      [
        "a type-only import",
        `import type { stub } from "${specifier}";\nexport type Probe = typeof stub;\n`,
      ],
      [
        "an inline type import",
        `import { type stub } from "${specifier}";\nexport type Probe = typeof stub;\n`,
      ],
      ["a named re-export", `export { stub } from "${specifier}";\n`],
      ["a type-only re-export", `export type { stub } from "${specifier}";\n`],
      ["a star re-export", `export * from "${specifier}";\n`],
      ["a namespace re-export", `export * as probe from "${specifier}";\n`],
      ["a dynamic import()", `export const probe = import("${specifier}");\n`],
      ["a side-effect import", `import "${specifier}";\n`],
    ])("reports %s", async (_form, code) => {
      const messages = await boundaryMessages(
        linter,
        fixtureRoot,
        engine.probeFile,
        code,
      );
      expect(messages.length).toBeGreaterThan(0);
    });
  });
});

describe("import boundary rule in the repository configuration", () => {
  const linter = new ESLint({ cwd: repositoryRoot });

  it("reports a file in src/engine that imports from src/ui", async () => {
    const messages = await boundaryMessages(
      linter,
      repositoryRoot,
      "src/engine/probe.ts",
      'import { startVisit } from "../ui/visit/start-visit";\nexport const probe = startVisit;\n',
    );
    expect(messages.map((message) => message.message)).toEqual([
      expect.stringContaining("engine may import only from: itself, config"),
    ]);
  });

  it("allows a file in src/ui to import from src/copy", async () => {
    const messages = await boundaryMessages(
      linter,
      repositoryRoot,
      "src/ui/probe.ts",
      'import { siteTitle } from "../copy/site-title";\nexport const probe = siteTitle;\n',
    );
    expect(messages).toEqual([]);
  });

  it("reports a relative typeof import() type, which the boundary rule cannot see", async () => {
    const [result] = await linter.lintText(
      'export type Probe = typeof import("../ui/visit/start-visit");\n',
      { filePath: path.join(repositoryRoot, "src/engine/probe.ts") },
    );
    expect(result?.messages.map((message) => message.ruleId)).toEqual([
      "no-restricted-syntax",
    ]);
    expect(result?.messages[0]?.message).toContain("import type");
  });
});

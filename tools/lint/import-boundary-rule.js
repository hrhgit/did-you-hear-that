import path from "node:path";
import { moduleDependencies } from "./module-dependencies.js";

/**
 * @typedef {object} RestrictedZone
 * @property {string | string[]} target Files the zone applies to, relative to `basePath`.
 * @property {string} from Files those may not import, relative to `basePath`.
 * @property {string[]} [except] Paths under `from` that stay allowed, relative to `from`.
 * @property {string} message Added to the error, naming what is allowed.
 */

/**
 * Builds the `import-x/no-restricted-paths` setting from the module dependency table.
 *
 * Each module gets one zone that forbids everything under `src/` except itself and the modules
 * it may import. Four more zones keep `src`, `tests` and `tools` apart, and one keeps `tests` and
 * `tools` out of `src/robot` (design.md, D5, D6 and D36). The same function serves
 * `eslint.config.js`, with the repository root as `basePath`, and the fixture test, with the
 * fixture root, so the test checks the shipped rule.
 *
 * @param {string} basePath Absolute path that the zone paths are resolved against.
 * @returns {["error", { basePath: string, zones: RestrictedZone[] }]}
 */
export function createImportBoundaryRule(basePath) {
  /** @param {string} name */
  const pathOf = (name) => {
    const entry = moduleDependencies.find(
      (candidate) => candidate.name === name,
    );
    if (entry === undefined) {
      throw new Error(
        `The module dependency table names an unknown module "${name}".`,
      );
    }
    return entry.path;
  };
  /** @param {string} modulePath */
  const relativeToSrc = (modulePath) => path.posix.relative("src", modulePath);

  /** @type {RestrictedZone[]} */
  const moduleZones = moduleDependencies.map((entry) => ({
    target: `./${entry.path}`,
    from: "./src",
    except: [entry.path, ...entry.mayImport.map(pathOf)].map(relativeToSrc),
    message: `${entry.name} may import only from: ${
      entry.mayImport.length === 0
        ? "itself"
        : `itself, ${entry.mayImport.join(", ")}`
    } (structure.md, Dependency rules).`,
  }));

  /** @type {RestrictedZone[]} */
  const separationZones = [
    {
      target: "./src",
      from: "./tests",
      message:
        "Nothing under src may import from tests (structure.md, Dependency rules).",
    },
    {
      target: "./src",
      from: "./tools",
      message:
        "Nothing under src may import from tools (structure.md, Dependency rules).",
    },
    {
      target: "./tools",
      from: "./tests",
      message:
        "tools may not import from tests (structure.md, Dependency rules).",
    },
    {
      target: "./tests",
      from: "./tools",
      message:
        "tests may not import from tools (structure.md, Dependency rules).",
    },
    {
      target: ["./tests", "./tools"],
      from: `./${pathOf("robot")}`,
      message:
        "Nothing outside src/robot may import it. The page loads it only in robot mode (structure.md, Dependency rules).",
    },
  ];

  return ["error", { basePath, zones: [...moduleZones, ...separationZones] }];
}

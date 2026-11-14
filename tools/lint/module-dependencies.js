/**
 * The module dependency table from `.kiro/steering/structure.md`, closed for the modules it
 * leaves open (design.md, D6). This is the one place the table is stored: `eslint.config.js`
 * and the lint fixture test both read it.
 *
 * `path` is relative to the repository root. `mayImport` lists module names, not paths. A
 * module may always import from itself.
 */

/**
 * @typedef {object} ModuleDependency
 * @property {string} name The module name used in messages and in `mayImport`.
 * @property {string} path The module directory, or `src/main.ts` for the entry file.
 * @property {readonly string[]} mayImport The other modules this one may import from.
 */

/** @type {ReadonlyArray<Readonly<ModuleDependency>>} */
export const moduleDependencies = Object.freeze(
  /** @type {ModuleDependency[]} */ ([
    { name: "config", path: "src/config", mayImport: [] },
    { name: "engine", path: "src/engine", mayImport: ["config"] },
    { name: "audio/synth", path: "src/audio/synth", mayImport: ["config"] },
    {
      name: "audio/output",
      path: "src/audio/output",
      mayImport: ["config", "audio/synth"],
    },
    {
      name: "session",
      path: "src/session",
      mayImport: ["engine", "audio/output", "storage", "copy", "config"],
    },
    { name: "ui", path: "src/ui", mayImport: ["session", "copy", "config"] },
    { name: "storage", path: "src/storage", mayImport: ["config"] },
    { name: "copy", path: "src/copy", mayImport: ["config"] },
    { name: "robot", path: "src/robot", mayImport: ["session", "config"] },
    { name: "main", path: "src/main.ts", mayImport: ["ui", "config"] },
  ]).map((entry) =>
    Object.freeze({ ...entry, mayImport: Object.freeze([...entry.mayImport]) }),
  ),
);

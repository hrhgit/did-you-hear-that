import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findBannedTerms } from "../src/copy/find-banned-terms";

/** One export whose strings may use some of the terms (result-page design.md, D23). */
export interface CopyCheckExemption {
  /** The file, relative to rootDir, such as "src/copy/limits-statement.ts". */
  readonly file: string;
  /** The export whose strings, at any depth, are exempt. */
  readonly exportName: string;
  /** The terms allowed there. Every other banned term is still reported. */
  readonly allowedTerms: readonly string[];
}

export interface CopyCheckOptions {
  /** Absolute path of the directory whose exported strings are checked. */
  copyDir: string;
  /** The words and phrases no checked string may contain. */
  terms: readonly string[];
  /** Paths in the output are shown relative to this directory. Defaults to the working directory. */
  rootDir?: string;
  /** Exports whose strings may use some of the terms. Defaults to none. */
  exemptions?: readonly CopyCheckExemption[];
}

export interface CopyCheckResult {
  exitCode: 0 | 1;
  lines: string[];
}

interface CheckedString {
  file: string;
  exportPath: string;
  text: string;
}

const prefix = "check:copy:";

function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function toDisplayPath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
}

/** Whether `exportPath` is the export `exportName` itself or a string inside it. */
function isInsideExport(exportPath: string, exportName: string): boolean {
  return (
    exportPath === exportName ||
    exportPath.startsWith(`${exportName}.`) ||
    exportPath.startsWith(`${exportName}[`)
  );
}

/** The terms allowed in one string by the exemptions that match its file and export path. */
function allowedTermsOf(
  entry: CheckedString,
  exemptions: readonly CopyCheckExemption[],
): Set<string> {
  const allowed = new Set<string>();
  for (const exemption of exemptions) {
    if (
      exemption.file === entry.file &&
      isInsideExport(entry.exportPath, exemption.exportName)
    ) {
      for (const term of exemption.allowedTerms) {
        allowed.add(term);
      }
    }
  }
  return allowed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Collects every string reachable from one export through arrays and plain objects, and counts
 * the functions it meets without calling them.
 */
function walkExport(
  value: unknown,
  exportPath: string,
  seen: Set<object>,
  onString: (exportPath: string, text: string) => void,
  onFunction: () => void,
): void {
  if (typeof value === "string") {
    onString(exportPath, value);
  } else if (typeof value === "function") {
    onFunction();
  } else if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((element, index) =>
      walkExport(
        element,
        `${exportPath}[${index}]`,
        seen,
        onString,
        onFunction,
      ),
    );
  } else if (isPlainObject(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, property] of Object.entries(value)) {
      walkExport(property, `${exportPath}.${key}`, seen, onString, onFunction);
    }
  }
}

/**
 * Imports every TypeScript file under `copyDir` (tests excluded), checks every exported string,
 * including strings inside exported arrays and plain objects, against `terms`, and returns the
 * lines to print and the exit code. Function exports are counted and never called. A string inside
 * an export named by an exemption is checked against the terms without that exemption's allowed
 * terms, and the summary line then says how many strings an exemption applied to.
 */
export async function runCopyCheck(
  options: CopyCheckOptions,
): Promise<CopyCheckResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const exemptions = options.exemptions ?? [];
  const copyDirDisplay = toDisplayPath(rootDir, options.copyDir);
  const files = await listSourceFiles(options.copyDir);

  const strings: CheckedString[] = [];
  let functionCount = 0;
  for (const file of files) {
    const fileDisplay = toDisplayPath(rootDir, file);
    const exports = (await import(pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    const seen = new Set<object>();
    for (const name of Object.keys(exports).sort()) {
      walkExport(
        exports[name],
        name,
        seen,
        (exportPath, text) =>
          strings.push({ file: fileDisplay, exportPath, text }),
        () => {
          functionCount += 1;
        },
      );
    }
  }

  const lines: string[] = [];
  let exitCode: 0 | 1 = 0;
  if (strings.length === 0) {
    lines.push(
      `${prefix} ${copyDirDisplay} exports no strings yet. Nothing to check.`,
    );
  } else {
    const fileCount = new Set(strings.map((entry) => entry.file)).size;
    let matchCount = 0;
    let exemptStringCount = 0;
    for (const entry of strings) {
      const allowed = allowedTermsOf(entry, exemptions);
      if (allowed.size > 0) {
        exemptStringCount += 1;
      }
      const terms =
        allowed.size === 0
          ? options.terms
          : options.terms.filter((term) => !allowed.has(term));
      for (const term of findBannedTerms(entry.text, terms)) {
        matchCount += 1;
        lines.push(
          `${prefix} ${entry.file} export "${entry.exportPath}" contains banned term "${term}"`,
        );
      }
    }
    const exempted =
      exemptStringCount === 0
        ? ""
        : ` An exemption applied to ${plural(exemptStringCount, "string")}.`;
    const checked = `checked ${plural(strings.length, "string")} in ${plural(fileCount, "file")} against ${plural(options.terms.length, "banned term")}.${exempted}`;
    if (matchCount === 0) {
      lines.push(`${prefix} ${checked} No banned terms found.`);
    } else {
      exitCode = 1;
      lines.push(
        `${prefix} ${checked} Found ${plural(matchCount, "banned term")}.`,
      );
    }
  }
  if (functionCount > 0) {
    lines.push(
      `${prefix} ${plural(functionCount, "function export")} ${functionCount === 1 ? "was" : "were"} not evaluated. Generated text needs its own property test.`,
    );
  }
  return { exitCode, lines };
}

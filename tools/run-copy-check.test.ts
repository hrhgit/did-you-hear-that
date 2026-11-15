import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bannedTerms,
  limitsStatementAllowedTerms,
} from "../src/config/banned-terms";
import type { CopyCheckExemption } from "./run-copy-check";
import { runCopyCheck } from "./run-copy-check";

let rootDir: string;
let copyDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "run-copy-check-"));
  copyDir = path.join(rootDir, "src", "copy");
  await mkdir(copyDir, { recursive: true });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

async function writeCopyFile(
  relativePath: string,
  source: string,
): Promise<void> {
  const file = path.join(copyDir, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source);
}

function check(exemptions?: readonly CopyCheckExemption[]) {
  return runCopyCheck({ copyDir, terms: bannedTerms, rootDir, exemptions });
}

const statementExemption: CopyCheckExemption = {
  file: "src/copy/statement.ts",
  exportName: "statement",
  allowedTerms: limitsStatementAllowedTerms,
};

describe("runCopyCheck", () => {
  it("says there is nothing to check when there are no files", async () => {
    expect(await check()).toEqual({
      exitCode: 0,
      lines: ["check:copy: src/copy exports no strings yet. Nothing to check."],
    });
  });

  it("says there is nothing to check when no file exports a string", async () => {
    await writeCopyFile(
      "numbers.ts",
      "export const count = 3;\nexport type Label = string;\n",
    );
    await writeCopyFile(
      "README.md",
      "This file mentions loss but is not code.\n",
    );
    expect(await check()).toEqual({
      exitCode: 0,
      lines: ["check:copy: src/copy exports no strings yet. Nothing to check."],
    });
  });

  it("reports what it checked when every string is clean", async () => {
    await writeCopyFile(
      "site-title.ts",
      'export const siteTitle = "Did You Hear That?";\n',
    );
    await writeCopyFile(
      "house-not-open-line.ts",
      'export const houseNotOpenLine = "The house is not open yet.";\n',
    );
    expect(await check()).toEqual({
      exitCode: 0,
      lines: [
        "check:copy: checked 2 strings in 2 files against 24 banned terms. No banned terms found.",
      ],
    });
  });

  it("skips test files", async () => {
    await writeCopyFile("line.ts", 'export const line = "A calm line.";\n');
    await writeCopyFile(
      "line.test.ts",
      'export const sample = "a normal sample";\n',
    );
    expect(await check()).toEqual({
      exitCode: 0,
      lines: [
        "check:copy: checked 1 string in 1 file against 24 banned terms. No banned terms found.",
      ],
    });
  });

  it("names the file, export path and term of a banned word inside nested arrays and objects", async () => {
    await writeCopyFile(
      "aaa-clean.ts",
      'export const greeting = "Come in.";\n',
    );
    await writeCopyFile(
      "rooms/labels.ts",
      [
        "export const labels = {",
        '  left: "Left wing",',
        '  floors: ["Cellar", { name: "Attic", note: "Your hearing is normal here." }],',
        "};",
        'export const lines = ["One", "No loss and no failing."];',
        "",
      ].join("\n"),
    );
    expect(await check()).toEqual({
      exitCode: 1,
      lines: [
        'check:copy: src/copy/rooms/labels.ts export "labels.floors[1].note" contains banned term "normal"',
        'check:copy: src/copy/rooms/labels.ts export "lines[1]" contains banned term "loss"',
        'check:copy: src/copy/rooms/labels.ts export "lines[1]" contains banned term "fail"',
        "check:copy: checked 7 strings in 2 files against 24 banned terms. Found 3 banned terms.",
      ],
    });
  });

  it("counts a function export without calling it", async () => {
    await writeCopyFile("line.ts", 'export const line = "A calm line.";\n');
    await writeCopyFile(
      "build-line.ts",
      [
        "// Calling this export would throw and fail the check.",
        "export function buildLine(): string {",
        '  throw new Error("must not be called");',
        "}",
        "",
      ].join("\n"),
    );
    expect(await check()).toEqual({
      exitCode: 0,
      lines: [
        "check:copy: checked 1 string in 1 file against 24 banned terms. No banned terms found.",
        "check:copy: 1 function export was not evaluated. Generated text needs its own property test.",
      ],
    });
  });

  it("counts functions inside objects and reports them in the plural", async () => {
    await writeCopyFile(
      "builders.ts",
      "export const builders = { a: () => 'x', b: [() => 'y'] };\nexport const c = () => 'z';\n",
    );
    expect(await check()).toEqual({
      exitCode: 0,
      lines: [
        "check:copy: src/copy exports no strings yet. Nothing to check.",
        "check:copy: 3 function exports were not evaluated. Generated text needs its own property test.",
      ],
    });
  });
});

describe("runCopyCheck with an exemption (result-page D23)", () => {
  it("lets the exempt export use an allowed term", async () => {
    await writeCopyFile(
      "statement.ts",
      [
        "export const statement = {",
        '  heading: "What this picture can tell you",',
        '  sentences: ["This is not a diagnosis.", "It has not been checked against clinical equipment."],',
        "};",
        "",
      ].join("\n"),
    );
    expect(await check([statementExemption])).toEqual({
      exitCode: 0,
      lines: [
        "check:copy: checked 3 strings in 1 file against 24 banned terms. An exemption applied to 3 strings. No banned terms found.",
      ],
    });
  });

  it("still reports another banned term in the exempt export", async () => {
    await writeCopyFile(
      "statement.ts",
      [
        "export const statement = {",
        '  sentences: ["This is not a diagnosis.", "Your hearing is normal."],',
        "};",
        "",
      ].join("\n"),
    );
    expect(await check([statementExemption])).toEqual({
      exitCode: 1,
      lines: [
        'check:copy: src/copy/statement.ts export "statement.sentences[1]" contains banned term "normal"',
        "check:copy: checked 2 strings in 1 file against 24 banned terms. An exemption applied to 2 strings. Found 1 banned term.",
      ],
    });
  });

  it("reports an allowed term in another export of the same file", async () => {
    await writeCopyFile(
      "statement.ts",
      [
        'export const statement = ["This is not a diagnosis."];',
        'export const statementNote = "A clinical note.";',
        'export const other = { line: "Not a diagnosis either." };',
        "",
      ].join("\n"),
    );
    expect(await check([statementExemption])).toEqual({
      exitCode: 1,
      lines: [
        'check:copy: src/copy/statement.ts export "other.line" contains banned term "diagnosis"',
        'check:copy: src/copy/statement.ts export "statementNote" contains banned term "clinical"',
        "check:copy: checked 3 strings in 1 file against 24 banned terms. An exemption applied to 1 string. Found 2 banned terms.",
      ],
    });
  });

  it("changes nothing when its file does not exist", async () => {
    await writeCopyFile(
      "lines.ts",
      'export const statement = ["A calm line.", "Not a diagnosis."];\n',
    );
    const without = await check();
    expect(
      await check([
        statementExemption,
        { ...statementExemption, file: "src/copy/missing.ts" },
      ]),
    ).toEqual(without);
    expect(without).toEqual({
      exitCode: 1,
      lines: [
        'check:copy: src/copy/lines.ts export "statement[1]" contains banned term "diagnosis"',
        "check:copy: checked 2 strings in 1 file against 24 banned terms. Found 1 banned term.",
      ],
    });
  });
});

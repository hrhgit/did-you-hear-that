import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Checks the copy check hook file against the result-page design ("The copy hook", R19, D24).
// Kiro reads the file. This test cannot show the hook firing, which needs a new session (D24).

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const hooksDir = path.join(repositoryRoot, ".kiro", "hooks");

interface HookFile {
  readonly version: unknown;
  readonly hooks: readonly Record<string, unknown>[];
}

function readHookFile(name: string): HookFile {
  return JSON.parse(
    readFileSync(path.join(hooksDir, name), "utf8"),
  ) as HookFile;
}

const hookFile = readHookFile("copy-check-on-copy-save.json");
const hook = hookFile.hooks[0];
const matcher = String(hook.matcher);
const renderHook = readHookFile("render-check-on-synth-save.json").hooks[0];

describe("the copy check hook", () => {
  it("is a v1 standalone hook file with one hook", () => {
    expect(hookFile.version).toBe("v1");
    expect(Array.isArray(hookFile.hooks)).toBe(true);
    expect(hookFile.hooks).toHaveLength(1);
  });

  it("runs the copy check in hook mode after a file save, with a timeout of 60 seconds", () => {
    expect(hook.name).toBe("Copy check on copy save");
    expect(typeof hook.description).toBe("string");
    expect(hook.trigger).toBe("PostFileSave");
    expect(hook.action).toEqual({
      type: "command",
      command: "npm run --silent check:copy -- --hook",
    });
    expect(hook.timeout).toBe(60);
  });

  it("has no confirmation step and is not turned off", () => {
    expect(hook).not.toHaveProperty("confirm");
    expect(hook.enabled).not.toBe(false);
  });

  it("has exactly the keys of the render check hook", () => {
    expect(Object.keys(hook).sort()).toEqual(Object.keys(renderHook).sort());
    expect(Object.keys(hook).sort()).toEqual(
      ["action", "description", "matcher", "name", "timeout", "trigger"].sort(),
    );
  });

  it("matches every TypeScript file under src/copy, absolute or relative", () => {
    const pattern = new RegExp(matcher);
    for (const filePath of [
      "src/copy/result-lines.ts",
      "src/copy/result-copy.test.ts",
      "src/copy/nested/x.ts",
      "/Users/someone/repo/src/copy/limits-statement.ts",
    ]) {
      expect(pattern.test(filePath), filePath).toBe(true);
    }
  });

  it("matches nothing else", () => {
    const pattern = new RegExp(matcher);
    for (const filePath of [
      "src/config/banned-terms.ts",
      "src/copy/README.md",
      "docs/src/copy.ts",
      "mysrc/copy/x.ts",
      "src/copyx/x.ts",
    ]) {
      expect(pattern.test(filePath), filePath).toBe(false);
    }
  });

  it("uses no regular expression feature that the Rust regex crate lacks (R19.1)", () => {
    // Lookahead and lookbehind, backreferences by number or name, possessive quantifiers and
    // atomic groups.
    const unsupported = [
      /\(\?[=!]/,
      /\(\?<[=!]/,
      /\\[1-9]/,
      /\\k</,
      /[*+?}]\+/,
      /\(\?>/,
    ];
    for (const feature of unsupported) {
      expect(feature.test(matcher), String(feature)).toBe(false);
    }
  });
});

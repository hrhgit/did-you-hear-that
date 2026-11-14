import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Checks the render check hook file against the ghost-sounds design (R14, D18). Kiro reads the
// file. This test cannot show the hook firing, which needs a new session (D19).

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const hookPath = path.join(
  repositoryRoot,
  ".kiro",
  "hooks",
  "render-check-on-synth-save.json",
);

interface HookFile {
  readonly version: unknown;
  readonly hooks: readonly Record<string, unknown>[];
}

const hookFile = JSON.parse(readFileSync(hookPath, "utf8")) as HookFile;
const hook = hookFile.hooks[0];
const matcher = String(hook.matcher);

describe("the render check hook", () => {
  it("is a v1 standalone hook file with one hook", () => {
    expect(hookFile.version).toBe("v1");
    expect(Array.isArray(hookFile.hooks)).toBe(true);
    expect(hookFile.hooks).toHaveLength(1);
  });

  it("runs the render tool in hook mode after a file save, with a timeout of 120 seconds", () => {
    expect(hook.name).toBe("Render check on synthesis save");
    expect(typeof hook.description).toBe("string");
    expect(hook.trigger).toBe("PostFileSave");
    expect(hook.action).toEqual({
      type: "command",
      command: "npm run --silent render:sounds -- --hook",
    });
    expect(hook.timeout).toBe(120);
  });

  it("has no confirmation step and is not turned off", () => {
    expect(hook).not.toHaveProperty("confirm");
    expect(hook.enabled).not.toBe(false);
    expect(Object.keys(hook).sort()).toEqual(
      ["action", "description", "matcher", "name", "timeout", "trigger"].sort(),
    );
  });

  it("matches every synthesis file and the four sound config files, absolute or relative", () => {
    const pattern = new RegExp(matcher);
    for (const filePath of [
      "src/audio/synth/cellar-knock.ts",
      "src/audio/synth/measure/fade-lengths.ts",
      "src/audio/synth/cellar-knock.test.ts",
      "/Users/someone/repo/src/audio/synth/attic-whine.ts",
      "src/config/ghost-sound-config.ts",
      "src/config/audio-safety-config.ts",
      "src/config/sound-rules-config.ts",
      "src/config/sound-id.ts",
      "/Users/someone/repo/src/config/sound-id.ts",
    ]) {
      expect(pattern.test(filePath), filePath).toBe(true);
    }
  });

  it("matches nothing else", () => {
    const pattern = new RegExp(matcher);
    for (const filePath of [
      "src/audio/output/play.ts",
      "src/config/hearing-method-config.ts",
      "src/config/ghost-sound-config.test.ts",
      "src/audio/synth/README.md",
      "docs/src/audio/synth.ts",
      "src/audio/synthesis/x.ts",
      "mysrc/audio/synth/x.ts",
      "src/ui/base.css",
      "tools/render-sounds.ts",
    ]) {
      expect(pattern.test(filePath), filePath).toBe(false);
    }
  });

  it("uses no regular expression feature that the Rust regex crate lacks (R14.4)", () => {
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

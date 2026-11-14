import { describe, expect, it } from "vitest";
import { parseRenderArguments } from "./parse-render-arguments";

describe("parseRenderArguments", () => {
  it("runs the full mode with no arguments", () => {
    expect(parseRenderArguments([])).toEqual({ mode: "full" });
  });

  it("collects one changed path", () => {
    expect(
      parseRenderArguments(["--changed", "src/audio/synth/cellar-knock.ts"]),
    ).toEqual({ mode: "changed", paths: ["src/audio/synth/cellar-knock.ts"] });
  });

  it("collects repeated changed paths in order", () => {
    expect(
      parseRenderArguments([
        "--changed",
        "src/audio/synth/cellar-knock.ts",
        "--changed",
        "src/ui/base.css",
      ]),
    ).toEqual({
      mode: "changed",
      paths: ["src/audio/synth/cellar-knock.ts", "src/ui/base.css"],
    });
  });

  it("runs the hook mode with --hook alone", () => {
    expect(parseRenderArguments(["--hook"])).toEqual({ mode: "hook" });
  });

  it("refuses --hook with another argument", () => {
    expect(parseRenderArguments(["--hook", "--hook"]).mode).toBe("invalid");
    expect(
      parseRenderArguments(["--changed", "src/config/sound-id.ts", "--hook"]),
    ).toEqual({ mode: "invalid", problem: "--hook takes no other argument" });
  });

  it("refuses an unknown argument and names it", () => {
    expect(parseRenderArguments(["--report"])).toEqual({
      mode: "invalid",
      problem: 'unknown argument "--report"',
    });
    expect(parseRenderArguments(["src/audio/synth/fft.ts"])).toEqual({
      mode: "invalid",
      problem: 'unknown argument "src/audio/synth/fft.ts"',
    });
    expect(
      parseRenderArguments(["--changed", "src/audio/synth/fft.ts", "extra"]),
    ).toEqual({ mode: "invalid", problem: 'unknown argument "extra"' });
  });

  it("refuses --changed without a path", () => {
    const missing = {
      mode: "invalid",
      problem: "--changed needs a path after it",
    };
    expect(parseRenderArguments(["--changed"])).toEqual(missing);
    expect(parseRenderArguments(["--changed", ""])).toEqual(missing);
    expect(parseRenderArguments(["--changed", "--changed", "a.ts"])).toEqual(
      missing,
    );
  });

  it("returns frozen results", () => {
    const parsed = parseRenderArguments(["--changed", "a.ts"]);
    expect(Object.isFrozen(parsed)).toBe(true);
    if (parsed.mode === "changed") {
      expect(Object.isFrozen(parsed.paths)).toBe(true);
    }
  });
});

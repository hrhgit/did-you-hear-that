import { describe, expect, it } from "vitest";
import { hookEventPaths } from "./hook-event-paths";

function pathsOf(event: unknown) {
  return hookEventPaths(JSON.stringify(event));
}

describe("hookEventPaths", () => {
  it("finds a path at the top level of the event", () => {
    expect(pathsOf({ path: "src/audio/synth/attic-whine.ts" })).toEqual({
      kind: "paths",
      paths: ["src/audio/synth/attic-whine.ts"],
    });
  });

  it("finds a path at any depth and under any key", () => {
    expect(
      pathsOf({
        hook_event_name: "PostFileSave",
        cwd: "/Users/someone/repo",
        context: {
          session: { id: "abc" },
          file: {
            savedAt: {
              absolute: "/Users/someone/repo/src/config/ghost-sound-config.ts",
            },
          },
        },
      }),
    ).toEqual({
      kind: "paths",
      paths: ["/Users/someone/repo/src/config/ghost-sound-config.ts"],
    });
  });

  it("finds paths inside arrays, in document order, each once", () => {
    expect(
      pathsOf({
        files: [
          "src/audio/synth/cellar-knock.ts",
          { name: "src\\audio\\synth\\measure\\fade-lengths.ts" },
          [["src/config/sound-id.ts"]],
          "src/audio/synth/cellar-knock.ts",
          "src/ui/base.css",
        ],
      }),
    ).toEqual({
      kind: "paths",
      paths: [
        "src/audio/synth/cellar-knock.ts",
        "src\\audio\\synth\\measure\\fade-lengths.ts",
        "src/config/sound-id.ts",
      ],
    });
  });

  it("finds a path when the whole event is one string", () => {
    expect(pathsOf("src/audio/synth/fft.ts")).toEqual({
      kind: "paths",
      paths: ["src/audio/synth/fft.ts"],
    });
  });

  it("does not collect keys", () => {
    expect(pathsOf({ "src/audio/synth/fft.ts": true })).toEqual({
      kind: "none",
      reason: "noPath",
    });
  });

  it("names the reason when there is no input", () => {
    expect(hookEventPaths(undefined)).toEqual({
      kind: "none",
      reason: "noInput",
    });
  });

  it("names the reason for empty input", () => {
    expect(hookEventPaths("")).toEqual({ kind: "none", reason: "empty" });
    expect(hookEventPaths("  \n\t")).toEqual({ kind: "none", reason: "empty" });
  });

  it("names the reason for input that is not JSON", () => {
    expect(hookEventPaths("src/audio/synth/fft.ts")).toEqual({
      kind: "none",
      reason: "notJson",
    });
    expect(hookEventPaths('{"path": ')).toEqual({
      kind: "none",
      reason: "notJson",
    });
  });

  it("names the reason for an event without a sound path", () => {
    for (const event of [
      {},
      [],
      null,
      42,
      { path: "src/ui/base.css" },
      { path: "src/config/hearing-method-config.ts", other: [1, true, null] },
      { path: "src/audio/synthesis/x.ts" },
    ]) {
      expect(pathsOf(event)).toEqual({ kind: "none", reason: "noPath" });
    }
  });

  it("survives a deeply nested event", () => {
    const depth = 20000;
    const event = `${"[".repeat(depth)}"src/audio/synth/attic-whine.ts"${"]".repeat(depth)}`;
    expect(hookEventPaths(event)).toEqual({
      kind: "paths",
      paths: ["src/audio/synth/attic-whine.ts"],
    });
  });
});

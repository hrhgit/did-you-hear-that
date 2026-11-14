import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "../src/config/audio-safety-config";
import { soundIds } from "../src/config/sound-id";
import type { SoundRenderInput } from "./run-sound-render";
import { runSoundRender } from "./run-sound-render";
import type { Renderers } from "./sound-render/injected-renderers";
import {
  bandBreakingRenderers,
  countingRenderers,
  fadeSkippingRenderers,
  goodRenderers,
  thrownMessage,
  throwingRenderers,
} from "./sound-render/injected-renderers";

const witnessLogPath = "/tmp/did-you-hear-that-hook-runs.log";
const nowIso = "2026-11-20T10:00:00.000Z";
const timeout = 60_000;

function run(
  args: readonly string[],
  renderers: Renderers,
  hookInput?: string,
) {
  const input: SoundRenderInput = {
    arguments: args,
    hookInput,
    nowIso,
    witnessLogPath,
    renderers,
  };
  return runSoundRender(input);
}

const summary = (soundId: string) =>
  `render:sounds: ${soundId}: every rule met at 44100 Hz and 48000 Hz over 10 seeds.`;

const atticEvent = JSON.stringify({ path: "src/audio/synth/attic-whine.ts" });

describe("runSoundRender, full mode", () => {
  it(
    "prints one summary line per sound, returns the report and exits 0 when every rule is met",
    () => {
      const result = run([], goodRenderers);
      expect(result.exitCode).toBe(0);
      expect(result.stdoutLines).toEqual(soundIds.map(summary));
      expect(result.stderrLines).toEqual([]);
      expect(result.witnessLine).toBeUndefined();
      expect(result.report).toContain("# Ghost sounds report");
      expect(result.report?.match(/\| meets every rule \|/g)).toHaveLength(12);
    },
    timeout,
  );

  it(
    "prints one line per broken band rule, still returns the report and exits 1",
    () => {
      const result = run([], bandBreakingRenderers);
      expect(result.exitCode).toBe(1);
      expect(result.stderrLines).toEqual([]);
      const cellarLines = result.stdoutLines.filter((line) =>
        line.startsWith("render:sounds: cellar at "),
      );
      expect(cellarLines).toHaveLength(20);
      expect(cellarLines[0]).toMatch(
        /^render:sounds: cellar at 44100 Hz, seed 1: out-of-band energy -?\d+\.\d dB, limit -30 dB\.$/,
      );
      expect(result.stdoutLines).toContain(summary("calibration"));
      expect(result.stdoutLines).toHaveLength(5 * 20 + 1);
      expect(result.report).toContain("| breaks: band |");
      expect(result.report).toContain("## Broken rules");
    },
    timeout,
  );

  it(
    "reports a skipped fade as broken fade rules and exits 1",
    () => {
      const result = run([], fadeSkippingRenderers);
      expect(result.exitCode).toBe(1);
      expect(result.stdoutLines).toContain(
        `render:sounds: attic at 48000 Hz, seed 10: fade in 0.0 ms, limit at least ${audioSafetyConfig.fadeMinMs} ms.`,
      );
      expect(
        result.stdoutLines.some((line) =>
          /^render:sounds: attic at 48000 Hz, seed 10: last sample -?0\.\d{6}, limit exactly 0\.$/.test(
            line,
          ),
        ),
      ).toBe(true);
      expect(result.report).toContain("breaks: fade in, fade out");
    },
    timeout,
  );

  it("reports a throwing renderer with the sound, rate, seed and message, and exits 1", () => {
    const result = run([], throwingRenderers);
    expect(result.exitCode).toBe(1);
    expect(result.stdoutLines).toHaveLength(6 * 20);
    expect(result.stdoutLines[0]).toBe(
      "render:sounds: cellar at 44100 Hz, seed 1: the renderer threw an error: the knock planner ran out of knocks.",
    );
    expect(thrownMessage.endsWith(".")).toBe(true);
    expect(result.report).toContain(
      "the renderer threw at seeds 1, 2, 3, 4, 5, 6, 7, 8, 9, 10",
    );
  });
});

describe("runSoundRender, changed-file mode", () => {
  it(
    "checks only the changed sound, writes no report and exits 0",
    () => {
      const counted = countingRenderers(goodRenderers);
      const result = run(
        ["--changed", "src/audio/synth/cellar-knock.ts"],
        counted.renderers,
      );
      expect(result).toEqual({
        exitCode: 0,
        stdoutLines: [summary("cellar")],
        stderrLines: [],
        report: undefined,
        witnessLine: undefined,
      });
      expect(new Set(counted.calls())).toEqual(new Set(["cellar"]));
      expect(counted.calls()).toHaveLength(20);
    },
    timeout,
  );

  it(
    "checks the union of several paths in sound order",
    () => {
      const result = run(
        [
          "--changed",
          "/Users/someone/repo/src/audio/synth/attic-whine-plan.ts",
          "--changed",
          "src/ui/base.css",
          "--changed",
          "src\\audio\\synth\\cellar-knock.test.ts",
        ],
        goodRenderers,
      );
      expect(result.stdoutLines).toEqual([summary("cellar"), summary("attic")]);
      expect(result.exitCode).toBe(0);
    },
    timeout,
  );

  it(
    "prints a broken rule on standard output and exits 1",
    () => {
      const result = run(
        ["--changed", "src/audio/synth/stairs-scrape.ts"],
        bandBreakingRenderers,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderrLines).toEqual([]);
      expect(result.stdoutLines).toHaveLength(20);
      expect(
        result.stdoutLines.every((line) =>
          line.startsWith("render:sounds: stairs at "),
        ),
      ).toBe(true);
      expect(result.report).toBeUndefined();
    },
    timeout,
  );

  it("checks nothing for a path that cannot change a sound, and exits 0", () => {
    const counted = countingRenderers(throwingRenderers);
    expect(run(["--changed", "src/ui/base.css"], counted.renderers)).toEqual({
      exitCode: 0,
      stdoutLines: [
        "render:sounds: src/ui/base.css cannot change a sound. Nothing checked.",
      ],
      stderrLines: [],
      report: undefined,
      witnessLine: undefined,
    });
    expect(counted.calls()).toEqual([]);
  });

  it("reports a throwing renderer and exits 1", () => {
    const result = run(
      ["--changed", "src/audio/synth/nursery-music-box.ts"],
      throwingRenderers,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdoutLines).toHaveLength(20);
    expect(result.stdoutLines[19]).toBe(
      "render:sounds: nursery at 48000 Hz, seed 10: the renderer threw an error: the knock planner ran out of knocks.",
    );
  });
});

describe("runSoundRender, hook mode", () => {
  it(
    "prints one summary line on standard output, returns a witness line and exits 0",
    () => {
      const counted = countingRenderers(goodRenderers);
      const result = run(["--hook"], counted.renderers, atticEvent);
      expect(result.exitCode).toBe(0);
      expect(result.stdoutLines).toEqual([
        `render:sounds: every rule met for attic at 44100 Hz and 48000 Hz over 10 seeds. Witness log: ${witnessLogPath}.`,
      ]);
      expect(result.stderrLines).toEqual([]);
      expect(result.report).toBeUndefined();
      expect(new Set(counted.calls())).toEqual(new Set(["attic"]));
      expect(result.witnessLine).toBeDefined();
      expect(result.witnessLine).not.toContain("\n");
      expect(JSON.parse(result.witnessLine ?? "")).toEqual({
        time: nowIso,
        hookInput: atticEvent,
        paths: ["src/audio/synth/attic-whine.ts"],
        sounds: ["attic"],
        exitCode: 0,
      });
    },
    timeout,
  );

  it(
    "writes every finding to standard error, names the witness log last and exits 1",
    () => {
      const result = run(["--hook"], fadeSkippingRenderers, atticEvent);
      expect(result.exitCode).toBe(1);
      expect(result.stdoutLines).toEqual([]);
      expect(result.stderrLines.length).toBeGreaterThan(20);
      expect(
        result.stderrLines
          .slice(0, -1)
          .every((line) => line.startsWith("render:sounds: attic at ")),
      ).toBe(true);
      expect(result.stderrLines.at(-1)).toBe(
        `render:sounds: witness log: ${witnessLogPath}.`,
      );
      expect(JSON.parse(result.witnessLine ?? "")).toMatchObject({
        sounds: ["attic"],
        exitCode: 1,
      });
      expect(result.report).toBeUndefined();
    },
    timeout,
  );

  it(
    "writes a broken band rule to standard error and exits 1",
    () => {
      const result = run(
        ["--hook"],
        bandBreakingRenderers,
        JSON.stringify({ file: "/repo/src/audio/synth/corridor-hum.ts" }),
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdoutLines).toEqual([]);
      expect(result.stderrLines[0]).toMatch(
        /^render:sounds: corridor at 44100 Hz, seed 1: out-of-band energy/,
      );
    },
    timeout,
  );

  it("writes a throwing renderer to standard error and exits 1", () => {
    const result = run(["--hook"], throwingRenderers, atticEvent);
    expect(result.exitCode).toBe(1);
    expect(result.stdoutLines).toEqual([]);
    expect(result.stderrLines).toHaveLength(21);
    expect(result.stderrLines[0]).toBe(
      "render:sounds: attic at 44100 Hz, seed 1: the renderer threw an error: the knock planner ran out of knocks.",
    );
  });

  it(
    "checks every sound and says why when there is no hook event",
    () => {
      const counted = countingRenderers(goodRenderers);
      const result = run(["--hook"], counted.renderers, undefined);
      expect(result.exitCode).toBe(0);
      expect(result.stdoutLines).toEqual([
        `render:sounds: standard input held no hook event, so every sound is checked. Every rule met for cellar, corridor, nursery, stairs, attic and calibration at 44100 Hz and 48000 Hz over 10 seeds. Witness log: ${witnessLogPath}.`,
      ]);
      expect(new Set(counted.calls())).toEqual(new Set(soundIds));
      expect(JSON.parse(result.witnessLine ?? "")).toEqual({
        time: nowIso,
        hookInput: null,
        paths: [],
        sounds: soundIds,
        exitCode: 0,
      });
    },
    timeout,
  );

  it("checks every sound and says why for empty input, input that is not JSON and input without a path", () => {
    const cases: [string, string][] = [
      ["", "the hook event was empty"],
      ["not json", "the hook event was not valid JSON"],
      [
        JSON.stringify({ path: "src/ui/base.css" }),
        "the hook event held no synthesis or sound config path",
      ],
      [
        JSON.stringify({ path: "mysrc/audio/synth/x.ts" }),
        "no path in the hook event can change a sound",
      ],
    ];
    for (const [hookInput, reason] of cases) {
      const result = run(["--hook"], throwingRenderers, hookInput);
      expect(result.exitCode).toBe(1);
      expect(result.stderrLines[0]).toBe(
        `render:sounds: ${reason}, so every sound is checked.`,
      );
      expect(result.stderrLines).toHaveLength(1 + 6 * 20 + 1);
      expect(JSON.parse(result.witnessLine ?? "")).toMatchObject({
        hookInput,
        sounds: soundIds,
        exitCode: 1,
      });
    }
  });

  it("cuts the hook input in the witness line to 4000 characters", () => {
    const long = JSON.stringify({
      path: "src/audio/synth/attic-whine.ts",
      padding: "x".repeat(5000),
    });
    const result = run(["--hook"], throwingRenderers, long);
    expect(JSON.parse(result.witnessLine ?? "").hookInput).toBe(
      long.slice(0, 4000),
    );

    const emoji = "\u{1F47B}";
    const wide = JSON.stringify({
      path: "src/audio/synth/attic-whine.ts",
      padding: emoji.repeat(4100),
    });
    const wideResult = run(["--hook"], throwingRenderers, wide);
    const kept: string = JSON.parse(wideResult.witnessLine ?? "").hookInput;
    expect([...kept]).toHaveLength(4000);
    expect(wide.startsWith(kept)).toBe(true);
  });
});

describe("runSoundRender, arguments", () => {
  it("prints the usage line on standard error for an unknown argument, checks nothing and exits 1", () => {
    const counted = countingRenderers(goodRenderers);
    expect(run(["--everything"], counted.renderers)).toEqual({
      exitCode: 1,
      stdoutLines: [],
      stderrLines: [
        'render:sounds: unknown argument "--everything". usage: npm run render:sounds [-- --changed <path> [--changed <path> ...] | -- --hook]',
      ],
      report: undefined,
      witnessLine: undefined,
    });
    expect(counted.calls()).toEqual([]);
  });

  it("refuses --changed without a path", () => {
    const result = run(["--changed"], goodRenderers);
    expect(result.exitCode).toBe(1);
    expect(result.stderrLines).toHaveLength(1);
    expect(result.stderrLines[0]).toContain("--changed needs a path after it");
  });
});

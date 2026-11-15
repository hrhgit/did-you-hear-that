import { describe, expect, it } from "vitest";
import { copyCheckStreams } from "./copy-check-streams";
import type { CopyCheckResult } from "./run-copy-check";

const clean: CopyCheckResult = {
  exitCode: 0,
  lines: [
    "check:copy: checked 105 strings in 11 files against 24 banned terms. An exemption applied to 5 strings. No banned terms found.",
    "check:copy: 15 function exports were not evaluated. Generated text needs its own property test.",
  ],
};

const found: CopyCheckResult = {
  exitCode: 1,
  lines: [
    'check:copy: src/copy/rooms/labels.ts export "lines[1]" contains banned term "loss"',
    'check:copy: src/copy/rooms/labels.ts export "lines[1]" contains banned term "fail"',
    "check:copy: checked 7 strings in 2 files against 24 banned terms. Found 2 banned terms.",
    "check:copy: 1 function export was not evaluated. Generated text needs its own property test.",
  ],
};

describe("copyCheckStreams", () => {
  it("puts every line on standard output without hook mode, whatever the exit code", () => {
    for (const result of [clean, found]) {
      expect(copyCheckStreams(result, false)).toEqual({
        stdoutLines: result.lines,
        stderrLines: [],
      });
    }
  });

  it("puts every line on standard error in hook mode when a banned term was found", () => {
    expect(copyCheckStreams(found, true)).toEqual({
      stdoutLines: [],
      stderrLines: found.lines,
    });
  });

  it("puts one line, the summary, on standard output in hook mode when nothing was found", () => {
    expect(copyCheckStreams(clean, true)).toEqual({
      stdoutLines: [clean.lines[0]],
      stderrLines: [],
    });
    const nothingToCheck: CopyCheckResult = {
      exitCode: 0,
      lines: ["check:copy: src/copy exports no strings yet. Nothing to check."],
    };
    expect(copyCheckStreams(nothingToCheck, true)).toEqual({
      stdoutLines: nothingToCheck.lines,
      stderrLines: [],
    });
  });

  it("gives frozen lists and leaves the result as it was", () => {
    const lines = [...clean.lines];
    const streams = copyCheckStreams(clean, true);
    expect(Object.isFrozen(streams)).toBe(true);
    expect(Object.isFrozen(streams.stdoutLines)).toBe(true);
    expect(Object.isFrozen(streams.stderrLines)).toBe(true);
    expect(clean.lines).toEqual(lines);
  });
});

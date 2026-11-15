import type { CopyCheckResult } from "./run-copy-check";

/** The lines of one copy check run, sorted by the stream they are printed on. */
export interface CopyCheckStreams {
  readonly stdoutLines: readonly string[];
  readonly stderrLines: readonly string[];
}

/**
 * Where each line of the copy check goes (result-page design.md, "The copy hook").
 *
 * - Without hook mode: every line on standard output, as `npm run check:copy` has always printed.
 * - In hook mode, when the check found a banned term (exit code 1): every line on standard error,
 *   as the render tool's hook mode does.
 * - In hook mode otherwise: one line on standard output, the check's summary line, which is its
 *   first line when nothing was found.
 */
export function copyCheckStreams(
  result: CopyCheckResult,
  hookMode: boolean,
): CopyCheckStreams {
  if (!hookMode) {
    return Object.freeze({
      stdoutLines: Object.freeze([...result.lines]),
      stderrLines: Object.freeze([]),
    });
  }
  if (result.exitCode === 1) {
    return Object.freeze({
      stdoutLines: Object.freeze([]),
      stderrLines: Object.freeze([...result.lines]),
    });
  }
  return Object.freeze({
    stdoutLines: Object.freeze(result.lines.slice(0, 1)),
    stderrLines: Object.freeze([]),
  });
}

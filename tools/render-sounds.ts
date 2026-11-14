import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSoundRender } from "./run-sound-render";
import { parseRenderArguments } from "./sound-render/parse-render-arguments";

// Renders every ghost sound and the calibration noise offline, checks the sound rules and writes
// docs/reports/sounds.md. Run with `npm run render:sounds`, `npm run render:sounds -- --changed
// <path>` or, from the Kiro hook, `npm run --silent render:sounds -- --hook` (ghost-sounds
// design.md, The render tool). Nothing here plays sound.

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(repositoryRoot, "docs", "reports", "sounds.md");
const witnessLogPath = path.join(
  os.tmpdir(),
  "did-you-hear-that-hook-runs.log",
);

/** Reading stops after this long without data, so an open standard input cannot hang the hook. */
const standardInputIdleMs = 2000;

/** Reads standard input to its end, or until it has been quiet for `idleMs`. */
function readStandardInput(idleMs: number): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      process.stdin.off("data", onData);
      process.stdin.off("end", finish);
      process.stdin.off("error", finish);
      // Release the stream, so a runner that keeps it open does not keep the process alive.
      process.stdin.destroy();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const restartTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, idleMs);
    };
    const onData = (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      restartTimer();
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    restartTimer();
  });
}

const args = process.argv.slice(2);
const isHookMode = parseRenderArguments(args).mode === "hook";
const hookInput =
  isHookMode && process.stdin.isTTY !== true
    ? await readStandardInput(standardInputIdleMs)
    : undefined;

const result = runSoundRender({
  arguments: args,
  hookInput,
  nowIso: new Date().toISOString(),
  witnessLogPath,
});

const stdoutLines = [...result.stdoutLines];
const stderrLines = [...result.stderrLines];

if (result.report !== undefined) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, result.report);
  stdoutLines.push(
    `render:sounds: wrote ${path.relative(repositoryRoot, reportPath).split(path.sep).join("/")}.`,
  );
}

if (result.witnessLine !== undefined) {
  try {
    appendFileSync(witnessLogPath, `${result.witnessLine}\n`);
  } catch (error) {
    // The check's own exit code stands. Only the evidence of the run is missing.
    stderrLines.push(
      `render:sounds: warning: could not append to the witness log ${witnessLogPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

for (const line of stdoutLines) {
  console.log(line);
}
for (const line of stderrLines) {
  console.error(line);
}
process.exitCode = result.exitCode;

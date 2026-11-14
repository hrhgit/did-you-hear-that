import { readdirSync } from "node:fs";
import path from "node:path";

export interface SoundRenderOptions {
  /** Absolute path of the directory that holds the synthesis code. */
  synthDir: string;
  /** Paths in the output are shown relative to this directory. Defaults to the working directory. */
  rootDir?: string;
}

export interface SoundRenderResult {
  exitCode: 0 | 1;
  lines: string[];
}

/**
 * Stands in for the offline renderer until the ghost-sounds spec writes it (design.md, D15). It
 * succeeds only when there is nothing to render: once a synthesis file exists it fails, so a
 * safety-relevant check never passes while doing nothing. It writes no file.
 */
export function runSoundRender(options: SoundRenderOptions): SoundRenderResult {
  const rootDir = options.rootDir ?? process.cwd();
  const synthDirDisplay = path
    .relative(rootDir, options.synthDir)
    .split(path.sep)
    .join("/");
  const synthesisFileCount = readdirSync(options.synthDir, {
    recursive: true,
    withFileTypes: true,
  }).filter(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts"),
  ).length;

  if (synthesisFileCount === 0) {
    return {
      exitCode: 0,
      lines: [
        `render:sounds: no ghost sounds are defined in ${synthDirDisplay} yet. Nothing to render. No report written.`,
      ],
    };
  }
  const files = synthesisFileCount === 1 ? "synthesis file" : "synthesis files";
  return {
    exitCode: 1,
    lines: [
      `render:sounds: found ${synthesisFileCount} ${files} in ${synthDirDisplay}, but rendering is not implemented yet. The ghost-sounds spec adds it.`,
    ],
  };
}

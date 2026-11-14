import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSoundRender } from "./run-sound-render";

let rootDir: string;
let synthDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(path.join(os.tmpdir(), "run-sound-render-"));
  synthDir = path.join(rootDir, "src", "audio", "synth");
  mkdirSync(synthDir, { recursive: true });
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

const nothingToRender = {
  exitCode: 0,
  lines: [
    "render:sounds: no ghost sounds are defined in src/audio/synth yet. Nothing to render. No report written.",
  ],
};

describe("runSoundRender", () => {
  it("has nothing to render in an empty directory", () => {
    expect(runSoundRender({ synthDir, rootDir })).toEqual(nothingToRender);
  });

  it("has nothing to render when there are only tests and a README", () => {
    writeFileSync(path.join(synthDir, "README.md"), "# src/audio/synth\n");
    writeFileSync(path.join(synthDir, "whisper.test.ts"), "export {};\n");
    expect(runSoundRender({ synthDir, rootDir })).toEqual(nothingToRender);
  });

  it("fails and names the count when one synthesis file exists", () => {
    writeFileSync(
      path.join(synthDir, "whisper.ts"),
      "export const whisper = 1;\n",
    );
    expect(runSoundRender({ synthDir, rootDir })).toEqual({
      exitCode: 1,
      lines: [
        "render:sounds: found 1 synthesis file in src/audio/synth, but rendering is not implemented yet. The ghost-sounds spec adds it.",
      ],
    });
  });

  it("counts synthesis files in subdirectories", () => {
    mkdirSync(path.join(synthDir, "bands"));
    writeFileSync(
      path.join(synthDir, "whisper.ts"),
      "export const whisper = 1;\n",
    );
    writeFileSync(
      path.join(synthDir, "bands", "narrow-band.ts"),
      "export const band = 1;\n",
    );
    expect(runSoundRender({ synthDir, rootDir })).toEqual({
      exitCode: 1,
      lines: [
        "render:sounds: found 2 synthesis files in src/audio/synth, but rendering is not implemented yet. The ghost-sounds spec adds it.",
      ],
    });
  });

  it("writes no file", () => {
    runSoundRender({ synthDir, rootDir });
    expect(readdirSync(rootDir, { recursive: true }).sort()).toEqual([
      "src",
      path.join("src", "audio"),
      path.join("src", "audio", "synth"),
    ]);
  });
});

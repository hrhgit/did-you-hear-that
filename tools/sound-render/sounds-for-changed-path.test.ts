import { describe, expect, it } from "vitest";
import { soundIds } from "../../src/config/sound-id";
import { soundsForChangedPath } from "./sounds-for-changed-path";

describe("soundsForChangedPath", () => {
  it("maps a sound's own files to that sound", () => {
    expect(soundsForChangedPath("src/audio/synth/cellar-knock.ts")).toEqual([
      "cellar",
    ]);
    expect(
      soundsForChangedPath("src/audio/synth/cellar-knock-plan.ts"),
    ).toEqual(["cellar"]);
    expect(
      soundsForChangedPath("src/audio/synth/cellar-knock.test.ts"),
    ).toEqual(["cellar"]);
    expect(soundsForChangedPath("src/audio/synth/corridor-hum.ts")).toEqual([
      "corridor",
    ]);
    expect(
      soundsForChangedPath("src/audio/synth/nursery-music-box-plan.ts"),
    ).toEqual(["nursery"]);
    expect(soundsForChangedPath("src/audio/synth/stairs-scrape.ts")).toEqual([
      "stairs",
    ]);
    expect(soundsForChangedPath("src/audio/synth/attic-whine.ts")).toEqual([
      "attic",
    ]);
    expect(soundsForChangedPath("src/audio/synth/calibration-hiss.ts")).toEqual(
      ["calibration"],
    );
  });

  it("maps shared synthesis files, measurement files and other files under synth to every sound", () => {
    for (const path of [
      "src/audio/synth/fft.ts",
      "src/audio/synth/finish-sound.test.ts",
      "src/audio/synth/sound-renderers.ts",
      "src/audio/synth/measure/fade-lengths.ts",
      "src/audio/synth/measure/cellar-only.ts",
      "src/audio/synth/cellar.ts",
      "src/audio/synth/README.md",
    ]) {
      expect(soundsForChangedPath(path), path).toEqual(soundIds);
    }
  });

  it("maps the four sound config files to every sound", () => {
    for (const path of [
      "src/config/audio-safety-config.ts",
      "src/config/sound-rules-config.ts",
      "src/config/ghost-sound-config.ts",
      "src/config/sound-id.ts",
    ]) {
      expect(soundsForChangedPath(path), path).toEqual(soundIds);
    }
  });

  it("maps every other path to nothing", () => {
    for (const path of [
      "src/ui/base.css",
      "src/audio/output/play.ts",
      "src/config/hearing-method-config.ts",
      "src/config/ghost-sound-config.test.ts",
      "src/audio/synthesis/x.ts",
      "docs/src/audio/synth.ts",
      "mysrc/audio/synth/cellar-knock.ts",
      "tools/render-sounds.ts",
      "README.md",
      "",
    ]) {
      expect(soundsForChangedPath(path), path).toEqual([]);
    }
  });

  it("gives the same answer for absolute paths", () => {
    expect(
      soundsForChangedPath(
        "/Users/someone/repo/src/audio/synth/attic-whine.ts",
      ),
    ).toEqual(["attic"]);
    expect(
      soundsForChangedPath("/home/x/src/project/src/config/sound-id.ts"),
    ).toEqual(soundIds);
    expect(soundsForChangedPath("/home/someone/repo/src/ui/base.css")).toEqual(
      [],
    );
  });

  it("gives the same answer for Windows-style paths", () => {
    expect(
      soundsForChangedPath("src\\audio\\synth\\stairs-scrape-plan.ts"),
    ).toEqual(["stairs"]);
    expect(
      soundsForChangedPath(
        "C:\\Users\\someone\\repo\\src\\audio\\synth\\measure\\check-sound.ts",
      ),
    ).toEqual(soundIds);
    expect(
      soundsForChangedPath(
        "C:\\Users\\someone\\repo\\src\\config\\ghost-sound-config.ts",
      ),
    ).toEqual(soundIds);
    expect(
      soundsForChangedPath("C:\\Users\\someone\\repo\\src\\ui\\base.css"),
    ).toEqual([]);
  });

  it("uses the last src directory in the path", () => {
    expect(
      soundsForChangedPath("/work/src/audio/synth/old/src/config/sound-id.ts"),
    ).toEqual(soundIds);
    expect(
      soundsForChangedPath(
        "/work/src/config/x/src/audio/synth/nursery-music-box.ts",
      ),
    ).toEqual(["nursery"]);
  });
});

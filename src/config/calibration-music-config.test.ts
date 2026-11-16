import { describe, expect, it } from "vitest";
import { calibrationMusicConfig } from "./calibration-music-config";

describe("calibrationMusicConfig", () => {
  it("is deeply frozen", () => {
    expect(Object.isFrozen(calibrationMusicConfig)).toBe(true);
  });

  it("holds the file path and nothing else", () => {
    expect(Object.keys(calibrationMusicConfig)).toEqual(["filePath"]);
    expect(calibrationMusicConfig.filePath).toBe("audio/calibration-waltz.m4a");
  });

  it("is a relative path within the site, with no way out of it", () => {
    const { filePath } = calibrationMusicConfig;
    expect(filePath.length).toBeGreaterThan(0);
    expect(filePath.startsWith("/")).toBe(false);
    expect(filePath).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    expect(filePath).not.toMatch(/^\/\//);
    expect(filePath.includes("\\")).toBe(false);
    expect(filePath.split("/")).not.toContain("..");
    expect(filePath.split("/")).not.toContain(".");
  });

  it("names an .m4a file", () => {
    expect(calibrationMusicConfig.filePath).toMatch(/\.m4a$/);
  });
});

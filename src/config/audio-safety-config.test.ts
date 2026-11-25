import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "./audio-safety-config";

describe("audioSafetyConfig", () => {
  it("holds the shortest fade, the longest ghost sound and the ceiling from audio-safety.md, and nothing else", () => {
    expect(audioSafetyConfig).toEqual({
      fadeMinMs: 20,
      ghostSoundMaxDurationMs: 1500,
      ceilingFraction: 0.25,
    });
  });

  it("ends every field name with its unit", () => {
    for (const fieldName of Object.keys(audioSafetyConfig)) {
      expect(fieldName).toMatch(/(Db|Ms|Hz|Fraction|Count)$/);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(audioSafetyConfig)).toBe(true);
  });
});

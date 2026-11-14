import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "./audio-safety-config";

const loosening =
  "needs the project owner's approval first (.kiro/steering/audio-safety.md, Initial values)";

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

  describe("loosening guards (R1.5)", () => {
    it("keeps the shortest fade at 20 ms or longer", () => {
      expect(
        audioSafetyConfig.fadeMinMs,
        `fadeMinMs is below the 20 ms of audio-safety.md. A shorter fade ${loosening}.`,
      ).toBeGreaterThanOrEqual(20);
    });

    it("keeps the longest ghost sound at 1500 ms or shorter", () => {
      expect(
        audioSafetyConfig.ghostSoundMaxDurationMs,
        `ghostSoundMaxDurationMs is above the 1.5 s of audio-safety.md. A longer sound ${loosening}.`,
      ).toBeLessThanOrEqual(1500);
    });

    it("keeps the absolute digital ceiling at 0.25 of full scale or lower (audio-output R1.2)", () => {
      expect(
        audioSafetyConfig.ceilingFraction,
        `ceilingFraction is above the 0.25 of full scale of audio-safety.md. A higher ceiling ${loosening}.`,
      ).toBeLessThanOrEqual(0.25);
    });
  });
});

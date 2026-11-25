import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "./audio-safety-config";
import { ghostSoundConfig } from "./ghost-sound-config";
import { hearingMethodConfig } from "./hearing-method-config";
import { everySoundId, ghostSoundIds, soundIds } from "./sound-id";
import { soundRulesConfig } from "./sound-rules-config";

const { fadeMinMs, ghostSoundMaxDurationMs } = audioSafetyConfig;
const { bandWidthOctaveFraction, bandEdgeMarginOctaveFraction } =
  soundRulesConfig;
const { cellar, corridor, nursery, stairs, attic, calibration } =
  ghostSoundConfig;

/** Distances in octaves are compared with this tolerance (design.md, Config tests). */
const octaveToleranceFraction = 1e-9;

/**
 * Checks that a frequency lies inside the band of `centreHz` by at least the band edge margin on
 * both sides, comparing distances in octaves.
 */
function expectInsideBandWithMargin(
  label: string,
  frequencyHz: number,
  centreHz: number,
): void {
  const distanceFromCentreOctaveFraction = Math.abs(
    Math.log2(frequencyHz / centreHz),
  );
  const allowedOctaveFraction =
    bandWidthOctaveFraction / 2 - bandEdgeMarginOctaveFraction;
  expect(
    distanceFromCentreOctaveFraction,
    `${label}: ${frequencyHz} Hz is closer than 1/24 octave to an edge of the ${centreHz} Hz band`,
  ).toBeLessThanOrEqual(allowedOctaveFraction + octaveToleranceFraction);
}

describe("ghostSoundConfig", () => {
  it("has one entry per sound id", () => {
    expect(Object.keys(ghostSoundConfig)).toEqual([...everySoundId]);
  });

  it("gives the five rooms the room frequencies of the full visit, in floor order (R2.3)", () => {
    expect(ghostSoundIds.map((id) => ghostSoundConfig[id].centreHz)).toEqual(
      hearingMethodConfig.roomFrequenciesHz.full,
    );
  });

  it("ends every field name of every entry with its unit (R2.7, D30)", () => {
    for (const id of soundIds) {
      for (const fieldName of Object.keys(ghostSoundConfig[id])) {
        expect(fieldName, `${id}.${fieldName}`).toMatch(
          /(Db|Ms|Hz|Fraction|Count)$/,
        );
      }
    }
  });

  it("is deeply frozen (R2.7)", () => {
    expect(Object.isFrozen(ghostSoundConfig)).toBe(true);
    for (const id of soundIds) {
      expect(Object.isFrozen(ghostSoundConfig[id]), id).toBe(true);
    }
    expect(Object.isFrozen(nursery.noteFrequenciesHz)).toBe(true);
  });

  describe("steering limits (R2.4)", () => {
    it("keeps every sound at most as long as the longest ghost sound", () => {
      for (const id of soundIds) {
        expect(ghostSoundConfig[id].durationMs, id).toBeLessThanOrEqual(
          ghostSoundMaxDurationMs,
        );
      }
    });

    it("gives every sound an outer fade at least as long as the shortest fade", () => {
      for (const id of soundIds) {
        expect(ghostSoundConfig[id].outerFadeMs, id).toBeGreaterThanOrEqual(
          fadeMinMs,
        );
      }
    });

    it("lets every event rise over at least the shortest fade (D5)", () => {
      const attacks: readonly (readonly [string, number])[] = [
        ["cellar knockAttackMs", cellar.knockAttackMs],
        ["corridor bodyAttackMs", corridor.bodyAttackMs],
        ["nursery noteAttackMs", nursery.noteAttackMs],
        // A grain's sine-squared envelope peaks at its middle.
        ["stairs grainLengthMinMs / 2", stairs.grainLengthMinMs / 2],
        ["attic bodyAttackMs", attic.bodyAttackMs],
      ];
      for (const [label, attackMs] of attacks) {
        expect(attackMs, label).toBeGreaterThanOrEqual(fadeMinMs);
      }
    });

    it("keeps the longest ghost sound shorter than the response window (D24)", () => {
      expect(ghostSoundMaxDurationMs).toBeLessThan(
        hearingMethodConfig.responseWindowMs,
      );
    });
  });

  describe("events end before the outer fade-out begins", () => {
    it("ends the last knock of the longest cellar plan before the fade-out", () => {
      const lastKnockEndMs =
        cellar.firstKnockOnsetMaxMs +
        (cellar.knockCount - 1) * cellar.knockIntervalMaxMs +
        cellar.knockAttackMs +
        cellar.knockDecayMs;
      expect(lastKnockEndMs).toBeLessThanOrEqual(
        cellar.durationMs - cellar.outerFadeMs,
      );
    });

    it("ends the last note of the longest nursery plan before the fade-out", () => {
      const lastNoteEndMs =
        nursery.firstNoteOnsetMaxMs +
        (nursery.noteCount - 1) * nursery.noteIntervalMaxMs +
        nursery.noteLengthMs;
      expect(lastNoteEndMs).toBeLessThanOrEqual(
        nursery.durationMs - nursery.outerFadeMs,
      );
    });
  });

  describe("every planned frequency stays inside its band with the margin (R2.5)", () => {
    it("keeps the cellar carriers inside", () => {
      for (const sign of [-1, 1]) {
        expectInsideBandWithMargin(
          "cellar carrier",
          cellar.centreHz *
            (1 + sign * cellar.knockCarrierDeviationMaxFraction),
          cellar.centreHz,
        );
      }
    });

    it("keeps the corridor pitch inside at the largest sum of its wobbles", () => {
      const largestDeviationFraction =
        corridor.pitchWobbleSinusoidCount * corridor.pitchWobbleDepthFraction;
      for (const sign of [-1, 1]) {
        expectInsideBandWithMargin(
          "corridor pitch",
          corridor.centreHz * (1 + sign * largestDeviationFraction),
          corridor.centreHz,
        );
      }
    });

    it("keeps every nursery note inside", () => {
      for (const frequencyHz of nursery.noteFrequenciesHz) {
        expectInsideBandWithMargin(
          "nursery note",
          frequencyHz,
          nursery.centreHz,
        );
      }
    });

    it("keeps the stairs noise, taper included, inside", () => {
      const reachOctaveFraction =
        stairs.noiseHalfWidthOctaveFraction + stairs.noiseTaperOctaveFraction;
      for (const sign of [-1, 1]) {
        expectInsideBandWithMargin(
          "stairs noise edge",
          stairs.centreHz * 2 ** (sign * reachOctaveFraction),
          stairs.centreHz,
        );
      }
    });

    it("keeps the attic pitch inside at the largest carrier deviation and wobble", () => {
      for (const carrierSign of [-1, 1]) {
        for (const wobbleSign of [-1, 1]) {
          expectInsideBandWithMargin(
            "attic pitch",
            attic.centreHz *
              (1 + carrierSign * attic.carrierDeviationMaxFraction) *
              (1 + wobbleSign * attic.pitchWobbleDepthFraction),
            attic.centreHz,
          );
        }
      }
    });
  });

  describe("calibration noise", () => {
    it("orders its cut frequencies", () => {
      expect(calibration.lowCutStartHz).toBeGreaterThan(0);
      expect(calibration.lowCutStartHz).toBeLessThan(calibration.lowCutEndHz);
      expect(calibration.lowCutEndHz).toBeLessThan(calibration.highCutStartHz);
      expect(calibration.highCutStartHz).toBeLessThan(calibration.highCutEndHz);
    });

    it("starts the high cut above the upper edge of the attic band", () => {
      const atticUpperEdgeHz =
        attic.centreHz * 2 ** (bandWidthOctaveFraction / 2);
      expect(calibration.highCutStartHz).toBeGreaterThan(atticUpperEdgeHz);
    });

    it("ends the low cut below the lower edge of the cellar band (D30)", () => {
      const cellarLowerEdgeHz =
        cellar.centreHz * 2 ** (-bandWidthOctaveFraction / 2);
      expect(calibration.lowCutEndHz).toBeLessThan(cellarLowerEdgeHz);
    });
  });

  describe("ranges and counts the render code relies on", () => {
    it("orders every minimum and maximum", () => {
      const ranges: readonly (readonly [string, number, number])[] = [
        [
          "cellar first knock",
          cellar.firstKnockOnsetMinMs,
          cellar.firstKnockOnsetMaxMs,
        ],
        [
          "cellar interval",
          cellar.knockIntervalMinMs,
          cellar.knockIntervalMaxMs,
        ],
        [
          "corridor pitch rate",
          corridor.pitchWobbleRateMinHz,
          corridor.pitchWobbleRateMaxHz,
        ],
        [
          "corridor level rate",
          corridor.levelWobbleRateMinHz,
          corridor.levelWobbleRateMaxHz,
        ],
        [
          "nursery first note",
          nursery.firstNoteOnsetMinMs,
          nursery.firstNoteOnsetMaxMs,
        ],
        [
          "nursery interval",
          nursery.noteIntervalMinMs,
          nursery.noteIntervalMaxMs,
        ],
        [
          "stairs grain length",
          stairs.grainLengthMinMs,
          stairs.grainLengthMaxMs,
        ],
        [
          "stairs grain spacing",
          stairs.grainSpacingMinMs,
          stairs.grainSpacingMaxMs,
        ],
        [
          "attic pitch rate",
          attic.pitchWobbleRateMinHz,
          attic.pitchWobbleRateMaxHz,
        ],
      ];
      for (const [label, minimum, maximum] of ranges) {
        expect(minimum, label).toBeGreaterThanOrEqual(0);
        expect(minimum, label).toBeLessThanOrEqual(maximum);
      }
    });

    it("has positive whole event counts and a positive grain spacing", () => {
      for (const count of [
        cellar.knockCount,
        corridor.pitchWobbleSinusoidCount,
        nursery.noteCount,
      ]) {
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThan(0);
      }
      expect(stairs.grainSpacingMinMs).toBeGreaterThan(0);
    });

    it("offers at least two distinct nursery pitches, so no note has to repeat the one before", () => {
      expect(nursery.noteFrequenciesHz.length).toBeGreaterThanOrEqual(2);
      expect(new Set(nursery.noteFrequenciesHz).size).toBe(
        nursery.noteFrequenciesHz.length,
      );
    });

    it("fits the nursery attack and release inside a note", () => {
      expect(nursery.noteAttackMs + nursery.noteReleaseMs).toBeLessThanOrEqual(
        nursery.noteLengthMs,
      );
    });

    it("keeps modulation depths between 0 and 1", () => {
      for (const depth of [
        corridor.pitchWobbleDepthFraction,
        corridor.levelWobbleDepthFraction,
        attic.pitchWobbleDepthFraction,
        attic.carrierDeviationMaxFraction,
        cellar.knockCarrierDeviationMaxFraction,
      ]) {
        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThan(1);
      }
    });
  });
});

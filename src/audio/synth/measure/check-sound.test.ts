import { describe, expect, it } from "vitest";
import { audioSafetyConfig } from "../../../config/audio-safety-config";
import { soundRulesConfig } from "../../../config/sound-rules-config";
import { checkSound } from "./check-sound";
import { measureSound } from "./measure-sound";
import type { SoundMeasurement } from "./measurement-types";

const { fadeMinMs, ghostSoundMaxDurationMs } = audioSafetyConfig;
const {
  outOfBandBelowInBandMinDb,
  levelToleranceDb,
  calibrationShapeToleranceDb,
  referenceRmsFraction,
} = soundRulesConfig;

/** A ghost sound measurement that meets every rule with room to spare. */
const ghost: SoundMeasurement = Object.freeze({
  soundId: "cellar",
  sampleRateHz: 48000,
  sampleCount: 43200,
  firstSample: 0,
  lastSample: 0,
  durationMs: 900,
  rmsFraction: referenceRmsFraction,
  levelDeviationDb: 0,
  peakFraction: 0.3,
  crestFactorDb: 15.6,
  fadeInMs: 25,
  fadeOutMs: 30,
  inBandShareFraction: 0.9999,
  outOfBandRatioDb: -46,
  roomBandLevelsDb: null,
  calibrationShapeDistanceMaxDb: null,
});

/** A calibration measurement that meets every rule with room to spare. */
const calibration: SoundMeasurement = Object.freeze({
  ...ghost,
  soundId: "calibration",
  inBandShareFraction: null,
  outOfBandRatioDb: null,
  roomBandLevelsDb: Object.freeze({
    cellar: -9,
    corridor: -6,
    nursery: -3,
    stairs: 0,
    attic: -2,
  }),
  calibrationShapeDistanceMaxDb: 0.2,
});

const rulesOf = (measurement: SoundMeasurement): string[] =>
  checkSound(measurement).map((rule) => rule.rule);

describe("checkSound", () => {
  it("returns an empty list when every rule is met", () => {
    expect(checkSound(ghost)).toEqual([]);
    expect(checkSound(calibration)).toEqual([]);
  });

  describe("band", () => {
    it("is met exactly at the limit and broken just past it", () => {
      expect(
        rulesOf({ ...ghost, outOfBandRatioDb: -outOfBandBelowInBandMinDb }),
      ).toEqual([]);
      const [rule] = checkSound({
        ...ghost,
        outOfBandRatioDb: -outOfBandBelowInBandMinDb + 0.01,
      });
      expect(rule.rule).toBe("band");
      expect(rule.measured).toBeCloseTo(-29.99, 9);
      expect(rule.limit).toBe(-30);
      expect(rule.description).toBe(
        "out-of-band energy -30.0 dB, limit -30 dB",
      );
    });

    it("is broken when there is no in-band energy (R6.2)", () => {
      const [rule] = checkSound({
        ...ghost,
        outOfBandRatioDb: Number.POSITIVE_INFINITY,
      });
      expect(rule.rule).toBe("band");
      expect(rule.measured).toBe(Number.POSITIVE_INFINITY);
    });

    it("does not apply to the calibration noise (R6.3)", () => {
      expect(rulesOf({ ...calibration, inBandShareFraction: 0.01 })).toEqual(
        [],
      );
    });
  });

  describe("fadeIn and fadeOut", () => {
    it("are met exactly at the shortest fade and broken just under it", () => {
      expect(
        rulesOf({ ...ghost, fadeInMs: fadeMinMs, fadeOutMs: fadeMinMs }),
      ).toEqual([]);
      expect(rulesOf({ ...ghost, fadeInMs: fadeMinMs - 0.01 })).toEqual([
        "fadeIn",
      ]);
      expect(rulesOf({ ...ghost, fadeOutMs: fadeMinMs - 0.01 })).toEqual([
        "fadeOut",
      ]);
      const [rule] = checkSound({ ...ghost, fadeInMs: 18.94 });
      expect(rule.measured).toBe(18.94);
      expect(rule.limit).toBe(fadeMinMs);
      expect(rule.description).toBe(
        `fade in 18.9 ms, limit at least ${fadeMinMs} ms`,
      );
    });

    it("are broken by a first or last sample that is not exactly zero (R7.1)", () => {
      const [first] = checkSound({ ...ghost, firstSample: 1e-7 });
      expect(first.rule).toBe("fadeIn");
      expect(first.measured).toBe(1e-7);
      expect(first.limit).toBe(0);
      const [last] = checkSound({ ...ghost, lastSample: -0.25 });
      expect(last.rule).toBe("fadeOut");
      expect(last.measured).toBe(-0.25);
      expect(last.description).toBe("last sample -0.250000, limit exactly 0");
    });

    it("apply to the calibration noise too", () => {
      expect(rulesOf({ ...calibration, fadeInMs: 5, lastSample: 0.1 })).toEqual(
        ["fadeIn", "fadeOut"],
      );
    });
  });

  describe("duration", () => {
    it("is met exactly at the longest sound and broken just past it", () => {
      expect(
        rulesOf({ ...ghost, durationMs: ghostSoundMaxDurationMs }),
      ).toEqual([]);
      expect(
        rulesOf({ ...ghost, durationMs: ghostSoundMaxDurationMs + 0.01 }),
      ).toEqual(["duration"]);
      expect(
        rulesOf({ ...calibration, durationMs: ghostSoundMaxDurationMs + 0.01 }),
      ).toEqual(["duration"]);
    });
  });

  describe("level", () => {
    it("is met at the tolerance on both sides and broken just past it", () => {
      expect(rulesOf({ ...ghost, levelDeviationDb: levelToleranceDb })).toEqual(
        [],
      );
      expect(
        rulesOf({ ...ghost, levelDeviationDb: -levelToleranceDb }),
      ).toEqual([]);
      expect(
        rulesOf({ ...ghost, levelDeviationDb: levelToleranceDb + 1e-4 }),
      ).toEqual(["level"]);
      expect(
        rulesOf({ ...ghost, levelDeviationDb: -levelToleranceDb - 1e-4 }),
      ).toEqual(["level"]);
    });

    it("is broken when the RMS is zero", () => {
      const [rule] = checkSound({
        ...ghost,
        rmsFraction: 0,
        levelDeviationDb: Number.NEGATIVE_INFINITY,
      });
      expect(rule.rule).toBe("level");
      expect(rule.limit).toBe(levelToleranceDb);
    });
  });

  describe("peak", () => {
    it("is met just below full scale and broken at full scale", () => {
      expect(rulesOf({ ...ghost, peakFraction: 0.999 })).toEqual([]);
      expect(rulesOf({ ...ghost, peakFraction: 1 })).toEqual(["peak"]);
    });

    it("sets no limit on the crest factor (R9.3)", () => {
      expect(rulesOf({ ...ghost, crestFactorDb: 40 })).toEqual([]);
    });
  });

  describe("calibrationShape", () => {
    it("is met at the tolerance and broken just past it", () => {
      expect(
        rulesOf({
          ...calibration,
          calibrationShapeDistanceMaxDb: calibrationShapeToleranceDb,
        }),
      ).toEqual([]);
      expect(
        rulesOf({
          ...calibration,
          calibrationShapeDistanceMaxDb: calibrationShapeToleranceDb + 0.01,
        }),
      ).toEqual(["calibrationShape"]);
    });

    it("does not apply to a ghost sound", () => {
      expect(
        rulesOf({ ...ghost, calibrationShapeDistanceMaxDb: null }),
      ).toEqual([]);
    });
  });

  it("lists broken rules in the order band, fadeIn, fadeOut, duration, level, peak", () => {
    expect(
      rulesOf({
        ...ghost,
        outOfBandRatioDb: -10,
        fadeInMs: 1,
        fadeOutMs: 1,
        durationMs: 5000,
        levelDeviationDb: 3,
        peakFraction: 1.5,
      }),
    ).toEqual(["band", "fadeIn", "fadeOut", "duration", "level", "peak"]);
    expect(
      rulesOf({
        ...calibration,
        fadeInMs: 1,
        levelDeviationDb: 3,
        calibrationShapeDistanceMaxDb: 4,
      }),
    ).toEqual(["fadeIn", "level", "calibrationShape"]);
  });

  it("treats a NaN measurement as breaking its rule (D33)", () => {
    expect(
      rulesOf({
        ...ghost,
        outOfBandRatioDb: Number.NaN,
        fadeInMs: Number.NaN,
        firstSample: 0,
        lastSample: Number.NaN,
        durationMs: Number.NaN,
        rmsFraction: Number.NaN,
        levelDeviationDb: Number.NaN,
        peakFraction: Number.NaN,
      }),
    ).toEqual(["band", "fadeIn", "fadeOut", "duration", "level", "peak"]);
  });

  describe("an all-zero buffer (R6.2, R7.4)", () => {
    it("breaks band, fadeIn, fadeOut and level for a ghost sound", () => {
      expect(
        rulesOf(measureSound(new Float32Array(43200), 48000, "cellar")),
      ).toEqual(["band", "fadeIn", "fadeOut", "level"]);
    });

    it("breaks fadeIn, fadeOut, level and calibrationShape for the calibration noise", () => {
      expect(
        rulesOf(measureSound(new Float32Array(43200), 48000, "calibration")),
      ).toEqual(["fadeIn", "fadeOut", "level", "calibrationShape"]);
    });
  });

  it("breaks the level and the fades for a buffer that holds NaN", () => {
    const samples = new Float32Array(4800);
    samples[100] = Number.NaN;
    const rules = rulesOf(measureSound(samples, 48000, "corridor"));
    expect(rules).toContain("level");
    expect(rules).toContain("fadeIn");
    expect(rules).toContain("fadeOut");
  });
});

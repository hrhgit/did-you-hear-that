import { describe, expect, it } from "vitest";
import { audioOutputConfig } from "../../config/audio-output-config";
import { audioSafetyConfig } from "../../config/audio-safety-config";
import { soundRulesConfig } from "../../config/sound-rules-config";
import { decibelsToGain } from "../synth/decibels-to-gain";
import {
  calibrationControlTopDb,
  calibrationMusicTopDb,
} from "./calibration-music-top";
import { calibrationSettingTopDb } from "./calibration-setting-top";
import { gainToDecibels } from "./gain-to-decibels";

const { calibrationSettingMinDb, calibrationSettingStepDb } = audioOutputConfig;

/** The measured file at 44 100 Hz ("Measurements of the file"). */
const measured44100 = { rmsFraction: 0.11088, peakFraction: 0.92182 };
/** The measured file at 48 000 Hz. */
const measured48000 = { rmsFraction: 0.11088, peakFraction: 0.92702 };

/** Music_Level_Gain: the gain that gives the music the reference RMS at the anchor. */
function musicLevelGain(settingDb: number, rmsFraction: number): number {
  return (
    (decibelsToGain(settingDb) * soundRulesConfig.referenceRmsFraction) /
    rmsFraction
  );
}

function crestDbOf(measure: {
  rmsFraction: number;
  peakFraction: number;
}): number {
  return gainToDecibels(measure.peakFraction / measure.rmsFraction);
}

describe("calibrationMusicTopDb", () => {
  it.each([18.4, 18.44])(
    "is −5 dB for a crest factor of %s dB (D7)",
    (crestDb) => {
      expect(calibrationMusicTopDb(crestDb)).toBe(-5);
    },
  );

  it("gives the measured file at 44 100 Hz a peak of 0.2338 at −5 dB, within the ceiling", () => {
    const topDb = calibrationMusicTopDb(crestDbOf(measured44100));
    expect(topDb).toBe(-5);
    const peakFraction =
      measured44100.peakFraction *
      musicLevelGain(topDb, measured44100.rmsFraction);
    expect(peakFraction).toBeCloseTo(0.2338, 4);
    expect(peakFraction).toBeLessThanOrEqual(audioSafetyConfig.ceilingFraction);
    expect(musicLevelGain(topDb, measured44100.rmsFraction)).toBeCloseTo(
      0.2536,
      4,
    );
  });

  it("gives the measured file at 48 000 Hz a peak of 0.2351 at −5 dB, and one step higher would break the ceiling", () => {
    const topDb = calibrationMusicTopDb(crestDbOf(measured48000));
    expect(topDb).toBe(-5);
    const peakAt = (settingDb: number) =>
      measured48000.peakFraction *
      musicLevelGain(settingDb, measured48000.rmsFraction);
    expect(peakAt(topDb)).toBeCloseTo(0.2351, 4);
    expect(peakAt(topDb + calibrationSettingStepDb)).toBeGreaterThan(
      audioSafetyConfig.ceilingFraction,
    );
  });

  it("lies on the control's grid, keeps the peak within the ceiling, and is the highest such setting", () => {
    for (let crestDb = 0; crestDb <= 30; crestDb += 0.37) {
      const topDb = calibrationMusicTopDb(crestDb);
      const stepCount =
        (topDb - calibrationSettingMinDb) / calibrationSettingStepDb;
      expect(Number.isInteger(stepCount), `${crestDb} dB`).toBe(true);
      const peakAt = (settingDb: number) =>
        soundRulesConfig.referenceRmsFraction *
        decibelsToGain(settingDb + crestDb);
      expect(peakAt(topDb), `${crestDb} dB`).toBeLessThanOrEqual(
        audioSafetyConfig.ceilingFraction,
      );
      expect(
        peakAt(topDb + calibrationSettingStepDb),
        `${crestDb} dB`,
      ).toBeGreaterThan(audioSafetyConfig.ceilingFraction);
    }
  });

  it("never rounds up at the boundary: a crest factor that puts the limit exactly on a grid setting gives that setting", () => {
    const limitAtZeroCrestDb = gainToDecibels(
      audioSafetyConfig.ceilingFraction / soundRulesConfig.referenceRmsFraction,
    );
    const crestDb = limitAtZeroCrestDb + 5;
    const topDb = calibrationMusicTopDb(crestDb);
    expect(
      soundRulesConfig.referenceRmsFraction * decibelsToGain(topDb + crestDb),
    ).toBeLessThanOrEqual(audioSafetyConfig.ceilingFraction);
    expect([-5, -6]).toContain(topDb);
  });

  it("falls with the crest factor", () => {
    expect(calibrationMusicTopDb(25)).toBeLessThan(calibrationMusicTopDb(18.4));
    expect(calibrationMusicTopDb(3)).toBeGreaterThan(
      calibrationMusicTopDb(18.4),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "refuses a crest factor of %s",
    (crestDb) => {
      expect(() => calibrationMusicTopDb(crestDb)).toThrow(RangeError);
    },
  );
});

describe("calibrationControlTopDb", () => {
  it("is −5 dB with the measured file, and the hiss keeps −4 dB (D7)", () => {
    expect(calibrationControlTopDb(crestDbOf(measured44100))).toBe(-5);
    expect(calibrationControlTopDb(crestDbOf(measured48000))).toBe(-5);
    expect(calibrationSettingTopDb()).toBe(-4);
  });

  it("is never above the hiss's top, even for music with a small crest factor", () => {
    expect(calibrationControlTopDb(3)).toBe(calibrationSettingTopDb());
    expect(calibrationMusicTopDb(3)).toBeGreaterThan(calibrationSettingTopDb());
  });

  it("is the lower of the two tops", () => {
    for (let crestDb = 0; crestDb <= 30; crestDb += 0.5) {
      expect(calibrationControlTopDb(crestDb)).toBe(
        Math.min(calibrationMusicTopDb(crestDb), calibrationSettingTopDb()),
      );
    }
  });
});

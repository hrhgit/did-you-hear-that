import { describe, expect, it } from "vitest";
import type {
  BrokenRule,
  SoundMeasurement,
} from "../../src/audio/synth/measure/measurement-types";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { formatFixed, formatSoundReport } from "./format-sound-report";
import type { SoundRun } from "./measure-sounds";

const { fadeMinMs, ghostSoundMaxDurationMs } = audioSafetyConfig;

const ghostMeasurement: SoundMeasurement = Object.freeze({
  soundId: "cellar",
  sampleRateHz: 44100,
  sampleCount: 39690,
  firstSample: 0,
  lastSample: 0,
  durationMs: 900,
  rmsFraction: soundRulesConfig.referenceRmsFraction,
  levelDeviationDb: 0.0001,
  peakFraction: 0.2,
  crestFactorDb: 12,
  fadeInMs: 25,
  fadeOutMs: 30,
  inBandShareFraction: 0.9999,
  outOfBandRatioDb: -46.25,
  roomBandLevelsDb: null,
  calibrationShapeDistanceMaxDb: null,
});

function ghostRun(
  seed: number,
  changes: Partial<SoundMeasurement> = {},
  brokenRules: readonly BrokenRule[] = [],
): SoundRun {
  return {
    soundId: "cellar",
    sampleRateHz: 44100,
    seed,
    measurement: { ...ghostMeasurement, ...changes },
    brokenRules,
    errorMessage: null,
  };
}

function calibrationRun(seed: number, distanceDb: number): SoundRun {
  return {
    soundId: "calibration",
    sampleRateHz: 48000,
    seed,
    measurement: {
      ...ghostMeasurement,
      soundId: "calibration",
      sampleRateHz: 48000,
      inBandShareFraction: null,
      outOfBandRatioDb: null,
      roomBandLevelsDb: {
        cellar: -9,
        corridor: -6,
        nursery: -3,
        stairs: 0,
        attic: -2,
      },
      calibrationShapeDistanceMaxDb: distanceDb,
    },
    brokenRules: [],
    errorMessage: null,
  };
}

function rowOf(report: string, start: string): string {
  const row = report.split("\n").find((line) => line.startsWith(start));
  if (row === undefined) {
    throw new Error(`no row starting with ${start}`);
  }
  return row;
}

describe("formatFixed", () => {
  it("uses a fixed number of decimals", () => {
    expect(formatFixed(-46.25, 1)).toBe("-46.3");
    expect(formatFixed(25, 1)).toBe("25.0");
    expect(formatFixed(0.2, 3)).toBe("0.200");
  });

  it("drops the minus sign of a value that rounds to zero", () => {
    expect(formatFixed(-0.00001, 3)).toBe("0.000");
    expect(formatFixed(-0, 1)).toBe("0.0");
    expect(formatFixed(-0.4, 0)).toBe("0");
  });

  it("names NaN and the infinities", () => {
    expect(formatFixed(Number.NaN, 1)).toBe("not a number");
    expect(formatFixed(Number.POSITIVE_INFINITY, 1)).toBe("+infinity");
    expect(formatFixed(Number.NEGATIVE_INFINITY, 1)).toBe("-infinity");
  });
});

describe("formatSoundReport", () => {
  it("shows the worst value of each measure with its seed, in fixed decimals", () => {
    const report = formatSoundReport([
      ghostRun(1),
      ghostRun(2, {
        inBandShareFraction: 0.9991,
        fadeInMs: 22.04,
        levelDeviationDb: -0.0042,
      }),
      ghostRun(3, {
        outOfBandRatioDb: -41.04,
        fadeOutMs: 24.96,
        peakFraction: 0.31,
      }),
      ghostRun(4, { crestFactorDb: 13.27, durationMs: 900 }),
    ]);
    expect(rowOf(report, "| cellar | 44100 |")).toBe(
      "| cellar | 44100 | 99.91 % (2) | -41.0 dB (3) | 22.0 ms (2) | 25.0 ms (3) | 900.0 ms (1) | -0.004 dB (2) | 0.310 (3) | 13.3 dB (4) | n/a | meets every rule |",
    );
  });

  it("takes the first seed when two seeds tie", () => {
    const report = formatSoundReport([ghostRun(5), ghostRun(6)]);
    expect(rowOf(report, "| cellar |")).toContain("| -46.3 dB (5) |");
  });

  it("shows the shape distance for the calibration noise and n/a for the band columns", () => {
    const report = formatSoundReport([
      calibrationRun(1, 0.31),
      calibrationRun(2, 0.48),
    ]);
    expect(rowOf(report, "| calibration | 48000 |")).toBe(
      "| calibration | 48000 | n/a | n/a | 25.0 ms (1) | 30.0 ms (1) | 900.0 ms (1) | 0.000 dB (1) | 0.200 (1) | 12.0 dB (1) | 0.5 dB (2) | meets every rule |",
    );
  });

  it("names the broken rules in the rules column and lists each one", () => {
    const fadeIn: BrokenRule = {
      rule: "fadeIn",
      measured: 1,
      limit: fadeMinMs,
      description: `fade in 1.0 ms, limit at least ${fadeMinMs} ms`,
    };
    const band: BrokenRule = {
      rule: "band",
      measured: -20,
      limit: -30,
      description: "out-of-band energy -20.0 dB, limit -30 dB",
    };
    const report = formatSoundReport([
      ghostRun(1, { fadeInMs: 1 }, [fadeIn]),
      ghostRun(2, { outOfBandRatioDb: -20 }, [band]),
    ]);
    expect(rowOf(report, "| cellar |")).toMatch(/\| breaks: band, fade in \|$/);
    expect(report).toContain("## Broken rules");
    expect(report).toContain(
      `- cellar at 44100 Hz, seed 1: fade in 1.0 ms, limit at least ${fadeMinMs} ms.`,
    );
    expect(report).toContain(
      "- cellar at 44100 Hz, seed 2: out-of-band energy -20.0 dB, limit -30 dB.",
    );
  });

  it("names the seeds whose renderer threw", () => {
    const thrown = (seed: number): SoundRun => ({
      soundId: "cellar",
      sampleRateHz: 44100,
      seed,
      measurement: null,
      brokenRules: [],
      errorMessage: "no knock.",
    });
    const report = formatSoundReport([ghostRun(1), thrown(2), thrown(3)]);
    expect(rowOf(report, "| cellar |")).toMatch(
      /\| 99\.99 % \(1\) \|.*\| the renderer threw at seeds 2, 3 \|$/,
    );
    expect(report).toContain(
      "- cellar at 44100 Hz, seed 2: the renderer threw an error: no knock.",
    );
    const allThrown = formatSoundReport([thrown(1)]);
    expect(rowOf(allThrown, "| cellar |")).toBe(
      "| cellar | 44100 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | the renderer threw at seed 1 |",
    );
  });

  it("counts a NaN as the worst value", () => {
    const report = formatSoundReport([
      ghostRun(1),
      ghostRun(2, { fadeInMs: Number.NaN }),
      ghostRun(3, { fadeInMs: 1 }),
    ]);
    expect(rowOf(report, "| cellar |")).toContain("| not a number (2) |");
  });

  it("states every rule and its limit from config", () => {
    const report = formatSoundReport([ghostRun(1)]);
    expect(report).toContain(
      "| Band | out-of-band energy at least 30 dB below in-band energy, band 1/3 of an octave around the room's pitch |",
    );
    expect(report).toContain(
      `| Fade | at least ${fadeMinMs} ms in and out, first and last sample exactly zero |`,
    );
    expect(report).toContain(
      `| Duration | at most ${ghostSoundMaxDurationMs} ms, the calibration noise included |`,
    );
    expect(report).toContain(
      "| Level | RMS within 0.01 dB of 0.05 of full scale |",
    );
    expect(report).toContain("| Peak | below full scale |");
    expect(report).toContain(
      "| Calibration shape | each room band within 1 dB of the configured shape (cellar -9, corridor -6, nursery -3, stairs 0, attic -2 dB, relative to the loudest room band) |",
    );
    expect(report).toContain("with seeds 1 to 10");
    expect(report).toContain("at 44100 Hz and 48000 Hz");
  });

  it("has a Notes section that says the calibration shape is a guess (R10.4)", () => {
    const report = formatSoundReport([ghostRun(1)]);
    const notes = report.slice(report.indexOf("## Notes"));
    expect(notes).toContain(
      "The calibration shape is a starting guess with no measured source. It is tuned by ear later.",
    );
    expect(notes).toContain("Crest factor has no limit here.");
    expect(notes).toContain(
      "Nothing in this report says how loud a sound is at the ear.",
    );
  });

  it("holds no date and is the same for the same runs", () => {
    const runs = [ghostRun(1), ghostRun(2, { fadeInMs: 21 })];
    const report = formatSoundReport(runs);
    expect(formatSoundReport(runs)).toBe(report);
    expect(report).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(report).not.toMatch(/\d{1,2}:\d{2}/);
    expect(report).not.toMatch(
      /January|February|March|April|May|June|July|August|September|October|November|December/,
    );
    expect(report.endsWith("\n")).toBe(true);
  });
});

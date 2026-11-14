import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import * as calibration from "./calibration-copy";
import { calibrationCopy, roomsShortLine } from "./calibration-copy";
import { findBannedTerms } from "./find-banned-terms";
import * as headphoneCheck from "./headphone-check-copy";
import { headphoneCheckCopy } from "./headphone-check-copy";
import * as listeningPage from "./listening-page-copy";
import {
  calibrationSettingLine,
  clampLine,
  clampLogLine,
  floorRmsLine,
  levelLabel,
  playRefusedLine,
  sampleRateLine,
  seedLine,
} from "./listening-page-copy";
import * as outputState from "./output-state-copy";
import { outputStateCopy } from "./output-state-copy";

/** Every string reachable from a module's exports, with the path to it. */
function stringsOf(
  moduleName: string,
  exports: Record<string, unknown>,
): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      found.push({ path, text: value });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        walk(nested, `${path}.${key}`);
      }
    }
  };
  for (const [name, value] of Object.entries(exports)) {
    walk(value, `${moduleName}.${name}`);
  }
  return found;
}

const constantStrings = [
  ...stringsOf("calibration", calibration),
  ...stringsOf("headphoneCheck", headphoneCheck),
  ...stringsOf("outputState", outputState),
  ...stringsOf("listeningPage", listeningPage),
];

const roomCounts = [
  ...[0, 1, 2, 3, 4, 5].map((count) => ({ count, total: 5 })),
  ...[0, 1, 2, 3].map((count) => ({ count, total: 3 })),
  { count: 0, total: 1 },
  { count: 1, total: 1 },
];

/** Levels from below the floor to above the cap, on and off the grid, and around zero. */
const levels = [
  -200, -70, -65.04, -25, -10.55, -0.04, -0, 0, 0.04, 2.5, 5, 13.98, 15, 20,
  200,
];

const clampLimits = ["anchorCap", "rise", "ceiling"] as const;

const refusalReasons = [
  "busy",
  "notRunning",
  "notCalibrated",
  "notCalibrating",
  "unsupported",
  "peakBoundNotMet",
  "renderFailed",
  "fadeTooShort",
];

/** The output of every function for representative inputs, each with a name. */
const functionStrings: { path: string; text: string }[] = [
  ...roomCounts.map(({ count, total }) => ({
    path: `roomsShortLine(${count}, ${total})`,
    text: roomsShortLine(count, total),
  })),
  ...levels.map((levelDb) => ({
    path: `levelLabel(${levelDb})`,
    text: levelLabel(levelDb),
  })),
  ...[...clampLimits, null].map((limit) => ({
    path: `clampLine(${String(limit)})`,
    text: clampLine(limit),
  })),
  ...clampLimits.map((clampLimit) => ({
    path: `clampLogLine(${clampLimit})`,
    text: clampLogLine({
      soundId: "stairs",
      earChoice: "left",
      purpose: "listening",
      requestedLevelDb: 15,
      playedLevelDb: 1.02,
      clampLimit,
    }),
  })),
  ...refusalReasons.map((reason) => ({
    path: `playRefusedLine(${reason})`,
    text: playRefusedLine(reason),
  })),
  ...[22050, 44100, 48000, 192000].map((rate) => ({
    path: `sampleRateLine(${rate})`,
    text: sampleRateLine(rate),
  })),
  ...[0, 1, 4294967295].map((seed) => ({
    path: `seedLine(${seed})`,
    text: seedLine(seed),
  })),
  ...[-60, -40, -19, -4].map((settingDb) => ({
    path: `calibrationSettingLine(${settingDb})`,
    text: calibrationSettingLine(settingDb),
  })),
  ...[1.0e-5, 1.7e-6, 0.05].map((fraction) => ({
    path: `floorRmsLine(${fraction})`,
    text: floorRmsLine(fraction),
  })),
];

const everyString = [...constantStrings, ...functionStrings];

/** Words that would advise raising the volume (R16.10). */
const raiseAdvice = /turn up|turn the volume up|raise/i;

describe("the output stage's copy", () => {
  it("holds a string in every file", () => {
    for (const name of [
      "calibration",
      "headphoneCheck",
      "outputState",
      "listeningPage",
    ]) {
      expect(
        constantStrings.some(({ path }) => path.startsWith(`${name}.`)),
        name,
      ).toBe(true);
    }
  });

  it("contains no banned term in any string or function output (R18.2)", () => {
    for (const { path, text } of everyString) {
      expect(findBannedTerms(text, bannedTerms), path).toEqual([]);
    }
  });

  it("never advises raising the volume; the two lines that mention it say not to (R16.8 to R16.10)", () => {
    const sayingNotTo = new Set([
      "calibration.calibrationCopy.keptLine",
      ...roomCounts
        .filter(({ count }) => count > 0)
        .map(({ count, total }) => `roomsShortLine(${count}, ${total})`),
    ]);
    for (const { path, text } of everyString) {
      if (sayingNotTo.has(path)) {
        expect(text, path).toMatch(/do not turn the volume up/i);
      } else {
        expect(text, path).not.toMatch(raiseAdvice);
      }
    }
  });

  it("labels every level as relative to the visitor's calibration (R18.3)", () => {
    for (const levelDb of levels) {
      expect(levelLabel(levelDb)).toMatch(/ relative to your calibration$/);
    }
    expect(levelLabel(-25)).toBe("−25.0 dB relative to your calibration");
    expect(levelLabel(5)).toBe("+5.0 dB relative to your calibration");
    expect(levelLabel(-0.04)).toBe("0.0 dB relative to your calibration");
    expect(() => levelLabel(Number.NaN)).toThrow(RangeError);
  });

  it("says how many rooms are short, and what to do, in the line of R16.9", () => {
    expect(roomsShortLine(3, 5)).toBe(
      "At this setting, 3 of the 5 rooms cannot get as loud as the house would like. The house will stop at the loudest it can play there. Do not turn the volume up to change this.",
    );
    for (const [count, total] of [
      [-1, 5],
      [6, 5],
      [1, 0],
      [1.5, 5],
    ]) {
      expect(() => roomsShortLine(count, total)).toThrow(RangeError);
    }
  });

  it("names each limit in its clamp line", () => {
    for (const limit of clampLimits) {
      expect(clampLine(limit)).toContain(`(${limit})`);
    }
  });

  it("has a line for every stop reason and every unsupported reason, each unsupported one a single sentence (R5.5)", () => {
    expect(Object.keys(outputStateCopy.stoppedLines).sort()).toEqual(
      ["control", "deviceChanged", "hidden", "interrupted", "pageLeft"].sort(),
    );
    expect(Object.keys(outputStateCopy.unsupportedLines).sort()).toEqual(
      ["monoOutput", "noWebAudio", "sampleRateTooLow"].sort(),
    );
    for (const line of Object.values(outputStateCopy.unsupportedLines)) {
      expect(line.match(/[.!?]/g), line).toEqual(["."]);
      expect(line.endsWith("."), line).toBe(true);
    }
  });

  it("has the four answers and the four judgements of the headphone check (R17.3 to R17.6)", () => {
    expect(Object.keys(headphoneCheckCopy.answers)).toEqual([
      "left",
      "right",
      "bothSides",
      "nothingHeard",
    ]);
    expect(Object.keys(headphoneCheckCopy.judgementLines)).toEqual([
      "correct",
      "swapped",
      "bothSides",
      "notHeard",
    ]);
    expect(headphoneCheckCopy.judgementLines.swapped).toMatch(
      /turn the headphones around and try again/i,
    );
    expect(headphoneCheckCopy.judgementLines.bothSides).toMatch(
      /one side only.*same sound in both ears/i,
    );
    expect(headphoneCheckCopy.judgementLines.notHeard).toMatch(
      /both earpieces are on and connected.*try again/i,
    );
  });

  it("tells the visitor to turn the system volume down when the setting is too low to keep (R16.6)", () => {
    expect(calibrationCopy.systemVolumeHighLine).toMatch(/turn it down/i);
    expect(calibrationCopy.systemVolumeHighLine).toMatch(
      /match the hiss again/i,
    );
  });
});

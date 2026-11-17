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
      /set the music again/i,
    );
    expect(calibrationCopy.hiss.systemVolumeHighLine).toMatch(/turn it down/i);
    expect(calibrationCopy.hiss.systemVolumeHighLine).toMatch(
      /set the hiss again/i,
    );
  });

  it("says that a changed audio device means calibrating again", () => {
    expect(outputStateCopy.stoppedLines.deviceChanged).toMatch(
      /calibrate again/i,
    );
    expect(outputStateCopy.stoppedLines.deviceChanged).toBe(
      "All sound stopped because your audio device changed. Calibrate again before the house plays anything else.",
    );
  });
});

describe('the calibration copy (audible-start design.md, "The calibration copy")', () => {
  it("holds the music's lines word for word", () => {
    expect(calibrationCopy).toMatchObject({
      heading: "Set the music to a comfortable volume",
      againHeading: "Set the music again",
      openLine:
        "Move the control until the music is as loud as you would listen to music in a quiet room: clear and comfortable, not loud. Leave your system volume where you usually have it. The music starts very quietly.",
      whyLine:
        "This tells the house how loud is safe on these headphones at this volume, and gives your result a level to be measured from.",
      riseLine: "The music follows the control as you move it.",
      keysLine:
        "On a keyboard, the arrow keys move the control one step. Shift with an arrow, Page Up or Page Down move it five steps. Home and End go to the ends. Enter keeps the setting.",
      atTopLine:
        "This is as loud as the music goes here. If it still sounds too quiet, keep this setting.",
      systemVolumeHighLine:
        "Your system volume is set very high. Turn it down, then set the music again.",
      loadingLine: "The music is on its way.",
    });
  });

  it("holds the hiss's lines word for word", () => {
    expect(calibrationCopy.hiss).toEqual({
      heading: "Set the hiss to a comfortable volume",
      againHeading: "Set the hiss again",
      openLine:
        "The calibration sound is a hiss. Move the control until it is as loud as you would listen to music in a quiet room: clear and comfortable, not loud. Leave your system volume where you usually have it. The hiss starts very quietly.",
      riseLine: "The hiss follows the control as you move it.",
      atTopLine:
        "This is as loud as the hiss goes here. If it still sounds too quiet, keep this setting.",
      systemVolumeHighLine:
        "Your system volume is set very high. Turn it down, then set the hiss again.",
    });
    expect(Object.isFrozen(calibrationCopy.hiss)).toBe(true);
  });

  it("keeps the line of audio-safety rule 8 and the button labels as they were", () => {
    expect(calibrationCopy.keptLine).toBe(
      "Leave your system volume where it is now. The house keeps every sound below its limit only if you do not turn the volume up.",
    );
    expect(calibrationCopy).toMatchObject({
      startButton: "Start calibrating",
      quieterButton: "Quieter",
      louderButton: "Louder",
      keepButton: "Keep this setting",
    });
  });

  it("mentions hands in no line (audible-start R7.2)", () => {
    for (const { path, text } of everyString) {
      expect(text, path).not.toMatch(/\bhands?\b/i);
    }
  });

  it("names the music in the music's lines and the hiss in the hiss's, and neither in the lines both share", () => {
    for (const key of [
      "heading",
      "againHeading",
      "openLine",
      "riseLine",
      "atTopLine",
      "systemVolumeHighLine",
    ] as const) {
      expect(calibrationCopy[key], key).toMatch(/music/i);
      expect(calibrationCopy[key], key).not.toMatch(/hiss/i);
      expect(calibrationCopy.hiss[key], key).toMatch(/hiss/i);
    }
    for (const key of ["whyLine", "keysLine", "keptLine"] as const) {
      expect(calibrationCopy[key], key).not.toMatch(/music|hiss/i);
    }
    // The hiss's line says what the sound is and nothing about why the music is missing.
    expect(calibrationCopy.hiss.openLine).not.toMatch(
      /load|could not|fail|missing|music cannot/i,
    );
  });
});

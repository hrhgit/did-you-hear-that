import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { findBannedTerms } from "./find-banned-terms";
import * as replayCopyModule from "./replay-copy";
import { replayCopy } from "./replay-copy";
import type {
  ReplayEndingName,
  ReplayPauseName,
  ReplaySideName,
} from "./replay-lines";
import {
  announcementLines,
  countWords,
  endLine,
  positionLabel,
  rippleLabel,
  selectionLine,
  sideCountLine,
} from "./replay-lines";

// The copy of the missed-sound replay (missed-sound-replay design.md, "The copy" and "The copy
// tests").

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

const constantStrings = stringsOf("replayCopy", replayCopyModule);

describe("the replay's fixed copy", () => {
  it("has strings to check", () => {
    expect(constantStrings.length).toBe(10);
  });

  it.each(constantStrings)(
    "$path is non-empty, trimmed and uses no banned term",
    ({ text }) => {
      expect(findBannedTerms(text, bannedTerms)).toEqual([]);
      expect(text.trim()).toBe(text);
      expect(text).not.toBe("");
    },
  );

  it("has the design's wording", () => {
    expect(replayCopy).toEqual({
      heading: "The sounds you did not catch",
      startButton: "Play them",
      skipButton: "Skip them",
      skipRestButton: "Skip the rest",
      goOnButton: "See the picture",
      resumeButton: "Go on",
      stopButton: "Stop the sounds",
      nothingMissedLine:
        "You answered every sound I made, so I have nothing to play again.",
      pauseLines: {
        hidden:
          "The sounds paused while this page was out of sight. When you go on, they carry on where they stopped.",
        interrupted:
          "Something else on this device took over the sound, so the sounds paused. When you go on, they carry on where they stopped.",
      },
    });
  });

  it("is frozen, with its pause lines", () => {
    expect(Object.isFrozen(replayCopy)).toBe(true);
    expect(Object.isFrozen(replayCopy.pauseLines)).toBe(true);
  });
});

const sides: readonly ReplaySideName[] = ["left", "right"];
const endings: readonly ReplayEndingName[] = [
  "allPlayed",
  "deviceChanged",
  "soundRefused",
];
const pauseNames: readonly ReplayPauseName[] = ["hidden", "interrupted"];

/** Counts 0 to 25, 56, 99, 100, 101, 999 and 1000 (design.md, "The copy tests"). */
const counts: readonly number[] = [
  ...Array.from({ length: 26 }, (_, index) => index),
  56,
  99,
  100,
  101,
  999,
  1000,
];

/** Missed levels from −70 to 15 dB in 5 dB steps, and −0.4, 0 and 0.4. */
const missedLevels: readonly number[] = [
  ...Array.from({ length: 18 }, (_, index) => -70 + index * 5),
  -0.4,
  0,
  0.4,
];

/** Every pitch of every visit type, once each. */
const frequencies: readonly number[] = [
  ...new Set(Object.values(hearingMethodConfig.roomFrequenciesHz).flat()),
];

const raises: readonly number[] = [1, 5, 10, 20, 20.4, 35];

/** The caught counts tried for a made count: the edges, a few small ones and the middle. */
function caughtCountsOf(madeCount: number): number[] {
  return [
    ...new Set([
      0,
      1,
      2,
      3,
      Math.floor(madeCount / 2),
      madeCount - 1,
      madeCount,
    ]),
  ].filter((count) => count >= 0 && count <= madeCount);
}

/** The wrong-side counts tried when this many sounds were made and caught. */
function wrongSideCountsOf(madeCount: number, caughtCount: number): number[] {
  const most = madeCount - caughtCount;
  return [...new Set([0, 1, 2, 3, most])].filter(
    (count) => count >= 0 && count <= most,
  );
}

/** The output of every function of replay-lines.ts for the representative inputs. */
function representativeOutputs(): string[] {
  const outputs: string[] = [];
  for (const raise of raises) {
    outputs.push(...announcementLines(raise));
  }
  for (const missedCount of counts) {
    for (const replayCount of counts) {
      if (replayCount >= 1 && replayCount < missedCount) {
        outputs.push(selectionLine(missedCount, replayCount));
      }
      if (replayCount <= missedCount && replayCount >= 1) {
        if (replayCount !== 1 || missedCount === 1) {
          outputs.push(endLine("allPlayed", replayCount, missedCount));
        }
      }
    }
  }
  for (const ending of endings) {
    if (ending !== "allPlayed") {
      outputs.push(endLine(ending, 20, 56), endLine(ending, 3, 3));
    }
  }
  for (const count of counts) {
    if (count >= 1) {
      for (const position of new Set([1, Math.ceil(count / 2), count])) {
        outputs.push(positionLabel(position, count));
      }
    }
  }
  for (const side of sides) {
    for (const frequencyHz of frequencies) {
      for (const missedLevelDb of missedLevels) {
        outputs.push(
          rippleLabel(side, frequencyHz, missedLevelDb, false),
          rippleLabel(side, frequencyHz, missedLevelDb, true),
        );
      }
    }
    for (const madeCount of counts) {
      for (const caughtCount of caughtCountsOf(madeCount)) {
        for (const wrongSideCount of wrongSideCountsOf(
          madeCount,
          caughtCount,
        )) {
          outputs.push(
            sideCountLine(side, madeCount, caughtCount, wrongSideCount),
          );
        }
      }
    }
  }
  outputs.push(...counts.map(countWords));
  for (const pauseName of pauseNames) {
    outputs.push(replayCopy.pauseLines[pauseName]);
  }
  return outputs;
}

/** The forms a number of decibels may be followed by (design.md, "The copy tests"). */
const decibelEndings: readonly string[] = [
  " quieter than your calibration",
  " louder than your calibration",
  " louder than when it went by",
];

/** The numbers of decibels in `text` that are not followed by an allowed form. */
function unlabelledDecibels(text: string): string[] {
  const unlabelled: string[] = [];
  for (const match of text.matchAll(/\d+ dB/g)) {
    const after = text.slice(match.index + match[0].length);
    if (!decibelEndings.some((ending) => after.startsWith(ending))) {
      unlabelled.push(`${match[0]}${after.slice(0, 30)}`);
    }
  }
  return unlabelled;
}

describe("countWords", () => {
  it("gives the words of the design", () => {
    expect(
      [0, 7, 13, 20, 56, 100, 105, 999, 1000].map((count) => countWords(count)),
    ).toEqual([
      "zero",
      "seven",
      "thirteen",
      "twenty",
      "fifty-six",
      "one hundred",
      "one hundred and five",
      "nine hundred and ninety-nine",
      "1000",
    ]);
  });

  it("writes the tens, the teens and the hundreds", () => {
    expect(countWords(1)).toBe("one");
    expect(countWords(19)).toBe("nineteen");
    expect(countWords(21)).toBe("twenty-one");
    expect(countWords(40)).toBe("forty");
    expect(countWords(99)).toBe("ninety-nine");
    expect(countWords(101)).toBe("one hundred and one");
    expect(countWords(110)).toBe("one hundred and ten");
    expect(countWords(256)).toBe("two hundred and fifty-six");
    expect(countWords(900)).toBe("nine hundred");
    expect(countWords(12345)).toBe("12345");
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s",
    (count) => {
      expect(() => countWords(count)).toThrow(RangeError);
    },
  );
});

describe("announcementLines", () => {
  it("gives the four lines of the design for a raise of 20 dB", () => {
    expect(announcementLines(20)).toEqual([
      "Before you leave, I will play again the sounds you did not catch.",
      "Each one comes from the room and the side where I made it, in the order I made them.",
      "Each one is 20 dB louder than when it went by, but never louder than the house may play.",
      "Leave the volume as it is. You can stop the sounds at any moment.",
    ]);
  });

  it("rounds the raise to a whole number in line 3, and changes nothing else", () => {
    const lines = announcementLines(12.6);
    expect(lines[2]).toBe(
      "Each one is 13 dB louder than when it went by, but never louder than the house may play.",
    );
    expect([lines[0], lines[1], lines[3]]).toEqual([
      announcementLines(20)[0],
      announcementLines(20)[1],
      announcementLines(20)[3],
    ]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(announcementLines(20))).toBe(true);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a raise of %s",
    (raiseDb) => {
      expect(() => announcementLines(raiseDb)).toThrow(RangeError);
    },
  );
});

describe("selectionLine", () => {
  it("gives the line of the design", () => {
    expect(selectionLine(56, 20)).toBe(
      "You did not catch fifty-six sounds. I will play twenty of them, spread over the whole visit.",
    );
  });

  it.each([
    [20, 20],
    [20, 21],
    [20, 0],
    [0, 0],
    [56, 2.5],
    [-1, 1],
    [Number.NaN, 1],
  ])("refuses %s missed and %s played", (missedCount, replayCount) => {
    expect(() => selectionLine(missedCount, replayCount)).toThrow(RangeError);
  });
});

describe("positionLabel", () => {
  it("gives the label of the design", () => {
    expect(positionLabel(3, 20)).toBe("Sound 3 of 20");
    expect(positionLabel(1, 1)).toBe("Sound 1 of 1");
  });

  it.each([
    [0, 20],
    [21, 20],
    [1.5, 20],
    [1, 0],
    [1, Number.NaN],
  ])("refuses position %s of %s", (position, count) => {
    expect(() => positionLabel(position, count)).toThrow(RangeError);
  });
});

describe("rippleLabel", () => {
  it("gives the labels of the design", () => {
    expect(rippleLabel("left", 4000, -35, false)).toBe(
      "On your left, 4 kHz. When you did not catch it, it was 35 dB quieter than your calibration. Now it is louder.",
    );
    expect(rippleLabel("right", 1000, 5, true)).toBe(
      "On your right, 1 kHz. When you did not catch it, it was 5 dB louder than your calibration. Now it is as loud as the house may play.",
    );
  });

  it.each(sides)(
    "says a level that rounds to 0 is as loud as the calibration, on the %s",
    (side) => {
      expect(rippleLabel(side, 500, 0.3, false)).toBe(
        `On your ${side}, 500 Hz. When you did not catch it, it was as loud as your calibration. Now it is louder.`,
      );
    },
  );

  it("refuses a side, a pitch or a level that does not fit", () => {
    expect(() => rippleLabel("up" as ReplaySideName, 1000, -20, false)).toThrow(
      RangeError,
    );
    expect(() => rippleLabel("left", 0, -20, false)).toThrow(RangeError);
    expect(() => rippleLabel("left", Number.NaN, -20, false)).toThrow(
      RangeError,
    );
    expect(() => rippleLabel("left", 1000, Number.NaN, false)).toThrow(
      RangeError,
    );
  });
});

describe("sideCountLine", () => {
  it("gives the lines of the design", () => {
    expect(sideCountLine("left", 0, 0, 0)).toBe(
      "I have not made a sound on your left yet.",
    );
    expect(sideCountLine("right", 0, 0, 0)).toBe(
      "I have not made a sound on your right yet.",
    );
    expect(sideCountLine("left", 1, 1, 0)).toBe(
      "On your left I made one sound. You caught it.",
    );
    expect(sideCountLine("left", 1, 0, 0)).toBe(
      "On your left I made one sound. You did not catch it.",
    );
    expect(sideCountLine("left", 1, 0, 1)).toBe(
      "On your left I made one sound. You named the other side.",
    );
    expect(sideCountLine("right", 7, 3, 0)).toBe(
      "On your right I made seven sounds. You caught three.",
    );
    expect(sideCountLine("right", 7, 7, 0)).toBe(
      "On your right I made seven sounds. You caught every one.",
    );
    expect(sideCountLine("right", 7, 0, 0)).toBe(
      "On your right I made seven sounds. You caught none of them.",
    );
    expect(sideCountLine("right", 7, 3, 1)).toBe(
      "On your right I made seven sounds. You caught three. Once you named the other side.",
    );
    expect(sideCountLine("left", 9, 4, 2)).toBe(
      "On your left I made nine sounds. You caught four. Two times you named the other side.",
    );
  });

  it("capitalises the number word of three or more answers on the other side", () => {
    expect(sideCountLine("right", 9, 2, 3)).toBe(
      "On your right I made nine sounds. You caught two. Three times you named the other side.",
    );
    expect(sideCountLine("left", 56, 0, 21)).toBe(
      "On your left I made fifty-six sounds. You caught none of them. Twenty-one times you named the other side.",
    );
  });

  it.each([
    [1, 1, 1],
    [7, 5, 3],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [7, 1.5, 0],
    [7, 0, Number.NaN],
    [Number.POSITIVE_INFINITY, 0, 0],
  ])(
    "refuses %s made, %s caught and %s on the other side",
    (made, caught, wrong) => {
      expect(() => sideCountLine("left", made, caught, wrong)).toThrow(
        RangeError,
      );
    },
  );

  it("refuses a side it does not know", () => {
    expect(() => sideCountLine("up" as ReplaySideName, 1, 1, 0)).toThrow(
      RangeError,
    );
  });
});

describe("endLine", () => {
  it("gives the lines of the design", () => {
    expect(endLine("allPlayed", 1, 1)).toBe(
      "That was the one sound you did not catch.",
    );
    expect(endLine("allPlayed", 2, 2)).toBe(
      "That was every sound you did not catch.",
    );
    expect(endLine("allPlayed", 13, 13)).toBe(
      "That was every sound you did not catch.",
    );
    expect(endLine("allPlayed", 20, 56)).toBe(
      "Those were twenty of the fifty-six sounds you did not catch.",
    );
    expect(endLine("deviceChanged", 20, 56)).toBe(
      "Your audio device changed, so I cannot play the sounds again. Your picture is ready.",
    );
    expect(endLine("deviceChanged", 3, 3)).toBe(
      endLine("deviceChanged", 20, 56),
    );
    expect(endLine("soundRefused", 20, 56)).toBe(
      "The house could not play these sounds on this device, so it stopped them. Your picture is ready.",
    );
    expect(endLine("soundRefused", 3, 3)).toBe(endLine("soundRefused", 20, 56));
  });

  it.each([
    ["allPlayed", 0, 0],
    ["allPlayed", 0, 5],
    ["allPlayed", 1, 5],
    ["allPlayed", 6, 5],
    ["deviceChanged", 6, 5],
    ["soundRefused", -1, 5],
    ["allPlayed", 2.5, 5],
    ["allPlayed", 2, Number.NaN],
    ["somethingElse", 2, 2],
  ] as const)(
    "refuses %s with %s of %s",
    (ending, replayCount, missedCount) => {
      expect(() =>
        endLine(ending as ReplayEndingName, replayCount, missedCount),
      ).toThrow(RangeError);
    },
  );
});

describe("the replay's lines for representative inputs", () => {
  const outputs = representativeOutputs();

  it("has outputs to check", () => {
    expect(outputs.length).toBeGreaterThan(1000);
  });

  it("uses no banned term in any output", () => {
    const found = outputs.flatMap((text) =>
      findBannedTerms(text, bannedTerms).map((term) => `${term}: ${text}`),
    );
    expect(found).toEqual([]);
  });

  it("gives no output that is empty or starts or ends with white space", () => {
    expect(
      outputs.filter((text) => text === "" || text.trim() !== text),
    ).toEqual([]);
  });

  it("follows every number of decibels with a level relative to the calibration or the raise as a difference", () => {
    expect(outputs.flatMap(unlabelledDecibels)).toEqual([]);
  });
});

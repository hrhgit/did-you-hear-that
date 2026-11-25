import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import { findBannedTerms } from "./find-banned-terms";
import * as frontDoor from "./front-door-copy";
import { frontDoorCopy } from "./front-door-copy";
import * as leaving from "./leaving-copy";
import * as room from "./room-copy";
import {
  longestRowLine,
  roomCaughtLine,
  totalCaughtLine,
} from "./result-page-copy";
import {
  betweenRoomsLine,
  caughtCountLine,
  deepestCatchLabel,
  otherSideLine,
  slippedLine,
  caughtLine,
  pitchLabel,
  relativeLevelLabel,
  roomCopy,
  roomNames,
  roomProgressLine,
} from "./room-copy";
import * as rules from "./rules-copy";
import { rulesCopy } from "./rules-copy";
import { calibrationCopy } from "./calibration-copy";
import { leavingCopy } from "./leaving-copy";
import * as visit from "./visit-copy";
import { visitCopy } from "./visit-copy";

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
  ...stringsOf("frontDoor", frontDoor),
  ...stringsOf("rules", rules),
  ...stringsOf("room", room),
  ...stringsOf("leaving", leaving),
  ...stringsOf("visit", visit),
];

const frequencies = fc.double({ min: 20, max: 20000, noNaN: true });
const levels = fc.double({ min: -200, max: 200, noNaN: true });
const sides = fc.constantFrom("left" as const, "right" as const);
const rooms = fc.constantFrom<GhostSoundId>(...ghostSoundIds);

describe("the house interface's copy", () => {
  it("has strings to check", () => {
    expect(constantStrings.length).toBeGreaterThan(25);
  });

  it.each(constantStrings)("$path uses no banned term", ({ text }) => {
    expect(findBannedTerms(text, bannedTerms)).toEqual([]);
    expect(text.trim()).toBe(text);
    expect(text).not.toBe("");
  });

  it.each(constantStrings)(
    "$path says nothing about hands (audible-start R7.2)",
    ({ text }) => {
      expect(text).not.toMatch(/\bhands?\b/i);
    },
  );

  it("heads the calibration screens with the music's headings until the page reads the snapshot's (audible-start D32)", () => {
    expect(visitCopy.calibrationHeading).toBe(calibrationCopy.heading);
    expect(visitCopy.recalibrateHeading).toBe(calibrationCopy.againHeading);
  });

  it("says that a changed audio device means calibrating again, without naming the calibration sound", () => {
    expect(leavingCopy.pauseLines.deviceChanged).toBe(
      "Your audio device changed, so the visit paused. You will calibrate again, and then this room starts over.",
    );
    expect(leavingCopy.pauseLines.deviceChanged).not.toMatch(/hiss|music/i);
  });

  it("opens with the line the brief fixes for the front door", () => {
    expect(frontDoorCopy.headphonesLine).toBe(
      "Put on headphones. Turn off noise cancelling.",
    );
  });

  it("offers the full visit and the replay", () => {
    expect(Object.keys(frontDoorCopy.choices)).toEqual(["full", "replay"]);
  });

  it("gives the rules as four sentences and explains both ways to answer", () => {
    // The fourth, about the beat and Jack, came with the rhythm game of 2026-11-18.
    expect(rulesCopy.sentences).toHaveLength(4);
    for (const sentence of rulesCopy.sentences) {
      expect(sentence.match(/[.!?]/g)).toHaveLength(1);
      expect(sentence.endsWith(".")).toBe(true);
    }
    expect(rulesCopy.keyboardLine).toMatch(/arrow key/);
    expect(rulesCopy.keyboardLine).toMatch(/\bA\b.*\bL\b/);
    expect(rulesCopy.touchLine).toMatch(/left or right half of the screen/);
  });

  it("says the fixed line after an answer on a trial with no sound", () => {
    expect(roomCopy.noSoundLine).toBe("I made no sound that time.");
  });

  it("names every room", () => {
    expect(Object.keys(roomNames)).toEqual([...ghostSoundIds]);
  });
});

describe("pitchLabel", () => {
  it("labels the five rooms' pitches", () => {
    expect([500, 1000, 2000, 4000, 8000].map(pitchLabel)).toEqual([
      "500 Hz",
      "1 kHz",
      "2 kHz",
      "4 kHz",
      "8 kHz",
    ]);
    expect(pitchLabel(2500)).toBe("2.5 kHz");
  });

  it("refuses a pitch that is not a positive number", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => pitchLabel(bad)).toThrow(RangeError);
    }
  });
});

describe("relativeLevelLabel", () => {
  it("says quieter, louder or as loud, in whole decibels", () => {
    expect(relativeLevelLabel(-25)).toBe("25 dB quieter than your calibration");
    expect(relativeLevelLabel(5)).toBe("5 dB louder than your calibration");
    expect(relativeLevelLabel(0)).toBe("as loud as your calibration");
    expect(relativeLevelLabel(-0.4)).toBe("as loud as your calibration");
    expect(relativeLevelLabel(-12.6)).toBe(
      "13 dB quieter than your calibration",
    );
  });

  it("always labels a level as relative to the visitor's own calibration", () => {
    fc.assert(
      fc.property(levels, (levelDb) => {
        const label = relativeLevelLabel(levelDb);
        expect(label).toMatch(/your calibration$/);
        expect(label).not.toMatch(/-|−/);
        expect(findBannedTerms(label, bannedTerms)).toEqual([]);
      }),
    );
  });

  it("refuses a level that is not finite", () => {
    expect(() => relativeLevelLabel(Number.NaN)).toThrow(RangeError);
    expect(() => relativeLevelLabel(Number.NEGATIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("roomProgressLine", () => {
  it("says where the visitor is", () => {
    expect(roomProgressLine(1, 3)).toBe("Room 1 of 3");
    expect(roomProgressLine(5, 5)).toBe("Room 5 of 5");
  });

  it("refuses numbers that do not fit a visit", () => {
    for (const [number, count] of [
      [0, 3],
      [4, 3],
      [1.5, 3],
      [1, 2.5],
    ] as const) {
      expect(() => roomProgressLine(number, count)).toThrow(RangeError);
    }
  });
});

describe("caughtLine", () => {
  it("names the side, the pitch and the level", () => {
    expect(caughtLine("left", 2000, -15)).toBe(
      "You caught it on your left. 2 kHz, 15 dB quieter than your calibration.",
    );
  });

  it("uses no banned term for any sound", () => {
    fc.assert(
      fc.property(sides, frequencies, levels, (side, frequencyHz, levelDb) => {
        const line = caughtLine(side, frequencyHz, levelDb);
        expect(line).toContain(side);
        expect(line).toContain("your calibration");
        expect(findBannedTerms(line, bannedTerms)).toEqual([]);
      }),
    );
  });
});

describe("the lines of the chase (game layer)", () => {
  const sides = fc.constantFrom("left" as const, "right" as const);

  it("says where a sound went by, or was, naming only its side", () => {
    fc.assert(
      fc.property(sides, (side) => {
        for (const line of [slippedLine(side), otherSideLine(side)]) {
          expect(line).toContain(`your ${side}`);
          expect(findBannedTerms(line, bannedTerms)).toEqual([]);
        }
      }),
    );
  });

  it("counts the catches in whole numbers", () => {
    expect(caughtCountLine(0)).toBe("0 caught");
    fc.assert(
      fc.property(fc.nat(500), (count) => {
        expect(findBannedTerms(caughtCountLine(count), bannedTerms)).toEqual(
          [],
        );
      }),
    );
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => caughtCountLine(bad)).toThrow(RangeError);
    }
  });

  it("labels the quietest catch on a side against the visitor's calibration", () => {
    expect(deepestCatchLabel("left", null)).toBe(
      "Nothing caught on your left yet",
    );
    fc.assert(
      fc.property(sides, levels, (side, levelDb) => {
        const label = deepestCatchLabel(side, levelDb);
        expect(label).toMatch(/your calibration$/);
        expect(label).toContain(`your ${side}`);
        expect(findBannedTerms(label, bannedTerms)).toEqual([]);
      }),
    );
  });

  it("names the beat and Jack in the rules", () => {
    const rules = rulesCopy.sentences.join(" ");
    expect(rules).toMatch(/beat/);
    expect(rules).toMatch(/Jack/);
    expect(rules).not.toMatch(/lantern of/);
  });
});

describe("the score of the chase on the result page", () => {
  it("counts the catches, the longest row and each room in whole numbers", () => {
    expect(totalCaughtLine(1)).toBe("1 caught in all");
    expect(totalCaughtLine(23)).toBe("23 caught in all");
    expect(longestRowLine(1)).toBe("Never two in a row");
    expect(longestRowLine(6)).toBe("Longest row: 6 in a row");
    expect(roomCaughtLine("Cellar", 7)).toBe("Cellar: 7 caught");
    fc.assert(
      fc.property(fc.nat(500), (count) => {
        for (const line of [
          totalCaughtLine(count),
          longestRowLine(count),
          ...ghostSoundIds.map((id) => roomCaughtLine(roomNames[id], count)),
        ]) {
          expect(findBannedTerms(line, bannedTerms)).toEqual([]);
          expect(line).not.toMatch(/dB|quiet|loud/i);
        }
      }),
    );
    for (const bad of [-1, 2.5, Number.NaN]) {
      expect(() => totalCaughtLine(bad)).toThrow(RangeError);
      expect(() => longestRowLine(bad)).toThrow(RangeError);
      expect(() => roomCaughtLine("Cellar", bad)).toThrow(RangeError);
    }
  });
});

describe("betweenRoomsLine", () => {
  it("names the room that comes next and uses no banned term", () => {
    fc.assert(
      fc.property(rooms, (roomId) => {
        const line = betweenRoomsLine(roomId);
        expect(line).toContain(roomNames[roomId].toLowerCase());
        expect(findBannedTerms(line, bannedTerms)).toEqual([]);
      }),
    );
    expect(betweenRoomsLine("stairs")).toBe(
      "This room is quiet now. The stairs are next, when you are ready.",
    );
  });
});

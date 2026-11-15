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
  betweenRoomsLine,
  caughtLine,
  pitchLabel,
  relativeLevelLabel,
  roomCopy,
  roomNames,
  roomProgressLine,
} from "./room-copy";
import * as rules from "./rules-copy";
import { rulesCopy } from "./rules-copy";

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

  it("opens with the line the brief fixes for the front door", () => {
    expect(frontDoorCopy.headphonesLine).toBe(
      "Put on headphones. Turn off noise cancelling.",
    );
  });

  it("offers the three ways in", () => {
    expect(Object.keys(frontDoorCopy.choices)).toEqual([
      "quick",
      "full",
      "replay",
    ]);
  });

  it("gives the rules as three sentences and explains both ways to answer", () => {
    expect(rulesCopy.sentences).toHaveLength(3);
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

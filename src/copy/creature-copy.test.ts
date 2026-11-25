import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import type { GhostSoundId } from "../config/sound-id";
import { ghostSoundIds } from "../config/sound-id";
import * as creatures from "./creature-copy";
import { roomNames } from "./room-copy";
import {
  creatureCardLabel,
  creatureCaughtCountLine,
  creatureCaughtLine,
  creatureCopy,
  creatureGoneLine,
  creatureIntroLine,
  creatureOtherSideLine,
  creatureSlippedLine,
  oneRoomCopy,
  rollCallCaughtLine,
  rollCallCopy,
  rollCallNotHeardLines,
  stillAboutLine,
} from "./creature-copy";
import { findBannedTerms } from "./find-banned-terms";

/** Every string reachable from the module's exports, with the path to it. */
function stringsOf(
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
    walk(value, name);
  }
  return found;
}

const constantStrings = stringsOf(creatures);

const roomIds = fc.constantFrom<GhostSoundId>(...ghostSoundIds);
const sides = fc.constantFrom("left" as const, "right" as const);
const frequencies = fc.double({ min: 20, max: 20000, noNaN: true });
const levels = fc.double({ min: -200, max: 200, noNaN: true });
const catchLevels = fc.option(levels, { nil: null });

/** What every line the house builds about a creature must keep to (wording.md). */
function expectFitToRead(line: string): void {
  expect(findBannedTerms(line, bannedTerms)).toEqual([]);
  expect(line).not.toMatch(/\bhands?\b/i);
  expect(line.trim()).toBe(line);
  expect(line).not.toBe("");
}

describe("the creatures' copy (one-room spec)", () => {
  it("has strings to check", () => {
    expect(constantStrings.length).toBeGreaterThan(25);
  });

  it.each(constantStrings)(
    "$path uses no banned term and says nothing about hands",
    ({ text }) => {
      expectFitToRead(text);
    },
  );

  it("gives every sound of the house a creature of its own", () => {
    expect(Object.keys(creatureCopy)).toEqual([...ghostSoundIds]);
    const names = ghostSoundIds.map((id) => creatureCopy[id].name);
    expect(new Set(names).size).toBe(names.length);
    const kinds = ghostSoundIds.map((id) => creatureCopy[id].kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const id of ghostSoundIds) {
      const { name, kind, home, soundLine } = creatureCopy[id];
      // A name of its own, and a kind and a home that read inside a sentence.
      expect(name).toMatch(/^[A-Z][a-z]+$/);
      expect(kind).toMatch(/^the [a-z ]+$/);
      expect(home).toBe(`the ${id}`);
      // Its sound in one short sentence.
      expect(soundLine.match(/[.!?]/g)).toHaveLength(1);
      expect(soundLine.endsWith(".")).toBe(true);
    }
  });

  it("keeps more than ghosts in the house", () => {
    const kinds = ghostSoundIds.map((id) => creatureCopy[id].kind);
    expect(kinds.filter((kind) => kind === "the ghost")).toHaveLength(1);
  });

  it("introduces a creature by its name, what it is, where it lives and its sound", () => {
    expect(creatureIntroLine("attic")).toBe(
      "Squeak, the bat from the attic. A thin, high whine.",
    );
    expect(creatureIntroLine("corridor")).toBe(
      "Murmur, the ghost from the corridor. A wavering hum.",
    );
    for (const id of ghostSoundIds) {
      expectFitToRead(creatureIntroLine(id));
    }
  });

  it("says nothing of a side in what it tells before the visitor answers", () => {
    const beforeAnAnswer = [
      rollCallCopy.heading,
      ...rollCallCopy.lines,
      ...rollCallCopy.countingLines,
      oneRoomCopy.sceneLabel,
      oneRoomCopy.shelfLabel,
      oneRoomCopy.goneLabel,
      ...ghostSoundIds.map(creatureIntroLine),
    ];
    for (const line of beforeAnAnswer) {
      expect(line).not.toMatch(/\b(left|right)\b/i);
    }
  });

  it("says at the roll call that nothing counts yet, and when it does", () => {
    expect(rollCallCopy.lines.join(" ")).toMatch(/Nothing counts yet\./);
    expect(rollCallCopy.countingLines[0]).toMatch(/^Now it counts\./);
    // It tells of the turns with no sound, so an answer to silence is no surprise.
    expect(rollCallCopy.countingLines.join(" ")).toMatch(/no sound at all/);
  });
});

describe("rollCallCaughtLine", () => {
  it("names the creature whose sound was caught, in the past", () => {
    expect(rollCallCaughtLine("attic")).toBe("That was Squeak.");
    for (const id of ghostSoundIds) {
      const line = rollCallCaughtLine(id);
      expect(line).toBe(`That was ${creatureCopy[id].name}.`);
      expectFitToRead(line);
    }
  });
});

describe("rollCallNotHeardLines", () => {
  it("says who was not caught on one side and what to check", () => {
    expect(rollCallNotHeardLines([{ roomId: "attic", side: "left" }])).toEqual([
      "Not caught, even a little louder: Squeak on your left.",
      "Check that both earpieces are in.",
    ]);
  });

  it("says either side for a creature missed on both, once", () => {
    const [who] = rollCallNotHeardLines([
      { roomId: "attic", side: "left" },
      { roomId: "attic", side: "right" },
    ]);
    expect(who).toBe(
      "Not caught, even a little louder: Squeak on either side.",
    );
  });

  it("joins two creatures with and, and more with commas and a last and, in the order given", () => {
    expect(
      rollCallNotHeardLines([
        { roomId: "stairs", side: "right" },
        { roomId: "cellar", side: "left" },
      ])[0],
    ).toBe(
      "Not caught, even a little louder: Scritch on your right and Thump on your left.",
    );
    expect(
      rollCallNotHeardLines([
        { roomId: "cellar", side: "left" },
        { roomId: "nursery", side: "left" },
        { roomId: "nursery", side: "right" },
        { roomId: "attic", side: "right" },
      ])[0],
    ).toBe(
      "Not caught, even a little louder: Thump on your left, Tink on either side and Squeak on your right.",
    );
  });

  it("names every creature that was missed and no other, whatever was missed", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.record({ roomId: roomIds, side: sides }), {
          minLength: 1,
          maxLength: 10,
          selector: ({ roomId, side }) => `${roomId}:${side}`,
        }),
        (missed) => {
          const lines = rollCallNotHeardLines(missed);
          expect(lines).toHaveLength(2);
          expect(Object.isFrozen(lines)).toBe(true);
          for (const line of lines) {
            expectFitToRead(line);
          }
          const who = lines[0] ?? "";
          for (const id of ghostSoundIds) {
            const sidesMissed = missed.filter(({ roomId }) => roomId === id);
            const { name } = creatureCopy[id];
            if (sidesMissed.length === 0) {
              expect(who).not.toContain(name);
            } else {
              const where =
                sidesMissed.length > 1
                  ? "either side"
                  : `your ${sidesMissed[0]?.side ?? ""}`;
              expect(who).toContain(`${name} on ${where}`);
              // Each creature once.
              expect(who.split(name)).toHaveLength(2);
            }
          }
        },
      ),
    );
  });

  it("refuses an empty list", () => {
    expect(() => rollCallNotHeardLines([])).toThrow(RangeError);
    expect(() => rollCallNotHeardLines([])).toThrow(
      "The not-heard lines need at least one miss.",
    );
  });
});

describe("what the house says about a creature's sound", () => {
  it("says who was caught, the side, the pitch and the level against the visitor's calibration", () => {
    expect(creatureCaughtLine("attic", "left", 8000, -15)).toBe(
      "You caught Squeak on your left. 8 kHz, 15 dB quieter than your calibration.",
    );
    fc.assert(
      fc.property(
        roomIds,
        sides,
        frequencies,
        levels,
        (roomId, side, frequencyHz, levelDb) => {
          const line = creatureCaughtLine(roomId, side, frequencyHz, levelDb);
          expect(line).toContain(creatureCopy[roomId].name);
          expect(line).toContain(`your ${side}`);
          expect(line).toMatch(/your calibration\.$/);
          expectFitToRead(line);
        },
      ),
    );
  });

  it("says who went by, who was on the other side, and who has gone home", () => {
    expect(creatureSlippedLine("stairs", "right")).toBe(
      "Scritch got away on your right. Scritch-scritch, and away.",
    );
    expect(creatureOtherSideLine("nursery", "left")).toBe(
      "Other door: Tink was on your left. Tee-hee, it tinkles off.",
    );
    expect(creatureGoneLine("cellar")).toBe(
      "Thump has gone back to the cellar.",
    );
    fc.assert(
      fc.property(roomIds, sides, (roomId, side) => {
        const { name, home } = creatureCopy[roomId];
        for (const line of [
          creatureSlippedLine(roomId, side),
          creatureOtherSideLine(roomId, side),
        ]) {
          expect(line).toContain(name);
          expect(line).toContain(`your ${side}`);
          expectFitToRead(line);
        }
        const gone = creatureGoneLine(roomId);
        expect(gone).toContain(name);
        expect(gone).toContain(home);
        // Leaving names no side: it is not about a sound.
        expect(gone).not.toMatch(/\b(left|right)\b/i);
        expectFitToRead(gone);
      }),
    );
  });

  it("is calm about a sound that was not caught", () => {
    for (const id of ghostSoundIds) {
      for (const side of ["left", "right"] as const) {
        for (const line of [
          creatureSlippedLine(id, side),
          creatureOtherSideLine(id, side),
        ]) {
          expect(line).not.toMatch(/!|wrong|missed|mistake|too slow/i);
        }
      }
    }
  });
});

describe("the counts of the one room", () => {
  it("says how many creatures are still about", () => {
    expect(stillAboutLine(5)).toBe("5 still about");
    expect(stillAboutLine(1)).toBe("1 still about");
    expect(stillAboutLine(0)).toBe("All gone home");
  });

  it("says how many of a creature's sounds were caught", () => {
    expect(creatureCaughtCountLine(0)).toBe("0 caught");
    expect(creatureCaughtCountLine(4)).toBe("4 caught");
    fc.assert(
      fc.property(fc.nat(500), (count) => {
        expectFitToRead(stillAboutLine(count));
        expectFitToRead(creatureCaughtCountLine(count));
      }),
    );
  });

  it("refuses counts that are not whole numbers from 0 up", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => stillAboutLine(bad)).toThrow(RangeError);
      expect(() => stillAboutLine(bad)).toThrow(
        `The creatures still about must be a whole number from 0 up, but got ${String(bad)}.`,
      );
      expect(() => creatureCaughtCountLine(bad)).toThrow(
        `The sounds caught must be a whole number from 0 up, but got ${String(bad)}.`,
      );
      expect(() =>
        creatureCardLabel("attic", "about", bad, { left: null, right: null }),
      ).toThrow(RangeError);
    }
  });
});

describe("creatureCardLabel", () => {
  it("reads a creature's card aloud: who, where, how many caught, and the quietest catch on each side", () => {
    expect(
      creatureCardLabel("attic", "about", 0, { left: null, right: null }),
    ).toBe(
      "Squeak, the bat from the attic. 0 caught. Nothing caught on your left yet. Nothing caught on your right yet.",
    );
    expect(
      creatureCardLabel("cellar", "gone", 7, { left: -25, right: -10 }),
    ).toBe(
      "Thump, the skeleton, gone back to the cellar. 7 caught. Quietest catch on your left: 25 dB quieter than your calibration. Quietest catch on your right: 10 dB quieter than your calibration.",
    );
  });

  it("speaks of its own creature only, and labels every level against the visitor's calibration", () => {
    fc.assert(
      fc.property(
        roomIds,
        fc.constantFrom("about" as const, "gone" as const),
        fc.nat(500),
        catchLevels,
        catchLevels,
        (roomId, state, caughtCount, left, right) => {
          const label = creatureCardLabel(roomId, state, caughtCount, {
            left,
            right,
          });
          expectFitToRead(label);
          expect(label).toContain(creatureCopy[roomId].name);
          // Nothing joins one creature's card to another's (wording.md).
          for (const other of ghostSoundIds) {
            if (other !== roomId) {
              expect(label).not.toContain(creatureCopy[other].name);
            }
          }
          expect(label).toContain(`${String(caughtCount)} caught.`);
          const levelCount = [left, right].filter(
            (levelDb) => levelDb !== null,
          ).length;
          expect(label.match(/your calibration/g) ?? []).toHaveLength(
            levelCount,
          );
          expect(label.includes("gone back to")).toBe(state === "gone");
        },
      ),
    );
  });
});

describe("the names the visitor reads", () => {
  it("name each sound by its creature", () => {
    for (const roomId of ghostSoundIds) {
      expect(roomNames[roomId]).toBe(creatureCopy[roomId].name);
    }
  });
});

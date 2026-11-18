import { describe, expect, it } from "vitest";
import type {
  PictureFloor,
  PictureWing,
  ResultPicture,
} from "../../session/result-page-types";
import type { SwappedRepeatComparison } from "../../session/visit-flow-types";
import { layoutPictureSheet, wrapText } from "./picture-sheet";
import { resultViewBox } from "./result-geometry";

/** Every character is half as wide as the text is tall. */
const measure = (text: string, sizePx: number): number =>
  ([...text].length * sizePx) / 2;

const wing = (ear: "left" | "right"): PictureWing => ({
  ear,
  state: "found",
  lightDepthFraction: 0.5,
  line: `${ear} line`,
  reasonLine: null,
  earlier: null,
  valueLabel: `${ear} value`,
  valueNote: `${ear} note`,
});

const floor = (roomId: "corridor" | "stairs" | "attic"): PictureFloor => ({
  room: {
    roomIndex: ["corridor", "stairs", "attic"].indexOf(roomId),
    roomId,
    frequencyHz: 1000,
  },
  roomName: roomId,
  pitchLabel: "1 kHz",
  left: wing("left"),
  right: wing("right"),
  rightMinusLeftDb: 0,
  differenceLabel: "0 dB",
  differenceLine: "difference line",
  swappedRepeat: null,
  repeat: null,
  playableFloorLine: null,
  description: `description of the ${roomId}`,
});

const picture: ResultPicture = {
  kind: "live",
  visitType: "quick",
  heading: "The heading",
  dateLabel: "20 November 2026",
  visitTypeLabel: "Short visit, 3 rooms",
  floors: [floor("corridor"), floor("stairs"), floor("attic")],
  closedRoomIds: ["cellar", "nursery"],
  falseAlarmLine: "The line about silence.",
  visitNotice: null,
  limitsStatement: {
    heading: "What this picture can tell you",
    sentences: ["First.", "Second.", "Third.", "Fourth."],
  },
  comparison: null,
  imageCaption: "The caption of the image.",
  imageFileBaseName: "did-you-hear-that-2026-11-20",
};

describe("wrapText", () => {
  const widthOf = (text: string): number => [...text].length;

  it("keeps a short text on one line", () => {
    expect(wrapText("a short line", 40, widthOf)).toEqual(["a short line"]);
  });

  it("breaks between words and never makes a line wider than the limit", () => {
    const lines = wrapText(
      "the quietest sound you caught here was quieter",
      12,
      widthOf,
    );
    expect(lines.join(" ")).toBe(
      "the quietest sound you caught here was quieter",
    );
    for (const line of lines) {
      expect(widthOf(line)).toBeLessThanOrEqual(12);
    }
  });

  it("cuts a word that is wider than the limit, and loses none of it", () => {
    const lines = wrapText(`in ${"w".repeat(25)} out`, 10, widthOf);
    expect(lines.join("").replaceAll(" ", "")).toBe(`in${"w".repeat(25)}out`);
    for (const line of lines) {
      expect(widthOf(line)).toBeLessThanOrEqual(10);
    }
  });

  it("counts a character outside the basic plane as one and never splits it", () => {
    const lines = wrapText("🎧".repeat(7), 3, (text) => [...text].length);
    expect(lines).toEqual(["🎧🎧🎧", "🎧🎧🎧", "🎧"]);
  });

  it("gives no line for an empty text", () => {
    expect(wrapText("   ", 10, widthOf)).toEqual([]);
  });
});

describe("layoutPictureSheet", () => {
  const sheet = layoutPictureSheet(picture, null, measure);
  const texts = sheet.lines.map((line) => line.text);
  const whole = texts.join(" ");

  it("holds the limits statement in full: its heading and all four sentences", () => {
    expect(whole).toContain(picture.limitsStatement.heading);
    for (const sentence of picture.limitsStatement.sentences) {
      expect(texts).toContain(sentence);
    }
  });

  it("holds the heading, the caption, the line about silence and every floor in words", () => {
    expect(texts).toContain(picture.heading);
    expect(texts).toContain(picture.imageCaption);
    expect(texts).toContain(picture.falseAlarmLine);
    for (const entered of picture.floors) {
      expect(texts).toContain(entered.description);
    }
  });

  it("lists the floors from the top of the house down", () => {
    const yOf = (text: string): number =>
      sheet.lines.find((line) => line.text === text)?.y ?? Number.NaN;
    expect(yOf("description of the attic")).toBeLessThan(
      yOf("description of the stairs"),
    );
    expect(yOf("description of the stairs")).toBeLessThan(
      yOf("description of the corridor"),
    );
  });

  it("gives the drawing the proportions of the result's view box", () => {
    expect(sheet.drawing.height / sheet.drawing.width).toBeCloseTo(
      resultViewBox.height / resultViewBox.width,
      2,
    );
  });

  it("keeps every line and the drawing inside the sheet", () => {
    for (const line of sheet.lines) {
      expect(line.x).toBeGreaterThanOrEqual(0);
      expect(line.x + measure(line.text, line.sizePx)).toBeLessThanOrEqual(
        sheet.width,
      );
      expect(line.y).toBeGreaterThan(0);
      expect(line.y).toBeLessThan(sheet.height);
    }
    expect(sheet.drawing.x + sheet.drawing.width).toBeLessThanOrEqual(
      sheet.width,
    );
    expect(sheet.drawing.y + sheet.drawing.height).toBeLessThanOrEqual(
      sheet.height,
    );
  });

  it("keeps the text beside the drawing clear of it", () => {
    const beside = sheet.lines.filter((line) => line.y > sheet.drawing.y);
    expect(beside.length).toBeGreaterThan(0);
    for (const line of beside) {
      expect(line.x).toBeGreaterThan(sheet.drawing.x + sheet.drawing.width);
    }
  });

  it("leaves the headphones out when none are named", () => {
    expect(whole).not.toContain("Headphones");
  });

  it("writes the label and the name of the headphones apart, and wraps a long name", () => {
    const name = "n".repeat(400);
    const named = layoutPictureSheet(
      picture,
      { label: "Headphones", name },
      measure,
    );
    const label = named.lines.find((line) => line.text === "Headphones");
    expect(label).toBeDefined();
    const nameLines = named.lines.filter((line) => /^n+$/u.test(line.text));
    expect(nameLines.length).toBeGreaterThan(1);
    expect(nameLines.map((line) => line.text).join("")).toBe(name);
    for (const line of nameLines) {
      expect(line.x).toBeGreaterThan(label?.x ?? Number.NaN);
      expect(line.x + measure(line.text, line.sizePx)).toBeLessThanOrEqual(
        named.width,
      );
    }
    expect(named.height).toBeGreaterThan(sheet.height);
  });

  it("adds the notice about the whole visit and the line about an earlier visit when there are any", () => {
    const fuller = layoutPictureSheet(
      {
        ...picture,
        visitNotice: { heading: "The notice", line: "The notice's line." },
        comparison: { earlierSavedVisitId: "id", line: "The earlier line." },
      },
      null,
      measure,
    );
    const fullerTexts = fuller.lines.map((line) => line.text);
    expect(fullerTexts).toContain("The notice");
    expect(fullerTexts).toContain("The notice's line.");
    expect(fullerTexts).toContain("The earlier line.");
  });

  it("writes what a swapped repeat came to under its floor, and nothing for the other floors", () => {
    const repeat = {
      outcomeLabel: "The difference stayed with your ear",
      description: "The stairs both ways round, in words.",
    } as SwappedRepeatComparison;
    const repeated = layoutPictureSheet(
      {
        ...picture,
        floors: [
          floor("corridor"),
          { ...floor("stairs"), repeat },
          floor("attic"),
        ],
      },
      null,
      measure,
    );
    const yOf = (text: string): number =>
      repeated.lines.find((line) => line.text === text)?.y ?? Number.NaN;
    const xOf = (text: string): number =>
      repeated.lines.find((line) => line.text === text)?.x ?? Number.NaN;
    expect(yOf("description of the stairs")).toBeLessThan(
      yOf(repeat.outcomeLabel),
    );
    expect(yOf(repeat.outcomeLabel)).toBeLessThan(yOf(repeat.description));
    expect(yOf(repeat.description)).toBeLessThan(
      yOf("description of the corridor"),
    );
    // The words of the repeat stand in from the floor they belong to.
    expect(xOf(repeat.outcomeLabel)).toBeGreaterThan(
      xOf("description of the stairs"),
    );
    expect(xOf(repeat.description)).toBe(xOf(repeat.outcomeLabel));
    expect(repeated.height).toBeGreaterThanOrEqual(sheet.height);
    for (const line of repeated.lines) {
      expect(line.x + measure(line.text, line.sizePx)).toBeLessThanOrEqual(
        repeated.width,
      );
      expect(line.y).toBeLessThan(repeated.height);
    }
    expect(texts).not.toContain(repeat.outcomeLabel);
  });

  it("gives the same sheet for the same picture", () => {
    expect(layoutPictureSheet(picture, null, measure)).toEqual(sheet);
  });
});

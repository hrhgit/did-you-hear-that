import type { ResultPicture } from "../../session/result-page-types";
import { resultCurveViewBox } from "./result-curve-box";

/**
 * The saved image of a result, laid out as plain data: a sheet with the drawing at
 * the left and, beside it, what the picture can tell and each floor in words. The limits
 * statement is on every sheet, in full. A pure function of the picture and of how wide text is,
 * so it can be checked without a browser.
 */

/** How one run of text on the sheet looks. */
export type SheetTone = "moonlight" | "graphite" | "lamp";

/** One line of text on the sheet, already wrapped. `y` is its baseline. */
export interface SheetLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly sizePx: number;
  readonly italic: boolean;
  readonly tone: SheetTone;
}

/** A ruled line on the sheet. */
export interface SheetRule {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface PictureSheet {
  readonly width: number;
  readonly height: number;
  /** Where the drawing goes. It has the proportions of the result's view box. */
  readonly drawing: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly lines: readonly SheetLine[];
  readonly rules: readonly SheetRule[];
}

/** The visitor's own name for the headphones, with the label that stands before it. */
export interface SheetHeadphones {
  readonly label: string;
  readonly name: string;
}

/** Gives the width of `text` in pixels at a size, upright or italic. */
export type MeasureText = (
  text: string,
  sizePx: number,
  italic: boolean,
) => number;

const sheetWidth = 1600;
const margin = 72;
const drawingWidth = 600;
const columnGap = 64;
/** How far the words of a swapped repeat stand in from the floor they belong to. */
const repeatIndent = 28;

/**
 * Breaks text into lines no wider than `maxWidth`. A single word wider than that keeps a line to
 * itself, cut into pieces that fit, so nothing ever runs off the sheet.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  widthOf: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (): void => {
    if (line !== "") {
      lines.push(line);
      line = "";
    }
  };
  for (const word of text.split(/\s+/u).filter((part) => part !== "")) {
    const joined = line === "" ? word : `${line} ${word}`;
    if (widthOf(joined) <= maxWidth) {
      line = joined;
      continue;
    }
    push();
    let rest = word;
    while (widthOf(rest) > maxWidth && [...rest].length > 1) {
      const characters = [...rest];
      let count = characters.length - 1;
      while (
        count > 1 &&
        widthOf(characters.slice(0, count).join("")) > maxWidth
      ) {
        count -= 1;
      }
      lines.push(characters.slice(0, count).join(""));
      rest = characters.slice(count).join("");
    }
    line = rest;
  }
  push();
  return lines;
}

/**
 * Lays out the sheet for a picture. `drawingBox` is the view box of the drawing as the page shows
 * it, so the drawing keeps its proportions on the sheet.
 */
export function layoutPictureSheet(
  picture: ResultPicture,
  headphones: SheetHeadphones | null,
  measure: MeasureText,
  drawingBox: {
    readonly width: number;
    readonly height: number;
  } = resultCurveViewBox,
): PictureSheet {
  const lines: SheetLine[] = [];
  const rules: SheetRule[] = [];

  /** Writes a paragraph at `x` from `top` down and returns where it ends. */
  const paragraph = (
    text: string,
    x: number,
    top: number,
    maxWidth: number,
    sizePx: number,
    italic: boolean,
    tone: SheetTone,
  ): number => {
    const lineHeight = Math.round(sizePx * 1.42);
    let y = top;
    for (const line of wrapText(text, maxWidth, (part) =>
      measure(part, sizePx, italic),
    )) {
      y += lineHeight;
      lines.push({
        text: line,
        x,
        y: y - Math.round(sizePx * 0.36),
        sizePx,
        italic,
        tone,
      });
    }
    return y;
  };

  const fullWidth = sheetWidth - 2 * margin;
  let y = margin - 12;
  y = paragraph(picture.heading, margin, y, fullWidth, 60, false, "moonlight");
  y = paragraph(
    picture.imageCaption,
    margin,
    y + 6,
    fullWidth,
    26,
    false,
    "graphite",
  );
  if (headphones !== null) {
    // The label and the visitor's own name stand apart, as they do on the page.
    const labelWidth = measure(`${headphones.label}  `, 26, false);
    const top = y + 4;
    paragraph(headphones.label, margin, top, fullWidth, 26, false, "graphite");
    y = paragraph(
      headphones.name,
      margin + labelWidth,
      top,
      fullWidth - labelWidth,
      26,
      false,
      "moonlight",
    );
  }
  y = paragraph(
    picture.falseAlarmLine,
    margin,
    y + 18,
    fullWidth,
    32,
    true,
    "moonlight",
  );
  if (picture.visitNotice !== null) {
    y = paragraph(
      picture.visitNotice.heading,
      margin,
      y + 14,
      fullWidth,
      30,
      false,
      "lamp",
    );
    y = paragraph(
      picture.visitNotice.line,
      margin,
      y + 2,
      fullWidth,
      26,
      true,
      "moonlight",
    );
  }

  const bodyTop = y + 40;
  rules.push({
    x1: margin,
    y1: bodyTop - 16,
    x2: sheetWidth - margin,
    y2: bodyTop - 16,
  });
  const drawing = {
    x: margin,
    y: bodyTop,
    width: drawingWidth,
    height: Math.round((drawingWidth * drawingBox.height) / drawingBox.width),
  };

  // Beside the drawing: what the picture can tell, in full, then each floor from the top down.
  const columnX = margin + drawingWidth + columnGap;
  const columnWidth = sheetWidth - margin - columnX;
  let columnY = bodyTop;
  columnY = paragraph(
    picture.limitsStatement.heading,
    columnX,
    columnY,
    columnWidth,
    34,
    false,
    "moonlight",
  );
  for (const sentence of picture.limitsStatement.sentences) {
    columnY = paragraph(
      sentence,
      columnX,
      columnY + 10,
      columnWidth,
      25,
      false,
      "moonlight",
    );
  }
  columnY += 30;
  rules.push({
    x1: columnX,
    y1: columnY,
    x2: sheetWidth - margin,
    y2: columnY,
  });
  columnY += 8;
  for (const floor of [...picture.floors].reverse()) {
    columnY = paragraph(
      floor.description,
      columnX,
      columnY + 16,
      columnWidth,
      24,
      true,
      "moonlight",
    );
    if (floor.repeat !== null) {
      // The floor was visited again with the headphones swapped: what that came to, in words.
      columnY = paragraph(
        floor.repeat.outcomeLabel,
        columnX + repeatIndent,
        columnY + 8,
        columnWidth - repeatIndent,
        22,
        false,
        "lamp",
      );
      columnY = paragraph(
        floor.repeat.description,
        columnX + repeatIndent,
        columnY + 2,
        columnWidth - repeatIndent,
        22,
        true,
        "moonlight",
      );
    }
  }
  if (picture.comparison !== null) {
    columnY = paragraph(
      picture.comparison.line,
      columnX,
      columnY + 20,
      columnWidth,
      24,
      false,
      "graphite",
    );
  }

  return {
    width: sheetWidth,
    height: Math.max(drawing.y + drawing.height, columnY) + margin,
    drawing,
    lines,
    rules,
  };
}

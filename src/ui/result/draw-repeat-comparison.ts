import { createSeededRandom } from "../../config/seeded-random";
import type {
  SwappedRepeatComparison,
  SwappedRepeatComparisonRun,
  SwappedRepeatComparisonWing,
} from "../../session/visit-flow-types";
import { createSketchPen, type SketchPen } from "../house/sketch-pen";
import { svgElement } from "../house/svg-element";
import {
  repeatCentreX,
  repeatCrossingLine,
  repeatEarLabelY,
  repeatEarpieceLabelYs,
  repeatEdgeX,
  repeatLightBox,
  repeatRunLabelYs,
  repeatStripBox,
  repeatViewBox,
  repeatWingCentreX,
} from "./repeat-geometry";

/** What the drawing needs besides the comparison. */
export interface RepeatComparisonDrawingOptions {
  /** The seed of the pencil, so the same comparison is always drawn the same. */
  readonly seed: number;
  /**
   * Set in front of every id inside the drawing. Two drawings on one page must not share it:
   * each brings its own gradients and hatching.
   */
  readonly idPrefix: string;
  /** The words over the two wings: the visitor's own ears. */
  readonly earLabels: { readonly left: string; readonly right: string };
}

const sides = ["left", "right"] as const;

/** The corner radius of a lane, as on the result picture. */
const laneRadius = 14;

/** One wing of one strip: its light and the line where the light ends, or its hatching. */
function drawWing(
  doc: Document,
  pen: SketchPen,
  idPrefix: string,
  strip: 0 | 1,
  side: "left" | "right",
  wing: SwappedRepeatComparisonWing,
): SVGElement[] {
  const depth = wing.lightDepthFraction;
  const parts: SVGElement[] = [];
  if (depth === null) {
    // No level can be drawn here: the whole wing is hatched and stays unlit.
    const whole = repeatLightBox(strip, side, 1);
    parts.push(
      svgElement(doc, "rect", {
        class: "repeat-doubt",
        x: whole.left,
        y: whole.top,
        width: whole.right - whole.left,
        height: whole.bottom - whole.top,
        fill: `url(#${idPrefix}-doubt)`,
      }),
    );
  } else if (depth > 0) {
    const light = repeatLightBox(strip, side, depth);
    parts.push(
      svgElement(doc, "rect", {
        class: "repeat-light",
        x: light.left,
        y: light.top,
        width: light.right - light.left,
        height: light.bottom - light.top,
        fill: `url(#${idPrefix}-light-${side})`,
      }),
    );
    if (depth < 1) {
      const x = repeatEdgeX(side, depth);
      parts.push(
        svgElement(doc, "path", {
          class: "repeat-reach",
          d: pen.line([x, light.top], [x, light.bottom]),
        }),
      );
    }
  }
  return parts.map((part) => {
    part.setAttribute("data-side", side);
    part.setAttribute("data-state", wing.state);
    return part;
  });
}

/** One run of the room: a lane with a candle in the middle, and its words. */
function drawRun(
  doc: Document,
  pen: SketchPen,
  idPrefix: string,
  strip: 0 | 1,
  run: SwappedRepeatComparisonRun,
): SVGElement {
  const box = repeatStripBox(strip);
  const text = (
    className: string,
    x: number,
    y: number,
    words: string,
    anchor: "start" | "middle",
  ): SVGElement => {
    const element = svgElement(doc, "text", {
      class: className,
      x,
      y,
      "text-anchor": anchor,
    });
    element.textContent = words;
    return element;
  };
  const wickY = box.bottom - 26;
  const flameTip = wickY - 12;
  return svgElement(
    doc,
    "g",
    { class: "repeat-run", "data-arrangement": run.arrangement },
    [
      // The lane's bed, and its light kept inside its rounded ends.
      svgElement(doc, "rect", {
        class: "repeat-room",
        x: box.left,
        y: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
        rx: laneRadius,
      }),
      svgElement(
        doc,
        "g",
        { "clip-path": `url(#${idPrefix}-lane-${String(strip)})` },
        sides.flatMap((side) =>
          drawWing(doc, pen, idPrefix, strip, side, run[side]),
        ),
      ),
      // A small candle in the middle of the lane, where both halves of its light start.
      svgElement(doc, "rect", {
        class: "repeat-candle-wax",
        x: repeatCentreX - 3.5,
        y: wickY,
        width: 7,
        height: box.bottom - 8 - wickY,
        rx: 2,
      }),
      svgElement(doc, "path", {
        class: "repeat-candle-flame",
        d: `M${String(repeatCentreX)} ${String(flameTip)}C${String(repeatCentreX + 4.5)} ${String(wickY - 5)} ${String(repeatCentreX + 3.5)} ${String(wickY - 1)} ${String(repeatCentreX)} ${String(wickY - 1)}C${String(repeatCentreX - 3.5)} ${String(wickY - 1)} ${String(repeatCentreX - 4.5)} ${String(wickY - 5)} ${String(repeatCentreX)} ${String(flameTip)}Z`,
      }),
      text(
        "repeat-run-label",
        box.left,
        repeatRunLabelYs[strip],
        run.label,
        "start",
      ),
      ...sides.map((side) =>
        text(
          "repeat-earpiece-label",
          repeatWingCentreX(side),
          repeatEarpieceLabelYs[strip],
          run[side].earpieceLabel,
          "middle",
        ),
      ),
    ],
  );
}

/**
 * Draws a creature's first run and its swapped repeat as two lanes, one above the other. The visitor's left ear is
 * at the left in both. The light in each wing reaches as far as the comparison says, on the scale
 * of the result picture. Between the two strips each earpiece has a line from where it sat in the
 * first run to where it sat in the repeat, so the two lines cross. No scale is drawn.
 */
export function drawRepeatComparison(
  doc: Document,
  comparison: SwappedRepeatComparison,
  options: RepeatComparisonDrawingOptions,
): SVGElement {
  const { idPrefix } = options;
  const pen = createSketchPen(createSeededRandom(options.seed));
  const gradient = (side: "left" | "right"): SVGElement =>
    svgElement(
      doc,
      "linearGradient",
      {
        id: `${idPrefix}-light-${side}`,
        gradientUnits: "userSpaceOnUse",
        x1: repeatCentreX,
        y1: 0,
        x2: repeatEdgeX(side, 1),
        y2: 0,
      },
      [
        svgElement(doc, "stop", { class: "repeat-light-near", offset: 0 }),
        svgElement(doc, "stop", { class: "repeat-light-far", offset: 1 }),
      ],
    );
  const definitions = svgElement(doc, "defs", {}, [
    svgElement(
      doc,
      "pattern",
      {
        id: `${idPrefix}-doubt`,
        width: 9,
        height: 9,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(-45)",
      },
      [svgElement(doc, "path", { class: "repeat-doubt-line", d: "M0 0L0 9" })],
    ),
    gradient("left"),
    gradient("right"),
    ...([0, 1] as const).map((strip) => {
      const box = repeatStripBox(strip);
      return svgElement(
        doc,
        "clipPath",
        { id: `${idPrefix}-lane-${String(strip)}` },
        [
          svgElement(doc, "rect", {
            x: box.left,
            y: box.top,
            width: box.right - box.left,
            height: box.bottom - box.top,
            rx: laneRadius,
          }),
        ],
      );
    }),
  ]);
  const earLabel = (side: "left" | "right"): SVGElement => {
    const label = svgElement(doc, "text", {
      class: "repeat-ear-label",
      x: repeatWingCentreX(side),
      y: repeatEarLabelY,
      "text-anchor": "middle",
    });
    label.textContent = options.earLabels[side];
    return label;
  };
  const crossing = sides.map((earpiece) => {
    const [from, to] = repeatCrossingLine(earpiece);
    return svgElement(doc, "g", { "data-earpiece": earpiece }, [
      svgElement(doc, "path", {
        class: "repeat-crossing",
        d: pen.line(from, to),
      }),
      svgElement(doc, "circle", {
        class: "repeat-crossing-end",
        cx: from[0],
        cy: from[1],
        r: 2.2,
      }),
      svgElement(doc, "circle", {
        class: "repeat-crossing-end",
        cx: to[0],
        cy: to[1],
        r: 2.2,
      }),
    ]);
  });
  return svgElement(
    doc,
    "svg",
    {
      class: "repeat-drawing",
      viewBox: `0 0 ${repeatViewBox.width} ${repeatViewBox.height}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
      "data-outcome": comparison.outcome,
    },
    [
      definitions,
      earLabel("left"),
      earLabel("right"),
      drawRun(doc, pen, idPrefix, 0, comparison.runs[0]),
      ...crossing,
      drawRun(doc, pen, idPrefix, 1, comparison.runs[1]),
    ],
  );
}

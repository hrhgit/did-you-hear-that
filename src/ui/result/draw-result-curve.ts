import { curveGridLabel, resultCurveCopy } from "../../copy/result-curve-copy";
import type { GhostSoundId } from "../../config/sound-id";
import type { Ear } from "../../session/result-page-types";
import type { CurvePoint, ResultCurve } from "../../session/result-curve";
import yardUrl from "../room/art/yard.webp";
import { paintedCreature } from "./painted-images";
import { resultCurveViewBox } from "./result-curve-box";

const svgNs = "http://www.w3.org/2000/svg";

/** The scene's own units (`result-curve-box.ts`); the painted horizon is at 78% of its height. */
const { width, height } = resultCurveViewBox;
/** The sky the curves are drawn in: between the trees, above the hills. */
const sky = { left: 182, right: 472, top: 62, bottom: 260 } as const;
/** Where the creatures stand, and the pitch label at their feet. */
const groundY = 346;
const creatureWidth = 70;
const labelY = 372;
/** The two ears of one pitch stand a little apart, so neither mark hides the other. */
const earOffset: Record<Ear, number> = { left: -5, right: 5 };
const markSize = 4.6;
/** Marks for a level past either end sit just outside the sky's scale. */
const edgeGap = 8;
/** The key in the top right corner: where its first mark sits, and the step between rows. */
const keyLeft = 478;
const keyTop = 36;
const keyRowHeight = 21;
const chevron = 6;

type Attributes = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Attributes,
  children: readonly Node[] = [],
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(svgNs, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  element.append(...children);
  return element;
}

function text(
  doc: Document,
  className: string,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end",
  words: string,
): SVGTextElement {
  return svg(doc, "text", { class: className, x, y, "text-anchor": anchor }, [
    doc.createTextNode(words),
  ]);
}

/**
 * A point's mark: a round will-o'-wisp on the left, a square lantern on the right, so that neither
 * colour nor shape alone tells the ears apart (R1.5). Hollow when `hollow`.
 */
export function earMark(
  doc: Document,
  ear: Ear,
  x: number,
  y: number,
  hollow = false,
  size = markSize,
): SVGElement {
  const paint: Attributes = hollow
    ? { fill: "none", stroke: `var(--curve-${ear})`, "stroke-width": 1.4 }
    : {
        fill: `var(--curve-${ear})`,
        stroke: `var(--curve-${ear}-core)`,
        "stroke-width": 1,
      };
  return ear === "left"
    ? svg(doc, "circle", { cx: x, cy: y, r: size, ...paint })
    : svg(doc, "rect", {
        x: x - size * 0.9,
        y: y - size * 0.9,
        width: size * 1.8,
        height: size * 1.8,
        rx: 1.2,
        ...paint,
      });
}

/** The glow filter and the halo under each mark. Ids are the page's: there is one chart. */
function defs(doc: Document): SVGDefsElement {
  const halo = (ear: Ear): SVGRadialGradientElement =>
    svg(doc, "radialGradient", { id: `result-curve-halo-${ear}` }, [
      svg(doc, "stop", {
        offset: 0,
        "stop-color": `var(--curve-${ear})`,
        "stop-opacity": 0.55,
      }),
      svg(doc, "stop", {
        offset: 1,
        "stop-color": `var(--curve-${ear})`,
        "stop-opacity": 0,
      }),
    ]);
  return svg(doc, "defs", {}, [
    svg(
      doc,
      "filter",
      {
        id: "result-curve-glow",
        x: "-50%",
        y: "-50%",
        width: "200%",
        height: "200%",
      },
      [
        svg(doc, "feGaussianBlur", { stdDeviation: 2.4, result: "blur" }),
        svg(doc, "feMerge", {}, [
          svg(doc, "feMergeNode", { in: "blur" }),
          svg(doc, "feMergeNode", { in: "SourceGraphic" }),
        ]),
      ],
    ),
    halo("left"),
    halo("right"),
    svg(doc, "radialGradient", { id: "result-curve-shade" }, [
      svg(doc, "stop", {
        offset: 0.55,
        "stop-color": "#06021a",
        "stop-opacity": 0.5,
      }),
      svg(doc, "stop", {
        offset: 1,
        "stop-color": "#06021a",
        "stop-opacity": 0,
      }),
    ]),
    svg(doc, "radialGradient", { id: "result-curve-pool" }, [
      svg(doc, "stop", {
        offset: 0,
        "stop-color": "#ffd9a0",
        "stop-opacity": 0.32,
      }),
      svg(doc, "stop", {
        offset: 1,
        "stop-color": "#ffd9a0",
        "stop-opacity": 0,
      }),
    ]),
  ]);
}

/** Names a mark by its class, pitch and ear, so the page and its tests can find it. */
function marked(
  element: SVGElement,
  className: string,
  roomId: GhostSoundId,
  ear: Ear,
): SVGElement {
  element.classList.add(className);
  element.setAttribute("data-room", roomId);
  element.setAttribute("data-side", ear);
  return element;
}

/** What the page adds to the drawing. */
export interface CurveDrawingOptions {
  /** The columns the result focus picks out, and why: each gets a moonbeam. */
  readonly standingOut?: ReadonlyMap<GhostSoundId, string>;
}

/**
 * The yard chart (result-curve design.md "Redesign, 2026-11-25"): the painted night of the room,
 * with the pitches across the sky from the lowest, each named by its creature standing on the
 * ground below, and the two ears' levels as lights in the sky. The deeper a light sinks towards
 * the ground, the quieter the sound that was caught. The earlier visit is drawn first and faint;
 * each line breaks where its ear was not found.
 */
export function drawResultCurve(
  doc: Document,
  curve: ResultCurve,
  options: CurveDrawingOptions = {},
): SVGSVGElement {
  const columnWidth = (sky.right - sky.left) / curve.columns.length;
  const centreOf = (index: number): number =>
    sky.left + (index + 0.5) * columnWidth;
  const xOf = (index: number, ear: Ear): number =>
    centreOf(index) + earOffset[ear];
  const yOf = (levelDb: number): number =>
    sky.top +
    ((curve.topDb - levelDb) / (curve.topDb - curve.bottomDb)) *
      (sky.bottom - sky.top);

  const backdrop = svg(doc, "image", {
    x: 0,
    y: 0,
    width,
    height,
    preserveAspectRatio: "xMidYMid slice",
  });
  backdrop.setAttribute("href", yardUrl);
  // A little more night behind the chart, so its lights read against the sky.
  const shade = svg(doc, "ellipse", {
    cx: (sky.left + sky.right) / 2,
    cy: (sky.top + sky.bottom) / 2,
    rx: (sky.right - sky.left) * 0.72,
    ry: (sky.bottom - sky.top) * 0.75,
    fill: "url(#result-curve-shade)",
  });

  const grid = curve.gridDb.flatMap((levelDb) => [
    svg(doc, "line", {
      class: "result-curve-grid",
      x1: sky.left - 6,
      x2: sky.right,
      y1: yOf(levelDb),
      y2: yOf(levelDb),
    }),
    text(
      doc,
      "result-curve-tick",
      sky.left - 10,
      yOf(levelDb) + 6,
      "end",
      curveGridLabel(levelDb),
    ),
  ]);
  const axisTitle = text(
    doc,
    "result-curve-axis-title",
    sky.left - 26,
    sky.top - 24,
    "start",
    resultCurveCopy.axisTitle,
  );

  // The key, stacked in the top right corner beside the sky, so that a saved image carries it.
  const keyItems: [Ear, boolean, string][] = [
    ["left", false, resultCurveCopy.leftLegend],
    ["right", false, resultCurveCopy.rightLegend],
    ...(curve.hasEarlier
      ? [
          ["left", true, resultCurveCopy.earlierLegend] as [
            Ear,
            boolean,
            string,
          ],
        ]
      : []),
  ];
  const key = svg(
    doc,
    "g",
    { class: "result-curve-key" },
    keyItems.flatMap(([ear, hollow, label], index) => {
      const y = keyTop + index * keyRowHeight;
      return [
        earMark(doc, ear, keyLeft, y, hollow, hollow ? 3.4 : markSize),
        text(
          doc,
          "result-curve-key-label",
          keyLeft + 11,
          y + 5,
          "start",
          label,
        ),
      ];
    }),
  );

  /** One polyline per run of neighbouring columns where `levelOf` has a value. */
  const runs = (
    ear: Ear,
    levelOf: (point: CurvePoint) => number | null,
    className: string,
  ): SVGElement[] => {
    const lines: SVGElement[] = [];
    let run: string[] = [];
    const close = (): void => {
      if (run.length > 1) {
        lines.push(
          svg(doc, "polyline", {
            class: `${className} result-curve-line-${ear}`,
            points: run.join(" "),
          }),
        );
      }
      run = [];
    };
    curve.columns.forEach((column, index) => {
      const levelDb = levelOf(column[ear]);
      if (levelDb === null) {
        close();
      } else {
        run.push(`${xOf(index, ear)},${yOf(levelDb)}`);
      }
    });
    close();
    return lines;
  };

  const ears: readonly Ear[] = ["left", "right"];
  const earlier = svg(
    doc,
    "g",
    { class: "result-curve-earlier" },
    ears.flatMap((ear) => [
      ...runs(ear, (point) => point.earlierDb, "result-curve-earlier-line"),
      ...curve.columns.flatMap((column, index) => {
        const levelDb = column[ear].earlierDb;
        return levelDb === null
          ? []
          : [
              marked(
                earMark(doc, ear, xOf(index, ear), yOf(levelDb), true, 3.4),
                "result-curve-earlier-point",
                column.roomId,
                ear,
              ),
            ];
      }),
    ]),
  );

  const pointMarks = (index: number, ear: Ear): SVGElement[] => {
    const column = curve.columns[index];
    const point = column?.[ear];
    if (column === undefined || point === undefined) {
      return [];
    }
    const pointOf = (element: SVGElement): SVGElement => {
      marked(element, "result-curve-point", column.roomId, ear);
      element.setAttribute("data-mark", point.mark);
      return element;
    };
    const x = xOf(index, ear);
    if (point.levelDb !== null) {
      const y = yOf(point.levelDb);
      const glow =
        point.lowDb === null || point.highDb === null
          ? []
          : [
              svg(doc, "rect", {
                class: `result-curve-range result-curve-range-${ear}`,
                x: x - 4,
                y: yOf(point.highDb) - 2,
                width: 8,
                height: yOf(point.lowDb) - yOf(point.highDb) + 4,
                rx: 4,
              }),
            ];
      return [
        ...glow,
        svg(doc, "circle", {
          cx: x,
          cy: y,
          r: markSize * 3,
          fill: `url(#result-curve-halo-${ear})`,
        }),
        pointOf(earMark(doc, ear, x, y)),
      ];
    }
    // Not found: a chevron past the end it is past, or hollow at the top when unreliable (R1.3).
    if (point.mark === "betterThanFloor" || point.mark === "worseThanCap") {
      const down = point.mark === "betterThanFloor";
      const tip = down
        ? sky.bottom + edgeGap + chevron
        : sky.top - edgeGap - chevron;
      const base = down ? tip - chevron : tip + chevron;
      return [
        pointOf(
          svg(doc, "path", {
            class: `result-curve-edge result-curve-line-${ear}`,
            d: `M${x - chevron * 0.8},${base} L${x},${tip} L${x + chevron * 0.8},${base}`,
          }),
        ),
      ];
    }
    return [
      svg(doc, "g", { class: "result-curve-unsure" }, [
        pointOf(earMark(doc, ear, x, sky.top - edgeGap - markSize, true)),
      ]),
    ];
  };

  const now = svg(doc, "g", { class: "result-curve-now" }, [
    ...ears.flatMap((ear) =>
      runs(ear, (point) => point.levelDb, "result-curve-now-line"),
    ),
    ...ears.flatMap((ear) =>
      curve.columns.flatMap((_, index) => pointMarks(index, ear)),
    ),
  ]);

  const ground = curve.columns.map((column, index) => {
    const x = centreOf(index);
    const creature = paintedCreature(doc, column.roomId);
    const placed: SVGElement[] = [];
    if (creature !== null) {
      const w = creatureWidth;
      const h = w * creature.aspect;
      const image = svg(doc, "image", {
        x: x - w * creature.anchorX,
        y: groundY - h * creature.anchorY,
        width: w,
        height: h,
        preserveAspectRatio: "none",
      });
      image.setAttribute("href", creature.href);
      placed.push(
        // A pool of light on the grass, so each creature stands out of the night.
        svg(doc, "ellipse", {
          cx: x,
          cy: groundY - 4,
          rx: columnWidth * 0.5,
          ry: 16,
          fill: "url(#result-curve-pool)",
        }),
        svg(doc, "ellipse", {
          class: "result-curve-shadow",
          cx: x,
          cy: groundY,
          rx: w * 0.26,
          ry: 3,
        }),
        image,
      );
    } else {
      placed.push(
        svg(doc, "circle", {
          class: "result-curve-creature",
          "data-creature": column.roomId,
          cx: x,
          cy: groundY - 12,
          r: 6,
        }),
      );
    }
    const standing = options.standingOut?.get(column.roomId);
    const group = svg(doc, "g", {
      class: "result-curve-column",
      "data-room": column.roomId,
      "data-creature": column.roomId,
      ...(standing === undefined ? {} : { "data-standing": standing }),
    });
    group.append(
      // A moonbeam down the column, shown when the column is picked out.
      svg(doc, "rect", {
        class: "result-curve-beam",
        x: x - columnWidth / 2 + 3,
        y: sky.top - 34,
        width: columnWidth - 6,
        height: labelY - sky.top + 40,
        rx: 10,
      }),
      // A faint thread from the creature up through its column of sky.
      svg(doc, "line", {
        class: "result-curve-thread",
        "data-creature": column.roomId,
        x1: x,
        x2: x,
        y1: sky.top,
        y2: groundY - 58,
      }),
      ...placed,
      text(doc, "result-curve-pitch", x, labelY, "middle", column.pitchLabel),
    );
    return group;
  });

  return svg(
    doc,
    "svg",
    {
      class: "result-curve-svg",
      viewBox: `0 0 ${width} ${height}`,
      "aria-hidden": "true",
      focusable: "false",
    },
    [
      defs(doc),
      backdrop,
      shade,
      ...grid,
      axisTitle,
      key,
      ...ground,
      earlier,
      now,
    ],
  );
}

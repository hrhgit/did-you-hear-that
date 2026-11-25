import type { GhostSoundId } from "../../config/sound-id";
import { svgElement, type SvgAttributes } from "../house/svg-element";

/**
 * The creatures as SVG, for the pictures of the result, which are saved as one SVG image. The
 * room and its cards paint them on canvases instead (creature-art.ts, the rhythm game).
 *
 * How a creature is drawn. `awake`: as it stands in the room. `asleep`: once it has gone home,
 * with its eyes shut. `outline`: the dashed shape of one that went by.
 */
export type CreatureMood = "awake" | "asleep" | "outline";

/** One shape of a drawing: its tag, its class and its attributes. */
type Shape = readonly [
  tag: string,
  className: string,
  attributes: SvgAttributes,
];

/** A few shapes that move together, such as a wing. `part` becomes the class `creature-part-…`. */
interface PartGroup {
  readonly part: string;
  readonly shapes: readonly Shape[];
}

type Piece = Shape | PartGroup;

const path = (className: string, d: string): Shape => [
  "path",
  className,
  { d },
];
const ellipse = (
  className: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): Shape => ["ellipse", className, { cx, cy, rx, ry }];
const circle = (
  className: string,
  cx: number,
  cy: number,
  r: number,
): Shape => ["circle", className, { cx, cy, r }];
const rect = (
  className: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
): Shape => ["rect", className, { x, y, width, height, rx }];

/**
 * A pair of eyes: the open eye with its light, and the line of the shut eye, which is shown only
 * when the creature sleeps. `rx` and `ry` are the half width and half height of an open eye.
 */
function eyes(
  leftX: number,
  rightX: number,
  y: number,
  rx: number,
  ry: number,
): Shape[] {
  return [leftX, rightX].flatMap((x): Shape[] => [
    ellipse("creature-eye", x, y, rx, ry),
    circle(
      "creature-shine",
      x + rx * 0.3,
      y - ry * 0.42,
      Math.max(1, rx * 0.3),
    ),
    path(
      "creature-shut",
      `M${String(x - rx - 0.5)} ${String(y + 1)} Q${String(x)} ${String(y + rx + 1.5)} ${String(x + rx + 0.5)} ${String(y + 1)}`,
    ),
  ]);
}

/**
 * The five creatures of the house, each drawn in a box of 120 by 120 with its feet near the
 * bottom. They are this project's own drawings: pale bodies, dark eyes, and one accent each in the
 * creature's own colour, which `room.css` sets.
 *
 * - `cellar`, Thump the knocker: a heavy round body with two big fists.
 * - `corridor`, Murmur the ghost: a rounded sheet with tall eyes and a hem of three lobes.
 * - `nursery`, Tink the tin toy: a tin box on two feet with a key in its side.
 * - `stairs`, Scritch the beetle: an oval shell, six legs and two feelers.
 * - `attic`, Squeak the bat: a small body between two spread wings.
 */
const drawings: Readonly<Record<GhostSoundId, readonly Piece[]>> = {
  cellar: [
    ellipse("creature-shade", 46, 104, 12, 6),
    ellipse("creature-shade", 74, 104, 12, 6),
    path(
      "creature-skin",
      "M26 80 C24 50 38 30 60 30 C82 30 96 50 94 80 C93 96 80 102 60 102 C40 102 27 96 26 80 Z",
    ),
    path("creature-hue", "M38 90 Q60 99 82 90"),
    path("creature-ink creature-ink-heavy", "M40 54 Q60 46 80 54"),
    ...eyes(48, 72, 65, 4.5, 6),
    path("creature-ink", "M52 82 Q60 86 68 82"),
    {
      part: "fist-left",
      shapes: [
        circle("creature-skin", 20, 82, 13),
        path("creature-ink", "M12 78 Q20 73 28 78"),
        path("creature-ink", "M16 84 V89 M21 85 V90 M26 84 V89"),
      ],
    },
    {
      part: "fist-right",
      shapes: [
        circle("creature-skin", 100, 82, 13),
        path("creature-ink", "M92 78 Q100 73 108 78"),
        path("creature-ink", "M94 84 V89 M99 85 V90 M104 84 V89"),
      ],
    },
  ],
  corridor: [
    path(
      "creature-skin",
      "M30 62 Q17 64 19 77 Q26 77 31 72 Z M90 62 Q103 64 101 77 Q94 77 89 72 Z",
    ),
    path(
      "creature-skin",
      "M28 96 C26 60 28 22 60 20 C92 22 94 60 92 96 Q81.3 110 70.7 97 Q60 110 49.3 97 Q38.7 110 28 96 Z",
    ),
    ellipse("creature-hue creature-hue-soft", 39, 67, 4.5, 2.6),
    ellipse("creature-hue creature-hue-soft", 81, 67, 4.5, 2.6),
    ...eyes(49, 71, 52, 6, 10.5),
    ellipse("creature-eye creature-mouth", 60, 75, 4.2, 3.4),
  ],
  nursery: [
    {
      part: "key",
      shapes: [
        path("creature-limb", "M86 64 H97"),
        circle("creature-hue", 103, 57, 6.5),
        circle("creature-hue", 103, 71, 6.5),
      ],
    },
    rect("creature-shade", 41, 92, 13, 11, 3),
    rect("creature-shade", 66, 92, 13, 11, 3),
    path("creature-limb", "M60 36 V25"),
    circle("creature-hue creature-hue-fill", 60, 21, 3.6),
    path("creature-limb", "M34 64 L23 72"),
    circle("creature-skin", 21, 74, 4.2),
    rect("creature-skin", 34, 36, 52, 58, 13),
    ...eyes(50, 70, 58, 6.5, 6.5),
    path(
      "creature-ink",
      "M48 76 H72 M52 76 V82 M58 76 V84 M64 76 V83 M70 76 V81",
    ),
    circle("creature-rivet", 40.5, 42.5, 1.3),
    circle("creature-rivet", 79.5, 42.5, 1.3),
    circle("creature-rivet", 40.5, 87.5, 1.3),
    circle("creature-rivet", 79.5, 87.5, 1.3),
  ],
  stairs: [
    {
      part: "legs",
      shapes: [
        path(
          "creature-limb",
          "M34 54 L17 45 L12 50 M30 70 L12 70 L8 76 M35 86 L20 96 L17 103",
        ),
        path(
          "creature-limb",
          "M86 54 L103 45 L108 50 M90 70 L108 70 L112 76 M85 86 L100 96 L103 103",
        ),
      ],
    },
    {
      part: "feelers",
      shapes: [
        path("creature-limb", "M53 26 Q46 10 35 12 M67 26 Q74 10 85 12"),
      ],
    },
    ellipse("creature-skin", 60, 34, 15, 12),
    ellipse("creature-skin", 60, 68, 29, 33),
    path("creature-ink", "M60 37 V101 M34 52 Q60 40 86 52"),
    circle("creature-hue creature-hue-fill", 47, 66, 4),
    circle("creature-hue creature-hue-fill", 73, 66, 4),
    circle("creature-hue creature-hue-fill", 50, 84, 3),
    circle("creature-hue creature-hue-fill", 70, 84, 3),
    ...eyes(54, 66, 32, 3.2, 4.2),
  ],
  attic: [
    {
      part: "wing-left",
      shapes: [
        path(
          "creature-shade",
          "M46 62 C36 44 20 42 8 52 C14 55 17 61 15 70 C21 66 27 68 30 76 C35 70 41 72 45 79 Z",
        ),
      ],
    },
    {
      part: "wing-right",
      shapes: [
        path(
          "creature-shade",
          "M74 62 C84 44 100 42 112 52 C106 55 103 61 105 70 C99 66 93 68 90 76 C85 70 79 72 75 79 Z",
        ),
      ],
    },
    path("creature-skin", "M47 50 L43 27 L58 43 Z M73 50 L77 27 L62 43 Z"),
    path(
      "creature-hue creature-hue-fill",
      "M48.5 45 L46.5 34 L54 42.5 Z M71.5 45 L73.5 34 L66 42.5 Z",
    ),
    path("creature-limb", "M54 87 V95 M66 87 V95"),
    ellipse("creature-skin", 60, 66, 18, 23),
    ...eyes(53, 67, 61, 4.2, 6.2),
    path("creature-ink", "M56 73 Q60 77 64 73"),
  ],
};

function isGroup(piece: Piece): piece is PartGroup {
  return !Array.isArray(piece);
}

/**
 * Draws a creature as one SVG. The drawing says nothing the words beside it do not say, so it is
 * hidden from anything that reads the page aloud. Its colours and its motion come from `room.css`,
 * by `data-creature` and `data-mood`.
 */
export function drawCreatureSvg(
  doc: Document,
  id: GhostSoundId,
  mood: CreatureMood = "awake",
): SVGElement {
  const shape = ([tag, className, attributes]: Shape): SVGElement =>
    svgElement(doc, tag, { class: className, ...attributes });
  return svgElement(
    doc,
    "svg",
    {
      class: "creature-art",
      viewBox: "0 0 120 120",
      "data-creature": id,
      "data-mood": mood,
      "aria-hidden": "true",
      focusable: "false",
    },
    drawings[id].map((piece) =>
      isGroup(piece)
        ? svgElement(
            doc,
            "g",
            { class: `creature-part creature-part-${piece.part}` },
            piece.shapes.map(shape),
          )
        : shape(piece),
    ),
  );
}
